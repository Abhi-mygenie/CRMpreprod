"""
CR-034 — One-time backfill migration
Auto-add "VIP" tag to all customers with vip_flag=True.
Also updates each affected user's available_tags catalog.
Idempotent — $addToSet never duplicates. Safe to re-run.

Run:
    cd /app/backend && python migrations/cr034_vip_flag_to_tag.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

async def run():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # Step 1: tag all vip_flag=True customers with "VIP"
    result = await db.customers.update_many(
        {"vip_flag": True},
        {"$addToSet": {"tags": "VIP"}}
    )
    print(f"[CR-034] Tagged {result.modified_count} customers with 'VIP' (matched: {result.matched_count})")

    # Step 2: collect distinct user_ids of affected tenants
    affected_user_ids = await db.customers.distinct("user_id", {"vip_flag": True})
    print(f"[CR-034] Updating available_tags for {len(affected_user_ids)} tenant(s)")

    # Step 3: add "VIP" to each tenant's tag catalog
    for uid in affected_user_ids:
        await db.users.update_one(
            {"id": uid},
            {"$addToSet": {"available_tags": "VIP"}}
        )

    print("[CR-034] Backfill complete.")
    client.close()

if __name__ == "__main__":
    asyncio.run(run())
