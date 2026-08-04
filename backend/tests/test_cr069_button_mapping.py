"""CR-069 AuthKey template button enrichment and variable-mapping API regression tests."""
import os
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values, load_dotenv

load_dotenv("/app/backend/.env")

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or frontend_env.get("REACT_APP_BACKEND_URL")
)
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = BASE_URL.rstrip("/")

from core.whatsapp import build_body_values
from routers.whatsapp import TestTemplateRequest


FINAL_BILL_WID = "41354"
LOYALTY_BILL_WID = "36108"


def _hungry_credentials():
    credentials_path = Path("/app/memory/test_credentials.md")
    if not credentials_path.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    rows = credentials_path.read_text(encoding="utf-8").splitlines()
    for row in rows:
        if "owner@hungry.com" in row:
            cells = [cell.strip() for cell in row.strip().strip("|").split("|")]
            if len(cells) >= 3 and cells[1] and cells[2]:
                return cells[1], cells[2]
    pytest.skip("Hungry Keya credentials are missing from test_credentials.md")


@pytest.fixture(scope="module")
def authenticated_client():
    email, password = _hungry_credentials()
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    token = data.get("access_token")
    assert isinstance(token, str) and token
    assert data.get("user", {}).get("email") == email
    session.headers.update({"Authorization": f"Bearer {token}"})
    yield session
    session.close()


@pytest.fixture(scope="module")
def authkey_templates(authenticated_client):
    response = authenticated_client.get(
        f"{BASE_URL}/api/whatsapp/authkey-templates", timeout=30
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert isinstance(data.get("templates"), list)
    return data["templates"]


def _find_template(templates, wid):
    return next((item for item in templates if str(item.get("wid")) == wid), None)


class TestCR069TemplateEnrichment:
    def test_final_bill_has_expected_static_and_dynamic_buttons(self, authkey_templates):
        template = _find_template(authkey_templates, FINAL_BILL_WID)
        assert template is not None, f"Missing template wid={FINAL_BILL_WID}"
        buttons = template.get("buttons")
        assert isinstance(buttons, list)
        assert len(buttons) == 2

        feedback, bill = buttons
        assert feedback.get("type") == "URL"
        assert feedback.get("text") == "Feedback"
        assert feedback.get("url_type") == "static"
        assert feedback.get("url") == "https://g.page/r/CVS6trbBhsHmEBE/review"

        assert bill.get("type") == "URL"
        assert bill.get("text") == "Bill"
        assert bill.get("url_type") == "dynamic"
        assert bill.get("url") == "https://crm.mygenie.online/{1}"
        assert bill.get("url_base") == "https://crm.mygenie.online/"
        assert bill.get("url_example") == "1231231"

    def test_loyalty_bill_has_no_buttons_enrichment(self, authkey_templates):
        template = _find_template(authkey_templates, LOYALTY_BILL_WID)
        assert template is not None, f"Missing template wid={LOYALTY_BILL_WID}"
        assert not template.get("buttons"), template.get("buttons")


class TestCR069ButtonVariableMapping:
    def test_put_and_get_persist_single_brace_button_mapping(self, authenticated_client):
        get_before = authenticated_client.get(
            f"{BASE_URL}/api/whatsapp/template-variable-map", timeout=30
        )
        assert get_before.status_code == 200, get_before.text
        before_data = get_before.json()
        assert isinstance(before_data.get("mappings"), list)
        original = next(
            (
                item
                for item in before_data["mappings"]
                if str(item.get("template_id")) == FINAL_BILL_WID
            ),
            None,
        )
        original_mappings = dict((original or {}).get("mappings") or {})
        original_modes = dict((original or {}).get("modes") or {})
        original_menu = dict((original or {}).get("menu_pick_resolved") or {})
        original_name = (original or {}).get("template_name") or "final_bill"

        candidate_mappings = {**original_mappings, "btn_url_{1}": "einvoice_token"}
        candidate_modes = {**original_modes, "btn_url_{1}": "map"}
        payload = {
            "template_id": FINAL_BILL_WID,
            "template_name": "final_bill",
            "mappings": candidate_mappings,
            "modes": candidate_modes,
            "menu_pick_resolved": original_menu,
        }

        try:
            put_response = authenticated_client.put(
                f"{BASE_URL}/api/whatsapp/template-variable-map/{FINAL_BILL_WID}",
                json=payload,
                timeout=30,
            )
            assert put_response.status_code == 200, put_response.text
            put_data = put_response.json()
            assert put_data.get("template_id") == FINAL_BILL_WID
            assert put_data.get("mappings", {}).get("btn_url_{1}") == "einvoice_token"

            get_after = authenticated_client.get(
                f"{BASE_URL}/api/whatsapp/template-variable-map", timeout=30
            )
            assert get_after.status_code == 200, get_after.text
            saved = next(
                (
                    item
                    for item in get_after.json().get("mappings", [])
                    if str(item.get("template_id")) == FINAL_BILL_WID
                ),
                None,
            )
            assert saved is not None
            assert saved.get("mappings", {}).get("btn_url_{1}") == "einvoice_token"
            assert saved.get("modes", {}).get("btn_url_{1}") == "map"
        finally:
            restore = authenticated_client.put(
                f"{BASE_URL}/api/whatsapp/template-variable-map/{FINAL_BILL_WID}",
                json={
                    "template_id": FINAL_BILL_WID,
                    "template_name": original_name,
                    "mappings": original_mappings,
                    "modes": original_modes,
                    "menu_pick_resolved": original_menu,
                },
                timeout=30,
            )
            assert restore.status_code == 200, restore.text


class TestCR069SendPathSafety:
    def test_button_mapping_is_not_leaked_into_body_values(self):
        mappings = {
            "{{1}}": "customer_name",
            "btn_url_{{1}}": "einvoice_token",
        }
        values = build_body_values(
            list(mappings.keys()),
            mappings,
            {"name": "Test Customer", "einvoice_token": "token-123"},
        )
        assert values == {"1": "Test Customer"}

    def test_test_template_request_accepts_button_values(self):
        request = TestTemplateRequest(
            template_id=FINAL_BILL_WID,
            phone="9999999999",
            body_values={"1": "Test"},
            button_values={"1": "token-123"},
        )
        assert request.button_values == {"1": "token-123"}
