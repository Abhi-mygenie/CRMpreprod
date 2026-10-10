import os, asyncio, sys, collections
from dotenv import load_dotenv; load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")
from motor.motor_asyncio import AsyncIOMotorClient
from core.phone import normalize_phone

JUNK_RE = r"^(\d)\1{5,}$|^1234567890$|^0123456789$"

async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0, "id": 1, "restaurant_name": 1, "name": 1, "email": 1, "last_login": 1, "restaurant_id": 1, "created_at": 1}).to_list(200)}
    def nm(uid): u = users.get(uid, {}); return u.get("restaurant_name") or u.get("name") or uid

    print("=== Q1 recoverable orphans by restaurant ===")
    rec = await db.orders.aggregate([
        {"$match": {"customer_id": None, "pos_customer_id": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$user_id", "n": {"$sum": 1}, "amt": {"$sum": "$order_amount"}, "first": {"$min": "$order_created_at"}, "last": {"$max": "$order_created_at"}, "pids": {"$addToSet": "$pos_customer_id"}}},
        {"$sort": {"amt": -1}}]).to_list(100)
    for r in rec:
        uid = r["_id"]; pids = r["pids"]
        variants = []
        for p in pids:
            variants += [p, str(p)]
            if str(p).isdigit(): variants.append(int(p))
        have = await db.customers.distinct("pos_customer_id", {"user_id": uid, "pos_customer_id": {"$in": variants}})
        have_s = {str(x) for x in have}
        matched_pids = sum(1 for p in pids if str(p) in have_s)
        cs = await db.customers.count_documents({"user_id": uid})
        last_cs = await db.migration_sync_logs.find_one({"user_id": uid, "sync_type": "customer_sync"}, sort=[("started_at", -1)])
        print(f"{nm(uid)[:28]:28} | uid={uid[-4:]} | orders={r['n']:5} | ₹{round(r['amt']):>10,} | distinct POS cust={len(pids):4} | already in CRM={matched_pids:4} | CRM customers={cs:5} | last cust_sync={(last_cs or {}).get('started_at','never')[:10]} {(last_cs or {}).get('status','')} | {str(r['first'])[:10]}→{str(r['last'])[:10]}")

    print("\n=== Q2 per-restaurant cleanup candidates (junk / dup / nullcc / blank) ===")
    junk = await db.customers.aggregate([{"$match": {"phone": {"$regex": JUNK_RE}}}, {"$group": {"_id": "$user_id", "n": {"$sum": 1}, "pid": {"$sum": {"$cond": [{"$gt": ["$pos_customer_id", None]}, 1, 0]}}, "phones": {"$addToSet": "$phone"}}}]).to_list(100)
    # include 11-digit / non 10-digit invalid
    allc = db.customers.find({"phone": {"$nin": [None, ""]}}, {"_id": 0, "user_id": 1, "phone": 1, "country_code": 1, "pos_customer_id": 1, "id": 1, "name": 1, "total_visits": 1, "total_points": 1})
    inv = collections.defaultdict(list)
    async for c in allc:
        ph, cc, st = normalize_phone(c["phone"], c.get("country_code"))
        if st == "invalid":
            inv[c["user_id"]].append(c)
    dups = await db.customers.aggregate([{"$match": {"phone": {"$nin": [None, ""]}}}, {"$group": {"_id": {"u": "$user_id", "p": "$phone"}, "n": {"$sum": 1}, "ccs": {"$addToSet": "$country_code"}, "pts": {"$sum": "$total_points"}, "vis": {"$sum": "$total_visits"}}}, {"$match": {"n": {"$gt": 1}}}, {"$group": {"_id": "$_id.u", "groups": {"$sum": 1}, "true_dup": {"$sum": {"$cond": [{"$eq": [{"$size": "$ccs"}, 1]}, 1, 0]}}, "with_data": {"$sum": {"$cond": [{"$or": [{"$gt": ["$pts", 0]}, {"$gt": ["$vis", 0]}]}, 1, 0]}}}}]).to_list(100)
    dmap = {d["_id"]: d for d in dups}
    ncc = {d["_id"]: d["n"] for d in await db.customers.aggregate([{"$match": {"country_code": {"$in": [None, ""]}}}, {"$group": {"_id": "$user_id", "n": {"$sum": 1}}}]).to_list(100)}
    blank = {d["_id"]: d["n"] for d in await db.customers.aggregate([{"$match": {"phone": {"$in": [None, ""]}}}, {"$group": {"_id": "$user_id", "n": {"$sum": 1}}}]).to_list(100)}
    tenants = set(inv) | set(dmap) | set(ncc) | set(blank)
    rows = []
    for t in tenants:
        iv = inv.get(t, []); d = dmap.get(t, {})
        rows.append((nm(t), t[-4:], len(iv), sum(1 for c in iv if c.get("pos_customer_id")), sum(1 for c in iv if (c.get("total_visits") or 0) > 0 or (c.get("total_points") or 0) > 0), d.get("groups", 0), d.get("true_dup", 0), d.get("with_data", 0), ncc.get(t, 0), blank.get(t, 0)))
    rows.sort(key=lambda r: -(r[2] + r[5] + r[8] + r[9]))
    print("restaurant | uid | invalid_phone (from POS, with activity) | dup groups (true, with data) | null_cc | blank_phone")
    for r in rows:
        print(f"{r[0][:28]:28} | {r[1]} | {r[2]:3} ({r[3]:3} POS, {r[4]:3} active) | {r[5]:3} ({r[6]:3} true, {r[7]:3} data) | {r[8]:4} | {r[9]:3}")
    print("TOTAL invalid", sum(r[2] for r in rows), "dups", sum(r[5] for r in rows), "nullcc", sum(r[8] for r in rows), "blank", sum(r[9] for r in rows), "tenants", len(rows))

    print("\n=== Q4 CSV importer usage (import_logs) ===")
    async for il in db.import_logs.find({}, {"_id": 0}):
        print({k: il.get(k) for k in ["user_id", "created_at", "filename", "total_rows", "imported_count", "updated_count", "failed_count"]}, nm(il.get("user_id", "")))
    print("invalid-phone customers WITHOUT pos_customer_id (CRM-originated: importer/UI/old realtime):")
    for t, lst in inv.items():
        no = [c for c in lst if not c.get("pos_customer_id")]
        if no:
            print(f"  {nm(t)[:28]:28} {len(no):3}  e.g. {[ (c['phone'], c.get('name'), c.get('total_visits')) for c in no[:3]]}")

    print("\n=== Q5 restaurants by CRM login recency vs sync ===")
    out = []
    for uid, u in users.items():
        ll = (u.get("last_login") or "never")[:10]
        cs = await db.migration_sync_logs.find_one({"user_id": uid}, sort=[("started_at", -1)])
        oc = await db.orders.count_documents({"user_id": uid})
        rt = await db.orders.count_documents({"user_id": uid, "pos_id": {"$ne": "mygenie"}, "created_at": {"$gte": "2026-09-01"}})
        cc = await db.customers.count_documents({"user_id": uid})
        out.append((ll, nm(uid), uid[-4:], cc, oc, rt, (cs or {}).get("started_at", "never")[:10], (cs or {}).get("status", ""), (cs or {}).get("error", "") or ""))
    out.sort()
    print("last_login | restaurant | uid | customers | orders | realtime orders since Sep | last sync | status | error")
    for o in out:
        print(f"{o[0]} | {o[1][:26]:26} | {o[2]} | {o[3]:5} | {o[4]:6} | {o[5]:5} | {o[6]} | {o[7]:9} | {o[8][:30]}")

asyncio.run(main())
