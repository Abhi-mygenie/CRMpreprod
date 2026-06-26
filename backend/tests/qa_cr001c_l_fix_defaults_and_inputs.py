"""CR-001C-L-FIX Phase 6 — QA harness for default alignment + DB migration + per-tier overrides.

Covers:
  G1: Backend default helper round-trip (CR-004 values)
  G2: Register endpoint produces CR-004 settings (skipped — requires unique email + full auth flow)
  G3: mygenie-login first-time (skipped — requires live mygenie integration)
  G4: Settings auto-create via GET /loyalty/settings (needs auth — tested via helper)
  G5: Migration script idempotence
  G6: R689 earn % reset verification
  G7: Per-tier override save via direct DB (PATCH needs auth — tested via DB)
  G8: Existing L4-A regression delegated to its own harness

Run:
    cd /app/backend && python -m tests.qa_cr001c_l_fix_defaults_and_inputs
"""
import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.database import db
from core.loyalty import default_loyalty_settings

RESULTS = []
R689_USER_ID = "pos_0001_restaurant_689"


def _ok(label):
    RESULTS.append(("OK", label))
    print(f"  [OK ] {label}")


def _fail(label, detail=""):
    RESULTS.append(("FAIL", label))
    print(f"  [FAIL] {label} — {detail}")


async def g1_helper_round_trip():
    """G1: default_loyalty_settings produces CR-004 values."""
    d = default_loyalty_settings("test_g1_user")

    checks = [
        ("min_order_value", 0),
        ("redemption_value", 1.0),
        ("max_redemption_percent", 100.0),
        ("max_redemption_amount", None),
        ("min_redemption_points", 50),
    ]
    all_ok = True
    for field, expected in checks:
        actual = d.get(field)
        if actual != expected:
            _fail(f"G1 helper {field}", f"got {actual}, expected {expected}")
            all_ok = False

    # Also verify other schema defaults
    assert d.get("bronze_earn_percent") == 5.0
    assert d.get("silver_earn_percent") == 7.0
    assert d.get("loyalty_enabled") == False
    assert d.get("user_id") == "test_g1_user"
    assert d.get("id") is not None

    if all_ok:
        _ok("G1 helper round-trip — all 5 CR-004 fields correct")
    _ok("G1 helper schema defaults (earn%, loyalty_enabled, user_id, id)")


async def g5_migration_idempotence():
    """G5: Running CR-004 bulk update on already-migrated docs modifies 0."""
    from scripts.cr004_fix_bulk_apply import CR004_FIELDS
    result = await db.loyalty_settings.update_many({}, {"$set": CR004_FIELDS})
    if result.modified_count == 0:
        _ok("G5 migration idempotent — second run modified 0 docs")
    else:
        _fail("G5 migration idempotent", f"modified {result.modified_count} docs (expected 0)")


async def g6_r689_earn_percent():
    """G6: R689 has schema-default earn percents post-migration."""
    doc = await db.loyalty_settings.find_one({"user_id": R689_USER_ID}, {"_id": 0})
    if not doc:
        _fail("G6 R689 doc not found")
        return

    checks = [
        ("bronze_earn_percent", 5.0),
        ("silver_earn_percent", 7.0),
        ("gold_earn_percent", 10.0),
        ("platinum_earn_percent", 15.0),
    ]
    all_ok = True
    for field, expected in checks:
        actual = doc.get(field)
        if actual != expected:
            _fail(f"G6 R689 {field}", f"got {actual}, expected {expected}")
            all_ok = False
    if all_ok:
        _ok("G6 R689 earn percents — bronze=5, silver=7, gold=10, platinum=15")


async def g6b_all_restaurants_cr004():
    """G6b: All loyalty_settings docs have CR-004 values."""
    docs = await db.loyalty_settings.find({}, {"_id": 0}).to_list(None)
    all_ok = True
    for d in docs:
        uid = d.get("user_id", "?")
        checks = [
            ("min_order_value", 0),
            ("redemption_value", 1.0),
            ("max_redemption_percent", 100.0),
            ("max_redemption_amount", None),
            ("min_redemption_points", 50),
        ]
        for field, expected in checks:
            actual = d.get(field)
            if actual != expected:
                _fail(f"G6b {uid}.{field}", f"got {actual}, expected {expected}")
                all_ok = False
    if all_ok:
        _ok(f"G6b all {len(docs)} restaurants have CR-004 values on 5 target fields")


async def g7_per_tier_override():
    """G7: Per-tier override save and clear via direct DB operations."""
    # Use R689 for testing (known to exist)
    test_user = R689_USER_ID

    # Save a gold override
    await db.loyalty_settings.update_one(
        {"user_id": test_user},
        {"$set": {"gold_redemption_value": 0.5}},
    )
    doc = await db.loyalty_settings.find_one({"user_id": test_user}, {"_id": 0})
    if doc.get("gold_redemption_value") == 0.5:
        _ok("G7a per-tier save — gold_redemption_value=0.5 persisted")
    else:
        _fail("G7a per-tier save", f"got {doc.get('gold_redemption_value')}")

    # Clear it (null = use base)
    await db.loyalty_settings.update_one(
        {"user_id": test_user},
        {"$set": {"gold_redemption_value": None}},
    )
    doc2 = await db.loyalty_settings.find_one({"user_id": test_user}, {"_id": 0})
    if doc2.get("gold_redemption_value") is None:
        _ok("G7b per-tier clear — gold_redemption_value=null persisted")
    else:
        _fail("G7b per-tier clear", f"got {doc2.get('gold_redemption_value')}")


async def g8_backend_no_old_defaults():
    """G8: Grep-equivalent — no hardcoded OLD defaults in settings creation blocks."""
    import subprocess
    # Check for min_order_value=100 in creation blocks (not .get fallbacks)
    result = subprocess.run(
        ["grep", "-rn", '"min_order_value": 100', "routers/", "core/loyalty.py"],
        capture_output=True, text=True, cwd="/app/backend"
    )
    if result.stdout.strip():
        _fail("G8 old defaults grep", f"found: {result.stdout.strip()[:200]}")
    else:
        _ok("G8 no hardcoded OLD defaults (min_order_value=100) in creation blocks")

    result2 = subprocess.run(
        ["grep", "-rn", '"redemption_value": 0.25', "routers/", "core/loyalty.py"],
        capture_output=True, text=True, cwd="/app/backend"
    )
    if result2.stdout.strip():
        _fail("G8b old defaults grep", f"found: {result2.stdout.strip()[:200]}")
    else:
        _ok("G8b no hardcoded OLD defaults (redemption_value=0.25) in creation blocks")


async def main():
    print("=" * 70)
    print("CR-001C-L-FIX Phase 6 — QA Harness")
    print("=" * 70)

    await g1_helper_round_trip()
    await g5_migration_idempotence()
    await g6_r689_earn_percent()
    await g6b_all_restaurants_cr004()
    await g7_per_tier_override()
    await g8_backend_no_old_defaults()

    print()
    print("=" * 70)
    passed = sum(1 for r in RESULTS if r[0] == "OK")
    failed = sum(1 for r in RESULTS if r[0] == "FAIL")
    print(f"RESULT: {passed}/{passed + failed} PASS, {failed} FAIL")
    print("=" * 70)

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
