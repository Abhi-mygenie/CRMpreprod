"""
CRM-2: Document upload 422->400 fix.
POST /api/pos/customers/{customer_id}/documents with valid POS API key
but no file part must return HTTP 400 (not 422).
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
POS_API_KEY = "dp_live_GFanI15UsYLXgLmDstbZb2hNEocuQ-UQ9WCTsgWL538"


@pytest.fixture(scope="module")
def customer_id():
    """Get a valid customer_id for tenant 478 via customer-lookup."""
    r = requests.post(
        f"{BASE_URL}/api/pos/customer-lookup",
        headers={"X-API-Key": POS_API_KEY, "Content-Type": "application/json"},
        json={"phone": "9999999999"},
        timeout=30,
    )
    assert r.status_code == 200, f"customer-lookup failed: {r.status_code} {r.text}"
    data = r.json()
    cid = data.get("data", {}).get("customer_id")
    assert cid, f"No customer_id in response: {data}"
    return cid


def test_doc_upload_no_file_returns_400(customer_id):
    """Send multipart POST with doc_type but no file — expect HTTP 400."""
    r = requests.post(
        f"{BASE_URL}/api/pos/customers/{customer_id}/documents",
        headers={"X-API-Key": POS_API_KEY},
        data={"doc_type": "aadhaar"},
        # No files= parameter
        timeout=30,
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
    body = r.json()
    detail = body.get("detail", "")
    assert "file" in detail.lower(), f"Expected 'file' in detail, got: {detail}"
    print(f"PASS: got 400 with detail='{detail}'")
