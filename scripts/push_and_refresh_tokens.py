#!/usr/bin/env python3
"""
CR-110 Part 2: Push CRM api_key to preprod MyGenie for restaurants that
had crm_token:null (registered on prod but not on preprod), then refresh
mygenie_token from the now-non-null crm_token in login response.

Usage:
  python3 /app/scripts/push_and_refresh_tokens.py
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
PASSWORD  = sys.argv[sys.argv.index("--password") + 1] if "--password" in sys.argv else "Qplazm@10"

db = MongoClient(MONGO_URL)[DB_NAME]

# Only process restaurants that still have stale tokens (not dp_live_ format)
stale = list(db.users.find(
    {},
    {"_id":0,"id":1,"email":1,"api_key":1,"restaurant_id":1}
))
stale = [u for u in stale
         if not (u.get("mygenie_token","") or "").startswith("dp_live_")
         and u.get("api_key") and u.get("restaurant_id")]

print(f"Restaurants needing push+refresh: {len(stale)}")

push_ok = push_fail = refresh_ok = refresh_fail = skip = 0

for u in stale:
    email      = u.get("email","")
    rid        = u.get("id","")
    api_key    = u.get("api_key","")
    rest_id    = u.get("restaurant_id","")

    if not email or not rid or not api_key:
        skip += 1; continue

    # Step 1 — login → get session token
    r1 = requests.post(f"{MYGENIE}{LOGIN_EP}",
                       json={"email": email, "password": PASSWORD}, timeout=15)
    if r1.status_code != 200:
        print(f"  SKIP  {email}: login HTTP {r1.status_code}")
        skip += 1; time.sleep(0.3); continue

    session = r1.json().get("token")
    if not session:
        print(f"  SKIP  {email}: no session token")
        skip += 1; continue

    # Step 2 — push CRM api_key to preprod MyGenie
    r2 = requests.post(
        f"{MYGENIE}{TOKEN_EP}",
        json={"restaurant_id": rest_id, "crm_token": api_key},
        headers={"Authorization": f"Bearer {session}", "Content-Type": "application/json"},
        timeout=15,
    )
    push_success = r2.status_code in (200, 201, 409)
    if not push_success:
        print(f"  PUSH-FAIL  {email}: HTTP {r2.status_code} {r2.text[:80]}")
        push_fail += 1; time.sleep(0.3); continue
    push_ok += 1

    # Step 3 — login again → crm_token should now be non-null
    time.sleep(0.3)
    r3 = requests.post(f"{MYGENIE}{LOGIN_EP}",
                       json={"email": email, "password": PASSWORD}, timeout=15)
    crm_token = r3.json().get("crm_token") if r3.status_code == 200 else None
    if not crm_token:
        print(f"  REFRESH-FAIL  {email}: crm_token still null after push")
        refresh_fail += 1; continue

    # Step 4 — store fresh mygenie_token
    db.users.update_one({"id": rid}, {"$set": {"mygenie_token": crm_token}})
    print(f"  OK  {email}  token: {crm_token[:20]}...")
    refresh_ok += 1
    time.sleep(0.2)

print(f"\nResult: push_ok={push_ok}  push_fail={push_fail}  refresh_ok={refresh_ok}  refresh_fail={refresh_fail}  skip={skip}")
db.client.close()
