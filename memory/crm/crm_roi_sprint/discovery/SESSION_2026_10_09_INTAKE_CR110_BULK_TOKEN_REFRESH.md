# CR-110 — Intake: Bulk `mygenie_token` refresh script (preprod token fix for production-dump DB)
**Date**: 2026-10-09 · **Role**: Intake Agent · **Source**: CR-086 IA finding + owner 2026-10-09 ("boot intake role and create formal CR") · **No application code changed.**

---

## 1. Owner Request
> "As I told before also this is because of production dump — tokens are not right. Is there a way we can write a script and run to get UAT token from CRM for all restaurants? No code edit." — Owner 2026-10-09.

---

## 2. Problem

The preprod DB was populated from a production dump. **Production `mygenie_token` values stored in `users.mygenie_token` do not work against `preprod.mygenie.online`** — they return 401 on any API call. This causes `background_customer_sync` to fail on page 1 for all tenants whose tokens came from prod (not just r541/665/474).

Every restaurant that has never logged into the preprod CRM since the dump has a stale/prod token. Any `customer_sync` or `order_sync` for those restaurants silently fails with 401.

---

## 3. Solution — one-time Python script, no application file change

A script that:
1. Iterates all restaurant docs in `users` collection
2. For each: calls `MYGENIE_LOGIN_ENDPOINT` (preprod) with the restaurant owner's email + password
3. On success: calls `MYGENIE_CRM_TOKEN_ENDPOINT` → gets a fresh preprod CRM token
4. Updates `users.mygenie_token` in MongoDB
5. Logs success/failure per restaurant; skips on failure (no damage)

**Script runs with `--dry-run` flag first** (prints new tokens without writing). **No application code files are modified.**

---

## 4. Classification

| Field | Value |
|---|---|
| **Type** | OPS — one-time operational script (Python, run from bash) |
| **Severity** | **P1** — directly unblocks CR-086 (₹97,56,648 invisible revenue); stale tokens affect ALL restaurant syncs, not just the 3 flagged tenants |
| **Risk** | **LOW–MEDIUM** — writes `mygenie_token` on `users` docs; dry-run mode protects against accidents; skip-on-fail means no tenant is left worse than before; no customer/order/loyalty data touched |
| **Duplicate check** | **DISTINCT** — no existing script does bulk token refresh |
| **Blast radius** | **SMALL** — writes `mygenie_token` field only on `users` collection; no schema change; no index change; no customer/order/loyalty impact |

---

## 5. Assumptions (to verify on first dry run)

| # | Assumption | What to check |
|---|---|---|
| A1 | All preprod restaurant owners share password `Qplazm@10` | Dry-run: count `OK` vs `FAIL login` |
| A2 | `MYGENIE_LOGIN_ENDPOINT` response shape: `data.token` | Dry-run: print raw response for first restaurant |
| A3 | `MYGENIE_CRM_TOKEN_ENDPOINT` response shape: `data.token` or `token` | Same |
| A4 | MyGenie preprod doesn't rate-limit bulk login calls | Dry-run: add `sleep(0.3)` between calls if needed |

---

## 6. Script (canonical version — no application file change)

**File:** `/tmp/refresh_mygenie_tokens.py` (temp location — not part of the application)

```python
#!/usr/bin/env python3
"""
CR-110: Bulk refresh mygenie_token for all restaurants (preprod token fix).
Usage:
  python3 /tmp/refresh_mygenie_tokens.py --dry-run          # safe preview
  python3 /tmp/refresh_mygenie_tokens.py --password Qplazm@10  # write
"""
import sys, time, requests
from pymongo import MongoClient
from dotenv import dotenv_values

env       = dotenv_values("/app/backend/.env")
MONGO_URL = env["MONGO_URL"]
DB_NAME   = env["DB_NAME"]
MYGENIE   = env["MYGENIE_API_URL"]
LOGIN_EP  = env["MYGENIE_LOGIN_ENDPOINT"]
TOKEN_EP  = env["MYGENIE_CRM_TOKEN_ENDPOINT"]

DRY_RUN  = "--dry-run" in sys.argv
PASSWORD = sys.argv[sys.argv.index("--password") + 1] if "--password" in sys.argv else "Qplazm@10"

db    = MongoClient(MONGO_URL)[DB_NAME]
users = list(db.users.find({}, {"_id":0,"id":1,"email":1}))
print(f"Restaurants: {len(users)} | DRY_RUN={DRY_RUN}")

ok = fail = skip = 0
for u in users:
    email, rid = u.get("email"), u.get("id")
    if not email or not rid:
        skip += 1; continue

    # Step 1 — vendor employee login → session token
    r1 = requests.post(f"{MYGENIE}{LOGIN_EP}",
                       json={"email": email, "password": PASSWORD}, timeout=15)
    if r1.status_code != 200:
        print(f"  FAIL-LOGIN  {email}: {r1.status_code}")
        fail += 1; time.sleep(0.3); continue
    session = (r1.json().get("data") or {}).get("token")
    if not session:
        print(f"  FAIL-TOKEN  {email}: no token in login response")
        fail += 1; continue

    # Step 2 — get restaurant CRM token
    r2 = requests.post(f"{MYGENIE}{TOKEN_EP}",
                       headers={"Authorization": f"Bearer {session}"}, timeout=15)
    if r2.status_code != 200:
        print(f"  FAIL-CRM    {email}: {r2.status_code}")
        fail += 1; time.sleep(0.3); continue
    crm_token = (r2.json().get("data") or {}).get("token") or r2.json().get("token")
    if not crm_token:
        print(f"  FAIL-CRM    {email}: no crm_token in response")
        fail += 1; continue

    if DRY_RUN:
        print(f"  DRY-OK   {email}  new_token: {crm_token[:20]}...")
    else:
        db.users.update_one({"id": rid}, {"$set": {"mygenie_token": crm_token}})
        print(f"  OK       {email}")
    ok += 1
    time.sleep(0.2)  # polite rate limit

print(f"\nResult: ok={ok}  fail={fail}  skip={skip}")
db.client.close()
```

---

## 7. Execution plan

```
Step 1 — Dry run (confirm shape):
  python3 /tmp/refresh_mygenie_tokens.py --dry-run --password Qplazm@10

Step 2 — Review output: ok > 0, no unexpected failures

Step 3 — Write run:
  python3 /tmp/refresh_mygenie_tokens.py --password Qplazm@10

Step 4 — Verify 3 affected tenants have fresh tokens:
  python3 -c "..."  (spot-check r541/665/474 mygenie_token changed)

Step 5 — Re-trigger customer sync for r541/665/474:
  POST /api/migration/trigger-customer-sync  (existing endpoint, uses new token)

Step 6 — Re-trigger order sync for r541/665/474 (links orphan orders to customers)
```

---

## 8. No owner questions — all decisions clear

| | Decision |
|---|---|
| Application code files modified? | **No** — script is `/tmp/` only |
| PROC-001 required? | **No** — only `mygenie_token` field updated on `users`, no customer/order writes |
| Run timing | Immediately (unblocks CR-086 Part A) |
| If some restaurants fail? | Skip cleanly; re-run with correct password for those tenants |

---

```
Intake complete: CR-110
Classification: OPS — one-time script, no application file change
Severity: P1 (unblocks CR-086 / ₹97.5L invisible revenue; affects ALL restaurant syncs)
Risk: LOW–MEDIUM (writes mygenie_token only; dry-run first; skip-on-fail)
Duplicate check: DISTINCT
Evidence: production dump confirmed; 3 tenants confirmed 401; all timestamps pre-Aug 2026
Blast radius: SMALL (users.mygenie_token field only)
Owner decisions: none — trivially clear
Docs: discovery/SESSION_2026_10_09_INTAKE_CR110_BULK_TOKEN_REFRESH.md
Next: Planning (trivial — script already written); "choose implementation role for CR-110" to run it
```
