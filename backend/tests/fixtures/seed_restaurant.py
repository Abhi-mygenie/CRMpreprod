# CR-2026-09-12-005: seed verification — confirms test restaurants exist in UAT Mongo.
# Phase 1 = read-only check.
# Phase 2 will add ephemeral Mongo service container + write isolation.

from motor.motor_asyncio import AsyncIOMotorClient
import os


async def verify_test_restaurants(mongo_url: str, db_name: str) -> None:
    """Assert that restaurant_id 478 and 716 have config docs in UAT Mongo.

    Raises RuntimeError if either is missing — prevents tests running
    against an empty or wrong database.
    """
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
    db = client[db_name]
    try:
        for rid in [478, 716]:
            doc = await db.customer_app_config.find_one({"restaurant_id": rid})
            if not doc:
                raise RuntimeError(
                    f"Seed check: restaurant_id {rid} not found in Mongo db '{db_name}'. "
                    f"Tests require UAT data for restaurants 478 and 716."
                )
    finally:
        client.close()
