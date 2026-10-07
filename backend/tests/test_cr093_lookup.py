"""CR-093 QA regression — POST /api/scan/auth/lookup (iteration_3).

Independent verification: read-only. Must NOT create customers, never return tokens.
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
OWNER_EMAIL = os.environ.get("CRM_TEST_OWNER_EMAIL", "owner@thegoankitchen.com")
OWNER_PASSWORD = os.environ["CRM_TEST_OWNER_PASSWORD"]
LOOKUP = "/api/scan/auth/lookup"

# Load mongo creds from backend/.env (read-only)
_env = dotenv_values("/app/backend/.env")
MONGO_URL = _env["MONGO_URL"]
DB_NAME = _env["DB_NAME"]


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


def _post(body, ip=None):
    headers = {}
    if ip:
        headers["X-Forwarded-For"] = ip
    return requests.post(f"{BASE_URL}{LOOKUP}", json=body, headers=headers, timeout=30)


# L1 — empty body = 422
def test_L1_empty_body_422():
    r = _post({}, ip="10.77.9.1")
    assert r.status_code == 422, r.text


# L2 — invalid phone / country_code -> 400
def test_L2a_non_digit_phone_400():
    r = _post({"phone": "abc", "restaurant_id": "689"}, ip="10.77.9.2")
    assert r.status_code == 400
    assert r.json().get("detail") == "Invalid phone or country_code", r.text


def test_L2b_bad_country_code_400():
    r = _post({"phone": "9876543210", "country_code": "91", "restaurant_id": "689"}, ip="10.77.9.3")
    assert r.status_code == 400
    assert r.json().get("detail") == "Invalid phone or country_code", r.text


# L3 — unknown phone, exists:false, customer count unchanged
def test_L3_unknown_phone_no_create(mongo):
    before = mongo.customers.count_documents({})
    assert before > 0, f"baseline customers count must be readable, got {before}"
    r = _post({"phone": "90000 00999", "restaurant_id": "689"}, ip="10.77.9.4")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["data"] == {"exists": False, "name": None}, body
    assert "token" not in str(body)
    after = mongo.customers.count_documents({})
    assert after == before, f"customers count changed: {before} -> {after}"


# L4 — formatted phone finds existing customer
def test_L4_known_phone_dashes():
    r = _post({"phone": "75052-42126", "restaurant_id": "689"}, ip="10.77.9.5")
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {"exists": True, "name": "Abhishek Jain"}


# L4b — full restaurant_id form
def test_L4b_full_restaurant_id():
    r = _post({"phone": "7505242126", "restaurant_id": "pos_0001_restaurant_689"}, ip="10.77.9.6")
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {"exists": True, "name": "Abhishek Jain"}


# L5 — blank-name customer -> name:null
def test_L5_blank_name():
    r = _post({"phone": "9696759716", "restaurant_id": "618"}, ip="10.77.9.7")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["exists"] is True
    assert data["name"] is None, data


# L6 — duplicate phone group -> oldest wins
def test_L6_dup_oldest():
    r = _post({"phone": "9309105737", "restaurant_id": "635"}, ip="10.77.9.8")
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {"exists": True, "name": "Siddhi Malani"}


# L7 — known gap (+61 stored embedded) -> exists:false expected
def test_L7_known_gap_cc61():
    r = _post({"phone": "404668073", "country_code": "+61", "restaurant_id": "541"}, ip="10.77.9.9")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["exists"] is False


# L8 — IP limiter: 11 rapid calls same IP, 11 different phones -> 11th = 429
def test_L8_ip_limiter():
    ip = "10.77.1.1"
    results = []
    for i in range(11):
        phone = f"91000000{i:02d}"  # 10 digits each unique
        r = _post({"phone": phone, "restaurant_id": "689"}, ip=ip)
        results.append(r.status_code)
    assert results[:10] == [200] * 10, results
    assert results[10] == 429, results
    # Check Retry-After on the 11th
    r11 = _post({"phone": "9100000099", "restaurant_id": "689"}, ip=ip)
    assert r11.status_code == 429
    ra = r11.headers.get("Retry-After")
    assert ra and ra.isdigit() and int(ra) > 0, f"Retry-After={ra}"
    assert r11.json().get("detail") == "Too many lookups"


# L9 — phone limiter: 6 rapid calls same phone+restaurant, different IPs -> 6th = 429
def test_L9_phone_limiter():
    phone = "9111111199"
    rid = "689"
    results = []
    for i in range(6):
        r = _post({"phone": phone, "restaurant_id": rid}, ip=f"10.77.2.{10+i}")
        results.append((r.status_code, r.headers.get("Retry-After")))
    codes = [c for c, _ in results]
    assert codes[:5] == [200] * 5, results
    assert codes[5] == 429, results
    ra = results[5][1]
    assert ra and ra.isdigit() and int(ra) > 0, f"Retry-After={ra}"


# L10 — indexes exist
def test_L10_indexes(mongo):
    cust_idx = mongo.customers.index_information()
    assert "idx_customers_user_phone" in cust_idx, list(cust_idx.keys())
    key = cust_idx["idx_customers_user_phone"]["key"]
    assert key == [("user_id", 1), ("phone", 1)], key

    sla_idx = mongo.scan_lookup_attempts.index_information()
    assert "idx_lookup_key_created" in sla_idx, list(sla_idx.keys())
    assert "ttl_scan_lookup_attempts" in sla_idx, list(sla_idx.keys())
    ttl = sla_idx["ttl_scan_lookup_attempts"]
    assert ttl.get("expireAfterSeconds") == 0, ttl


# L11 — explain() uses IXSCAN with idx_customers_user_phone
def test_L11_explain_ixscan(mongo):
    exp = mongo.command("explain", {
        "find": "customers",
        "filter": {"user_id": "pos_0001_restaurant_689", "phone": "7505242126", "country_code": "+91"},
    }, verbosity="queryPlanner")
    plan = exp["queryPlanner"]["winningPlan"]
    # recurse through plan for IXSCAN stage with correct index name
    found = []
    def walk(node):
        if isinstance(node, dict):
            if node.get("stage") == "IXSCAN":
                found.append(node.get("indexName"))
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(plan)
    assert "idx_customers_user_phone" in found, f"IXSCAN names={found}, plan={plan}"


# L12 — regressions
def test_L12a_skip_otp_empty_422():
    r = requests.post(f"{BASE_URL}/api/scan/auth/skip-otp", json={}, timeout=30)
    assert r.status_code == 422, r.text


def test_L12b_me_no_token_403():
    r = requests.get(f"{BASE_URL}/api/scan/auth/me", timeout=30)
    assert r.status_code == 403, r.text


def test_L12c_staff_login_200():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("path", ["/api/scan/auth/register", "/api/scan/auth/login"])
def test_L12d_customer_register_login_404(path):
    r = requests.post(f"{BASE_URL}{path}", json={}, timeout=30)
    assert r.status_code == 404, f"{path} -> {r.status_code}"


# L13 — blocked customer lookup -> exists:false
def test_L13_blocked_customer(mongo):
    blocked = mongo.customers.find_one(
        {"is_blocked": True, "phone": {"$exists": True, "$ne": ""}},
        {"_id": 0, "user_id": 1, "phone": 1, "country_code": 1, "name": 1},
    )
    if not blocked:
        pytest.skip("No blocked customer in DB — L13 N/A")
    rid = blocked["user_id"]
    phone = blocked["phone"]
    cc = blocked.get("country_code") or "+91"
    r = _post({"phone": phone, "country_code": cc, "restaurant_id": rid}, ip="10.77.9.13")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["exists"] is False, r.json()
