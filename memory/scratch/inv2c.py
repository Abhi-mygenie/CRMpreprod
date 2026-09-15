import os, asyncio
from dotenv import load_dotenv; load_dotenv('/app/backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient
async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]; O=db.orders
    q={"customer_id":{"$in":[None,""]},"loyalty_idempotency_key":{"$exists":True}}
    print("realtime-unlinked: with phone:", await O.count_documents({**q,"cust_mobile":{"$ne":""}}), "| empty phone:", await O.count_documents({**q,"cust_mobile":""}))
    d=await O.find_one({**q,"cust_mobile":{"$ne":""}},{"_id":0,"cust_mobile":1,"created_at":1,"user_id":1})
    if d: print(" sample: phone_len", len(d["cust_mobile"]), "tenant", d["user_id"][-6:], d["created_at"][:10])
    # migration-unlinked with phone: how many phones DO exist as customer in a different format (last10)?
    import re
    n=m=0
    async for o in O.find({"customer_id":{"$in":[None,""]},"cust_mobile":{"$ne":""}},{"_id":0,"user_id":1,"cust_mobile":1}).limit(120):
        n+=1; d10=re.sub(r'\D','',o["cust_mobile"])[-10:]
        if len(d10)==10 and await db.customers.find_one({"user_id":o["user_id"],"phone":{"$regex":d10+"$"}},{"_id":0,"id":1}): m+=1
    print(f"unlinked-with-phone: {m}/{n} have a same-tenant customer matching last-10 digits (fixable by normalised backfill); rest have NO customer record at all")
asyncio.run(main())
