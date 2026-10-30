# CR-124 retest: international phone support + 4 bug fixes (export dup column, cc validation)
import os
import csv
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CID = "6eddb366-ad93-41bf-b1c2-b9210a62fbd9"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "owner@cafe103.com", "password": "Qplazm@10"}, timeout=60)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


# V5: Indian cc with US number rejected
def test_v5_put_in_cc_rejected(client):
    r = client.put(f"{BASE_URL}/api/customers/{CID}", json={"phone": "1772654157", "country_code": "+91"})
    assert r.status_code == 422, r.text
    assert "valid mobile number" in r.text.lower()


# V6: US cc accepted and persisted
def test_v6_put_us_cc_ok(client):
    r = client.put(f"{BASE_URL}/api/customers/{CID}", json={"phone": "1772654157", "country_code": "+1"})
    assert r.status_code == 200, r.text
    g = client.get(f"{BASE_URL}/api/customers/{CID}")
    assert g.status_code == 200
    d = g.json()
    assert d["phone"] == "1772654157"
    assert d["country_code"] == "+1"


# V2: UK number create
def test_v2_post_uk(client):
    r = client.post(f"{BASE_URL}/api/customers", json={"name": "V2 UK Guest", "phone": "7911123456", "country_code": "+44"})
    assert r.status_code in (200, 400), r.text
    if r.status_code == 400:
        assert "already exists" in r.text.lower()
    else:
        assert r.json()["country_code"] == "+44"


# V1: Indian backward compat
def test_v1_post_india(client):
    r = client.post(f"{BASE_URL}/api/customers", json={"name": "TEST_V1 India", "phone": "9988776655", "country_code": "+91"})
    assert r.status_code in (200, 400), r.text
    if r.status_code == 400:
        assert "already exists" in r.text.lower()
    else:
        assert r.json()["country_code"] == "+91"


# V17: junk rejected
def test_v17_junk_rejected(client):
    r = client.post(f"{BASE_URL}/api/customers", json={"name": "TEST_junk", "phone": "0000000000", "country_code": "+91"})
    assert r.status_code == 422, r.text


# V7: search by partial foreign phone
def test_v7_search(client):
    r = client.get(f"{BASE_URL}/api/customers", params={"search": "17726"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 1
    assert all("17726" in (c.get("phone") or "") or "17726" in (c.get("name") or "") for c in data)
    assert any(c["id"] == CID for c in data)


# BUG-FIX-1: export has single Country Code column
def test_export_single_cc_column(client):
    r = client.get(f"{BASE_URL}/api/customers/export", params={"format": "csv"})
    assert r.status_code == 200, r.text[:300]
    text = r.content.decode("utf-8-sig")
    header = next(csv.reader(io.StringIO(text)))
    assert header.count("Country Code") == 1, header
    rows = list(csv.DictReader(io.StringIO(text)))
    fir = [x for x in rows if x.get("Phone") == "1772654157"]
    assert fir, "Fir Hills row missing in export"
    assert fir[0]["Country Code"] == "+1"
