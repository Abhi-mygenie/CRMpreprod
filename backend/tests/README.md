# Backend Tests — CR-2026-09-12-005

Backend API contract snapshot suite + behavioural smoke flows.
Phase 1: runs locally against the live pod backend.  
Phase 2 (CR-2026-09-12-015): runs in GitHub Actions CI on every PR.

---

## Quick start

```bash
# Run everything
cd /app && pytest backend/tests/ -v

# Contract snapshots only
cd /app && pytest -m contract backend/tests/ -v

# Smoke flows only
cd /app && pytest -m smoke backend/tests/ -v
```

---

## First run — generate snapshots

On the very first run, snapshots don't exist yet. Run with `--snapshot-update`
and `-n 0` (serial, avoids xdist write conflicts during generation):

```bash
cd /app && pytest -m contract -n 0 --snapshot-update backend/tests/
```

This creates snapshot files under each test directory:
```
backend/tests/contracts/__snapshots__/test_public_config.json
backend/tests/contracts/__snapshots__/test_dietary.json
backend/tests/contracts/__snapshots__/test_utility.json
```

Commit these files to git. They are reviewed like code in PRs.

---

## After an intentional API change

If you intentionally change an API response shape (e.g. add a new field),
regenerate the affected snapshot:

```bash
cd /app && pytest -m contract -n 0 --snapshot-update backend/tests/contracts/test_public_config.py
```

Review the diff (`git diff`) — make sure only the intended keys changed.
Commit the updated snapshot file.

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `TEST_BASE_URL` | `http://localhost:8001` | Backend URL to test against |
| `TEST_ADMIN_PHONE` | `owner@18march.com` | Admin login identifier |
| `TEST_ADMIN_PASS` | `Qplazm@10` | Admin password |
| `TEST_PHONE` | `9579504871` | Customer phone for OTP smoke |
| `TEST_RESTAURANT_ID` | `478` | Primary test restaurant ID |

See `memory/test_credentials.md` for the credential source of truth.

---

## What the tests cover

### Contract snapshots (`-m contract`)

| Test | Endpoint | What it freezes |
|---|---|---|
| test_api_root | `GET /api/` | Welcome message shape |
| test_healthz | `GET /api/healthz` | `ok=True`, `mongo=up` |
| test_config_478 | `GET /api/config/478` | Full restaurant config (100+ keys) |
| test_config_716 | `GET /api/config/716` | Multi-menu variant |
| test_config_nonexistent_defaults | `GET /api/config/9999` | Defaults-in-code fallback |
| test_loyalty_settings_478 | `GET /api/loyalty-settings/478` | Loyalty tier config |
| test_customer_lookup_478 | `GET /api/customer-lookup/478` | Check-customer response shape |
| test_config_feedback_478 | `GET /api/config/feedback/478` | Feedback listing shape |
| test_status_list | `GET /api/status` | Status item shape |
| test_dietary_tags_available | `GET /api/dietary-tags/available` | Tag list shape |
| test_dietary_tags_478 | `GET /api/dietary-tags/478` | Per-restaurant dietary tags |
| test_table_config_requires_auth | `GET /api/table-config` (no header) | 401 error envelope |
| test_docs_bug_tracker | `GET /api/docs/bug-tracker` | Docs response shape |
| test_upload_serve_content_type | `GET /api/uploads/<file>` | Content-Type + non-empty body |

### Smoke flows (`-m smoke`)

| Test | What it proves |
|---|---|
| test_smoke_otp_echo_present | OTP echo exists (will fail when CR-003 ships) |
| test_smoke_admin_login_jwt | Admin login returns valid JWT |
| test_smoke_auth_me | Authenticated /me returns user profile |
| test_smoke_pos_auth_token | POS proxy responds 200 or 502 |
| test_smoke_config_put_get_round_trip | Config PUT is reflected in GET |
| test_smoke_auth_me_no_token | Unauthenticated /me → 401 |
| test_smoke_auth_me_bad_token | Invalid JWT → 401 |
| test_smoke_upload_round_trip | Image upload + serve byte-perfect |

---

## Rollback

All test files are additive — no `server.py` changes.
`git revert <commit>` removes them with zero runtime impact.
