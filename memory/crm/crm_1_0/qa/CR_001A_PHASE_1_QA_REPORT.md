# CR-001A Phase 1 — QA Report (Final)

**CR:** CR-001A · Phase 1
**Title:** Forward-only realtime POS webhook alias fix (ISSUE-09)
**QA closed:** 2026-05-22 09:10:46 UTC
**Final status:** ✅ **`cr001a_phase_1_closed_live_on_prod`**

---

## 1. Verdict

PASS — end-to-end on **production** (`crm.mygenie.online`).

| Layer | Coverage | Result |
|---|---|---|
| Static / Pydantic model parsing (preview pod) | 12 cases | 12 / 12 PASS |
| Live route registration on preview pod | 1 case | HTTP 401 with realtime-alias payload (schema accepted) |
| **Dual-pod side-by-side end-to-end** (preview ✅ vs prod ❌ pre-restart) | 1 probe per pod | preview ✅ ALIAS-FIX ACTIVE · prod ❌ pre-fix (smoking gun proving deploy gap) |
| **Live production end-to-end** (real POS order via `crm.mygenie.online`) | 1 order, 7 checks | **7 / 7 PASS** on order `868899` |
| Migration path verification (re-confirmed not affected) | r478 order_sync 50/50 | All migrated rows have `order_created_at`, `pos_food_id`, `item_qty`, `item_price` populated |
| R689 sync untouched | progress preserved | Page 46→145 of 329, 3278 updates, 0 failures |

---

## 2. Static QA — Pydantic Model Parsing

Harness: `/tmp/cr_001a_qa.py` — pure Pydantic `model_validate(...)`, no DB,
no HTTP, no mutation.

| # | Case | Result |
|---|---|---|
| T1 | Pure POS realtime payload (`created_at`, `item_id`, `qty`, `price`) | ✅ |
| T2 | Legacy CRM payload (`order_created_at`, `pos_food_id`, `item_qty`, `item_price`) | ✅ |
| T3 | `item_id` sent as int (`7777`) — coerced to str `"7777"` | ✅ |
| T4 | Mixed: top-level `created_at` + item-level legacy names | ✅ |
| T5 | Item-level defaults preserved when `qty`/`price`/id absent | ✅ |

**TOTAL: 12 / 12 PASS**

---

## 3. Dual-Pod Side-by-Side Proof (Smoking Gun)

Same payload, same key, same shared MongoDB, sent within 1 s to both pods at
2026-05-22 06:43:20 UTC. Result before prod was restarted:

| Field | Preview pod (alias fix active) | Prod pod (pre-restart) |
|---|---|---|
| `order_created_at` | ✅ `"2026-05-22 12:00:00"` | ❌ `None` |
| `pos_food_id` × 2 | ✅ `"9001001"` / `"9001002"` | ❌ `None` |
| `item_qty` × 2 | ✅ `2` / `3` | ❌ `1` (default) |
| `item_price` × 2 | ✅ `11.0` / `33.0` | ❌ `0.0` (default) |

Verdict: **identical input → different output**. The only variable was the
running code in each pod's uvicorn workers. This isolated the remaining gap
strictly to "the prod pm2 worker had not been restarted to reload the new
`pos.py` module" — not a code, DB, payload, or auth issue.

The probe orders were cleaned up; only the `pos_request_logs` audit rows were
retained.

---

## 4. Production Restart Sequence (Process Reload Gap)

| Time (UTC) | Action on prod | Effect |
|---|---|---|
| ~06:43 | `git pull origin main` in `/var/www/CRMV1` | File on disk updated (verified by user screenshot showing `OrderItem` docstring + `populate_by_name=True`) |
| ~07:21–07:25 | `pm2 restart 2` (crm-backend) | No effect on `/api/pos/orders` persistence — wrong process |
| ~08:55+ | `pm2 restart` of the actual serving worker (likely `pos-backend` id 7) | Worker re-imported `pos.py`, new model loaded |
| **09:10:46** | Order `868899` arrives → **alias mapping live** | ✅ |

Lesson captured: in a multi-app pm2 setup, the service whose name matches the
endpoint family (`pos-backend` for `/api/pos/*`) is the one whose worker must
be restarted. Restarting an unrelated backend (`crm-backend`) does nothing for
this route.

---

## 5. Live Production Verification — Order `868899` (the room order)

- log id: in `pos_request_logs`, ts `2026-05-22T09:10:46Z`
- via host: `crm.mygenie.online` (production pod, confirmed)
- response: HTTP 200

**Payload** (alias-keyed, captured by CR-002):
```json
{
  "order_id": "868899",
  "restaurant_id": "478",
  "cust_name": "A Hishek Jain",
  "cust_mobile": "+917505242126",
  "order_amount": 7772,
  "created_at": "2026-05-22 14:40:13",
  "room_info": { "room_price": "7888.00", "advance_payment": "888.00", "balance_payment": "7000.00" },
  "associated_order_ids": [868891],
  "items": [
    { "item_id": "2248427", "item_name": "check in",       "qty": 1, "price": 7888 },
    { "item_id": "2248428", "item_name": "Tandoori Twist", "qty": 1, "price": 25 }
  ]
}
```

**Persisted in `orders`** (id `6dcf6f06-3435-49d0-9949-67087209f35a`):

| Field | Payload (alias key) | Persisted (canonical key) | OK |
|---|---|---|---|
| `order_created_at` ← `created_at` | `"2026-05-22 14:40:13"` | `"2026-05-22 14:40:13"` | ✅ |
| `items[0].pos_food_id` ← `item_id` | `"2248427"` | `"2248427"` | ✅ |
| `items[0].item_qty` ← `qty` | `1` | `1` | ✅ |
| `items[0].item_price` ← `price` | `7888` | `7888.0` | ✅ |
| `items[1].pos_food_id` ← `item_id` | `"2248428"` | `"2248428"` | ✅ |
| `items[1].item_qty` ← `qty` | `1` | `1` | ✅ |
| `items[1].item_price` ← `price` | `25` | `25.0` | ✅ |

**7 / 7 PASS** end-to-end on production.

---

## 6. Notes on Earlier Realtime Orders (Migration Overlap)

Orders `868898 / 868890 / 868894 / 868866 / etc.` arrived via realtime BEFORE
the prod worker was restarted, and therefore originally persisted with null
`order_created_at` and null `pos_food_id`. After the user ran prod
`Sync Orders` for restaurant 478 at 09:06, **migration overwrote those rows**
with the correct values pulled from MyGenie's `/orders` API.

This is migration's normal behaviour (`migration.py` does direct field
mapping, not Pydantic AliasChoices) and is NOT a CR-001A action. The rewrite
of `pos_food_id` to a different id space (`62159`, `202559`, etc. — MyGenie's
internal menu-item ids) versus the realtime `item_id` (line-item ids like
`2248426`) is by-source-design.

Order `868899` is the cleanest CR-001A live proof because migration has not
yet touched it (migration sync completed at 09:07:10, order arrived at
09:10:46), so the persisted `pos_food_id = "2248427"` is precisely the value
the realtime alias path mapped from `item_id`.

---

## 7. Migration Verification (cross-check, not in scope of CR-001A)

Triggered prod `Sync Orders` for restaurant 478 at 2026-05-22 09:06:07.
Result:

```
sync_type    : order_sync
status       : completed
total_records: 50
synced_count : 50
failed_count : 0
pages        : 2/2
duration     : ~63 s
```

All migrated orders persisted with `order_created_at`, `pos_food_id`,
`item_qty`, `item_price` populated correctly. `migration.py` does its own
direct field mapping; the AliasChoices change does not affect this path.

---

## 8. Regression Risk — Final Assessment

| Area | Risk | Notes |
|---|---|---|
| Legacy callers using canonical names | None | `populate_by_name=True` preserved |
| Migration sync (CR-001B) | None | `migration.py` untouched; just verified 50/50 success |
| POS request logger (CR-002) | None | Middleware untouched |
| Auth flow | None | `verify_pos_auth` untouched |
| WhatsApp / coupon / loyalty / wallet | None | Downstream code reads canonical fields, unchanged |
| R689 long sync | None | Untouched, progressed 46 → 145 / 329 during this work |

---

## 9. Closed Gaps

- ✅ **ISSUE-09 forward-fix** — closed live on prod
- ✅ **GAP-CR001A-RT1** (E2E authenticated DB-write test not run) — now closed
  by the natural arrival of `868899` and successful end-to-end verification

## 10. Remaining (Tracked Separately)

- ⚠️ Historical data residual under ISSUE-09 — remains OPEN by owner decision
  (forward-only). Migration may overwrite some rows opportunistically.
- ⚠️ **CR-001A Phase 2** — `room_info` and `associated_order_ids` still
  silently dropped. `868899` lost `room_price=7888` from the orders row.
- ⚠️ **CR-001D** (new) — `orders.restaurant_id` always persists as `None`
  despite payload sending it. Downstream-mapping miss in pos.py `order_doc`
  build.

---

## 11. Artifacts

- Static QA harness: `/tmp/cr_001a_qa.py`
- On-host verifier script: `/app/memory/crm/crm_1_0/qa/cr_001a_check.sh`
- Code: `/app/backend/routers/pos.py` (lines 1–4, 949–1016, 1019–1102)
- Live proof payload: `pos_request_logs` row for order `868899`
- Live proof persistence: `orders.id = 6dcf6f06-3435-49d0-9949-67087209f35a`
- Implementation report: `/app/memory/crm/crm_1_0/implementation/CR_001A_PHASE_1_IMPLEMENTATION_REPORT.md`

---

## 12. Final Status

**`cr001a_phase_1_closed_live_on_prod`**

Closed at 2026-05-22 09:10:46 UTC.
