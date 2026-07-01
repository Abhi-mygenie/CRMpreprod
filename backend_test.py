#!/usr/bin/env python3
"""
Backend API Test Suite for MyGenie CRM
Tests login flow and authentication endpoints
"""
import requests
import json
import sys
from typing import Dict, Optional

# Base URL from frontend .env
BASE_URL = "https://react-python-crm-4.preview.emergentagent.com/api"

# Test credentials
TEST_CREDENTIALS = [
    {"email": "owner@cafe103.com", "password": "Qplazm@10"},
    {"email": "owner@kunafamahal.com", "password": "Qplazm@10"}
]

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_test(name: str):
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}TEST: {name}{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")

def print_success(message: str):
    print(f"{Colors.GREEN}✓ {message}{Colors.END}")

def print_error(message: str):
    print(f"{Colors.RED}✗ {message}{Colors.END}")

def print_info(message: str):
    print(f"{Colors.YELLOW}ℹ {message}{Colors.END}")

def test_health_check() -> bool:
    """Test GET /api/health endpoint"""
    print_test("Health Check")
    
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get("status") == "healthy":
                print_success("Health check passed - API is healthy")
                return True
            else:
                print_error(f"Health check returned unexpected status: {data.get('status')}")
                return False
        else:
            print_error(f"Health check failed with status {response.status_code}")
            print_info(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print_error(f"Health check exception: {str(e)}")
        return False

def test_login(email: str, password: str) -> Optional[Dict]:
    """Test POST /api/auth/login endpoint"""
    print_test(f"Login Test - {email}")
    
    try:
        payload = {
            "email": email,
            "password": password
        }
        
        print_info(f"POST {BASE_URL}/auth/login")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Check for access_token
            if "access_token" in data:
                print_success(f"Login successful - received access_token")
                print_info(f"Token (first 20 chars): {data['access_token'][:20]}...")
                
                # Check for user data
                if "user" in data:
                    user = data["user"]
                    print_success(f"User data received:")
                    print_info(f"  - ID: {user.get('id')}")
                    print_info(f"  - Email: {user.get('email')}")
                    print_info(f"  - Restaurant: {user.get('restaurant_name')}")
                    print_info(f"  - Phone: {user.get('phone')}")
                    print_info(f"  - POS ID: {user.get('pos_id')}")
                    print_info(f"  - POS Name: {user.get('pos_name')}")
                
                # Check for pos_config
                if "pos_config" in data:
                    print_success("POS config received")
                    print_info(f"  - API Key (first 10 chars): {data['pos_config'].get('api_key', '')[:10]}...")
                
                # Check for mygenie_token
                if "mygenie_token" in data:
                    print_success("MyGenie token received")
                
                return data
            else:
                print_error("Login response missing access_token")
                print_info(f"Response: {json.dumps(data, indent=2)}")
                return None
        
        elif response.status_code == 401:
            print_error("Login failed - Invalid credentials (401)")
            print_info(f"Response: {response.text}")
            return None
        
        elif response.status_code == 503:
            print_error("Login failed - Service Unavailable (503)")
            print_info(f"Response: {response.text}")
            print_error("This indicates MyGenie API is not reachable or returning errors")
            return None
        
        else:
            print_error(f"Login failed with status {response.status_code}")
            print_info(f"Response: {response.text}")
            return None
            
    except requests.exceptions.Timeout:
        print_error("Login request timed out")
        return None
    except Exception as e:
        print_error(f"Login exception: {str(e)}")
        return None

def test_get_me(access_token: str) -> bool:
    """Test GET /api/auth/me endpoint"""
    print_test("Get Current User Profile")
    
    try:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        print_info(f"GET {BASE_URL}/auth/me")
        print_info(f"Authorization: Bearer {access_token[:20]}...")
        
        response = requests.get(
            f"{BASE_URL}/auth/me",
            headers=headers,
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_success("Profile retrieved successfully")
            print_info(f"Profile data:")
            print_info(f"  - ID: {data.get('id')}")
            print_info(f"  - Email: {data.get('email')}")
            print_info(f"  - Restaurant: {data.get('restaurant_name')}")
            print_info(f"  - Phone: {data.get('phone')}")
            print_info(f"  - POS ID: {data.get('pos_id')}")
            print_info(f"  - POS Name: {data.get('pos_name')}")
            
            # Check for profile fields
            if data.get('gstin'):
                print_info(f"  - GSTIN: {data.get('gstin')}")
            if data.get('state'):
                print_info(f"  - State: {data.get('state')}")
            if data.get('address_line1'):
                print_info(f"  - Address: {data.get('address_line1')}")
            
            return True
        
        elif response.status_code == 401:
            print_error("Profile fetch failed - Unauthorized (401)")
            print_info(f"Response: {response.text}")
            return False
        
        else:
            print_error(f"Profile fetch failed with status {response.status_code}")
            print_info(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print_error(f"Profile fetch exception: {str(e)}")
        return False

def main():
    """Run all backend tests"""
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}MyGenie CRM Backend API Test Suite{Colors.END}")
    print(f"{Colors.BLUE}Base URL: {BASE_URL}{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")
    
    results = {
        "health_check": False,
        "login_tests": [],
        "profile_tests": []
    }
    
    # Test 1: Health Check
    results["health_check"] = test_health_check()
    
    # Test 2 & 3: Login with both credentials
    for creds in TEST_CREDENTIALS:
        login_result = test_login(creds["email"], creds["password"])
        
        if login_result:
            results["login_tests"].append({
                "email": creds["email"],
                "success": True
            })
            
            # Test 4: Get profile with the token
            access_token = login_result.get("access_token")
            if access_token:
                profile_success = test_get_me(access_token)
                results["profile_tests"].append({
                    "email": creds["email"],
                    "success": profile_success
                })
        else:
            results["login_tests"].append({
                "email": creds["email"],
                "success": False
            })
    
    # Print Summary
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}TEST SUMMARY{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")
    
    # Health Check
    if results["health_check"]:
        print_success("Health Check: PASSED")
    else:
        print_error("Health Check: FAILED")
    
    # Login Tests
    print(f"\n{Colors.YELLOW}Login Tests:{Colors.END}")
    for test in results["login_tests"]:
        if test["success"]:
            print_success(f"  {test['email']}: PASSED")
        else:
            print_error(f"  {test['email']}: FAILED")
    
    # Profile Tests
    if results["profile_tests"]:
        print(f"\n{Colors.YELLOW}Profile Tests:{Colors.END}")
        for test in results["profile_tests"]:
            if test["success"]:
                print_success(f"  {test['email']}: PASSED")
            else:
                print_error(f"  {test['email']}: FAILED")
    
    # Overall Result
    all_passed = (
        results["health_check"] and
        all(t["success"] for t in results["login_tests"]) and
        all(t["success"] for t in results["profile_tests"])
    )
    
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    if all_passed:
        print_success("ALL TESTS PASSED ✓")
        print(f"{Colors.BLUE}{'='*60}{Colors.END}\n")
        return 0
    else:
        print_error("SOME TESTS FAILED ✗")
        print(f"{Colors.BLUE}{'='*60}{Colors.END}\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
