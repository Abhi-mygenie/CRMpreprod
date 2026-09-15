"""
BUG-010 QA re-verification tests (owner-requested independent re-check).

Scope on LIVE preprod tenant (owner@jehsnest.com / Jeh's Nest):
  QA-2: /authkey-templates enrichment for wid 40529 (sampletestlogo) and 40534.
  QA-3: /custom-templates persisted doc integrity + S3 URL reachability.
  QA-5: Local draft POST /custom-templates carries send_media_url; DELETE.
  QA-6: Non-media templates unaffected.
  QA-7: Resend gate returns 'media_still_missing' for a synthetic failed row
        whose template_id does not exist (no real send occurs).

Safety: no Meta template creation, no campaign send/test-send/schedule,
        no resending of REAL failed rows.
"""
import os
import uuid
from datetime import datetime, timezone
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://crm-preprod-preview-3.preview.emergentagent.com",
).rstrip("/")
LOGIN_EMAIL = "owner@jehsnest.com"
LOGIN_PASSWORD = "Qplazm@10"
TENANT_USER_ID = "pos_0001_restaurant_635"


# ---- fixtures ----
@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ---------- QA-2: authkey-templates enrichment ----------
def test_qa2_wid_40529_enrichment(headers):
    r = requests.get(f"{BASE_URL}/api/whatsapp/authkey-templates", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    templates = r.json().get("templates", [])
    match = next((t for t in templates if str(t.get("wid")) == "40529"), None)
    assert match is not None, "wid 40529 (sampletestlogo) not found in enrichment response"
    assert match.get("header_type") == "image", f"header_type: {match.get('header_type')}"
    assert match.get("has_send_media") is True, f"has_send_media: {match.get('has_send_media')} | {match}"
    assert match.get("needs_media_reupload") is False, f"needs_media_reupload: {match.get('needs_media_reupload')}"


def test_qa2_wid_40534_has_send_media(headers):
    r = requests.get(f"{BASE_URL}/api/whatsapp/authkey-templates", headers=headers, timeout=30)
    templates = r.json().get("templates", [])
    match = next((t for t in templates if str(t.get("wid")) == "40534"), None)
    if match is None:
        pytest.skip("wid 40534 not present — skip")
    assert match.get("has_send_media") is True, f"has_send_media: {match.get('has_send_media')} | {match}"


# ---------- QA-3: persisted doc integrity ----------
def test_qa3_custom_templates_sampletestlogo_s3_url_reachable(headers):
    r = requests.get(f"{BASE_URL}/api/whatsapp/custom-templates", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    tpls = body.get("templates") if isinstance(body, dict) else body
    match = next((t for t in tpls if t.get("template_name") == "sampletestlogo"), None)
    assert match is not None, "custom_templates 'sampletestlogo' not found"
    smu = match.get("send_media_url")
    assert smu, f"send_media_url missing: {match}"
    assert smu.startswith("https://mygenie-prod.s3."), f"unexpected S3 host: {smu}"
    # Verify public reachability
    resp = requests.get(smu, timeout=15, stream=True)
    assert resp.status_code == 200, f"S3 URL not reachable: {resp.status_code} {smu}"


# ---------- QA-5: local draft path (safe - DB insert only, no Meta call) ----------
def test_qa5_local_draft_persists_send_media_url(headers):
    payload = {
        "template_name": f"qa_bug010_draft_check_{uuid.uuid4().hex[:8]}",
        "category": "utility",
        "language": "en",
        "header_type": "image",
        "body": "QA check",
        "send_media_url": "https://example.com/qa.png",
        "header_handle": "qa-handle",
        "send_media_filename": "qa.png",
        "header_media_mime": "image/png",
    }
    created_id = None
    try:
        r = requests.post(f"{BASE_URL}/api/whatsapp/custom-templates", headers=headers, json=payload, timeout=20)
        assert r.status_code == 200, f"POST /custom-templates failed: {r.status_code} {r.text}"
        doc = r.json()
        created_id = doc.get("id")
        assert created_id
        assert doc.get("send_media_url") == payload["send_media_url"], f"send_media_url not persisted: {doc}"
        assert doc.get("header_handle") == payload["header_handle"]
        assert doc.get("send_media_filename") == payload["send_media_filename"]
        assert doc.get("header_media_mime") == payload["header_media_mime"]
        # confirm via GET
        r2 = requests.get(f"{BASE_URL}/api/whatsapp/custom-templates", headers=headers, timeout=20)
        assert r2.status_code == 200
        tpls = r2.json().get("templates") if isinstance(r2.json(), dict) else r2.json()
        matched = next((t for t in tpls if t.get("id") == created_id), None)
        assert matched is not None, "created draft not returned by GET"
        assert matched.get("send_media_url") == payload["send_media_url"]
    finally:
        if created_id:
            d = requests.delete(
                f"{BASE_URL}/api/whatsapp/custom-templates/{created_id}",
                headers=headers,
                timeout=20,
            )
            assert d.status_code in (200, 204), f"cleanup DELETE failed: {d.status_code} {d.text}"


# ---------- QA-6: non-media templates unaffected ----------
def test_qa6_non_media_templates_not_blocked(headers):
    r = requests.get(f"{BASE_URL}/api/whatsapp/authkey-templates", headers=headers, timeout=30)
    assert r.status_code == 200
    templates = r.json().get("templates", [])
    # Find templates whose header_type is not media or missing (enrichment only sets header_type
    # for docs matched by wid — otherwise field is absent). Non-media templates should not
    # be flagged by the frontend isMediaBlocked() rule.
    non_media = [
        t for t in templates
        if t.get("header_type") not in ("image", "video", "document")
    ]
    assert non_media, "Expected at least one non-media template in list"
    for t in non_media:
        # For non-media, either has_send_media is absent OR header_type is text/none/None.
        # frontend rule: only blocks when header_type in image/video/document AND !has_send_media
        ht = t.get("header_type")
        # simulate the isMediaBlocked check
        blocked = ht in ("image", "video", "document") and not t.get("has_send_media")
        assert blocked is False, f"non-media template unexpectedly blocked: {t}"


# ---------- QA-7: resend gate via synthetic row ----------
def test_qa7_resend_skips_synthetic_media_missing_when_template_absent(headers):
    """
    Seed a failed(media_missing) log row referencing a non-existent template.
    POST /resend must return skipped=True with error='media_still_missing'
    and MUST NOT make any AuthKey call (because it exits before send).
    """
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL / DB_NAME env vars not available in test env")

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=8000)
    db = client[db_name]
    synth_id = f"qa-bug010-{uuid.uuid4().hex}"
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": synth_id,
        "user_id": TENANT_USER_ID,
        "template_id": "qa-none-exists",
        "customer_phone": "0000000009",
        "country_code": "91",
        "body_values": {},
        "status": "failed",
        "status_note": "media_missing",
        "created_at": now_iso,
        "updated_at": now_iso,
        "bug010_qa_test": True,
    }
    try:
        db.whatsapp_message_logs.insert_one(doc)
        # Confirm insert
        found = db.whatsapp_message_logs.find_one({"id": synth_id})
        assert found is not None

        r = requests.post(
            f"{BASE_URL}/api/whatsapp/resend",
            headers=headers,
            json={"message_ids": [synth_id]},
            timeout=30,
        )
        assert r.status_code == 200, f"resend endpoint status: {r.status_code} {r.text}"
        body = r.json()
        # find our result row
        results = body.get("results") or body.get("data") or []
        # results may be nested; be flexible
        my_result = None
        if isinstance(results, list):
            my_result = next((x for x in results if x.get("id") == synth_id), None)
        assert my_result is not None, f"synthetic row id not present in resend response: {body}"
        assert my_result.get("skipped") is True, f"expected skipped=True: {my_result}"
        assert my_result.get("error") == "media_still_missing", f"expected 'media_still_missing', got: {my_result}"
        assert my_result.get("success") is False
    finally:
        db.whatsapp_message_logs.delete_one({"id": synth_id})
        client.close()
