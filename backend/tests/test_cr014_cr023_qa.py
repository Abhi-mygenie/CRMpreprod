"""
CR-014 (E-Invoice) and CR-023 (WhatsApp Template Builder) QA Tests
Tests profile fields, bill settings, logo upload, invoice endpoints, and template CRUD.
"""
import pytest
import requests
import os
import io
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_EMAIL = "owner@kunafamahal.com"
TEST_PASSWORD = "Qplazm@10"


class TestAuth:
    """Authentication helper tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            timeout=30
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def user_data(self, auth_headers):
        """Get current user data"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=15)
        assert response.status_code == 200
        return response.json()


class TestCR014ProfileFields(TestAuth):
    """CR-014 AC1-AC4: Profile fields, GSTIN validation, bill settings, logo upload"""
    
    def test_ac1_profile_fields_save_and_persist(self, auth_headers, user_data):
        """AC1: Profile fields save and persist - PUT /api/auth/profile with gstin/pan/fssai_license → GET /api/auth/me returns them"""
        # Save original values to restore later
        original_gstin = user_data.get("gstin", "")
        original_pan = user_data.get("pan", "")
        original_fssai = user_data.get("fssai_license", "")
        
        # Test values (valid formats)
        test_gstin = "29ABCDE1234F1Z5"  # Valid Karnataka GSTIN
        test_pan = "ABCDE1234F"
        test_fssai = "12345678901234"
        
        try:
            # Update profile with test values
            update_response = requests.put(
                f"{BASE_URL}/api/auth/profile",
                headers=auth_headers,
                json={
                    "gstin": test_gstin,
                    "pan": test_pan,
                    "fssai_license": test_fssai
                },
                timeout=15
            )
            assert update_response.status_code == 200, f"Profile update failed: {update_response.text}"
            
            # Verify via GET /me
            me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=15)
            assert me_response.status_code == 200
            me_data = me_response.json()
            
            assert me_data.get("gstin") == test_gstin, f"GSTIN not persisted: {me_data.get('gstin')}"
            assert me_data.get("pan") == test_pan, f"PAN not persisted: {me_data.get('pan')}"
            assert me_data.get("fssai_license") == test_fssai, f"FSSAI not persisted: {me_data.get('fssai_license')}"
            
            print(f"✓ AC1 PASS: Profile fields saved and persisted correctly")
            
        finally:
            # Restore original values
            requests.put(
                f"{BASE_URL}/api/auth/profile",
                headers=auth_headers,
                json={
                    "gstin": original_gstin,
                    "pan": original_pan,
                    "fssai_license": original_fssai
                },
                timeout=15
            )
    
    def test_ac2_gstin_regex_rejects_invalid(self, auth_headers):
        """AC2: GSTIN regex rejects invalid - PUT /api/auth/profile with gstin='INVALID' → 400"""
        response = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers=auth_headers,
            json={"gstin": "INVALID"},
            timeout=15
        )
        assert response.status_code == 400, f"Expected 400 for invalid GSTIN, got {response.status_code}"
        assert "gstin" in response.text.lower() or "invalid" in response.text.lower(), f"Error should mention GSTIN: {response.text}"
        print(f"✓ AC2 PASS: Invalid GSTIN rejected with 400")
    
    def test_ac2_gstin_regex_rejects_short(self, auth_headers):
        """AC2 variant: Short GSTIN should be rejected"""
        response = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers=auth_headers,
            json={"gstin": "29ABC"},
            timeout=15
        )
        assert response.status_code == 400, f"Expected 400 for short GSTIN, got {response.status_code}"
        print(f"✓ AC2 variant PASS: Short GSTIN rejected")
    
    def test_ac2_gstin_blank_allowed(self, auth_headers, user_data):
        """AC2 variant: Blank GSTIN should be allowed (clearing the field)"""
        original_gstin = user_data.get("gstin", "")
        
        try:
            response = requests.put(
                f"{BASE_URL}/api/auth/profile",
                headers=auth_headers,
                json={"gstin": ""},
                timeout=15
            )
            assert response.status_code == 200, f"Blank GSTIN should be allowed, got {response.status_code}: {response.text}"
            print(f"✓ AC2 variant PASS: Blank GSTIN allowed")
        finally:
            # Restore
            if original_gstin:
                requests.put(
                    f"{BASE_URL}/api/auth/profile",
                    headers=auth_headers,
                    json={"gstin": original_gstin},
                    timeout=15
                )
    
    def test_ac3_bill_settings_merge(self, auth_headers, user_data):
        """AC3: Bill settings merge - set header_color, then set footer_message, both persist"""
        original_bill_settings = user_data.get("bill_settings") or {}
        
        try:
            # Step 1: Set header_color
            response1 = requests.put(
                f"{BASE_URL}/api/auth/profile",
                headers=auth_headers,
                json={"bill_settings": {"header_color": "#FF0000"}},
                timeout=15
            )
            assert response1.status_code == 200, f"Setting header_color failed: {response1.text}"
            
            # Step 2: Set footer_message (should NOT wipe header_color)
            response2 = requests.put(
                f"{BASE_URL}/api/auth/profile",
                headers=auth_headers,
                json={"bill_settings": {"footer_message": "Test Footer Message"}},
                timeout=15
            )
            assert response2.status_code == 200, f"Setting footer_message failed: {response2.text}"
            
            # Step 3: Verify both persist
            me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=15)
            assert me_response.status_code == 200
            me_data = me_response.json()
            bs = me_data.get("bill_settings") or {}
            
            assert bs.get("header_color") == "#FF0000", f"header_color not persisted: {bs.get('header_color')}"
            assert bs.get("footer_message") == "Test Footer Message", f"footer_message not persisted: {bs.get('footer_message')}"
            
            print(f"✓ AC3 PASS: Bill settings merge correctly (both header_color and footer_message persist)")
            
        finally:
            # Restore original bill_settings
            requests.put(
                f"{BASE_URL}/api/auth/profile",
                headers=auth_headers,
                json={"bill_settings": original_bill_settings},
                timeout=15
            )
    
    def test_ac4_logo_upload(self, auth_headers, user_data):
        """AC4: Logo upload - POST /api/auth/profile/logo with image file → GET /api/auth/profile/logo/{user_id} returns image"""
        user_id = user_data.get("id")
        
        # Create a small test PNG (1x1 pixel red)
        # PNG header + IHDR + IDAT + IEND for 1x1 red pixel
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
            0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x18, 0xDD,
            0x8D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,  # IEND chunk
            0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        # Upload logo
        files = {"file": ("test_logo.png", io.BytesIO(png_data), "image/png")}
        upload_headers = {"Authorization": auth_headers["Authorization"]}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/auth/profile/logo",
            headers=upload_headers,
            files=files,
            timeout=15
        )
        assert upload_response.status_code == 200, f"Logo upload failed: {upload_response.text}"
        upload_data = upload_response.json()
        assert "logo_url" in upload_data, f"No logo_url in response: {upload_data}"
        
        # Verify logo can be retrieved
        logo_response = requests.get(
            f"{BASE_URL}/api/auth/profile/logo/{user_id}",
            timeout=15
        )
        assert logo_response.status_code == 200, f"Logo retrieval failed: {logo_response.status_code}"
        assert logo_response.headers.get("content-type", "").startswith("image/"), f"Response is not an image: {logo_response.headers.get('content-type')}"
        
        print(f"✓ AC4 PASS: Logo upload and retrieval working")


class TestCR014InvoiceEndpoints(TestAuth):
    """CR-014 AC5-AC9: Invoice HTML, PDF, and deduplication"""
    
    @pytest.fixture(scope="class")
    def existing_invoice_token(self, auth_headers):
        """Try to find an existing invoice token from DB or use known test tokens"""
        # Known test tokens from implementation
        test_tokens = [
            "67ddd6833bee4f33af2aaa941ee146c9",
            "9aa7bfc25e204b5d8e9a143fba0feea8"
        ]
        
        for token in test_tokens:
            response = requests.get(f"{BASE_URL}/api/invoices/{token}", timeout=15)
            if response.status_code == 200:
                return token
        
        # If no known tokens work, return None (tests will be skipped)
        return None
    
    def test_invoice_404_for_nonexistent_token(self, auth_headers):
        """Invoice endpoints return 404 for non-existent token"""
        fake_token = "nonexistent_token_12345"
        
        # Test HTML endpoint
        html_response = requests.get(f"{BASE_URL}/api/invoices/{fake_token}", timeout=15)
        assert html_response.status_code == 404, f"Expected 404 for fake token HTML, got {html_response.status_code}"
        
        # Test PDF endpoint
        pdf_response = requests.get(f"{BASE_URL}/api/invoices/{fake_token}/pdf", timeout=15)
        assert pdf_response.status_code == 404, f"Expected 404 for fake token PDF, got {pdf_response.status_code}"
        
        print(f"✓ Invoice 404 PASS: Non-existent token returns 404")
    
    def test_ac5_invoice_html_renders(self, existing_invoice_token):
        """AC5: Food invoice renders - GET /api/invoices/{token} → returns HTML"""
        if not existing_invoice_token:
            pytest.skip("No existing invoice token found for testing")
        
        response = requests.get(f"{BASE_URL}/api/invoices/{existing_invoice_token}", timeout=15)
        assert response.status_code == 200, f"Invoice HTML failed: {response.status_code}"
        assert "text/html" in response.headers.get("content-type", ""), f"Response is not HTML: {response.headers.get('content-type')}"
        assert len(response.text) > 100, "HTML response too short"
        
        print(f"✓ AC5 PASS: Invoice HTML renders correctly")
    
    def test_ac6_invoice_pdf(self, existing_invoice_token):
        """AC6: Invoice PDF - GET /api/invoices/{token}/pdf → returns PDF"""
        if not existing_invoice_token:
            pytest.skip("No existing invoice token found for testing")
        
        response = requests.get(f"{BASE_URL}/api/invoices/{existing_invoice_token}/pdf", timeout=30)
        assert response.status_code == 200, f"Invoice PDF failed: {response.status_code}"
        
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type.lower() or "octet-stream" in content_type.lower(), f"Response is not PDF: {content_type}"
        
        # Check PDF magic bytes
        if len(response.content) > 4:
            assert response.content[:4] == b'%PDF', "Response does not start with PDF magic bytes"
        
        print(f"✓ AC6 PASS: Invoice PDF generated correctly")


class TestCR023TemplateBuilder(TestAuth):
    """CR-023: WhatsApp Template Builder tests"""
    
    @pytest.fixture(scope="class")
    def test_template_name(self):
        """Generate unique test template name"""
        return f"test_template_{int(time.time())}"
    
    def test_ac1_create_template_draft(self, auth_headers, test_template_name):
        """AC1: Create template draft - POST /api/whatsapp/custom-templates → 200"""
        response = requests.post(
            f"{BASE_URL}/api/whatsapp/custom-templates",
            headers=auth_headers,
            json={
                "template_name": test_template_name,
                "category": "utility",
                "language": "en",
                "header_type": "none",
                "body": "Hello {{1}}, your order {{2}} is confirmed.",
                "footer": "Thank you"
            },
            timeout=15
        )
        assert response.status_code == 200, f"Create template failed: {response.text}"
        data = response.json()
        assert "id" in data, f"No id in response: {data}"
        assert data.get("template_name") == test_template_name
        assert data.get("status") == "draft"
        
        print(f"✓ AC1 PASS: Template draft created successfully")
        return data["id"]
    
    def test_ac2_list_custom_templates(self, auth_headers):
        """AC2: List custom templates - GET /api/whatsapp/custom-templates → array"""
        response = requests.get(
            f"{BASE_URL}/api/whatsapp/custom-templates",
            headers=auth_headers,
            timeout=15
        )
        assert response.status_code == 200, f"List templates failed: {response.text}"
        data = response.json()
        assert "templates" in data, f"No templates key in response: {data}"
        assert isinstance(data["templates"], list), f"templates is not a list: {type(data['templates'])}"
        
        print(f"✓ AC2 PASS: Custom templates list returned ({len(data['templates'])} templates)")
    
    def test_ac3_check_template_name(self, auth_headers):
        """AC3: Duplicate name check - GET /api/whatsapp/check-template-name?name=test → returns exists field"""
        response = requests.get(
            f"{BASE_URL}/api/whatsapp/check-template-name?name=test",
            headers=auth_headers,
            timeout=15
        )
        assert response.status_code == 200, f"Check template name failed: {response.text}"
        data = response.json()
        assert "exists" in data, f"No 'exists' field in response: {data}"
        assert isinstance(data["exists"], bool), f"'exists' is not boolean: {type(data['exists'])}"
        
        print(f"✓ AC3 PASS: Template name check returns exists field (exists={data['exists']})")
    
    def test_ac4_v1_single_brace_detection(self, auth_headers):
        """AC4: V1 - Single-brace detection - body with {1} → validation error"""
        response = requests.post(
            f"{BASE_URL}/api/whatsapp/meta/create-template",
            headers=auth_headers,
            json={
                "template_name": f"test_v1_{int(time.time())}",
                "category": "utility",
                "language": "en",
                "body": "Hello {1}, this is wrong",  # Single brace - should fail
                "body_examples": ["John"]
            },
            timeout=15
        )
        # Should return 400 with validation error about single braces
        assert response.status_code == 400, f"Expected 400 for single-brace, got {response.status_code}: {response.text}"
        assert "single" in response.text.lower() or "brace" in response.text.lower() or "{{1}}" in response.text, f"Error should mention single braces: {response.text}"
        
        print(f"✓ AC4 (V1) PASS: Single-brace variables rejected")
    
    def test_ac5_v2_sequential_variables(self, auth_headers):
        """AC5: V2 - Sequential variable check - body with {{1}} {{3}} → error missing {{2}}"""
        response = requests.post(
            f"{BASE_URL}/api/whatsapp/meta/create-template",
            headers=auth_headers,
            json={
                "template_name": f"test_v2_{int(time.time())}",
                "category": "utility",
                "language": "en",
                "body": "Hello {{1}}, order {{3}} confirmed",  # Missing {{2}}
                "body_examples": ["John", "123"]
            },
            timeout=15
        )
        # Should return 400 with validation error about sequential variables
        assert response.status_code == 400, f"Expected 400 for non-sequential vars, got {response.status_code}: {response.text}"
        assert "sequential" in response.text.lower() or "{{2}}" in response.text or "missing" in response.text.lower(), f"Error should mention sequential: {response.text}"
        
        print(f"✓ AC5 (V2) PASS: Non-sequential variables rejected")
    
    def test_ac6_v3_footer_no_variables(self, auth_headers):
        """AC6: V3 - Footer cannot contain variables"""
        response = requests.post(
            f"{BASE_URL}/api/whatsapp/meta/create-template",
            headers=auth_headers,
            json={
                "template_name": f"test_v3_{int(time.time())}",
                "category": "utility",
                "language": "en",
                "body": "Hello {{1}}",
                "footer": "Contact {{1}}",  # Footer with variable - should fail
                "body_examples": ["John"]
            },
            timeout=15
        )
        # Should return 400 with validation error about footer variables
        assert response.status_code == 400, f"Expected 400 for footer with vars, got {response.status_code}: {response.text}"
        assert "footer" in response.text.lower(), f"Error should mention footer: {response.text}"
        
        print(f"✓ AC6 (V3) PASS: Footer with variables rejected")
    
    def test_ac7_v4_header_max_one_variable(self, auth_headers):
        """AC7: V4 - Header text allows max 1 variable"""
        response = requests.post(
            f"{BASE_URL}/api/whatsapp/meta/create-template",
            headers=auth_headers,
            json={
                "template_name": f"test_v4_{int(time.time())}",
                "category": "utility",
                "language": "en",
                "header_type": "text",
                "header_content": "Hello {{1}} and {{2}}",  # 2 variables - should fail
                "body": "Test body",
                "header_examples": ["John", "Jane"]
            },
            timeout=15
        )
        # Should return 400 with validation error about header variables
        assert response.status_code == 400, f"Expected 400 for header with 2 vars, got {response.status_code}: {response.text}"
        assert "header" in response.text.lower(), f"Error should mention header: {response.text}"
        
        print(f"✓ AC7 (V4) PASS: Header with multiple variables rejected")
    
    def test_delete_test_templates(self, auth_headers, test_template_name):
        """Cleanup: Delete test templates created during testing"""
        # List templates
        list_response = requests.get(
            f"{BASE_URL}/api/whatsapp/custom-templates",
            headers=auth_headers,
            timeout=15
        )
        if list_response.status_code == 200:
            templates = list_response.json().get("templates", [])
            for tpl in templates:
                if tpl.get("template_name", "").startswith("test_"):
                    delete_response = requests.delete(
                        f"{BASE_URL}/api/whatsapp/custom-templates/{tpl['id']}",
                        headers=auth_headers,
                        timeout=15
                    )
                    if delete_response.status_code == 200:
                        print(f"  Cleaned up test template: {tpl['template_name']}")
        
        print(f"✓ Cleanup complete")


class TestCR023MetaCredentialsMissing(TestAuth):
    """Test Meta API calls when credentials are not configured"""
    
    def test_check_template_name_credentials_missing(self, auth_headers):
        """Template name check should handle missing Meta credentials gracefully"""
        response = requests.get(
            f"{BASE_URL}/api/whatsapp/check-template-name?name=test_name",
            headers=auth_headers,
            timeout=15
        )
        # Should return 200 with exists=False and possibly error=credentials_missing
        assert response.status_code == 200, f"Should return 200 even without credentials: {response.status_code}"
        data = response.json()
        assert "exists" in data, f"Should have 'exists' field: {data}"
        
        print(f"✓ Template name check handles missing credentials gracefully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
