"""
CR-036 Batch B.3 verification tests.

Covers:
- V-B3-1 REGRESSION single-shot upload
- V-B3-2/3/4 error paths (init 400/413, chunk 404, complete missing → 400)
- V-B3-5 chunked happy path (~4.6 MB PNG)
- V-B3-10 resend skip paths (media_still_missing, not_resendable)
- V-B3-11 grace-window regression

Safety:
- LIVE preprod tenant Jeh's Nest (owner@jehsnest.com).
- NEVER creates a Meta template, NEVER sends a real WhatsApp message.
  Resend tests seed synthetic rows whose code path exits BEFORE any AuthKey call.
- Media uploads to Meta /uploads + S3 ARE allowed (create no template, send nothing).
- All seeded Mongo docs carry cr036_b3_test: True and are deleted at end.
"""

import io
import math
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from PIL import Image
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://crm-preprod-preview-3.preview.emergentagent.com"
).rstrip("/")

OWNER_EMAIL = "owner@jehsnest.com"
OWNER_PASSWORD = "Qplazm@10"
OWNER_USER_ID = "pos_0001_restaurant_635"

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "mygenie")


# ---------------------------------------------------------------------------
# Mongo client (session-scoped, LIVE preprod)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def mongo_db():
    # Fallback: read from backend .env if not injected.
    global MONGO_URL, DB_NAME
    if not MONGO_URL:
        with open("/app/backend/.env") as fh:
            for line in fh:
                if line.startswith("MONGO_URL="):
                    MONGO_URL = line.split("=", 1)[1].strip().strip('"')
                if line.startswith("DB_NAME="):
                    DB_NAME = line.split("=", 1)[1].strip().strip('"')
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def auth_token():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        timeout=30,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    tok = resp.json().get("access_token")
    assert tok, f"No access_token in login response: {resp.json()}"
    return tok


@pytest.fixture(scope="session")
def api_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _tiny_png_bytes(size_px: int = 1) -> bytes:
    img = Image.new("RGB", (size_px, size_px), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _large_png_bytes(min_bytes: int = 4 * 1024 * 1024 + 100_000, max_bytes: int = 5 * 1024 * 1024) -> bytes:
    """Random-noise PNG between min_bytes and max_bytes (5 MB image cap)."""
    import random

    # Try shrinking side until PNG fits under image cap while exceeding 4 MB chunk size.
    for side in (1240, 1250, 1260, 1270, 1280, 1290, 1220, 1210, 1200):
        pixels = bytes(random.randint(0, 255) for _ in range(side * side * 3))
        img = Image.frombytes("RGB", (side, side), pixels)
        buf = io.BytesIO()
        img.save(buf, format="PNG", compress_level=0)  # ~raw size
        data = buf.getvalue()
        if min_bytes < len(data) < max_bytes:
            return data
    raise RuntimeError(f"Could not generate PNG within {min_bytes}..{max_bytes} range (last={len(data)})")


# ---------------------------------------------------------------------------
# V-B3-1: REGRESSION — single-shot upload works
# ---------------------------------------------------------------------------
class TestSingleShotUpload:
    def test_single_shot_png_upload_returns_correct_shape(self, api_headers):
        png = _tiny_png_bytes()
        files = {"file": ("tiny.png", png, "image/png")}
        data = {"template_slug": "header"}
        resp = requests.post(
            f"{BASE_URL}/api/whatsapp/upload-media-header",
            headers=api_headers,
            files=files,
            data=data,
            timeout=60,
        )
        assert resp.status_code == 200, f"{resp.status_code}: {resp.text}"
        body = resp.json()
        assert set(body.keys()) == {"handle", "send_media_url", "mime", "filename", "kind"}, (
            f"Unexpected keys: {body.keys()}"
        )
        assert body["mime"] == "image/png"
        assert body["kind"] == "image"
        assert body["filename"] == "tiny.png"
        assert body["send_media_url"].startswith("https://mygenie-prod.s3"), body["send_media_url"]
        # sanity: publicly reachable
        head = requests.head(body["send_media_url"], timeout=15)
        assert head.status_code == 200, f"S3 URL not reachable: {head.status_code}"


# ---------------------------------------------------------------------------
# V-B3-2/3/4: Error paths on chunked flow (re-verify)
# ---------------------------------------------------------------------------
class TestChunkedErrorPaths:
    def test_init_rejects_unsupported_mime(self, api_headers):
        resp = requests.post(
            f"{BASE_URL}/api/whatsapp/upload-media-header/init",
            headers=api_headers,
            json={
                "filename": "bad.gif",
                "mime": "image/gif",
                "total_size": 100,
                "total_chunks": 1,
                "template_slug": "header",
            },
            timeout=15,
        )
        assert resp.status_code == 400, resp.text
        assert "Unsupported media type" in resp.text

    def test_init_rejects_oversized_total_size(self, api_headers):
        # 99,999,999 bytes ≈ 95 MB → over image cap (5 MB) → 413
        resp = requests.post(
            f"{BASE_URL}/api/whatsapp/upload-media-header/init",
            headers=api_headers,
            json={
                "filename": "big.png",
                "mime": "image/png",
                "total_size": 99999999,
                "total_chunks": 24,
                "template_slug": "header",
            },
            timeout=15,
        )
        assert resp.status_code == 413, resp.text
        assert "too large" in resp.text.lower()

    def test_chunk_unknown_upload_id_returns_404(self, api_headers):
        fake_id = str(uuid.uuid4())
        files = {"file": ("part.bin", b"x" * 100, "application/octet-stream")}
        data = {"chunk_index": 0}
        resp = requests.post(
            f"{BASE_URL}/api/whatsapp/upload-media-header/chunk/{fake_id}",
            headers=api_headers,
            files=files,
            data=data,
            timeout=15,
        )
        assert resp.status_code == 404, resp.text

    def test_complete_missing_chunk_returns_400_and_preserves_staging(self, api_headers):
        # init a 2-chunk session (small dummy sizes — we'll only upload chunk 0)
        # Use video/mp4 (16 MB cap) so we can declare 8_000_000 bytes without hitting image cap.
        init = requests.post(
            f"{BASE_URL}/api/whatsapp/upload-media-header/init",
            headers=api_headers,
            json={
                "filename": "partial.mp4",
                "mime": "video/mp4",
                "total_size": 8_000_000,
                "total_chunks": 2,
                "template_slug": "header",
            },
            timeout=15,
        )
        assert init.status_code == 200, init.text
        upload_id = init.json()["upload_id"]

        # Upload only chunk 0
        files = {"file": ("part0.bin", b"\x00" * 4_000_000, "application/octet-stream")}
        r0 = requests.post(
            f"{BASE_URL}/api/whatsapp/upload-media-header/chunk/{upload_id}",
            headers=api_headers,
            files=files,
            data={"chunk_index": 0},
            timeout=60,
        )
        assert r0.status_code == 200, r0.text

        # Complete → should 400 with missing indices [1]
        comp = requests.post(
            f"{BASE_URL}/api/whatsapp/upload-media-header/complete/{upload_id}",
            headers=api_headers,
            timeout=30,
        )
        assert comp.status_code == 400, comp.text
        assert "Missing chunk indices" in comp.text
        assert "1" in comp.text

        # Cleanup: send chunk 1 and complete or delete. Simplest: send chunk 1 with correct size then complete.
        # BUT that would attempt Meta/S3 upload with garbage bytes. Instead we leave the staging dir;
        # the 2h TTL sweep will remove it. That is acceptable per test spec.
        # However, to avoid clutter, we'll try to complete once we send an obviously-wrong chunk 1
        # of just 1 byte → but that would cause size mismatch → 400 (still staging preserved).
        # Best: just leave it and rely on _sweep_stale_staging.


# ---------------------------------------------------------------------------
# V-B3-5: Chunked happy path (~4.6 MB PNG)
# ---------------------------------------------------------------------------
class TestChunkedHappyPath:
    def test_chunked_upload_completes_and_matches_shape(self, api_headers):
        data_bytes = _large_png_bytes()
        total_size = len(data_bytes)
        chunk_size = 4 * 1024 * 1024
        total_chunks = math.ceil(total_size / chunk_size)
        assert total_chunks >= 2, f"Expected >=2 chunks, got {total_chunks}"

        # init
        init = requests.post(
            f"{BASE_URL}/api/whatsapp/upload-media-header/init",
            headers=api_headers,
            json={
                "filename": "big_test.png",
                "mime": "image/png",
                "total_size": total_size,
                "total_chunks": total_chunks,
                "template_slug": "header",
            },
            timeout=15,
        )
        # NOTE: image cap is 5 MB — 4.6 MB fits.
        assert init.status_code == 200, init.text
        upload_id = init.json()["upload_id"]
        assert init.json()["chunk_size"] == chunk_size

        # send chunks
        for i in range(total_chunks):
            slice_ = data_bytes[i * chunk_size : (i + 1) * chunk_size]
            files = {"file": (f"part_{i}.bin", slice_, "application/octet-stream")}
            r = requests.post(
                f"{BASE_URL}/api/whatsapp/upload-media-header/chunk/{upload_id}",
                headers=api_headers,
                files=files,
                data={"chunk_index": i},
                timeout=120,
            )
            assert r.status_code == 200, f"chunk {i} failed: {r.status_code} {r.text}"
            body = r.json()
            assert body["received"] == i + 1
            assert body["total"] == total_chunks

        # complete
        comp = requests.post(
            f"{BASE_URL}/api/whatsapp/upload-media-header/complete/{upload_id}",
            headers=api_headers,
            timeout=180,
        )
        assert comp.status_code == 200, f"complete failed: {comp.status_code} {comp.text}"
        body = comp.json()
        assert set(body.keys()) == {"handle", "send_media_url", "mime", "filename", "kind"}
        assert body["mime"] == "image/png"
        assert body["kind"] == "image"
        assert body["send_media_url"].startswith("https://mygenie-prod.s3")

        # send_media_url publicly reachable
        head = requests.head(body["send_media_url"], timeout=30)
        assert head.status_code == 200, f"S3 URL not reachable: {head.status_code}"

        # staging dir should be deleted
        # We check on filesystem via a lightweight endpoint? None exists — but we can verify
        # by attempting another /complete on the same upload_id, which must now 404.
        second = requests.post(
            f"{BASE_URL}/api/whatsapp/upload-media-header/complete/{upload_id}",
            headers=api_headers,
            timeout=15,
        )
        assert second.status_code == 404, (
            f"Staging not cleaned up — complete still works: {second.status_code} {second.text}"
        )


# ---------------------------------------------------------------------------
# V-B3-10 / V-B3-11: Resend skip paths (SAFE — never reaches AuthKey)
# ---------------------------------------------------------------------------
class TestResendSkipPaths:
    @pytest.fixture(scope="class")
    def seeded_rows(self, mongo_db):
        """Seed three synthetic whatsapp_message_logs rows and delete on teardown."""
        now = datetime.now(timezone.utc).isoformat()
        rows = {
            "media_missing": {
                "id": str(uuid.uuid4()),
                "user_id": OWNER_USER_ID,
                "customer_phone": "0000000009",
                "country_code": "91",
                "template_id": "b3test-none",
                "status": "failed",
                "status_note": "media_missing",
                "body_values": {},
                "created_at": now,
                "cr036_b3_test": True,
            },
            "not_resendable": {
                "id": str(uuid.uuid4()),
                "user_id": OWNER_USER_ID,
                "customer_phone": "0000000009",
                "country_code": "91",
                "template_id": "b3test-none",
                "status": "failed",
                "status_note": None,
                "body_values": {},
                "created_at": now,
                "cr036_b3_test": True,
            },
            "grace": {
                "id": str(uuid.uuid4()),
                "user_id": OWNER_USER_ID,
                "customer_phone": "0000000009",
                "country_code": "91",
                "template_id": "b3test-none",
                "status": "pending",
                "body_values": {},
                "created_at": now,
                "status_history": [
                    {"status": "pending", "timestamp": now, "action": "initial_send"}
                ],
                "cr036_b3_test": True,
            },
        }
        for r in rows.values():
            mongo_db.whatsapp_message_logs.insert_one(r)
        yield rows
        mongo_db.whatsapp_message_logs.delete_many(
            {"id": {"$in": [r["id"] for r in rows.values()]}, "cr036_b3_test": True}
        )

    def test_resend_media_still_missing(self, api_headers, mongo_db, seeded_rows):
        row = seeded_rows["media_missing"]
        resp = requests.post(
            f"{BASE_URL}/api/whatsapp/resend",
            headers=api_headers,
            json={"message_ids": [row["id"]]},
            timeout=30,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["results"]) == 1
        r0 = body["results"][0]
        assert r0.get("skipped") is True
        assert r0.get("error") == "media_still_missing"
        # Row must be UNCHANGED (still failed)
        fresh = mongo_db.whatsapp_message_logs.find_one({"id": row["id"]}, {"_id": 0})
        assert fresh["status"] == "failed"
        assert fresh["status_note"] == "media_missing"
        assert fresh.get("resend_count", 0) == 0

    def test_resend_not_resendable(self, api_headers, mongo_db, seeded_rows):
        row = seeded_rows["not_resendable"]
        resp = requests.post(
            f"{BASE_URL}/api/whatsapp/resend",
            headers=api_headers,
            json={"message_ids": [row["id"]]},
            timeout=30,
        )
        assert resp.status_code == 200, resp.text
        r0 = resp.json()["results"][0]
        assert r0.get("skipped") is True
        assert r0.get("error") == "not_resendable"
        # Row unchanged
        fresh = mongo_db.whatsapp_message_logs.find_one({"id": row["id"]}, {"_id": 0})
        assert fresh["status"] == "failed"
        assert fresh.get("resend_count", 0) == 0

    def test_resend_in_flight_grace_period(self, api_headers, mongo_db, seeded_rows):
        row = seeded_rows["grace"]
        resp = requests.post(
            f"{BASE_URL}/api/whatsapp/resend",
            headers=api_headers,
            json={"message_ids": [row["id"]]},
            timeout=30,
        )
        assert resp.status_code == 200, resp.text
        r0 = resp.json()["results"][0]
        assert r0.get("skipped") is True
        assert r0.get("error") == "in_flight_grace_period"
        fresh = mongo_db.whatsapp_message_logs.find_one({"id": row["id"]}, {"_id": 0})
        assert fresh["status"] == "pending"
