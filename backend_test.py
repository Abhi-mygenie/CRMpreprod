#!/usr/bin/env python3

import requests
import sys
import os
from datetime import datetime

class CRMAPITester:
    def __init__(self):
        # Use the public endpoint from frontend .env
        self.base_url = "https://faaf417a-078d-41d3-a8ec-a563e16a4357.preview.emergentagent.com"
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, name, success, details=""):
        """Log test result"""
        self.test_results.append({
            "test": name,
            "status": "PASS" if success else "FAIL",
            "details": details
        })
        if success:
            self.tests_passed += 1
        self.tests_run += 1

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        if headers is None:
            headers = {'Content-Type': 'application/json'}
        
        if self.token and 'Authorization' not in headers:
            headers['Authorization'] = f'Bearer {self.token}'

        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)

            success = response.status_code == expected_status
            
            if success:
                print(f"✅ {name} - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    self.log_result(name, True, f"Response: {str(response_data)[:200]}...")
                except:
                    self.log_result(name, True, f"Status: {response.status_code}")
                return True, response
            else:
                error_msg = f"Expected {expected_status}, got {response.status_code}"
                try:
                    error_details = response.json()
                    error_msg += f" - {error_details}"
                except:
                    error_msg += f" - {response.text[:200]}"
                    
                print(f"❌ {name} - {error_msg}")
                self.log_result(name, False, error_msg)
                return False, response

        except requests.exceptions.Timeout:
            error_msg = "Request timeout (30s)"
            print(f"❌ {name} - {error_msg}")
            self.log_result(name, False, error_msg)
            return False, None
        except Exception as e:
            error_msg = f"Request error: {str(e)}"
            print(f"❌ {name} - {error_msg}")
            self.log_result(name, False, error_msg)
            return False, None

    def test_health_endpoint(self):
        """Test health endpoint"""
        return self.run_test(
            "Health Check",
            "GET", 
            "/api/health",
            200
        )

    def test_demo_login(self):
        """Test demo login functionality"""
        # First, let's try to find the demo login endpoint
        # Based on the auth router structure, it might be /api/auth/demo-login
        success, response = self.run_test(
            "Demo Login",
            "POST",
            "/api/auth/demo-login", 
            200,
            data={}
        )
        
        if success and response:
            try:
                response_data = response.json()
                if 'access_token' in response_data:
                    self.token = response_data['access_token']
                    print(f"   📝 Token acquired: {self.token[:50]}...")
                    return True
                elif 'token' in response_data:
                    self.token = response_data['token']
                    print(f"   📝 Token acquired: {self.token[:50]}...")
                    return True
            except Exception as e:
                print(f"   ⚠️ Could not extract token: {e}")
        return success

    def test_dashboard_api(self):
        """Test dashboard API endpoint"""
        # Dashboard is at /api/analytics/dashboard based on router analysis
        return self.run_test(
            "Dashboard API",
            "GET",
            "/api/analytics/dashboard",
            200
        )

    def test_customers_api(self):
        """Test customers API endpoint"""
        return self.run_test(
            "Customers API",
            "GET",
            "/api/customers",
            200
        )

    def test_root_api(self):
        """Test root API endpoint"""
        return self.run_test(
            "Root API",
            "GET", 
            "/api/",
            200
        )

    def run_all_tests(self):
        """Run all backend API tests"""
        print("🚀 Starting CRM Backend API Tests")
        print(f"🌐 Base URL: {self.base_url}")
        print("=" * 60)

        # Test 1: Health endpoint
        self.test_health_endpoint()

        # Test 2: Root API endpoint  
        self.test_root_api()

        # Test 3: Demo login
        self.test_demo_login()

        # Test 4: Dashboard API (if login worked)
        if self.token:
            self.test_dashboard_api()
            self.test_customers_api()
        else:
            print("\n⚠️ Skipping authenticated endpoints - no token available")

        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
        else:
            print("❌ Some tests failed")
            
        return self.tests_passed == self.tests_run

def main():
    """Main test execution"""
    tester = CRMAPITester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except Exception as e:
        print(f"💥 Test execution failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())