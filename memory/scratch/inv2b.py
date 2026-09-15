import os, asyncio, re
from dotenv import load_dotenv; load_dotenv('/app/backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient
async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]; O=db.orders
    U={"customer_id":{"$in":[None,""]}}
    # distinguishing: migration docs carry 'migrated'/'source' ? check key presence differences
    u=await O.find_one(U,{"_id":0}); l=await O.find_one({"customer_id":{"$nin":[None,""]},"loyalty_idempotency_key":{"$exists":True}},{"_id":0})
    print("keys only in unlinked sample:", sorted(set(u)-set(l))); print("keys only in linked sample:", sorted(set(l)-set(u)))
    for k in ["migration_source","migrated_at","source","sync_batch_id","is_migrated"]:
        n=await O.count_documents({**U,k:{"$exists":True}});  print(f" unlinked with {k}: {n}") if n else None
    print("unlinked w/ loyalty_idempotency_key (realtime marker):", await O.count_documents({**U,"loyalty_idempotency_key":{"$exists":True}}))
    print("linked   w/ loyalty_idempotency_key:", await O.count_documents({"customer_id":{"$nin":[None,""]},"loyalty_idempotency_key":{"$exists":True}}))
    print("unlinked cust_mobile empty-string:", await O.count_documents({**U,"cust_mobile":""}), "| null/missing:", await O.count_documents({**U,"cust_mobile":None}))
    print("unlinked by tenant (top 5):", [(r["_id"][-6:],r["n"]) for r in await O.aggregate([{"$match":U},{"$group":{"_id":"$user_id","n":{"$sum":1}}},{"$sort":{"n":-1}},{"$limit":5}]).to_list(5)])
    # duplicate customers per tenant by last-10 digits (python side)
    from collections import defaultdict
    g=defaultdict(set)
    async for c in db.customers.find({"phone":{"$type":"string"}},{"_id":0,"user_id":1,"phone":1,"id":1}):
        d=re.sub(r'\D','',c["phone"])[-10:]
        if len(d)==10: g[(c["user_id"],d)].add(c["id"])
    dups={k:v for k,v in g.items() if len(v)>1}
    print(f"customers: {sum(len(v) for v in g.values())} | tenant+last10 groups with >1 record: {len(dups)} (extra records: {sum(len(v)-1 for v in dups.values())})")
    # orders spread across duplicate customers
    split=0
    for k,ids in list(dups.items())[:200]:
        cnt=[await O.count_documents({"customer_id":i}) for i in ids]
        if sum(1 for c in cnt if c>0)>1: split+=1
    print(f"of first 200 dup groups, groups whose orders are SPLIT across 2+ customer records: {split}")
    # customers w/ non-10-digit phone that have orders
    n=0
    async for c in db.customers.find({"phone":{"$not":{"$regex":"^\\d{10}$"}},"phone":{"$type":"string"}},{"_id":0,"id":1}).limit(300):
        if await O.count_documents({"customer_id":c["id"]})>0: n+=1
    print("customers with non-10-digit phone that own orders (of 300 sampled):", n)
asyncio.run(main())
