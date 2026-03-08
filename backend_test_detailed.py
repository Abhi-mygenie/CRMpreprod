#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class DetailedPOSEventsTester:
    def __init__(self):
        self.base_url = "https://crm-build-deploy.preview.emergentagent.com"
        self.demo_api_key = "demo-api-key-12345"
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

    def run_test_with_response_validation(self, name, endpoint, data, headers, expected_status, validate_func=None):
        """Run test and validate response content"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        print(f"   Data: {json.dumps(data, indent=2)}")
        
        try:
            response = requests.post(url, json=data, headers=headers, timeout=30)
            
            print(f"   Status: {response.status_code}")
            
            success = response.status_code == expected_status
            
            if success and validate_func:
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)}")
                    
                    # Run custom validation
                    validation_result, validation_msg = validate_func(response_data)
                    if not validation_result:
                        success = False
                        print(f"   ❌ Validation failed: {validation_msg}")
                        self.log_result(name, False, f"Validation failed: {validation_msg}")
                        return False, response
                    else:
                        print(f"   ✅ Validation passed: {validation_msg}")
                        
                except Exception as e:
                    print(f"   ⚠️ Could not parse response JSON: {e}")
                    print(f"   Raw response: {response.text}")
            else:
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)}")
                except:
                    print(f"   Raw response: {response.text}")
            
            if success:
                print(f"✅ {name}")
                self.log_result(name, True, f"Status: {response.status_code}")
            else:
                print(f"❌ {name} - Expected {expected_status}, got {response.status_code}")
                self.log_result(name, False, f"Expected {expected_status}, got {response.status_code}")
            
            return success, response

        except Exception as e:
            error_msg = f"Request error: {str(e)}"
            print(f"❌ {name} - {error_msg}")
            self.log_result(name, False, error_msg)
            return False, None

    def validate_valid_event_response(self, response_data):
        """Validate response for valid event"""
        required_fields = ['success', 'message', 'data']
        for field in required_fields:
            if field not in response_data:
                return False, f"Missing required field: {field}"
        
        if not response_data['success']:
            return False, f"Expected success=True, got {response_data['success']}"
        
        data = response_data.get('data', {})
        if 'event_id' not in data:
            return False, "Missing event_id in response data"
        
        if 'event_type' not in data:
            return False, "Missing event_type in response data"
            
        return True, "Valid event response structure"

    def validate_invalid_event_type_response(self, response_data):
        """Validate response for invalid event type"""
        if response_data.get('success', True):
            return False, f"Expected success=False for invalid event type, got {response_data.get('success')}"
        
        message = response_data.get('message', '')
        if 'Invalid event_type' not in message:
            return False, f"Expected error message about invalid event_type, got: {message}"
        
        return True, "Correct error response for invalid event type"

    def validate_missing_delivery_phone_response(self, response_data):
        """Validate response for missing delivery boy phone"""
        if response_data.get('success', True):
            return False, f"Expected success=False for missing delivery phone, got {response_data.get('success')}"
        
        message = response_data.get('message', '')
        if 'delivery_boy_phone' not in message.lower():
            return False, f"Expected error message about delivery_boy_phone, got: {message}"
        
        return True, "Correct error response for missing delivery phone"

    def validate_no_template_response(self, response_data):
        """Validate response when no template is configured"""
        if not response_data.get('success', False):
            return False, f"Expected success=True even without template, got {response_data.get('success')}"
        
        message = response_data.get('message', '')
        data = response_data.get('data', {})
        
        # Should indicate no template or WhatsApp not sent
        whatsapp_sent = data.get('whatsapp_sent', True)
        if whatsapp_sent:
            return False, f"Expected whatsapp_sent=False when no template, got {whatsapp_sent}"
        
        return True, "Correct response when no template configured"

    def test_valid_new_order_customer(self):
        """Test valid new_order_customer event"""
        headers = {
            'Content-Type': 'application/json',
            'X-API-Key': self.demo_api_key
        }
        
        data = {
            "pos_id": "mygenie",
            "restaurant_id": "test_restaurant_001",
            "event_type": "new_order_customer",
            "order_id": "ORD_001_NEW_CUSTOMER",
            "customer_phone": "+919876543210",
            "event_data": {
                "customer_name": "Test Customer",
                "order_amount": 450.0,
                "restaurant_name": "Test Restaurant"
            }
        }
        
        return self.run_test_with_response_validation(
            "Valid New Order Customer Event",
            "/api/pos/events",
            data,
            headers,
            200,
            self.validate_valid_event_response
        )

    def test_invalid_event_type(self):
        """Test invalid event type"""
        headers = {
            'Content-Type': 'application/json', 
            'X-API-Key': self.demo_api_key
        }
        
        data = {
            "pos_id": "mygenie",
            "restaurant_id": "test_restaurant_002",
            "event_type": "nonexistent_event_type",
            "order_id": "ORD_002_INVALID",
            "customer_phone": "+919876543210"
        }
        
        return self.run_test_with_response_validation(
            "Invalid Event Type",
            "/api/pos/events",
            data,
            headers,
            200,
            self.validate_invalid_event_type_response
        )

    def test_order_ready_delivery_missing_phone(self):
        """Test order_ready_delivery without delivery_boy_phone"""
        headers = {
            'Content-Type': 'application/json',
            'X-API-Key': self.demo_api_key
        }
        
        data = {
            "pos_id": "mygenie",
            "restaurant_id": "test_restaurant_003",
            "event_type": "order_ready_delivery", 
            "order_id": "ORD_003_DELIVERY_MISSING",
            "customer_phone": "+919876543210"
        }
        
        return self.run_test_with_response_validation(
            "Order Ready Delivery - Missing Phone",
            "/api/pos/events",
            data,
            headers,
            200,
            self.validate_missing_delivery_phone_response
        )

    def test_order_ready_delivery_with_phone(self):
        """Test order_ready_delivery with delivery_boy_phone"""
        headers = {
            'Content-Type': 'application/json',
            'X-API-Key': self.demo_api_key
        }
        
        data = {
            "pos_id": "mygenie",
            "restaurant_id": "test_restaurant_004",
            "event_type": "order_ready_delivery",
            "order_id": "ORD_004_DELIVERY_WITH_PHONE",
            "customer_phone": "+919876543210",
            "event_data": {
                "delivery_boy_phone": "+919876543299",
                "delivery_boy_name": "Rahul Kumar",
                "estimated_time": "15 minutes"
            }
        }
        
        return self.run_test_with_response_validation(
            "Order Ready Delivery - With Phone",
            "/api/pos/events", 
            data,
            headers,
            200,
            self.validate_valid_event_response
        )

    def test_new_order_outlet(self):
        """Test new_order_outlet event"""
        headers = {
            'Content-Type': 'application/json',
            'X-API-Key': self.demo_api_key
        }
        
        data = {
            "pos_id": "mygenie",
            "restaurant_id": "test_restaurant_005",
            "event_type": "new_order_outlet",
            "order_id": "ORD_005_OUTLET",
            "customer_phone": "+919876543210",
            "event_data": {
                "outlet_phone": "+919876543288",
                "order_amount": 850.0,
                "payment_method": "online",
                "special_instructions": "Extra spicy"
            }
        }
        
        return self.run_test_with_response_validation(
            "New Order Outlet Event",
            "/api/pos/events",
            data,
            headers,
            200,
            self.validate_valid_event_response
        )

    def test_all_pos_event_types(self):
        """Test all valid POS event types"""
        headers = {
            'Content-Type': 'application/json',
            'X-API-Key': self.demo_api_key
        }
        
        # List of all valid POS events from schemas.py
        pos_events = [
            "new_order_customer",
            "new_order_outlet", 
            "order_confirmed",
            "order_ready_customer",
            "item_ready",
            "order_served", 
            "item_served",
            "order_ready_delivery",
            "order_dispatched",
            "send_bill_manual",
            "send_bill_auto"
        ]
        
        success_count = 0
        
        for i, event_type in enumerate(pos_events):
            print(f"\n📋 Testing event type {i+1}/{len(pos_events)}: {event_type}")
            
            data = {
                "pos_id": "mygenie", 
                "restaurant_id": f"test_restaurant_{i+10}",
                "event_type": event_type,
                "order_id": f"ORD_{i+10}_{event_type.upper()}",
                "customer_phone": "+919876543210",
                "event_data": {
                    "order_amount": 500.0 + (i * 50),
                    "test_event": True
                }
            }
            
            # Add delivery_boy_phone for order_ready_delivery
            if event_type == "order_ready_delivery":
                data["event_data"]["delivery_boy_phone"] = "+919876543277"
            
            # Add outlet_phone for new_order_outlet  
            if event_type == "new_order_outlet":
                data["event_data"]["outlet_phone"] = "+919876543266"
            
            success, response = self.run_test_with_response_validation(
                f"Event Type: {event_type}",
                "/api/pos/events",
                data,
                headers,
                200,
                self.validate_no_template_response  # Most events likely have no template configured
            )
            
            if success:
                success_count += 1
        
        print(f"\n📊 Event Types Summary: {success_count}/{len(pos_events)} event types tested successfully")
        return success_count == len(pos_events)

    def run_all_tests(self):
        """Run all detailed POS events tests"""
        print("🚀 Starting Detailed POS Events API Tests")
        print(f"🌐 Base URL: {self.base_url}")
        print(f"🔑 API Key: {self.demo_api_key}")
        print("=" * 70)

        # Run individual tests
        self.test_valid_new_order_customer()
        self.test_invalid_event_type()
        self.test_order_ready_delivery_missing_phone()
        self.test_order_ready_delivery_with_phone()
        self.test_new_order_outlet()
        
        # Test all event types
        self.test_all_pos_event_types()

        # Print summary
        print("\n" + "=" * 70)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All detailed tests passed!")
        else:
            print("❌ Some detailed tests failed")
            print("\nFailed tests:")
            for result in self.test_results:
                if result["status"] == "FAIL":
                    print(f"  - {result['test']}: {result['details']}")
            
        return self.tests_passed == self.tests_run

def main():
    """Main test execution"""
    tester = DetailedPOSEventsTester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except Exception as e:
        print(f"💥 Test execution failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())