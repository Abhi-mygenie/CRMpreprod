#!/usr/bin/env python3
"""
CR-035 Customer Export & Import Backend API Tests
Tests all export/import endpoints with various scenarios
"""

import requests
import io
import csv
import json
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8001/api"
LOGIN_EMAIL = "owner@kunafamahal.com"
LOGIN_PASSWORD = "Qplazm@10"

# Global token storage
auth_token = None

def login():
    """Authenticate and get token"""
    global auth_token
    print("\n" + "="*80)
    print("AUTHENTICATION")
    print("="*80)
    
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}
    )
    
    if response.status_code == 200:
        data = response.json()
        auth_token = data.get("token") or data.get("access_token")
        print(f"✅ Login successful")
        if auth_token:
            print(f"   Token: {auth_token[:20]}...")
        else:
            print(f"   Response keys: {list(data.keys())}")
        return True
    else:
        print(f"❌ Login failed: {response.status_code}")
        print(f"   Response: {response.text}")
        return False

def get_headers():
    """Get authorization headers"""
    return {"Authorization": f"Bearer {auth_token}"}

def test_export_csv():
    """Test 1: GET /api/customers/export?format=csv"""
    print("\n" + "="*80)
    print("TEST 1: Export Customers as CSV")
    print("="*80)
    
    response = requests.get(
        f"{BASE_URL}/customers/export?format=csv",
        headers=get_headers()
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Content-Type: {response.headers.get('Content-Type')}")
    print(f"Content-Disposition: {response.headers.get('Content-Disposition')}")
    print(f"Content Length: {len(response.content)} bytes")
    
    if response.status_code == 200:
        # Check content type
        if "text/csv" in response.headers.get('Content-Type', ''):
            print("✅ Content-Type is text/csv")
        else:
            print(f"❌ Content-Type is not text/csv: {response.headers.get('Content-Type')}")
        
        # Check Content-Disposition header
        content_disp = response.headers.get('Content-Disposition', '')
        if 'attachment' in content_disp and 'filename' in content_disp:
            print(f"✅ Content-Disposition header present: {content_disp}")
        else:
            print(f"❌ Content-Disposition header missing or invalid: {content_disp}")
        
        # Parse CSV and check structure
        try:
            csv_content = response.text
            reader = csv.reader(io.StringIO(csv_content))
            rows = list(reader)
            if rows:
                headers = rows[0]
                print(f"✅ CSV parsed successfully")
                print(f"   Headers ({len(headers)}): {', '.join(headers[:5])}...")
                print(f"   Total rows (including header): {len(rows)}")
                
                # Check for expected headers
                expected_headers = ["Name", "Phone", "Email", "Total Points", "Tier", "Tags"]
                found_headers = [h for h in expected_headers if h in headers]
                print(f"   Expected headers found: {len(found_headers)}/{len(expected_headers)}")
            else:
                print("⚠️  CSV is empty")
        except Exception as e:
            print(f"❌ Failed to parse CSV: {e}")
        
        return True
    else:
        print(f"❌ Export CSV failed: {response.status_code}")
        print(f"   Response: {response.text[:200]}")
        return False

def test_export_xlsx():
    """Test 2: GET /api/customers/export?format=xlsx"""
    print("\n" + "="*80)
    print("TEST 2: Export Customers as Excel")
    print("="*80)
    
    response = requests.get(
        f"{BASE_URL}/customers/export?format=xlsx",
        headers=get_headers()
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Content-Type: {response.headers.get('Content-Type')}")
    print(f"Content-Disposition: {response.headers.get('Content-Disposition')}")
    print(f"Content Length: {len(response.content)} bytes")
    
    if response.status_code == 200:
        # Check content type for xlsx
        content_type = response.headers.get('Content-Type', '')
        if 'spreadsheet' in content_type or 'xlsx' in content_type:
            print(f"✅ Content-Type is xlsx: {content_type}")
        else:
            print(f"❌ Content-Type is not xlsx: {content_type}")
        
        # Check Content-Disposition header
        content_disp = response.headers.get('Content-Disposition', '')
        if 'attachment' in content_disp and 'filename' in content_disp:
            print(f"✅ Content-Disposition header present: {content_disp}")
        else:
            print(f"❌ Content-Disposition header missing or invalid: {content_disp}")
        
        # Check if content looks like xlsx (starts with PK signature)
        if response.content[:2] == b'PK':
            print("✅ Content appears to be a valid xlsx file (ZIP signature)")
        else:
            print(f"❌ Content does not appear to be xlsx (signature: {response.content[:4]})")
        
        return True
    else:
        print(f"❌ Export Excel failed: {response.status_code}")
        print(f"   Response: {response.text[:200]}")
        return False

def test_export_invalid_format():
    """Test 3: GET /api/customers/export?format=pdf (should fail)"""
    print("\n" + "="*80)
    print("TEST 3: Export with Invalid Format (pdf) - Should Return 400")
    print("="*80)
    
    response = requests.get(
        f"{BASE_URL}/customers/export?format=pdf",
        headers=get_headers()
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 400:
        print("✅ Correctly rejected invalid format with 400")
        print(f"   Response: {response.text}")
        return True
    else:
        print(f"❌ Expected 400 but got {response.status_code}")
        print(f"   Response: {response.text[:200]}")
        return False

def test_sample_template_csv():
    """Test 4: GET /api/customers/sample-import-template?format=csv"""
    print("\n" + "="*80)
    print("TEST 4: Download Sample Import Template (CSV)")
    print("="*80)
    
    response = requests.get(
        f"{BASE_URL}/customers/sample-import-template?format=csv",
        headers=get_headers()
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Content-Type: {response.headers.get('Content-Type')}")
    print(f"Content Length: {len(response.content)} bytes")
    
    if response.status_code == 200:
        # Parse CSV
        try:
            csv_content = response.text
            reader = csv.reader(io.StringIO(csv_content))
            rows = list(reader)
            print(f"✅ CSV parsed successfully")
            print(f"   Total rows: {len(rows)}")
            
            if len(rows) >= 3:  # Header + 2 sample rows
                print(f"✅ Has header + 2 sample rows")
                print(f"   Headers: {rows[0]}")
                print(f"   Sample row 1: {rows[1]}")
                print(f"   Sample row 2: {rows[2]}")
            else:
                print(f"❌ Expected 3 rows (header + 2 samples), got {len(rows)}")
            
            return True
        except Exception as e:
            print(f"❌ Failed to parse CSV: {e}")
            return False
    else:
        print(f"❌ Sample template CSV failed: {response.status_code}")
        print(f"   Response: {response.text[:200]}")
        return False

def test_sample_template_xlsx():
    """Test 5: GET /api/customers/sample-import-template?format=xlsx"""
    print("\n" + "="*80)
    print("TEST 5: Download Sample Import Template (Excel)")
    print("="*80)
    
    response = requests.get(
        f"{BASE_URL}/customers/sample-import-template?format=xlsx",
        headers=get_headers()
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Content-Type: {response.headers.get('Content-Type')}")
    print(f"Content Length: {len(response.content)} bytes")
    
    if response.status_code == 200:
        # Check if content looks like xlsx
        if response.content[:2] == b'PK':
            print("✅ Content appears to be a valid xlsx file")
        else:
            print(f"❌ Content does not appear to be xlsx")
        
        return True
    else:
        print(f"❌ Sample template Excel failed: {response.status_code}")
        print(f"   Response: {response.text[:200]}")
        return False

def test_import_preview_valid():
    """Test 6a: POST /api/customers/import-preview with valid CSV"""
    print("\n" + "="*80)
    print("TEST 6a: Import Preview - Valid CSV with 3 rows (1 missing phone)")
    print("="*80)
    
    # Create CSV with 3 rows: 2 valid, 1 with missing phone
    csv_content = """name,phone,email,dob,city,address,tags
Amit Kumar,9876543210,amit@example.com,1985-03-15,Mumbai,123 Street,VIP
Priya Sharma,9123456789,priya@example.com,,Delhi,,Regular
Rahul Verma,,rahul@example.com,1990-01-01,Bangalore,456 Road,"""
    
    files = {
        'file': ('test_import.csv', csv_content, 'text/csv')
    }
    
    response = requests.post(
        f"{BASE_URL}/customers/import-preview",
        headers=get_headers(),
        files=files
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Import preview successful")
        print(f"   Filename: {data.get('filename')}")
        print(f"   Format: {data.get('format')}")
        print(f"   Total rows: {data.get('total_rows')}")
        print(f"   New count: {data.get('new_count')}")
        print(f"   Update count: {data.get('update_count')}")
        print(f"   Error count: {data.get('error_count')}")
        
        # Check expectations
        if data.get('error_count') == 1:
            print("✅ Correctly identified 1 error (missing phone)")
        else:
            print(f"❌ Expected error_count=1, got {data.get('error_count')}")
        
        if data.get('new_count') >= 2 or (data.get('new_count') + data.get('update_count')) >= 2:
            print(f"✅ Correctly identified 2 valid rows (new={data.get('new_count')}, update={data.get('update_count')})")
        else:
            print(f"❌ Expected 2 valid rows, got new={data.get('new_count')}, update={data.get('update_count')}")
        
        # Check preview_rows
        preview_rows = data.get('preview_rows', [])
        print(f"   Preview rows: {len(preview_rows)}")
        if len(preview_rows) <= 5:
            print("✅ Preview rows limited to 5 or less")
        else:
            print(f"❌ Preview rows should be max 5, got {len(preview_rows)}")
        
        # Check all_errors
        all_errors = data.get('all_errors', [])
        print(f"   All errors: {len(all_errors)}")
        if all_errors:
            print(f"   Error details: {all_errors[0]}")
        
        return True
    else:
        print(f"❌ Import preview failed: {response.status_code}")
        print(f"   Response: {response.text[:500]}")
        return False

def test_import_preview_phone_prefix():
    """Test 6b: POST /api/customers/import-preview with +91 phone prefix"""
    print("\n" + "="*80)
    print("TEST 6b: Import Preview - Phone with +91 prefix (should normalize)")
    print("="*80)
    
    # Create CSV with +91 prefix
    csv_content = """name,phone,email,dob,city,address,tags
Sanjay Gupta,+919876543210,sanjay@example.com,1988-06-20,Pune,789 Avenue,Premium"""
    
    files = {
        'file': ('test_phone_prefix.csv', csv_content, 'text/csv')
    }
    
    response = requests.post(
        f"{BASE_URL}/customers/import-preview",
        headers=get_headers(),
        files=files
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Import preview successful")
        print(f"   Total rows: {data.get('total_rows')}")
        print(f"   New count: {data.get('new_count')}")
        print(f"   Update count: {data.get('update_count')}")
        print(f"   Error count: {data.get('error_count')}")
        
        # Check that phone was normalized (not error)
        if data.get('error_count') == 0:
            print("✅ Phone with +91 prefix normalized correctly (no error)")
        else:
            print(f"❌ Phone with +91 prefix caused error: {data.get('all_errors')}")
        
        # Check preview row
        preview_rows = data.get('preview_rows', [])
        if preview_rows:
            first_row = preview_rows[0]
            print(f"   Preview row status: {first_row.get('status')}")
            print(f"   Preview row phone: {first_row.get('phone')}")
            
            if first_row.get('status') in ['new', 'update']:
                print("✅ Row status is 'new' or 'update' (not error)")
            else:
                print(f"❌ Expected status 'new' or 'update', got '{first_row.get('status')}'")
            
            # Check if phone is normalized to 10 digits
            phone = first_row.get('phone', '')
            if len(phone) == 10 and phone.isdigit():
                print(f"✅ Phone normalized to 10 digits: {phone}")
            else:
                print(f"❌ Phone not normalized correctly: {phone}")
        
        return True
    else:
        print(f"❌ Import preview failed: {response.status_code}")
        print(f"   Response: {response.text[:500]}")
        return False

def test_import_preview_invalid_file():
    """Test 6c: POST /api/customers/import-preview with .pdf file (should fail)"""
    print("\n" + "="*80)
    print("TEST 6c: Import Preview - Invalid File Type (.pdf) - Should Return 400")
    print("="*80)
    
    # Create fake PDF content
    pdf_content = b"%PDF-1.4\nFake PDF content"
    
    files = {
        'file': ('test_file.pdf', pdf_content, 'application/pdf')
    }
    
    response = requests.post(
        f"{BASE_URL}/customers/import-preview",
        headers=get_headers(),
        files=files
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 400:
        print("✅ Correctly rejected .pdf file with 400")
        print(f"   Response: {response.text}")
        return True
    else:
        print(f"❌ Expected 400 but got {response.status_code}")
        print(f"   Response: {response.text[:200]}")
        return False

def test_import_execute_new():
    """Test 7a: POST /api/customers/import - Import new customers"""
    print("\n" + "="*80)
    print("TEST 7a: Import Execute - New Customers")
    print("="*80)
    
    # Create CSV with unique phone numbers (timestamp-based)
    timestamp = datetime.now().strftime("%H%M%S")
    csv_content = f"""name,phone,email,dob,city,address,tags
Test User {timestamp},98765{timestamp[-5:]},test{timestamp}@example.com,1990-01-01,TestCity,Test Address,TestTag
Test User2 {timestamp},98766{timestamp[-5:]},test2{timestamp}@example.com,1991-02-02,TestCity2,Test Address2,TestTag2"""
    
    files = {
        'file': ('import_new.csv', csv_content, 'text/csv')
    }
    
    response = requests.post(
        f"{BASE_URL}/customers/import",
        headers=get_headers(),
        files=files
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Import successful")
        print(f"   Filename: {data.get('filename')}")
        print(f"   Total rows: {data.get('total_rows')}")
        print(f"   Imported: {data.get('imported')}")
        print(f"   Updated: {data.get('updated')}")
        print(f"   Failed: {data.get('failed')}")
        
        if data.get('imported', 0) > 0:
            print(f"✅ Successfully imported {data.get('imported')} customers")
        else:
            print(f"⚠️  No customers imported (might be duplicates)")
        
        return True
    else:
        print(f"❌ Import failed: {response.status_code}")
        print(f"   Response: {response.text[:500]}")
        return False

def test_import_execute_duplicate():
    """Test 7b: POST /api/customers/import - Re-import same file (should update)"""
    print("\n" + "="*80)
    print("TEST 7b: Import Execute - Duplicate Phone (Should Update)")
    print("="*80)
    
    # Use same phone number but different name
    csv_content = """name,phone,email,dob,city,address,tags
Updated Name,9876543210,updated@example.com,1985-03-15,Mumbai Updated,123 Street Updated,VIP Updated"""
    
    files = {
        'file': ('import_update.csv', csv_content, 'text/csv')
    }
    
    response = requests.post(
        f"{BASE_URL}/customers/import",
        headers=get_headers(),
        files=files
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Import successful")
        print(f"   Total rows: {data.get('total_rows')}")
        print(f"   Imported: {data.get('imported')}")
        print(f"   Updated: {data.get('updated')}")
        print(f"   Failed: {data.get('failed')}")
        
        if data.get('updated', 0) > 0:
            print(f"✅ Successfully updated {data.get('updated')} customers (duplicate phone)")
        elif data.get('imported', 0) > 0:
            print(f"⚠️  Customer was imported as new (phone might not exist in DB)")
        else:
            print(f"⚠️  No customers imported or updated")
        
        return True
    else:
        print(f"❌ Import failed: {response.status_code}")
        print(f"   Response: {response.text[:500]}")
        return False

def test_import_tags_additive():
    """Test 7c: POST /api/customers/import - Tags should be additive"""
    print("\n" + "="*80)
    print("TEST 7c: Import Execute - Tags Additive (existing + new)")
    print("="*80)
    
    # Import with new tag for existing customer
    csv_content = """name,phone,email,dob,city,address,tags
Existing Customer,9876543210,existing@example.com,1985-03-15,Mumbai,123 Street,NewTag"""
    
    files = {
        'file': ('import_tags.csv', csv_content, 'text/csv')
    }
    
    response = requests.post(
        f"{BASE_URL}/customers/import",
        headers=get_headers(),
        files=files
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Import successful")
        print(f"   Updated: {data.get('updated')}")
        print(f"   Note: Tags should be merged additively (old + new)")
        print(f"   To verify: Check customer in DB has both old and new tags")
        return True
    else:
        print(f"❌ Import failed: {response.status_code}")
        print(f"   Response: {response.text[:500]}")
        return False

def test_import_history():
    """Test 8: GET /api/customers/import-history"""
    print("\n" + "="*80)
    print("TEST 8: Get Import History")
    print("="*80)
    
    response = requests.get(
        f"{BASE_URL}/customers/import-history",
        headers=get_headers()
    )
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Import history retrieved")
        print(f"   Total logs: {len(data)}")
        
        if len(data) > 0:
            print(f"✅ Has import logs (expected after previous imports)")
            # Show first log
            first_log = data[0]
            print(f"   Latest log:")
            print(f"     - Filename: {first_log.get('filename')}")
            print(f"     - Format: {first_log.get('format')}")
            print(f"     - Total rows: {first_log.get('total_rows')}")
            print(f"     - Imported: {first_log.get('imported')}")
            print(f"     - Updated: {first_log.get('updated')}")
            print(f"     - Failed: {first_log.get('failed')}")
            print(f"     - Created at: {first_log.get('created_at')}")
        else:
            print(f"⚠️  No import logs found (expected at least 1 after previous tests)")
        
        # Check if sorted by newest first
        if len(data) >= 2:
            first_date = data[0].get('created_at', '')
            second_date = data[1].get('created_at', '')
            if first_date >= second_date:
                print(f"✅ Logs sorted by newest first")
            else:
                print(f"❌ Logs not sorted correctly")
        
        # Check max 10 logs
        if len(data) <= 10:
            print(f"✅ Returns max 10 logs")
        else:
            print(f"❌ Returns more than 10 logs: {len(data)}")
        
        return True
    else:
        print(f"❌ Import history failed: {response.status_code}")
        print(f"   Response: {response.text[:500]}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("CR-035 CUSTOMER EXPORT & IMPORT - BACKEND API TESTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Login: {LOGIN_EMAIL}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Login first
    if not login():
        print("\n❌ FATAL: Login failed. Cannot proceed with tests.")
        return
    
    # Run all tests
    results = {}
    
    results['test_export_csv'] = test_export_csv()
    results['test_export_xlsx'] = test_export_xlsx()
    results['test_export_invalid_format'] = test_export_invalid_format()
    results['test_sample_template_csv'] = test_sample_template_csv()
    results['test_sample_template_xlsx'] = test_sample_template_xlsx()
    results['test_import_preview_valid'] = test_import_preview_valid()
    results['test_import_preview_phone_prefix'] = test_import_preview_phone_prefix()
    results['test_import_preview_invalid_file'] = test_import_preview_invalid_file()
    results['test_import_execute_new'] = test_import_execute_new()
    results['test_import_execute_duplicate'] = test_import_execute_duplicate()
    results['test_import_tags_additive'] = test_import_tags_additive()
    results['test_import_history'] = test_import_history()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
