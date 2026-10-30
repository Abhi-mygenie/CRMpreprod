"""Iteration 6 Phase A — CR-085-A2 independent QA (Q2..Q9).
Read-only against application code. Creates minimal test data cleaned at end.
"""
import os, time, json, uuid
import pytest
import requests
import pymongo
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO = pymongo.MongoClient(os.environ["MONGO_URL"])
db = MONGO["mygenie"]

OWNER_EMAIL = "owner@thegoankitchen.com"
OWNER_PASS = os.environ.get("CRM_TEST_OWNER_PASSWORD", "Qplazm@10")
POS_USER_ID = "pos_owner_69_bdd4513c"
_u = db.users.find_one({"id": POS_USER_ID})
API_KEY = _u["api_key"]
POS_ID = "0001"
RESTAURANT_ID = "69"

HDR_POS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_jwt():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASS},
                      timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_hdr(owner_jwt):
    return {"Authorization": f"Bearer {owner_jwt}", "Content-Type": "application/json"}


# globals for cleanup
CREATED = {"coupons": [], "customers": [], "pos_order_ids": []}


def _cleanup_order_artifacts(pos_order_id):
    """Delete orders and children for a given pos_order_id (string the POS sent)."""
    orders = list(db.orders.find({"pos_order_id": pos_order_id, "user_id": POS_USER_ID}))
    for o in orders:
        oid = o["id"]
        db.order_items.delete_many({"order_id": oid})
        db.invoices.delete_many({"order_id": oid})
        db.points_transactions.delete_many({"order_id": oid})
        db.wallet_transactions.delete_many({"order_id": oid})
        db.coupon_usage.delete_many({"order_id": oid})
        db.whatsapp_message_logs.delete_many({"reference_id": oid})
    db.orders.delete_many({"pos_order_id": pos_order_id, "user_id": POS_USER_ID})


def test_Q0_baseline():
    cnt = db.customers.count_documents({})
    print(f"\n[Q0] baseline customers={cnt}")
    assert cnt >= 7700


def test_Q2_guest_coupon(owner_hdr):
    # Create coupon via CRM
    today = datetime.utcnow().date()
    body = {
        "code": "QA085A2",
        "discount_type": "flat",
        "discount_value": 10,
        "start_date": (today - timedelta(days=1)).isoformat(),
        "end_date": (today + timedelta(days=1)).isoformat(),
        "min_order_value": 0,
        "applicable_channels": ["dine_in", "delivery", "takeaway"],
    }
    r = requests.post(f"{BASE}/api/coupons", headers=owner_hdr, json=body, timeout=20)
    assert r.status_code in (200, 201), f"coupon create: {r.status_code} {r.text}"
    coup = r.json()
    coup_id = coup.get("id") or coup.get("data", {}).get("id") or coup.get("_id")
    CREATED["coupons"].append(("QA085A2", coup_id))
    print(f"[Q2] coupon created id={coup_id}")

    pos_order_id = "qa085a2_v5"
    CREATED["pos_order_ids"].append(pos_order_id)

    pre_count = db.customers.count_documents({"user_id": POS_USER_ID})
    order = {
        "pos_id": POS_ID,
        "restaurant_id": RESTAURANT_ID,
        "order_id": pos_order_id,
        "cust_mobile": "0000000000",
        "order_amount": 120,
        "bill_amount": 120,
        "coupon_code": "QA085A2",
        "coupon_discount": 10,
        "order_type": "dine_in",
        "items": [{"item_name": "Tea", "qty": 1, "price": 120}],
    }
    r = requests.post(f"{BASE}/api/pos/orders", headers=HDR_POS, json=order, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    print(f"[Q2] response: {json.dumps(body)[:600]}")
    assert body.get("success") is True
    data = body.get("data", {})
    assert data.get("guest_order") is True, data
    assert data.get("customer_id") in (None, "", "null"), f"expected null, got {data.get('customer_id')}"

    cu_block = data.get("coupon_usage") or {}
    print(f"[Q2] coupon_usage block: {cu_block}")
    # Spec: data.coupon_usage.recorded true (or ok)
    assert cu_block.get("recorded") is True or cu_block.get("ok") is True, cu_block

    # Mongo: coupon_usage recorded with customer_id null
    o = db.orders.find_one({"pos_order_id": pos_order_id, "user_id": POS_USER_ID})
    assert o, "order not found"
    cu = list(db.coupon_usage.find({"order_id": o["id"]}))
    print(f"[Q2] coupon_usage rows: {len(cu)}; customer_ids: {[x.get('customer_id') for x in cu]}")
    assert len(cu) >= 1
    for row in cu:
        assert row.get("customer_id") in (None, "", "null"), row

    # no new customer
    post_count = db.customers.count_documents({"user_id": POS_USER_ID})
    assert post_count == pre_count, f"customer count changed {pre_count}->{post_count}"


def test_Q3_duplicate_order_replay():
    pos_order_id = "qa085a2_v5"
    order = {
        "pos_id": POS_ID,
        "restaurant_id": RESTAURANT_ID,
        "order_id": pos_order_id,
        "cust_mobile": "0000000000",
        "order_amount": 120,
        "bill_amount": 120,
        "items": [{"item_name": "Tea", "qty": 1, "price": 120}],
    }
    r = requests.post(f"{BASE}/api/pos/orders", headers=HDR_POS, json=order, timeout=20)
    assert r.status_code == 200
    body = r.json()
    print(f"[Q3] replay response: {json.dumps(body)[:300]}")
    assert body.get("success") is False
    msg = (body.get("message") or body.get("detail") or "").lower()
    assert "duplicate" in msg, f"missing duplicate word: {msg}"
    cnt = db.orders.count_documents({"pos_order_id": pos_order_id, "user_id": POS_USER_ID})
    assert cnt == 1, f"expected 1 order, got {cnt}"


def test_Q4_reads_tolerate_null_customer(owner_hdr):
    r = requests.get(f"{BASE}/api/customers?limit=5", headers=owner_hdr, timeout=20)
    assert r.status_code == 200, r.text

    # a real customer in r69 for the orders listing
    some_cust = db.customers.find_one({"user_id": POS_USER_ID, "phone": {"$ne": ""}})
    if some_cust:
        r = requests.get(f"{BASE}/api/pos/customers/{some_cust['id']}/orders",
                         headers=HDR_POS, timeout=20,
                         params={"pos_id": POS_ID, "restaurant_id": RESTAURANT_ID})
        print(f"[Q4] /pos/customers/{{id}}/orders: {r.status_code}")
        assert r.status_code in (200, 400, 404), r.text


def test_Q5_no_whatsapp_invoice_present():
    pos_order_id = "qa085a2_v5"
    o = db.orders.find_one({"pos_order_id": pos_order_id, "user_id": POS_USER_ID})
    assert o
    wa = db.whatsapp_message_logs.count_documents({"reference_id": o["id"]})
    print(f"[Q5] whatsapp logs for guest order: {wa}")
    assert wa == 0
    inv = db.invoices.find_one({"order_id": o["id"]})
    if inv is None:
        print("[Q5] NOTE: invoices doc missing — may be disabled on preview")
    else:
        print(f"[Q5] invoice customer_id={inv.get('customer_id')!r}")
        assert inv.get("customer_id") in (None, "", "null")


def test_Q6_payment_received_webhook_guest():
    pos_order_id = "qa085a2_q6"
    CREATED["pos_order_ids"].append(pos_order_id)
    pre = db.customers.count_documents({"user_id": POS_USER_ID})
    body = {
        "pos_id": POS_ID,
        "restaurant_id": RESTAURANT_ID,
        "customer_phone": "0000000000",
        "bill_amount": 100,
        "order_id": pos_order_id,
        "coupon_code": "QA085A2",
    }
    r = requests.post(f"{BASE}/api/pos/webhook/payment-received",
                      headers=HDR_POS, json=body, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    print(f"[Q6] response: {json.dumps(j)[:500]}")
    assert j.get("success") is True
    data = j.get("data", {})
    assert data.get("guest_order") is True, data
    assert data.get("customer_id") in (None, "", "null")
    ca = data.get("coupon_applied") or {}
    assert ca, f"coupon_applied missing: {data}"
    assert float(ca.get("discount", ca.get("discount_amount", 0))) == 10.0, ca
    assert float(data.get("final_bill_amount", -1)) == 90.0
    assert float(data.get("original_bill_amount", -1)) == 100.0
    post = db.customers.count_documents({"user_id": POS_USER_ID})
    assert post == pre, f"customer count moved {pre}->{post}"


def test_Q7_valid_phone_loyalty_regression():
    # Create fresh customer via POS /customers
    phone = "9000000777"
    r = requests.post(f"{BASE}/api/pos/customers", headers=HDR_POS,
                      json={"pos_id": POS_ID, "restaurant_id": RESTAURANT_ID,
                            "name": "TEST_Q7", "phone": phone},
                      timeout=20)
    assert r.status_code == 200, r.text
    cust = r.json().get("data") or r.json()
    cust_id = cust.get("customer_id") or cust.get("id")
    assert cust_id
    CREATED["customers"].append(cust_id)
    print(f"[Q7] customer_id={cust_id}")

    pos_order_id = "qa085a2_q7"
    CREATED["pos_order_ids"].append(pos_order_id)
    before = db.customers.find_one({"id": cust_id})
    pre_visits = before.get("total_visits", 0) or 0
    pre_spent = float(before.get("total_spent", 0) or 0)

    order = {
        "pos_id": POS_ID, "restaurant_id": RESTAURANT_ID,
        "order_id": pos_order_id,
        "cust_mobile": phone,
        "order_amount": 500, "bill_amount": 500,
        "items": [{"item_name": "Pizza", "qty": 1, "price": 500}],
    }
    r = requests.post(f"{BASE}/api/pos/orders", headers=HDR_POS, json=order, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    print(f"[Q7] response: {json.dumps(body)[:300]}")
    assert body.get("success") is True
    data = body.get("data", {})
    assert data.get("guest_order") is False, data
    assert data.get("customer_id") == cust_id, data
    assert "is_new_customer" in data and isinstance(data["is_new_customer"], bool), data

    after = db.customers.find_one({"id": cust_id})
    assert (after.get("total_visits", 0) or 0) == pre_visits + 1
    assert float(after.get("total_spent", 0) or 0) == pre_spent + 500

    # loyalty
    ls = db.loyalty_settings.find_one({"user_id": POS_USER_ID}) or {}
    enabled = bool(ls.get("loyalty_enabled"))
    o = db.orders.find_one({"pos_order_id": pos_order_id, "user_id": POS_USER_ID})
    pts_rows = list(db.points_transactions.find({"order_id": o["id"]}))
    pe = data.get("points_earned", 0) or 0
    print(f"[Q7] loyalty_enabled={enabled} points_earned={pe} pts_rows={len(pts_rows)}")
    if enabled:
        assert pe > 0
        assert len(pts_rows) >= 1
    else:
        assert pe == 0


def test_Q8_pos_customer_id_wins_over_invalid_phone():
    # The Q7 customer must still be present
    cust = db.customers.find_one({"user_id": POS_USER_ID, "name": "TEST_Q7"})
    assert cust, "Q7 customer missing"
    db.customers.update_one({"id": cust["id"]}, {"$set": {"pos_customer_id": "qa085a2_pcid"}})

    pos_order_id = "qa085a2_q8"
    CREATED["pos_order_ids"].append(pos_order_id)
    order = {
        "pos_id": POS_ID, "restaurant_id": RESTAURANT_ID,
        "order_id": pos_order_id,
        "cust_mobile": "0000000000",
        "user_id": "qa085a2_pcid",
        "order_amount": 200, "bill_amount": 200,
        "items": [{"item_name": "Soda", "qty": 1, "price": 200}],
    }
    r = requests.post(f"{BASE}/api/pos/orders", headers=HDR_POS, json=order, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    print(f"[Q8] response: {json.dumps(body)[:300]}")
    assert body.get("success") is True
    data = body.get("data", {})
    assert data.get("guest_order") is False, data
    assert data.get("customer_id") == cust["id"], f"expected pcid match, got {data}"


def test_Q9_a16_reverify():
    phone = "0000000000"
    # Create junk customer
    r = requests.post(f"{BASE}/api/pos/customers", headers=HDR_POS,
                      json={"pos_id": POS_ID, "restaurant_id": RESTAURANT_ID,
                            "name": "TEST_Q9_junk", "phone": phone},
                      timeout=20)
    assert r.status_code == 200, r.text
    jr = r.json()
    assert jr.get("success") is True
    jcust = jr.get("data") or jr
    jcust_id = jcust.get("customer_id") or jcust.get("id")
    CREATED["customers"].append(jcust_id)
    doc = db.customers.find_one({"id": jcust_id})
    assert doc and doc.get("phone_invalid") is True, doc

    # lookup must hide it
    for p in ["0000000000", "000-000-0000"]:
        r = requests.post(f"{BASE}/api/pos/customer-lookup",
                          headers=HDR_POS,
                          json={"pos_id": POS_ID, "restaurant_id": RESTAURANT_ID, "phone": p},
                          timeout=20)
        print(f"[Q9] lookup({p}) status={r.status_code} body={r.text[:200]}")
        assert r.status_code == 200
        j = r.json()
        # Expected: either success:false OR registered:false
        regd = (j.get("data") or {}).get("registered")
        assert j.get("success") is False or regd is False, f"flagged leaked: {j}"

    # valid phone from Q7 should still work (Q7 customer still exists at this point)
    r = requests.post(f"{BASE}/api/pos/customer-lookup",
                      headers=HDR_POS,
                      json={"pos_id": POS_ID, "restaurant_id": RESTAURANT_ID, "phone": "9000000777"},
                      timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    print(f"[Q9] valid lookup: {json.dumps(j)[:200]}")
    assert j.get("success") is True
    assert (j.get("data") or {}).get("registered") is True


def test_ZZ_cleanup(owner_hdr):
    # Delete all pos orders
    for pid in CREATED["pos_order_ids"]:
        _cleanup_order_artifacts(pid)
    # Delete customers
    for cid in CREATED["customers"]:
        db.customers.delete_one({"id": cid})
        db.points_transactions.delete_many({"customer_id": cid})
        db.wallet_transactions.delete_many({"customer_id": cid})
    # Delete coupon via API if possible, else Mongo
    for code, cid in CREATED["coupons"]:
        if cid:
            r = requests.delete(f"{BASE}/api/coupons/{cid}", headers=owner_hdr, timeout=20)
            print(f"[CLEAN] delete coupon {cid}: {r.status_code}")
        db.coupons.delete_many({"user_id": POS_USER_ID, "code": code})
        db.coupon_usage.delete_many({"coupon_code": code})

    cnt = db.customers.count_documents({})
    print(f"[CLEAN] final customers count={cnt}")
