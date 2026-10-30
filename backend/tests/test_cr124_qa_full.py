# CR-124 FULL QA: V1-V20 international phone (E.164) verification matrix
import csv
import io
import os
import sys
import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from core.phone import normalize_phone, phone_match  # noqa: E402


def _base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
    return url.rstrip("/")


BASE_URL = _base()
FIR_HILLS_ID = "6eddb366-ad93-41bf-b1c2-b9210a62fbd9"
UK_ID = "66f9f19e-2149-49b4-82f9-87da488d350c"
UAE_ID = "4577b364-ef9e-48dd-8763-7162be875ce1"
CREATED = []


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "owner@cafe103.com", "password": "Qplazm@10"}, timeout=90)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    yield s
    for cid in CREATED:
        s.delete(f"{BASE_URL}/api/customers/{cid}")


def _create(client, name, phone, cc=None):
    body = {"name": name, "phone": phone}
    if cc is not None:
        body["country_code"] = cc
    r = client.post(f"{BASE_URL}/api/customers", json=body, timeout=60)
    if r.status_code == 200 and r.json().get("id"):
        CREATED.append(r.json()["id"])
    return r


def _search(client, q):
    r = client.get(f"{BASE_URL}/api/customers", params={"search": q}, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    return data


class TestCR124API:
    # V1 backward compat Indian
    def test_v1_indian_create(self, client):
        r = _create(client, "TEST_V1", "9988776655", "+91")
        assert r.status_code == 200 or (r.status_code == 400 and "already exists" in r.text.lower()), r.text
        if r.status_code == 200:
            assert r.json()["phone"] == "9988776655" and r.json()["country_code"] == "+91"

    # V2 UK store
    def test_v2_uk_store(self, client):
        r = _create(client, "TEST_V2", "7911123456", "+44")
        assert r.status_code == 200 or (r.status_code == 400 and "already exists" in r.text.lower()), r.text
        r2 = client.get(f"{BASE_URL}/api/customers/{UK_ID}")
        assert r2.status_code == 200
        assert r2.json()["phone"] == "7911123456" and r2.json()["country_code"] == "+44"

    # V3 lookup
    def test_v3_uk_search(self, client):
        res = _search(client, "7911123456")
        assert any(c["id"] == UK_ID and c["country_code"] == "+44" for c in res), res

    # V4 raw E.164 (unit + API)
    def test_v4_e164_unit(self):
        assert normalize_phone("+447911123456") == ("7911123456", "+44", "fixed")

    def test_v4_e164_api_dedup(self, client):
        r = _create(client, "TEST_V4", "+447911123456")
        # existing UK guest → should be detected as duplicate, NOT +91 garbage/new
        assert r.status_code == 400 and "already exists" in r.text.lower(), f"{r.status_code} {r.text}"

    # V5 India invalid
    def test_v5_india_invalid(self, client):
        r = client.put(f"{BASE_URL}/api/customers/{FIR_HILLS_ID}", json={"phone": "1772654157", "country_code": "+91"})
        assert r.status_code == 422, r.text
        assert "valid mobile number" in r.text.lower()

    # V6 US number
    def test_v6_us_update(self, client):
        r = client.put(f"{BASE_URL}/api/customers/{FIR_HILLS_ID}", json={"phone": "1772654157", "country_code": "+1"})
        assert r.status_code == 200, r.text
        g = client.get(f"{BASE_URL}/api/customers/{FIR_HILLS_ID}").json()
        assert g["phone"] == "1772654157" and g["country_code"] == "+1"

    # V7 partial search
    def test_v7_partial_search(self, client):
        res = _search(client, "17726")
        assert any(c["id"] == FIR_HILLS_ID and c["country_code"] == "+1" for c in res), res

    # V9 UAE
    def test_v9_uae(self, client):
        r = _create(client, "TEST_V9", "501234567", "+971")
        assert r.status_code == 200 or (r.status_code == 400 and "already exists" in r.text.lower()), r.text
        g = client.get(f"{BASE_URL}/api/customers/{UAE_ID}").json()
        assert g["phone"] == "501234567" and g["country_code"] == "+971"

    # V17 junk
    def test_v17_junk_phone(self, client):
        r = _create(client, "TEST_V17", "0000000000", "+91")
        assert r.status_code == 422, f"{r.status_code} {r.text}"

    # V19 formatted Indian
    def test_v19_formatted_indian(self, client):
        r = _create(client, "TEST_V19", "+91 9876 543210", "+91")
        assert r.status_code == 200 or (r.status_code == 400 and "already exists" in r.text.lower()), r.text
        if r.status_code == 200:
            assert r.json()["phone"] == "9876543210"

    # V20 export
    def test_v20_export(self, client):
        r = client.get(f"{BASE_URL}/api/customers/export", params={"format": "csv"}, timeout=120)
        assert r.status_code == 200, r.text
        text = r.content.decode("utf-8-sig")
        rows = list(csv.reader(io.StringIO(text)))
        header = rows[0]
        assert header.count("Country Code") == 1, header
        ci = header.index("Country Code")
        pi = next(i for i, h in enumerate(header) if h.lower().startswith("phone"))
        fir = [row for row in rows[1:] if len(row) > pi and row[pi] == "1772654157"]
        assert fir and fir[0][ci] == "+1", fir


class TestCR124Import:
    def _preview(self, client, content):
        files = {"file": ("t.csv", content.encode(), "text/csv")}
        h = {"Authorization": client.headers["Authorization"]}
        return requests.post(f"{BASE_URL}/api/customers/import-preview", files=files, headers=h, timeout=60)

    # V11 intl CSV
    def test_v11_csv_intl(self, client):
        r = self._preview(client, "name,phone,country_code\nIntlTest,7654321098,+44\n")
        assert r.status_code == 200, r.text
        d = r.json()
        row = d["rows"][0] if "rows" in d else d["preview_rows"][0]
        print(row)
        assert row["status"] == "new"
        # cc-aware proof: existing UK guest under +44 -> update; under +91 -> new; SG 8-digit -> new (not error)
        r2 = self._preview(client, "name,phone,country_code\nA,7911123456,+44\nB,12345678,+65\n")
        rows2 = r2.json()["preview_rows"]
        assert [x["status"] for x in rows2] == ["update", "new"], rows2
        # preview row should expose country_code so UI can show +44 (spec V11)
        assert row.get("country_code") == "+44", "ImportPreviewRow schema has no country_code field"

    # V12 Indian CSV no cc
    def test_v12_csv_indian(self, client):
        r = self._preview(client, "name,phone\nIndianTest,9876543219\n")
        assert r.status_code == 200, r.text
        d = r.json()
        row = d["rows"][0] if "rows" in d else d["preview_rows"][0]
        print(row)
        assert row["status"] in ("new", "update")
        assert row.get("country_code", "+91") == "+91"

    # Round trip: 'Country Code' header (export format)
    def test_csv_export_header_roundtrip(self, client):
        r = self._preview(client, "Name,Phone,Country Code\nFir Hills,1772654157,+1\n")
        assert r.status_code == 200, r.text
        d = r.json()
        row = d["rows"][0] if "rows" in d else d["preview_rows"][0]
        print(row)
        assert row["status"] == "update"


class TestCR124Scan:
    # V8 skip-otp
    def test_v8_skip_otp(self):
        r = requests.post(f"{BASE_URL}/api/scan/auth/skip-otp",
                          json={"phone": "7911123456", "country_code": "+44", "restaurant_id": "644"}, timeout=60)
        print(r.status_code, r.text[:300])
        assert r.status_code != 400, r.text
        assert r.status_code in (200, 404, 429), r.text
        if r.status_code == 200:
            d = r.json()
            assert d["data"]["token"] and d["data"]["customer_id"] == UK_ID and d["data"]["is_new_customer"] is False

    # V10 feedback
    def test_v10_feedback(self):
        r = requests.post(f"{BASE_URL}/api/scan/feedback",
                          json={"phone": "7911123456", "country_code": "+44", "restaurant_id": "644",
                                "rating": 5, "message": "TEST_cr124 qa"}, timeout=60)
        print(r.status_code, r.text[:300])
        assert r.status_code != 400, r.text
        assert r.status_code in (200, 201, 404, 429), r.text


class TestCR124Unit:
    # V18 legacy tolerance
    def test_v18_phone_match(self):
        q = phone_match("uid", "9876543210", "+91")
        assert q == {"user_id": "uid", "phone": "9876543210", "country_code": {"$in": ["+91", None, ""]}}
        assert phone_match("uid", "7911123456", "+44")["country_code"] == "+44"

    @pytest.mark.parametrize("raw,cc,exp", [
        ("9876543210", "+91", ("9876543210", "+91", "ok")),
        ("919876543210", None, ("9876543210", "+91", "fixed")),
        ("09876543210", None, ("9876543210", "+91", "fixed")),
        ("+91 9876 543210", "+91", ("9876543210", "+91", "fixed")),
        ("1772654157", "+91", ("1772654157", "+91", "invalid")),
        ("1772654157", "+1", ("1772654157", "+1", "ok")),
        ("+12025550123", None, ("2025550123", "+1", "fixed")),
        ("+35312345678", None, ("12345678", "+353", "fixed")),
        ("+971501234567", None, ("501234567", "+971", "fixed")),
        ("0000000000", "+91", ("0000000000", "+91", "invalid")),
    ])
    def test_normalize(self, raw, cc, exp):
        assert normalize_phone(raw, cc) == exp
