"""
Backend tests for CR-079 (POS Customer Edit), CR-081 (POS Coupon Management), CR-080 (POS Loyalty & Wallet)
All endpoints use X-API-Key auth header.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API_KEY = "dp_live_HdEvMSha7Y67iSBMtN5nskuYzFc4HGe7zQgpWGBvxEY"
CUSTOMER_ID = "1779d4fc-7161-4407-ac8c-cce30beb3e53"
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

# Will be populated during test run
created_coupon_id = None


# ─────────────────────────── CR-079 ───────────────────────────

class TestCR079CustomerEdit:
    """CR-079: PUT /api/pos/customers/{id} - optional pos_id/restaurant_id"""

    # Abhishek Jain's real phone in DB
    PHONE = "7505242126"

    def test_v1_update_without_pos_id(self):
        """V1: update with only phone+name (no pos_id/restaurant_id) — should succeed"""
        r = requests.put(
            f"{BASE_URL}/api/pos/customers/{CUSTOMER_ID}",
            json={"name": "Abhishek Jain", "phone": self.PHONE},
            headers=HEADERS,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["success"] is True, f"Expected success=True: {data}"
        print("V1 PASS: update without pos_id succeeded")

    def test_v2_update_with_pos_id(self):
        """V2: update including pos_id+restaurant_id — backward compat"""
        r = requests.put(
            f"{BASE_URL}/api/pos/customers/{CUSTOMER_ID}",
            json={"name": "Abhishek Jain", "phone": self.PHONE, "pos_id": "mygenie", "restaurant_id": "689"},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True, f"Backward compat failed: {data}"
        print("V2 PASS: backward compat with pos_id/restaurant_id")

    def test_v3_response_has_full_customer_fields(self):
        """V3: response contains full customer fields (total_points, tier, wallet_balance, total_visits)"""
        r = requests.put(
            f"{BASE_URL}/api/pos/customers/{CUSTOMER_ID}",
            json={"name": "Abhishek Jain", "phone": self.PHONE},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        customer = data.get("data", {})
        for field in ["total_points", "tier", "wallet_balance", "total_visits"]:
            assert field in customer, f"Missing field '{field}' in response: {list(customer.keys())}"
        print("V3 PASS: full customer fields present")

    def test_v4_no_id_field_in_response(self):
        """V4: response has no _id field"""
        r = requests.put(
            f"{BASE_URL}/api/pos/customers/{CUSTOMER_ID}",
            json={"name": "Abhishek Jain", "phone": self.PHONE},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        customer = data.get("data", {})
        assert "_id" not in customer, f"_id should not be in response: {customer}"
        print("V4 PASS: no _id in response")

    def test_v5_nonexistent_customer_returns_success_false(self):
        """V5: non-existent customer_id returns success=false"""
        r = requests.put(
            f"{BASE_URL}/api/pos/customers/nonexistent-customer-000",
            json={"name": "Ghost", "phone": "0000000000"},
            headers=HEADERS,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["success"] is False, f"Expected success=False: {data}"
        print("V5 PASS: non-existent customer returns success=false")


# ─────────────────────────── CR-081 ───────────────────────────

class TestCR081CouponManagement:
    """CR-081: POS Coupon endpoints C-1 through C-8"""

    coupon_id = None  # shared across tests via class var

    def test_v1_list_coupons(self):
        """V1: GET /api/pos/coupons returns list with total"""
        r = requests.get(f"{BASE_URL}/api/pos/coupons", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert "coupons" in data["data"]
        assert "total" in data["data"]
        print(f"V1 PASS: list coupons total={data['data']['total']}")

    def test_v2_list_active_only(self):
        """V2: GET /api/pos/coupons?active_only=true returns only active coupons"""
        r = requests.get(f"{BASE_URL}/api/pos/coupons?active_only=true", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        coupons = data["data"]["coupons"]
        for c in coupons:
            assert c.get("is_active") is True, f"Inactive coupon returned: {c}"
        print(f"V2 PASS: active_only filter works, count={len(coupons)}")

    def test_v3_create_coupon(self):
        """V3: POST /api/pos/coupons creates a new coupon"""
        # cleanup first in case leftover
        r = requests.post(
            f"{BASE_URL}/api/pos/coupons",
            json={
                "code": "QATEST001",
                "discount_type": "percentage",
                "discount_value": 10.0,
                "start_date": "2026-01-01",
                "end_date": "2026-12-31",
                "min_order_value": 100.0,
                "description": "QA Test coupon",
            },
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        # May fail with duplicate if leftover; handle both
        if not data["success"] and "already exists" in data.get("message", ""):
            print("V3 NOTE: coupon already exists from prior run, fetching existing")
            list_r = requests.get(f"{BASE_URL}/api/pos/coupons", headers=HEADERS)
            coupons = list_r.json()["data"]["coupons"]
            for c in coupons:
                if c.get("code") == "QATEST001":
                    TestCR081CouponManagement.coupon_id = c["id"]
                    print(f"V3 PASS (existing): coupon_id={c['id']}")
                    return
        assert data["success"] is True, f"Create coupon failed: {data}"
        assert "coupon_id" in data["data"]
        TestCR081CouponManagement.coupon_id = data["data"]["coupon_id"]
        print(f"V3 PASS: coupon_id={TestCR081CouponManagement.coupon_id}")

    def test_v4_duplicate_code_fails(self):
        """V4: POST duplicate code returns success=false"""
        r = requests.post(
            f"{BASE_URL}/api/pos/coupons",
            json={"code": "QATEST001", "discount_type": "percentage", "discount_value": 5.0, "start_date": "2026-01-01", "end_date": "2026-12-31"},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is False
        assert "already exists" in data["message"].lower()
        print("V4 PASS: duplicate code rejected")

    def test_v5_update_coupon(self):
        """V5: PUT /api/pos/coupons/{id} updates discount_value"""
        cid = TestCR081CouponManagement.coupon_id
        assert cid, "No coupon_id available (V3 must run first)"
        r = requests.put(
            f"{BASE_URL}/api/pos/coupons/{cid}",
            json={"discount_value": 15.0},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert float(data["data"]["discount_value"]) == 15.0
        print("V5 PASS: discount_value updated to 15.0")

    def test_v6_toggle_coupon(self):
        """V6: POST /api/pos/coupons/{id}/toggle flips is_active"""
        cid = TestCR081CouponManagement.coupon_id
        assert cid
        # Get current state
        r0 = requests.get(f"{BASE_URL}/api/pos/coupons/{cid}", headers=HEADERS)
        current = r0.json()["data"]["is_active"]

        r = requests.post(f"{BASE_URL}/api/pos/coupons/{cid}/toggle", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert data["data"]["is_active"] is not current
        print(f"V6 PASS: is_active flipped {current} -> {data['data']['is_active']}")

    def test_v8_distribute_with_customer_id(self):
        """V8: POST /api/pos/coupons/{id}/distribute with customer_id records distribution"""
        cid = TestCR081CouponManagement.coupon_id
        assert cid
        r = requests.post(
            f"{BASE_URL}/api/pos/coupons/{cid}/distribute",
            json={"customer_id": CUSTOMER_ID, "note": "QA test distribution"},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert "distribution_id" in data["data"]
        print(f"V8 PASS: distributed, dist_id={data['data']['distribution_id']}")

    def test_v9_distribute_without_customer_id_fails(self):
        """V9: POST distribute without customer_id returns success=false"""
        cid = TestCR081CouponManagement.coupon_id
        assert cid
        r = requests.post(
            f"{BASE_URL}/api/pos/coupons/{cid}/distribute",
            json={"note": "no customer"},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is False
        print("V9 PASS: distribute without customer_id rejected")

    def test_v10_usage_returns_data(self):
        """V10: GET /api/pos/coupons/{id}/usage returns usage data"""
        cid = TestCR081CouponManagement.coupon_id
        assert cid
        r = requests.get(f"{BASE_URL}/api/pos/coupons/{cid}/usage", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert "usage" in data["data"]
        assert "total_discount" in data["data"]
        print(f"V10 PASS: usage data returned, records={len(data['data']['usage'])}")

    def test_v11_regression_available_coupons(self):
        """V11: GET /api/pos/coupons/available (existing endpoint) still works"""
        r = requests.get(
            f"{BASE_URL}/api/pos/coupons/available?customer_id={CUSTOMER_ID}&order_total=500",
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        print(f"V11 PASS: available coupons endpoint works, data={list(data['data'].keys())}")

    def test_v7_delete_coupon(self):
        """V7: DELETE /api/pos/coupons/{id} on non-campaign coupon succeeds"""
        cid = TestCR081CouponManagement.coupon_id
        assert cid
        r = requests.delete(f"{BASE_URL}/api/pos/coupons/{cid}", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        print(f"V7 PASS: coupon deleted, coupon_id={cid}")
        # Verify deletion
        r2 = requests.get(f"{BASE_URL}/api/pos/coupons/{cid}", headers=HEADERS)
        assert r2.json()["success"] is False
        print("V7 PASS: deleted coupon not found on subsequent GET")


# ─────────────────────────── CR-080 ───────────────────────────

class TestCR080LoyaltyWallet:
    """CR-080: POS Loyalty & Wallet endpoints L-1 through L-5"""

    def test_v1_loyalty_settings(self):
        """V1: GET /api/pos/loyalty/settings returns required fields"""
        r = requests.get(f"{BASE_URL}/api/pos/loyalty/settings", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        d = data["data"]
        for field in ["loyalty_enabled", "bronze_earn_percent", "tier_silver_min"]:
            assert field in d, f"Missing field: {field}"
        print(f"V1 PASS: loyalty_enabled={d['loyalty_enabled']}, bronze_earn_percent={d['bronze_earn_percent']}, tier_silver_min={d['tier_silver_min']}")

    def test_v2_points_history(self):
        """V2: GET /api/pos/customers/{id}/points-history returns transactions + current_balance"""
        r = requests.get(f"{BASE_URL}/api/pos/customers/{CUSTOMER_ID}/points-history", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        d = data["data"]
        assert "transactions" in d
        assert "current_balance" in d
        print(f"V2 PASS: current_balance={d['current_balance']}, transactions={len(d['transactions'])}")

    def test_v3_award_100_points(self):
        """V3: POST award 100 pts when loyalty enabled — should succeed"""
        r = requests.post(
            f"{BASE_URL}/api/pos/customers/{CUSTOMER_ID}/points/award",
            json={"points": 100, "description": "QA test bonus"},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True, f"Expected success for 100 pts award: {data}"
        assert data["data"]["points_awarded"] == 100
        print(f"V3 PASS: awarded 100 pts, new_balance={data['data']['new_balance']}")

    def test_v4_award_1001_points_fails(self):
        """V4: POST award 1001 pts returns success=false with message containing '1,000'"""
        r = requests.post(
            f"{BASE_URL}/api/pos/customers/{CUSTOMER_ID}/points/award",
            json={"points": 1001, "description": "Exceeds cap"},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is False
        assert "1,000" in data["message"], f"Expected '1,000' in message: {data['message']}"
        print(f"V4 PASS: 1001 pts rejected with message: {data['message']}")

    def test_v5_award_negative_points_fails(self):
        """V5: POST award negative points returns success=false"""
        r = requests.post(
            f"{BASE_URL}/api/pos/customers/{CUSTOMER_ID}/points/award",
            json={"points": -50},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is False
        print(f"V5 PASS: negative points rejected: {data['message']}")

    def test_v6_award_nonexistent_customer_fails(self):
        """V6: POST award on non-existent customer_id returns success=false"""
        r = requests.post(
            f"{BASE_URL}/api/pos/customers/nonexistent-cust-999/points/award",
            json={"points": 100},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is False
        print(f"V6 PASS: non-existent customer rejected: {data['message']}")

    def test_v7_wallet_history(self):
        """V7: GET /api/pos/customers/{id}/wallet-history returns current_balance and transactions"""
        r = requests.get(f"{BASE_URL}/api/pos/customers/{CUSTOMER_ID}/wallet-history", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        d = data["data"]
        assert "current_balance" in d
        assert "transactions" in d
        print(f"V7 PASS: wallet current_balance={d['current_balance']}, txs={len(d['transactions'])}")

    def test_v8_wallet_credit_without_payment_method_fails(self):
        """V8: POST wallet/credit without payment_method returns success=false"""
        r = requests.post(
            f"{BASE_URL}/api/pos/customers/{CUSTOMER_ID}/wallet/credit",
            json={"amount": 100.0},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is False
        print(f"V8 PASS: missing payment_method rejected: {data['message']}")

    def test_v9_wallet_credit_negative_amount_fails(self):
        """V9: POST wallet/credit with negative amount returns success=false"""
        r = requests.post(
            f"{BASE_URL}/api/pos/customers/{CUSTOMER_ID}/wallet/credit",
            json={"amount": -50.0, "payment_method": "cash"},
            headers=HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is False
        print(f"V9 PASS: negative amount rejected: {data['message']}")

    def test_v10_regression_loyalty_endpoint(self):
        """V10: GET /api/pos/customers/{id}/loyalty (existing) still works"""
        r = requests.get(f"{BASE_URL}/api/pos/customers/{CUSTOMER_ID}/loyalty", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        print(f"V10 PASS: loyalty endpoint works, data keys={list(data['data'].keys())}")
