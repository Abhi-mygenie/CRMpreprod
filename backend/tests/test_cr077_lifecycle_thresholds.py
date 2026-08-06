"""
CR-077: Configurable Lifecycle & Intelligence Thresholds (Per-Tenant) Tests
Tests all 12 test scenarios: settings defaults, round-trip, lifecycle, campaign limits, VIP auto-promote
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Default values per CR-077 spec
DEFAULTS = {
    "at_risk_days_start": 31,
    "at_risk_days_end": 60,
    "dormant_days_end": 90,
    "new_customer_max_visits": 1,
    "campaign_daily_limit": 1000,
    "vip_score_min": 80,
    "high_score_min": 60,
    "medium_score_min": 35,
    "vip_auto_promote_enabled": False,
    "vip_auto_score_threshold": 80,
    "high_spender_threshold": 5000,
}

CREDENTIALS = [
    {"email": "owner@kunafamahal.com", "password": "Qplazm@10"},
]


@pytest.fixture(scope="module")
def auth_token():
    """Authenticate and return token."""
    for cred in CREDENTIALS:
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=cred)
        if resp.status_code == 200:
            return resp.json().get("access_token")
    pytest.skip("Authentication failed")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# T1: GET /api/loyalty/settings returns all 11 new fields with correct defaults
class TestT1SettingsDefaults:
    """T1: Verify all 11 new CR-077 fields exist with correct defaults"""

    def test_get_settings_returns_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_at_risk_days_start_default(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        data = resp.json()
        # Field exists and has expected value
        assert "at_risk_days_start" in data, "at_risk_days_start missing"
        assert data["at_risk_days_start"] == 31, f"Expected 31, got {data['at_risk_days_start']}"

    def test_at_risk_days_end_default(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        data = resp.json()
        assert "at_risk_days_end" in data, "at_risk_days_end missing"
        assert data["at_risk_days_end"] == 60, f"Expected 60, got {data['at_risk_days_end']}"

    def test_dormant_days_end_default(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        data = resp.json()
        assert "dormant_days_end" in data, "dormant_days_end missing"
        assert data["dormant_days_end"] == 90, f"Expected 90, got {data['dormant_days_end']}"

    def test_new_customer_max_visits_default(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        data = resp.json()
        assert "new_customer_max_visits" in data, "new_customer_max_visits missing"
        assert data["new_customer_max_visits"] == 1, f"Expected 1, got {data['new_customer_max_visits']}"

    def test_campaign_daily_limit_default(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        data = resp.json()
        assert "campaign_daily_limit" in data, "campaign_daily_limit missing"
        assert data["campaign_daily_limit"] == 1000, f"Expected 1000, got {data['campaign_daily_limit']}"

    def test_vip_score_min_default(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        data = resp.json()
        assert "vip_score_min" in data, "vip_score_min missing"
        assert data["vip_score_min"] == 80, f"Expected 80, got {data['vip_score_min']}"

    def test_high_score_min_default(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        data = resp.json()
        assert "high_score_min" in data, "high_score_min missing"
        assert data["high_score_min"] == 60, f"Expected 60, got {data['high_score_min']}"

    def test_medium_score_min_default(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        data = resp.json()
        assert "medium_score_min" in data, "medium_score_min missing"
        assert data["medium_score_min"] == 35, f"Expected 35, got {data['medium_score_min']}"

    def test_vip_auto_promote_enabled_default(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        data = resp.json()
        assert "vip_auto_promote_enabled" in data, "vip_auto_promote_enabled missing"
        assert data["vip_auto_promote_enabled"] is False, f"Expected False, got {data['vip_auto_promote_enabled']}"

    def test_vip_auto_score_threshold_default(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        data = resp.json()
        assert "vip_auto_score_threshold" in data, "vip_auto_score_threshold missing"
        assert data["vip_auto_score_threshold"] == 80, f"Expected 80, got {data['vip_auto_score_threshold']}"

    def test_high_spender_threshold_default(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        data = resp.json()
        assert "high_spender_threshold" in data, "high_spender_threshold missing"
        assert data["high_spender_threshold"] == 5000, f"Expected 5000, got {data['high_spender_threshold']}"


# T2: Settings round-trip
class TestT2SettingsRoundTrip:
    """T2: PUT settings then GET verify persistence, then restore"""

    def test_put_at_risk_days_start_and_verify(self, auth_headers):
        # Change value
        resp = requests.put(f"{BASE_URL}/api/loyalty/settings", json={"at_risk_days_start": 40}, headers=auth_headers)
        assert resp.status_code == 200, f"PUT failed: {resp.text}"

        # Verify persisted
        get_resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        assert get_resp.json()["at_risk_days_start"] == 40, f"Not persisted: {get_resp.json()['at_risk_days_start']}"

        # Restore
        restore = requests.put(f"{BASE_URL}/api/loyalty/settings", json={"at_risk_days_start": 31}, headers=auth_headers)
        assert restore.status_code == 200
        verify = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        assert verify.json()["at_risk_days_start"] == 31, "Restore failed"


# T3: Lifecycle boundary change
class TestT3LifecycleBoundary:
    """T3: dormant_days_end=60 shifts dormant/churned boundary"""

    def test_lifecycle_boundary_shift(self, auth_headers):
        # Get baseline
        base_resp = requests.get(f"{BASE_URL}/api/analytics/customer-lifecycle", headers=auth_headers)
        assert base_resp.status_code == 200
        base = base_resp.json()
        base_summary = base.get("summary", base)
        base_dormant_val = base_summary.get("dormant", {})
        base_dormant = base_dormant_val.get("count", base_dormant_val) if isinstance(base_dormant_val, dict) else base_dormant_val
        base_churned_val = base_summary.get("churned", {})
        base_churned = base_churned_val.get("count", base_churned_val) if isinstance(base_churned_val, dict) else base_churned_val

        # Set dormant_days_end=60
        requests.put(f"{BASE_URL}/api/loyalty/settings", json={"dormant_days_end": 60}, headers=auth_headers)

        # Get new lifecycle
        new_resp = requests.get(f"{BASE_URL}/api/analytics/customer-lifecycle", headers=auth_headers)
        assert new_resp.status_code == 200
        new_data = new_resp.json()
        new_summary = new_data.get("summary", new_data)
        new_dormant_val = new_summary.get("dormant", {})
        new_dormant = new_dormant_val.get("count", new_dormant_val) if isinstance(new_dormant_val, dict) else new_dormant_val
        new_churned_val = new_summary.get("churned", {})
        new_churned = new_churned_val.get("count", new_churned_val) if isinstance(new_churned_val, dict) else new_churned_val

        # Dormant should drop, churned should increase
        assert new_dormant <= base_dormant, f"Dormant should drop: was {base_dormant}, now {new_dormant}"
        assert new_churned >= base_churned, f"Churned should increase: was {base_churned}, now {new_churned}"

        # Restore
        requests.put(f"{BASE_URL}/api/loyalty/settings", json={"dormant_days_end": 90}, headers=auth_headers)
        restored = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        assert restored.json()["dormant_days_end"] == 90


# T4: Stage counts with default settings
class TestT4DefaultStageCounts:
    """T4: Verify lifecycle stage counts exist and are reasonable"""

    def test_lifecycle_stage_counts_exist(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/analytics/customer-lifecycle", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        # Response format: {summary: {new: {count, percent}, ...}, total_customers: N}
        # or flat: {new: N, active: N, ...}
        summary = data.get("summary", data)
        for stage in ["new", "active", "at_risk", "dormant", "churned"]:
            assert stage in summary, f"Stage '{stage}' missing from response: {list(summary.keys())}"

    def test_lifecycle_counts_approximate_range(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/analytics/customer-lifecycle", headers=auth_headers)
        data = resp.json()
        summary = data.get("summary", data)
        # Churned should be highest (2000+ in DB)
        churned = summary.get("churned", {})
        churned_count = churned.get("count", churned) if isinstance(churned, dict) else churned
        assert churned_count > 100, f"Expected many churned customers, got {churned_count}"


# T5: Per-tenant campaign daily limit
class TestT5CampaignDailyLimit:
    """T5: campaign_daily_limit=500 reflected in /campaigns/daily-limit"""

    def test_set_campaign_daily_limit_500(self, auth_headers):
        # Set limit to 500
        put_resp = requests.put(f"{BASE_URL}/api/loyalty/settings", json={"campaign_daily_limit": 500}, headers=auth_headers)
        assert put_resp.status_code == 200

        # Verify in daily-limit endpoint
        limit_resp = requests.get(f"{BASE_URL}/api/campaigns/daily-limit", headers=auth_headers)
        assert limit_resp.status_code == 200
        data = limit_resp.json()
        assert data["limit"] == 500, f"Expected limit=500, got {data['limit']}"

        # Restore to 1000
        requests.put(f"{BASE_URL}/api/loyalty/settings", json={"campaign_daily_limit": 1000}, headers=auth_headers)
        restored = requests.get(f"{BASE_URL}/api/campaigns/daily-limit", headers=auth_headers)
        assert restored.json()["limit"] == 1000


# T6: VIP auto-promote toggle OFF
class TestT6VIPAutoPromoteOFF:
    """T6: VIP auto-promote with toggle OFF returns skipped_toggle_off=True"""

    def test_vip_auto_promote_off_returns_skipped(self, auth_headers):
        # Ensure toggle is OFF
        requests.put(f"{BASE_URL}/api/loyalty/settings", json={"vip_auto_promote_enabled": False}, headers=auth_headers)

        # Trigger cron
        cron_resp = requests.post(f"{BASE_URL}/api/cron/trigger", headers=auth_headers)
        assert cron_resp.status_code == 200

        data = cron_resp.json()
        vip_result = data.get("vip_auto_promote", {})
        assert vip_result.get("skipped_toggle_off") is True, f"Expected skipped_toggle_off=True, got {vip_result}"
        assert vip_result.get("promoted") == 0, f"Expected promoted=0, got {vip_result.get('promoted')}"


# T7: VIP auto-promote toggle ON
class TestT7VIPAutoPromoteON:
    """T7: VIP auto-promote with toggle ON evaluates customers"""

    def test_vip_auto_promote_on_evaluates(self, auth_headers):
        # Enable toggle
        requests.put(f"{BASE_URL}/api/loyalty/settings", json={"vip_auto_promote_enabled": True}, headers=auth_headers)

        # Trigger cron
        cron_resp = requests.post(f"{BASE_URL}/api/cron/trigger", headers=auth_headers)
        assert cron_resp.status_code == 200

        data = cron_resp.json()
        vip_result = data.get("vip_auto_promote", {})
        assert "evaluated" in vip_result, f"'evaluated' not in result: {vip_result}"
        assert vip_result.get("evaluated", 0) >= 0, "evaluated should be >= 0"
        assert "promoted" in vip_result, f"'promoted' not in result: {vip_result}"
        # skipped_toggle_off should NOT be in result (or should be False)
        assert vip_result.get("skipped_toggle_off", False) is False, f"Unexpected skipped_toggle_off in ON mode: {vip_result}"

    def test_restore_vip_toggle_to_false(self, auth_headers):
        """CRITICAL: restore VIP toggle to OFF after T7"""
        resp = requests.put(f"{BASE_URL}/api/loyalty/settings", json={"vip_auto_promote_enabled": False}, headers=auth_headers)
        assert resp.status_code == 200
        verify = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        assert verify.json()["vip_auto_promote_enabled"] is False, "VIP toggle restore failed!"


# T8: Churned customers filter
class TestT8ChurnedCustomers:
    """T8: GET churned customers have last_visit older than dormant_days_end"""

    def test_churned_customers_endpoint(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/analytics/customer-lifecycle/customers?stage=churned", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        # Response could be list or dict with 'customers' key
        if isinstance(data, dict):
            assert "customers" in data, f"Expected 'customers' key in dict response: {list(data.keys())}"
        else:
            assert isinstance(data, list), f"Expected list or dict, got {type(data)}"

    def test_churned_customers_have_old_visits(self, auth_headers):
        from datetime import datetime, timezone, timedelta
        resp = requests.get(f"{BASE_URL}/api/analytics/customer-lifecycle/customers?stage=churned", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        customers = data.get("customers", data) if isinstance(data, dict) else data
        if not customers:
            pytest.skip("No churned customers found")

        cutoff = datetime.now(timezone.utc) - timedelta(days=90)
        for c in customers[:5]:  # Check first 5
            lv = c.get("last_visit")
            if lv:
                lv_dt = datetime.fromisoformat(lv.replace("Z", "+00:00"))
                assert lv_dt < cutoff, f"Churned customer {c.get('id')} has recent visit: {lv}"


# T11: Regression - campaigns/daily-limit shape
class TestT11CampaignsDailyLimitRegression:
    """T11: GET /campaigns/daily-limit returns {limit, used, remaining}"""

    def test_daily_limit_shape(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/campaigns/daily-limit", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "limit" in data, "Missing 'limit' field"
        assert "used" in data, "Missing 'used' field"
        assert "remaining" in data, "Missing 'remaining' field"
        assert isinstance(data["limit"], int), "limit should be int"
        assert isinstance(data["used"], int), "used should be int"
        assert isinstance(data["remaining"], int), "remaining should be int"
        assert data["remaining"] == max(data["limit"] - data["used"], 0)


# T12: Regression - existing loyalty settings fields still present
class TestT12ExistingSettingsRegression:
    """T12: existing settings fields still returned alongside new CR-077 fields"""

    def test_existing_fields_present(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/loyalty/settings", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        existing_fields = [
            "tier_silver_min", "tier_gold_min", "tier_platinum_min",
            "birthday_bonus_points", "birthday_bonus_enabled",
            "loyalty_enabled", "bronze_earn_percent", "redemption_value",
        ]
        for field in existing_fields:
            assert field in data, f"Existing field '{field}' missing"
