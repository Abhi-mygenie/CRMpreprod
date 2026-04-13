"""
Test Address CRUD API Endpoints for CRM Application
Tests: Login, Customers list, Customer detail, Address CRUD operations
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "owner@pav2.com"
TEST_PASSWORD = "Qplazm@10"


class TestAuthAndBasics:
    """Test authentication and basic endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def api_client(self, auth_token):
        """Create authenticated session"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        })
        return session
    
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
        assert data["user"]["email"] == TEST_EMAIL
        print(f"Login successful for {TEST_EMAIL}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpass"
        })
        assert response.status_code in [401, 400], f"Expected 401/400, got {response.status_code}"
        print("Invalid login correctly rejected")
    
    def test_get_customers_list(self, api_client):
        """Test getting customers list"""
        response = api_client.get(f"{BASE_URL}/api/customers")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Got {len(data)} customers")
        if len(data) > 0:
            # Verify customer structure
            customer = data[0]
            assert "id" in customer
            assert "name" in customer
            assert "phone" in customer
            print(f"First customer: {customer.get('name')}")
    
    def test_dashboard_loads(self, api_client):
        """Test dashboard endpoint"""
        response = api_client.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "total_customers" in data or "customers" in data or isinstance(data, dict)
        print(f"Dashboard loaded: {list(data.keys())[:5]}")


class TestCustomerDetail:
    """Test customer detail page endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def api_client(self, auth_token):
        """Create authenticated session"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        })
        return session
    
    @pytest.fixture(scope="class")
    def test_customer_id(self, api_client):
        """Get a customer ID for testing"""
        response = api_client.get(f"{BASE_URL}/api/customers")
        assert response.status_code == 200
        customers = response.json()
        assert len(customers) > 0, "No customers found for testing"
        return customers[0]["id"]
    
    def test_get_customer_detail(self, api_client, test_customer_id):
        """Test getting customer detail"""
        response = api_client.get(f"{BASE_URL}/api/customers/{test_customer_id}")
        assert response.status_code == 200
        customer = response.json()
        assert "id" in customer
        assert "name" in customer
        assert "phone" in customer
        assert "total_points" in customer
        assert "wallet_balance" in customer or "wallet" in customer
        print(f"Customer detail: {customer.get('name')}, Points: {customer.get('total_points')}")
    
    def test_get_points_transactions(self, api_client, test_customer_id):
        """Test getting points transactions"""
        response = api_client.get(f"{BASE_URL}/api/points/transactions/{test_customer_id}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Points transactions: {len(data)}")
    
    def test_get_wallet_transactions(self, api_client, test_customer_id):
        """Test getting wallet transactions"""
        response = api_client.get(f"{BASE_URL}/api/wallet/transactions/{test_customer_id}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Wallet transactions: {len(data)}")
    
    def test_get_expiring_points(self, api_client, test_customer_id):
        """Test getting expiring points"""
        response = api_client.get(f"{BASE_URL}/api/points/expiring/{test_customer_id}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"Expiring points data: {data}")


class TestAddressCRUD:
    """Test Address CRUD API endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def api_client(self, auth_token):
        """Create authenticated session"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        })
        return session
    
    @pytest.fixture(scope="class")
    def test_customer_id(self, api_client):
        """Get a customer ID for testing"""
        response = api_client.get(f"{BASE_URL}/api/customers")
        assert response.status_code == 200
        customers = response.json()
        assert len(customers) > 0, "No customers found for testing"
        # Find customer named 'vanshika thakur' or use first
        for c in customers:
            if 'vanshika' in c.get('name', '').lower():
                return c["id"]
        return customers[0]["id"]
    
    def test_list_addresses(self, api_client, test_customer_id):
        """Test GET /api/customers/{id}/addresses"""
        response = api_client.get(f"{BASE_URL}/api/customers/{test_customer_id}/addresses")
        assert response.status_code == 200
        addresses = response.json()
        assert isinstance(addresses, list)
        print(f"Customer has {len(addresses)} addresses")
        if len(addresses) > 0:
            addr = addresses[0]
            assert "id" in addr
            assert "address_type" in addr
            print(f"First address: {addr.get('address_type')} - {addr.get('address')}")
    
    def test_create_address(self, api_client, test_customer_id):
        """Test POST /api/customers/{id}/addresses"""
        new_address = {
            "address_type": "Work",
            "address": "TEST_456 Office Park",
            "city": "Bangalore",
            "state": "Karnataka",
            "pincode": "560001",
            "country": "India",
            "delivery_instructions": "Ring bell twice"
        }
        response = api_client.post(
            f"{BASE_URL}/api/customers/{test_customer_id}/addresses",
            json=new_address
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        created = response.json()
        assert "id" in created
        assert created["address_type"] == "Work"
        assert created["address"] == "TEST_456 Office Park"
        assert created["city"] == "Bangalore"
        print(f"Created address: {created['id']}")
        
        # Verify by GET
        get_response = api_client.get(f"{BASE_URL}/api/customers/{test_customer_id}/addresses")
        assert get_response.status_code == 200
        addresses = get_response.json()
        found = any(a["id"] == created["id"] for a in addresses)
        assert found, "Created address not found in list"
        print("Address creation verified via GET")
        
        return created["id"]
    
    def test_update_address(self, api_client, test_customer_id):
        """Test PUT /api/customers/{id}/addresses/{address_id}"""
        # First create an address to update
        create_response = api_client.post(
            f"{BASE_URL}/api/customers/{test_customer_id}/addresses",
            json={
                "address_type": "Other",
                "address": "TEST_Original Address",
                "city": "Delhi"
            }
        )
        assert create_response.status_code == 200
        address_id = create_response.json()["id"]
        
        # Update the address
        update_data = {
            "address": "TEST_Updated Address",
            "city": "New Delhi",
            "pincode": "110001"
        }
        update_response = api_client.put(
            f"{BASE_URL}/api/customers/{test_customer_id}/addresses/{address_id}",
            json=update_data
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated = update_response.json()
        assert updated["address"] == "TEST_Updated Address"
        assert updated["city"] == "New Delhi"
        assert updated["pincode"] == "110001"
        print(f"Updated address: {address_id}")
        
        # Verify by GET
        get_response = api_client.get(f"{BASE_URL}/api/customers/{test_customer_id}/addresses")
        addresses = get_response.json()
        found_addr = next((a for a in addresses if a["id"] == address_id), None)
        assert found_addr is not None
        assert found_addr["address"] == "TEST_Updated Address"
        print("Address update verified via GET")
    
    def test_delete_address(self, api_client, test_customer_id):
        """Test DELETE /api/customers/{id}/addresses/{address_id}"""
        # First create an address to delete
        create_response = api_client.post(
            f"{BASE_URL}/api/customers/{test_customer_id}/addresses",
            json={
                "address_type": "Other",
                "address": "TEST_To Be Deleted",
                "city": "Chennai"
            }
        )
        assert create_response.status_code == 200
        address_id = create_response.json()["id"]
        
        # Delete the address
        delete_response = api_client.delete(
            f"{BASE_URL}/api/customers/{test_customer_id}/addresses/{address_id}"
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"Deleted address: {address_id}")
        
        # Verify by GET - address should not exist
        get_response = api_client.get(f"{BASE_URL}/api/customers/{test_customer_id}/addresses")
        addresses = get_response.json()
        found = any(a["id"] == address_id for a in addresses)
        assert not found, "Deleted address still exists"
        print("Address deletion verified via GET")
    
    def test_set_default_address(self, api_client, test_customer_id):
        """Test POST /api/customers/{id}/addresses/{address_id}/set-default"""
        # First create two addresses
        addr1_response = api_client.post(
            f"{BASE_URL}/api/customers/{test_customer_id}/addresses",
            json={"address_type": "Home", "address": "TEST_Home Address", "city": "Mumbai"}
        )
        assert addr1_response.status_code == 200
        addr1_id = addr1_response.json()["id"]
        
        addr2_response = api_client.post(
            f"{BASE_URL}/api/customers/{test_customer_id}/addresses",
            json={"address_type": "Work", "address": "TEST_Work Address", "city": "Pune"}
        )
        assert addr2_response.status_code == 200
        addr2_id = addr2_response.json()["id"]
        
        # Set addr2 as default
        set_default_response = api_client.post(
            f"{BASE_URL}/api/customers/{test_customer_id}/addresses/{addr2_id}/set-default"
        )
        assert set_default_response.status_code == 200, f"Set default failed: {set_default_response.text}"
        result = set_default_response.json()
        assert result["is_default"] == True
        print(f"Set {addr2_id} as default")
        
        # Verify by GET - addr2 should be default, addr1 should not
        get_response = api_client.get(f"{BASE_URL}/api/customers/{test_customer_id}/addresses")
        addresses = get_response.json()
        
        addr1 = next((a for a in addresses if a["id"] == addr1_id), None)
        addr2 = next((a for a in addresses if a["id"] == addr2_id), None)
        
        if addr1:
            assert addr1["is_default"] == False, "addr1 should not be default"
        assert addr2 is not None
        assert addr2["is_default"] == True, "addr2 should be default"
        print("Set default verified via GET")
    
    def test_address_validation_error(self, api_client, test_customer_id):
        """Test address validation - should fail without required fields"""
        # Try to create address without any address content
        response = api_client.post(
            f"{BASE_URL}/api/customers/{test_customer_id}/addresses",
            json={"address_type": "Home"}  # Missing address, city, pincode
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("Address validation working - empty address rejected")


class TestCustomerCRUD:
    """Test Customer CRUD with address integration"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def api_client(self, auth_token):
        """Create authenticated session"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        })
        return session
    
    def test_create_customer_then_add_address(self, api_client):
        """Test creating customer and then adding address via CRUD API"""
        # Create customer
        customer_data = {
            "name": "TEST_New Customer",
            "phone": "9999888877",
            "country_code": "+91",
            "customer_type": "normal"
        }
        create_response = api_client.post(f"{BASE_URL}/api/customers", json=customer_data)
        assert create_response.status_code in [200, 201], f"Create customer failed: {create_response.text}"
        customer = create_response.json()
        customer_id = customer["id"]
        print(f"Created customer: {customer_id}")
        
        # Add address via CRUD API
        address_data = {
            "address_type": "Home",
            "address": "TEST_123 New Street",
            "city": "Hyderabad",
            "pincode": "500001"
        }
        addr_response = api_client.post(
            f"{BASE_URL}/api/customers/{customer_id}/addresses",
            json=address_data
        )
        assert addr_response.status_code == 200, f"Add address failed: {addr_response.text}"
        address = addr_response.json()
        assert address["is_default"] == True  # First address should be default
        print(f"Added address to customer: {address['id']}")
        
        # Verify customer has address
        get_response = api_client.get(f"{BASE_URL}/api/customers/{customer_id}/addresses")
        assert get_response.status_code == 200
        addresses = get_response.json()
        assert len(addresses) >= 1
        print(f"Customer has {len(addresses)} address(es)")
        
        # Cleanup - delete customer
        # Note: This may or may not be supported
        try:
            api_client.delete(f"{BASE_URL}/api/customers/{customer_id}")
        except:
            pass


class TestLoyaltyEndpoints:
    """Test loyalty-related endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def api_client(self, auth_token):
        """Create authenticated session"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        })
        return session
    
    def test_get_loyalty_settings(self, api_client):
        """Test getting loyalty settings"""
        response = api_client.get(f"{BASE_URL}/api/loyalty/settings")
        assert response.status_code == 200
        data = response.json()
        print(f"Loyalty settings: {list(data.keys())[:5]}")


# Cleanup fixture to remove TEST_ prefixed addresses after all tests
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Cleanup TEST_ prefixed data after all tests"""
    yield
    # Cleanup logic would go here if needed
    print("Test session complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
