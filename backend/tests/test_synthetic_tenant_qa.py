"""
Synthetic-tenant QA verification test.

Scoped strictly to a self-registered tenant. Never touches other tenants.
Cleanup at end deletes all synthetic docs by user_id.

Rules honored:
  * NEVER call campaign /send, /test-send, /resend, /pause, /resume.
  * NEVER touch templates / authkey / meta.
  * NEVER set authkey_api_key on synthetic tenant.
  * Only fake phones 0000000xxx.
"""
import os
import time
import uuid
import json
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://crm-preprod-preview-3.preview.emergentagent.com",
).rstrip("/")

TS = int(time.time())
TENANT_EMAIL = f"qa-synthetic-{TS}@qacrmtest.io"
TENANT_PASSWORD = "QaSynth!Str0ng-Pw#2026"
TENANT_RESTAURANT = "QA Synthetic Restaurant"
TENANT_PHONE = "0000000000"

CUSTOMER_PHONES = ["0000000001", "0000000002", "0000000003"]

state: dict = {
    "user_id": None,
    "token": None,
    "api_key": None,
    "customers": [],          # list of dicts {id, phone, ...}
    "segment_id": None,
    "coupon_id": None,
    "coupon_code": None,
    "campaign_ids": [],
    "orders_created": [],     # list of pos_order_ids
    "results": [],            # (name, passed, detail)
}


def _rec(name, passed, detail=""):
    state["results"].append((name, passed, detail))
    print(f"[{'PASS' if passed else 'FAIL'}] {name} :: {detail}")


def _hdr_bearer():
    return {"Authorization": f"Bearer {state['token']}", "Content-Type": "application/json"}


def _hdr_apikey():
    return {"X-API-Key": state["api_key"], "Content-Type": "application/json"}


# -------------------- Health --------------------
def test_00_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200, r.text
    _rec("health", True, r.text[:80])


# -------------------- Register + /me --------------------
def test_01_register_and_me():
    payload = {
        "email": TENANT_EMAIL,
        "password": TENANT_PASSWORD,
        "restaurant_name": TENANT_RESTAURANT,
        "phone": TENANT_PHONE,
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    body = r.json()
    state["token"] = body["access_token"]
    state["user_id"] = body["user"]["id"]
    assert body["user"]["email"] == TENANT_EMAIL

    r2 = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr_bearer(), timeout=15)
    assert r2.status_code == 200, r2.text
    me = r2.json()
    assert me["id"] == state["user_id"]
    assert me["email"] == TENANT_EMAIL
    _rec("register+me", True, f"user_id={state['user_id']}")

    # api_key comes from GET /api/pos/api-key
    r3 = requests.get(f"{BASE_URL}/api/pos/api-key", headers=_hdr_bearer(), timeout=15)
    assert r3.status_code == 200, r3.text
    ak = r3.json()
    state["api_key"] = ak.get("api_key") or ak.get("apiKey") or ak.get("data", {}).get("api_key")
    assert state["api_key"], f"no api key: {ak}"
    _rec("pos-api-key", True, f"len={len(state['api_key'])}")


# -------------------- Customers via POS create --------------------
def test_02_customers_create_via_pos():
    for i, phone in enumerate(CUSTOMER_PHONES, start=1):
        payload = {
            "pos_id": "qatest",
            "restaurant_id": "qa-restaurant-1",
            "name": f"QA Customer {i}",
            "phone": phone,
            "country_code": "+91",
            "email": f"qa{i}@qacrmtest.io",
        }
        r = requests.post(
            f"{BASE_URL}/api/pos/customers", headers=_hdr_apikey(), json=payload, timeout=20
        )
        assert r.status_code == 200, f"pos create customer {phone}: {r.status_code} {r.text}"
        body = r.json()
        # POSResponse: {"success": true, "data": {...}}
        cust = body.get("data") or {}
        cid = cust.get("id") or cust.get("customer_id") or cust.get("customer", {}).get("id")
        assert cid, f"no customer id in response: {body}"
        state["customers"].append({"id": cid, "phone": phone})
    _rec("pos-create-customers", True, f"count={len(state['customers'])}")


def test_03_list_customers_crm():
    r = requests.get(f"{BASE_URL}/api/customers", headers=_hdr_bearer(), timeout=20)
    assert r.status_code == 200, r.text
    lst = r.json()
    assert isinstance(lst, list)
    phones = {c["phone"] for c in lst}
    for p in CUSTOMER_PHONES:
        assert p in phones, f"customer {p} missing from CRM listing"
    _rec("crm-list-customers", True, f"count={len(lst)}")


def test_04_get_and_update_customer():
    c = state["customers"][0]
    r = requests.get(f"{BASE_URL}/api/customers/{c['id']}", headers=_hdr_bearer(), timeout=15)
    assert r.status_code == 200, r.text
    _rec("get-customer-detail", True, "")

    r2 = requests.put(
        f"{BASE_URL}/api/customers/{c['id']}",
        headers=_hdr_bearer(),
        json={"name": "QA Customer 1 Updated"},
        timeout=15,
    )
    assert r2.status_code == 200, r2.text
    assert r2.json().get("name") == "QA Customer 1 Updated"
    _rec("update-customer", True, "")


# -------------------- Segments CRUD --------------------
def test_05_segments_crud():
    r = requests.post(
        f"{BASE_URL}/api/segments",
        headers=_hdr_bearer(),
        json={"name": "QA Test Segment", "filters": {"tier": ["Bronze"]}},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    seg = r.json()
    state["segment_id"] = seg["id"]

    r2 = requests.get(f"{BASE_URL}/api/segments", headers=_hdr_bearer(), timeout=15)
    assert r2.status_code == 200
    assert any(s["id"] == state["segment_id"] for s in r2.json())

    r3 = requests.put(
        f"{BASE_URL}/api/segments/{state['segment_id']}",
        headers=_hdr_bearer(),
        json={"name": "QA Test Segment Renamed"},
        timeout=15,
    )
    assert r3.status_code == 200
    assert r3.json()["name"] == "QA Test Segment Renamed"

    r4 = requests.delete(
        f"{BASE_URL}/api/segments/{state['segment_id']}", headers=_hdr_bearer(), timeout=15
    )
    assert r4.status_code == 200
    state["segment_id"] = None
    _rec("segments-crud", True, "create+list+update+delete")


# -------------------- Loyalty settings --------------------
def test_06_loyalty_settings_get_and_update():
    r = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=_hdr_bearer(), timeout=15)
    assert r.status_code == 200, r.text
    orig = r.json()
    orig_earn = orig.get("bronze_earn_percent")
    assert orig_earn is not None

    # Update canonical field (schema: bronze_earn_percent)
    update_body = {"bronze_earn_percent": 7.5}
    r2 = requests.put(
        f"{BASE_URL}/api/loyalty/settings",
        headers=_hdr_bearer(),
        json=update_body,
        timeout=15,
    )
    assert r2.status_code == 200, r2.text
    # Confirm persisted via re-fetch
    r3 = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=_hdr_bearer(), timeout=15)
    ep = r3.json().get("bronze_earn_percent")
    assert ep == 7.5, f"expected 7.5, got {ep}"
    _rec(
        "loyalty-settings",
        True,
        f"orig={orig_earn} after={ep}",
    )


# -------------------- POS orders --------------------
def test_07_pos_orders_ingest():
    cust = state["customers"][0]
    order_id = f"qaord-{TS}-{uuid.uuid4().hex[:6]}"
    payload = {
        "pos_id": "qatest",
        "restaurant_id": "qa-restaurant-1",
        "order_id": order_id,
        "cust_mobile": cust["phone"],
        "cust_name": "QA Customer 1 Updated",
        "order_amount": 500.0,
        "order_sub_total_amount": 500.0,
        "order_status": "completed",
        "payment_status": "paid",
        "payment_method": "cash",
        "order_type": "dine_in",
    }
    r = requests.post(
        f"{BASE_URL}/api/pos/orders", headers=_hdr_apikey(), json=payload, timeout=25
    )
    assert r.status_code == 200, f"pos/orders: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("success") is True, body
    state["orders_created"].append(order_id)

    # Verify customer stats incremented
    r2 = requests.get(
        f"{BASE_URL}/api/customers/{cust['id']}", headers=_hdr_bearer(), timeout=15
    )
    d = r2.json()
    assert d["total_visits"] >= 1
    assert d["total_spent"] >= 500.0
    # points may or may not be > 0 depending on loyalty_enabled default; log it
    _rec(
        "pos-order",
        True,
        f"visits={d['total_visits']} spent={d['total_spent']} points={d.get('total_points')}",
    )


# -------------------- Coupons --------------------
def test_08_coupons_flat_flow():
    code = f"QATEST{TS}"
    state["coupon_code"] = code
    now = datetime.now(timezone.utc)
    payload = {
        "code": code,
        "discount_type": "flat",
        "discount_value": 50.0,
        "start_date": (now - timedelta(hours=1)).isoformat(),
        "end_date": (now + timedelta(days=7)).isoformat(),
        "min_order_value": 100.0,
        "applicable_channels": ["pos", "dine_in", "takeaway", "delivery"],
        "title": "QA Flat Rs50 off",
    }
    r = requests.post(
        f"{BASE_URL}/api/coupons", headers=_hdr_bearer(), json=payload, timeout=15
    )
    assert r.status_code == 200, r.text
    state["coupon_id"] = r.json()["id"]

    r2 = requests.get(f"{BASE_URL}/api/coupons", headers=_hdr_bearer(), timeout=15)
    assert r2.status_code == 200 and any(c["id"] == state["coupon_id"] for c in r2.json())

    # POS validate
    cust = state["customers"][1]
    r3 = requests.post(
        f"{BASE_URL}/api/pos/coupons/validate",
        headers=_hdr_apikey(),
        json={"code": code, "customer_id": cust["id"], "order_total": 400.0, "channel": "pos"},
        timeout=15,
    )
    assert r3.status_code == 200, r3.text
    v = r3.json()
    assert v.get("success") is True, v
    data = v["data"]
    assert abs(data["computed_discount"] - 50.0) < 0.01, data

    # POS apply (deprecated but idempotent path)
    order_id = f"qacoup-{TS}-{uuid.uuid4().hex[:6]}"
    apply_url = (
        f"{BASE_URL}/api/pos/coupons/apply?code={code}&customer_id={cust['id']}&order_value=400&channel=pos"
    )
    r4 = requests.post(apply_url, headers=_hdr_apikey(), timeout=15)
    assert r4.status_code == 200, r4.text

    # Send an order carrying the coupon → this exercises the idempotent per-order
    # coupon_usage path.
    payload_ord = {
        "pos_id": "qatest",
        "restaurant_id": "qa-restaurant-1",
        "order_id": order_id,
        "cust_mobile": cust["phone"],
        "order_amount": 350.0,
        "order_sub_total_amount": 400.0,
        "coupon_code": code,
        "coupon_discount": 50.0,
        "order_status": "completed",
    }
    r5 = requests.post(f"{BASE_URL}/api/pos/orders", headers=_hdr_apikey(), json=payload_ord, timeout=20)
    assert r5.status_code == 200, r5.text
    state["orders_created"].append(order_id)

    # Idempotency: same order_id twice
    r6 = requests.post(f"{BASE_URL}/api/pos/orders", headers=_hdr_apikey(), json=payload_ord, timeout=20)
    # Duplicate order returns success=false with duplicate flag
    body6 = r6.json()
    assert r6.status_code == 200 and body6.get("data", {}).get("duplicate") is True, body6

    _rec("coupons-flow", True, "create+validate+apply+order-idempotency")


# -------------------- Analytics --------------------
def test_09_analytics_dashboard():
    r = requests.get(f"{BASE_URL}/api/analytics/dashboard", headers=_hdr_bearer(), timeout=25)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["total_customers"] >= 3, d
    assert d["total_orders"] >= 2, d
    _rec(
        "analytics-dashboard",
        True,
        f"customers={d['total_customers']} orders={d['total_orders']} revenue={d.get('total_revenue')}",
    )


# -------------------- Campaigns DRAFT-only --------------------
def test_10_campaigns_draft_only():
    r = requests.post(
        f"{BASE_URL}/api/campaigns",
        headers=_hdr_bearer(),
        json={"name": "QA Draft Campaign", "audience_id": "all-customers", "audience_name": "All"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    state["campaign_ids"].append(cid)

    r2 = requests.get(f"{BASE_URL}/api/campaigns", headers=_hdr_bearer(), timeout=15)
    assert r2.status_code == 200 and any(c["id"] == cid for c in r2.json())

    r3 = requests.put(
        f"{BASE_URL}/api/campaigns/{cid}",
        headers=_hdr_bearer(),
        json={"name": "QA Draft Campaign Edited"},
        timeout=15,
    )
    assert r3.status_code == 200 and r3.json()["name"] == "QA Draft Campaign Edited"

    r4 = requests.post(
        f"{BASE_URL}/api/campaigns/{cid}/clone", headers=_hdr_bearer(), timeout=15
    )
    assert r4.status_code == 200
    clone_id = r4.json()["id"]
    state["campaign_ids"].append(clone_id)
    assert r4.json()["status"] == "draft"

    # Delete both drafts
    for c in list(state["campaign_ids"]):
        rd = requests.delete(f"{BASE_URL}/api/campaigns/{c}", headers=_hdr_bearer(), timeout=15)
        assert rd.status_code == 200, rd.text
        state["campaign_ids"].remove(c)
    _rec("campaigns-draft-crud", True, "create+list+update+clone+delete (no send)")


# -------------------- Cleanup --------------------
def test_99_cleanup_synthetic_data():
    """Direct Mongo delete of every doc referencing synthetic user_id."""
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    from pymongo import MongoClient

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = MongoClient(mongo_url)
    dbm = client[db_name]

    uid = state["user_id"]
    assert uid, "no synthetic user_id captured, refusing cleanup"

    # collections keyed directly by user_id
    by_user_id = [
        "users", "loyalty_settings", "customers", "orders", "order_items",
        "points_transactions", "coupons", "segments", "campaigns", "campaign_runs",
        "whatsapp_message_logs", "feedback", "invoices", "wallet_transactions",
        "coupon_transactions", "loyalty_mismatch_logs", "otp_tokens",
        "segment_whatsapp_config", "import_history", "custom_templates",
    ]
    counts = {}
    for col in by_user_id:
        if col == "users":
            res = dbm[col].delete_many({"id": uid})
        else:
            res = dbm[col].delete_many({"user_id": uid})
        counts[col] = res.deleted_count

    # coupon_usage: keyed by coupon_id/customer_id → clean up by our customer_ids and coupon_ids
    cust_ids = [c["id"] for c in state["customers"]]
    if cust_ids:
        res = dbm["coupon_usage"].delete_many({"customer_id": {"$in": cust_ids}})
        counts["coupon_usage"] = res.deleted_count

    # verify zero remain
    remaining = {}
    for col in by_user_id:
        if col == "users":
            n = dbm[col].count_documents({"id": uid})
        else:
            n = dbm[col].count_documents({"user_id": uid})
        if n > 0:
            remaining[col] = n

    print("CLEANUP counts:", json.dumps(counts, indent=2))
    print("CLEANUP remaining:", json.dumps(remaining, indent=2))
    assert not remaining, f"synthetic docs remain: {remaining}"
    _rec("cleanup", True, f"deleted={counts}")


if __name__ == "__main__":
    # allow: python -m pytest style call OR direct
    for fn in [
        test_00_health,
        test_01_register_and_me,
        test_02_customers_create_via_pos,
        test_03_list_customers_crm,
        test_04_get_and_update_customer,
        test_05_segments_crud,
        test_06_loyalty_settings_get_and_update,
        test_07_pos_orders_ingest,
        test_08_coupons_flat_flow,
        test_09_analytics_dashboard,
        test_10_campaigns_draft_only,
        test_99_cleanup_synthetic_data,
    ]:
        try:
            fn()
        except Exception as e:
            _rec(fn.__name__, False, f"{type(e).__name__}: {e}")

    passed = sum(1 for _, ok, _ in state["results"] if ok)
    print(f"\n=== SUMMARY: {passed}/{len(state['results'])} steps passed ===")
