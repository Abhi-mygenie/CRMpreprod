"""
P1 one-time migration: drop legacy whatsapp_templates + automation_rules collections.

These collections are unused at runtime (confirmed in Addendum A 2.2) but
still hold rows from past signups. Drop them after P1 deploy goes green.

Run manually:
    cd /app/backend && python3 migrations/p1_drop_legacy_whatsapp.py
"""
import asyncio
import os
import sys

from dotenv import load_dotenv
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent.parent / ".env")


async def main():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        print("ERROR: MONGO_URL or DB_NAME not set", file=sys.stderr)
        sys.exit(1)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print(f"Connected to {db_name}")

    tpl_count = await db.whatsapp_templates.count_documents({})
    rule_count = await db.automation_rules.count_documents({})
    print(f"whatsapp_templates: {tpl_count} rows")
    print(f"automation_rules:   {rule_count} rows")

    if tpl_count == 0 and rule_count == 0:
        print("Both collections already empty. Nothing to drop.")
        return

    # Auto-confirm for non-interactive execution (P1 D-3: immediate drop)
    await db.whatsapp_templates.drop()
    await db.automation_rules.drop()
    print("Both collections dropped.")

    remaining = await db.list_collection_names()
    assert "whatsapp_templates" not in remaining
    assert "automation_rules" not in remaining
    print("Verified: collections no longer in DB.")


if __name__ == "__main__":
    asyncio.run(main())
