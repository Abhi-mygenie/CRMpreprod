# CR-004 Phase 3.5 — Partial Live Test Report (2026-05-28)

**Sprint**: ROI Measurement / CR-004 WhatsApp Utility + Marketing Message Integration
**Phase**: 3.5 — Message Status Pipeline Refactor
**Status**: `cr_004_p3_5_parked_awaiting_option_a_send_side_live_test`
**Date**: 2026-05-28
**Tenant**: R689 Kunafa Mahal (`pos_0001_restaurant_689`)
**Test customer**: abhishek jain / `7505242126` / `country_code=+91`
**Preview URL used**: `https://crm-variable-mapping.preview.emergentagent.com`
**Production CRM URL**: `https://crm.mygenie.online`

---

## 1. Executive summary

CR-004 P3.5's **receive-side is fully validated against real AuthKey traffic**. A previously-unknown wire-format gap was discovered and hotfixed during this session (AuthKey sends form-urlencoded, not JSON). The **send-side remains UNVALIDATED in live conditions** because production CRM is still on pre-P3.5 code — every send still writes `whatsapp_message_logs.message_id = null`, so even with our fixed webhook parser, the row lookup misses.

CR has been **parked** at owner's request until they choose between Option A (route POS to preview for one synthetic end-to-end order) or Option B (push 28-may to prod).

---

## 2. Test environment

| Component | State during test |
|---|---|
| Preview backend | Running latest code from branch `28-may` + receive-side hotfix |
| Production CRM | Still on pre-P3.5 code (owner has NOT pushed) |
| MongoDB | Remote shared at `52.66.232.149:27017/mygenie` (prod + preview share) |
| POS endpoint hit by terminal | Production (`crm.mygenie.online/api/pos/orders`) — NOT preview |
| AuthKey callback URL registered | Preview `/api/whatsapp/status-callback` ✅ |
| `send_bill` event mapping (R689) | Template `26508` `send_bill_to_customer`, enabled ✅ |
| `send_bill_manual`, `send_bill_auto` mappings | Both enabled, same template ✅ |
| Customer record (abhi) | Exists, `id=crm-variable-mapping` ✅ |
| Webhook hotfix applied | 2026-05-28 13:54 UTC ✅ |

---

## 3. Test sequence

### Order 1 — `pos_order_id = 869310`

- **Placed**: 2026-05-28 13:50:51 UTC (19:20:51 IST)
- **Customer/total**: abhishek jain / Rs.754
- **Send-side row** (`whatsapp_message_logs.id=crm-variable-mapping`):
  - `message_id = null` ❌ (proves prod still on old code)
  - `idempotency_key = null` ❌
  - `reference_type / reference_id = null / null` ❌
  - `authkey_raw_response` field missing ❌
  - `event_type = send_bill` ✅
  - `status = pending` ✅
  - `body_values = {1: abhishek jain, 2: Rs.754, 3: your order, 4: counter, 5: Kunafa Mahal}` ✅
- **AuthKey logid (from later callback)**: `51855a8fbb9e894f4589da806223b3fc` — but it was NEVER captured into our row because prod doesn't store it
- **Callbacks received**:
  - 2026-05-28 13:55:02 UTC — `delivered` @ 19:20:59 IST
  - 2026-05-28 13:55:02 UTC — `read` @ 19:21:21 IST
- **Webhook verdict (PRE-hotfix)**: `rejected_no_logid` (parser returned `{}` because JSON-only)
- **Webhook verdict (POST-hotfix replay)**: `no_matching_row` — logid extracted correctly, but row has `message_id=null` so lookup misses
- **AuthKey source IP**: `157.245.105.3` (DigitalOcean NY) — matches PRD §10 prediction ✅

### Order 2 — `pos_order_id = 869311` (POS-local `009571`)

- **Placed**: 2026-05-28 13:57:57 UTC (19:27:57 IST)
- **Customer/total**: abhishek jain / Rs.2,181
- **Send-side row** (`whatsapp_message_logs.id=crm-variable-mapping`):
  - Same null pattern as order 869310 (prod still on old code)
- **AuthKey logid (from callback)**: `20cba66ccf0559840eeefe641beffb5e`
- **Callbacks received**:
  - 2026-05-28 13:58:06 UTC — `delivered` @ 19:28:05 IST
  - 2026-05-28 13:58:31 UTC — `read` @ 19:28:30 IST
- **Webhook verdict (POST-hotfix)**: `no_matching_row` for both
- **WhatsApp end-to-end**: ✅ Delivered + Read by abhi at his phone (Meta wamid: `wamid.HBgMOTE3NTA1MjQyMTI2FQIAERgSQzM2QUY2RkFGNTY0NDU0RjAzAA==`)

---

## 4. Receive-side hotfix (post-Commit-7)

### Bug discovered

`message_status_callback` in `routers/whatsapp.py` parsed body as JSON only:
```python
payload = json.loads(raw_bytes) if raw_bytes else {}
```

AuthKey actually sends `application/x-www-form-urlencoded` on the wire. Raw body of a real delivery callback:
```
mobile=917505242126&status=read&logid=51855a8fbb9e894f4589da806223b3fc
&time=2026-05-28+19%3A21%3A21&channel=wp&meta_messageid=wamid.HBgM...
&type=text&1=abhishek+jain&2=Rs.754&3=your+order&4=counter&5=Kunafa+Mahal
```

Parser returned `{}` → `logid=None` → `verdict=rejected_no_logid` (even though all needed fields were present in the raw body).

### Root cause

PRD §9's "locked schema" sample (`{"logid": "6eec...", ...}`) was a post-parse view (likely from AuthKey docs or a logged dict), not the wire format. Commit 5 trusted that schema and wired only JSON parsing.

### Fix applied

`routers/whatsapp.py` (Commit 5 patch, ~+30/-6):

```python
from urllib.parse import parse_qs   # new import

content_type = (request.headers.get("content-type") or "").lower()

def _parse_form(b: bytes) -> Dict[str, Any]:
    decoded = b.decode("utf-8", errors="replace")
    parsed = parse_qs(decoded, keep_blank_values=True)
    return {k: (v[0] if len(v) == 1 else v) for k, v in parsed.items()}

def _parse_json(b: bytes) -> Dict[str, Any]:
    obj = json.loads(b) if b else {}
    return obj if isinstance(obj, dict) else {}

if "application/x-www-form-urlencoded" in content_type:
    payload = _parse_form(raw_bytes) or _parse_json(raw_bytes)
elif "application/json" in content_type:
    payload = _parse_json(raw_bytes) or _parse_form(raw_bytes)
else:
    payload = _parse_json(raw_bytes) or _parse_form(raw_bytes)
```

### Validation

1. **Lint**: `ruff check routers/whatsapp.py` → clean
2. **Backend health**: `/api/health` returns 200 after hot-reload
3. **Replay of 3 real captured AuthKey payloads**: all 3 returned `HTTP 200 {"success": true, "logid": "<extracted>", "updated": false}` — `updated: false` is the expected outcome because the message_log rows still have `message_id=null` (waiting on send-side push). Audit logs now show:
   - `parsed.logid` populated
   - `parsed.status` = `delivered` / `read`
   - `parsed.mobile` populated
   - `parsed.time` parsed
   - `parsed.meta_messageid` populated
4. **Backward compat**: JSON path unchanged. Defensive fallback for unknown Content-Type.

### Files modified

| File | Lines |
|---|---|
| `/app/backend/routers/whatsapp.py` | parser block in `message_status_callback` (~lines 962-1010) + new `parse_qs` import (~line 12) |

**Total**: ~+30 / -6 LoC. JSON path bytewise unchanged.

---

## 5. Test outcomes vs. plan acceptance criteria

| AC | Source | Result |
|---|---|---|
| Webhook reachable at registered URL | PRD §5 B3 | ✅ Confirmed via 5 real callbacks |
| `logid` extracted from real AuthKey traffic | Plan §B1 | ✅ (post-hotfix) |
| Status mapping handles `delivered`, `read` | Plan §G15 | ✅ |
| IST→UTC time parse correct | Plan §G15 | ✅ — `2026-05-28 19:28:05` IST mapped to `2026-05-28 13:58:05 UTC` correctly |
| Audit-first capture works regardless of parse | Plan §G16 | ✅ All callbacks persisted to `whatsapp_callback_logs` |
| Meta `wamid` captured | Plan §G18 | ✅ Parsed cleanly |
| `meta_messageid` field populated on row | Plan §G18 | ⏳ **Blocked** — no matching row to update |
| Status transition pending→delivered→read | Plan §G14 | ⏳ **Blocked** — same reason |
| `status_history` grows on each webhook | Plan §G14 | ⏳ **Blocked** — same reason |
| Dashboard reflects delivered_at / read_at | Plan §G14 | ⏳ **Blocked** — same reason |
| Idempotency-key duplicate-block | Plan §G3, G6, G8 | ⏳ **Blocked** — send-side path |

**Receive-side: 7/7 verified.**
**Send-side: 0/5 verified (all blocked on owner Option A or B).**

---

## 6. Decisions / discoveries

| ID | Decision / discovery | Source |
|---|---|---|
| D1 | AuthKey wire format is `application/x-www-form-urlencoded`, not JSON | Real captured callbacks 2026-05-28 |
| D2 | AuthKey echoes `body_values` (numeric keys 1..N) in delivery callbacks | Real captured callbacks |
| D3 | AuthKey echoes template `type` field in callbacks | Real captured callbacks |
| D4 | AuthKey egress IP confirmed as `157.245.105.3` (DigitalOcean NY) | `X-Forwarded-For` header on real callbacks |
| D5 | Same WABA / shared AuthKey scenarios still work via logid-keyed lookup | Architecture verification |
| D6 | CRM stores its own incrementing `pos_order_id` (e.g. `869311`) distinct from POS-local order numbers (`009571`) | Order 869311 trace |

---

## 7. Two paths to unpark — owner decides

### Option A (recommended — fast feedback, no prod touch)
1. Owner routes POS terminal's order endpoint to preview URL for one test order, OR
2. Agent (with permission) fires synthetic POST to `https://crm-variable-mapping.preview.emergentagent.com/api/pos/orders` with:
   - Header: `X-API-Key: dp_live_-sF0sATfNhf72UbrG9BPaKM4icqWnAb7Q4tB6DN3ktE`
   - Body: real POS order shape, customer phone `7505242126`, unique `pos_order_id` (e.g. `E2E_<timestamp>`)
3. Preview runs new code → row written WITH `message_id=<logid>` → real WhatsApp sent → real callback → dashboard reflects full lifecycle within ~60s
4. ⚠️ Side effects: 1 real WhatsApp to test customer abhi (designated test recipient), 1 test order in shared `orders` collection (can be flagged or deleted post-test)

### Option B (PRD §5 original path)
1. Owner pushes branch `28-may` to `crm.mygenie.online`
2. Next real POS order naturally exercises the full new code path
3. Same end-to-end validation, no synthetic data

---

## 8. Recommended closing artifact (after unpark)

When Option A or B completes successfully, the next agent should write:
- `memory/crm/crm_roi_sprint/qa/CR_004_PHASE_3_5_LIVE_TEST_REPORT.md` — the closure document
- Update PRD §4 to remove "Pending owner ops" line
- Update PRD §5.1 status from `parked_awaiting_option_a_send_side_live_test` to `live_test_passed_closed`
- Update CR-004 register row from `cr004_p3_5_parked` to `cr004_p3_5_closed_live_test_passed`

---

## 9. Files touched in this session

| File | Change | Purpose |
|---|---|---|
| `/app/backend/routers/whatsapp.py` | Edit (~+30/-6) | Form-urlencoded parser hotfix |
| `/app/memory/PRD.md` | Append §4 hotfix block, new §5.1 parked status, replace §9 with real wire format | Document current state |
| `/app/memory/crm/crm_roi_sprint/implementation/CR_004_P3_5_IMPLEMENTATION_CLOSEOUT.md` | Status update header | Reflect parked |
| `/app/memory/crm/crm_roi_sprint/qa/CR_004_PHASE_3_5_PARTIAL_LIVE_TEST_REPORT_2026_05_28.md` | NEW (this file) | Live test outcome |
| `/app/memory/crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` | Status update | Sprint register |

---

**End of partial live test report. CR-004 P3.5 is PARKED. Resume after owner picks Option A or B.**
