# CR-110 — Impact Analysis + Implementation Plan: Bulk `mygenie_token` Refresh
**Date**: 2026-10-09 · **Role**: Planning Agent · **Intake**: `discovery/SESSION_2026_10_09_INTAKE_CR110_BULK_TOKEN_REFRESH.md` · **Risk**: LOW–MEDIUM (writes `users.mygenie_token` only; dry-run first) · **Status**: ✅ OWNER APPROVED — gate opens on "choose implementation role for CR-110" · **No application code changed.**

---

## 0. No owner questions — all decisions trivially clear

---

## 1. Impact Analysis

### Confirmed API response shapes (live probe 2026-10-09)

**`POST https://preprod.mygenie.online/api/v1/auth/vendoremployee/login`**
```json
{
  "token":         "QBf16ojlK3Yiwm...",   ← vendor employee session JWT (NOT what we need)
  "crm_token":     "dp_live_vRqifi...",   ← THIS IS mygenie_token (store this)
  "firebase_token": null,
  "first_login":   false,
  "role_name":     "...",
  "role":          "...",
  "zone_wise_topic": "..."
}
```

**`MYGENIE_CRM_TOKEN_ENDPOINT`** — NOT needed. The `crm_token` is already returned by login. Calling the token endpoint separately returns `{'errors': ...}` and requires additional parameters we don't have.

### Corrected script logic — 1 step, not 2

| Step | Before (intake assumption) | After (confirmed) |
|---|---|---|
| Login | `d['data']['token']` | `d['token']` (session JWT) |
| Get CRM token | Call MYGENIE_CRM_TOKEN_ENDPOINT | **Not needed — use `d['crm_token']` from login response** |
| Store | `users.mygenie_token = crm_token` | Same |

### Env vars confirmed present

```
MYGENIE_API_URL=https://preprod.mygenie.online
MYGENIE_LOGIN_ENDPOINT=/api/v1/auth/vendoremployee/login
```

(`MYGENIE_CRM_TOKEN_ENDPOINT` not needed)

### Blast radius

- **Writes**: `users.mygenie_token` field only (41 docs)
- **No impact on**: customers · orders · loyalty · coupons · WhatsApp · analytics
- **PROC-001**: Not required (no structural/relational data change)

---

## 2. Implementation Plan

### Script — canonical final version

**File**: `/tmp/refresh_mygenie_tokens.py` (not an application file)

```python
#!/usr/bin/env python3
"""
CR-110: Bulk refresh mygenie_token for all 41 restaurants.
Calls MYGENIE_LOGIN_ENDPOINT → extracts crm_token → stores in users.mygenie_token.

Usage:
  python3 /tmp/refresh_mygenie_tokens.py --dry-run              # preview only
  python3 /tmp/refresh_mygenie_tokens.py --password Qplazm@10   # write
  python3 /tmp/refresh_mygenie_tokens.py --password Qplazm@10 --restaurant 541  # single
"""
import sys, time, requests
from pymongo import MongoClient
from dotenv import dotenv_values

env       = dotenv_values("/app/backend/.env")
MONGO_URL = env["MONGO_URL"]
DB_NAME   = env["DB_NAME"]
MYGENIE   = env["MYGENIE_API_URL"]
LOGIN_EP  = env["MYGENIE_LOGIN_ENDPOINT"]

DRY_RUN    = "--dry-run" in sys.argv
PASSWORD   = sys.argv[sys.argv.index("--password") + 1] if "--password" in sys.argv else "Qplazm@10"
SINGLE_RID = sys.argv[sys.argv.index("--restaurant") + 1] if "--restaurant" in sys.argv else None

db    = MongoClient(MONGO_URL)[DB_NAME]
query = {"id": f"pos_0001_restaurant_{SINGLE_RID}"} if SINGLE_RID else {}
users = list(db.users.find(query, {"_id":0,"id":1,"email":1}))
print(f"Restaurants to process: {len(users)} | DRY_RUN={DRY_RUN} | password=***")

ok = fail = skip = 0
for u in users:
    email, rid = u.get("email"), u.get("id")
    if not email or not rid:
        skip += 1
        print(f"  SKIP  {rid} — no email")
        continue

    r = requests.post(
        f"{MYGENIE}{LOGIN_EP}",
        json={"email": email, "password": PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        print(f"  FAIL  {email}: HTTP {r.status_code}")
        fail += 1
        time.sleep(0.3)
        continue

    body      = r.json()
    crm_token = body.get("crm_token")   # dp_live_... — confirmed field name 2026-10-09
    if not crm_token:
        print(f"  FAIL  {email}: no crm_token in response (keys: {list(body.keys())})")
        fail += 1
        continue

    if DRY_RUN:
        print(f"  DRY   {email}  crm_token: {crm_token[:20]}...")
    else:
        db.users.update_one({"id": rid}, {"$set": {"mygenie_token": crm_token}})
        print(f"  OK    {email}")
    ok += 1
    time.sleep(0.2)   # polite rate-limit

print(f"\nResult: ok={ok}  fail={fail}  skip={skip}")
db.client.close()
```

---

## 3. Execution order

```
Step 1 — Create script
  cat > /tmp/refresh_mygenie_tokens.py  (or agent creates it)

Step 2 — Dry run (confirm crm_token present for all tenants)
  python3 /tmp/refresh_mygenie_tokens.py --dry-run --password Qplazm@10
  Expected: ~41 DRY lines, 0 FAIL

Step 3 — Write run
  python3 /tmp/refresh_mygenie_tokens.py --password Qplazm@10
  Expected: ~41 OK lines, 0 FAIL

Step 4 — Spot-verify the 3 CR-086 tenants have fresh tokens
  python3 -c "check r541/665/474 mygenie_token changed"

Step 5 — Re-trigger customer sync for the 3 tenants (now with valid tokens)
  POST /api/migration/trigger-customer-sync  (existing endpoint, no X-MyGenie-Token header needed — token is now fresh in DB)

Step 6 — After customer sync completes — re-trigger order sync
  POST /api/migration/trigger-order-sync  (links 15,172 orphan orders to customers)
```

---

## 4. Rollback

Store the 41 original `mygenie_token` values before Step 3. If needed, restore with a reverse `updateMany`. In practice, rollback is unnecessary — a fresh token is always better than an expired one.

---

## 5. Verification matrix

| V | Check | Expected |
|---|---|---|
| V1 | Dry run output | ~41 `DRY` lines with `crm_token: dp_live_...` |
| V2 | Write run output | ~41 `OK` lines, 0 `FAIL` |
| V3 | `db.users.find({"id":"pos_0001_restaurant_541"}).mygenie_token` | Changed from old prod value to new `dp_live_...` |
| V4 | Re-trigger customer sync for r541 | `status: success` not `401` |
| V5 | `db.customers.count({"user_id":"pos_0001_restaurant_541"})` after sync | Increased from 313 |

---

```
Planning complete: CR-110
Stage: IA + Implementation Plan (combined)
Code reality confirmed: login returns crm_token at top level (not d['data']['token'])
                        MYGENIE_CRM_TOKEN_ENDPOINT not needed (crm_token already in login response)
Risk: LOW–MEDIUM (writes users.mygenie_token; dry-run first; skip-on-fail)
Files WILL change: /tmp/refresh_mygenie_tokens.py (temp script, not application code)
DB WILL change: users.mygenie_token for up to 41 docs
Files WILL NOT touch: any application .py/.jsx file
Owner decisions: none
Next: "choose implementation role for CR-110" → create script → dry run → write → sync
```
