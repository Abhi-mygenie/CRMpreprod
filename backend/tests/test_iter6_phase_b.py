"""Iteration 6 Phase B — cross-item batch regression (I1..I9).
Report-only. Minimal writes, cleaned up.
"""
import os, json, time, io
import pytest
import requests
import pymongo
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO = pymongo.MongoClient(os.environ["MONGO_URL"])
db = MONGO["mygenie"]

OWNER_EMAIL = "owner@thegoankitchen.com"
OWNER_PASS = os.environ.get("CRM_TEST_OWNER_PASSWORD", "Qplazm@10")
POS_USER_ID = "pos_owner_69_bdd4513c"
API_KEY = db.users.find_one({"id": POS_USER_ID})["api_key"]
POS_ID = "0001"
RESTAURANT_ID = "69"

HDR_POS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_hdr():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASS},
                      timeout=20)
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


# -----------------------------------------------------------------------------
# I1 — skip-otp rate limiter buckets. Record only; do not fix.
# -----------------------------------------------------------------------------
I1_RESULTS = {}


def test_I1_rate_limiter_buckets():
    db.scan_lookup_attempts.delete_many({})
    pre_689 = db.customers.count_documents({"user_id": POS_USER_ID.replace("69", "689")})  # not reliable; use pos_id/restaurant
    pre_689 = db.customers.count_documents({"pos_id": "0001", "restaurant_id": "689"})

    statuses_5 = []
    for i in range(5):
        hdr = {"X-Forwarded-For": f"10.44.1.{10+i}", "Content-Type": "application/json"}
        r = requests.post(f"{BASE}/api/scan/auth/skip-otp",
                          headers=hdr,
                          json={"phone": "9838777712", "restaurant_id": "689"},
                          timeout=20)
        statuses_5.append(r.status_code)
    I1_RESULTS["first_five"] = statuses_5
    print(f"[I1] first-five statuses: {statuses_5}")

    # 6th with +91 prefix
    r = requests.post(f"{BASE}/api/scan/auth/skip-otp",
                      headers={"X-Forwarded-For": "10.44.1.100", "Content-Type": "application/json"},
                      json={"phone": "+91 9838777712", "restaurant_id": "689"},
                      timeout=20)
    I1_RESULTS["sixth_plus91"] = r.status_code
    print(f"[I1] 6th +91 status={r.status_code} body={r.text[:150]}")

    # 7th with 09 prefix
    r = requests.post(f"{BASE}/api/scan/auth/skip-otp",
                      headers={"X-Forwarded-For": "10.44.1.101", "Content-Type": "application/json"},
                      json={"phone": "09838777712", "restaurant_id": "689"},
                      timeout=20)
    I1_RESULTS["seventh_09"] = r.status_code
    print(f"[I1] 7th 09 status={r.status_code}")

    # 8th plain 9838777712
    r = requests.post(f"{BASE}/api/scan/auth/skip-otp",
                      headers={"X-Forwarded-For": "10.44.1.102", "Content-Type": "application/json"},
                      json={"phone": "9838777712", "restaurant_id": "689"},
                      timeout=20)
    I1_RESULTS["eighth_plain"] = r.status_code
    I1_RESULTS["eighth_retry_after"] = r.headers.get("Retry-After")
    print(f"[I1] 8th plain status={r.status_code} Retry-After={r.headers.get('Retry-After')}")
    print(f"[I1 FULL] {I1_RESULTS}")

    # Must-pass: no new customer for existing phone
    post_689 = db.customers.count_documents({"pos_id": "0001", "restaurant_id": "689"})
    assert post_689 == pre_689, f"r689 customer count changed {pre_689}->{post_689}"

    # Must-pass: 8th should be 429 with Retry-After
    assert I1_RESULTS["eighth_plain"] == 429, I1_RESULTS
    assert I1_RESULTS["eighth_retry_after"] is not None

    db.scan_lookup_attempts.delete_many({})


# -----------------------------------------------------------------------------
# I3 — deleted endpoints must 404
# -----------------------------------------------------------------------------
@pytest.mark.parametrize("path,body", [
    ("/api/scan/auth/request-otp", {"phone": "9000000001", "restaurant_id": "689"}),
    ("/api/scan/auth/verify-otp", {"phone": "9000000001", "restaurant_id": "689", "otp": "1234"}),
    ("/api/scan/auth/register", {"phone": "9000000001", "restaurant_id": "689", "name": "x"}),
    ("/api/scan/auth/login", {"phone": "9000000001", "restaurant_id": "689"}),
    ("/api/auth/register", {"email": "x@y.z", "password": "p", "name": "x"}),
    ("/api/auth/forgot-password/request-otp", {"email": "x@y.z"}),
    ("/api/auth/forgot-password/verify-otp", {"email": "x@y.z", "otp": "1234"}),
    ("/api/auth/forgot-password/reset", {"email": "x@y.z", "otp": "1234", "new_password": "p"}),
])
def test_I3_deleted_endpoints_404(path, body):
    for b in [{}, body]:
        r = requests.post(f"{BASE}{path}", json=b, timeout=20)
        print(f"[I3] POST {path} body_keys={list(b.keys())} -> {r.status_code}")
        assert r.status_code == 404, f"{path}: {r.status_code} {r.text[:200]}"
        try:
            j = r.json()
            assert j.get("detail") == "Not Found", j
        except ValueError:
            pass


def test_I3_reset_password_put():
    for b in [{}, {"old_password": "x", "new_password": "y"}]:
        r = requests.put(f"{BASE}/api/auth/reset-password", json=b, timeout=20)
        print(f"[I3] PUT /api/auth/reset-password -> {r.status_code}")
        assert r.status_code == 404


# -----------------------------------------------------------------------------
# I4 — identity path alive
# -----------------------------------------------------------------------------
def test_I4_identity_path():
    db.scan_lookup_attempts.delete_many({})
    pre = db.customers.count_documents({"pos_id": "0001", "restaurant_id": "689"})
    r = requests.post(f"{BASE}/api/scan/auth/skip-otp",
                      headers={"X-Forwarded-For": "10.55.1.1"},
                      json={"phone": "98387 77712", "restaurant_id": "689"},
                      timeout=20)
    print(f"[I4] skip-otp status={r.status_code} body={r.text[:200]}")
    assert r.status_code == 200, r.text
    j = r.json()
    token = (j.get("data") or {}).get("token") or j.get("token")
    assert token, j

    post = db.customers.count_documents({"pos_id": "0001", "restaurant_id": "689"})
    assert post == pre, f"customer count moved {pre}->{post}"

    r = requests.get(f"{BASE}/api/scan/auth/me",
                     headers={"Authorization": f"Bearer {token}"}, timeout=20)
    print(f"[I4] /scan/auth/me status={r.status_code}")
    assert r.status_code == 200

    r = requests.get(f"{BASE}/api/scan/orders",
                     headers={"Authorization": f"Bearer {token}"}, timeout=20)
    print(f"[I4] /scan/orders status={r.status_code}")
    assert r.status_code == 200

    r = requests.post(f"{BASE}/api/scan/auth/lookup",
                      json={"phone": "+91 7505242126", "restaurant_id": "689"},
                      timeout=20)
    print(f"[I4] lookup +91 7505242126 -> {r.status_code} {r.text[:200]}")
    assert r.status_code == 200
    j = r.json()
    data = j.get("data") or j
    assert data.get("exists") is True
    assert "Abhishek" in (data.get("name") or ""), data

    r = requests.post(f"{BASE}/api/scan/auth/lookup",
                      json={"phone": "0000000000", "restaurant_id": "689"},
                      timeout=20)
    print(f"[I4] lookup 0000000000 -> {r.status_code}")
    assert r.status_code == 400

    db.scan_lookup_attempts.delete_many({})


# -----------------------------------------------------------------------------
# I5 — CRM CRUD normalisation
# -----------------------------------------------------------------------------
I5_IDS = []


def test_I5_crm_crud_normalisation(owner_hdr):
    r = requests.post(f"{BASE}/api/customers", headers=owner_hdr,
                      json={"name": "TEST_I5", "phone": "+91 98765 43911"},
                      timeout=20)
    print(f"[I5a] POST -> {r.status_code} {r.text[:200]}")
    assert r.status_code in (200, 201), r.text
    c = r.json()
    cid = c.get("id") or (c.get("data") or {}).get("id")
    assert cid
    I5_IDS.append(cid)
    doc = db.customers.find_one({"id": cid})
    assert doc.get("phone") == "9876543911", doc
    assert doc.get("country_code") == "+91", doc
    assert "+91" in (doc.get("phone_raw") or ""), doc

    # Duplicate variant
    r = requests.post(f"{BASE}/api/customers", headers=owner_hdr,
                      json={"name": "TEST_I5b", "phone": "98765-43911"},
                      timeout=20)
    print(f"[I5b] dup POST -> {r.status_code} {r.text[:200]}")
    assert r.status_code in (400, 409), f"expected dup rejection, got {r.status_code}"

    # PUT invalid
    r = requests.put(f"{BASE}/api/customers/{cid}", headers=owner_hdr,
                     json={"phone": "12345"}, timeout=20)
    print(f"[I5c] PUT invalid -> {r.status_code} {r.text[:200]}")
    assert r.status_code == 422, r.text
    assert "valid mobile number" in r.text.lower()

    # PUT variant that normalises to the same
    r = requests.put(f"{BASE}/api/customers/{cid}", headers=owner_hdr,
                     json={"phone": "0 98765 43911"}, timeout=20)
    print(f"[I5d] PUT variant -> {r.status_code}")
    assert r.status_code == 200
    doc = db.customers.find_one({"id": cid})
    assert doc.get("phone") == "9876543911", doc
    # No duplicate
    cnt = db.customers.count_documents({"user_id": POS_USER_ID, "phone": "9876543911"})
    assert cnt == 1


def test_I5_cleanup():
    for cid in I5_IDS:
        db.customers.delete_one({"id": cid})


# -----------------------------------------------------------------------------
# I6 — CSV import dedup
# -----------------------------------------------------------------------------
def test_I6_csv_import_dedup(owner_hdr):
    csv_content = "name,phone\nTEST_I6a,9876500002\nTEST_I6b,+91 98765 00002\n"
    files = {"file": ("test_i6.csv", csv_content, "text/csv")}
    hdr = {"Authorization": owner_hdr["Authorization"]}
    r = requests.post(f"{BASE}/api/customers/import", headers=hdr, files=files, timeout=30)
    print(f"[I6] import -> {r.status_code} {r.text[:400]}")
    assert r.status_code in (200, 201, 400), r.text
    created_cnt = db.customers.count_documents({"user_id": POS_USER_ID,
                                                "phone": "9876500002"})
    print(f"[I6] customers with phone 9876500002: {created_cnt}")
    assert created_cnt <= 1
    if created_cnt == 1:
        doc = db.customers.find_one({"user_id": POS_USER_ID, "phone": "9876500002"})
        assert doc.get("country_code") == "+91", doc

    # cleanup
    db.customers.delete_many({"user_id": POS_USER_ID, "phone": "9876500002"})


# -----------------------------------------------------------------------------
# I7 — identity (POS /customers idempotent, CRM register-customer)
# -----------------------------------------------------------------------------
I7_IDS = []


def test_I7_identity_merge(owner_hdr):
    # 1st POS /customers
    r = requests.post(f"{BASE}/api/pos/customers", headers=HDR_POS,
                      json={"pos_id": POS_ID, "restaurant_id": RESTAURANT_ID,
                            "name": "TEST_I7", "phone": "9000000888"},
                      timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    cid1 = (j.get("data") or {}).get("customer_id") or j.get("customer_id") or j.get("id")
    assert cid1
    I7_IDS.append(cid1)
    pts0 = (db.customers.find_one({"id": cid1}) or {}).get("total_points", 0) or 0

    # 2nd (variant) must not create new doc
    r = requests.post(f"{BASE}/api/pos/customers", headers=HDR_POS,
                      json={"pos_id": POS_ID, "restaurant_id": RESTAURANT_ID,
                            "name": "TEST_I7_v2", "phone": "+91 90000 00888"},
                      timeout=20)
    print(f"[I7a] 2nd variant -> {r.status_code} {r.text[:200]}")
    assert r.status_code == 200
    j2 = r.json()
    cid2 = (j2.get("data") or {}).get("customer_id") or j2.get("customer_id")
    cnt = db.customers.count_documents({"user_id": POS_USER_ID, "phone": "9000000888"})
    assert cnt == 1, f"expected 1 customer, got {cnt}"

    # PUT name (POS /customers/{id})
    r = requests.put(f"{BASE}/api/pos/customers/{cid1}", headers=HDR_POS,
                     json={"pos_id": POS_ID, "restaurant_id": RESTAURANT_ID,
                           "name": "TEST_I7x", "phone": "9000000888"},
                     timeout=20)
    print(f"[I7b] PUT -> {r.status_code} {r.text[:200]}")
    assert r.status_code == 200, r.text
    pts1 = (db.customers.find_one({"id": cid1}) or {}).get("total_points", 0) or 0
    assert pts1 == pts0, f"total_points moved {pts0}->{pts1}"

    # register-customer with valid phone — route: POST /api/qr/register/{user_id}
    r = requests.post(f"{BASE}/api/qr/register/{POS_USER_ID}",
                      json={"name": "TEST_I7_rc", "phone": "9000000889"},
                      timeout=20)
    print(f"[I7c] qr/register valid -> {r.status_code} {r.text[:200]}")
    assert r.status_code in (200, 201), r.text
    # pick up created customer for cleanup
    doc = db.customers.find_one({"user_id": POS_USER_ID, "phone": "9000000889",
                                 "name": {"$regex": "^TEST_I7"}})
    if doc:
        I7_IDS.append(doc["id"])

    # register-customer with invalid phone
    r = requests.post(f"{BASE}/api/qr/register/{POS_USER_ID}",
                      json={"name": "TEST_I7_rc_invalid", "phone": "0000000000"},
                      timeout=20)
    print(f"[I7d] qr/register invalid -> {r.status_code} {r.text[:200]}")
    assert r.status_code in (400, 422), r.text


def test_I7_cleanup():
    for cid in I7_IDS:
        db.customers.delete_one({"id": cid})
    db.customers.delete_many({"user_id": POS_USER_ID, "name": {"$regex": "^TEST_I7"}})


# -----------------------------------------------------------------------------
# I8 — auth untouched
# -----------------------------------------------------------------------------
def test_I8_auth():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASS},
                      timeout=20)
    print(f"[I8] login -> {r.status_code}")
    assert r.status_code == 200
    j = r.json()
    assert j.get("access_token") and j.get("mygenie_token"), j

    r = requests.post(f"{BASE}/api/pos/customer-lookup",
                      headers={"X-API-Key": "bad", "Content-Type": "application/json"},
                      json={"pos_id": POS_ID, "restaurant_id": RESTAURANT_ID,
                            "phone": "9000000777"},
                      timeout=20)
    print(f"[I8] bad X-API-Key -> {r.status_code}")
    assert r.status_code in (401, 403), r.text


# -----------------------------------------------------------------------------
# I9 — full suites (run externally; this is a sanity marker)
# -----------------------------------------------------------------------------
def test_I9_marker():
    print("[I9] see external runs in iteration_6.json")
