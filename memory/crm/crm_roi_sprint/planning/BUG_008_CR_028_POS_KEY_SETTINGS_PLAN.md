# CR-028 + BUG-008: POS Integration Settings UI + Login Push Fix — Impact Analysis & Implementation Plan

## IDs: CR-028 (new UI) + BUG-008 (push fix)
## Date: 2026-06-18
## Status: 🔵 Implementation Plan LOCKED
## Effort: ~½ day (bundled)

---

## PART 1 — IMPACT ANALYSIS

### 1.1 Components Affected

```
┌─────────────────────────────────────────────────────┐
│                  BACKEND                             │
│                                                     │
│  routers/auth.py                                    │
│    └── mygenie_login() line 511-515                 │
│        └── _register_crm_token_with_pos() — ADD GATE│
│                                                     │
│  routers/pos.py                                     │
│    └── regenerate_api_key() line 2076-2085           │
│        └── ADD: reset flag + push new key            │
│                                                     │
│  (No new endpoints needed — GET /pos/api-key and    │
│   POST /pos/api-key/regenerate already exist)       │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                  FRONTEND                            │
│                                                     │
│  pages/SettingsPage.jsx (107 LOC)                   │
│    └── Currently: WhatsApp Configuration only       │
│    └── ADD: "POS Integration" card below WhatsApp   │
│        ├── API Key display (masked + toggle)        │
│        ├── Copy to clipboard button                 │
│        └── Regenerate button + confirm dialog       │
└─────────────────────────────────────────────────────┘
```

### 1.2 What Exists Today

| Component | State | Reusable? |
|---|---|---|
| `_register_crm_token_with_pos()` in auth.py | Fully working push function with logging + DB audit | ✅ Yes — call from pos.py |
| `crm_token_registered_with_pos` field on users doc | Written on every push (true/false) but never read | ✅ Yes — use as gate |
| `GET /api/pos/api-key` endpoint | Returns api_key, auto-generates if missing | ✅ Yes — frontend calls this |
| `POST /api/pos/api-key/regenerate` endpoint | Generates new key, saves to DB, no push | ⚠️ Needs push + flag reset added |
| SettingsPage.jsx | WhatsApp config card with masked inputs + save | ✅ Yes — add second card below |
| Show/hide toggle pattern | Already used for AuthKey + Meta Token fields | ✅ Yes — reuse same pattern |

### 1.3 Risk Assessment

| Change | Risk Level | What Could Break | Mitigation |
|---|---|---|---|
| Gate login push | 🟢 LOW | If flag is wrong (true but POS doesn't have key) → POS can't call CRM | DB shows 24/24 users already `true`. Edge case: POS DB wipe. Owner can regenerate to force re-push. |
| Push on regeneration | 🟢 LOW | Push fails → POS has stale key | Flag reset to `false` → next login retries. Same safety net as first-time push. |
| Import `_register_crm_token_with_pos` in pos.py | 🟡 MEDIUM | Circular import (auth.py ↔ pos.py) | Both import from `core/`, not from each other. But `_register_crm_token_with_pos` is in `routers/auth.py` — **must move to `core/` or use inline httpx call** |
| Settings UI new card | 🟢 LOW | CSS/layout conflict | Separate card, no overlap with existing WhatsApp card |

### 1.4 Circular Import Risk — Key Decision

`_register_crm_token_with_pos()` lives in `routers/auth.py`. The `regenerate_api_key` endpoint lives in `routers/pos.py`. Importing between routers risks circular imports.

**Options:**
| Option | Approach | Risk |
|---|---|---|
| A | Move `_register_crm_token_with_pos()` to `core/auth.py` | 🟢 Clean — both routers import from core |
| B | Duplicate the push logic inline in pos.py | 🟡 Code duplication |
| C | Inline httpx call in regenerate_api_key | 🟡 No logging/audit consistency |

**Recommendation: Option A** — move function to `core/auth.py`, import from both routers.

### 1.5 Blast Radius

| If this breaks... | Impact | Who's affected |
|---|---|---|
| Login push gate wrong | POS can't call CRM for that restaurant | That restaurant's orders/loyalty/coupons via POS |
| Regeneration push fails | POS has stale key (same as today) | No regression — current behavior |
| Settings UI crashes | Settings page unusable | Owner can't view/manage keys (WhatsApp settings also affected if same page) |

---

## PART 2 — IMPLEMENTATION PLAN

### 2.1 Backend Change 1: Move push function to `core/auth.py`

**From**: `routers/auth.py` lines 49-129 (`_register_crm_token_with_pos`)
**To**: `core/auth.py` (new function)

Update imports:
- `routers/auth.py` → `from core.auth import ..., register_crm_token_with_pos`
- `routers/pos.py` → `from core.auth import ..., register_crm_token_with_pos`

### 2.2 Backend Change 2: Gate login push

**File**: `routers/auth.py` — existing user path (~line 511)

```python
# BEFORE:
await _register_crm_token_with_pos(...)

# AFTER:
if not existing_user.get("crm_token_registered_with_pos"):
    await register_crm_token_with_pos(...)
```

### 2.3 Backend Change 3: Push on regeneration

**File**: `routers/pos.py` — `regenerate_api_key` (~line 2076)

```python
# AFTER:
new_key = generate_api_key()
await db.users.update_one(
    {"id": user["id"]},
    {"$set": {"api_key": new_key, "crm_token_registered_with_pos": False}}
)
# Push new key to POS
import httpx
async with httpx.AsyncClient() as client:
    await register_crm_token_with_pos(
        client, os.environ['MYGENIE_API_URL'],
        user.get("restaurant_id"), new_key,
        user.get("mygenie_token"), user["id"]
    )
# Re-read flag to confirm
updated = await db.users.find_one({"id": user["id"]}, {"crm_token_registered_with_pos": 1})
return {
    "api_key": new_key,
    "pushed_to_pos": updated.get("crm_token_registered_with_pos", False),
}
```

### 2.4 Frontend Change: POS Integration card in SettingsPage.jsx

Add below existing WhatsApp card:

```
┌─────────────────────────────────────────┐
│  🔗 POS Integration                     │
│                                         │
│  CRM API Key                            │
│  dp_live_●●●●●●●●●●●  [👁] [📋 Copy]  │
│                                         │
│  Share this key with your POS team so   │
│  they can send orders and access CRM.   │
│                                         │
│  [🔄 Regenerate Key]                    │
│                                         │
│  Last pushed to POS: 2026-06-18 ✅      │
└─────────────────────────────────────────┘
```

**State needed**: `posApiKey`, `showPosKey`, `posRegistered`, `regenerating`
**API calls**: `GET /api/pos/api-key` on mount, `POST /api/pos/api-key/regenerate` on click
**Confirm dialog**: AlertDialog before regeneration — "Old key stops working immediately"

### 2.5 Files Modified Summary

| # | File | Change | LOC delta |
|---|---|---|---|
| 1 | `core/auth.py` | Add `register_crm_token_with_pos()` (moved from routers/auth.py) | +80 lines |
| 2 | `routers/auth.py` | Remove function, import from core, add gate `if not ... registered` | ~-80, +5 |
| 3 | `routers/pos.py` | Update regenerate: reset flag + push + import | +15 lines |
| 4 | `pages/SettingsPage.jsx` | Add POS Integration card | +60 lines |

### 2.6 Execution Order

```
Step 1: Move _register_crm_token_with_pos to core/auth.py
Step 2: Update routers/auth.py — import + gate
Step 3: Update routers/pos.py — regenerate + push
Step 4: Update SettingsPage.jsx — POS Integration card
Step 5: Restart backend
Step 6: Validate (login, regenerate, Settings UI)
```

### 2.7 Acceptance Criteria

| # | Criteria | How to Verify |
|---|---|---|
| AC1 | Login with registered user → push skipped | Login → backend logs show NO "CR-001" entry |
| AC2 | Login with unregistered user → push happens | Set flag=false → login → logs show "CR-001 OK" |
| AC3 | Regenerate → new key pushed to POS | Call regenerate → logs show "CR-001 OK" with new key |
| AC4 | Regenerate → flag reset then set | Check DB: flag goes false → true |
| AC5 | Settings page shows POS Integration card | Navigate to /settings → card visible |
| AC6 | API key masked by default | Key shows as dots/bullets |
| AC7 | Show/hide toggle works | Click eye icon → key visible → click again → masked |
| AC8 | Copy button works | Click copy → clipboard has key → toast "Copied" |
| AC9 | Regenerate confirmation dialog | Click regenerate → dialog warns "old key stops working" |
| AC10 | After regenerate, new key shown | Regenerate → card updates with new key |

---

**End of CR-028 + BUG-008 Impact Analysis & Plan**

---

## PART 3 — REGRESSION PLAN (Required per Section 8 — High-Risk Files)

### 3.1 High-Risk Files Being Touched

| File | Risk per Section 8 | Regression Required |
|---|---|---|
| `routers/auth.py` | MyGenie SSO. Locks out all users if broken. | Login + /me + profile fields |
| `routers/pos.py` | Live POS webhook. Real orders. | Full POS order flow + coupon validate/apply |
| `core/auth.py` | JWT, bcrypt, API key verification. | Token create/verify, get_current_user, verify_pos_auth |

### 3.2 Regression Test Matrix

**After implementation, run ALL of these before declaring done:**

| # | Test | Command / Method | Pass Criteria |
|---|---|---|---|
| R1 | Login works | `curl -X POST $API/auth/login -d '{"email":"owner@kunafamahal.com","password":"Qplazm@10"}'` | 200 + access_token + mygenie_token |
| R2 | /me returns profile | `curl -H "Authorization: Bearer $TOKEN" $API/auth/me` | 200 + user fields including gstin, bill_settings |
| R3 | Profile update works | `curl -X PUT -H "Authorization: Bearer $TOKEN" $API/auth/profile -d '{"phone":"test"}'` | 200 |
| R4 | POS order webhook (existing real data) | Check latest backend logs for any POS order errors | No new errors |
| R5 | POS api-key endpoint | `curl -H "Authorization: Bearer $TOKEN" $API/pos/api-key` | 200 + api_key returned |
| R6 | POS regenerate endpoint | `curl -X POST -H "Authorization: Bearer $TOKEN" $API/pos/api-key/regenerate` | 200 + new key + pushed_to_pos field |
| R7 | verify_pos_auth still works | `curl -H "X-API-Key: $API_KEY" $API/pos/customer-lookup?phone=test` | 200 or 404 (not 401) |
| R8 | JWT create/verify unbroken | Login → use token → /me works | No 401 errors |
| R9 | Campaign tests still pass | `pytest tests/test_campaign_jobs.py -v` | 10/10 pass |
| R10 | Campaign API tests still pass | `pytest tests/test_campaigns_api.py -v` | 18/18 pass |
| R11 | Frontend Settings page loads | Screenshot /settings | WhatsApp card + POS Integration card visible |
| R12 | Frontend login flow | Screenshot login → dashboard | Redirects correctly |

### 3.3 Rollback Plan

If any regression fails:
1. `git diff` to identify what changed
2. Revert specific file(s) via `search_replace` to restore original code
3. If `core/auth.py` function move breaks imports → revert move, keep function in `routers/auth.py`, use Option C (inline httpx) for pos.py instead
4. Restart backend: `sudo supervisorctl restart backend`

### 3.4 Implementation Sequence (Safe Order)

```
Phase A: Backend (no UI changes yet)
  Step 1: Add register_crm_token_with_pos() to core/auth.py
  Step 2: Update routers/auth.py — import from core, add gate
  Step 3: Update routers/pos.py — import from core, update regenerate
  Step 4: Restart backend
  Step 5: Run R1-R10 regression
  ── If any fail → rollback Phase A ──

Phase B: Frontend (after backend stable)
  Step 6: Update SettingsPage.jsx — add POS Integration card
  Step 7: Wait for hot-reload
  Step 8: Run R11-R12 regression
  ── If any fail → rollback Phase B only ──

Phase C: QA
  Step 9: Run testing_agent_v3 for AC1-AC10
  Step 10: Update docs (CR board, bug registry, decisions log)
```

**Two-phase rollback**: Backend and frontend are independent. If backend fails, frontend is untouched. If frontend fails, backend changes still work (just no UI for it).

---

**Implementation plan LOCKED. Ready for Implementation Agent.**
