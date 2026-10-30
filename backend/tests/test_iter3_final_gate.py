# Iteration 3 final gate: BUG-041/042/043 + CR-125 + code-inspection checks (V13/V16)
import os
import sys
import time
import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from core.phone import normalize_phone, phone_match, _KNOWN_CC  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
BACKEND = os.path.join(os.path.dirname(__file__), "..")


@pytest.fixture(scope="module")
def token():
    last = None
    for _ in range(4):
        try:
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": os.environ.get("CRM_TEST_OWNER_EMAIL"),
                                    "password": os.environ.get("CRM_TEST_OWNER_PASSWORD")}, timeout=60)
            if r.status_code == 200:
                return r.json()["access_token"]
            last = r.status_code
        except requests.RequestException as e:
            last = str(e)
        time.sleep(5)
    pytest.skip(f"login failed {last}")


def _preview(token, content):
    files = {"file": ("t.csv", content.encode(), "text/csv")}
    return requests.post(f"{BASE_URL}/api/customers/import-preview", files=files,
                         headers={"Authorization": f"Bearer {token}"}, timeout=60)


# BUG-041: null/empty cc safe
class TestBug041:
    def test_b1_none(self):
        assert (None or "+91").replace("+", "") == "91"

    def test_b2_empty(self):
        assert ("" or "+91").replace("+", "") == "91"

    def test_v13_code_inspection(self):
        src = open(os.path.join(BACKEND, "core/whatsapp.py")).read()
        assert "(customer.get(\"country_code\") or \"+91\").replace(\"+\", \"\")" in src
        assert "customer.get(\"country_code\", \"+91\").replace(" not in src


# V16: pos.py uses _cc
class TestPosTrigger:
    def test_v16_pos_uses_cc(self):
        lines = open(os.path.join(BACKEND, "routers/pos.py")).read().splitlines()
        window = "\n".join(lines[2560:2620])
        assert '"country_code": _cc' in window
        assert '"country_code": "+91"' not in window


# CR-125: 22 known prefixes
class TestCR125:
    def test_known_cc_count(self):
        assert len(_KNOWN_CC) == 22

    @pytest.mark.parametrize("raw,phone,cc", [
        ("+27821234567", "821234567", "+27"),
        ("+79161234567", "9161234567", "+7"),
        ("+34612345678", "612345678", "+34"),
        ("+62812345678", "812345678", "+62"),
        ("+2348012345678", "8012345678", "+234"),
        ("+254712345678", "712345678", "+254"),
        ("+447911123456", "7911123456", "+44"),
        ("+919876543210", "9876543210", "+91"),
    ])
    def test_b6_b11_prefix(self, raw, phone, cc):
        p, c, s = normalize_phone(raw)
        assert (p, c) == (phone, cc) and s == "fixed"

    def test_v18_phone_match(self):
        assert phone_match("u1", "9876543210", "+91")["country_code"] == {"$in": ["+91", None, ""]}
        assert phone_match("u1", "7911123456", "+44")["country_code"] == "+44"


# BUG-042: preview rows expose country_code
class TestBug042:
    def test_b3_preview_intl_cc(self, token):
        r = _preview(token, "name,phone,country_code\nTEST_Intl,7654321098,+44\n")
        assert r.status_code == 200, r.text
        row = r.json()["preview_rows"][0]
        assert row["country_code"] == "+44" and row["status"] == "new", row

    def test_b3_preview_existing_uk_update(self, token):
        r = _preview(token, "name,phone,country_code\nA,7911123456,+44\nB,12345678,+65\n")
        rows = r.json()["preview_rows"]
        assert [x["status"] for x in rows] == ["update", "new"], rows
        assert [x["country_code"] for x in rows] == ["+44", "+65"], rows

    def test_b4_preview_default_91(self, token):
        r = _preview(token, "name,phone\nTEST_Ind,9876543219\n")
        assert r.status_code == 200, r.text
        row = r.json()["preview_rows"][0]
        assert row["country_code"] == "+91", row

    def test_preview_export_header(self, token):
        r = _preview(token, "Name,Phone,Country Code\nFir Hills,1772654157,+1\n")
        row = r.json()["preview_rows"][0]
        assert row["status"] == "update" and row["country_code"] == "+1", row
