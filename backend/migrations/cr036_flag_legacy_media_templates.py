"""
CR-036 B.1 · Migration — Flag legacy media templates for re-upload.

Marks custom_templates docs that have a media header_type but no
header_handle and no send_media_url with needs_media_reupload=true.

Safe to run multiple times (idempotent).
Reverse: db.custom_templates.updateMany({needs_media_reupload:true},{$unset:{needs_media_reupload:""}})
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")


async def run():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_inst = client[os.environ["DB_NAME"]]
    result = await db_inst.custom_templates.update_many(
        {
            "header_type": {"$in": ["image", "video", "document"]},
            "header_handle": {"$in": [None, ""]},
            "send_media_url": {"$in": [None, ""]},
            "needs_media_reupload": {"$ne": True},
        },
        {"$set": {"needs_media_reupload": True}},
    )
    print(f"CR-036 MIG: flagged {result.modified_count} templates for re-upload.")
    client.close()


if __name__ == "__main__":
    asyncio.run(run())
