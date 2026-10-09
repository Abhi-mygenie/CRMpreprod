import os, asyncio
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient

KEYS = ["showCallWaiter", "showPayBill", "showLandingCallWaiter", "showLandingPayBill"]

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=8000)
    db = c[os.environ['DB_NAME']]
    total = await db.customer_app_config.count_documents({})
    print("customer_app_config docs:", total)
    for k in KEYS:
        t = await db.customer_app_config.count_documents({k: True})
        f = await db.customer_app_config.count_documents({k: False})
        miss = await db.customer_app_config.count_documents({k: {"$exists": False}})
        print(f"{k:24} True={t} False={f} missing={miss}")
    proj = {"_id": 0, "restaurant_id": 1}
    proj.update({k: 1 for k in KEYS})
    docs = await db.customer_app_config.find({"$or": [{k: True} for k in KEYS]}, proj).to_list(100)
    print("\nrestaurants with any flag TRUE:", len(docs))
    for d in docs:
        print(" ", d)

asyncio.run(main())
