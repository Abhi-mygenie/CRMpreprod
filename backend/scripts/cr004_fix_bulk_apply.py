"""CR-001C-L-FIX Phase 2: Bulk-apply CR-004 defaults to all existing loyalty_settings docs.

Strategy: BULK (Q1=B) — forcibly overwrite all 5 CR-004 fields on every restaurant.
Owner-confirmed acceptable to trample any prior customisation.

Additional one-shot per Q2=B: reset R689's anomalous earn percents to schema defaults.

Usage:
    cd /app/backend && python3 scripts/cr004_fix_bulk_apply.py
    cd /app/backend && python3 scripts/cr004_fix_bulk_apply.py --restore /tmp/loyalty_settings_pre_cr004fix_backup.json

Pre-backup is written to /tmp/loyalty_settings_pre_cr004fix_backup.json before any mutation.
"""
import asyncio
import json
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.database import db

BACKUP_PATH = "/tmp/loyalty_settings_pre_cr004fix_backup.json"

# R689 user_id (known from investigation)
R689_USER_ID = "pos_0001_restaurant_689"

# CR-004 compliant values (sourced from LoyaltySettings Pydantic schema defaults)
CR004_FIELDS = {
    "min_order_value": 0,
    "redemption_value": 1.0,
    "max_redemption_percent": 100.0,
    "max_redemption_amount": None,
    "min_redemption_points": 50,
}

# R689 earn-% reset (Q2=B: schema defaults)
R689_EARN_RESET = {
    "bronze_earn_percent": 5.0,
    "silver_earn_percent": 7.0,
    "gold_earn_percent": 10.0,
    "platinum_earn_percent": 15.0,
}


async def backup():
    """Backup all loyalty_settings docs to JSON for emergency restore."""
    docs = await db.loyalty_settings.find({}, {"_id": 0}).to_list(None)
    with open(BACKUP_PATH, "w") as f:
        json.dump(docs, f, indent=2, default=str)
    print(f"[BACKUP] {len(docs)} docs saved to {BACKUP_PATH}")
    return docs


async def apply_cr004():
    """Bulk-apply CR-004 fields to all loyalty_settings docs."""
    result = await db.loyalty_settings.update_many({}, {"$set": CR004_FIELDS})
    print(f"[CR-004] Matched {result.matched_count}, modified {result.modified_count} restaurants")
    return result.modified_count


async def reset_r689():
    """Reset R689's anomalous earn percents to schema defaults (Q2=B)."""
    result = await db.loyalty_settings.update_one(
        {"user_id": R689_USER_ID},
        {"$set": R689_EARN_RESET},
    )
    if result.modified_count > 0:
        print(f"[R689] Earn percents reset to schema defaults (bronze=5, silver=7, gold=10, platinum=15)")
    else:
        print(f"[R689] No change (already at defaults or user_id not found)")
    return result.modified_count


async def verify():
    """Post-migration verification."""
    docs = await db.loyalty_settings.find({}, {"_id": 0}).to_list(None)
    all_ok = True
    for d in docs:
        uid = d.get("user_id", "?")
        for field, expected in CR004_FIELDS.items():
            actual = d.get(field)
            if actual != expected:
                print(f"  [FAIL] {uid}.{field} = {actual} (expected {expected})")
                all_ok = False

    # R689 specific check
    r689 = next((d for d in docs if d.get("user_id") == R689_USER_ID), None)
    if r689:
        for field, expected in R689_EARN_RESET.items():
            actual = r689.get(field)
            if actual != expected:
                print(f"  [FAIL] R689.{field} = {actual} (expected {expected})")
                all_ok = False
    else:
        print("  [WARN] R689 doc not found for earn-% verification")

    if all_ok:
        print(f"[VERIFY] All {len(docs)} docs pass CR-004 + R689 checks")
    else:
        print("[VERIFY] FAILURES detected — see above")
    return all_ok


async def restore(backup_path: str):
    """Restore loyalty_settings from backup JSON."""
    with open(backup_path, "r") as f:
        docs = json.load(f)

    for doc in docs:
        user_id = doc.get("user_id")
        if not user_id:
            continue
        # Remove _id if present (shouldn't be, but defensive)
        doc.pop("_id", None)
        await db.loyalty_settings.replace_one(
            {"user_id": user_id},
            doc,
            upsert=True,
        )
    print(f"[RESTORE] {len(docs)} docs restored from {backup_path}")


async def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--restore":
        await restore(sys.argv[2])
        return

    # Step 1: Backup
    pre_docs = await backup()

    # Step 2: Bulk-apply CR-004
    cr004_count = await apply_cr004()

    # Step 3: R689 earn-% reset
    r689_count = await reset_r689()

    # Step 4: Verify
    ok = await verify()

    # Step 5: Idempotency check (run again — should modify 0)
    cr004_count_2 = await apply_cr004()
    r689_count_2 = await reset_r689()
    print(f"[IDEMPOTENCY] Second run: CR-004 modified={cr004_count_2}, R689 modified={r689_count_2}")
    if cr004_count_2 == 0 and r689_count_2 == 0:
        print("[IDEMPOTENCY] PASS — script is idempotent")
    else:
        print("[IDEMPOTENCY] WARN — second run still modified docs (unexpected)")

    print()
    print(f"=== MIGRATION COMPLETE ===")
    print(f"  Backup: {BACKUP_PATH}")
    print(f"  CR-004 applied: {cr004_count} restaurants")
    print(f"  R689 reset: {'yes' if r689_count > 0 else 'already at defaults'}")
    print(f"  Verification: {'PASS' if ok else 'FAIL'}")


if __name__ == "__main__":
    asyncio.run(main())
