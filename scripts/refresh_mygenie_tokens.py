#!/usr/bin/env python3
"""
CR-110: Bulk refresh mygenie_token for all restaurants.
Calls MYGENIE_LOGIN_ENDPOINT → extracts crm_token → stores in users.mygenie_token.

Usage:
  python3 /tmp/refresh_mygenie_tokens.py --password Qplazm@10
  python3 /tmp/refresh_mygenie_tokens.py --password Qplazm@10 --restaurant 541
"""
import sys, time, requests
from pymongo import MongoClient
from dotenv import dotenv_values

env       = dotenv_values("/app/backend/.env")
MONGO_URL = env["MONGO_URL"]
DB_NAME   = env["DB_NAME"]
MYGENIE   = env["MYGENIE_API_URL"]
LOGIN_EP  = env["MYGENIE_LOGIN_ENDPOINT"]

PASSWORD   = sys.argv[sys.argv.index("--password") + 1] if "--password" in sys.argv else "Qplazm@10"
SINGLE_RID = sys.argv[sys.argv.index("--restaurant") + 1] if "--restaurant" in sys.argv else None

db    = MongoClient(MONGO_URL)[DB_NAME]
query = {"id": f"pos_0001_restaurant_{SINGLE_RID}"} if SINGLE_RID else {}
users = list(db.users.find(query, {"_id":0,"id":1,"email":1}))
print(f"Restaurants to process: {len(users)}")

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
    crm_token = body.get("crm_token")
    if not crm_token:
        print(f"  FAIL  {email}: no crm_token (keys: {list(body.keys())})")
        fail += 1
        continue

    db.users.update_one({"id": rid}, {"$set": {"mygenie_token": crm_token}})
    print(f"  OK    {email}  token: {crm_token[:20]}...")
    ok += 1
    time.sleep(0.2)

print(f"\nResult: ok={ok}  fail={fail}  skip={skip}")
db.client.close()
