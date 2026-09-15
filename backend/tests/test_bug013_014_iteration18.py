# Iteration 18 — Independent verification of BUG-013 (bulk_write speed + duplicate phone
# rejection) and BUG-014 (whatsapp_opt_in column ingestion / D2 default).
# Uses synthetic phone prefix 9000002 (isolated from prior test suite's 9000001).
# Cleans up customers + import_logs test rows in finally.
import asyncio
import csv
import io
import os
import sys
import time

import httpx
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

BASE = "http://localhost:8001/api"
EMAIL = "owner@jehsnest.com"
PASSWORD = "Qplazm@10"
PREFIX = "9000002"

HEADERS8 = ["name", "phone", "email", "dob", "city", "address", "tags", "whatsapp_opt_in"]
HEADERS8_HUMAN = ["name", "phone", "email", "dob", "city", "address", "tags", "WhatsApp Opt-in"]


def _csv_bytes(rows, headers):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    w.writerows(rows)
    return buf.getvalue().encode()


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE, timeout=180) as c:
        r = c.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
        assert r.status_code == 200, r.text
        c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
        yield c
        # cleanup synthetic customers + import_logs rows we created
        import motor.motor_asyncio

        async def _clean():
            db = motor.motor_asyncio.AsyncIOMotorClient(
                os.environ["MONGO_URL"]
            )[os.environ["DB_NAME"]]
            cres = await db.customers.delete_many({"phone": {"$regex": f"^{PREFIX}"}})
            lres = await db.import_logs.delete_many({"filename": {"$regex": "^iter18_"}})
            print(
                f"cleanup: removed {cres.deleted_count} customers, "
                f"{lres.deleted_count} import_logs"
            )

        asyncio.new_event_loop().run_until_complete(_clean())


def _upload(client, rows, headers=HEADERS8, endpoint="/customers/import", fname="iter18_t.csv"):
    return client.post(
        endpoint,
        files={"file": (fname, _csv_bytes(rows, headers), "text/csv")},
    )


# ── 1) Large 300-row import speed & counts ───────────────────────────────────
def test_1_large_import_speed(client):
    rows = [[f"Iter18 {i}", f"{PREFIX}{i:03d}", "", "", "", "", "", ""] for i in range(300)]
    t0 = time.time()
    r = _upload(client, rows, fname="iter18_large.csv")
    elapsed = time.time() - t0
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["imported"] == 300, body
    assert body["updated"] == 0, body
    assert body["failed"] == 0, body
    assert elapsed < 30, f"BUG-013 regressed: 300-row import took {elapsed:.1f}s"
    print(f"[1] 300 rows imported in {elapsed:.2f}s")


# ── 2) Idempotent re-import ──────────────────────────────────────────────────
def test_2_reimport_idempotent(client):
    rows = [[f"Iter18 {i}", f"{PREFIX}{i:03d}", "", "", "", "", "", ""] for i in range(300)]
    r = _upload(client, rows, fname="iter18_large.csv")
    assert r.status_code == 200
    body = r.json()
    assert body["imported"] == 0 and body["updated"] == 300 and body["failed"] == 0, body


# ── 3) Duplicate phone rejection on BOTH endpoints ───────────────────────────
def test_3a_duplicate_rejected_preview(client):
    rows = [
        ["Dup A", f"{PREFIX}901", "", "", "", "", "", ""],
        ["Dup B", f"{PREFIX}901", "", "", "", "", "", ""],
    ]
    r = _upload(client, rows, endpoint="/customers/import-preview", fname="iter18_dup.csv")
    assert r.status_code == 400, r.text
    detail = r.json()["detail"]
    assert "Duplicate phone numbers found in file" in detail
    assert f"{PREFIX}901" in detail
    assert "rows 2, 3" in detail, detail


def test_3b_duplicate_rejected_import(client):
    rows = [
        ["Dup A", f"{PREFIX}902", "", "", "", "", "", ""],
        ["Dup B", f"{PREFIX}902", "", "", "", "", "", ""],
    ]
    r = _upload(client, rows, endpoint="/customers/import", fname="iter18_dup2.csv")
    assert r.status_code == 400, r.text
    detail = r.json()["detail"]
    assert "Duplicate phone numbers found in file" in detail
    assert f"{PREFIX}902" in detail


# ── 4) NEW customer opt-in defaults / explicit No ────────────────────────────
def _get_optin(client, phone):
    r = client.get(f"/customers?search={phone}&limit=1")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body, f"no customer for {phone}"
    return body[0]["whatsapp_opt_in"]


def test_4a_new_blank_defaults_true(client):
    phone = f"{PREFIX}910"
    r = _upload(client, [["New Blank", phone, "", "", "", "", "", ""]],
                fname="iter18_new_blank.csv")
    assert r.status_code == 200, r.text
    assert _get_optin(client, phone) is True


def test_4b_new_explicit_no_becomes_false(client):
    phone = f"{PREFIX}911"
    r = _upload(client, [["New No", phone, "", "", "", "", "", "No"]],
                fname="iter18_new_no.csv")
    assert r.status_code == 200, r.text
    assert _get_optin(client, phone) is False


# ── 5) EXISTING customer opt-in: Yes/No/blank/junk ───────────────────────────
def test_5_existing_optin_transitions(client):
    phone = f"{PREFIX}001"  # created in test 1 with default True

    assert _get_optin(client, phone) is True

    r = _upload(client, [["Iter18 1", phone, "", "", "", "", "", "No"]],
                fname="iter18_ex_no.csv")
    assert r.status_code == 200
    assert _get_optin(client, phone) is False

    r = _upload(client, [["Iter18 1", phone, "", "", "", "", "", ""]],
                fname="iter18_ex_blank.csv")
    assert r.status_code == 200
    assert _get_optin(client, phone) is False, "blank must NOT overwrite (D1)"

    r = _upload(client, [["Iter18 1", phone, "", "", "", "", "", "maybe"]],
                fname="iter18_ex_junk.csv")
    assert r.status_code == 200, r.text
    assert _get_optin(client, phone) is False, "junk value must NOT overwrite"

    r = _upload(client, [["Iter18 1", phone, "", "", "", "", "", "Yes"]],
                fname="iter18_ex_yes.csv")
    assert r.status_code == 200
    assert _get_optin(client, phone) is True


# ── 6) Human header variant "WhatsApp Opt-in" (case-insensitive) ─────────────
def test_6_human_header_variant(client):
    phone = f"{PREFIX}920"
    r = _upload(
        client,
        [["Human Hdr", phone, "", "", "", "", "", "No"]],
        headers=HEADERS8_HUMAN,
        fname="iter18_human_hdr.csv",
    )
    assert r.status_code == 200, r.text
    assert _get_optin(client, phone) is False

    # blank via human header on existing row must not overwrite
    r = _upload(
        client,
        [["Human Hdr", phone, "", "", "", "", "", ""]],
        headers=HEADERS8_HUMAN,
        fname="iter18_human_hdr2.csv",
    )
    assert r.status_code == 200
    assert _get_optin(client, phone) is False


# ── 7) Sample template CSV + XLSX ────────────────────────────────────────────
def test_7a_sample_template_csv_has_optin(client):
    r = client.get("/customers/sample-import-template?format=csv")
    assert r.status_code == 200, r.text
    header_line = r.text.splitlines()[0]
    cols = [c.strip() for c in header_line.split(",")]
    assert "whatsapp_opt_in" in cols, cols
    assert len(cols) >= 8


def test_7b_sample_template_xlsx_200(client):
    r = client.get("/customers/sample-import-template?format=xlsx")
    assert r.status_code == 200
    assert len(r.content) > 100


# ── 8) Regression: export + preview shape + row-level errors ─────────────────
def test_8a_export_csv_headers(client):
    r = client.get("/customers/export?format=csv")
    assert r.status_code == 200, r.text
    header_line = r.text.splitlines()[0]
    cols = [c.strip() for c in header_line.split(",")]
    assert len(cols) == 22, f"expected 22 headers, got {len(cols)}: {cols}"
    assert "Tags" in cols
    assert "WhatsApp Opt-in" in cols


def test_8b_preview_shape_and_row_errors(client):
    rows = [
        ["Good One",   f"{PREFIX}930", "", "", "", "", "vip", "Yes"],
        ["",           f"{PREFIX}931", "", "", "", "", "",    ""],   # missing name
        ["Bad Phone",  "12345",        "", "", "", "", "",    ""],   # bad phone
    ]
    r = _upload(client, rows, endpoint="/customers/import-preview", fname="iter18_prev.csv")
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("filename", "total_rows", "new_count", "update_count",
              "error_count", "preview_rows", "all_errors"):
        assert k in body, f"missing key {k} in preview shape"
    assert body["total_rows"] == 3
    assert body["error_count"] == 2
    assert body["new_count"] == 1
    # verify all_errors mentions the row-level reasons
    reasons = " ".join(e.get("reason", "") for e in body["all_errors"])
    assert "name" in reasons.lower() or "phone" in reasons.lower()
