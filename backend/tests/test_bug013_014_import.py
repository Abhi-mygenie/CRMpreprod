# BUG-013 + BUG-014 verification suite (V1-V8, plan BATCH_2026_07_14_IMPL_PLAN.md)
# No live WhatsApp sends. Synthetic phones 9000001xxx on jehsnest tenant, cleaned in finally.
import asyncio
import io
import csv
import os
import sys
import time
import uuid

import httpx
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from routers.customers import _validate_and_classify_row, _find_duplicate_phones  # noqa: E402

BASE = "http://localhost:8001/api"
TEST_EMAIL = "owner@jehsnest.com"
TEST_PASSWORD = "Qplazm@10"
PREFIX = "9000001"  # synthetic phone prefix


def _csv_bytes(rows, headers):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    w.writerows(rows)
    return buf.getvalue().encode()


# ── unit: opt-in parsing matrix (V5-V7 parse layer) ──────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("Yes", True), ("yes", True), ("TRUE", True), ("1", True),
    ("No", False), ("no", False), ("False", False), ("0", False),
    ("", None), ("maybe", None), ("  ", None),
])
def test_optin_token_matrix(raw, expected):
    row = {"_row": 2, "name": "T", "phone": "9000001001", "whatsapp opt-in": raw}
    assert _validate_and_classify_row(row, set())["whatsapp_opt_in"] is expected


def test_optin_snake_case_header():
    row = {"_row": 2, "name": "T", "phone": "9000001001", "whatsapp_opt_in": "No"}
    assert _validate_and_classify_row(row, set())["whatsapp_opt_in"] is False


def test_duplicate_phone_detector():
    classified = [
        {"status": "new", "phone": "9000001001", "row": 2},
        {"status": "new", "phone": "9000001001", "row": 5},
        {"status": "update", "phone": "9000001002", "row": 3},
        {"status": "error", "phone": None, "row": 4},
    ]
    detail = _find_duplicate_phones(classified)
    assert detail and "9000001001" in detail and "rows 2, 5" in detail
    assert _find_duplicate_phones(classified[2:]) is None


# ── e2e against running backend ──────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE, timeout=180) as c:
        r = c.post("/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        assert r.status_code == 200, r.text
        c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
        yield c
        # cleanup all synthetic customers
        import motor.motor_asyncio
        async def _clean():
            db = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
            res = await db.customers.delete_many({"phone": {"$regex": f"^{PREFIX}"}})
            print(f"cleanup: removed {res.deleted_count} synthetic customers")
        asyncio.new_event_loop().run_until_complete(_clean())


HEADERS8 = ["name", "phone", "email", "dob", "city", "address", "tags", "whatsapp_opt_in"]


def _import(client, rows, headers=HEADERS8, endpoint="/customers/import"):
    return client.post(endpoint, files={"file": ("t.csv", _csv_bytes(rows, headers), "text/csv")})


def test_v1_v2_large_import_fast_and_counted(client):
    rows = [[f"Bulk {i}", f"{PREFIX}{i:03d}", "", "", "", "", "", ""] for i in range(350)]
    t0 = time.time()
    r = _import(client, rows)
    elapsed = time.time() - t0
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["imported"] == 350 and body["updated"] == 0 and body["failed"] == 0
    assert elapsed < 10, f"import took {elapsed:.1f}s — BUG-013 not fixed"
    print(f"V1 PASS: 350 rows in {elapsed:.2f}s")


def test_v3_reimport_idempotent(client):
    rows = [[f"Bulk {i}", f"{PREFIX}{i:03d}", "", "", "", "", "", ""] for i in range(350)]
    r = _import(client, rows)
    assert r.status_code == 200
    body = r.json()
    assert body["imported"] == 0 and body["updated"] == 350


def test_v4_duplicate_phone_rejected_both_endpoints(client):
    rows = [["Dup A", f"{PREFIX}900", "", "", "", "", "", ""],
            ["Dup B", f"{PREFIX}900", "", "", "", "", "", ""]]
    for ep in ("/customers/import-preview", "/customers/import"):
        r = _import(client, rows, endpoint=ep)
        assert r.status_code == 400, f"{ep}: {r.status_code}"
        assert "Duplicate phone numbers" in r.json()["detail"]


def test_v5_existing_customer_optin_yes_no_blank(client):
    phone = f"{PREFIX}001"  # exists from V1 (default True)

    def get_optin():
        r = client.get(f"/customers?search={phone}&limit=1")
        return r.json()[0]["whatsapp_opt_in"]

    assert get_optin() is True  # D2 default for new imports
    assert _import(client, [["Bulk 1", phone, "", "", "", "", "", "No"]]).status_code == 200
    assert get_optin() is False
    assert _import(client, [["Bulk 1", phone, "", "", "", "", "", ""]]).status_code == 200
    assert get_optin() is False, "blank must leave value unchanged (D1)"
    assert _import(client, [["Bulk 1", phone, "", "", "", "", "", "Yes"]]).status_code == 200
    assert get_optin() is True


def test_v6_new_customer_explicit_no(client):
    phone = f"{PREFIX}950"
    r = _import(client, [["OptOut New", phone, "", "", "", "", "", "No"]])
    assert r.status_code == 200 and r.json()["imported"] == 1
    cust = client.get(f"/customers?search={phone}&limit=1").json()[0]
    assert cust["whatsapp_opt_in"] is False


def test_v7_junk_value_no_crash_unchanged(client):
    phone = f"{PREFIX}002"
    r = _import(client, [["Bulk 2", phone, "", "", "", "", "", "maybe"]])
    assert r.status_code == 200
    cust = client.get(f"/customers?search={phone}&limit=1").json()[0]
    assert cust["whatsapp_opt_in"] is True  # untouched default


def test_v8_template_has_optin_column(client):
    r = client.get("/customers/sample-import-template?format=csv")
    assert r.status_code == 200
    header = r.text.splitlines()[0]
    assert "whatsapp_opt_in" in header


def test_v12_preview_shape_unchanged(client):
    rows = [["Prev", f"{PREFIX}003", "", "", "", "", "vip", "Yes"]]
    r = _import(client, rows, endpoint="/customers/import-preview")
    assert r.status_code == 200
    body = r.json()
    for k in ("filename", "total_rows", "new_count", "update_count", "error_count", "preview_rows", "all_errors"):
        assert k in body
