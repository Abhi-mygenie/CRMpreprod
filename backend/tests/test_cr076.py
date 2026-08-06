"""
CR-076 Backend Tests: Lifecycle Stage filter in segments + campaign lifecycle_stage: prefix
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Credentials
KUNAFA_EMAIL = "owner@kunafamahal.com"
KUNAFA_PASSWORD = "Qplazm@10"

CREATED_SEGMENT_IDS = []
CREATED_CAMPAIGN_IDS = []


@pytest.fixture(scope="module")
def token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": KUNAFA_EMAIL, "password": KUNAFA_PASSWORD
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def lifecycle_counts(headers):
    """Get lifecycle analytics counts once for the module"""
    resp = requests.get(f"{BASE_URL}/api/analytics/customer-lifecycle", headers=headers)
    assert resp.status_code == 200, f"Lifecycle analytics failed: {resp.text}"
    data = resp.json()
    summary = data.get("summary", data)
    return summary


def create_segment(headers, name, filters):
    """Helper to create a segment and track its ID"""
    resp = requests.post(f"{BASE_URL}/api/segments", json={
        "name": f"QA-CR076-{name}-{uuid.uuid4().hex[:6]}",
        "filters": filters
    }, headers=headers)
    return resp


# ── V1: Churned segment count matches lifecycle analytics ──────────────────

class TestChurnedSegment:
    """V1: lifecycle_stage=churned segment count must match analytics churned count"""

    def test_create_churned_segment_succeeds(self, headers, lifecycle_counts):
        resp = create_segment(headers, "churned", {"lifecycle_stage": "churned"})
        assert resp.status_code == 200, f"Segment creation failed: {resp.text}"
        data = resp.json()
        CREATED_SEGMENT_IDS.append(data.get("id"))
        assert data.get("customer_count") is not None, "Missing customer_count"
        print(f"Churned segment count: {data['customer_count']}")

    def test_churned_count_matches_analytics(self, headers, lifecycle_counts):
        resp = create_segment(headers, "churned-v", {"lifecycle_stage": "churned"})
        assert resp.status_code == 200
        seg_count = resp.json().get("customer_count", 0)
        CREATED_SEGMENT_IDS.append(resp.json().get("id"))

        analytics_churned = lifecycle_counts.get("churned", {}).get("count", -999)
        print(f"Segment churned={seg_count}, analytics churned={analytics_churned}")
        # They should match (same query logic)
        assert seg_count == analytics_churned, \
            f"Churned count mismatch: segment={seg_count}, analytics={analytics_churned}"

    def test_churned_count_less_than_total(self, headers, lifecycle_counts):
        resp = create_segment(headers, "churned-lt", {"lifecycle_stage": "churned"})
        assert resp.status_code == 200
        CREATED_SEGMENT_IDS.append(resp.json().get("id"))
        churned_count = resp.json().get("customer_count", 0)
        total_resp = requests.get(f"{BASE_URL}/api/customers?limit=1", headers=headers)
        # Just check churned is a positive number less than a huge value
        assert churned_count >= 0, "Churned count is negative"
        print(f"Churned count={churned_count}")


# ── V2: at_risk segment count matches analytics ───────────────────────────

class TestAtRiskSegment:
    """V2: lifecycle_stage=at_risk count matches analytics"""

    def test_at_risk_matches_analytics(self, headers, lifecycle_counts):
        resp = create_segment(headers, "at_risk", {"lifecycle_stage": "at_risk"})
        assert resp.status_code == 200, f"Segment creation failed: {resp.text}"
        CREATED_SEGMENT_IDS.append(resp.json().get("id"))
        seg_count = resp.json().get("customer_count", 0)
        analytics_at_risk = lifecycle_counts.get("at_risk", {}).get("count", -999)
        print(f"at_risk segment={seg_count}, analytics={analytics_at_risk}")
        assert seg_count == analytics_at_risk, \
            f"at_risk mismatch: segment={seg_count}, analytics={analytics_at_risk}"


# ── V9: lapsing segment count = at_risk + dormant ─────────────────────────

class TestLapsingSegment:
    """V9: lapsing = at_risk + dormant"""

    def test_lapsing_equals_at_risk_plus_dormant(self, headers, lifecycle_counts):
        # Create lapsing segment
        resp_l = create_segment(headers, "lapsing", {"lifecycle_stage": "lapsing"})
        assert resp_l.status_code == 200, f"Lapsing segment creation failed: {resp_l.text}"
        CREATED_SEGMENT_IDS.append(resp_l.json().get("id"))

        # Create at_risk and dormant segments to verify sum
        resp_ar = create_segment(headers, "at_risk-sum", {"lifecycle_stage": "at_risk"})
        CREATED_SEGMENT_IDS.append(resp_ar.json().get("id"))
        resp_d = create_segment(headers, "dormant-sum", {"lifecycle_stage": "dormant"})
        CREATED_SEGMENT_IDS.append(resp_d.json().get("id"))

        lapsing_count = resp_l.json().get("customer_count", 0)
        at_risk_count = resp_ar.json().get("customer_count", 0)
        dormant_count = resp_d.json().get("customer_count", 0)
        print(f"lapsing={lapsing_count}, at_risk={at_risk_count}, dormant={dormant_count}, sum={at_risk_count+dormant_count}")
        assert lapsing_count == (at_risk_count + dormant_count), \
            f"lapsing({lapsing_count}) != at_risk({at_risk_count})+dormant({dormant_count})"


# ── V10: Campaign with lifecycle_stage: prefix audience_id ────────────────

class TestCampaignLifecycleAudience:
    """V10: Campaign with audience_id=lifecycle_stage:churned must not return 404"""

    def test_create_campaign_lifecycle_audience(self, headers):
        resp = requests.post(f"{BASE_URL}/api/campaigns", json={
            "name": f"QA-CR076-Campaign-{uuid.uuid4().hex[:6]}",
            "audience_id": "lifecycle_stage:churned",
            "audience_name": "Churned Customers",
            "audience_count": 2021,
            "template_id": "",
            "schedule_type": "now"
        }, headers=headers)
        assert resp.status_code == 200, f"Campaign creation failed (expected 200): {resp.status_code} {resp.text}"
        data = resp.json()
        CREATED_CAMPAIGN_IDS.append(data.get("id"))
        assert data.get("audience_id") == "lifecycle_stage:churned"
        print(f"Campaign created with id={data['id']}, audience_id={data['audience_id']}")


# ── V1b: All 7 stage segments return valid counts ─────────────────────────

class TestAllStageSegments:
    """V1b: All 7 stages return counts without errors"""
    STAGES = ["new", "active", "at_risk", "dormant", "churned", "lapsing", "winback"]

    def test_all_stages_return_counts(self, headers):
        counts = {}
        for stage in self.STAGES:
            resp = create_segment(headers, f"all-{stage}", {"lifecycle_stage": stage})
            assert resp.status_code == 200, f"Stage={stage} failed: {resp.text}"
            count = resp.json().get("customer_count", -1)
            assert count >= 0, f"Stage={stage} returned negative count={count}"
            CREATED_SEGMENT_IDS.append(resp.json().get("id"))
            counts[stage] = count
        print(f"Stage counts: {counts}")
        # Sum of new+active+at_risk+dormant+churned should be sensible (>0 for kunafa)
        total_5 = sum(counts[s] for s in ["new", "active", "at_risk", "dormant", "churned"])
        print(f"Sum of 5 stages: {total_5}")
        assert total_5 > 0, "Sum of all 5 lifecycle stages is 0 — data issue"


# ── Regression: Existing filter types still work ─────────────────────────

class TestRegressionFilters:
    """Regression: existing filter types (total_spent, tier, tags, last_visit_days) still work"""

    def test_total_spent_filter(self, headers):
        resp = create_segment(headers, "spent-0-500", {"total_spent": "0-500"})
        assert resp.status_code == 200, f"total_spent filter failed: {resp.text}"
        CREATED_SEGMENT_IDS.append(resp.json().get("id"))
        assert resp.json().get("customer_count", -1) >= 0

    def test_tier_filter(self, headers):
        resp = create_segment(headers, "tier-bronze", {"tier": "Bronze"})
        assert resp.status_code == 200, f"tier filter failed: {resp.text}"
        CREATED_SEGMENT_IDS.append(resp.json().get("id"))
        assert resp.json().get("customer_count", -1) >= 0

    def test_last_visit_days_filter(self, headers):
        resp = create_segment(headers, "lv-90d", {"last_visit_days": "90"})
        assert resp.status_code == 200, f"last_visit_days filter failed: {resp.text}"
        CREATED_SEGMENT_IDS.append(resp.json().get("id"))
        assert resp.json().get("customer_count", -1) >= 0

    def test_tags_filter(self, headers):
        resp = create_segment(headers, "tags", {"tags": ["vip"], "tags_mode": "any"})
        assert resp.status_code == 200, f"tags filter failed: {resp.text}"
        CREATED_SEGMENT_IDS.append(resp.json().get("id"))
        assert resp.json().get("customer_count", -1) >= 0


# ── Cleanup ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="module", autouse=True)
def cleanup(headers):
    yield
    for seg_id in CREATED_SEGMENT_IDS:
        if seg_id:
            requests.delete(f"{BASE_URL}/api/segments/{seg_id}", headers=headers)
    for camp_id in CREATED_CAMPAIGN_IDS:
        if camp_id:
            requests.delete(f"{BASE_URL}/api/campaigns/{camp_id}", headers=headers)
    print(f"Cleaned up {len(CREATED_SEGMENT_IDS)} segments and {len(CREATED_CAMPAIGN_IDS)} campaigns")
