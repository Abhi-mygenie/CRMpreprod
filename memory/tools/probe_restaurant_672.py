import os, asyncio
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=8000)
    db = c[os.environ['DB_NAME']]
    d = await db.customer_app_config.find_one({"restaurant_id": "672"}, {"_id": 0})
    if not d:
        print("no config doc for 672")
        return
    for k in ["restaurant_id", "restaurantName", "name", "welcomeMessage", "tagline",
              "updated_at", "created_at", "showLandingPayBill", "showPayBill",
              "showCallWaiter", "showLandingCallWaiter", "restaurantOpen",
              "allowNonQrOrders", "logoUrl"]:
        if k in d:
            print(f"{k:22} = {d[k]!r}")
    print("total keys:", len(d))
    # activity signals
    u = await db.users.find_one({"restaurant_id": "672"}, {"_id": 0, "restaurant_name": 1, "email": 1})
    print("users row:", {"restaurant_name": (u or {}).get("restaurant_name")} if u else None)
    print("orders for 672:", await db.orders.count_documents({"user_id": "pos_0001_restaurant_672"}))
    print("customers for 672:", await db.customers.count_documents({"user_id": "pos_0001_restaurant_672"}))
    print("loyalty_settings:", "yes" if await db.loyalty_settings.find_one({"user_id": "pos_0001_restaurant_672"}) else "no")

asyncio.run(main())
