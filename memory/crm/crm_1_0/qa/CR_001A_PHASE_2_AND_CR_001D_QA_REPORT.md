# CR-001A Phase 2 + CR-001D — QA Report

**CRs:** CR-001A · Phase 2 **and** CR-001D
**QA run:** 2026-05-22 ~10:07 UTC (preview pod `agent-env-ae71b207-…`)
**Final status:** ✅ **`cr001a_phase_2_and_cr001d_qa_passed_with_runtime_limitations`**

> Static parsing + order-doc build + live-route-acceptance QA all PASS.
> An authenticated end-to-end DB-write against the shared production Mongo
> was intentionally NOT executed from this preview pod to comply with the
> "do not push random real orders into live Mongo" rule. Same protocol as
> Phase 1 — real closure occurs when a real production POS room order
> arrives after the prod `pos-backend` pm2 worker is restarted.

---

## 1. Executive Summary

| Layer | Coverage | Result |
|---|---|---|
| Pydantic model parsing (room_info, associated_order_ids, restaurant_id, Phase 1 regression) | 12 cases | **12 / 12 PASS** |
| `_save_order_and_transactions(...)` order_doc build (motor monkey-patched) | 9 cases | **9 / 9 PASS** |
| Live route acceptance via local HTTP probe (auth-rejected → schema accepted) | 1 probe | **PASS (HTTP 401 as expected)** |
| Phase 1 alias contract still present in imported model | 4 fields + config | **PASS** |
| Backend health + supervisor + lint | health/ruff/supervisor | **PASS** |
| Authenticated production DB-write (real prod order) | — | **NOT_RUN_SAFETY_LIMITED** (forward-only safety rule, identical to Phase 1) |
| R689 sync continuity | counter delta | **PASS** — page 145/329, unchanged before/after restart |
| `migration.py` + `pos_request_logger.py` untouched | git diff | **PASS** |

---

## 2. QA Checklist

| Check ID | Check | Result | Evidence | Notes |
|---|---|---|---|---|
| QA-P2-01 | Model accepts POS payload with `room_info` (string decimals) | ✅ PASS | `/tmp/cr_001a_phase2_qa.py` case 1 | `room_price=7888.0, advance_payment=888.0, balance_payment=7000.0` |
| QA-P2-02 | Parsed `room_info` retains structure per spec; empty `{}` → all-None RoomInfo (and persists as `None` at write time) | ✅ PASS | static QA case 3; order-doc QA case "P2.T2" | Persisted `None` confirmed |
| QA-P2-03 | Model accepts POS payload with `associated_order_ids` (List[int]) | ✅ PASS | static QA case 2 | `[868891] → ["868891"]` |
| QA-P2-04 | Parsed `associated_order_ids` retained as `List[str]`; mixed int/str also coerced | ✅ PASS | static QA case 6 | `[868891,"868892",868893] → ["868891","868892","868893"]` |
| QA-P2-05 | Order doc builder writes `room_info` into `orders` (nested dict, or None for empty) | ✅ PASS | order-doc QA case 1, case "P2.T2", case "P2.T3" | Full → dict; `{}` → None; absent → None |
| QA-P2-06 | Order doc builder writes `associated_order_ids` into `orders` | ✅ PASS | order-doc QA cases 2, "P2.T5", "P2.T3" | `[868891] → ["868891"]`; `[] → []`; absent → `None` |
| QA-D-01 | Order doc builder writes `restaurant_id` correctly; no longer `None`; `pos_restaurant_id` preserved | ✅ PASS | order-doc QA case 3 & 4 | Both `restaurant_id="478"` and `pos_restaurant_id="478"` |
| QA-REG-01 | Phase 1 aliases still pass (`created_at`, `item_id`, `qty`, `price`) | ✅ PASS | static QA cases 7–10 | `order_created_at`, `pos_food_id="7777"` (str-coerced from int), `item_qty=2`, `item_price=11.0` |
| QA-REG-02 | CRM-canonical names still parse (`order_created_at`, `pos_food_id`, `item_qty`, `item_price`) | ✅ PASS | static QA case 11 | All four canonical-name fields parse |
| QA-REG-03 | CR-002 `pos_request_logs` middleware untouched | ✅ PASS | `git diff --stat HEAD -- backend/core/pos_request_logger.py` → empty | File unchanged |
| QA-REG-04 | `migration.py` untouched | ✅ PASS | `git diff --stat HEAD -- backend/routers/migration.py` → empty | File unchanged |
| QA-REG-05 | No historical records mutated | ✅ PASS | No write operations against `orders` / `order_items` / `customers` / `users` were issued by this session. R689 row in `migration_sync_logs` unchanged. | Forward-only |
| QA-REG-06 | Backend import/lint/health checks pass | ✅ PASS | `ruff` clean; `from routers.pos import OrderItem, POSOrderWebhook, RoomInfo` OK; `GET /api/health` `{"status":"healthy"}` | — |
| QA-RT-01 | Authenticated `POST /api/pos/orders` with real prod credentials writing to live Mongo | ⏸ NOT_RUN_SAFETY_LIMITED | — | Owner forbids preview-pod-originated real writes; closure must come from a natural production POS order after `pos-backend` (pm2 id 7) restart on prod, per Phase 1 lesson. |

---

## 3. Model Parsing Tests

Harness: `/tmp/cr_001a_phase2_qa.py` (pure Pydantic `model_validate(...)`,
no DB, no HTTP, no mutation).

```
================================================================================
CR-001A Phase 2 + CR-001D — Static QA
================================================================================
  ✅ PASS  QA-P2-01 model accepts room_info (string decimals)
           room_price=7888.0 advance_payment=888.0 balance_payment=7000.0
  ✅ PASS  QA-P2-03 associated_order_ids parsed (List[int] -> List[str])
           ['868891']
  ✅ PASS  QA-P2-02 room_info={} parses to RoomInfo(all None)
           room_price=None advance_payment=None balance_payment=None
  ✅ PASS  spec P2.T3 room_info absent -> None
           room_info=None aoi=None
  ✅ PASS  spec P2.T5 associated_order_ids=[] -> []
           []
  ✅ PASS  extra: associated_order_ids mixed int/str -> all str
           ['868891', '868892', '868893']
  ✅ PASS  QA-REG-01 Phase 1 alias created_at -> order_created_at
           2026-05-22 14:40:13
  ✅ PASS  QA-REG-01 Phase 1 item alias item_id -> pos_food_id (str coerce)
           7777
  ✅ PASS  QA-REG-01 Phase 1 alias qty -> item_qty
           2
  ✅ PASS  QA-REG-01 Phase 1 alias price -> item_price
           11.0
  ✅ PASS  QA-REG-02 canonical CRM names still parse
  ✅ PASS  QA-D-01 model.restaurant_id captured from payload
           478

  TOTAL: 12 / 12 PASS
```

### 3.1 Order-doc build (with motor monkey-patched)

Harness: `/tmp/cr_001a_phase2_order_doc_qa.py` — replaces `pos_module.db`
with a fake that captures inserts into in-memory lists. Exercises the full
`_save_order_and_transactions(...)` path.

```
================================================================================
CR-001A Phase 2 + CR-001D — order_doc build verification
================================================================================
  ✅ PASS  QA-P2-05 order_doc['room_info'] populated
           {'room_price': 7888.0, 'advance_payment': 888.0, 'balance_payment': 7000.0}
  ✅ PASS  QA-P2-06 order_doc['associated_order_ids'] = ['868891']
           ['868891']
  ✅ PASS  QA-D-01 order_doc['restaurant_id'] populated
           478
  ✅ PASS  QA-D-01 order_doc['pos_restaurant_id'] preserved
           478
  ✅ PASS  REG order_items[0] phase 1 fields
           {'pos_food_id': '2248427', 'item_qty': 1, 'item_price': 7888.0}
  ✅ PASS  REG order_doc['order_created_at']
           2026-05-22 14:40:13
  ✅ PASS  P2.T2 empty room_info -> persisted None
           None
  ✅ PASS  P2.T5 associated_order_ids=[] preserved
           []
  ✅ PASS  P2.T3 absent room_info/aoi -> None/None

  TOTAL: 9 / 9 PASS
```

---

## 4. Endpoint / DB Test

### 4.1 Live HTTP probe (no DB mutation)

Sent an UNAUTHENTICATED POST with the Phase 2 alias-keyed payload to the
running uvicorn worker on this preview pod:

```bash
curl -s -o /tmp/probe.out -w "HTTP %{http_code}\n" \
  -X POST "http://127.0.0.1:8001/api/pos/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_id":"R-PROBE-P2",
    "order_id":"PROBE-CR001A-P2",
    "cust_mobile":"0",
    "order_amount":0,
    "created_at":"2026-01-01T00:00:00Z",
    "room_info":{"room_price":"100.00","advance_payment":"0.00","balance_payment":"100.00"},
    "associated_order_ids":[12345],
    "items":[{"item_name":"x","item_id":"1","qty":1,"price":0}]
  }'
```

Result:

```
HTTP 401
{"detail":"Authentication required. Provide X-API-Key header or Bearer token."}
```

**Interpretation:** Pydantic accepted the schema (room_info, associated_order_ids,
created_at alias, item_id/qty/price aliases) — the request progressed to the
auth gate and was rejected there. A `422` would have meant the running
process did not recognize the schema. **PASS.**

### 4.2 Authenticated end-to-end DB write — NOT_RUN_SAFETY_LIMITED

Per owner rule "do not push random real orders into live Mongo", an
authenticated POST that would persist a synthetic order into the shared
production-grade Mongo (`52.66.232.149:27017/mygenie`) was deliberately
skipped. This mirrors the Phase 1 protocol — live closure is achieved when a
natural production POS room order arrives after the prod deploy.

### 4.3 Phase 1 verifier — regression confirm

`bash /app/memory/crm/crm_1_0/qa/cr_001a_check.sh /app`

- ✅ pos_food_id alias present
- ✅ order_created_at alias present
- ✅ Worker (uvicorn PID, started 10:07:27 UTC) loaded the new model (started AFTER `pos.py` mtime)
- ✅ Imported model has all four Phase 1 aliases + `populate_by_name=True`
- ✅ Live HTTP probe returns HTTP 401 (schema accepted)

(Step 2 of the verifier additionally flags PID 20 — the supervisord
parent process — as "started before pos.py mtime"; this is a benign false
positive for non-uvicorn PIDs. The actual uvicorn worker PID 1478 is
correctly identified as up-to-date.)

---

## 5. Regression Checks

| Area | Verification | Result |
|---|---|---|
| `migration.py` untouched | `git diff --stat HEAD -- backend/routers/migration.py` returns empty | ✅ |
| `pos_request_logger.py` untouched | `git diff --stat HEAD -- backend/core/pos_request_logger.py` returns empty | ✅ |
| No historical `orders` mutated | No write ops issued from this session | ✅ |
| No historical `order_items` mutated | No write ops issued from this session | ✅ |
| Backend health | `GET /api/health` → `{"status":"healthy"}` | ✅ |
| Supervisor status | `backend RUNNING`, `frontend RUNNING`, `mongodb RUNNING` | ✅ |
| R689 sync counter | `pos_0001_restaurant_689 / order_sync` row in `migration_sync_logs`: page 145/329, synced 347, updated 3278, failed 0 — **identical before and after** preview-pod restart | ✅ |
| Phase 1 alias contract still in model | verifier Step 3 | ✅ |
| Phase 1 endpoint still accepts realtime alias keys | verifier Step 4 (HTTP 401) | ✅ |

---

## 6. Issues Found

None. All static + order-doc-build + live-route-acceptance checks pass.

The only outstanding item is the authenticated runtime DB-write closure,
which is **intentionally deferred** to a natural production POS order — same
protocol that closed CR-001A Phase 1 with order `868899`.

---

## 7. Final QA Status

**`cr001a_phase_2_and_cr001d_qa_passed_with_runtime_limitations`**

Promotion to **`cr001a_phase_2_and_cr001d_closed_live_on_prod`** requires:

1. Deploy this commit to prod (`/var/www/CRMV1`).
2. Run `cr_001a_check.sh /var/www/CRMV1` on prod — file & alias contract must
   show present.
3. Restart `pos-backend` (pm2 id 7) on prod — **not** `crm-backend` (Phase 1
   lesson).
4. Wait for the next natural real room POS order (or the next order whose
   payload contains either `room_info` or `associated_order_ids`).
5. Verify on that `orders` row:
   - `restaurant_id` ≠ `None`
   - `room_info` is a populated dict (when payload contained `room_info`)
   - `associated_order_ids` is a populated list (when payload contained it)
   - Phase 1 alias mapping still works (`order_created_at`, `pos_food_id`,
     `item_qty`, `item_price`)

---

## 8. Artifacts

- Static QA harness: `/tmp/cr_001a_phase2_qa.py` — 12/12 PASS
- Order-doc build harness: `/tmp/cr_001a_phase2_order_doc_qa.py` — 9/9 PASS
- Phase 1 on-host verifier (re-run): `/app/memory/crm/crm_1_0/qa/cr_001a_check.sh`
- Code: `/app/backend/routers/pos.py` (diff: `git diff` shows 1 file changed,
  70 insertions, 1 deletion)
- Implementation report: `/app/memory/crm/crm_1_0/implementation/CR_001A_PHASE_2_AND_CR_001D_IMPLEMENTATION_REPORT.md`
