"""CR-085-A end-to-end backend QA (A2..A19).

Covers phone-normalization invariant across POS (never-reject), human (reject),
scan skip-otp (reject invalid), lookup, orders, webhook, CRM customers CRUD,
and CSV import. Cleans up test customers/orders at the end.
"""
import os
import time
import uuid
import pytest
import pymongo
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
OWNER_EMAIL = "owner@thegoankitchen.com"
OWNER_PASSWORD = os.environ["CRM_TEST_OWNER_PASSWORD"]
MONGO_URL = "mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie"
DB_NAME = "mygenie"

# Fresh /16 for X-Forwarded-For (not 10.9/10.77/10.85/10.89)
IP_PREFIX = "10.33"
_ip_ctr = {"n": 1}


def _ip():
    _ip_ctr["n"] += 1
    return f"{IP_PREFIX}.{(_ip_ctr['n'] // 250) + 1}.{_ip_ctr['n'] % 250 + 1}"


def _h(extra=None):
    h = {"Content-Type": "application/json", "X-Forwarded-For": _ip()}
    if extra:
        h.update(extra)
    return h


@pytest.fixture(scope="module")
def mongo():
    c = pymongo.MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def api_key(mongo):
    u = mongo.users.find_one({"email": OWNER_EMAIL}, {"api_key": 1})
    assert u and u.get("api_key"), "owner api_key missing"
    return u["api_key"]


@pytest.fixture(scope="module")
def jwt_token():
    r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def baseline(mongo):
    return mongo.customers.count_documents({})


def test_A0_baseline_capture(baseline):
    print(f"baseline customers count = {baseline}")
    assert baseline > 0


# user_id of restaurant 689 per the handover
R689_USER_ID = "pos_0001_restaurant_689"
# POS owner tenant id (customers written by POS endpoints are stored under this user_id)
POS_USER_ID = "pos_owner_69_bdd4513c"

CREATED_PHONES = []  # (user_id, phone)
CREATED_ORDERS = []
CREATED_IDS = []


# ---------- A2 / A3: skip-otp ----------

def test_A2_skip_otp_spaced_phone_no_duplicate(mongo):
    before = mongo.customers.count_documents({"user_id": R689_USER_ID})
    r = requests.post(f"{API}/scan/auth/skip-otp",
                      json={"phone": "98387 77712", "restaurant_id": "689"},
                      headers=_h(), timeout=15)
    assert r.status_code == 200, r.text
    after = mongo.customers.count_documents({"user_id": R689_USER_ID})
    assert after == before, f"customer count r689 changed {before}->{after}"
    # no doc with space in phone for r689
    spaced = mongo.customers.count_documents({"user_id": R689_USER_ID, "phone": {"$regex": " "}})
    assert spaced == 0, "space-containing phone doc exists for r689"


def test_A3_skip_otp_invalid_rejected():
    r = requests.post(f"{API}/scan/auth/skip-otp",
                      json={"phone": "0000000000", "restaurant_id": "689"},
                      headers=_h(), timeout=15)
    assert r.status_code == 400, r.text
    assert "Enter a valid mobile number" in r.text


# ---------- A4: scan lookup ----------

def test_A4a_lookup_found():
    r = requests.post(f"{API}/scan/auth/lookup",
                      json={"phone": "+91 7505242126", "restaurant_id": "689"},
                      headers=_h(), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    data = j.get("data") or j
    assert data.get("exists") is True
    assert data.get("name") == "Abhishek Jain", j


def test_A4b_lookup_invalid_cc_rejected():
    r = requests.post(f"{API}/scan/auth/lookup",
                      json={"phone": "9876543210", "country_code": "91", "restaurant_id": "689"},
                      headers=_h(), timeout=15)
    assert r.status_code == 400, r.text


# ---------- A5 / A6: POS /customers create ----------

def test_A5_pos_create_customer_formatted(mongo, api_key):
    body = {"pos_id": "0001", "restaurant_id": "69", "name": "TEST_A5",
            "phone": "+91 90000 00123"}
    r = requests.post(f"{API}/pos/customers", json=body,
                      headers=_h({"X-API-Key": api_key}), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("success") is True, j
    doc = mongo.customers.find_one({"user_id": POS_USER_ID, "phone": "9000000123"})
    assert doc is not None, "customer doc not stored with digits-only phone"
    assert doc.get("country_code") == "+91", doc.get("country_code")
    assert doc.get("phone_raw") == "+91 90000 00123", doc.get("phone_raw")
    assert not doc.get("phone_invalid"), "A5 phone must not be flagged"
    CREATED_IDS.append(doc.get("id") or str(doc.get("_id")))
    CREATED_PHONES.append((POS_USER_ID, "9000000123"))


def test_A6_pos_create_customer_invalid_never_blocks(mongo, api_key):
    body = {"pos_id": "0001", "restaurant_id": "69", "name": "TEST_A6",
            "phone": "0000000000"}
    r = requests.post(f"{API}/pos/customers", json=body,
                      headers=_h({"X-API-Key": api_key}), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("success") is True, j
    doc = mongo.customers.find_one({"user_id": POS_USER_ID, "phone": "0000000000"})
    assert doc is not None
    assert doc.get("phone_invalid") is True, "phone_invalid flag missing"
    CREATED_IDS.append(doc.get("id") or str(doc.get("_id")))
    CREATED_PHONES.append((POS_USER_ID, "0000000000"))


# ---------- A7: POS customer-lookup ----------

def test_A7_pos_customer_lookup_dashed(api_key):
    r = requests.post(f"{API}/pos/customer-lookup",
                      json={"pos_id": "0001", "restaurant_id": "69", "phone": "90000-00123"},
                      headers=_h({"X-API-Key": api_key}), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    data = j.get("data") or {}
    assert data.get("registered") is True or data.get("found") is True or j.get("success"), j


# ---------- A8: POS webhook payment-received ----------

def test_A8_pos_webhook_payment_received(mongo, api_key):
    body = {"pos_id": "0001", "restaurant_id": "69",
            "customer_phone": "+91 90000 00124",
            "bill_amount": 100, "order_id": "qa085a8"}
    r = requests.post(f"{API}/pos/webhook/payment-received", json=body,
                      headers=_h({"X-API-Key": api_key}), timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("success") is True, r.json()
    doc = mongo.customers.find_one({"user_id": POS_USER_ID, "phone": "9000000124"})
    assert doc is not None
    assert doc.get("phone_raw") == "+91 90000 00124"
    CREATED_IDS.append(doc.get("id") or str(doc.get("_id")))
    CREATED_PHONES.append((POS_USER_ID, "9000000124"))
    CREATED_ORDERS.append("qa085a8")


# ---------- A9: webhook invalid phone matches flagged A6 customer ----------

def test_A9_webhook_invalid_matches_flagged(mongo, api_key):
    # A6 customer id
    doc_a6 = mongo.customers.find_one({"user_id": POS_USER_ID, "phone": "0000000000"})
    assert doc_a6 is not None
    before_count = mongo.customers.count_documents({"user_id": POS_USER_ID, "phone": "0000000000"})
    body = {"pos_id": "0001", "restaurant_id": "69",
            "customer_phone": "0000000000",
            "bill_amount": 50, "order_id": "qa085a9"}
    r = requests.post(f"{API}/pos/webhook/payment-received", json=body,
                      headers=_h({"X-API-Key": api_key}), timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("success") is True
    after_count = mongo.customers.count_documents({"user_id": POS_USER_ID, "phone": "0000000000"})
    assert after_count == before_count, "duplicate invalid-phone customer created"
    CREATED_ORDERS.append("qa085a9")


# ---------- A10: POS /orders cust_mobile re-uses A5 customer ----------

def test_A10_pos_orders_cust_mobile(mongo, api_key):
    a5 = mongo.customers.find_one({"user_id": POS_USER_ID, "phone": "9000000123"})
    assert a5 is not None
    before = mongo.customers.count_documents({"user_id": POS_USER_ID, "phone": "9000000123"})
    body = {
        "pos_id": "0001", "restaurant_id": "69",
        "order_id": "qa085a10",
        "cust_mobile": "90000 00123",
        "order_amount": 150,
        "bill_amount": 150,
        "items": [{"item_name": "Tea", "qty": 1, "price": 150}],
    }
    r = requests.post(f"{API}/pos/orders", json=body,
                      headers=_h({"X-API-Key": api_key}), timeout=20)
    # Must link; must not create duplicate.
    assert r.status_code == 200, r.text
    after = mongo.customers.count_documents({"user_id": POS_USER_ID, "phone": "9000000123"})
    assert after == before, "duplicate customer created on POS order"
    CREATED_ORDERS.append("qa085a10")


# ---------- A13: CRM human-path reject ----------

def test_A13a_crm_post_customers_invalid(jwt_token):
    r = requests.post(f"{API}/customers",
                      json={"name": "TEST_Bad", "phone": "12345"},
                      headers=_h({"Authorization": f"Bearer {jwt_token}"}), timeout=15)
    assert r.status_code == 422, r.text
    assert "Enter a valid mobile number" in r.text


def test_A13b_crm_put_customers_invalid(mongo, jwt_token):
    # Need an existing customer we can PUT on. Create a valid one first.
    create_body = {"name": "TEST_A13", "phone": "9000000199"}
    rc = requests.post(f"{API}/customers", json=create_body,
                       headers=_h({"Authorization": f"Bearer {jwt_token}"}), timeout=15)
    assert rc.status_code in (200, 201), rc.text
    cust = rc.json()
    cid = cust.get("id") or cust.get("_id")
    CREATED_IDS.append(cid)
    CREATED_PHONES.append((POS_USER_ID, "9000000199"))
    r = requests.put(f"{API}/customers/{cid}",
                     json={"phone": "12345"},
                     headers=_h({"Authorization": f"Bearer {jwt_token}"}), timeout=15)
    assert r.status_code == 422, r.text
    assert "Enter a valid mobile number" in r.text


# ---------- A16: lookup for invalid is 400 AND flagged never returned ----------

def test_A16_lookup_invalid_rejected_flagged_hidden(api_key):
    # scan lookup (human path) must reject invalid
    r = requests.post(f"{API}/scan/auth/lookup",
                      json={"phone": "0000000000", "restaurant_id": "69"},
                      headers=_h(), timeout=15)
    assert r.status_code == 400, r.text

    # POS lookup for the same number: even though invalid, flagged customer must not be returned
    r2 = requests.post(f"{API}/pos/customer-lookup",
                       json={"pos_id": "0001", "restaurant_id": "69", "phone": "0000000000"},
                       headers=_h({"X-API-Key": api_key}), timeout=15)
    # POS path never 4xx on phone content
    assert r2.status_code == 200, r2.text
    j = r2.json()
    data = j.get("data") or {}
    assert data.get("registered") is not True and data.get("found") is not True, j


# ---------- A14: CSV import duplicate handling ----------

def test_A14_csv_import_dup_format(jwt_token, mongo):
    csv_data = "name,phone\nTEST_imp1,9876500001\nTEST_imp2,+91 98765 00001\n"
    files = {"file": ("t.csv", csv_data, "text/csv")}
    headers = {"Authorization": f"Bearer {jwt_token}", "X-Forwarded-For": _ip()}
    r = requests.post(f"{API}/customers/import", files=files, headers=headers, timeout=30)
    outcome = {"status": r.status_code, "body": r.text[:200]}
    if r.status_code == 400:
        outcome["result"] = "rejected_in_file_dup"
        assert "duplicate" in r.text.lower() or "already" in r.text.lower(), r.text
    else:
        assert r.status_code in (200, 201), r.text
        found = list(mongo.customers.find({"user_id": POS_USER_ID, "phone": "9876500001"}))
        assert len(found) <= 1, f"CSV import produced duplicates: {len(found)}"
        for d in found:
            CREATED_IDS.append(d.get("id") or str(d.get("_id")))
            CREATED_PHONES.append((POS_USER_ID, "9876500001"))
            outcome["result"] = "one_customer_cc=" + str(d.get("country_code"))
    print("A14 outcome:", outcome)


# ---------- A19: health ----------

def test_A19_health(jwt_token):
    r = requests.get(f"{API}/customers?limit=1",
                     headers={"Authorization": f"Bearer {jwt_token}", "X-Forwarded-For": _ip()},
                     timeout=15)
    assert r.status_code == 200, r.text


# ---------- Cleanup + A18 baseline assertion ----------

def test_ZZ_cleanup_and_baseline(mongo, baseline):
    # Delete orders
    for oid in CREATED_ORDERS:
        mongo.pos_orders.delete_many({"order_id": oid})
        mongo.orders.delete_many({"order_id": oid})
    # Delete customers created
    for uid, phone in CREATED_PHONES:
        mongo.customers.delete_many({"user_id": uid, "phone": phone})
    for cid in CREATED_IDS:
        if cid:
            mongo.customers.delete_many({"id": cid})
    final = mongo.customers.count_documents({})
    assert final == baseline, f"baseline drift: {baseline} -> {final}"
