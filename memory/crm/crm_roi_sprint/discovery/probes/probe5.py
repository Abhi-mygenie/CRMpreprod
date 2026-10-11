import os, asyncio, sys
from dotenv import load_dotenv; load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")
from motor.motor_asyncio import AsyncIOMotorClient
from core.phone import normalize_phone, phone_match

async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    for uid in ["pos_0001_restaurant_541", "pos_0001_restaurant_628", "pos_0001_restaurant_699", "pos_0001_restaurant_196"]:
        orph = await db.orders.find({"user_id": uid, "customer_id": None, "pos_customer_id": {"$nin": [None, ""]}}, {"_id": 0, "pos_customer_id": 1, "cust_mobile": 1, "cust_name": 1, "order_created_at": 1}).limit(400).to_list(400)
        by_phone = pid_space = 0; seen = set(); ex = []
        for o in orph:
            if o["pos_customer_id"] in seen: continue
            seen.add(o["pos_customer_id"])
            ph, cc, st = normalize_phone(o.get("cust_mobile"))
            if st == "invalid": continue
            c = await db.customers.find_one(phone_match(uid, ph, cc), {"_id": 0, "pos_customer_id": 1, "name": 1})
            if c:
                by_phone += 1
                if str(c.get("pos_customer_id")) != str(o["pos_customer_id"]): pid_space += 1
                if len(ex) < 3: ex.append((o["pos_customer_id"], c.get("pos_customer_id"), o.get("cust_name"), c.get("name")))
        # pos_customer_id ranges
        pids = sorted(int(p) for p in seen if str(p).isdigit())
        cpids = await db.customers.distinct("pos_customer_id", {"user_id": uid, "pos_customer_id": {"$nin": [None, ""]}})
        cp = sorted(int(p) for p in cpids if str(p).isdigit())
        print(uid, "distinct orphan pids", len(seen), "phone-matched to CRM customer", by_phone, "of which pid differs", pid_space, "examples(order_pid, crm_pid, names)", ex)
        print("   orphan pid range", (pids[0], pids[-1]) if pids else None, "| CRM customer pid range", (cp[0], cp[-1]) if cp else None, "n", len(cp))
    print("phone_invalid in frontend?")
asyncio.run(main())
