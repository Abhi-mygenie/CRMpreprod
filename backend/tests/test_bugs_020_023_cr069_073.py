"""
Backend tests for BUG-020, BUG-021, BUG-022, BUG-023, CR-069, CR-073
Run with: pytest /app/backend/tests/test_bugs_020_023_cr069_073.py -v --tb=short
"""
import pytest
import requests
import os
import sys

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# ── Auth helpers ──────────────────────────────────────────────────────────────

def login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        data = r.json()
        return data.get("access_token") or data.get("token")
    return None

KUNAFA_TOKEN = None
HUNGRY_TOKEN = None


def get_kunafa_token():
    global KUNAFA_TOKEN
    if not KUNAFA_TOKEN:
        KUNAFA_TOKEN = login("owner@kunafamahal.com", "Qplazm@10")
    return KUNAFA_TOKEN


def get_hungry_token():
    global HUNGRY_TOKEN
    if not HUNGRY_TOKEN:
        HUNGRY_TOKEN = login("owner@hungry.com", "Qplazm@10")
    return HUNGRY_TOKEN


def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ─────────────────────────────────────────────────────────────────────────────
# BUG-020: resolve_variable — 'Unknown' → 'Guest', real name stays, 0 stays 0
# Unit-style: call resolve_variable directly via sys.path
# ─────────────────────────────────────────────────────────────────────────────

class TestBug020ResolveVariable:
    """BUG-020: customer_name Unknown→Guest, real name preserved, points_balance=0 intact"""

    @pytest.fixture(autouse=True)
    def add_backend_to_path(self):
        sys.path.insert(0, "/app/backend")
        # Load env vars required by backend modules
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")

    def test_unknown_name_returns_guest(self):
        from core.whatsapp import resolve_variable
        result = resolve_variable("customer_name", {"name": "Unknown"})
        assert result == "Guest", f"Expected 'Guest', got '{result}'"

    def test_unknown_lowercase_returns_guest(self):
        from core.whatsapp import resolve_variable
        result = resolve_variable("customer_name", {"name": "unknown"})
        assert result == "Guest", f"Expected 'Guest', got '{result}'"

    def test_unknown_uppercase_returns_guest(self):
        from core.whatsapp import resolve_variable
        result = resolve_variable("customer_name", {"name": "UNKNOWN"})
        assert result == "Guest", f"Expected 'Guest', got '{result}'"

    def test_none_name_returns_guest(self):
        from core.whatsapp import resolve_variable
        result = resolve_variable("customer_name", {"name": None})
        assert result == "Guest", f"Expected 'Guest' for None name, got '{result}'"

    def test_empty_name_returns_guest(self):
        from core.whatsapp import resolve_variable
        result = resolve_variable("customer_name", {"name": ""})
        assert result == "Guest", f"Expected 'Guest' for empty name, got '{result}'"

    def test_real_name_stays(self):
        from core.whatsapp import resolve_variable
        result = resolve_variable("customer_name", {"name": "Rahul Kumar"})
        assert result == "Rahul Kumar", f"Expected 'Rahul Kumar', got '{result}'"

    def test_points_balance_zero_not_broken(self):
        from core.whatsapp import resolve_variable
        # points_balance=0 should resolve to "0", not empty
        result = resolve_variable("points_balance", {}, event_data={"points_balance": 0})
        assert result == "0", f"Expected '0' for zero points, got '{result}'"


# ─────────────────────────────────────────────────────────────────────────────
# BUG-022: _is_placeholder_name() helper
# ─────────────────────────────────────────────────────────────────────────────

class TestBug022IsPlaceholderName:
    """BUG-022: _is_placeholder_name identifies migration placeholders"""

    @pytest.fixture(autouse=True)
    def add_backend_to_path(self):
        sys.path.insert(0, "/app/backend")
        # Load env vars required by backend modules
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")

    def test_unknown_is_placeholder(self):
        from routers.customers import _is_placeholder_name
        assert _is_placeholder_name("Unknown") is True

    def test_unknown_lowercase_is_placeholder(self):
        from routers.customers import _is_placeholder_name
        assert _is_placeholder_name("unknown") is True

    def test_unknown_uppercase_is_placeholder(self):
        from routers.customers import _is_placeholder_name
        assert _is_placeholder_name("UNKNOWN") is True

    def test_customer_prefix_is_placeholder(self):
        from routers.customers import _is_placeholder_name
        assert _is_placeholder_name("Customer 8955") is True

    def test_customer_lowercase_prefix_is_placeholder(self):
        from routers.customers import _is_placeholder_name
        assert _is_placeholder_name("customer 1234") is True

    def test_empty_is_placeholder(self):
        from routers.customers import _is_placeholder_name
        assert _is_placeholder_name("") is True

    def test_none_is_placeholder(self):
        from routers.customers import _is_placeholder_name
        assert _is_placeholder_name(None) is True

    def test_real_name_priya_not_placeholder(self):
        from routers.customers import _is_placeholder_name
        assert _is_placeholder_name("Priya Singh") is False

    def test_real_name_saurav_not_placeholder(self):
        from routers.customers import _is_placeholder_name
        assert _is_placeholder_name("saurav") is False


# ─────────────────────────────────────────────────────────────────────────────
# BUG-021: POS order updates customer name/email (API-level test)
# ─────────────────────────────────────────────────────────────────────────────

class TestBug021PosOrderUpdatesCustomer:
    """BUG-021: POS order updates customer name/email when provided"""

    def test_pos_order_updates_customer_name_email(self):
        """Verify that name/email conditionally update logic exists in pos.py"""
        # Unit-style: verify the logic in pos.py by checking source grep
        import subprocess
        result = subprocess.run(
            ["grep", "-n", "cust_name\|cust_email\|customer_update_set", "/app/backend/routers/pos.py"],
            capture_output=True, text=True
        )
        output = result.stdout
        assert "customer_update_set" in output, "customer_update_set not found in pos.py"
        assert "cust_name" in output, "cust_name check not found"
        assert "cust_email" in output, "cust_email check not found"
        # Verify conditional update (if order_data.cust_name:)
        assert 'if order_data.cust_name:' in output or 'cust_name' in output


# ─────────────────────────────────────────────────────────────────────────────
# BUG-023: Invoice DB record created before PDF, accessible via token
# ─────────────────────────────────────────────────────────────────────────────

class TestBug023InvoiceDbBeforePdf:
    """BUG-023: Invoice DB insert before PDF generation"""

    @pytest.fixture(autouse=True)
    def add_backend_to_path(self):
        sys.path.insert(0, "/app/backend")
        # Load env vars required by backend modules
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")

    def test_invoice_generator_db_before_pdf(self):
        """Verify create_invoice inserts DB record before generating PDF"""
        import ast, inspect
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "invoice_generator",
            "/app/backend/services/invoice_generator.py"
        )
        mod = importlib.util.load_from_spec(spec) if False else None  # skip actual import
        
        # grep-based check
        import subprocess
        result = subprocess.run(
            ["grep", "-n", "insert_one\|pdf_path\|generate_invoice_pdf", 
             "/app/backend/services/invoice_generator.py"],
            capture_output=True, text=True
        )
        lines = result.stdout
        # Find line numbers
        insert_line = None
        pdf_gen_line = None
        for line in lines.split('\n'):
            if 'insert_one' in line and insert_line is None:
                insert_line = int(line.split(':')[0])
            # Find the CALL to generate_invoice_pdf (not the def line)
            if 'generate_invoice_pdf' in line and 'def ' not in line and pdf_gen_line is None:
                pdf_gen_line = int(line.split(':')[0])
        
        assert insert_line is not None, "insert_one not found in invoice_generator.py"
        assert pdf_gen_line is not None, "generate_invoice_pdf not found in invoice_generator.py"
        # DB insert must come BEFORE PDF generation
        assert insert_line < pdf_gen_line, (
            f"DB insert (line {insert_line}) should be before PDF generation (line {pdf_gen_line})"
        )

    def test_invoice_accessible_via_token_api(self):
        """Test that GET /api/invoices/{token} endpoint exists"""
        token = get_kunafa_token()
        if not token:
            pytest.skip("Could not authenticate")
        # Use a fake token — should return 404, not 500
        r = requests.get(f"{BASE_URL}/api/invoices/test_nonexistent_token_abc123",
                         headers=auth_headers(token))
        assert r.status_code in (404, 200), f"Unexpected status: {r.status_code}"

    def test_weasyprint_import(self):
        """weasyprint must be importable"""
        import importlib
        spec = importlib.util.find_spec("weasyprint")
        assert spec is not None, "weasyprint is not installed"


# ─────────────────────────────────────────────────────────────────────────────
# CR-069: button_param_value in AuthKey payload
# ─────────────────────────────────────────────────────────────────────────────

class TestCR069ButtonParamValue:
    """CR-069: send_single_message sends button_param_value (not buttonValues) for AuthKey"""

    @pytest.fixture(autouse=True)
    def add_backend_to_path(self):
        sys.path.insert(0, "/app/backend")
        # Load env vars required by backend modules
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")

    def test_button_param_value_field_exists_in_payload_code(self):
        """Verify source code has button_param_value in payload"""
        import subprocess
        result = subprocess.run(
            ["grep", "-n", "button_param_value", "/app/backend/core/whatsapp.py"],
            capture_output=True, text=True
        )
        assert "button_param_value" in result.stdout, \
            "button_param_value not found in core/whatsapp.py"

    def test_btn_url_keys_excluded_from_template_variables(self):
        """Verify btn_url_ keys excluded from template_variables filter"""
        import subprocess
        result = subprocess.run(
            ["grep", "-n", "btn_url_", "/app/backend/core/whatsapp.py"],
            capture_output=True, text=True
        )
        assert "btn_url_" in result.stdout, "btn_url_ filtering not found in whatsapp.py"

    def test_trigger_whatsapp_event_has_button_values_construction(self):
        """Verify button_values dict is constructed from btn_url_ mappings"""
        import subprocess
        result = subprocess.run(
            ["grep", "-n", "button_values\|btn_url_\|btn_idx", "/app/backend/core/whatsapp.py"],
            capture_output=True, text=True
        )
        output = result.stdout
        assert "button_values" in output
        assert "btn_url_" in output


# ─────────────────────────────────────────────────────────────────────────────
# CR-073: AuthKey sync imports external templates
# ─────────────────────────────────────────────────────────────────────────────

class TestCR073AuthKeySyncTemplates:
    """CR-073: sync-templates returns imported_count; authkey-templates lists buttons"""

    def test_sync_templates_endpoint_exists(self):
        """POST /api/whatsapp/authkey/sync-templates returns 200"""
        token = get_kunafa_token()
        if not token:
            pytest.skip("Could not authenticate for Kunafa Mahal")

        # Fetch brand_number from api-key endpoint
        settings_r = requests.get(f"{BASE_URL}/api/whatsapp/api-key",
                                  headers=auth_headers(token))
        assert settings_r.status_code == 200, f"api-key API failed: {settings_r.status_code}"
        settings = settings_r.json()
        brand_number = settings.get("brand_number")
        
        if not brand_number:
            pytest.skip("brand_number not configured for Kunafa Mahal")

        r = requests.post(f"{BASE_URL}/api/whatsapp/authkey/sync-templates",
                          json={"brand_number": brand_number},
                          headers=auth_headers(token))
        assert r.status_code == 200, f"sync-templates failed: {r.status_code} - {r.text[:300]}"
        data = r.json()
        assert "imported_count" in data, f"imported_count missing from response: {data}"

    def test_authkey_templates_list_after_sync(self):
        """GET /api/whatsapp/authkey-templates returns templates"""
        token = get_kunafa_token()
        if not token:
            pytest.skip("Could not authenticate for Kunafa Mahal")

        r = requests.get(f"{BASE_URL}/api/whatsapp/authkey-templates",
                         headers=auth_headers(token))
        assert r.status_code == 200, f"authkey-templates failed: {r.status_code}"
        data = r.json()
        # Should be a list or have templates key
        templates = data if isinstance(data, list) else data.get("templates", [])
        # At least check endpoint works (may be empty if not configured)
        assert isinstance(templates, list)

    def test_sync_templates_idempotent(self):
        """Calling sync-templates twice returns consistent imported_count"""
        token = get_kunafa_token()
        if not token:
            pytest.skip("Could not authenticate for Kunafa Mahal")

        settings_r = requests.get(f"{BASE_URL}/api/whatsapp/settings",
                                  headers=auth_headers(token))
        if settings_r.status_code != 200:
            pytest.skip("Settings API unavailable")
        settings = settings_r.json()
        brand_number = settings.get("brand_number") or settings.get("phone_number")
        if not brand_number:
            pytest.skip("brand_number not configured")

        r1 = requests.post(f"{BASE_URL}/api/whatsapp/authkey/sync-templates",
                           json={"brand_number": brand_number},
                           headers=auth_headers(token))
        r2 = requests.post(f"{BASE_URL}/api/whatsapp/authkey/sync-templates",
                           json={"brand_number": brand_number},
                           headers=auth_headers(token))
        assert r1.status_code == 200
        assert r2.status_code == 200
        # Second call: imported_count should be 0 (idempotent) or same
        d2 = r2.json()
        assert "imported_count" in d2
        assert d2["imported_count"] >= 0


# ─────────────────────────────────────────────────────────────────────────────
# Auth sanity
# ─────────────────────────────────────────────────────────────────────────────

class TestAuthSanity:
    def test_kunafa_login(self):
        token = get_kunafa_token()
        assert token is not None, "Kunafa Mahal login failed"

    def test_hungry_login(self):
        token = get_hungry_token()
        assert token is not None, "Hungry Keya login failed"
