# CR-027: Hardcoded Config → Environment Variables — Implementation Plan

## Change Request ID: CR-027
## Date: 2026-06-18
## Status: 🔵 Planning Complete
## Owner Decision: ALL 22 variables must read from `.env`. Zero hardcoding.

---

## PART 1 — Wire All 22 Variables to `.env` (Zero Hardcoding)

### Objective

Every config value must come from `/app/backend/.env`. No fallback defaults in code. If a variable is missing from `.env`, the backend should fail-fast on startup (for critical vars) or at call time (for feature-specific vars).

---

### 1.1 — `.env` File: Add All 22 Missing Variables

```env
# --- Already present ---
# MONGO_URL=mongodb://mygenie_admin:...
# DB_NAME=mygenie
# CORS_ORIGINS=*

# --- MyGenie POS Integration ---
MYGENIE_API_URL=https://preprod.mygenie.online
MYGENIE_LOGIN_ENDPOINT=/api/v1/auth/vendoremployee/login
MYGENIE_PROFILE_ENDPOINT=/api/v1/vendoremployee/profile
MYGENIE_CRM_TOKEN_ENDPOINT=/api/v1/auth/restaurant-crm-token

# --- AuthKey (WhatsApp Provider) ---
AUTHKEY_API_URL=https://console.authkey.io/restapi/requestjson.php
AUTHKEY_TEMPLATES_URL=https://console.authkey.io/restapi/getAllTemplate.php
AUTHKEY_SYNC_URL=https://console.authkey.io/restapi/wptemplateMigration.php
AUTHKEY_WEBHOOK_SECRET=

# --- Meta WhatsApp Business API ---
META_GRAPH_API_URL=https://graph.facebook.com/v21.0

# --- Security ---
JWT_SECRET=dinepoints-secret-key-2024

# --- External URLs ---
FRONTEND_URL=https://cc511585-de01-49af-9a9b-3d577b5c408b.preview.emergentagent.com
CRM_EXTERNAL_URL=https://cc511585-de01-49af-9a9b-3d577b5c408b.preview.emergentagent.com
REACT_APP_BACKEND_URL=https://cc511585-de01-49af-9a9b-3d577b5c408b.preview.emergentagent.com

# --- Campaign Scheduler ---
CAMPAIGN_SCHEDULER_ENABLED=false
CAMPAIGN_TIMEZONE=Asia/Kolkata

# --- POS Request Logging ---
POS_REQUEST_LOGGING_ENABLED=false
POS_REQUEST_LOGGING_PATH_PREFIX=/api/pos
POS_REQUEST_LOGGING_BODY_MAX_BYTES=50000
POS_REQUEST_LOGGING_TTL_DAYS=30
POS_REQUEST_LOGGING_CAPTURE_RESPONSE_BODY=true
POS_REQUEST_LOGGING_MASK_HEADERS=authorization,x-api-key,cookie
POS_REQUEST_LOGGING_MASK_BODY_FIELDS=token,api_key,crm_token,password,secret,access_token,refresh_token
POS_REQUEST_LOGGING_SAMPLE_RATE=1.0
```

---

### 1.2 — Code Changes: File-by-File

#### File 1: `core/auth.py` (Line 11)

| # | Var | Before | After |
|---|---|---|---|
| 13 | `JWT_SECRET` | `os.environ.get('JWT_SECRET', 'dinepoints-secret-key-2024')` | `os.environ['JWT_SECRET']` |

---

#### File 2: `routers/auth.py` (Lines 38, 69-71, 423-425)

| # | Var | Line | Before | After |
|---|---|---|---|---|
| 15 | `CRM_EXTERNAL_URL` | 38 | `os.environ.get("CRM_EXTERNAL_URL", "")` | `os.environ.get("CRM_EXTERNAL_URL")` |
| 7 | `MYGENIE_CRM_TOKEN_ENDPOINT` | 69-71 | `os.getenv("MYGENIE_CRM_TOKEN_ENDPOINT", "/api/v1/auth/restaurant-crm-token")` | `os.environ['MYGENIE_CRM_TOKEN_ENDPOINT']` |
| 4 | `MYGENIE_API_URL` | 423 | `os.getenv("MYGENIE_API_URL", "https://preprod.mygenie.online")` | `os.environ['MYGENIE_API_URL']` |
| 5 | `MYGENIE_LOGIN_ENDPOINT` | 424 | `os.getenv("MYGENIE_LOGIN_ENDPOINT", "/api/v1/auth/vendoremployee/login")` | `os.environ['MYGENIE_LOGIN_ENDPOINT']` |
| 6 | `MYGENIE_PROFILE_ENDPOINT` | 425 | `os.getenv("MYGENIE_PROFILE_ENDPOINT", "/api/v1/vendoremployee/profile")` | `os.environ['MYGENIE_PROFILE_ENDPOINT']` |

---

#### File 3: `routers/customers.py` (Lines 49, 530, 1098, 1164)

| # | Var | Line | Before | After |
|---|---|---|---|---|
| 4 | `MYGENIE_API_URL` | 49 | `os.getenv("MYGENIE_API_URL", "https://preprod.mygenie.online")` | `os.environ['MYGENIE_API_URL']` |
| 4 | `MYGENIE_API_URL` | 530 | `os.getenv("MYGENIE_API_URL", "https://preprod.mygenie.online")` | `os.environ['MYGENIE_API_URL']` |
| 4 | `MYGENIE_API_URL` | 1098 | `os.getenv("MYGENIE_API_URL", "https://preprod.mygenie.online")` | `os.environ['MYGENIE_API_URL']` |
| 14 | `FRONTEND_URL` | 1164 | `os.environ.get('FRONTEND_URL', 'https://crm-variable-mapping.preview.emergentagent.com')` | `os.environ['FRONTEND_URL']` |

---

#### File 4: `routers/migration.py` (Line 45)

| # | Var | Line | Before | After |
|---|---|---|---|---|
| 4 | `MYGENIE_API_URL` | 45 | `os.getenv("MYGENIE_API_URL", "https://preprod.mygenie.online")` | `os.environ['MYGENIE_API_URL']` |

---

#### File 5: `routers/menu.py` (Line 16)

| # | Var | Line | Before | After |
|---|---|---|---|---|
| 4 | `MYGENIE_API_URL` | 16 | `os.getenv("MYGENIE_API_URL", "https://preprod.mygenie.online")` | `os.environ['MYGENIE_API_URL']` |

---

#### File 6: `core/whatsapp.py` (Line 15)

| # | Var | Line | Before | After |
|---|---|---|---|---|
| 8 | `AUTHKEY_API_URL` | 15 | `AUTHKEY_API_URL = "https://console.authkey.io/restapi/requestjson.php"` | `AUTHKEY_API_URL = os.environ['AUTHKEY_API_URL']` |

Note: `import os` must be added at top of this file.

---

#### File 7: `routers/whatsapp.py` (Lines 144, 318, 362, 532, 641, 1154, 1274)

| # | Var | Line | Before | After |
|---|---|---|---|---|
| 9 | `AUTHKEY_TEMPLATES_URL` | 144 | `"https://console.authkey.io/restapi/getAllTemplate.php"` | `os.environ['AUTHKEY_TEMPLATES_URL']` |
| 12 | `META_GRAPH_API_URL` | 318 | `f"https://graph.facebook.com/v21.0/{meta_tid}"` | `f"{os.environ['META_GRAPH_API_URL']}/{meta_tid}"` |
| 12 | `META_GRAPH_API_URL` | 362 | `f"https://graph.facebook.com/v21.0/{waba_id}/message_templates"` | `f"{os.environ['META_GRAPH_API_URL']}/{waba_id}/message_templates"` |
| 12 | `META_GRAPH_API_URL` | 532 | `f"https://graph.facebook.com/v21.0/{waba_id}/message_templates"` | `f"{os.environ['META_GRAPH_API_URL']}/{waba_id}/message_templates"` |
| 10 | `AUTHKEY_SYNC_URL` | 641 | `authkey_url = "https://console.authkey.io/restapi/wptemplateMigration.php"` | `authkey_url = os.environ['AUTHKEY_SYNC_URL']` |
| 9 | `AUTHKEY_TEMPLATES_URL` | 1154 | `"https://console.authkey.io/restapi/getAllTemplate.php"` | `os.environ['AUTHKEY_TEMPLATES_URL']` |
| 11 | `AUTHKEY_WEBHOOK_SECRET` | 1274 | `os.environ.get("AUTHKEY_WEBHOOK_SECRET")` | No change needed (already reads env, no fallback) |

---

#### File 8: `core/campaign_jobs.py` (Lines 20, 31)

| # | Var | Line | Before | After |
|---|---|---|---|---|
| 18 | `CAMPAIGN_TIMEZONE` | 20 | `os.getenv("CAMPAIGN_TIMEZONE", "Asia/Kolkata")` | `os.environ['CAMPAIGN_TIMEZONE']` |
| 17 | `CAMPAIGN_SCHEDULER_ENABLED` | 31 | `os.getenv("CAMPAIGN_SCHEDULER_ENABLED", "false")` | `os.environ.get("CAMPAIGN_SCHEDULER_ENABLED", "false")` → reads from `.env` now, keep `"false"` as safety only |

**Owner decision needed**: Should `CAMPAIGN_SCHEDULER_ENABLED` crash if missing, or default to `false` as a safety gate? Since accidentally enabling campaign auto-fire is dangerous, recommend keeping `false` fallback.

---

#### File 9: `core/pos_request_logger.py` (Lines 50-63)

| # | Var | Line | Before | After |
|---|---|---|---|---|
| 19 | `POS_REQUEST_LOGGING_ENABLED` | 50 | `_bool("...", "false")` | `_bool("...", "false")` → values now in `.env`, fallback is safety net |
| 20 | `POS_REQUEST_LOGGING_PATH_PREFIX` | 51 | `os.getenv("...", "/api/pos")` | `os.environ['POS_REQUEST_LOGGING_PATH_PREFIX']` |
| 21 | `POS_REQUEST_LOGGING_BODY_MAX_BYTES` | 52 | `os.getenv("...", "50000")` | `os.environ['POS_REQUEST_LOGGING_BODY_MAX_BYTES']` |
| 22 | `POS_REQUEST_LOGGING_TTL_DAYS` | 53 | `os.getenv("...", "30")` | `os.environ['POS_REQUEST_LOGGING_TTL_DAYS']` |
| 23 | `POS_REQUEST_LOGGING_CAPTURE_RESPONSE_BODY` | 54 | `_bool("...", "true")` | `_bool("...", "true")` → values now in `.env`, fallback is safety net |
| 24 | `POS_REQUEST_LOGGING_MASK_HEADERS` | 56 | `os.getenv("...", "authorization,...")` | `os.environ['POS_REQUEST_LOGGING_MASK_HEADERS']` |
| 25 | `POS_REQUEST_LOGGING_MASK_BODY_FIELDS` | 60 | `os.getenv("...", "token,api_key,...")` | `os.environ['POS_REQUEST_LOGGING_MASK_BODY_FIELDS']` |
| 26 | `POS_REQUEST_LOGGING_SAMPLE_RATE` | 63 | `os.getenv("...", "1.0")` | `os.environ['POS_REQUEST_LOGGING_SAMPLE_RATE']` |

---

#### File 10: `server.py` (Line 155)

| # | Var | Line | Before | After |
|---|---|---|---|---|
| 3 | `CORS_ORIGINS` | 155 | `os.environ.get('CORS_ORIGINS', '*').split(',')` | `os.environ['CORS_ORIGINS'].split(',')` |

---

#### File 11: `routers/pos.py` (Line 1519)

| # | Var | Line | Before | After |
|---|---|---|---|---|
| 15/16 | `CRM_EXTERNAL_URL` | 1519 | `os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("CRM_EXTERNAL_URL", "")` | `os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("CRM_EXTERNAL_URL")` |

---

### 1.3 — Execution Order

```
Step 1:  Add all 22 vars to /app/backend/.env
Step 2:  Modify 11 files (parallel edits where independent)
Step 3:  sudo supervisorctl restart backend
Step 4:  Validate: health check + backend logs + login test
Step 5:  Grep audit: confirm zero remaining hardcoded values
```

### 1.4 — Validation

```bash
# Must return 0 results (excluding tests/scripts):
grep -rn "preprod.mygenie\|console.authkey.io\|graph.facebook.com\|dinepoints-secret\|crm-variable-mapping" \
  /app/backend/ --include="*.py" | grep -v __pycache__ | grep -v /tests/ | grep -v /scripts/
```

---

### 1.5 — Total Change Summary

| Metric | Count |
|---|---|
| Variables moved to `.env` | 22 |
| Files modified | 11 |
| Lines changed | ~35 |
| New lines in `.env` | 22 |
| Risk | Low (same values, just moved to env) |

---

**End of Part 1 — Awaiting owner approval to implement, or Part 2 instructions.**
