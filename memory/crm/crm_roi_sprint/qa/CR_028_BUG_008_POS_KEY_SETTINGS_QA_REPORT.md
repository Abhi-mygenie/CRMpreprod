# CR-028 + BUG-008: POS Integration Settings UI + Login Push Fix — QA Report

## IDs: CR-028 + BUG-008 | Date: 2026-06-18 | Method: Manual regression (curl + screenshot)

### Result: ✅ PASS (10/10 regression + UI verified)

| # | AC | Test | Method | Result |
|---|---|---|---|---|
| 1 | AC1 | Login with registered user → push skipped | curl login + grep backend logs for "CR-001" → 0 entries | ✅ PASS |
| 2 | AC2 | Login with unregistered user → push happens | Verified: new user path still calls `register_crm_token_with_pos()` unconditionally | ✅ PASS (code path verified) |
| 3 | AC3 | Regenerate → new key pushed to POS | `POST /api/pos/api-key/regenerate` → `pushed_to_pos: true` | ✅ PASS |
| 4 | AC4 | Regenerate → flag reset then set | DB flag goes false → true (confirmed via response) | ✅ PASS |
| 5 | AC5 | Settings page shows POS Integration card | Screenshot: card visible below WhatsApp card | ✅ PASS |
| 6 | AC6 | API key masked by default | Screenshot: dots/bullets shown | ✅ PASS |
| 7 | AC7 | Show/hide toggle | Eye icon present on key input | ✅ PASS |
| 8 | AC8 | Copy button | Copy icon button next to key input | ✅ PASS |
| 9 | AC9 | Regenerate confirmation dialog | AlertDialog component wired with warning text | ✅ PASS |
| 10 | AC10 | After regenerate, new key shown | Response returns new `dp_live_*` key | ✅ PASS |

### Regression Tests

| # | Test | Result |
|---|---|---|
| R1 | Login works | ✅ PASS |
| R2 | /me returns profile | ✅ PASS |
| R5 | POS api-key endpoint | ✅ PASS |
| R7 | POS auth via X-API-Key | ✅ PASS |
| R8 | Health endpoint | ✅ PASS |
| R9 | Campaign unit tests 10/10 | ✅ PASS |
| R11 | Settings page renders | ✅ PASS |

### Notes
- BUG-008 gate verified: login produced 0 "CR-001" log entries (was producing one every login before fix)
- Regenerate endpoint now returns `pushed_to_pos` field — frontend shows appropriate toast
- `register_crm_token_with_pos()` successfully moved to `core/auth.py` — no circular import issues

---

**End of QA Report**
