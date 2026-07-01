#!/usr/bin/env python3
"""
Backend API Test Suite for MyGenie CRM
Tests backend health after branch switch from dev to main
"""
import requests
import json
import sys
from typing import Dict, Any

# Backend URL from environment
BACKEND_URL = "https://mygenie-crm-8.preview.emergentagent.com/api"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_test(name: str, passed: bool, details: str = ""):
    status = f"{Colors.GREEN}✅ PASS{Colors.END}" if passed else f"{Colors.RED}❌ FAIL{Colors.END}"
    print(f"{status} - {name}")
    if details:
        print(f"    {details}")

def test_health_endpoint():
    """Test /api/health endpoint"""
    try:
        response = requests.get(f"{BACKEND_URL}/health", timeout=10)
        data = response.json()
        passed = response.status_code == 200 and data.get("status") == "healthy"
        print_test("Health Endpoint", passed, f"Status: {data.get('status')}, Timestamp: {data.get('timestamp')}")
        return passed
    except Exception as e:
        print_test("Health Endpoint", False, f"Error: {str(e)}")
        return False

def test_root_endpoint():
    """Test /api/ root endpoint"""
    try:
        response = requests.get(f"{BACKEND_URL}/", timeout=10)
        data = response.json()
        passed = response.status_code == 200 and "DinePoints" in data.get("message", "")
        print_test("Root Endpoint", passed, f"Message: {data.get('message')}")
        return passed
    except Exception as e:
        print_test("Root Endpoint", False, f"Error: {str(e)}")
        return False

def test_openapi_schema():
    """Test OpenAPI schema is available"""
    try:
        # Test via internal endpoint since external /api/openapi.json might be blocked by nginx
        response = requests.get("http://127.0.0.1:8001/openapi.json", timeout=10)
        data = response.json()
        paths_count = len(data.get("paths", {}))
        passed = response.status_code == 200 and paths_count > 100
        print_test("OpenAPI Schema", passed, f"Found {paths_count} API paths")
        return passed
    except Exception as e:
        print_test("OpenAPI Schema", False, f"Error: {str(e)}")
        return False

def test_auth_login_validation():
    """Test auth login endpoint returns proper validation errors (not 500)"""
    try:
        # Test with missing fields
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"username": "test"},
            timeout=10
        )
        passed = response.status_code == 422  # Validation error
        print_test("Auth Login Validation", passed, f"Status: {response.status_code} (expected 422)")
        return passed
    except Exception as e:
        print_test("Auth Login Validation", False, f"Error: {str(e)}")
        return False

def test_auth_login_invalid_credentials():
    """Test auth login with invalid credentials (MongoDB connection test)"""
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"email": "nonexistent@test.com", "password": "wrongpass"},
            timeout=10
        )
        # Should return 401 or 400, not 500 (which would indicate DB connection issue)
        passed = response.status_code in [400, 401]
        detail = response.json().get("detail", "")
        print_test("Auth Invalid Credentials (MongoDB Test)", passed, 
                   f"Status: {response.status_code}, Detail: {detail}")
        return passed
    except Exception as e:
        print_test("Auth Invalid Credentials (MongoDB Test)", False, f"Error: {str(e)}")
        return False

def test_customers_endpoint_auth():
    """Test customers endpoint requires authentication"""
    try:
        response = requests.get(f"{BACKEND_URL}/customers", timeout=10)
        # Should return 401 or 403, not 500
        passed = response.status_code in [401, 403]
        print_test("Customers Endpoint Auth", passed, f"Status: {response.status_code} (requires auth)")
        return passed
    except Exception as e:
        print_test("Customers Endpoint Auth", False, f"Error: {str(e)}")
        return False

def test_points_endpoint_auth():
    """Test points endpoint requires authentication"""
    try:
        response = requests.get(f"{BACKEND_URL}/points/history", timeout=10)
        passed = response.status_code in [401, 403, 422]
        print_test("Points Endpoint Auth", passed, f"Status: {response.status_code} (requires auth)")
        return passed
    except Exception as e:
        print_test("Points Endpoint Auth", False, f"Error: {str(e)}")
        return False

def test_wallet_endpoint_auth():
    """Test wallet endpoint requires authentication"""
    try:
        response = requests.get(f"{BACKEND_URL}/wallet/balance", timeout=10)
        passed = response.status_code in [401, 403, 422]
        print_test("Wallet Endpoint Auth", passed, f"Status: {response.status_code} (requires auth)")
        return passed
    except Exception as e:
        print_test("Wallet Endpoint Auth", False, f"Error: {str(e)}")
        return False

def test_coupons_endpoint_auth():
    """Test coupons endpoint requires authentication"""
    try:
        response = requests.get(f"{BACKEND_URL}/coupons", timeout=10)
        passed = response.status_code in [401, 403]
        print_test("Coupons Endpoint Auth", passed, f"Status: {response.status_code} (requires auth)")
        return passed
    except Exception as e:
        print_test("Coupons Endpoint Auth", False, f"Error: {str(e)}")
        return False

def test_feedback_endpoint_auth():
    """Test feedback endpoint requires authentication"""
    try:
        response = requests.get(f"{BACKEND_URL}/feedback", timeout=10)
        passed = response.status_code in [401, 403]
        print_test("Feedback Endpoint Auth", passed, f"Status: {response.status_code} (requires auth)")
        return passed
    except Exception as e:
        print_test("Feedback Endpoint Auth", False, f"Error: {str(e)}")
        return False

def test_whatsapp_endpoint_auth():
    """Test whatsapp endpoint requires authentication"""
    try:
        response = requests.get(f"{BACKEND_URL}/whatsapp/templates", timeout=10)
        passed = response.status_code in [401, 403]
        print_test("WhatsApp Endpoint Auth", passed, f"Status: {response.status_code} (requires auth)")
        return passed
    except Exception as e:
        print_test("WhatsApp Endpoint Auth", False, f"Error: {str(e)}")
        return False

def test_campaigns_endpoint_auth():
    """Test campaigns endpoint requires authentication"""
    try:
        response = requests.get(f"{BACKEND_URL}/campaigns", timeout=10)
        passed = response.status_code in [401, 403]
        print_test("Campaigns Endpoint Auth", passed, f"Status: {response.status_code} (requires auth)")
        return passed
    except Exception as e:
        print_test("Campaigns Endpoint Auth", False, f"Error: {str(e)}")
        return False

def test_analytics_endpoint_auth():
    """Test analytics endpoint requires authentication"""
    try:
        response = requests.get(f"{BACKEND_URL}/analytics/dashboard", timeout=10)
        passed = response.status_code in [401, 403, 422]
        print_test("Analytics Endpoint Auth", passed, f"Status: {response.status_code} (requires auth)")
        return passed
    except Exception as e:
        print_test("Analytics Endpoint Auth", False, f"Error: {str(e)}")
        return False

def test_migration_endpoint_auth():
    """Test migration endpoint requires authentication"""
    try:
        response = requests.get(f"{BACKEND_URL}/migration/status", timeout=10)
        passed = response.status_code in [401, 403]
        print_test("Migration Endpoint Auth", passed, f"Status: {response.status_code} (requires auth)")
        return passed
    except Exception as e:
        print_test("Migration Endpoint Auth", False, f"Error: {str(e)}")
        return False

def test_invoices_endpoint_auth():
    """Test invoices endpoint requires authentication"""
    try:
        response = requests.get(f"{BACKEND_URL}/invoices", timeout=10)
        passed = response.status_code in [401, 403]
        print_test("Invoices Endpoint Auth", passed, f"Status: {response.status_code} (requires auth)")
        return passed
    except Exception as e:
        print_test("Invoices Endpoint Auth", False, f"Error: {str(e)}")
        return False

def test_supervisor_status():
    """Test supervisor shows backend running"""
    try:
        import subprocess
        result = subprocess.run(
            ["sudo", "supervisorctl", "status", "backend"],
            capture_output=True,
            text=True,
            timeout=5
        )
        passed = "RUNNING" in result.stdout
        print_test("Supervisor Backend Status", passed, result.stdout.strip())
        return passed
    except Exception as e:
        print_test("Supervisor Backend Status", False, f"Error: {str(e)}")
        return False

def main():
    print(f"\n{Colors.BLUE}{'='*70}{Colors.END}")
    print(f"{Colors.BLUE}MyGenie CRM Backend Test Suite{Colors.END}")
    print(f"{Colors.BLUE}Testing after branch switch from dev to main{Colors.END}")
    print(f"{Colors.BLUE}{'='*70}{Colors.END}\n")

    tests = [
        ("Core Health", [
            test_health_endpoint,
            test_root_endpoint,
            test_openapi_schema,
            test_supervisor_status,
        ]),
        ("MongoDB Connection & Auth", [
            test_auth_login_validation,
            test_auth_login_invalid_credentials,
        ]),
        ("Router Endpoints (Auth Required)", [
            test_customers_endpoint_auth,
            test_points_endpoint_auth,
            test_wallet_endpoint_auth,
            test_coupons_endpoint_auth,
            test_feedback_endpoint_auth,
            test_whatsapp_endpoint_auth,
            test_campaigns_endpoint_auth,
            test_analytics_endpoint_auth,
            test_migration_endpoint_auth,
            test_invoices_endpoint_auth,
        ]),
    ]

    total_tests = 0
    passed_tests = 0

    for category, test_funcs in tests:
        print(f"\n{Colors.YELLOW}[{category}]{Colors.END}")
        for test_func in test_funcs:
            total_tests += 1
            if test_func():
                passed_tests += 1
        print()

    print(f"{Colors.BLUE}{'='*70}{Colors.END}")
    print(f"\n{Colors.BLUE}Test Summary:{Colors.END}")
    print(f"  Total: {total_tests}")
    print(f"  {Colors.GREEN}Passed: {passed_tests}{Colors.END}")
    print(f"  {Colors.RED}Failed: {total_tests - passed_tests}{Colors.END}")
    
    if passed_tests == total_tests:
        print(f"\n{Colors.GREEN}✅ All tests passed!{Colors.END}\n")
        return 0
    else:
        print(f"\n{Colors.RED}❌ Some tests failed{Colors.END}\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
