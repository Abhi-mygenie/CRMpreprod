"""
CR-015 T7 — Cleanup R689 template 25140 garbage mappings.

Usage:
    python scripts/cr015_t7_cleanup_r689_template_25140.py              # dry-run (default)
    python scripts/cr015_t7_cleanup_r689_template_25140.py --commit     # apply changes

Safety:
    - Aborts if {{4}} is NOT "payment method missing " (someone else already fixed it)
    - Prints before/after for owner review
    - Re-reads after write for verification
"""
import asyncio
import argparse
import json
import os
import sys
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")

USER_ID = "pos_0001_restaurant_689"
TEMPLATE_ID = "25140"

# Expected current state (safety check)
# NOTE: {{4}} and {{5}} were already fixed (via Templates page UI) before this script ran.
# Only {{7}} remains wrong — it duplicates {{6}} (points_earned) instead of points_balance.
EXPECTED_SLOT_7 = "points_earned"

# Proposed corrections ({{4}}/{{5}} removed — already clean)
CORRECTIONS = {
    "{{7}}": {"old": EXPECTED_SLOT_7, "new": "points_balance", "remove_mode": False},
}


async def main(commit: bool):
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    doc = await db.whatsapp_template_variable_map.find_one(
        {"user_id": USER_ID, "template_id": TEMPLATE_ID}, {"_id": 0}
    )

    if not doc:
        print(f"ERROR: Document not found for user_id={USER_ID}, template_id={TEMPLATE_ID}")
        sys.exit(1)

    mappings = doc.get("mappings", {})
    modes = doc.get("modes", {})

    print("=" * 60)
    print("CR-015 T7 — R689 Template 25140 Cleanup")
    print(f"Mode: {'COMMIT' if commit else 'DRY-RUN'}")
    print("=" * 60)

    print("\n--- CURRENT STATE ---")
    print(json.dumps({"mappings": mappings, "modes": modes}, indent=2))

    # Safety checks
    for slot, correction in CORRECTIONS.items():
        current = mappings.get(slot)
        if current != correction["old"]:
            print(f"\nSAFETY ABORT: {slot} is '{current}', expected '{correction['old']}'")
            print("Someone else may have already fixed this. Aborting.")
            sys.exit(2)

    print("\nSafety checks passed. All slots match expected current values.")

    # Build proposed state
    new_mappings = dict(mappings)
    new_modes = dict(modes)

    for slot, correction in CORRECTIONS.items():
        new_mappings[slot] = correction["new"]
        if correction["remove_mode"] and slot in new_modes:
            del new_modes[slot]

    print("\n--- PROPOSED STATE ---")
    print(json.dumps({"mappings": new_mappings, "modes": new_modes}, indent=2))

    print("\n--- DIFF ---")
    for slot, correction in CORRECTIONS.items():
        mode_change = ""
        if correction["remove_mode"]:
            old_mode = modes.get(slot, "map")
            mode_change = f"  mode: {old_mode} -> map (removed from modes)"
        print(f"  {slot}: '{correction['old']}' -> '{correction['new']}'{mode_change}")

    if not commit:
        print("\n[DRY-RUN] No changes written. Run with --commit to apply.")
        return

    # Apply the update
    now = datetime.now(timezone.utc).isoformat()
    result = await db.whatsapp_template_variable_map.update_one(
        {"user_id": USER_ID, "template_id": TEMPLATE_ID},
        {"$set": {
            "mappings": new_mappings,
            "modes": new_modes,
            "updated_at": now,
        }},
    )

    print(f"\n[COMMIT] Update result: matched={result.matched_count}, modified={result.modified_count}")

    # Re-read for verification
    verify = await db.whatsapp_template_variable_map.find_one(
        {"user_id": USER_ID, "template_id": TEMPLATE_ID}, {"_id": 0}
    )
    print("\n--- VERIFIED FINAL STATE ---")
    print(json.dumps({
        "mappings": verify.get("mappings", {}),
        "modes": verify.get("modes", {}),
        "updated_at": verify.get("updated_at"),
    }, indent=2))
    print("\n[COMMIT] Done. T7 cleanup applied successfully.")

    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CR-015 T7: Cleanup R689 template 25140")
    parser.add_argument("--commit", action="store_true", help="Apply changes (default: dry-run)")
    args = parser.parse_args()
    asyncio.run(main(commit=args.commit))
