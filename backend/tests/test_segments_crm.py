"""
Test suite for CRM Segments functionality
- Test POST /api/segments/preview-count endpoint
- Test segment CRUD operations
- Test demo login authentication flow
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDemoLogin:
    """Authentication via demo login"""
    
    def test_demo_login_success(self):
        """Test demo login returns a valid token"""
        response = requests.post(f"{BASE_URL}/api/auth/demo-login")
        assert response.status_code == 200, f"Demo login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "access_token not in response"
        assert "user" in data, "user not in response"
        assert isinstance(data["access_token"], str)
        assert len(data["access_token"]) > 0
        print(f"Demo login successful - User: {data['user'].get('email', 'N/A')}")
        return data["access_token"]


class TestSegmentsPreviewCount:
    """Test the new POST /api/segments/preview-count endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token via demo login"""
        response = requests.post(f"{BASE_URL}/api/auth/demo-login")
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Demo login failed - skipping authenticated tests")
    
    def test_preview_count_no_auth_returns_403(self):
        """Preview count without auth should return 403 Forbidden"""
        response = requests.post(f"{BASE_URL}/api/segments/preview-count", json={
            "filters": {}
        })
        assert response.status_code in [401, 403], f"Expected 401/403 but got {response.status_code}"
        print(f"Correctly returned {response.status_code} when no auth provided")
    
    def test_preview_count_with_auth_empty_filters(self, auth_token):
        """Preview count with auth and empty filters should return customer count"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(f"{BASE_URL}/api/segments/preview-count", 
            json={"filters": {}},
            headers=headers
        )
        assert response.status_code == 200, f"Preview count failed: {response.text}"
        
        data = response.json()
        assert "count" in data, "count not in response"
        assert isinstance(data["count"], int), "count should be an integer"
        assert data["count"] >= 0, "count should be non-negative"
        print(f"Preview count with empty filters: {data['count']} customers")
    
    def test_preview_count_with_tier_filter(self, auth_token):
        """Preview count with tier filter"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(f"{BASE_URL}/api/segments/preview-count", 
            json={"filters": {"tier": "Gold"}},
            headers=headers
        )
        assert response.status_code == 200, f"Preview count failed: {response.text}"
        
        data = response.json()
        assert "count" in data
        print(f"Preview count with Gold tier filter: {data['count']} customers")
    
    def test_preview_count_with_multiple_filters(self, auth_token):
        """Preview count with multiple filters"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        filters = {
            "tier": "Bronze",
            "customer_type": "normal",
            "vip_flag": "false"
        }
        response = requests.post(f"{BASE_URL}/api/segments/preview-count", 
            json={"filters": filters},
            headers=headers
        )
        assert response.status_code == 200, f"Preview count failed: {response.text}"
        
        data = response.json()
        assert "count" in data
        print(f"Preview count with multiple filters: {data['count']} customers")


class TestSegmentsCRUD:
    """Test segments CRUD operations"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token via demo login"""
        response = requests.post(f"{BASE_URL}/api/auth/demo-login")
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Demo login failed")
    
    def test_list_segments(self, auth_token):
        """List all segments"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/segments", headers=headers)
        
        assert response.status_code == 200, f"List segments failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} segments")
        return data
    
    def test_create_segment(self, auth_token):
        """Create a new test segment"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        segment_data = {
            "name": "TEST_Gold_VIP_Segment",
            "filters": {
                "tier": "Gold",
                "vip_flag": "true"
            },
            "customer_count": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/segments", 
            json=segment_data,
            headers=headers
        )
        
        assert response.status_code == 200, f"Create segment failed: {response.text}"
        data = response.json()
        assert "id" in data, "Segment ID not in response"
        assert data["name"] == segment_data["name"], "Segment name mismatch"
        print(f"Created segment: {data['id']} - {data['name']}")
        return data["id"]
    
    def test_get_segment_customers(self, auth_token):
        """Get customers in a segment"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First get segments list
        segments_resp = requests.get(f"{BASE_URL}/api/segments", headers=headers)
        if segments_resp.status_code == 200:
            segments = segments_resp.json()
            if len(segments) > 0:
                segment_id = segments[0]["id"]
                response = requests.get(f"{BASE_URL}/api/segments/{segment_id}/customers", headers=headers)
                
                assert response.status_code == 200, f"Get segment customers failed: {response.text}"
                data = response.json()
                assert isinstance(data, list), "Response should be a list"
                print(f"Segment {segment_id} has {len(data)} customers")
            else:
                print("No segments found, skipping customer list test")
        else:
            pytest.skip("Could not list segments")


class TestCustomersPage:
    """Test customers endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token via demo login"""
        response = requests.post(f"{BASE_URL}/api/auth/demo-login")
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Demo login failed")
    
    def test_list_customers(self, auth_token):
        """List customers"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/customers", headers=headers)
        
        assert response.status_code == 200, f"List customers failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} customers")
        
        # Check for null names formatting in frontend (backend returns raw data)
        for customer in data[:5]:
            name = customer.get("name")
            if name is None or "@mygenie.online" in str(name):
                print(f"Customer with null/mygenie name: {customer.get('phone')}")
    
    def test_customer_segments_stats(self, auth_token):
        """Get customer segment stats"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/customers/segments/stats", headers=headers)
        
        assert response.status_code == 200, f"Segments stats failed: {response.text}"
        data = response.json()
        assert "total" in data, "total not in response"
        assert "by_tier" in data, "by_tier not in response"
        print(f"Customer stats - Total: {data['total']}, Tiers: {data['by_tier']}")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/demo-login")
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Demo login failed")
    
    def test_cleanup_test_segments(self, auth_token):
        """Delete test segments created during testing"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # List segments
        response = requests.get(f"{BASE_URL}/api/segments", headers=headers)
        if response.status_code == 200:
            segments = response.json()
            for segment in segments:
                if segment["name"].startswith("TEST_"):
                    delete_resp = requests.delete(f"{BASE_URL}/api/segments/{segment['id']}", headers=headers)
                    if delete_resp.status_code in [200, 204]:
                        print(f"Deleted test segment: {segment['name']}")
        print("Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
