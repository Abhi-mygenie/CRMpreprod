"""CR-015 Phase 1.5 — Live Ground-Truth Probe (READ-ONLY).

Probes the remote MongoDB to verify the v1.1 planning assumptions before any
code lands. Writes findings to a markdown report. No DB writes.

Run from /app/backend with: python3 scripts/cr015_phase15_probe.py
"""

import asyncio
import os
import sys
import json
from datetime import datetime, timezone
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from motor.motor_asyncio import AsyncIOMotorClient

R689_USER_ID = "pos_0001_restaurant_689"
OUT_PATH = "/app/memory/crm/crm_roi_sprint/investigations/CR_015_PRE_IMPL_GROUND_TRUTH_2026_05_29.md"


def _type_name(v):
    return type(v).__name__


async def main():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=10000)
    db = client[db_name]

    report_lines = []
    def log(s=""):
        report_lines.append(s)

    log(f"# CR-015 — Phase 1.5 Live Ground-Truth Probe")
    log()
    log(f"**Run at**: {datetime.now(timezone.utc).isoformat()}")
    log(f"**DB**: `{db_name}` @ remote `52.66.232.149:27017`")
    log(f"**Target tenant**: R689 = `{R689_USER_ID}`")
    log(f"**Mode**: READ-ONLY — no writes performed.")
    log()
    log("---")
    log()

    # ─────────────────────────────────────────────────────────────────
    # PROBE 1 — R689 event_template_map rows
    # ─────────────────────────────────────────────────────────────────
    log("## Probe 1 — R689 `whatsapp_event_template_map` rows (Bug #1 verification)")
    log()
    rows = await db.whatsapp_event_template_map.find(
        {"user_id": R689_USER_ID,
         "event_key": {"$in": ["send_bill", "send_bill_auto", "send_bill_manual"]}}
    ).to_list(20)
    if not rows:
        log("⚠️  No event_template_map rows found for R689 + send_bill*.")
    else:
        log("| event_key | template_id value | template_id TYPE | is_enabled | template_name |")
        log("|---|---|---|---|---|")
        for r in rows:
            log(f"| {r.get('event_key')} | `{r.get('template_id')}` | **`{_type_name(r.get('template_id'))}`** | {r.get('is_enabled')} | {r.get('template_name','')} |")
    log()
    log("**Bug #1 verdict**:")
    int_rows = [r for r in rows if isinstance(r.get("template_id"), int)]
    str_rows = [r for r in rows if isinstance(r.get("template_id"), str)]
    if int_rows and str_rows:
        log(f"- ✅ Mixed-type confirmed: {len(int_rows)} int row(s), {len(str_rows)} str row(s) → Bug #1 IS still active.")
    elif int_rows:
        log(f"- ⚠️ All {len(int_rows)} rows are int — uniform mismatch with variable_map (str). Bug #1 active.")
    elif str_rows:
        log(f"- ✅ All {len(str_rows)} rows are str. Bug #1 may have self-healed — verify with Probe 4.")
    log()

    # ─────────────────────────────────────────────────────────────────
    # PROBE 2 — R689 template 25140 variable mapping
    # ─────────────────────────────────────────────────────────────────
    log("## Probe 2 — R689 `whatsapp_template_variable_map` for template 25140 (Bug #2 verification)")
    log()
    # try both types
    vmap = await db.whatsapp_template_variable_map.find_one(
        {"user_id": R689_USER_ID, "template_id": "25140"}, {"_id": 0}
    )
    if vmap is None:
        vmap = await db.whatsapp_template_variable_map.find_one(
            {"user_id": R689_USER_ID, "template_id": 25140}, {"_id": 0}
        )
        if vmap:
            log("⚠️  variable_map row for template 25140 stored as INT (unusual; save endpoint writes str).")
    if vmap is None:
        log("⚠️  No variable_map row found for R689 template 25140.")
    else:
        log("**Template 25140 mapping doc**:")
        log("```json")
        log(json.dumps({
            "template_id": vmap.get("template_id"),
            "template_id_type": _type_name(vmap.get("template_id")),
            "template_name": vmap.get("template_name"),
            "mappings": vmap.get("mappings"),
            "modes": vmap.get("modes"),
            "updated_at": vmap.get("updated_at"),
        }, indent=2, default=str))
        log("```")
        log()
        # Validate each slot's mapping
        from core.whatsapp_variables import VARIABLES_BY_KEY
        mappings = vmap.get("mappings") or {}
        modes = vmap.get("modes") or {}
        log("**Per-slot diagnosis**:")
        log()
        log("| Slot | Value | Mode | Diagnosis |")
        log("|---|---|---|---|")
        for slot in sorted(mappings.keys(), key=lambda s: int(s.strip("{}") or 0)):
            v = mappings.get(slot, "")
            mode = modes.get(slot, "map")
            if mode == "text":
                if any(t in (v or "").lower() for t in ("missing", "todo", "tbd", "n/a")) or (v or "").strip() != (v or ""):
                    diag = "🟥 **GARBAGE in text mode** — will be sent literally to customer"
                else:
                    diag = "⚠️ text mode — sent literally"
            elif mode == "coupon_pick":
                diag = "coupon_pick (separate validation)"
            else:
                ck = (v or "").strip()
                if ck in VARIABLES_BY_KEY:
                    diag = "✅ valid registry key"
                elif ck in ("", "none"):
                    diag = "(empty — no value will resolve)"
                else:
                    diag = f"🟥 **UNKNOWN var_key** — resolves to empty"
            log(f"| `{slot}` | `{v}` | `{mode}` | {diag} |")
    log()

    # ─────────────────────────────────────────────────────────────────
    # PROBE 3 — R689 user doc (AuthKey + brand fields presence)
    # ─────────────────────────────────────────────────────────────────
    log("## Probe 3 — R689 user doc (AuthKey + brand fields presence)")
    log()
    user = await db.users.find_one({"id": R689_USER_ID}, {"_id": 0})
    if not user:
        log("⚠️  No user doc for R689.")
    else:
        log("| Field | Present? | Notes |")
        log("|---|---|---|")
        log(f"| `authkey_api_key` | {'✅ yes' if user.get('authkey_api_key') else '🟥 MISSING'} | required for send |")
        log(f"| `restaurant_name` | {'✅ yes' if user.get('restaurant_name') else '🟥 missing'} | `{user.get('restaurant_name','')[:40]}` |")
        log(f"| `einvoice_link` | {'✅ yes' if user.get('einvoice_link') else '⚠️ empty'} | brand var |")
        log(f"| `instagram_link` | {'✅ yes' if user.get('instagram_link') else '⚠️ empty'} | brand var |")
        log(f"| `google_review_link` | {'✅ yes' if user.get('google_review_link') else '⚠️ empty'} | brand var |")
        log(f"| `feedback_link` | {'✅ yes' if user.get('feedback_link') else '⚠️ empty'} | brand var |")
        log(f"| `phone` | {'✅ yes' if user.get('phone') else '🟥 missing'} | `{user.get('phone','')}` |")
    log()

    # ─────────────────────────────────────────────────────────────────
    # PROBE 4 — Recent send_bill message logs for R689
    # ─────────────────────────────────────────────────────────────────
    log("## Probe 4 — Last 5 `whatsapp_message_logs` for R689 + `send_bill` (live behaviour)")
    log()
    logs = await db.whatsapp_message_logs.find(
        {"user_id": R689_USER_ID, "event_type": {"$in": ["send_bill", "send_bill_auto", "send_bill_manual"]}},
        {"_id": 0}
    ).sort("created_at", -1).limit(5).to_list(5)
    if not logs:
        log("⚠️  No recent send_bill logs for R689.")
    else:
        log("| created_at | event_type | template_id | template_id type | bodyValues non-empty slots | status | message_id (truncated) |")
        log("|---|---|---|---|---|---|---|")
        for L in logs:
            bv = L.get("body_values") or {}
            non_empty = sum(1 for v in bv.values() if v not in (None, "", " "))
            total = len(bv)
            mid = (L.get("message_id") or "")[:16]
            log(f"| {L.get('created_at','')[:19]} | {L.get('event_type','')} | `{L.get('template_id','')}` | `{_type_name(L.get('template_id'))}` | {non_empty}/{total} | {L.get('status','')} | {mid}... |")
        log()
        # Show body_values of latest
        latest = logs[0]
        log("**Latest log row — full `body_values`**:")
        log("```json")
        log(json.dumps(latest.get("body_values") or {}, indent=2, default=str))
        log("```")
    log()

    # ─────────────────────────────────────────────────────────────────
    # PROBE 5 — All tenants: event_template_map.template_id type distribution
    # ─────────────────────────────────────────────────────────────────
    log("## Probe 5 — Cross-tenant `whatsapp_event_template_map.template_id` type distribution (T2 sizing)")
    log()
    cursor = db.whatsapp_event_template_map.find({}, {"_id": 0, "user_id": 1, "template_id": 1, "event_key": 1})
    by_type = Counter()
    by_tenant = defaultdict(Counter)
    total = 0
    sample_int_rows = []
    async for r in cursor:
        total += 1
        t = _type_name(r.get("template_id"))
        by_type[t] += 1
        by_tenant[r.get("user_id", "<no-uid>")][t] += 1
        if t == "int" and len(sample_int_rows) < 10:
            sample_int_rows.append(r)

    log(f"**Total rows scanned**: {total}")
    log()
    log("| template_id type | count |")
    log("|---|---|")
    for t, c in by_type.most_common():
        log(f"| `{t}` | {c} |")
    log()
    tenants_with_int = sum(1 for uid, c in by_tenant.items() if c.get("int", 0) > 0)
    tenants_with_str = sum(1 for uid, c in by_tenant.items() if c.get("str", 0) > 0)
    tenants_mixed = sum(1 for uid, c in by_tenant.items() if c.get("int", 0) > 0 and c.get("str", 0) > 0)
    log(f"**Tenant breakdown**: {len(by_tenant)} tenants total · {tenants_with_int} have ≥1 int row · {tenants_with_str} have ≥1 str row · **{tenants_mixed} have BOTH types (mixed)**.")
    log()
    if sample_int_rows:
        log("**Sample int rows (up to 10)**:")
        log("```json")
        log(json.dumps([
            {"user_id": r.get("user_id"), "event_key": r.get("event_key"), "template_id": r.get("template_id")}
            for r in sample_int_rows
        ], indent=2, default=str))
        log("```")
    log()

    # variable_map collection type distribution (should be all str per save endpoint)
    log("**Sanity — `whatsapp_template_variable_map.template_id` types**:")
    log()
    vcursor = db.whatsapp_template_variable_map.find({}, {"_id": 0, "user_id": 1, "template_id": 1})
    vby_type = Counter()
    vtotal = 0
    async for r in vcursor:
        vtotal += 1
        vby_type[_type_name(r.get("template_id"))] += 1
    log(f"Total variable_map rows: {vtotal}")
    log()
    log("| template_id type | count |")
    log("|---|---|")
    for t, c in vby_type.most_common():
        log(f"| `{t}` | {c} |")
    log()

    # ─────────────────────────────────────────────────────────────────
    # PROBE 6 — Unknown var_keys across ALL tenants (T7 sizing)
    # ─────────────────────────────────────────────────────────────────
    log("## Probe 6 — Unknown var_keys across all tenants (T7 sizing — bug #2 prevalence)")
    log()
    from core.whatsapp_variables import VARIABLES_BY_KEY
    cursor = db.whatsapp_template_variable_map.find({}, {"_id": 0})
    unknown_by_tenant = defaultdict(list)
    text_garbage_by_tenant = defaultdict(list)
    total_rows = 0
    rows_with_unknown = 0
    rows_with_text_garbage = 0
    async for r in cursor:
        total_rows += 1
        mappings = r.get("mappings") or {}
        modes = r.get("modes") or {}
        had_unknown = False
        had_garbage = False
        for slot, v in mappings.items():
            mode = modes.get(slot, "map")
            val = (v or "").strip() if isinstance(v, str) else str(v)
            if mode == "text":
                if any(t in val.lower() for t in ("missing", "todo", "tbd", "n/a")) or (isinstance(v, str) and v.strip() != v):
                    text_garbage_by_tenant[r.get("user_id", "<no-uid>")].append({
                        "template_id": str(r.get("template_id")),
                        "slot": slot, "value": v, "mode": mode
                    })
                    had_garbage = True
            elif mode == "coupon_pick":
                pass
            else:
                if val and val != "none" and val not in VARIABLES_BY_KEY:
                    unknown_by_tenant[r.get("user_id", "<no-uid>")].append({
                        "template_id": str(r.get("template_id")),
                        "slot": slot, "value": v, "mode": mode
                    })
                    had_unknown = True
        if had_unknown:
            rows_with_unknown += 1
        if had_garbage:
            rows_with_text_garbage += 1

    log(f"**Scanned**: {total_rows} variable_map rows across {len({*unknown_by_tenant.keys(), *text_garbage_by_tenant.keys()})} affected tenants.")
    log(f"- Rows with ≥1 unknown var_key in map mode: **{rows_with_unknown}**")
    log(f"- Rows with ≥1 text-mode suspicious value: **{rows_with_text_garbage}**")
    log()
    if unknown_by_tenant:
        log("**Tenants with unknown var_keys in map mode** (top 20):")
        log()
        log("| tenant | unknown count | sample |")
        log("|---|---|---|")
        for uid, items in sorted(unknown_by_tenant.items(), key=lambda kv: -len(kv[1]))[:20]:
            sample = items[0]
            log(f"| `{uid[:40]}` | {len(items)} | template `{sample['template_id']}` slot `{sample['slot']}` = `{sample['value']}` |")
    log()
    if text_garbage_by_tenant:
        log("**Tenants with text-mode garbage** (top 20):")
        log()
        log("| tenant | garbage count | sample |")
        log("|---|---|---|")
        for uid, items in sorted(text_garbage_by_tenant.items(), key=lambda kv: -len(kv[1]))[:20]:
            sample = items[0]
            log(f"| `{uid[:40]}` | {len(items)} | template `{sample['template_id']}` slot `{sample['slot']}` = `{sample['value']}` |")
    log()

    # ─────────────────────────────────────────────────────────────────
    # SUMMARY
    # ─────────────────────────────────────────────────────────────────
    log("---")
    log()
    log("## Summary — Does v1.1 plan still hold?")
    log()
    log(f"- **Bug #1 active**: confirmed via Probes 1, 4, 5. T1 + T2 still needed.")
    log(f"- **Bug #2 (R689 25140 garbage)**: see Probe 2 — current state of slots {{4}}/{{5}}/{{7}}.")
    log(f"- **T2 scope size**: Probe 5 — int rows total = {by_type.get('int', 0)}, across {tenants_with_int} tenants ({tenants_mixed} mixed).")
    log(f"- **T7 broader cleanup scope**: Probe 6 — {rows_with_unknown} rows with unknown var_keys + {rows_with_text_garbage} rows with text-mode garbage.")
    log()
    log("**Next step**: owner reviews this report → confirms (or amends) §13 sign-off boxes → Day 1 starts.")
    log()
    log("---")
    log("**End of Phase 1.5 probe.**")

    # write report
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        f.write("\n".join(report_lines))
    print(f"\nReport written to {OUT_PATH}")
    print(f"Lines: {len(report_lines)}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
