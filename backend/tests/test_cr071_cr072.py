"""
Test suite for CR-071 (B2B Customer Capture) + CR-072 (Hotel Document Capture)
Tests: T1-T10, T12, T13 (T11 is frontend)
"""
import io
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://preprod-crm-deploy.preview.emergentagent.com").rstrip("/")
EMAIL = "owner@kunafamahal.com"
PASSWORD = "Qplazm@10"

# ---------------- fixtures ----------------

@pytest.fixture(scope="module")
def jwt_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok, "No access_token in login response"
    return tok


@pytest.fixture(scope="module")
def jwt_headers(jwt_token):
    return {"Authorization": f"Bearer {jwt_token}"}


@pytest.fixture(scope="module")
def pos_api_key(jwt_headers):
    r = requests.get(f"{BASE_URL}/api/pos/api-key", headers=jwt_headers)
    assert r.status_code == 200, f"api-key fetch failed: {r.text}"
    key = r.json().get("api_key")
    assert key
    return key


@pytest.fixture(scope="module")
def pos_headers(pos_api_key):
    return {"X-API-Key": pos_api_key}


@pytest.fixture(scope="module")
def pos_ids(jwt_headers):
    """Extract pos_id + restaurant_id from /api/auth/me (id is 'pos_XXXX_restaurant_YYY')."""
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=jwt_headers)
    assert r.status_code == 200
    j = r.json()
    user_id = j.get("id") or j.get("user", {}).get("id")
    # format: pos_<pos_id>_restaurant_<rid>
    pos_id = j.get("pos_id") or user_id.split("_")[1]
    # restaurant_id is everything after 'pos_{pid}_'
    prefix = f"pos_{pos_id}_"
    restaurant_id = user_id[len(prefix):] if user_id.startswith(prefix) else "restaurant_689"
    # strip leading "restaurant_" if present — POS expects raw numeric id (e.g. "689")
    if restaurant_id.startswith("restaurant_"):
        restaurant_id = restaurant_id[len("restaurant_"):]
    return {"pos_id": pos_id, "restaurant_id": restaurant_id, "user_id": user_id}


@pytest.fixture(scope="module")
def restaurant_id(pos_ids):
    return pos_ids["restaurant_id"]


@pytest.fixture(scope="module")
def pos_id_val(pos_ids):
    return pos_ids["pos_id"]


@pytest.fixture(scope="module")
def test_phone():
    # Unique phone per run to avoid state carryover
    return f"9{int(time.time()) % 10000000:07d}9"


@pytest.fixture(scope="module")
def test_customer(jwt_headers, pos_headers, restaurant_id, pos_id_val, test_phone):
    """Create a fresh customer via a plain POS order (no GST), then fetch it."""
    payload = {
        "pos_id": pos_id_val,
        "restaurant_id": restaurant_id,
        "order_id": f"TEST_SEED_{uuid.uuid4().hex[:10]}",
        "cust_mobile": test_phone,
        "cust_name": "TEST_CR071 Customer",
        "order_amount": 100.0,
        "created_at": "2026-01-15T09:00:00Z",
    }
    r = requests.post(f"{BASE_URL}/api/pos/orders", headers=pos_headers, json=payload)
    assert r.status_code == 200 and r.json().get("success"), f"seed POS order failed: {r.status_code} {r.text}"

    # Find the customer via lookup
    r2 = requests.post(f"{BASE_URL}/api/pos/customer-lookup",
                       headers=pos_headers, json={"phone": test_phone})
    assert r2.status_code == 200
    d = r2.json().get("data", {})
    assert d.get("registered") is True, f"customer not registered after POS order: {d}"
    cust = {"id": d["customer_id"], "phone": test_phone, "name": d["name"]}
    yield cust
    # cleanup
    try:
        requests.delete(f"{BASE_URL}/api/customers/{cust['id']}", headers=jwt_headers)
    except Exception:
        pass


def _make_jpeg_bytes(size_hint=200):
    # Minimal valid JPEG
    jpeg_hdr = bytes.fromhex(
        "ffd8ffe000104a46494600010101006000600000ffdb004300080606070605080707"
        "0709090808080a0c0e0c0a0b0b0b0d0e0e0d0d0f0f0f0d0f0f0f10101010101010101010"
        "1010101010101010101010101010101010ffc0000b080001000101011100ffc4001f0000"
        "0105010101010101010000000000000000010203040506070809000a0bffc400b5100002"
        "010303020403050504040000017d01020300041105122131410613516107227114328191"
        "a1082342b1c11552d1f0243362720ffc4001f01000301010101010101010101000000000"
        "0000102030405060708090a0bffc400b511000201020404030407050404000102770001"
        "020311040521310612415107617113223281081442b1c1092333526272f1156233515e1"
        "d1f24473625171f2ffda000c03010002110311003f00fbd0ffd9"
    )
    return jpeg_hdr


# ---------------- T4: WhatsApp variables ----------------

def test_T4_whatsapp_variables_contain_gst(jwt_headers):
    r = requests.get(f"{BASE_URL}/api/whatsapp/variables", headers=jwt_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    # data may be a list, or wrapped
    variables = data if isinstance(data, list) else data.get("variables") or data.get("data") or []
    keys = [v.get("key") if isinstance(v, dict) else v for v in variables]
    assert "customer_gst_name" in keys, f"customer_gst_name missing. keys={keys}"
    assert "customer_gst_number" in keys, f"customer_gst_number missing"
    assert len(keys) >= 43, f"Expected 43+ vars, got {len(keys)}"


# ---------------- T5: is_b2b field in customers list/detail ----------------

def test_T5_is_b2b_in_customer_list_and_detail(jwt_headers, test_customer):
    # list
    r = requests.get(f"{BASE_URL}/api/customers?limit=5", headers=jwt_headers)
    assert r.status_code == 200
    data = r.json()
    lst = data if isinstance(data, list) else data.get("customers") or data.get("data") or []
    assert lst, "no customers returned"
    assert any("is_b2b" in c for c in lst), f"is_b2b missing in list. Sample: {lst[0].keys() if lst else None}"

    # detail
    r = requests.get(f"{BASE_URL}/api/customers/{test_customer['id']}", headers=jwt_headers)
    assert r.status_code == 200
    detail = r.json()
    assert "is_b2b" in detail, f"is_b2b missing in detail: {list(detail.keys())}"


# ---------------- T1: POS order with GST fields → customer becomes B2B ----------------

def _post_pos_order(pos_headers, restaurant_id, phone, gst_name=None, gst_number=None, cust_name="TEST_CR071 Customer", pos_id="0001"):
    payload = {
        "pos_id": pos_id,
        "restaurant_id": restaurant_id,
        "order_id": f"TEST_ORDER_{uuid.uuid4().hex[:10]}",
        "cust_mobile": phone,
        "cust_name": cust_name,
        "order_amount": 500.0,
        "created_at": "2026-01-15T10:00:00Z",
    }
    if gst_name is not None:
        payload["gst_name"] = gst_name
    if gst_number is not None:
        payload["gst_number"] = gst_number
    return requests.post(f"{BASE_URL}/api/pos/orders", headers=pos_headers, json=payload)


def test_T1_pos_order_with_gst_sets_b2b(pos_headers, jwt_headers, test_customer, restaurant_id, pos_id_val):
    phone = test_customer["phone"]
    r = _post_pos_order(pos_headers, restaurant_id, phone,
                        gst_name="Test Corp", gst_number="27TESTGST1234Z5", pos_id=pos_id_val)
    assert r.status_code == 200, f"POS order failed: {r.status_code} {r.text}"

    # fetch customer, verify B2B fields
    r2 = requests.get(f"{BASE_URL}/api/customers/{test_customer['id']}", headers=jwt_headers)
    assert r2.status_code == 200
    c = r2.json()
    assert c.get("is_b2b") is True, f"is_b2b not True: {c.get('is_b2b')}"
    assert c.get("customer_type") == "corporate", f"customer_type={c.get('customer_type')}"
    assert c.get("gst_name") == "Test Corp", f"gst_name={c.get('gst_name')}"
    assert c.get("gst_number") == "27TESTGST1234Z5", f"gst_number={c.get('gst_number')}"


# ---------------- T2: POS order without GST does not clobber ----------------

def test_T2_pos_order_without_gst_preserves_b2b(pos_headers, jwt_headers, test_customer, restaurant_id, pos_id_val):
    phone = test_customer["phone"]
    r = _post_pos_order(pos_headers, restaurant_id, phone, pos_id=pos_id_val)
    assert r.status_code == 200, r.text

    r2 = requests.get(f"{BASE_URL}/api/customers/{test_customer['id']}", headers=jwt_headers)
    c = r2.json()
    assert c.get("is_b2b") is True, "is_b2b was clobbered!"
    assert c.get("gst_name") == "Test Corp", f"gst_name was clobbered: {c.get('gst_name')}"
    assert c.get("gst_number") == "27TESTGST1234Z5"
    assert c.get("customer_type") == "corporate"


# ---------------- T3 & T13: POS customer-lookup response ----------------

def test_T3_T13_customer_lookup_includes_b2b_and_existing_fields(pos_headers, test_customer):
    r = requests.post(f"{BASE_URL}/api/pos/customer-lookup",
                      headers=pos_headers,
                      json={"phone": test_customer["phone"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("success") is True
    d = body.get("data", {})

    # T3: B2B fields
    for f in ("customer_type", "gst_name", "gst_number", "is_b2b", "documents"):
        assert f in d, f"lookup missing '{f}'. keys={list(d.keys())}"
    assert d["is_b2b"] is True
    assert d["gst_name"] == "Test Corp"
    assert d["customer_type"] == "corporate"

    # T13: existing fields preserved
    for f in ("name", "phone", "tier", "total_points", "wallet_balance",
              "total_visits", "total_spent", "allergies", "favorites",
              "addresses", "customer_id"):
        assert f in d, f"regression: '{f}' missing from customer-lookup"


# ---------------- T7: Invalid doc uploads (validated first) ----------------

def test_T7_invalid_doc_type(pos_headers, test_customer):
    files = {"file": ("test.jpg", _make_jpeg_bytes(), "image/jpeg")}
    data = {"doc_type": "not_a_valid_type"}
    r = requests.post(
        f"{BASE_URL}/api/pos/customers/{test_customer['id']}/documents",
        headers=pos_headers, files=files, data=data,
    )
    # 400 expected (may be 503 if S3 not configured — validation happens after S3 check)
    assert r.status_code in (400, 503), f"expected 400, got {r.status_code}: {r.text}"


def test_T7_invalid_content_type(pos_headers, test_customer):
    files = {"file": ("bad.txt", b"not-an-image", "text/plain")}
    data = {"doc_type": "aadhaar"}
    r = requests.post(
        f"{BASE_URL}/api/pos/customers/{test_customer['id']}/documents",
        headers=pos_headers, files=files, data=data,
    )
    assert r.status_code in (400, 503), f"expected 400, got {r.status_code}: {r.text}"


# ---------------- T6: Upload document ----------------

@pytest.fixture(scope="module")
def uploaded_doc_id(pos_headers, test_customer):
    files = {"file": ("aadhaar.jpg", _make_jpeg_bytes(), "image/jpeg")}
    data = {"doc_type": "aadhaar"}
    r = requests.post(
        f"{BASE_URL}/api/pos/customers/{test_customer['id']}/documents",
        headers=pos_headers, files=files, data=data,
    )
    if r.status_code == 503:
        pytest.skip("S3 not configured in this env")
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("success") is True
    d = body.get("data", {})
    assert d.get("document_id")
    assert d.get("url"), "signed URL missing"
    return d["document_id"]


def test_T6_upload_returns_id_and_url(uploaded_doc_id):
    assert uploaded_doc_id


# ---------------- T8: GET POS documents ----------------

def test_T8_pos_get_documents(pos_headers, test_customer, uploaded_doc_id):
    r = requests.get(
        f"{BASE_URL}/api/pos/customers/{test_customer['id']}/documents",
        headers=pos_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    d = body.get("data", {})
    docs = d.get("documents", {})
    assert isinstance(docs, dict), f"expected dict, got {type(docs)}"
    assert "aadhaar" in docs, f"aadhaar group missing: {list(docs.keys())}"
    assert len(docs["aadhaar"]) >= 1
    first = docs["aadhaar"][0]
    assert first.get("url"), "signed URL missing"
    assert first.get("id")


# ---------------- T9: CRM GET /api/customers/{id}/documents ----------------

def test_T9_crm_get_documents(jwt_headers, test_customer, uploaded_doc_id):
    r = requests.get(
        f"{BASE_URL}/api/customers/{test_customer['id']}/documents",
        headers=jwt_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    docs = body.get("documents", {})
    assert "aadhaar" in docs, f"CRM docs missing aadhaar group: {docs}"


# ---------------- T10: customer-lookup with documents ----------------

def test_T10_lookup_includes_documents(pos_headers, test_customer, uploaded_doc_id):
    r = requests.post(f"{BASE_URL}/api/pos/customer-lookup",
                      headers=pos_headers,
                      json={"phone": test_customer["phone"]})
    assert r.status_code == 200
    d = r.json().get("data", {})
    docs = d.get("documents", {})
    assert isinstance(docs, dict)
    assert "aadhaar" in docs, f"lookup docs missing aadhaar: {docs}"


# ---------------- T12: max 5 per type (upload 6 → 5 remain) ----------------

def test_T12_max_5_docs_per_type(pos_headers, test_customer):
    # We already uploaded 1 in T6. Upload 5 more of type 'pan_card' to keep isolated.
    doc_type = "pan_card"
    for i in range(6):
        files = {"file": (f"pan_{i}.jpg", _make_jpeg_bytes(), "image/jpeg")}
        data = {"doc_type": doc_type}
        r = requests.post(
            f"{BASE_URL}/api/pos/customers/{test_customer['id']}/documents",
            headers=pos_headers, files=files, data=data,
        )
        if r.status_code == 503:
            pytest.skip("S3 not configured")
        assert r.status_code == 200, f"upload {i} failed: {r.text}"
        time.sleep(0.15)  # ensure distinct uploaded_at ordering

    # fetch and count
    r = requests.get(
        f"{BASE_URL}/api/pos/customers/{test_customer['id']}/documents",
        headers=pos_headers,
    )
    assert r.status_code == 200
    docs = r.json().get("data", {}).get("documents", {})
    pan_docs = docs.get(doc_type, [])
    assert len(pan_docs) == 5, f"expected 5 after prune, got {len(pan_docs)}"
