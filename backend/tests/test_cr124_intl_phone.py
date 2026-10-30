# CR-124: International phone (E.164) support — API-level regression tests
import os
import sys
import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from core.phone import normalize_phone  # noqa: E402


def _base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
    return url.rstrip("/")


BASE_URL = _base()
FIR_HILLS_ID = "6eddb366-ad93-41bf-b1c2-b9210a62fbd9"  # existing +1 1772654157 customer (cafe103)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "owner@cafe103.com", "password": "Qplazm@10"}, timeout=60)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def created_ids(client):
    ids = []
    yield ids
    for cid in ids:
        client.delete(f"{BASE_URL}/api/customers/{cid}")


def _find(client, search):
    r = client.get(f"{BASE_URL}/api/customers", params={"search": search})
    assert r.status_code == 200
    return r.json()


# --- unit: normalize_phone CR-124 branches
@pytest.mark.parametrize("raw,cc,exp", [
    ("1772654157", "+91", ("1772654157", "+91", "invalid")),
    ("1772654157", "+1", ("1772654157", "+1", "ok")),
    ("7911123456", "+44", ("7911123456", "+44", "ok")),
    ("501234567", "+971", ("501234567", "+971", "ok")),
    ("+447911123456", None, ("7911123456", "+44", "fixed")),
    ("+971501234567", None, ("501234567", "+971", "fixed")),
    ("+91 9876 543210", None, ("9876543210", "+91", "fixed")),
    ("0000000000", "+91", ("0000000000", "+91", "invalid")),
    ("12345", "+1", ("12345", "+1", "invalid")),
    ("1234567890123456", "+1", ("1234567890123456", "+1", "invalid")),
])
def test_normalize_unit(raw, cc, exp):
    assert normalize_phone(raw, cc) == exp


# --- V1: Indian create backward compat
def test_v1_indian_create(client, created_ids):
    existing = _find(client, "9988776655")
    if existing:
        pytest.skip("9988776655 already exists")
    r = client.post(f"{BASE_URL}/api/customers", json={"name": "TEST_CR124 V1", "phone": "9988776655", "country_code": "+91"})
    assert r.status_code == 200, r.text
    d = r.json()
    created_ids.append(d["id"])
    assert d["phone"] == "9988776655" and d["country_code"] == "+91"
    g = client.get(f"{BASE_URL}/api/customers/{d['id']}").json()
    assert g["phone"] == "9988776655" and g["country_code"] == "+91"


# --- V2 / V9: international create (validation passes; dup if already seeded)
@pytest.mark.parametrize("phone,cc", [("7911123456", "+44"), ("501234567", "+971")])
def test_v2_v9_intl_create(client, phone, cc):
    r = client.post(f"{BASE_URL}/api/customers", json={"name": "TEST_CR124 intl", "phone": phone, "country_code": cc})
    # 400 = duplicate of already-created V2/V9 guest -> validation passed
    assert r.status_code in (200, 400), r.text
    if r.status_code == 400:
        assert "already exists" in r.json()["detail"]
    hits = [c for c in _find(client, phone) if c["phone"] == phone and c["country_code"] == cc]
    assert len(hits) >= 1


def test_intl_create_via_e164_raw(client):
    # +447911123456 without cc -> should normalize to +44/7911123456 and hit duplicate
    r = client.post(f"{BASE_URL}/api/customers", json={"name": "TEST_CR124 e164", "phone": "+447911123456"})
    assert r.status_code == 400, r.text
    assert "already exists" in r.json()["detail"]


# --- V5: Indian invalid rejected on PUT
def test_v5_put_invalid_indian_rejected(client):
    r = client.put(f"{BASE_URL}/api/customers/{FIR_HILLS_ID}", json={"phone": "1772654157", "country_code": "+91"})
    assert r.status_code == 422
    assert r.json()["detail"] == "Enter a valid mobile number"
    g = client.get(f"{BASE_URL}/api/customers/{FIR_HILLS_ID}").json()
    assert g["country_code"] == "+1"


# --- V6: same phone with +1 accepted
def test_v6_put_us_accepted(client):
    r = client.put(f"{BASE_URL}/api/customers/{FIR_HILLS_ID}", json={"phone": "1772654157", "country_code": "+1"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["phone"] == "1772654157" and d["country_code"] == "+1"
    g = client.get(f"{BASE_URL}/api/customers/{FIR_HILLS_ID}").json()
    assert g["phone"] == "1772654157" and g["country_code"] == "+1"


# --- V17: junk rejected
def test_v17_junk_rejected(client):
    r = client.post(f"{BASE_URL}/api/customers", json={"name": "TEST_CR124 junk", "phone": "0000000000", "country_code": "+91"})
    assert r.status_code == 422
    assert r.json()["detail"] == "Enter a valid mobile number"


def test_invalid_cc_format_rejected(client):
    r = client.post(f"{BASE_URL}/api/customers", json={"name": "TEST_CR124 badcc", "phone": "7911123456", "country_code": "44"})
    assert r.status_code == 422


# --- V7: partial search
def test_v7_partial_search(client):
    res = _find(client, "17726")
    assert any(c["id"] == FIR_HILLS_ID and c["country_code"] == "+1" for c in res)


# --- V19: formatted input normalized (dup with V19 Formatted customer proves normalization)
def test_v19_formatted_normalized(client, created_ids):
    r = client.post(f"{BASE_URL}/api/customers", json={"name": "TEST_CR124 V19", "phone": "+91 9876 543210"})
    if r.status_code == 200:
        created_ids.append(r.json()["id"])
        assert r.json()["phone"] == "9876543210"
    else:
        assert r.status_code == 400 and "already exists" in r.json()["detail"]
    hits = [c for c in _find(client, "9876543210") if c["phone"] == "9876543210"]
    assert hits


# --- CSV import template / export columns
def test_export_no_duplicate_country_code_column():
    from routers.customers import EXPORT_FIELDS
    headers = [h for h, _ in EXPORT_FIELDS]
    assert headers.count("Country Code") == 1, f"duplicate headers: {headers}"
