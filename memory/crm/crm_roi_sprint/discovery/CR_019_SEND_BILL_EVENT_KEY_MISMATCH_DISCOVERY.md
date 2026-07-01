# CR-019 — `send_bill` Event-Key Mismatch (UI vs. trigger code)

**Sprint**: ROI Measurement / CRM
**Type**: Quick-fix CR (bug surfaced during live debugging 2026-06-05)
**Requested**: 2026-06-05 — owner: *"my whatsapp messaging are not getting delivered ... we need to fix in a way it works for all restaurants"*
**Lifecycle stage**: `discovery_complete_awaiting_plan_signoff`
**Access used**: read-only static analysis + remote DB read (no writes)
**Effort estimate**: ~½ day (3 backend + 1 frontend file + 1 one-off migration script)
**Test tenant**: Mygenie Dev (`pos_0001_restaurant_510`)

---

## 1. One-line problem statement

The frontend lets owners configure `send_bill_manual` and `send_bill_auto` as POS events, but the trigger code only ever looks up `event_key = "send_bill"` after a hard-coded collapse. New tenants follow the UI → configure dead keys → **every POS order silently skips the WhatsApp send**.

---

## 2. Why Kunafa works and Mygenie Dev doesn't (the core evidence)

```
Tenant                  send_bill row?   send_bill_manual    send_bill_auto    orders   send_bill msgs
─────────────────────── ──────────────── ──────────────────  ────────────────  ───────  ─────────────
Kunafa Mahal            ✅ tpl 25140      ✅ tpl 26508         ✅ tpl 26508       8322     16
Hungry Keya             ✅ tpl ??         —                    —                  1755     2
Mygenie Dev             ❌ MISSING        ❌ disabled, 36320   ✅ enabled, 36320  2030     0
Mayur's Kitchen         ❌ MISSING        —                    ✅ enabled, 26508  110      0
Jeh's Nest              ❌ MISSING        ✅ enabled, 26508    ✅ enabled, 26508  248      0
```

- **3 tenants are silently broken** (Mygenie Dev / Mayur's Kitchen / Jeh's Nest).
- Cumulative POS orders that should have sent a bill WhatsApp but didn't: **2,388**.
- **2 tenants work** — both happen to have a `send_bill` row (Kunafa's was hand-added during CR-015 live testing on 2026-05-28; Hungry Keya's origin unknown but same structural reason).

DB read script captured in §11 (Appendix).

---

## 3. Code evidence — where the collapse happens

### 3.1 Auto-trigger from POS order ingestion

`backend/routers/pos.py` (POS order webhook handler):

```python
# Line 1510-1520
# 8. Fire WhatsApp triggers
# send_bill trigger - for every order
asyncio.create_task(trigger_whatsapp_event(
    db, user["id"], "send_bill", updated_customer,       # ← hard-coded "send_bill"
    {**order_ctx,
     "idempotency_key": f"{order_data.order_id}_send_bill",
     "reference_type": "order",
     "reference_id": order_id}))
```

### 3.2 POS-events endpoint collapse

`backend/routers/pos.py` (manual/auto via `/api/pos/events`):

```python
# Line 2130-2140
# 3. Map event_type to internal event key FIRST
# send_bill_manual and send_bill_auto both use "send_bill" internally
internal_event = event_data.event_type
if event_data.event_type in ["send_bill_manual", "send_bill_auto"]:
    internal_event = "send_bill"                          # ← collapse

# 4. CHECK IF EVENT TRIGGER IS ACTIVE (early exit if paused)
event_config = await db.whatsapp_event_template_map.find_one(
    {"user_id": user["id"], "event_key": internal_event}, # ← reads "send_bill" only
    {"_id": 0}
)
```

### 3.3 Trigger config lookup (the function that returns None)

`backend/core/whatsapp.py:504-551` (`get_event_template_config`)
Looks up `whatsapp_event_template_map` by `(user_id, event_key)`. Returns `None` if not found. Caller logs `logger.debug` and silently skips — **no row is written to `whatsapp_message_logs`**, so the failure is invisible on the Messages dashboard.

### 3.4 UI exposes 3 names for the same thing

`backend/models/schemas.py:1170-1206`:

```python
POS_EVENTS = [
    ...
    "send_bill_manual",        # Send Bill - Manual   ← owners configure this
    "send_bill_auto",          # Send Bill - Auto     ← owners configure this
]
CRM_EVENTS = [
    ...
    "send_bill",               # Bill sent to customer (every order)  ← code reads this
    ...
]
```

`frontend/src/components/shared/WhatsAppAutomationContent.jsx`:
- `posEventLabels` (line 328-340) lists `send_bill_manual`, `send_bill_auto`
- `crmEventLabels` (line 343-360) lists `send_bill`
- Frontend renders **three separate cards** for what backend treats as one event.

`backend/routers/whatsapp.py:53-89` (`/automation/events` endpoint) returns the same three names in `pos_event_descriptions` + `crm_event_descriptions`.

---

## 4. Why "enable `send_bill_auto`" doesn't help

The owner attempted this fix during live debugging (2026-06-05). Result: still silently skips. Confirmed in code path §3.1 — `pos.py:1511` hard-codes `"send_bill"`. Nothing reads `send_bill_auto`.

---

## 5. Why `send_bill` exists in CRM_EVENTS

`send_bill` was added to `CRM_EVENTS` as the **internal collapsed alias**, separately from the two POS-side names. It's not a CRM event semantically — POS triggers it. This is the original design mistake: instead of picking one canonical name, all three coexist and the code privileges one of them invisibly.

---

## 6. Blast radius (DB-verified, 2026-06-05)

| Slice | Count |
|---|---|
| Tenants with `send_bill` row (works) | **2** (Kunafa, Hungry Keya) |
| Tenants with `send_bill_manual`/`auto` rows but **no** `send_bill` row (broken) | **3** (Mygenie Dev, Mayur's Kitchen, Jeh's Nest) |
| POS orders on broken tenants in current data | **2,388** |
| Resulting unsent `send_bill` WhatsApps | **2,388** (lower bound — some orders may have had no customer_phone) |
| `whatsapp_message_logs` rows for broken tenants with `event_type="send_bill"` | **0** |

---

## 7. Required outcome

**For all current and future tenants**:
1. Owner configures "Send Bill" in the UI exactly **once**, on **one** clearly-labeled card.
2. Backend trigger fires that one mapping on every POS order.
3. No dead duplicate event names. No collapse logic that depends on hidden DB rows.
4. Broken tenants are auto-fixed in place — owners shouldn't have to reconfigure.

---

## 8. Solution approach (locked from earlier suggestion → Option 1)

> Verbatim from owner reply 2026-06-05: *"sound fine for option 1"*

1. **Canonical event key**: `send_bill` (single name, no aliases).
2. **Schema**: remove `send_bill_manual` + `send_bill_auto` from `POS_EVENTS`. Move `send_bill` from `CRM_EVENTS` into `POS_EVENTS` (semantically correct — POS is the trigger).
3. **POS-events endpoint**: drop the manual/auto → send_bill collapse (those keys no longer valid input). If old POS clients still send them, return a 400 with a clear "renamed to `send_bill`" message. *Deprecation grace alternative discussed in §10.*
4. **Frontend**: same shuffle in `posEventLabels` / `crmEventLabels` / `posEventDescriptions` / `crmEventDescriptions`. Single "Send Bill" card in POS tab.
5. **Migration**: one-off script — for every user with `send_bill_manual` or `send_bill_auto` rows but no `send_bill` row → upsert `send_bill` row using template_id from the most-recently-updated of the two (prefer the enabled one). Delete the now-dead `send_bill_manual` / `send_bill_auto` rows after upsert succeeds.
6. **Loud-log skip** (cheap observability win, included): when `get_event_template_config` returns `None`, raise log level from `DEBUG` to `INFO` so future config-missing situations are visible in `tail -f` without a code change.

Not in scope:
- Distinct templates for manual vs. auto bills (would be Option 3 / a future CR).
- Cleaning up the AuthKey webhook → pod URL pointing issue (separate problem — `status=pending` stuck rows).
- Onboarding seed for new tenants (separate; should be its own small CR).

---

## 9. Owner questions

| # | Question | Default if no answer |
|---|---|---|
| Q1 | **Delete legacy rows** after migration? Or leave them dormant (they won't be read, but they clutter the DB). | **Delete** (cleaner; reversible via git+DB backup) |
| Q2 | **POS clients still posting `send_bill_manual`/`send_bill_auto` to `/api/pos/events`** after this lands — return 400, or silently rewrite to `send_bill`? | **Silent rewrite + log a deprecation warning** for 1 release, then remove. Avoids breaking POS integrations that haven't been redeployed. |
| Q3 | Run migration in **dry-run** mode first (print what it would do, no writes) before doing real writes? | **Yes, mandatory** — output reviewed by owner before second pass writes. |

---

## 10. Risks & rollback

| Risk | Likelihood | Mitigation |
|---|---|---|
| Migration mis-upserts and overwrites a working `send_bill` row | Low | Script's MATCH clause: `event_key="send_bill" AND user_id=X` — upsert. Existing rows are `$set` with same data, no destructive replace. Dry-run first. |
| Frontend ships before backend → owner sees one card but DB lookup still uses `send_bill_manual` | None | Same-CR rollout, both files in the same commit. |
| Old POS client still posts `send_bill_auto` | Medium (vendor-controlled) | Q2 mitigation: silent rewrite for one release, deprecation log. |
| Loud-log change spams INFO at runtime | Negligible | Logged only on the silent-skip code path; expected rarity is <1/min in normal operation. |

**Rollback**: revert the commit; the migration's deleted legacy rows can be restored from Mongo backup if anyone complains — but Kunafa-style functioning tenants are unaffected (no rows touched for them).

---

## 11. Appendix — DB queries used in this discovery (read-only)

```python
# Count of mapping rows by event_key
pipe = [{"$group": {"_id": "$event_key", "n": {"$sum": 1},
                    "users": {"$addToSet": "$user_id"}}},
        {"$sort": {"_id": 1}}]
db.whatsapp_event_template_map.aggregate(pipe)

# Affected tenants: have send_bill_manual/auto but no send_bill
pos_users  = db.whatsapp_event_template_map.distinct(
                "user_id", {"event_key": {"$in":
                    ["send_bill_manual", "send_bill_auto"]}})
bill_users = db.whatsapp_event_template_map.distinct(
                "user_id", {"event_key": "send_bill"})
affected   = [u for u in pos_users if u not in bill_users]

# Per-tenant: orders vs. send_bill message rows
db.orders.count_documents({"user_id": uid})
db.whatsapp_message_logs.count_documents(
    {"user_id": uid, "event_type": "send_bill"})
```

Captured raw output (2026-06-05 03:30 UTC) lives in this conversation log — sample:
- `pos_0001_restaurant_510 'Mygenie Dev' orders=2030 send_bill_msgs=0`
- `pos_0001_restaurant_689 'Kunafa Mahal' orders=8322 send_bill_msgs=16`

---

## 12. Resume signal

If a future agent picks this up: status is `discovery_complete_awaiting_plan_signoff`. The planning doc (`../planning/CR_019_SEND_BILL_EVENT_KEY_MISMATCH_PLAN.md`) is the next read. No code has been written yet.
