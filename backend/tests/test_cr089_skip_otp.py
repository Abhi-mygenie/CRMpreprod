"""CR-089 QA regression — POST /api/scan/auth/skip-otp rate limiting (iteration_4).

Independent verification: must NOT create new customers.
Uses existing r689 phones only; fresh X-Forwarded-For ranges (10.55.x) that
previous iterations (10.9.x, 10.89.x, 10.77.x) did not use.
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
SKIP_OTP = "/api/scan/auth/skip-otp"
LOOKUP = "/api/scan/auth/lookup"

_env = dotenv_values("/app/backend/.env")
MONGO_URL = _env["MONGO_URL"]
DB_NAME = _env["DB_NAME"]

# 45 known existing r689 phones (pulled live)
EXISTING_PHONES = [
    '7505242126','9990818342','9035133228','8957823844','9415307319',
    '9519015006','9151555198','8577851657','8726401145','7706001175',
    '9818060975','8317096835','7897180051','7906029250','9649999320',
    '7905104334','7860323685','8951572921','9918609001','9071441516',
    '8207264050','7905614247','8787006565','9005551490','9005998822',
    '9236135157','7845707354','9340405962','9044111800','8826385535',
    '9839230016','9981620486','9330753941','9565659474','9838777712',
    '7081138600','9236817720','7860590822','8423984456','7905948065',
    '9818093030','9555538912','9839182399','8447695599','8299027764',
]


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="module")
def customers_count_before(mongo):
    return mongo.customers.count_documents({})


def _post_skip(body, ip):
    return requests.post(
        f"{BASE_URL}{SKIP_OTP}", json=body,
        headers={"X-Forwarded-For": ip} if ip else {},
        timeout=30,
    )


# ---------- S1 ----------
def test_S1_empty_body_422():
    r = requests.post(f"{BASE_URL}{SKIP_OTP}", json={}, timeout=30)
    assert r.status_code == 422, r.text


# ---------- S2 ----------
def test_S2_existing_phone_returns_token(customers_count_before):
    assert customers_count_before > 0, f"baseline customers must be readable, got {customers_count_before}"
    r = _post_skip({"phone": EXISTING_PHONES[0], "restaurant_id": "689"}, ip="10.55.0.1")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("success") is True
    assert body.get("data", {}).get("token"), body


# ---------- S3 ----------
@pytest.fixture(scope="module")
def s3_result():
    """Run S3: 31 rapid calls same IP, 31 different existing phones."""
    ip = "10.55.1.1"
    results = []
    for i in range(31):
        phone = EXISTING_PHONES[i]
        r = _post_skip({"phone": phone, "restaurant_id": "689"}, ip=ip)
        results.append((r.status_code, r.headers.get("Retry-After"), r.text[:200]))
    return ip, results


def test_S3_ip_limiter_30_then_429(s3_result):
    ip, results = s3_result
    codes = [c for c, _, _ in results]
    assert codes[:30] == [200] * 30, codes
    assert codes[30] == 429, codes
    body = requests.post(
        f"{BASE_URL}{SKIP_OTP}", json={"phone": EXISTING_PHONES[31], "restaurant_id": "689"},
        headers={"X-Forwarded-For": ip}, timeout=30,
    )
    # still throttled - but check headers/body of the ORIGINAL 31st
    ra = results[30][1]
    assert ra is not None and ra.isdigit(), f"Retry-After missing/non-int: {ra}"
    assert 1 <= int(ra) <= 60, f"Retry-After expected <=60 got {ra}"
    import json as _json
    detail = _json.loads(results[30][2]).get("detail")
    assert detail == "Too many login attempts", detail


# ---------- S5 (depends on S3's IP being throttled) ----------
def test_S5_lookup_separate_bucket(s3_result):
    ip, _ = s3_result
    # IP still throttled on skip-otp - verify lookup works from same IP
    r = requests.post(
        f"{BASE_URL}{LOOKUP}",
        json={"phone": EXISTING_PHONES[0], "restaurant_id": "689"},
        headers={"X-Forwarded-For": ip}, timeout=30,
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["exists"] is True


# ---------- S3b: wait Retry-After + 1 then same IP -> 200 ----------
def test_S3b_recovery_after_retry_after(s3_result):
    ip, results = s3_result
    ra = int(results[30][1])
    # To avoid waiting a full window after a long S3b wait, use a different phone
    # that is not in the phone-limit bucket. Pick a phone not yet used (index >= 32).
    wait = ra + 2
    time.sleep(wait)
    r = _post_skip({"phone": EXISTING_PHONES[32], "restaurant_id": "689"}, ip=ip)
    # The IP's sliding window may still have 30 recent entries if full 60s not elapsed;
    # we only waited retry-after seconds (which is window - elapsed-of-oldest), so the
    # oldest entry has aged out and now count < 30 -> allowed.
    assert r.status_code == 200, f"after wait {wait}s expected 200 got {r.status_code}: {r.text}"


# ---------- S4 ----------
def test_S4_phone_limiter():
    phone = EXISTING_PHONES[33]  # unused in S3
    results = []
    for i in range(6):
        r = _post_skip({"phone": phone, "restaurant_id": "689"}, ip=f"10.55.4.{10+i}")
        results.append((r.status_code, r.headers.get("Retry-After"), r.text[:200]))
    codes = [c for c, _, _ in results]
    assert codes[:5] == [200] * 5, codes
    assert codes[5] == 429, codes
    ra = results[5][1]
    assert ra is not None and ra.isdigit(), f"Retry-After missing: {ra}"
    assert 1 <= int(ra) <= 300, f"Retry-After expected <=300 got {ra}"
    import json as _json
    assert _json.loads(results[5][2]).get("detail") == "Too many login attempts"


# ---------- S4b phone key normalisation ----------
@pytest.mark.skip(reason="CR-085 W13: skip-otp find-or-create still matches raw phone; spaced variant creates a duplicate. Re-enable when CR-085-A lands.")
def test_S4b_phone_key_normalisation_legacy_skip():
    pass


def test_S4b_phone_key_normalisation():
    # Use a different unused phone. Pick one that has NOT been used by S3 (first 31 phones) or S4 (idx 33).
    base_phone = EXISTING_PHONES[34]  # e.g., '9838777712'
    assert len(base_phone) == 10
    spaced = base_phone[:5] + " " + base_phone[5:]
    results = []
    for i in range(6):
        p = spaced if i < 3 else base_phone  # 3 spaced then 3 plain -> same digit bucket
        r = _post_skip({"phone": p, "restaurant_id": "689"}, ip=f"10.55.5.{20+i}")
        results.append((r.status_code, p))
    codes = [c for c, _ in results]
    assert codes[:5] == [200] * 5, results
    assert codes[5] == 429, results


# ---------- S6 ----------
def test_S6_mongo_keys_present(mongo):
    # Must find both so-ip: and so-ph: keys inserted during this run
    ip_key = mongo.scan_lookup_attempts.find_one({"key": {"$regex": "^so-ip:"}})
    ph_key = mongo.scan_lookup_attempts.find_one({"key": {"$regex": "^so-ph:"}})
    assert ip_key is not None, "no so-ip:* keys found"
    assert ph_key is not None, "no so-ph:* keys found"


# ---------- S7 ----------
def test_S7_customers_count_unchanged(mongo, customers_count_before):
    after = mongo.customers.count_documents({})
    assert after == customers_count_before, f"customers count changed {customers_count_before} -> {after}"


# ---------- S8 regressions ----------
def test_S8a_lookup_known_phone():
    r = requests.post(
        f"{BASE_URL}{LOOKUP}",
        json={"phone": "7505242126", "restaurant_id": "689"},
        headers={"X-Forwarded-For": "10.55.8.1"}, timeout=30,
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["exists"] is True


def test_S8b_me_no_token_403():
    r = requests.get(f"{BASE_URL}/api/scan/auth/me", timeout=30)
    assert r.status_code == 403, r.text


def test_S8c_staff_owner_login_200():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("path", ["/api/scan/auth/register", "/api/scan/auth/login"])
def test_S8d_scan_register_login_404(path):
    r = requests.post(f"{BASE_URL}{path}", json={}, timeout=30)
    assert r.status_code == 404, f"{path} -> {r.status_code}"


# ---------- S10 ----------
def test_S10_backend_running_and_log_clean():
    import subprocess
    s = subprocess.run(["sudo", "supervisorctl", "status", "backend"],
                       capture_output=True, text=True, timeout=10)
    assert "RUNNING" in s.stdout, s.stdout + s.stderr
    # check err log for recent tracebacks (last 300 lines)
    try:
        with open("/var/log/supervisor/backend.err.log") as f:
            tail = f.readlines()[-400:]
    except FileNotFoundError:
        import glob
        logs = glob.glob("/var/log/supervisor/backend.err*.log")
        tail = []
        for p in logs:
            with open(p) as f:
                tail.extend(f.readlines()[-200:])
    joined = "".join(tail)
    assert "Traceback" not in joined, f"traceback found in backend err log tail:\n{joined[-2000:]}"
