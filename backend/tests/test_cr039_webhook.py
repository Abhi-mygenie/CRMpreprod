"""
CR-039 WhatsApp status-callback webhook regression tests.

Tests the composite (message_id, customer_phone) lookup + ambiguous_row skip
behaviour introduced in /app/backend/routers/whatsapp.py lines 1398-1450.

IMPORTANT: Runs against LIVE production MongoDB. Only mutations touched:
  - Real logid 'd1cbdc206ce89f7f794575bbd862a27b' row for phone 9035133228
    (explicitly requested by CR-039 test matrix — status pending -> delivered)
  - Row for 7505242126 may get updated_at bumped by fallback test (transition_ignored)
  All other cases use synthetic (safe) fake logids.

Run serially:  pytest tests/test_cr039_webhook.py -n 0 -v
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

# Read backend URL from frontend .env (production external URL)
BASE_URL = None
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL not found in /app/frontend/.env")

WEBHOOK_URL = f"{BASE_URL}/api/whatsapp/status-callback"
LOGIN_URL = f"{BASE_URL}/api/auth/login"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

REAL_LOGID = "d1cbdc206ce89f7f794575bbd862a27b"
TARGET_PHONE = "9035133228"
NON_EXISTENT_MOBILE = "911234567890"


# ---------------- fixtures ----------------

@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


# ---------------- helpers ----------------

def snapshot_rows(db, logid):
    rows = list(db.whatsapp_message_logs.find(
        {"message_id": logid},
        {"_id": 0, "id": 1, "customer_phone": 1, "status": 1, "updated_at": 1, "delivered_at": 1},
    ))
    return {r["customer_phone"]: r for r in rows}


def find_callback_log(db, query, retries=10, delay=0.4):
    for _ in range(retries):
        doc = db.whatsapp_callback_logs.find_one(query, sort=[("received_at", -1)])
        if doc:
            return doc
        time.sleep(delay)
    return None


# =====================================================================
# 1. Login regression
# =====================================================================

class TestLoginRegression:
    def test_owner_login_returns_jwt(self):
        resp = requests.post(
            LOGIN_URL,
            json={"email": "owner@jehsnest.com", "password": "Qplazm@10"},
            timeout=30,
        )
        assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text[:400]}"
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in response: {list(data.keys())}"
        assert isinstance(token, str) and len(token) > 20


# =====================================================================
# 2. No-logid rejection
# =====================================================================

class TestNoLogid:
    def test_missing_logid_returns_200_with_error(self):
        resp = requests.post(WEBHOOK_URL, json={}, timeout=15)
        assert resp.status_code == 200
        assert resp.json() == {"success": False, "error": "logid required"}

    def test_missing_logid_persists_callback_log(self, db):
        marker = f"marker-{uuid.uuid4()}"
        resp = requests.post(WEBHOOK_URL, json={"foo": marker}, timeout=15)
        assert resp.status_code == 200
        doc = find_callback_log(db, {"verdict": "rejected_no_logid", "parsed.foo": marker})
        assert doc is not None, "rejected_no_logid callback log not persisted"
        assert "raw_body" in doc and "received_at" in doc
        assert doc["parsed"]["foo"] == marker


# =====================================================================
# 3. No matching row (synthetic logid)
# =====================================================================

class TestNoMatchingRow:
    def test_synthetic_logid_no_matching_row(self, db):
        fake_logid = f"INVALID_TEST_LOGID_{uuid.uuid4().hex}"
        resp = requests.post(
            WEBHOOK_URL,
            json={"logid": fake_logid, "mobile": NON_EXISTENT_MOBILE, "status": "delivered"},
            timeout=15,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data == {"success": True, "logid": fake_logid, "updated": False}, data

        doc = find_callback_log(db, {"logid": fake_logid, "verdict": "no_matching_row"})
        assert doc is not None, "no_matching_row callback log missing"
        assert doc["verdict_reason"].startswith(f"logid={fake_logid}")


# =====================================================================
# 4. CRITICAL: ambiguous_row when mobile mismatches for real logid
# =====================================================================

class TestAmbiguousRow:
    def test_ambiguous_row_no_mutation(self, db):
        before = snapshot_rows(db, REAL_LOGID)
        assert len(before) == 3, f"expected 3 rows for {REAL_LOGID}, got {len(before)}"
        since = datetime.utcnow().isoformat()

        payload = {"logid": REAL_LOGID, "mobile": NON_EXISTENT_MOBILE, "status": "delivered"}
        resp = requests.post(WEBHOOK_URL, json=payload, timeout=15)
        assert resp.status_code == 200
        assert resp.json() == {"success": True, "logid": REAL_LOGID, "updated": False}

        doc = find_callback_log(
            db, {"logid": REAL_LOGID, "verdict": "ambiguous_row", "received_at": {"$gte": since}}
        )
        assert doc is not None, "ambiguous_row callback log not found"
        reason = doc["verdict_reason"] or ""
        assert reason.startswith("mobile_mismatch"), f"unexpected reason: {reason!r}"
        assert NON_EXISTENT_MOBILE in reason

        # Verify no row mutated
        after = snapshot_rows(db, REAL_LOGID)
        for phone, b in before.items():
            a = after[phone]
            assert a["updated_at"] == b["updated_at"], (
                f"row phone={phone} was mutated! "
                f"before={b['updated_at']} after={a['updated_at']}"
            )
            assert a["status"] == b["status"], (
                f"row phone={phone} status changed! before={b['status']} after={a['status']}"
            )


# =====================================================================
# 5. CRITICAL: composite lookup routes update to correct recipient row
# =====================================================================

class TestCompositeLookupCorrectRow:
    def test_correct_row_updated_others_untouched(self, db):
        before = snapshot_rows(db, REAL_LOGID)
        target_before = before[TARGET_PHONE]
        since = datetime.utcnow().isoformat()

        resp = requests.post(
            WEBHOOK_URL,
            json={
                "logid": REAL_LOGID,
                "mobile": f"91{TARGET_PHONE}",
                "status": "delivered",
                "time": "2026-01-15 12:00:00",
            },
            timeout=15,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True
        assert data.get("logid") == REAL_LOGID

        time.sleep(0.4)
        expected_verdict = "applied" if target_before["status"] == "pending" else "transition_ignored"
        doc = find_callback_log(
            db, {"logid": REAL_LOGID, "verdict": expected_verdict, "received_at": {"$gte": since}}
        )
        assert doc is not None, (
            f"expected callback verdict={expected_verdict} "
            f"(target row status was {target_before['status']})"
        )

        after = snapshot_rows(db, REAL_LOGID)
        target_after = after[TARGET_PHONE]

        assert target_after["updated_at"] != target_before["updated_at"], (
            "target row updated_at not bumped"
        )
        if expected_verdict == "applied":
            assert target_after["status"] == "delivered"
            assert target_after.get("delivered_at") is not None

        # Other 2 rows must NOT be touched
        for phone, b in before.items():
            if phone == TARGET_PHONE:
                continue
            a = after[phone]
            assert a["updated_at"] == b["updated_at"], (
                f"OTHER row phone={phone} was mutated! CR-039 fix regressed. "
                f"before={b['updated_at']} after={a['updated_at']}"
            )
            assert a["status"] == b["status"]


# =====================================================================
# 6. Form-urlencoded content type
# =====================================================================

class TestFormUrlEncoded:
    def test_form_urlencoded_parsed_correctly(self, db):
        fake_logid = f"INVALID_TEST_LOGID_{uuid.uuid4().hex}"
        resp = requests.post(
            WEBHOOK_URL,
            data={"logid": fake_logid, "mobile": NON_EXISTENT_MOBILE, "status": "delivered"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        assert resp.status_code == 200
        data = resp.json()
        # Fake logid + non-existent mobile: expect no_matching_row (success:true, updated:false)
        assert data.get("success") is True
        assert data.get("updated") is False

        doc = find_callback_log(db, {"logid": fake_logid, "verdict": "no_matching_row"})
        assert doc is not None, "form-urlencoded payload not parsed into callback log"
        assert doc["parsed"].get("logid") == fake_logid
        assert doc["parsed"].get("status") == "delivered"
        assert doc["parsed"].get("mobile") == NON_EXISTENT_MOBILE


# =====================================================================
# 7. Duplicate delivered -> transition_ignored (delivered_at preserved)
# =====================================================================

class TestDuplicateDelivered:
    def test_duplicate_delivered_is_transition_ignored(self, db):
        """After test 5, target row is 'delivered'. Sending delivered again
        must return transition_ignored and MUST NOT overwrite delivered_at."""
        before = snapshot_rows(db, REAL_LOGID)
        target_before = before[TARGET_PHONE]

        if target_before["status"] != "delivered":
            pytest.skip(
                f"target row status is {target_before['status']}, not 'delivered' — "
                f"duplicate-delivered scenario n/a for this run"
            )

        delivered_at_before = target_before.get("delivered_at")
        since = datetime.utcnow().isoformat()

        resp = requests.post(
            WEBHOOK_URL,
            json={
                "logid": REAL_LOGID,
                "mobile": f"91{TARGET_PHONE}",
                "status": "delivered",
                "time": "2026-01-16 12:00:00",
            },
            timeout=15,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True
        assert data.get("applied") is False, f"applied should be False for duplicate: {data}"

        doc = find_callback_log(
            db, {"logid": REAL_LOGID, "verdict": "transition_ignored", "received_at": {"$gte": since}}
        )
        assert doc is not None, "expected transition_ignored callback log"

        after = snapshot_rows(db, REAL_LOGID)
        target_after = after[TARGET_PHONE]
        assert target_after.get("delivered_at") == delivered_at_before, (
            f"delivered_at was overwritten! "
            f"before={delivered_at_before} after={target_after.get('delivered_at')}"
        )
        assert target_after["status"] == "delivered"


# =====================================================================
# 8. Fallback path: no mobile field -> message_id-only lookup
# =====================================================================

class TestFallbackNoMobile:
    def test_no_mobile_falls_back_to_message_id_only(self, db):
        since = datetime.utcnow().isoformat()
        resp = requests.post(
            WEBHOOK_URL,
            json={"logid": REAL_LOGID, "status": "delivered"},
            timeout=15,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True
        assert data.get("logid") == REAL_LOGID

        time.sleep(0.4)
        doc = find_callback_log(db, {"logid": REAL_LOGID, "received_at": {"$gte": since}})
        assert doc is not None
        # Must have found a row (not no_matching_row) and not been mistakenly ambiguous
        assert doc["verdict"] in ("applied", "transition_ignored"), (
            f"fallback path failed: verdict={doc['verdict']}"
        )
        # parsed must NOT have mobile field
        assert "mobile" not in doc["parsed"]


# =====================================================================
# 9. Every webhook persists a whatsapp_callback_logs row
# =====================================================================

class TestPersistence:
    def test_callback_log_has_all_required_fields(self, db):
        fake_logid = f"INVALID_TEST_LOGID_{uuid.uuid4().hex}"
        resp = requests.post(
            WEBHOOK_URL,
            json={"logid": fake_logid, "mobile": NON_EXISTENT_MOBILE, "status": "delivered"},
            timeout=15,
        )
        assert resp.status_code == 200

        doc = find_callback_log(db, {"logid": fake_logid})
        assert doc is not None
        for field in ("raw_body", "parsed", "verdict", "verdict_reason", "received_at", "id", "headers"):
            assert field in doc, f"missing field '{field}' in callback log"
        assert isinstance(doc["parsed"], dict)
        assert doc["parsed"]["logid"] == fake_logid


# =====================================================================
# 10. Unknown status handling
# =====================================================================

class TestUnknownStatus:
    def test_unknown_status_returns_error_and_persists(self, db):
        fake_logid = f"INVALID_TEST_LOGID_{uuid.uuid4().hex}"
        resp = requests.post(
            WEBHOOK_URL,
            json={"logid": fake_logid, "status": "totally_bogus_status", "mobile": NON_EXISTENT_MOBILE},
            timeout=15,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is False
        assert "unknown status" in data.get("error", "")

        doc = find_callback_log(db, {"logid": fake_logid, "verdict": "unknown_status"})
        assert doc is not None
        assert "totally_bogus_status" in doc.get("verdict_reason", "")
