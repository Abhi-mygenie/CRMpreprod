"""
CR-024: Marketing Campaigns API Tests
Tests campaign CRUD, daily-limit, pause/resume, clone, edit guard
Run: cd /app/backend && pytest tests/test_campaigns_api.py -v --tb=short
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://cc511585-de01-49af-9a9b-3d577b5c408b.preview.emergentagent.com"

# Test credentials
TEST_EMAIL = "owner@kunafamahal.com"
TEST_PASSWORD = "Qplazm@10"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for API calls"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, "No access_token in login response"
    return data["access_token"]


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


@pytest.fixture
def test_campaign_id(api_client):
    """Create a test campaign and return its ID, cleanup after test"""
    unique_name = f"TEST_Campaign_{uuid.uuid4().hex[:8]}"
    payload = {
        "name": unique_name,
        "audience_id": "all-customers",
        "audience_name": "All Customers",
        "audience_count": 10,
        "template_id": "",
        "template_name": "",
        "schedule_type": "now"
    }
    response = api_client.post(f"{BASE_URL}/api/campaigns", json=payload)
    assert response.status_code == 200, f"Failed to create test campaign: {response.text}"
    campaign_id = response.json()["id"]
    
    yield campaign_id
    
    # Cleanup
    api_client.delete(f"{BASE_URL}/api/campaigns/{campaign_id}")


class TestHealthEndpoint:
    """CR-027: Verify health endpoint works"""
    
    def test_health_returns_healthy(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"


class TestCampaignCRUD:
    """CR-024: Campaign CRUD operations"""
    
    def test_create_campaign(self, api_client):
        """POST /api/campaigns - create campaign"""
        unique_name = f"TEST_Create_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "audience_id": "all-customers",
            "audience_name": "All Customers",
            "audience_count": 5,
            "template_id": "",
            "schedule_type": "now"
        }
        response = api_client.post(f"{BASE_URL}/api/campaigns", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert data["name"] == unique_name
        assert data["status"] == "draft"
        assert "id" in data
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/campaigns/{data['id']}")
    
    def test_create_campaign_requires_name(self, api_client):
        """POST /api/campaigns - name is required"""
        payload = {"name": "", "audience_id": "all-customers"}
        response = api_client.post(f"{BASE_URL}/api/campaigns", json=payload)
        assert response.status_code == 400
    
    def test_list_campaigns(self, api_client, test_campaign_id):
        """GET /api/campaigns - list campaigns"""
        response = api_client.get(f"{BASE_URL}/api/campaigns")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        # Should contain our test campaign
        ids = [c["id"] for c in data]
        assert test_campaign_id in ids
    
    def test_get_single_campaign(self, api_client, test_campaign_id):
        """GET /api/campaigns/{id} - get single campaign"""
        response = api_client.get(f"{BASE_URL}/api/campaigns/{test_campaign_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == test_campaign_id
        assert "name" in data
        assert "status" in data
    
    def test_get_nonexistent_campaign(self, api_client):
        """GET /api/campaigns/{id} - 404 for nonexistent"""
        response = api_client.get(f"{BASE_URL}/api/campaigns/nonexistent-id-12345")
        assert response.status_code == 404
    
    def test_update_campaign(self, api_client, test_campaign_id):
        """PUT /api/campaigns/{id} - update campaign"""
        new_name = f"TEST_Updated_{uuid.uuid4().hex[:8]}"
        response = api_client.put(
            f"{BASE_URL}/api/campaigns/{test_campaign_id}",
            json={"name": new_name}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["name"] == new_name
        
        # Verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/campaigns/{test_campaign_id}")
        assert get_response.json()["name"] == new_name
    
    def test_delete_campaign(self, api_client):
        """DELETE /api/campaigns/{id} - delete campaign"""
        # Create a campaign to delete
        unique_name = f"TEST_Delete_{uuid.uuid4().hex[:8]}"
        create_response = api_client.post(
            f"{BASE_URL}/api/campaigns",
            json={"name": unique_name, "audience_id": "all-customers"}
        )
        campaign_id = create_response.json()["id"]
        
        # Delete it
        delete_response = api_client.delete(f"{BASE_URL}/api/campaigns/{campaign_id}")
        assert delete_response.status_code == 200
        
        # Verify it's gone
        get_response = api_client.get(f"{BASE_URL}/api/campaigns/{campaign_id}")
        assert get_response.status_code == 404


class TestDailyLimit:
    """CR-024: Daily limit endpoint"""
    
    def test_get_daily_limit(self, api_client):
        """GET /api/campaigns/daily-limit - returns count and limit"""
        response = api_client.get(f"{BASE_URL}/api/campaigns/daily-limit")
        assert response.status_code == 200
        
        data = response.json()
        assert "limit" in data
        assert "used" in data
        assert "remaining" in data
        assert data["limit"] == 1000  # Default limit
        assert data["remaining"] == data["limit"] - data["used"]


class TestPauseResume:
    """CR-024: Pause/Resume campaign operations"""
    
    def test_pause_requires_scheduled_status(self, api_client, test_campaign_id):
        """POST /api/campaigns/{id}/pause - cannot pause draft"""
        response = api_client.post(f"{BASE_URL}/api/campaigns/{test_campaign_id}/pause")
        # Draft campaigns cannot be paused
        assert response.status_code == 409
    
    def test_resume_requires_paused_status(self, api_client, test_campaign_id):
        """POST /api/campaigns/{id}/resume - cannot resume non-paused"""
        response = api_client.post(f"{BASE_URL}/api/campaigns/{test_campaign_id}/resume")
        # Draft campaigns cannot be resumed
        assert response.status_code == 409


class TestClone:
    """CR-024: Clone campaign operation"""
    
    def test_clone_campaign(self, api_client, test_campaign_id):
        """POST /api/campaigns/{id}/clone - clone campaign"""
        response = api_client.post(f"{BASE_URL}/api/campaigns/{test_campaign_id}/clone")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] != test_campaign_id
        assert "(copy)" in data["name"]
        assert data["status"] == "draft"
        assert data["total_sent"] == 0
        assert data["run_count"] == 0
        
        # Cleanup cloned campaign
        api_client.delete(f"{BASE_URL}/api/campaigns/{data['id']}")
    
    def test_clone_nonexistent_campaign(self, api_client):
        """POST /api/campaigns/{id}/clone - 404 for nonexistent"""
        response = api_client.post(f"{BASE_URL}/api/campaigns/nonexistent-id-12345/clone")
        assert response.status_code == 404


class TestEditGuard:
    """CR-024 Phase 4 P4.9: Edit guard for scheduled campaigns"""
    
    def test_edit_guard_allows_name_change_on_draft(self, api_client, test_campaign_id):
        """PUT /api/campaigns/{id} - can change name on draft"""
        new_name = f"TEST_NameChange_{uuid.uuid4().hex[:8]}"
        response = api_client.put(
            f"{BASE_URL}/api/campaigns/{test_campaign_id}",
            json={"name": new_name}
        )
        assert response.status_code == 200
        assert response.json()["name"] == new_name


class TestTestSend:
    """CR-024 Phase 4 P4.10: Test send endpoint validation"""
    
    def test_test_send_requires_phone(self, api_client, test_campaign_id):
        """POST /api/campaigns/{id}/test-send - phone is required"""
        response = api_client.post(
            f"{BASE_URL}/api/campaigns/{test_campaign_id}/test-send",
            json={"phone": ""}
        )
        assert response.status_code == 400
    
    def test_test_send_requires_template(self, api_client, test_campaign_id):
        """POST /api/campaigns/{id}/test-send - template must be set"""
        # Our test campaign has no template_id
        response = api_client.post(
            f"{BASE_URL}/api/campaigns/{test_campaign_id}/test-send",
            json={"phone": "9999999999"}
        )
        assert response.status_code == 400


class TestCampaignRuns:
    """CR-024: Campaign runs/history endpoints"""
    
    def test_get_campaign_runs(self, api_client, test_campaign_id):
        """GET /api/campaigns/{id}/runs - get execution runs"""
        response = api_client.get(f"{BASE_URL}/api/campaigns/{test_campaign_id}/runs")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_all_campaign_runs(self, api_client):
        """GET /api/campaigns/history/all - get all runs"""
        response = api_client.get(f"{BASE_URL}/api/campaigns/history/all")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)


if __name__ == "__main__":
    import subprocess
    subprocess.run(["pytest", __file__, "-v", "--tb=short"], check=False)
