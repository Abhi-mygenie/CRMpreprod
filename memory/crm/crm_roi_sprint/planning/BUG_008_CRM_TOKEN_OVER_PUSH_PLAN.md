# BUG-008: CRM Token Over-Push — Impact Analysis & Implementation Plan

## Bug ID: BUG-008
## Date: 2026-06-18
## Related: CR-001 (Push CRM Token to MyGenie on First-Time Login)
## Severity: LOW (no functional impact)
## Files: `routers/auth.py`, `routers/pos.py`

---

## PART 1 — IMPACT ANALYSIS

### 1.1 Current State (from DB)

| Metric | Value |
|---|---|
| Total users | 24 |
| `crm_token_registered_with_pos = true` | 24 (100%) |
| `crm_token_registered_with_pos = false` | 0 |
| Field missing | 0 |
| Has `api_key` | 24 (100%) |
| Missing `api_key` | 0 |

**All 24 users are already registered.** Every login is currently making a redundant push that returns 409.

### 1.2 Call Chain

```
User clicks Sign In
    │
    ▼
mygenie_login() — routers/auth.py:411
    │
    ├── Existing user path (line 491-546)
    │       │
    │       ├── Backfill api_key if missing (line 502-509)
    │       │
    │       └── _register_crm_token_with_pos()  ← ALWAYS CALLED (line 512)
    │               │
    │               ├── POST to POS /api/v1/auth/restaurant-crm-token
    │               ├── Writes crm_token_registered_with_pos to DB
    │               └── Timeout: 10s
    │
    └── New user path (line 548-608)
            │
            ├── generate_api_key() (line 549)
            │
            └── _register_crm_token_with_pos()  ← CORRECTLY CALLED (line 571)
```

### 1.3 Risk Assessment

| Change | Risk | Mitigation |
|---|---|---|
| Skip push when `crm_token_registered_with_pos=true` | POS already has key → no impact | Field is already `true` for all 24 users |
| Retry push when `crm_token_registered_with_pos=false` | Push failed previously → retry is correct | Same as current behavior |
| Push on `api_key` regeneration | New key must reach POS | Add push call to `regenerate_api_key` endpoint |
| Reset `crm_token_registered_with_pos=false` on regeneration | Forces re-push on next login if inline push fails | Safety net |

### 1.4 Edge Cases

| Scenario | Current Behavior | Proposed Behavior |
|---|---|---|
| First login (new user) | Push ✅ | Push ✅ (no change) |
| Second+ login (registered) | Push ❌ (wasteful 409) | **Skip** ✅ |
| Previous push failed (field=false) | Push ✅ | Push ✅ (retry) |
| After api_key regeneration | No push ❌ (POS has stale key) | **Push new key** ✅ |
| POS DB wiped (lost CRM key) | Push on next login ✅ | **Skip** ❌ (thinks registered) |

**POS DB wipe scenario**: If POS loses the CRM key, the flag says `true` but POS doesn't have it. Mitigation: add a "Force Re-register" admin action or check POS response on first order failure.

---

## PART 2 — IMPLEMENTATION PLAN

### 2.1 Change 1: Gate the push in existing user path

**File**: `routers/auth.py` — existing user path (around line 502-515)

```python
# BEFORE (line 511-515):
# CR-001: Push CRM token to MyGenie POS
await _register_crm_token_with_pos(
    client, mygenie_api_url, restaurant_id,
    api_key, mygenie_token, existing_user["id"]
)

# AFTER:
# CR-001: Push CRM token to MyGenie POS (only if not already registered)
if not existing_user.get("crm_token_registered_with_pos"):
    await _register_crm_token_with_pos(
        client, mygenie_api_url, restaurant_id,
        api_key, mygenie_token, existing_user["id"]
    )
```

**New user path (line 571)**: No change — first-time push is correct.

### 2.2 Change 2: Push on api_key regeneration

**File**: `routers/pos.py` — `regenerate_api_key` (around line 2076-2085)

```python
# BEFORE:
@router.post("/api-key/regenerate")
async def regenerate_api_key(user: dict = Depends(get_current_user)):
    new_key = generate_api_key()
    await db.users.update_one({"id": user["id"]}, {"$set": {"api_key": new_key}})
    return {
        "message": "API key regenerated successfully",
        "api_key": new_key,
        "warning": "Make sure to update your POS system with the new key"
    }

# AFTER:
@router.post("/api-key/regenerate")
async def regenerate_api_key(user: dict = Depends(get_current_user)):
    new_key = generate_api_key()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"api_key": new_key, "crm_token_registered_with_pos": False}}
    )
    # Push new key to POS immediately
    import httpx
    mygenie_api_url = os.environ['MYGENIE_API_URL']
    mygenie_token = user.get("mygenie_token")
    restaurant_id = user.get("restaurant_id")
    async with httpx.AsyncClient() as client:
        await _register_crm_token_with_pos(
            client, mygenie_api_url, restaurant_id,
            new_key, mygenie_token, user["id"]
        )
    return {
        "message": "API key regenerated and pushed to POS",
        "api_key": new_key,
    }
```

Note: `_register_crm_token_with_pos` must be importable from `routers.auth` or moved to `core/auth.py`.

### 2.3 Files Modified

| # | File | Change | LOC |
|---|---|---|---|
| 1 | `routers/auth.py` | Add `if not existing_user.get("crm_token_registered_with_pos")` gate | +2 lines |
| 2 | `routers/pos.py` | Add push + reset flag on regeneration | +10 lines |

### 2.4 Validation

| # | Test | How |
|---|---|---|
| 1 | First login → push happens | Delete `crm_token_registered_with_pos` for test user → login → check logs for "CR-001 OK" |
| 2 | Second login → push skipped | Login again → check logs for NO "CR-001" entry |
| 3 | Failed push retries | Set `crm_token_registered_with_pos=false` → login → push happens |
| 4 | Regenerate pushes new key | Call `/api/pos/api-key/regenerate` → check logs for "CR-001 OK" with new key |
| 5 | Login latency reduced | Compare login response time before/after (should save ~100-500ms) |

---

## PART 3 — OWNER DECISIONS

| # | Question | Recommendation |
|---|---|---|
| Q1 | Proceed with implementation? | Low risk, clear improvement |
| Q2 | Should `regenerate_api_key` be fire-and-forget or fail if push fails? | Fire-and-forget (same pattern as login) — key is regenerated in DB regardless |
| Q3 | Need a "Force Re-register" admin button for POS DB wipe scenario? | Defer — edge case, can be done via DB manual update |

---

**End of BUG-008 Impact Analysis & Plan**
