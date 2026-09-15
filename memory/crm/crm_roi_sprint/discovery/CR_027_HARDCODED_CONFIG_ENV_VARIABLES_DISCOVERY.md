# CR-027: Hardcoded Config → Environment Variables

## Change Request ID: CR-027
## Date: 2026-06-18
## Status: 🔵 Discovery Complete — Ready to Implement
## Priority: P1 (blocks production deployment)
## Effort: ~½ day

---

## Summary

Investigation of the CRM token push-back flow (CR-001) revealed that the MyGenie POS base URL and 3 endpoint paths are hardcoded as `os.getenv()` fallback defaults rather than being set in `.env`. A full codebase sweep found **11 total hardcoded values across 6 backend files** that should be environment-driven.

**Risk**: These hardcoded values point to `preprod.mygenie.online` and old preview URLs. Deploying to production without moving them to `.env` means the app will silently call preprod services from prod.

---

## Investigation Trigger

Owner asked: *"Is the POS CRM token push URL in env?"* — answer was **no**, it's a hardcoded fallback. Owner then requested a full audit of all hardcoded values.

---

## Complete Audit — 11 Hardcoded Values

### Category 1: MyGenie POS URLs & Endpoints (4 values, 6 files)

| # | Env Variable | Hardcoded Default | Files | Lines |
|---|---|---|---|---|
| 1 | `MYGENIE_API_URL` | `https://preprod.mygenie.online` | `routers/auth.py`, `routers/customers.py` (×3), `routers/migration.py`, `routers/menu.py` | auth:423, cust:49,530,1098, mig:45, menu:16 |
| 2 | `MYGENIE_LOGIN_ENDPOINT` | `/api/v1/auth/vendoremployee/login` | `routers/auth.py` | 424 |
| 3 | `MYGENIE_PROFILE_ENDPOINT` | `/api/v1/vendoremployee/profile` | `routers/auth.py` | 425 |
| 4 | `MYGENIE_CRM_TOKEN_ENDPOINT` | `/api/v1/auth/restaurant-crm-token` | `routers/auth.py` | 69-71 |

**Impact**: All MyGenie POS communication (login, profile fetch, CRM token push, customer sync, migration) uses these. Wrong URL = CRM cannot authenticate anyone.

### Category 2: AuthKey (WhatsApp Provider) URLs (3 values, 2 files)

| # | Env Variable | Hardcoded Default | Files | Lines |
|---|---|---|---|---|
| 5 | `AUTHKEY_API_URL` | `https://console.authkey.io/restapi/requestjson.php` | `core/whatsapp.py` | 15 |
| 6 | `AUTHKEY_TEMPLATES_URL` | `https://console.authkey.io/restapi/getAllTemplate.php` | `routers/whatsapp.py` | 144, 1154 |
| 7 | `AUTHKEY_SYNC_URL` | `https://console.authkey.io/restapi/wptemplateMigration.php` | `routers/whatsapp.py` | 641 |

**Impact**: All WhatsApp messaging flows. Wrong URL = zero WhatsApp delivery.

### Category 3: Meta / Facebook Graph API (1 value, 1 file)

| # | Env Variable | Hardcoded Default | Files | Lines |
|---|---|---|---|---|
| 8 | `META_GRAPH_API_URL` | `https://graph.facebook.com/v21.0` | `routers/whatsapp.py` | 318, 362, 532 |

**Impact**: Template submission to Meta WhatsApp Business API. API version `v21.0` will eventually be deprecated — must be upgradable via env.

### Category 4: Secrets (1 value, 1 file)

| # | Env Variable | Hardcoded Default | Files | Lines |
|---|---|---|---|---|
| 9 | `JWT_SECRET` | `dinepoints-secret-key-2024` | `core/auth.py` | 11 |

**Impact**: **CRITICAL SECURITY**. Anyone who reads the source code knows the JWT signing key. Can forge admin tokens. Must be a real secret in `.env` with no hardcoded fallback.

### Category 5: External-Facing URLs (2 values, 3 files)

| # | Env Variable | Hardcoded Default | Files | Lines |
|---|---|---|---|---|
| 10 | `FRONTEND_URL` | `https://crm-variable-mapping.preview.emergentagent.com` | `routers/customers.py` | 1164 |
| 11 | `CRM_EXTERNAL_URL` | `""` (empty) | `routers/auth.py`:38, `routers/pos.py`:1519 | Used for `pos_config.api_base_url` and invoice links |

**Impact**: QR code registration links and POS config URLs will point to wrong domain in production.

---

## Already Properly Env-Driven (No Action Needed)

| Variable | Status |
|---|---|
| `MONGO_URL`, `DB_NAME` | ✅ In `.env`, no fallback |
| `CORS_ORIGINS` | ✅ In `.env`, safe `*` default |
| `CAMPAIGN_SCHEDULER_ENABLED` | ✅ Env-gated, safe `false` default |
| `CAMPAIGN_TIMEZONE` | ✅ Env-driven, `Asia/Kolkata` default acceptable |
| `POS_REQUEST_LOGGING_*` (7 vars) | ✅ All env-driven |
| `AUTHKEY_WEBHOOK_SECRET` | ✅ Reads from env (no hardcoded fallback) |

---

## Implementation Plan

### Phase 1: Add to `.env`

Add all 11 values to `/app/backend/.env`:

```env
# MyGenie POS Integration
MYGENIE_API_URL=https://preprod.mygenie.online
MYGENIE_LOGIN_ENDPOINT=/api/v1/auth/vendoremployee/login
MYGENIE_PROFILE_ENDPOINT=/api/v1/vendoremployee/profile
MYGENIE_CRM_TOKEN_ENDPOINT=/api/v1/auth/restaurant-crm-token

# AuthKey (WhatsApp Provider)
AUTHKEY_API_URL=https://console.authkey.io/restapi/requestjson.php
AUTHKEY_TEMPLATES_URL=https://console.authkey.io/restapi/getAllTemplate.php
AUTHKEY_SYNC_URL=https://console.authkey.io/restapi/wptemplateMigration.php

# Meta WhatsApp Business API
META_GRAPH_API_URL=https://graph.facebook.com/v21.0

# Security
JWT_SECRET=<generate-strong-secret>

# External URLs
FRONTEND_URL=https://crm-variable-mapping.preview.emergentagent.com
CRM_EXTERNAL_URL=https://crm-variable-mapping.preview.emergentagent.com
```

### Phase 2: Remove hardcoded fallbacks from code

Change all `os.getenv("X", "hardcoded_value")` to `os.environ["X"]` (fail-fast if missing) or `os.getenv("X")` where optional.

**Fail-fast (must crash if missing)**:
- `JWT_SECRET` — security critical
- `MYGENIE_API_URL` — login breaks without it

**Warn-and-continue (operational but degraded)**:
- `FRONTEND_URL` — only affects QR code links
- `CRM_EXTERNAL_URL` — only affects pos_config response

### Files to Modify

| File | Changes |
|---|---|
| `core/auth.py` | Line 11: remove `'dinepoints-secret-key-2024'` fallback |
| `routers/auth.py` | Lines 38, 69-71, 423-425: remove all hardcoded defaults |
| `routers/customers.py` | Lines 49, 530, 1098, 1164: remove fallback URLs |
| `routers/migration.py` | Line 45: remove fallback URL |
| `routers/menu.py` | Line 16: remove fallback URL |
| `core/whatsapp.py` | Line 15: read from env instead of hardcoded constant |
| `routers/whatsapp.py` | Lines 144, 318, 362, 532, 641, 1154: read from env |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Missing `.env` key → crash on startup | P0 — login fails | Fail-fast is intentional. `.env.example` documents all required keys. |
| Wrong URL in `.env` | P0 — silent failure | Health check should validate connectivity on startup (future CR) |
| JWT_SECRET exposed in `.env` file | Low (file is gitignored) | `.env` is already in `.gitignore`. Production should use secrets manager. |

---

## Validation Steps

1. After implementation: `sudo supervisorctl restart backend` → check logs for clean startup
2. `curl /api/health` → healthy
3. Login with test credentials → verify MyGenie SSO works
4. Check backend logs for CR-001 token push → should show success
5. Grep codebase for remaining hardcoded URLs: `grep -rn "preprod.mygenie\|console.authkey\|graph.facebook\|dinepoints-secret" /app/backend/ --include="*.py" | grep -v test | grep -v __pycache__` → should return 0 results

---

## Owner Questions

None — this is a hygiene/security CR. All values are known and already in use as hardcoded defaults. Moving them to `.env` is purely a config management improvement.

---

**End of CR-027 Discovery**
