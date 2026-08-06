# CR-075 — QA Handover
## Hotel Guest Document Migration: POS booking_documents → CRM customer_documents

**Date**: 2026-08-06  
**From**: Implementation Agent  
**To**: QA Agent  
**Status**: IMPLEMENTED — self-test 3/3 PASS  

---

## What was built

`_cr075_migrate_docs()` helper function added to `routers/customers.py`.
Called inside `background_customer_sync()` after each customer is upserted.
Triggered by the existing "Sync Customers" button — no new UI, no new endpoint.

**One file changed**: `routers/customers.py` (+115 LOC, 0 modified)

### The 6 edits (all carry `# CR-075` marker)
| Edit | Location | What |
|---|---|---|
| E1 | line 15 | Added `put_private_object` to s3 import |
| E2 | before line 182 | Module constants: `_CR075_ID_TYPE_MAP`, `_CR075_EXT_CONTENT_TYPE` |
| E3 | line ~288 | `doc_summary` counter dict init |
| E4 | line ~535 | Call `_cr075_migrate_docs(client, user_id, customer_id, ...)` |
| E5 | final log call | 5 new fields: `docs_migrated`, `docs_skipped_stubs`, `docs_skipped_404`, `docs_already_present`, `docs_failed` |
| E6 | before `/sync-from-mygenie` | New `_cr075_migrate_docs()` helper ~80 LOC |

---

## Self-test results (3/3 PASS)

| Run | Scenario | Expected | Result |
|---|---|---|---|
| RUN 1 | First sync, 5 booking_docs (2 stubs, 1 /storage/;/, 2 real) | migrated=3, stubs=2, 404=1, present=0, fail=0 | ✅ PASS |
| RUN 2 | Re-run same docs (idempotency Q1) | migrated=0, present=3, DB count unchanged | ✅ PASS |
| RUN 3 | Download fails (Q2) | failed=3, migrated=0, no crash | ✅ PASS |

Test file: `tests/test_cr075_doc_migration.py`

---

## Acceptance criteria to verify

| AC | Test | Expected |
|---|---|---|
| AC-1 | Trigger sync as hotel tenant (palmhouse/jehsnest), check `customer_documents` | Rows with `uploaded_by="migration"` appear |
| AC-2 | Customer with all-stub booking_docs | Zero new rows in `customer_documents` |
| AC-3 | Check sync log after completion | `docs_skipped_404 > 0` for restaurant_478 tenant; no s3_key with `/storage/;/` |
| AC-4 | Run sync twice — count before/after 2nd run | Count unchanged (idempotency) |
| AC-5 | Check one migrated row's `file_name` | Matches `{doc_type}_{side}.{ext}` pattern (e.g. `license_front.jpg`) |
| AC-6 | Check one migrated row's fields | `uploaded_by="migration"`, `source_url` present, `s3_key` starts with `customers/` |
| AC-7 | back_image doc | Separate row exists with `_back` in `file_name` |
| AC-8 | Existing customer sync fields | `synced_count`/`updated_count` same as before — no regression |
| AC-9 | Sync log new fields | `docs_migrated`, `docs_skipped_stubs`, etc. present in `migration_sync_logs` final doc |
| AC-10 | `GET /api/pos/customers/{id}/documents` for migrated customer | Returns migrated docs with presigned URLs |

---

## Test credentials

| Tenant | Email | Password | Why use |
|---|---|---|---|
| Kunafa Mahal (food, 689) | owner@kunafamahal.com | Qplazm@10 | Regression: existing sync unaffected |
| Palm House (hotel, 558) | owner@palmhouse.com | Qplazm@10 | AC-1: real booking_documents expected |
| Jeh's Nest (hotel, 635) | owner@jehsnest.com | Qplazm@10 | AC-1 alternate hotel tenant |

---

## Known pre-existing issue (NOT caused by CR-075)

**POS API timeout on large responses** — the customer-migration endpoint sometimes returns a `ReadTimeout` at `customers.py:296` (the existing POS API POST call with `timeout=60.0`). This is the same call that existed before CR-075. CR-075 code runs AFTER this call completes successfully.

**Impact on QA**: if sync times out, retry. The 64-customer payload for restaurant_478 timed out once in testing. Smaller tenants (palmhouse, jehsnest) should succeed.

**Not a CR-075 bug** — the CR-075 code (lines ~535+) never executed because the POS API call at line 296 timed out before the customer loop began.

---

## Regression check

| Check | How | Expected |
|---|---|---|
| CR-072 live POS upload still works | `POST /api/pos/customers/{id}/documents` with real file | 200, new row in `customer_documents` with `uploaded_by="pos"` |
| Existing customer sync (non-hotel) | Trigger sync as Kunafa Mahal | Completes, customer names/GST unchanged, `docs_migrated=0` |
| Per-doc-type cap still enforced for live POS uploads | `routers/pos.py:2198` — NOT modified | Prune logic intact |

---

## How to trigger sync for QA

```bash
# 1. Login to get tokens
curl -s -X POST https://{pod_url}/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@palmhouse.com","password":"Qplazm@10"}' \
  -o /tmp/login.json

python3 -c "
import json
d = json.load(open('/tmp/login.json'))
open('/tmp/crm_tok.txt','w').write(d['access_token'])
open('/tmp/mg_tok.txt','w').write(d['mygenie_token'])
print('tokens saved')
"

# 2. Trigger sync
curl -s -X POST https://{pod_url}/api/customers/sync-from-mygenie \
  -H "Authorization: Bearer $(cat /tmp/crm_tok.txt)" \
  -H "X-MyGenie-Token: $(cat /tmp/mg_tok.txt)"

# 3. Poll until completed
curl -s https://{pod_url}/api/customers/sync-status \
  -H "Authorization: Bearer $(cat /tmp/crm_tok.txt)"
```

---

## Files changed

| File | Change |
|---|---|
| `routers/customers.py` | +115 LOC. All changes marked `# CR-075`. |
| `tests/test_cr075_doc_migration.py` | NEW — integration test, 3 runs, all PASS |
