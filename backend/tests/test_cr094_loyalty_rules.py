"""CR-094 — GET /api/scan/loyalty-rules/{restaurant_id} (plan v2, R1–R13).

Public, read-only, whitelisted. Fixture tenant r689 (Kunafa Mahal). Never writes.
"""
import os
import copy
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ROUTE = "/api/scan/loyalty-rules"
R689 = "pos_0001_restaurant_689"

_env = dotenv_values("/app/backend/.env")
MONGO_URL = _env["MONGO_URL"]
DB_NAME = _env["DB_NAME"]

WHITELIST = {
    "loyalty_enabled", "wallet_enabled", "coupon_enabled",
    "bronze_earn_percent", "silver_earn_percent", "gold_earn_percent", "platinum_earn_percent",
    "tier_silver_min", "tier_gold_min", "tier_platinum_min",
    "redemption_value", "bronze_redemption_value", "silver_redemption_value", "gold_redemption_value", "platinum_redemption_value",
    "min_redemption_points", "max_redemption_percent", "max_redemption_amount", "min_order_value",
    "first_visit_bonus_enabled", "first_visit_bonus_points",
    "birthday_bonus_enabled", "birthday_bonus_points",
    "anniversary_bonus_enabled", "anniversary_bonus_points",
    "feedback_bonus_enabled", "feedback_bonus_points",
    "off_peak_bonus_enabled", "off_peak_bonus_type", "off_peak_bonus_value", "off_peak_start_time", "off_peak_end_time",
    "points_expiry_months",
}
PRIVATE = {"dormant_days_end", "campaign_daily_limit", "vip_auto_promote_enabled", "vip_score_min",
           "user_id", "id", "custom_field_1_label", "expiry_reminder_days", "at_risk_days_start"}
POS_SHARED = WHITELIST & {
    "loyalty_enabled", "wallet_enabled", "coupon_enabled",
    "bronze_earn_percent", "silver_earn_percent", "gold_earn_percent", "platinum_earn_percent",
    "tier_silver_min", "tier_gold_min", "tier_platinum_min",
    "redemption_value", "min_redemption_points",
    "off_peak_bonus_enabled", "off_peak_start_time", "off_peak_end_time",
}


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


def _get(rid, ip="10.94.0.1", headers=None):
    h = {"X-Forwarded-For": ip}
    if headers:
        h.update(headers)
    return requests.get(f"{BASE_URL}{ROUTE}/{rid}", headers=h, timeout=30)


def _null_tier_tenant(mongo):
    """A standard-id tenant whose per-tier redemption values are null (R10/R12)."""
    doc = mongo.loyalty_settings.find_one(
        {"user_id": {"$regex": "^pos_0001_restaurant_"}, "bronze_redemption_value": None, "max_redemption_amount": None},
        {"_id": 0, "user_id": 1, "redemption_value": 1},
    )
    if not doc or not mongo.users.find_one({"id": doc["user_id"]}, {"_id": 1}):
        pytest.skip("no null-per-tier tenant with users doc")
    return doc


# R1 — 200, exact whitelist, no private keys
def test_R1_whitelist_exact():
    r = _get("689", ip="10.94.1.1")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True and body["message"] == "Loyalty rules"
    data = body["data"]
    assert set(data) == WHITELIST, set(data) ^ WHITELIST
    assert not (set(data) & PRIVATE)


# R2 — unknown rid -> 404
def test_R2_unknown_rid_404():
    r = _get("999999", ip="10.94.1.2")
    assert r.status_code == 404
    assert r.json()["detail"] == "Restaurant not found"


# R3 — defaults fill keys absent on older docs
def test_R3_defaults_fill(mongo):
    doc = mongo.loyalty_settings.find_one(
        {"user_id": {"$regex": "^pos_0001_restaurant_"}, "birthday_bonus_points": {"$exists": False}},
        {"_id": 0, "user_id": 1},
    ) or mongo.loyalty_settings.find_one(
        {"user_id": {"$regex": "^pos_0001_restaurant_"}, "bronze_redemption_value": {"$exists": False}},
        {"_id": 0, "user_id": 1},
    )
    if not doc or not mongo.users.find_one({"id": doc["user_id"]}, {"_id": 1}):
        pytest.skip("every tenant doc carries all whitelisted keys")
    r = _get(doc["user_id"], ip="10.94.1.3")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert set(data) == WHITELIST
    assert all(k in data for k in ("birthday_bonus_points", "bronze_redemption_value"))


# R4 — junk bearer token ignored
def test_R4_junk_token_ignored():
    r = _get("689", ip="10.94.1.4", headers={"Authorization": "Bearer junk.junk.junk"})
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True


# R5 — IP limiter: 61st call/min -> 429 + Retry-After (concurrent: 61 sequential edge round-trips exceed the 60 s window)
def test_R5_ip_limiter():
    from concurrent.futures import ThreadPoolExecutor
    import random
    ip = f"10.94.5.{random.randint(2, 254)}"  # fresh bucket per run (window is 60 s)
    with ThreadPoolExecutor(max_workers=12) as ex:
        codes = list(ex.map(lambda _: _get("689", ip=ip).status_code, range(61)))
    assert codes.count(200) == 60 and codes.count(429) == 1, codes
    r = _get("689", ip=ip)
    assert r.status_code == 429
    ra = r.headers.get("Retry-After")
    assert ra and ra.isdigit() and int(ra) > 0, ra
    assert r.json()["detail"] == "Too many requests"


# R6 — parity with POS L-1 for r689 on the 15 shared keys
def test_R6_pos_parity(mongo):
    u = mongo.users.find_one({"id": R689}, {"_id": 0, "api_key": 1})
    assert u and u.get("api_key"), "r689 api_key missing"
    pos = requests.get(f"{BASE_URL}/api/pos/loyalty/settings", headers={"X-API-Key": u["api_key"]}, timeout=30)
    assert pos.status_code == 200, pos.text
    pos_data = pos.json()["data"]
    ours = _get("689", ip="10.94.1.6").json()["data"]
    for k in POS_SHARED:
        assert ours[k] == pos_data[k], (k, ours[k], pos_data[k])


# R7 — Cache-Control header set by origin (preview edge rewrites it to no-store for every route — ENV note)
def test_R7_cache_control():
    origin = os.environ.get("CRM_ORIGIN_URL", "http://localhost:8001")
    try:
        r = requests.get(f"{origin}{ROUTE}/689", headers={"X-Forwarded-For": "10.94.1.7"}, timeout=10)
    except requests.RequestException:
        pytest.skip("origin not reachable; edge rewrites Cache-Control")
    assert r.status_code == 200
    assert r.headers.get("Cache-Control") == "public, max-age=60", r.headers.get("Cache-Control")


# R8 — read-only: loyalty_settings doc unchanged
def test_R8_read_only(mongo):
    before = copy.deepcopy(mongo.loyalty_settings.find_one({"user_id": R689}, {"_id": 0}))
    assert before
    assert _get("689", ip="10.94.1.8").status_code == 200
    after = mongo.loyalty_settings.find_one({"user_id": R689}, {"_id": 0})
    assert before == after


# R9 — short and full rid identical
def test_R9_short_full_rid():
    a = _get("689", ip="10.94.1.9").json()["data"]
    b = _get(R689, ip="10.94.1.10").json()["data"]
    assert a == b


# R10 — Q4 (b): per-tier redemption resolved server-side, never null
def test_R10_per_tier_resolved(mongo):
    doc = mongo.loyalty_settings.find_one({"user_id": R689}, {"_id": 0})
    ours = _get("689", ip="10.94.1.11").json()["data"]
    for tier in ("bronze", "silver", "gold", "platinum"):
        expected = doc.get(f"{tier}_redemption_value")
        if expected is None:
            expected = doc.get("redemption_value", 0.25)
        assert ours[f"{tier}_redemption_value"] == float(expected), (tier, ours[f"{tier}_redemption_value"], expected)
    assert ours["bronze_redemption_value"] is not None

    nt = _null_tier_tenant(mongo)
    data = _get(nt["user_id"], ip="10.94.1.12").json()["data"]
    expected = float(nt.get("redemption_value") if nt.get("redemption_value") is not None else 0.25)
    for tier in ("bronze", "silver", "gold", "platinum"):
        assert data[f"{tier}_redemption_value"] == expected, (tier, data[f"{tier}_redemption_value"], expected)


# R11 — Q6: birthday / anniversary fields present and match the doc
def test_R11_birthday_anniversary(mongo):
    doc = mongo.loyalty_settings.find_one({"user_id": R689}, {"_id": 0})
    data = _get("689", ip="10.94.1.13").json()["data"]
    for k in ("birthday_bonus_enabled", "birthday_bonus_points", "anniversary_bonus_enabled", "anniversary_bonus_points"):
        assert k in data
        if k in doc:
            assert data[k] == doc[k], (k, data[k], doc[k])


# R12 — max_redemption_amount: null = no cap; value passes through
def test_R12_max_redemption_amount(mongo):
    doc = mongo.loyalty_settings.find_one({"user_id": R689}, {"_id": 0, "max_redemption_amount": 1})
    data = _get("689", ip="10.94.1.14").json()["data"]
    assert data["max_redemption_amount"] == doc.get("max_redemption_amount")
    nt = _null_tier_tenant(mongo)
    assert _get(nt["user_id"], ip="10.94.1.15").json()["data"]["max_redemption_amount"] is None


# R13 — off_peak_bonus_type constants
def test_R13_off_peak_type_constants(mongo):
    assert set(mongo.loyalty_settings.distinct("off_peak_bonus_type")) <= {"multiplier", "flat"}
    for i, uid in enumerate(mongo.loyalty_settings.distinct("user_id")[:3]):
        if not mongo.users.find_one({"id": uid}, {"_id": 1}):
            continue
        r = _get(uid, ip=f"10.94.2.{i+1}")
        assert r.status_code == 200, r.text
        assert r.json()["data"]["off_peak_bonus_type"] in ("multiplier", "flat")
