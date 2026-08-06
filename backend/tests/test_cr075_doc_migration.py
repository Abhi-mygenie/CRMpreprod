"""CR-075 integration test — _cr075_migrate_docs.

Uses real MongoDB (with test user_id), mocks httpx + put_private_object.
Cleans up test data on exit.

Test cases:
  T1 — stub (Select document type) → skipped_stubs
  T2 — both images empty           → skipped_stubs
  T3 — /storage/;/ broken URL      → skipped_404
  T4 — License front only          → 1 migrated
  T5 — Aadhar card front + back    → 2 migrated
"""
import asyncio, sys, os, unittest.mock
sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

import routers.customers as rc
from routers.customers import _cr075_migrate_docs, _CR075_ID_TYPE_MAP, _CR075_EXT_CONTENT_TYPE
from core.database import db

TEST_USER_ID   = "cr075_unit_test_user"
TEST_CUST_ID   = "cr075_unit_test_cust"

BOOKING_DOCS = [
    # T1 — stub
    {"id_type": "Select document type", "front_image": "", "back_image": ""},
    # T2 — both images empty
    {"id_type": "Aadhar card", "front_image": "", "back_image": ""},
    # T3 — broken preprod URL
    {"id_type": "Passport",
     "front_image": "https://preprod.mygenie.online/storage/;/IDFile/broken.jpg",
     "back_image": ""},
    # T4 — License, front only
    {"id_type": "License",
     "front_image": "https://manage.mygenie.online/storage/IDFile/lic_front.jpg",
     "back_image": ""},
    # T5 — Aadhar, front + back
    {"id_type": "Aadhar card",
     "front_image": "https://manage.mygenie.online/storage/IDFile/aadhar_f.png",
     "back_image":  "https://manage.mygenie.online/storage/IDFile/aadhar_b.png"},
]
# Expected first run: migrated=3, skipped_stubs=2, skipped_404=1, already_present=0, failed=0


def make_mock_client():
    """httpx client mock — returns 200 with fake image bytes on .get()."""
    mock_resp = unittest.mock.MagicMock()
    mock_resp.content = b"FAKE_IMG_BYTES_CR075"
    mock_resp.raise_for_status = lambda: None
    c = unittest.mock.AsyncMock()
    c.get = unittest.mock.AsyncMock(return_value=mock_resp)
    return c


async def run():
    print("=== CR-075 Integration Test: _cr075_migrate_docs ===\n")

    # ── cleanup any stale test data ───────────────────────────────────────────
    await db.customer_documents.delete_many({"user_id": TEST_USER_ID})

    # patch S3 upload to always succeed (no real S3 calls)
    rc.put_private_object = lambda s3_key, body, ct: True

    # ── RUN 1: first sync — expect 3 real inserts into MongoDB ────────────────
    doc1 = {"migrated": 0, "skipped_stubs": 0, "skipped_404": 0, "already_present": 0, "failed": 0}
    await _cr075_migrate_docs(make_mock_client(), TEST_USER_ID, TEST_CUST_ID, BOOKING_DOCS, doc1)

    print("RUN 1 doc_summary:", doc1)
    assert doc1["migrated"]        == 3, f"migrated={doc1['migrated']}"
    assert doc1["skipped_stubs"]   == 2, f"skipped_stubs={doc1['skipped_stubs']}"
    assert doc1["skipped_404"]     == 1, f"skipped_404={doc1['skipped_404']}"
    assert doc1["already_present"] == 0, f"already_present={doc1['already_present']}"
    assert doc1["failed"]          == 0, f"failed={doc1['failed']}"
    print("PASS: RUN 1 counts correct ✅")

    # Verify DB — 3 docs inserted
    db_count = await db.customer_documents.count_documents({"user_id": TEST_USER_ID})
    assert db_count == 3, f"DB count={db_count}"
    print(f"PASS: {db_count} docs in DB ✅")

    # Verify Q4 naming convention on each inserted doc
    docs = await db.customer_documents.find(
        {"user_id": TEST_USER_ID}, {"_id": 0}
    ).to_list(length=10)

    print("\nInserted docs:")
    for d in docs:
        assert d["uploaded_by"]  == "migration",                   f"uploaded_by: {d['uploaded_by']}"
        assert "source_url" in d and d["source_url"].startswith("https://"), \
                                                                    f"source_url: {d.get('source_url')}"
        assert "_front" in d["file_name"] or "_back" in d["file_name"], \
                                                                    f"file_name side missing: {d['file_name']}"
        assert d["doc_type"] in list(_CR075_ID_TYPE_MAP.values()),  f"doc_type invalid: {d['doc_type']}"
        assert d["s3_key"].startswith(f"customers/{TEST_CUST_ID}/docs/"), \
                                                                    f"s3_key wrong: {d['s3_key']}"
        print(f"  {d['doc_type']:10s}  {d['file_name']:22s}  uploaded_by={d['uploaded_by']}  src={d['source_url'][:55]}")
    print("PASS: Q4 naming convention (s3_key, file_name, uploaded_by, source_url, doc_type) ✅")

    # ── RUN 2 idempotency (Q1) — same docs, find_one returns existing → 0 new inserts ─
    doc2 = {"migrated": 0, "skipped_stubs": 0, "skipped_404": 0, "already_present": 0, "failed": 0}
    await _cr075_migrate_docs(make_mock_client(), TEST_USER_ID, TEST_CUST_ID, BOOKING_DOCS, doc2)

    print(f"\nRUN 2 doc_summary (idempotency): {doc2}")
    db_count2 = await db.customer_documents.count_documents({"user_id": TEST_USER_ID})
    assert doc2["already_present"] == 3, f"already_present={doc2['already_present']}"
    assert doc2["migrated"]        == 0, f"migrated={doc2['migrated']}"
    assert db_count2               == 3, f"DB count grew to {db_count2} (expected 3)"
    print("PASS: Q1 idempotency — re-run: 3 already_present, 0 new inserts, DB count unchanged ✅")

    # ── RUN 3 download failure (Q2) — httpx raises → skip+log, never raises ──
    fail_client = unittest.mock.AsyncMock()
    fail_client.get = unittest.mock.AsyncMock(side_effect=Exception("network error"))

    doc3 = {"migrated": 0, "skipped_stubs": 0, "skipped_404": 0, "already_present": 0, "failed": 0}
    # Need a clean user_id so idempotency guard doesn't block (no existing docs)
    await _cr075_migrate_docs(fail_client, "cr075_fail_user", TEST_CUST_ID, BOOKING_DOCS, doc3)

    # T4 (1 url) + T5 (2 urls) = 3 download attempts → 3 failures
    assert doc3["failed"]  == 3, f"failed={doc3['failed']}"
    assert doc3["migrated"] == 0, f"migrated={doc3['migrated']}"
    print(f"\nRUN 3 doc_summary (download failures): {doc3}")
    print("PASS: Q2 skip+log on failure — failed=3, migrated=0, no crash ✅")

    # ── cleanup ───────────────────────────────────────────────────────────────
    await db.customer_documents.delete_many({"user_id": TEST_USER_ID})
    print("\nTest data cleaned up ✅")
    print("\n=== ALL TESTS PASSED ✅ ===")


asyncio.run(run())
