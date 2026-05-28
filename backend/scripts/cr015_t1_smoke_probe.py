"""CR-015 T1 — Live smoke probe (READ-ONLY).

Calls get_event_template_config(db, R689, 'send_bill') against the real remote
DB to confirm Bug #1 is now resolved. No writes.
"""
import asyncio
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from core.whatsapp import get_event_template_config  # noqa: E402


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=10000)
    db = client[os.environ["DB_NAME"]]
    R689 = "pos_0001_restaurant_689"

    print("\n=== CR-015 T1 LIVE SMOKE PROBE ===\n")
    for event_key in ("send_bill", "send_bill_auto", "send_bill_manual"):
        cfg = await get_event_template_config(db, R689, event_key)
        if cfg is None:
            print(f"[{event_key}] → None (not configured)")
            continue
        mappings = cfg.get("variable_mappings") or {}
        modes = cfg.get("variable_modes") or {}
        print(f"[{event_key}]")
        print(f"  template_id      = {cfg['template_id']!r} (type={type(cfg['template_id']).__name__})")
        print(f"  template_name    = {cfg['template_name']!r}")
        print(f"  is_enabled       = {cfg['is_enabled']}")
        print(f"  mappings ({len(mappings)} slots):")
        for slot in sorted(mappings.keys(), key=lambda s: int(s.strip('{}') or 0)):
            mode = modes.get(slot, "map")
            print(f"    {slot:8s} mode={mode:12s} → {mappings[slot]!r}")
        print()

    print("=== VERDICT ===")
    print("Pre-T1: send_bill returned variable_mappings={} (empty) due to int/str mismatch.")
    print("Post-T1: send_bill should now return ALL 7 slot mappings (matching template 25140).")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
