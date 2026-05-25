"""
CR-001C-L L4 Cron-Only QA Harness
Tests birthday bonus and anniversary bonus parity fixes.
Runs against live local server http://localhost:8001.

Usage: python backend/tests/qa_cr001c_l4_cron.py
"""
import asyncio
import sys
import json
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os

# Ensure backend dir is on path for core.* imports
sys.path.insert(0, str(Path(__file__).parent.parent))

load_dotenv(Path(__file__).parent.parent / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Namespace all test data to avoid collisions
NS = "qa_l4_cron_"
USER_ID = f"{NS}user_001"
RESULTS = []
PASS_COUNT = 0
FAIL_COUNT = 0


def record(name, passed, detail=""):
    global PASS_COUNT, FAIL_COUNT
    status = "PASS" if passed else "FAIL"
    if passed:
        PASS_COUNT += 1
    else:
        FAIL_COUNT += 1
    RESULTS.append({"name": name, "status": status, "detail": detail})
    print(f"  {'✅' if passed else '❌'} {name}: {status} {detail}")


async def setup():
    """Create test fixtures."""
    today = datetime.now(timezone.utc).date()
    current_year = today.year

    # User
    await db.users.insert_one({"id": USER_ID, "email": f"{NS}@test.com", "password": "x"})

    # Loyalty settings — loyalty_enabled=True, birthday+anniversary enabled
    await db.loyalty_settings.insert_one({
        "id": f"{NS}settings",
        "user_id": USER_ID,
        "loyalty_enabled": True,
        "birthday_bonus_enabled": True,
        "birthday_bonus_points": 100,
        "birthday_bonus_days_before": 0,
        "birthday_bonus_days_after": 7,
        "anniversary_bonus_enabled": True,
        "anniversary_bonus_points": 150,
        "anniversary_bonus_days_before": 0,
        "anniversary_bonus_days_after": 7,
        "min_order_value": 100.0,
        "bronze_earn_percent": 5.0,
        "silver_earn_percent": 7.0,
        "gold_earn_percent": 10.0,
        "platinum_earn_percent": 15.0,
        "redemption_value": 1.0,
        "tier_silver_min": 500,
        "tier_gold_min": 1500,
        "tier_platinum_min": 5000,
        "points_expiry_months": 6,
    })

    # Customer 1: birthday today, 200 pts Bronze — should get bonus, stay Bronze
    await db.customers.insert_one({
        "id": f"{NS}cust_bday_basic",
        "user_id": USER_ID,
        "name": "Birthday Basic",
        "phone": f"{NS}1001",
        "dob": today.isoformat(),
        "total_points": 200,
        "total_points_earned": 200,
        "total_points_redeemed": 0,
        "tier": "Bronze",
        "total_visits": 5,
        "total_spent": 2000,
    })

    # Customer 2: birthday today, 450 pts Bronze — bonus should push to Silver (450+100=550 >= 500)
    await db.customers.insert_one({
        "id": f"{NS}cust_bday_tier_up",
        "user_id": USER_ID,
        "name": "Birthday Tier Up",
        "phone": f"{NS}1002",
        "dob": today.isoformat(),
        "total_points": 450,
        "total_points_earned": 450,
        "total_points_redeemed": 0,
        "tier": "Bronze",
        "total_visits": 10,
        "total_spent": 5000,
    })

    # Customer 3: birthday today, already got bonus this year — should be skipped
    await db.customers.insert_one({
        "id": f"{NS}cust_bday_dup",
        "user_id": USER_ID,
        "name": "Birthday Dup",
        "phone": f"{NS}1003",
        "dob": today.isoformat(),
        "total_points": 100,
        "total_points_earned": 100,
        "total_points_redeemed": 0,
        "tier": "Bronze",
        "last_birthday_bonus_year": current_year,
    })

    # Customer 4: anniversary today, 200 pts Bronze — should get bonus
    await db.customers.insert_one({
        "id": f"{NS}cust_anniv_basic",
        "user_id": USER_ID,
        "name": "Anniversary Basic",
        "phone": f"{NS}2001",
        "anniversary": today.isoformat(),
        "total_points": 200,
        "total_points_earned": 200,
        "total_points_redeemed": 0,
        "tier": "Bronze",
        "total_visits": 5,
        "total_spent": 2000,
    })

    # Customer 5: anniversary today, 400 pts Bronze — bonus should push to Silver (400+150=550 >= 500)
    await db.customers.insert_one({
        "id": f"{NS}cust_anniv_tier_up",
        "user_id": USER_ID,
        "name": "Anniversary Tier Up",
        "phone": f"{NS}2002",
        "anniversary": today.isoformat(),
        "total_points": 400,
        "total_points_earned": 400,
        "total_points_redeemed": 0,
        "tier": "Bronze",
        "total_visits": 8,
        "total_spent": 4000,
    })

    # Customer 6: anniversary today, already got bonus this year — should be skipped
    await db.customers.insert_one({
        "id": f"{NS}cust_anniv_dup",
        "user_id": USER_ID,
        "name": "Anniversary Dup",
        "phone": f"{NS}2003",
        "anniversary": today.isoformat(),
        "total_points": 100,
        "total_points_earned": 100,
        "total_points_redeemed": 0,
        "tier": "Bronze",
        "last_anniversary_bonus_year": current_year,
    })

    # Customer 7: birthday today, Gold tier, 1600 pts — bonus should NOT downgrade
    # (1600+100=1700 > 1500 Gold min, so stays Gold. But test ensures no downgrade logic.)
    await db.customers.insert_one({
        "id": f"{NS}cust_bday_gold",
        "user_id": USER_ID,
        "name": "Birthday Gold",
        "phone": f"{NS}1004",
        "dob": today.isoformat(),
        "total_points": 1600,
        "total_points_earned": 1600,
        "total_points_redeemed": 0,
        "tier": "Gold",
        "total_visits": 30,
        "total_spent": 15000,
    })


async def teardown():
    """Remove all test fixtures."""
    r_users = await db.users.delete_many({"id": USER_ID})
    r_settings = await db.loyalty_settings.delete_many({"user_id": USER_ID})
    r_custs = await db.customers.delete_many({"user_id": USER_ID})
    r_pts = await db.points_transactions.delete_many({"user_id": USER_ID})
    print(f"\nTeardown removed: users={r_users.deleted_count}, settings={r_settings.deleted_count}, "
          f"customers={r_custs.deleted_count}, points_tx={r_pts.deleted_count}")


async def run_tests():
    from core.loyalty_jobs import run_birthday_bonus, run_anniversary_bonus

    settings = await db.loyalty_settings.find_one({"user_id": USER_ID}, {"_id": 0})

    # ========== BIRTHDAY BONUS TESTS ==========
    print("\n=== Birthday Bonus Tests ===")

    bday_result = await run_birthday_bonus(USER_ID, settings)

    # QA-L4-1: total_points incremented
    cust1 = await db.customers.find_one({"id": f"{NS}cust_bday_basic"})
    record("QA-L4-1 Birthday: total_points incremented",
           cust1["total_points"] == 300,
           f"expected=300 got={cust1['total_points']}")

    # QA-L4-2: total_points_earned incremented
    record("QA-L4-2 Birthday: total_points_earned incremented",
           cust1.get("total_points_earned", 0) == 300,
           f"expected=300 got={cust1.get('total_points_earned', 0)}")

    # QA-L4-3: tier upgrade on threshold crossing
    cust2 = await db.customers.find_one({"id": f"{NS}cust_bday_tier_up"})
    record("QA-L4-3 Birthday: tier upgrade Bronze->Silver (450+100=550)",
           cust2["tier"] == "Silver",
           f"expected=Silver got={cust2['tier']}, points={cust2['total_points']}")

    # QA-L4-4: NO tier downgrade (Gold stays Gold)
    cust_gold = await db.customers.find_one({"id": f"{NS}cust_bday_gold"})
    record("QA-L4-4 Birthday: Gold tier NOT downgraded",
           cust_gold["tier"] == "Gold",
           f"expected=Gold got={cust_gold['tier']}, points={cust_gold['total_points']}")

    # QA-L4-5: duplicate prevention
    cust3 = await db.customers.find_one({"id": f"{NS}cust_bday_dup"})
    record("QA-L4-5 Birthday: duplicate prevention (points unchanged)",
           cust3["total_points"] == 100,
           f"expected=100 got={cust3['total_points']}")

    # QA-L4-6: loyalty_enabled=false -> skipped
    # Temporarily disable loyalty and run again
    await db.loyalty_settings.update_one({"user_id": USER_ID}, {"$set": {"loyalty_enabled": False}})
    settings_disabled = await db.loyalty_settings.find_one({"user_id": USER_ID}, {"_id": 0})
    # Reset cust1 bonus year so it would be eligible if not for kill-switch
    await db.customers.update_one({"id": f"{NS}cust_bday_basic"}, {"$unset": {"last_birthday_bonus_year": 1}})
    bday_disabled = await run_birthday_bonus(USER_ID, settings_disabled)
    record("QA-L4-6 Birthday: loyalty_enabled=false -> skipped",
           bday_disabled["customers_awarded"] == 0,
           f"expected=0 got={bday_disabled['customers_awarded']}")
    # Restore
    await db.loyalty_settings.update_one({"user_id": USER_ID}, {"$set": {"loyalty_enabled": True}})

    # QA-L4-7: birthday_bonus_enabled=false -> skipped
    await db.loyalty_settings.update_one({"user_id": USER_ID}, {"$set": {"birthday_bonus_enabled": False}})
    settings_bday_off = await db.loyalty_settings.find_one({"user_id": USER_ID}, {"_id": 0})
    bday_off = await run_birthday_bonus(USER_ID, settings_bday_off)
    record("QA-L4-7 Birthday: birthday_bonus_enabled=false -> skipped",
           bday_off["customers_awarded"] == 0,
           f"expected=0 got={bday_off['customers_awarded']}")
    # Restore
    await db.loyalty_settings.update_one({"user_id": USER_ID}, {"$set": {"birthday_bonus_enabled": True}})

    # QA-L4-8: PT row has points_expired=False
    pt_bday = await db.points_transactions.find_one({
        "user_id": USER_ID, "customer_id": f"{NS}cust_bday_basic", "transaction_type": "bonus"
    })
    record("QA-L4-8 Birthday: PT row has points_expired=False",
           pt_bday is not None and pt_bday.get("points_expired") is False,
           f"points_expired={pt_bday.get('points_expired') if pt_bday else 'NO PT ROW'}")

    # QA-L4-9: PT row balance_after correct
    record("QA-L4-9 Birthday: PT row balance_after correct",
           pt_bday is not None and pt_bday.get("balance_after") == 300,
           f"expected=300 got={pt_bday.get('balance_after') if pt_bday else 'NO PT ROW'}")

    # ========== ANNIVERSARY BONUS TESTS ==========
    print("\n=== Anniversary Bonus Tests ===")

    anniv_result = await run_anniversary_bonus(USER_ID, settings)

    # QA-L4-10: total_points incremented
    cust4 = await db.customers.find_one({"id": f"{NS}cust_anniv_basic"})
    record("QA-L4-10 Anniversary: total_points incremented",
           cust4["total_points"] == 350,
           f"expected=350 got={cust4['total_points']}")

    # QA-L4-11: total_points_earned incremented
    record("QA-L4-11 Anniversary: total_points_earned incremented",
           cust4.get("total_points_earned", 0) == 350,
           f"expected=350 got={cust4.get('total_points_earned', 0)}")

    # QA-L4-12: tier upgrade on threshold crossing (400+150=550 >= 500)
    cust5 = await db.customers.find_one({"id": f"{NS}cust_anniv_tier_up"})
    record("QA-L4-12 Anniversary: tier upgrade Bronze->Silver (400+150=550)",
           cust5["tier"] == "Silver",
           f"expected=Silver got={cust5['tier']}, points={cust5['total_points']}")

    # QA-L4-13: duplicate prevention
    cust6 = await db.customers.find_one({"id": f"{NS}cust_anniv_dup"})
    record("QA-L4-13 Anniversary: duplicate prevention (points unchanged)",
           cust6["total_points"] == 100,
           f"expected=100 got={cust6['total_points']}")

    # QA-L4-14: loyalty_enabled=false -> skipped
    await db.loyalty_settings.update_one({"user_id": USER_ID}, {"$set": {"loyalty_enabled": False}})
    settings_disabled2 = await db.loyalty_settings.find_one({"user_id": USER_ID}, {"_id": 0})
    await db.customers.update_one({"id": f"{NS}cust_anniv_basic"}, {"$unset": {"last_anniversary_bonus_year": 1}})
    anniv_disabled = await run_anniversary_bonus(USER_ID, settings_disabled2)
    record("QA-L4-14 Anniversary: loyalty_enabled=false -> skipped",
           anniv_disabled["customers_awarded"] == 0,
           f"expected=0 got={anniv_disabled['customers_awarded']}")
    await db.loyalty_settings.update_one({"user_id": USER_ID}, {"$set": {"loyalty_enabled": True}})

    # ========== REGRESSION SMOKE ==========
    print("\n=== Regression Smoke ===")

    # QA-L4-15: /api/health
    import requests
    health = requests.get("http://localhost:8001/api/health")
    record("QA-L4-15 /api/health",
           health.status_code == 200 and health.json().get("status") == "healthy",
           f"HTTP {health.status_code}")

    # QA-L4-16: LR regression — shared helper imports still work
    try:
        from core.loyalty import redeem_loyalty_points, compute_max_redeemable, build_pos_loyalty_blob
        record("QA-L4-16 LR/LX-A imports intact", True)
    except ImportError as e:
        record("QA-L4-16 LR/LX-A imports intact", False, str(e))

    # QA-L4-17: datetime safety — cron uses .date() not datetime for comparisons
    # Structural check: verify the code pattern is safe
    import inspect
    from core.loyalty_jobs import run_birthday_bonus as rbf
    src = inspect.getsource(rbf)
    uses_date_only = ".date()" in src and "strptime" in src
    record("QA-L4-17 Datetime safety: birthday uses .date() pattern",
           uses_date_only, "date-only comparison pattern confirmed" if uses_date_only else "")


async def main():
    print("=" * 60)
    print("CR-001C-L L4 Cron-Only QA Harness")
    print("=" * 60)

    await setup()
    try:
        await run_tests()
    finally:
        await teardown()

    print(f"\n{'=' * 60}")
    print(f"TOTAL: {PASS_COUNT + FAIL_COUNT} | PASS: {PASS_COUNT} | FAIL: {FAIL_COUNT}")
    print(f"{'=' * 60}")

    # Write results to JSON
    report = {
        "module": "CR-001C-L L4 Cron-Only",
        "date": datetime.now(timezone.utc).isoformat(),
        "total": PASS_COUNT + FAIL_COUNT,
        "passed": PASS_COUNT,
        "failed": FAIL_COUNT,
        "results": RESULTS,
    }
    report_path = "/app/test_reports/cr_001c_l4_cron_qa_results.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"Report written to {report_path}")

    return FAIL_COUNT == 0


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
