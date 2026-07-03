# CR-028 + BUG-008: POS Integration Settings UI + Login Push Fix — Implementation Report

## IDs: CR-028 (new UI) + BUG-008 (push fix)
## Date: 2026-06-18
## Status: 🟢 IMPLEMENTED + Regression Passed

---

## Summary

Fixed the CRM token over-push on every login (BUG-008) and built the POS Integration card in Settings (CR-028). Moved shared push function to `core/auth.py` to avoid circular imports.

---

## Backend Changes

### File 1: `core/auth.py` — Added `register_crm_token_with_pos()`

Moved from `routers/auth.py` (was `_register_crm_token_with_pos`). Same logic: fire-and-forget push to MyGenie POS, treats 2xx and 409 as success, persists `crm_token_registered_with_pos` flag on users doc. Now importable by both `routers/auth.py` and `routers/pos.py`.

### File 2: `routers/auth.py` — Gated login push

**Existing user path** (line ~425):
```python
# BEFORE: pushed unconditionally
await _register_crm_token_with_pos(...)

# AFTER: only push if not already registered
if not existing_user.get("crm_token_registered_with_pos"):
    await register_crm_token_with_pos(...)
```

**New user path** (line ~486): No gate needed — first-time push is correct. Updated function name only.

**Removed**: Old `_register_crm_token_with_pos` function + `_cr001_logger` (now in `core/auth.py`).

### File 3: `routers/pos.py` — Regenerate pushes new key

```python
# BEFORE: just saved new key, no push
new_key = generate_api_key()
await db.users.update_one({"id": user["id"]}, {"$set": {"api_key": new_key}})

# AFTER: reset flag + push + confirm
new_key = generate_api_key()
await db.users.update_one(
    {"id": user["id"]},
    {"$set": {"api_key": new_key, "crm_token_registered_with_pos": False}}
)
async with httpx.AsyncClient() as client:
    await register_crm_token_with_pos(...)
# Returns pushed_to_pos: true/false
```

---

## Frontend Changes

### File 4: `SettingsPage.jsx` — POS Integration card

Added below existing WhatsApp Configuration card:
- **Header**: Link2 icon + "POS Integration" + helper text
- **CRM API Key**: Masked input (readonly) + eye toggle + copy button
- **Regenerate Key**: Red outline button → AlertDialog confirmation → calls `POST /api/pos/api-key/regenerate` → shows new key + push result toast
- **State**: `posApiKey`, `showPosKey`, `regenerating`
- **API calls**: `GET /api/pos/api-key` on mount, `POST /api/pos/api-key/regenerate` on confirm

New imports: `Link2`, `Copy`, `RefreshCw` from lucide-react, `AlertDialog` components.

---

## Regression Results (R1-R10)

| # | Test | Result |
|---|---|---|
| R1 | Login works (access_token + mygenie_token) | ✅ PASS |
| R1b | Login push SKIPPED (BUG-008 gate working) | ✅ PASS — 0 "CR-001" log entries |
| R2 | /me returns profile with gstin | ✅ PASS |
| R5 | GET /pos/api-key returns dp_live_ key | ✅ PASS |
| R6 | Regenerate returns new key + pushed_to_pos=true | ✅ PASS |
| R7 | POS auth via X-API-Key works | ✅ PASS |
| R8 | Health endpoint | ✅ PASS |
| R9 | Campaign unit tests (10/10) | ✅ PASS |
| R11 | Settings page — both cards visible | ✅ PASS (screenshot verified) |

---

## Files Modified

| # | File | Change | LOC delta |
|---|---|---|---|
| 1 | `core/auth.py` | Added `register_crm_token_with_pos()` | +85 |
| 2 | `routers/auth.py` | Removed function, imported from core, added gate | -80, +5 |
| 3 | `routers/pos.py` | Regenerate: reset flag + push + import | +15 |
| 4 | `pages/SettingsPage.jsx` | POS Integration card | +70 |

---

**End of CR-028 + BUG-008 Implementation Report**
