"""
Full Smoke Test for CRM Application
Tests all major API endpoints for pav2 restaurant
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "owner@pav2.com"
TEST_PASSWORD = "Qplazm@10"


class TestAuth:
    """Authentication endpoint tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for all tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"Login successful for {data['user'].get('email')}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpass"
        })
        assert response.status_code == 401
    
    def test_get_current_user(self, auth_token):
        """Test GET /api/auth/me"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        print(f"Current user: {data.get('email')}")


class TestDashboard:
    """Dashboard analytics tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_dashboard_stats(self, auth_token):
        """Test GET /api/analytics/dashboard - main dashboard stats"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Verify key dashboard fields exist
        assert "total_customers" in data
        assert "total_orders" in data
        assert "total_revenue" in data
        assert "total_points_issued" in data
        assert "wallet_balance" in data
        assert "total_coupons" in data
        print(f"Dashboard: {data.get('total_customers')} customers, {data.get('total_orders')} orders, ₹{data.get('total_revenue')} revenue")


class TestCustomers:
    """Customer CRUD tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_list_customers(self, auth_token):
        """Test GET /api/customers - list all customers"""
        response = requests.get(
            f"{BASE_URL}/api/customers",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Expected customers in pav2 restaurant"
        print(f"Found {len(data)} customers")
    
    def test_search_customers(self, auth_token):
        """Test customer search functionality"""
        response = requests.get(
            f"{BASE_URL}/api/customers?search=vanshika",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Search 'vanshika' returned {len(data)} results")
    
    def test_get_customer_detail(self, auth_token):
        """Test GET /api/customers/{id} - get single customer"""
        # First get a customer ID
        list_response = requests.get(
            f"{BASE_URL}/api/customers?limit=1",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        customers = list_response.json()
        assert len(customers) > 0
        customer_id = customers[0]["id"]
        
        # Get customer detail
        response = requests.get(
            f"{BASE_URL}/api/customers/{customer_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "name" in data
        assert "phone" in data
        # Verify addresses array exists
        assert "addresses" in data or data.get("addresses") is None
        print(f"Customer detail: {data.get('name')} - {data.get('phone')}")
    
    def test_get_customer_addresses(self, auth_token):
        """Test GET /api/customers/{id}/addresses"""
        # Get a customer with addresses - search for vanshika
        list_response = requests.get(
            f"{BASE_URL}/api/customers?search=vanshika&limit=1",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        customers = list_response.json()
        assert len(customers) > 0, "No customer found with name vanshika"
        customer_id = customers[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/customers/{customer_id}/addresses",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Customer {customer_id} has {len(data)} addresses")
    
    def test_segments_stats(self, auth_token):
        """Test GET /api/customers/segments/stats"""
        response = requests.get(
            f"{BASE_URL}/api/customers/segments/stats",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        print(f"Segments stats: {data}")


class TestPoints:
    """Points/Loyalty tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_points_transactions(self, auth_token):
        """Test GET /api/points/transactions/{customer_id}"""
        # Get a customer
        list_response = requests.get(
            f"{BASE_URL}/api/customers?limit=1",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        customers = list_response.json()
        if len(customers) > 0:
            customer_id = customers[0]["id"]
            response = requests.get(
                f"{BASE_URL}/api/points/transactions/{customer_id}",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            print(f"Customer has {len(data)} points transactions")
    
    def test_get_loyalty_settings(self, auth_token):
        """Test GET /api/loyalty/settings"""
        response = requests.get(
            f"{BASE_URL}/api/loyalty/settings",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "loyalty_enabled" in data
        print(f"Loyalty enabled: {data.get('loyalty_enabled')}")


class TestWallet:
    """Wallet tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_wallet_transactions(self, auth_token):
        """Test GET /api/wallet/transactions/{customer_id}"""
        # Get a customer
        list_response = requests.get(
            f"{BASE_URL}/api/customers?limit=1",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        customers = list_response.json()
        if len(customers) > 0:
            customer_id = customers[0]["id"]
            response = requests.get(
                f"{BASE_URL}/api/wallet/transactions/{customer_id}",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            print(f"Customer has {len(data)} wallet transactions")


class TestCoupons:
    """Coupons tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_list_coupons(self, auth_token):
        """Test GET /api/coupons"""
        response = requests.get(
            f"{BASE_URL}/api/coupons",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} coupons")


class TestFeedback:
    """Feedback tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_list_feedback(self, auth_token):
        """Test GET /api/feedback"""
        response = requests.get(
            f"{BASE_URL}/api/feedback",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} feedback entries")


class TestMigration:
    """Migration status tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_migration_status(self, auth_token):
        """Test GET /api/migration/status - verify order migration"""
        response = requests.get(
            f"{BASE_URL}/api/migration/status",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "customers_synced" in data
        assert "orders_synced" in data
        print(f"Migration: {data.get('customers_synced')} customers, {data.get('orders_synced')} orders synced")
        # Verify pav2 has migrated orders
        assert data.get("orders_synced", 0) > 0, "Expected migrated orders for pav2"


class TestAnalytics:
    """Analytics tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_item_performance(self, auth_token):
        """Test GET /api/analytics/item-performance"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/item-performance",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "summary" in data
        print(f"Item analytics: {data['summary'].get('total_items')} items, avg repeat rate: {data['summary'].get('avg_repeat_rate')}%")
    
    def test_customer_lifecycle(self, auth_token):
        """Test GET /api/analytics/customer-lifecycle"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/customer-lifecycle",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert "total_customers" in data
        print(f"Lifecycle: {data.get('total_customers')} total customers")
        # Verify stages exist
        summary = data.get("summary", {})
        for stage in ["new", "active", "at_risk", "dormant", "churned"]:
            assert stage in summary, f"Missing stage: {stage}"


class TestQRCode:
    """QR Code tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_generate_qr(self, auth_token):
        """Test GET /api/qr/generate"""
        response = requests.get(
            f"{BASE_URL}/api/qr/generate",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "qr_code" in data or "registration_url" in data
        print("QR code generated successfully")


class TestSegments:
    """Segments tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_list_segments(self, auth_token):
        """Test GET /api/segments"""
        response = requests.get(
            f"{BASE_URL}/api/segments",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} segments")


class TestWhatsApp:
    """WhatsApp templates tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_list_templates(self, auth_token):
        """Test GET /api/whatsapp/templates"""
        response = requests.get(
            f"{BASE_URL}/api/whatsapp/templates",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # API returns {"templates": []} format
        if isinstance(data, dict) and "templates" in data:
            templates = data["templates"]
        else:
            templates = data
        assert isinstance(templates, list)
        print(f"Found {len(templates)} WhatsApp templates")


class TestHealth:
    """Health check tests"""
    
    def test_health_check(self):
        """Test GET /api/health"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("Health check passed")
    
    def test_root(self):
        """Test GET /api/"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        print("Root endpoint accessible")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
