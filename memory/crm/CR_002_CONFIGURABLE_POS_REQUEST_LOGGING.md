# CR-002 — Configurable POS Request Logging

> **Branch:** `main` (`/app`)
> **Date:** 2026-05-21
> **Author:** Senior CRM Backend Logging CR Planning Agent
> **Status:** PLAN ONLY — no code, env, or DB changes performed.
> **Predecessor:** CR-001 (CRM→POS `crm_token` push) — IMPLEMENTED
> **Trigger:** Investigation report `CRM_POS_ORDER_WEBHOOK_INVESTIGATION_REPORT.md` §10 (Runtime Test Plan) and §11 Q4 — CRM has no way to retrospectively show what payload POS sent for a failed order.

---

## 1. Problem

Today the CRM (`/app/backend`) has **no persistent record** of what an inbound POS call to `/api/pos/*` looked like, except for what the route handler chooses to write (e.g., `orders` insert on success).

Evidence collected during the CR-002 investigation phase:

| What CRM has today | Coverage | Gap |
|---|---|---|
| Uvicorn HTTP access log (`/var/log/supervisor/backend.out.log`) | Status code + path only — e.g., `POST /api/pos/orders HTTP/1.1" 200 OK` | No headers, no request body, no response body, ephemeral (rotates) |
| `db.pos_event_logs` collection | Only written by `routers/pos.py:1800` (the `/api/pos/events` WhatsApp event endpoint) and `routers/scan.py:859,877` (customer scan/QR flows). **Not written by `/api/pos/orders`.** Currently 0 documents in DB. | Does not cover order webhook |
| `whatsapp_message_logs` / `cron_job_logs` | Side-effect logs only | Not relevant to inbound POS calls |
| `cr001_logger` (named logger in `routers/auth.py`) | Outbound CR-001 push to MyGenie only | Not inbound |
| `logging.basicConfig` in `server.py:75` | Defined but **no log statements exist inside `pos_order_webhook`** or any other `/api/pos/*` route | No useful log lines |

**Consequence for the current investigation:** when restaurants `739`, `760`, and `475` (after 2026-05-14) appear to have stopped sending orders, CRM cannot tell us whether:
- POS hit `/api/pos/orders` and got a `200 + success:false` business rejection (e.g., wrong `pos_id`),
- POS hit `/api/pos/orders` and got a `401` because the header was wrong,
- POS hit `/api/pos/orders` but the payload failed Pydantic schema validation (`422`),
- POS hit the deprecated `/api/pos/webhook/payment-received` and got `200 success:true` but no `orders` row was written,
- POS hit a wrong URL and got `404`,
- POS never called CRM at all.

All five scenarios are observationally identical from the CRM side today.

---

## 2. Objective

Add an **optional, configurable middleware** that persists every inbound `/api/pos/*` request and its response to a new MongoDB collection `pos_request_logs`, with:

- env-flag-controlled on/off,
- env-controlled path prefix,
- size limits,
- header masking,
- TTL retention,
- **zero behavior change** to existing APIs (auth, schemas, write paths),
- **zero risk** of breaking the original request if logging itself fails.

Outcome: when POS reports "we sent an order but it's not showing in CRM," an operator can query `pos_request_logs` by `matched_restaurant_id` + time window and see the exact request + response that CRM observed, **without depending on POS-side logs**.

---

## 3. In Scope

- New FastAPI middleware (Starlette `BaseHTTPMiddleware`) wired into `server.py` after `CORSMiddleware`.
- Captures: timestamp, method, path, query params, source IP, masked headers, request body (truncated), response status, response body (truncated, optional via env), processing duration, resolved `user_id` / `restaurant_id` when auth succeeded.
- Writes async, fire-and-forget, to new Mongo collection `pos_request_logs`.
- TTL index on `pos_request_logs.created_at` for automatic expiry.
- All behavior gated by env vars (default OFF — no surprise activation in production).
- Masks `Authorization`, `X-API-Key`, `Cookie`, and best-effort body fields named `token`, `api_key`, `crm_token`, `password`, `secret`.
- Covers all status codes (200, 401, 404, 422, 500) for paths matching the prefix.

## 4. Out of Scope

- ❌ CRM admin/dashboard UI to browse logs (separate CR if needed).
- ❌ POS-side logging (cannot be done from CRM repo).
- ❌ Any change to `/api/pos/orders`, `/api/pos/webhook/payment-received`, or any existing route behavior.
- ❌ Any change to `verify_pos_auth`, `get_current_user`, or token handling.
- ❌ Any change to existing payload contracts (`POSOrderWebhook`, `POSPaymentWebhook`, `POSEventWebhook`, etc.).
- ❌ Fixing the actual order-sync issues identified in `CRM_POS_ORDER_WEBHOOK_INVESTIGATION_REPORT.md` — this CR is purely observability.
- ❌ Outbound logging (CRM → MyGenie calls remain on the existing `cr001_logger`).
- ❌ Migration of existing `pos_event_logs` collection.
- ❌ Real-time alerting / Slack / email on failures.
- ❌ Streaming-response support (current `/api/pos/*` endpoints all return JSON, not streams).

---

## 5. Proposed Env Config

All env vars are **read at middleware construction time** (lifespan startup), not per-request. A snapshot is held in memory; restart required to change them. Defaults are chosen to be safe even if someone enables the flag in production by mistake.

| Env Var | Default | Type | Purpose |
|---|---|---|---|
| `POS_REQUEST_LOGGING_ENABLED` | `false` | bool (`"true"`/`"false"`, case-insensitive) | **Master switch.** When `false`, middleware is a no-op (early `return await call_next(request)`). |
| `POS_REQUEST_LOGGING_PATH_PREFIX` | `/api/pos` | string | Only requests whose `path` starts with this value are considered. Allows narrowing to `/api/pos/orders` if desired. |
| `POS_REQUEST_LOGGING_BODY_MAX_BYTES` | `50000` | int | Hard cap on `request_body` and `response_body` sizes persisted to Mongo. Beyond this, truncate and set `*_truncated: true`. Prevents huge `items[]` arrays from blowing storage. |
| `POS_REQUEST_LOGGING_TTL_DAYS` | `30` | int | TTL on `pos_request_logs.created_at`. Background `mongod` thread deletes expired docs. `0` disables TTL creation. |
| `POS_REQUEST_LOGGING_CAPTURE_RESPONSE_BODY` | `true` | bool | When `false`, `response_body` is omitted (status code + duration still logged). Useful in prod if storage growth is a concern. |
| `POS_REQUEST_LOGGING_MASK_HEADERS` | `authorization,x-api-key,cookie` | comma-separated string | Headers whose values are replaced with masked form. Lowercased before comparison. |
| `POS_REQUEST_LOGGING_MASK_BODY_FIELDS` | `token,api_key,crm_token,password,secret,access_token,refresh_token` | comma-separated string | Top-level **and recursive** JSON keys whose values are masked. Case-insensitive key match. |
| `POS_REQUEST_LOGGING_SAMPLE_RATE` | `1.0` | float (0.0 – 1.0) | Probabilistic sampling. `1.0` = log every match. `0.1` = 10%. Useful for high-volume production. Sampled OUT requests pass through with zero overhead beyond the random draw. |

Where read: helper function `_load_pos_logging_config()` in the new module, invoked once during FastAPI `lifespan` startup (`server.py:14`) and the resulting dict attached to `app.state.pos_logging_config`. The middleware reads from `request.app.state` per-call.

---

## 6. Proposed Mongo Collection

### Collection
```
pos_request_logs
```

### Document shape (one row per inbound request)

```json
{
  "id": "5f7a2c3b-…-uuid",                       // app-generated UUID (not _id)
  "timestamp": "2026-05-21T06:55:40.841073+00:00", // ISO-8601 UTC, request start
  "method": "POST",
  "path": "/api/pos/orders",
  "query_params": {},                            // {} when none
  "source_ip": "10.79.129.133",                  // x-forwarded-for first hop if present, else request.client.host
  "user_agent": "MyGenie-POS/1.4.2 httpx/0.27",  // captured for fingerprinting POS versions

  "headers_masked": {
    "content-type": "application/json",
    "x-api-key": "dp_live_U_q***ip2M",
    "authorization": null,
    "accept": "*/*"
  },

  "request_body": { /* parsed JSON if Content-Type=application/json, else string */ },
  "request_body_bytes": 612,
  "request_body_truncated": false,
  "request_body_content_type": "application/json",

  "response_status": 200,
  "response_body": {
    "success": false,
    "message": "Invalid pos_id. Expected: 0001, Received: mygenie",
    "data": null
  },
  "response_body_bytes": 92,
  "response_body_truncated": false,
  "response_body_captured": true,                // false if POS_REQUEST_LOGGING_CAPTURE_RESPONSE_BODY=false

  "duration_ms": 17,

  "matched_user_id": "pos_0001_restaurant_478",  // null if auth failed
  "matched_restaurant_id": "478",                // null if auth failed
  "matched_via_auth": "api_key",                 // "api_key" | "jwt" | null

  "verdict": "business_rejection",               // one of: success | business_rejection | auth_failed
                                                  //         | validation_failed | server_error | unhandled | not_found
                                                  // (derived from response_status + body.success)

  "error": null,                                 // populated only if logging itself failed; original request still served

  "created_at": "2026-05-21T06:55:40.841073+00:00" // TTL anchor field — duplicates timestamp for index clarity
}
```

### Notes on the shape

- `id` is app-generated to avoid leaking BSON `_id` in any future read endpoints (consistent with the rest of the codebase — every other collection uses `id` as the app key and excludes `_id` from API responses).
- `timestamp` is captured at request start; `created_at` is set at write time. They will be within milliseconds of each other; both are kept because `created_at` is the TTL anchor by convention.
- `verdict` is **derived at log-write time** to make Mongo queries simple (e.g., `{matched_restaurant_id: "475", verdict: "business_rejection"}`). The classifier is:
  | response_status | response.body.success | verdict |
  |---|---|---|
  | 2xx | `true` | `success` |
  | 2xx | `false` | `business_rejection` |
  | 401 | n/a | `auth_failed` |
  | 422 | n/a | `validation_failed` |
  | 404 | n/a | `not_found` |
  | 5xx | n/a | `server_error` |
  | anything else | n/a | `unhandled` |
- For non-JSON bodies (e.g., a POS misconfigured to send `application/x-www-form-urlencoded`), `request_body` is stored as a string up to `BODY_MAX_BYTES`.

### Indexes proposed (created lazily in `lifespan` startup, only if `POS_REQUEST_LOGGING_ENABLED=true`)

| Index | Purpose | Type |
|---|---|---|
| `{ created_at: 1 }` | TTL — auto-delete after `POS_REQUEST_LOGGING_TTL_DAYS` days | TTL (`expireAfterSeconds`) |
| `{ matched_restaurant_id: 1, created_at: -1 }` | Per-restaurant time-range queries | Compound |
| `{ verdict: 1, created_at: -1 }` | "Show me all rejections in last 24h" | Compound |
| `{ path: 1, created_at: -1 }` | Per-endpoint analysis | Compound |

> Existing `pos_event_logs` has **no indexes** today (only the default `_id_`). This CR does not touch `pos_event_logs`.

---

## 7. Implementation Design

### 7.1 Approach: middleware, not per-route

| Option | Verdict |
|---|---|
| **(A) Starlette `BaseHTTPMiddleware`** wired in `server.py` after CORS | ✅ **Recommended.** Single attach point, automatically covers every current and future `/api/pos/*` route including 404s for typos, and survives across endpoint additions without touching `routers/pos.py`. |
| (B) FastAPI `dependencies=[Depends(log_request)]` per router | ❌ Cannot capture response body cleanly; doesn't run on 404 (route not matched); requires editing every route signature. |
| (C) Decorator on each handler | ❌ Same issues as (B); high coupling; cannot mask auth headers before the handler runs. |
| (D) Uvicorn access-log formatter | ❌ Status code + path only; cannot capture body. |

### 7.2 Proposed file layout

```
/app/backend/
├── core/
│   ├── pos_request_logger.py        # NEW — middleware class + helpers
│   └── ... (existing files untouched)
├── server.py                         # MODIFIED — wire middleware, create TTL index in lifespan
└── ...
```

### 7.3 Pseudocode (illustrative — do not implement until approval)

```python
# core/pos_request_logger.py
import os, json, time, uuid, random, logging, asyncio
from datetime import datetime, timezone
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_log = logging.getLogger("pos_request_logger")


def load_config() -> dict:
    """Read env vars once at startup. Safe defaults — disabled."""
    return {
        "enabled": os.getenv("POS_REQUEST_LOGGING_ENABLED", "false").lower() == "true",
        "path_prefix": os.getenv("POS_REQUEST_LOGGING_PATH_PREFIX", "/api/pos"),
        "body_max_bytes": int(os.getenv("POS_REQUEST_LOGGING_BODY_MAX_BYTES", "50000")),
        "ttl_days": int(os.getenv("POS_REQUEST_LOGGING_TTL_DAYS", "30")),
        "capture_response_body": os.getenv("POS_REQUEST_LOGGING_CAPTURE_RESPONSE_BODY", "true").lower() == "true",
        "mask_headers": {h.strip().lower() for h in os.getenv(
            "POS_REQUEST_LOGGING_MASK_HEADERS", "authorization,x-api-key,cookie"
        ).split(",")},
        "mask_body_fields": {f.strip().lower() for f in os.getenv(
            "POS_REQUEST_LOGGING_MASK_BODY_FIELDS",
            "token,api_key,crm_token,password,secret,access_token,refresh_token"
        ).split(",")},
        "sample_rate": float(os.getenv("POS_REQUEST_LOGGING_SAMPLE_RATE", "1.0")),
    }


def mask_value(v: str) -> str:
    """Show first 4 and last 4 chars; replace middle with ***."""
    if not v or not isinstance(v, str):
        return v
    if len(v) <= 12:
        return "***"
    return f"{v[:4]}***{v[-4:]}"


def mask_headers(raw: dict, mask_set: set) -> dict:
    out = {}
    for k, val in raw.items():
        lk = k.lower()
        if lk in mask_set:
            if lk == "cookie":
                out[lk] = "***"   # cookies fully redacted
            elif lk == "authorization":
                # "Bearer xxx" → "Bearer xx***xx" or "<scheme> ***"
                parts = val.split(" ", 1)
                out[lk] = f"{parts[0]} {mask_value(parts[1])}" if len(parts) == 2 else "***"
            else:
                out[lk] = mask_value(val)
        else:
            out[lk] = val
    return out


def mask_body(obj, mask_set: set):
    """Recursively mask values for keys in mask_set. Case-insensitive."""
    if isinstance(obj, dict):
        return {
            k: (mask_value(str(v)) if k.lower() in mask_set else mask_body(v, mask_set))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [mask_body(x, mask_set) for x in obj]
    return obj


class POSRequestLoggingMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, db, config: dict):
        super().__init__(app)
        self.db = db
        self.cfg = config

    async def dispatch(self, request: Request, call_next):
        cfg = self.cfg
        # Fast path: disabled, wrong prefix, or sampled out
        if (not cfg["enabled"]
                or not request.url.path.startswith(cfg["path_prefix"])
                or (cfg["sample_rate"] < 1.0 and random.random() > cfg["sample_rate"])):
            return await call_next(request)

        start = time.perf_counter()
        ts_iso = datetime.now(timezone.utc).isoformat()

        # ---- Read request body (must replay it for downstream handler) ----
        try:
            raw_body = await request.body()
        except Exception:
            raw_body = b""
        # Re-inject body for downstream consumers
        async def receive():
            return {"type": "http.request", "body": raw_body, "more_body": False}
        request = Request(request.scope, receive)

        truncated_req = len(raw_body) > cfg["body_max_bytes"]
        body_for_log = raw_body[: cfg["body_max_bytes"]]
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                parsed_req = json.loads(body_for_log)
                parsed_req = mask_body(parsed_req, cfg["mask_body_fields"])
            except Exception:
                parsed_req = body_for_log.decode("utf-8", errors="replace")
        else:
            parsed_req = body_for_log.decode("utf-8", errors="replace")

        # ---- Run downstream ----
        response: Response = await call_next(request)

        # ---- Read response body (must reconstruct for client) ----
        resp_body = b""
        if cfg["capture_response_body"]:
            async for chunk in response.body_iterator:
                resp_body += chunk
                if len(resp_body) > cfg["body_max_bytes"] * 2:  # safety cap
                    break
            # rebuild response so client still gets data
            response = Response(
                content=resp_body, status_code=response.status_code,
                headers=dict(response.headers), media_type=response.media_type,
            )

        truncated_resp = len(resp_body) > cfg["body_max_bytes"]
        resp_log = resp_body[: cfg["body_max_bytes"]]
        try:
            parsed_resp = json.loads(resp_log) if resp_log else None
            parsed_resp = mask_body(parsed_resp, cfg["mask_body_fields"]) if parsed_resp else None
        except Exception:
            parsed_resp = resp_log.decode("utf-8", errors="replace")

        duration_ms = int((time.perf_counter() - start) * 1000)

        # ---- Classify verdict ----
        status = response.status_code
        body_success = isinstance(parsed_resp, dict) and parsed_resp.get("success")
        if status == 401:
            verdict = "auth_failed"
        elif status == 404:
            verdict = "not_found"
        elif status == 422:
            verdict = "validation_failed"
        elif 500 <= status < 600:
            verdict = "server_error"
        elif 200 <= status < 300:
            verdict = "success" if body_success else (
                "business_rejection" if isinstance(parsed_resp, dict) and "success" in parsed_resp
                else "success"
            )
        else:
            verdict = "unhandled"

        # ---- Best-effort: resolve user/restaurant from auth header ----
        matched_user_id, matched_restaurant_id, matched_via = None, None, None
        try:
            api_key = request.headers.get("x-api-key")
            if api_key:
                u = await self.db.users.find_one(
                    {"api_key": api_key},
                    {"_id": 0, "id": 1, "restaurant_id": 1},
                )
                if u:
                    matched_user_id = u.get("id")
                    matched_restaurant_id = u.get("restaurant_id")
                    matched_via = "api_key"
            # JWT branch could be added similarly using JWT_SECRET decode
        except Exception:
            pass  # auth resolution failure must NEVER affect logging

        # ---- Persist (fire-and-forget; never raise) ----
        doc = {
            "id": str(uuid.uuid4()),
            "timestamp": ts_iso,
            "method": request.method,
            "path": request.url.path,
            "query_params": dict(request.query_params),
            "source_ip": (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
                          or (request.client.host if request.client else None)),
            "user_agent": request.headers.get("user-agent"),
            "headers_masked": mask_headers(dict(request.headers), cfg["mask_headers"]),
            "request_body": parsed_req,
            "request_body_bytes": len(raw_body),
            "request_body_truncated": truncated_req,
            "request_body_content_type": content_type,
            "response_status": status,
            "response_body": parsed_resp if cfg["capture_response_body"] else None,
            "response_body_bytes": len(resp_body),
            "response_body_truncated": truncated_resp,
            "response_body_captured": cfg["capture_response_body"],
            "duration_ms": duration_ms,
            "matched_user_id": matched_user_id,
            "matched_restaurant_id": matched_restaurant_id,
            "matched_via_auth": matched_via,
            "verdict": verdict,
            "error": None,
            "created_at": datetime.now(timezone.utc),  # native datetime so TTL works
        }
        try:
            # detach: do not await write — schedule on event loop
            asyncio.create_task(self._safe_insert(doc))
        except Exception as e:
            _log.warning(f"pos_request_logger schedule failed: {e}")

        return response

    async def _safe_insert(self, doc):
        try:
            await self.db.pos_request_logs.insert_one(doc)
        except Exception as e:
            _log.warning(f"pos_request_logs insert failed: {e}")


async def ensure_pos_request_logs_indexes(db, ttl_days: int):
    """Create TTL + lookup indexes. Idempotent."""
    if ttl_days > 0:
        await db.pos_request_logs.create_index(
            "created_at", expireAfterSeconds=ttl_days * 86400,
            name="ttl_created_at",
        )
    await db.pos_request_logs.create_index(
        [("matched_restaurant_id", 1), ("created_at", -1)],
        name="restaurant_time",
    )
    await db.pos_request_logs.create_index(
        [("verdict", 1), ("created_at", -1)],
        name="verdict_time",
    )
    await db.pos_request_logs.create_index(
        [("path", 1), ("created_at", -1)],
        name="path_time",
    )
```

### 7.4 Wiring in `server.py`

Only two additions (after CR-002 is approved):

```python
# server.py — within lifespan() startup, BEFORE the `yield`
from core.pos_request_logger import (
    POSRequestLoggingMiddleware, load_config, ensure_pos_request_logs_indexes
)
app.state.pos_logging_config = load_config()
if app.state.pos_logging_config["enabled"]:
    await ensure_pos_request_logs_indexes(db, app.state.pos_logging_config["ttl_days"])

# server.py — after `app = FastAPI(...)` and BEFORE `app.add_middleware(CORSMiddleware, ...)`
app.add_middleware(
    POSRequestLoggingMiddleware,
    db=db,
    config=app.state.pos_logging_config,  # read at construction
)
```

> Middleware order is LIFO in Starlette — adding `POSRequestLoggingMiddleware` **before** `CORSMiddleware` in code means it runs **inside** CORS at runtime, which is what we want (capture the real path/body, not the preflight `OPTIONS`).

### 7.5 Crucial FastAPI body-replay caveat

FastAPI/Starlette requests can only be read once. The middleware **must** rebuild the `receive` channel after reading the body, otherwise downstream handlers receive empty payloads. Pseudocode in §7.3 handles this. This is the single highest-risk implementation detail and must be covered by automated tests (§10 cases 9, 10).

### 7.6 Response body capture caveat

`response.body_iterator` consumes the response. The middleware must rebuild a `Response` object with the captured bytes so the client still receives them. If `POS_REQUEST_LOGGING_CAPTURE_RESPONSE_BODY=false`, the body iterator is never consumed and the original response passes through unchanged — zero overhead beyond a status-code peek.

### 7.7 Failure isolation

Every Mongo write, JSON parse, header read, and auth lookup inside the middleware is wrapped in `try/except` and either returns a degraded value or schedules the insert via `asyncio.create_task` (detached). The middleware **must never raise** to the outer Starlette stack. A standalone unit test must assert this.

---

## 8. Sensitive Data Masking

### 8.1 Header masking rules (default set)

| Header | Strategy | Example before → after |
|---|---|---|
| `Authorization` | Preserve scheme, mask credential | `Authorization: Bearer eyJh***ZG10` ← from `Bearer eyJhbGciOiJI...wsZG10` |
| `X-API-Key` | Mask middle, keep prefix `dp_live_` (4 chars) + last 4 | `X-API-Key: dp_l***ip2M` ← from `dp_live_U_qbrMz3qAQgjSZH857oGBbMUzpH4kM2lHxAOHeip2M` |
| `Cookie` | Replace entire value with `***` | `Cookie: ***` |
| Any other header | Stored as-is | `Content-Type: application/json` |

All header keys are lowercased before mask-set comparison, so masking is case-insensitive (`X-Api-Key`, `x-api-key`, `X-API-Key` all hit).

### 8.2 Body masking rules

Applied **recursively** to parsed JSON. Keys (case-insensitive) that are in `POS_REQUEST_LOGGING_MASK_BODY_FIELDS` have their values replaced via `mask_value()` (first 4 + last 4 chars; `***` if ≤12 chars).

Default masked keys:
- `token`, `api_key`, `crm_token`, `password`, `secret`, `access_token`, `refresh_token`

Examples:

```json
// Before
{ "restaurant_id": "475", "crm_token": "dp_live_U_qbrMz3qAQgjSZH857oGBbMUzpH4kM2lHxAOHeip2M" }
// After
{ "restaurant_id": "475", "crm_token": "dp_l***ip2M" }
```

```json
// Nested arrays handled
{ "outer": { "secret": "abcdef123456", "name": "x" } }
// After
{ "outer": { "secret": "abcd***3456", "name": "x" } }
```

### 8.3 What is NOT masked (by design)

- `phone`, `cust_mobile`, `cust_email`, `cust_name` — needed for debugging, already stored in `customers`/`orders`. If GDPR/PDPB constraints apply, add these to the env override at deploy time.
- `pos_id`, `restaurant_id`, `order_id` — primary debugging keys.
- `payment_status`, `payment_method`, `transaction_id` — needed to debug payment-status rejections.

### 8.4 Operator override

Restaurants/operators can extend masking without code change by setting:

```
POS_REQUEST_LOGGING_MASK_BODY_FIELDS=token,api_key,crm_token,password,secret,access_token,refresh_token,phone,email,cust_mobile,cust_email
```

---

## 9. TTL / Retention

### Recommendation

- **Default 30 days** (`POS_REQUEST_LOGGING_TTL_DAYS=30`).
- Implemented via MongoDB TTL index on `pos_request_logs.created_at` with `expireAfterSeconds = ttl_days × 86400`.
- `created_at` is a native `datetime` object (NOT an ISO string) — this is **required** for MongoDB TTL to function. The middleware code uses `datetime.now(timezone.utc)` (not `.isoformat()`) for this field specifically; the human-readable `timestamp` field above remains an ISO string for log readability.
- TTL index is created lazily on startup **only if `POS_REQUEST_LOGGING_ENABLED=true`** and `ttl_days > 0`. If `ttl_days = 0`, index is not created (retain forever — only recommended for short debug windows).
- Mongo's TTL purger runs every 60 seconds; expired docs are deleted in batches. Disk reclamation is not immediate (Mongo's storage engine behavior); this is expected.

### Storage sizing estimate

Assuming worst-case for restaurant `pos_0001_restaurant_475` (peak 68 orders/day × ~6KB per logged request+response = ~400 KB/day):
- 30 days × 400 KB = ~12 MB per restaurant.
- 10 restaurants × 12 MB = ~120 MB cap with default TTL.
- With body truncation at 50 KB per side, hard ceiling per doc is ~110 KB. At 10K req/day across all restaurants that's ~1.1 GB/day → use sample rate or shorten TTL.

### Alternative retention strategies (not chosen, but documented)

| Strategy | Pros | Cons | Verdict |
|---|---|---|---|
| TTL on `created_at` (chosen) | Built-in, zero ops | Mongo deletes on its schedule, not instant | ✅ |
| Per-document `expireAt` field | Per-doc override possible | More complex middleware | ❌ Overkill |
| Capped collection | Fixed size guarantee | No queryable retention; OOM if size mis-set; no index updates allowed | ❌ Wrong tool |
| Cron job purger | Custom logic | Extra moving part | ❌ Mongo TTL is the convention |

---

## 10. QA Plan

All tests run against a live preprod deployment with env flag enabled. Each row asserts both **behavior is unchanged** and **log row is created**.

| # | Test | Setup | Expected request behavior | Expected `pos_request_logs` doc |
|---|---|---|---|---|
| 1 | **Disabled** — `POS_REQUEST_LOGGING_ENABLED=false` | Env false, send valid order to `/api/pos/orders` | HTTP 200, `success:true`, row in `orders` | **0 rows** in `pos_request_logs` |
| 2 | **Success** — Valid `/api/pos/orders` call | Env true, valid X-API-Key, valid payload | HTTP 200, `success:true`, row in `orders` (identical to today) | 1 row, `verdict=success`, `response_status=200`, `matched_restaurant_id="478"`, body masked correctly |
| 3 | **401 Auth failed** — bad X-API-Key | `X-API-Key: bogus` | HTTP 401, `{"detail":"Invalid API key"}` | 1 row, `verdict=auth_failed`, `response_status=401`, `matched_user_id=null`, request body still captured |
| 4 | **422 Validation** — payload missing `order_amount` | Valid key, missing field | HTTP 422, FastAPI validation error body | 1 row, `verdict=validation_failed`, `response_status=422`, request body captured, response body shows pydantic errors |
| 5 | **Business rejection** — `pos_id: "mygenie"` instead of `"0001"` | Valid key, bad pos_id | HTTP 200, `{"success":false,"message":"Invalid pos_id..."}` | 1 row, `verdict=business_rejection`, response body shows rejection message |
| 6 | **404 Wrong URL** — `POST /api/pos/order` (singular typo) | Valid key | HTTP 404 `{"detail":"Not Found"}` | 1 row, `verdict=not_found`, `path="/api/pos/order"`, request body captured |
| 7 | **Large body truncation** | Send order with 5 MB `order_notes` | HTTP 200/422 (depending on pydantic), normal processing | 1 row, `request_body_truncated=true`, `request_body_bytes>50000`, stored body ≤50000 bytes |
| 8 | **Header masking** | Send valid order | HTTP 200 success | `headers_masked["x-api-key"]` matches `dp_l***...4-suffix` pattern, full key NOT present anywhere in doc when stringified |
| 9 | **Body reaches handler** — replay test | Send valid order, then immediately read latest `orders` doc | `orders.order_amount == sent value`, all fields persisted correctly | 1 row, but critical assertion is that the **downstream handler received the body** (no empty-body errors) |
| 10 | **Log DB write failure** — middleware insert fails (simulated by pointing to bad collection or read-only DB) | Valid order, but force `db.pos_request_logs.insert_one` to raise | HTTP 200 `success:true` (request must still succeed), row in `orders` | 0 rows in `pos_request_logs`, but `_log.warning` logged; original POS response unaffected |
| 11 | **Sample rate** — `POS_REQUEST_LOGGING_SAMPLE_RATE=0.0` | Env enabled but rate 0 | HTTP 200, normal | 0 rows |
| 12 | **TTL index present** | After app startup with env enabled | n/a | `db.pos_request_logs.indexes` lists `ttl_created_at` with `expireAfterSeconds=2592000` (30d default) |
| 13 | **Path prefix narrowing** — `POS_REQUEST_LOGGING_PATH_PREFIX=/api/pos/orders` | Hit `/api/pos/customer-lookup` and `/api/pos/orders` | Both return normally | Only `/api/pos/orders` is logged |
| 14 | **CORS preflight passes** — `OPTIONS /api/pos/orders` | Browser-like preflight | HTTP 200 OPTIONS, normal CORS headers | Either 0 rows OR 1 row with `method=OPTIONS, response_status=200` (acceptable either way; document chosen behavior) |
| 15 | **Concurrent requests** — fire 50 parallel POSTs | Env enabled | All 50 succeed identically to today | 50 rows in `pos_request_logs`; no missing/duplicate rows; latencies in `duration_ms` reasonable |
| 16 | **Response body off** — `POS_REQUEST_LOGGING_CAPTURE_RESPONSE_BODY=false` | Valid order | Normal | 1 row, `response_body=null`, `response_body_captured=false`, `response_status=200` still present |
| 17 | **Backwards compat** — disable env, restart, all existing flows | Hit all 24 `/api/pos/*` endpoints | All return identical bodies to current production | 0 rows |

Automation: tests 1–17 should be added to `/app/tests/test_pos_request_logging.py` and runnable via `pytest` (existing pattern matches `backend/tests/test_segments_crm.py`).

---

## 11. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Sensitive data leak** — full api_key or PII written to `pos_request_logs` and exposed via DB access | HIGH | Default mask set covers all known credential keys; masking is recursive; integration test 8 asserts no full key appears. Document recommendation to extend `MASK_BODY_FIELDS` with `phone`/`email` if PDPB/GDPR applies. |
| 2 | **Body-replay bug** — middleware reads request body but fails to re-inject; downstream handlers receive empty payload | HIGH | Test 9 directly asserts downstream behavior. Implementation must rebuild `request._receive` (covered in §7.3). |
| 3 | **Response body iterator consumed twice** — middleware reads `response.body_iterator`, client gets empty body | HIGH | Implementation rebuilds `Response(content=resp_body, ...)` after consuming iterator. Test 9 covers. If `CAPTURE_RESPONSE_BODY=false`, iterator is never touched. |
| 4 | **Storage growth** in production | MEDIUM | TTL default 30d + truncation at 50 KB/side + sample rate knob. §9 sizing shows ~120 MB at default for 10 restaurants. |
| 5 | **Performance overhead** | MEDIUM | Per-request: 1 body copy (capped at 50 KB) + 1 detached Mongo insert. Measured target: <5 ms p99 added latency. If exceeded, lower `BODY_MAX_BYTES` or set `SAMPLE_RATE<1.0`. Test 15 measures `duration_ms`. |
| 6 | **TTL index creation race** | LOW | `create_index` is idempotent and safe to call on every startup. If env flips from disabled→enabled, index is created on next restart only — operator should restart after toggling. |
| 7 | **Streaming responses break** | LOW | None of the current `/api/pos/*` endpoints return streaming responses. If a future endpoint does, middleware should detect `application/octet-stream` or `text/event-stream` and skip response-body capture. Add as a Phase-2 guard. |
| 8 | **Async task orphaning** — `asyncio.create_task` without holding a strong ref can be GC'd | LOW | Insert task is short-lived (<50 ms); GC risk is theoretical. If observed, switch to a bounded `asyncio.Queue` worker. |
| 9 | **Mongo connection pressure** — every POS call adds one insert | LOW | `motor` async client uses a connection pool; inserts are not blocking. No additional config needed for current load. |
| 10 | **Production accidental enable** | LOW | Default is `false`. Add a startup log line: `_log.warning("POS request logging is ENABLED")` so it's obvious in `backend.err.log` when on. |
| 11 | **Index limit / schema drift in Mongo** | LOW | 4 new indexes are well under Mongo's 64-index cap. Other collections in this DB have ≤3 indexes each (we checked: `pos_event_logs` has only `_id_`). |
| 12 | **Logging recursion** — if a Python logger handler is wired to write to Mongo, the middleware's own logging could create infinite logs | LOW | Stick to stdlib `_log = logging.getLogger("pos_request_logger")` which goes to stdout; no Mongo handler. |

---

## 12. Recommendation

**Implement now, gated OFF by default.**

Rationale:
- The investigation in `CRM_POS_ORDER_WEBHOOK_INVESTIGATION_REPORT.md` explicitly identified the inability to retrospectively inspect failed POS calls as the blocker to root-causing the order-sync gaps at restaurants `739`, `760`, and `475`. CR-001 has already proven the auth/token flow end-to-end (live probe at `pos_0001_restaurant_478` returned HTTP 200 + DB rows); the only missing visibility is the failure side.
- The change is **purely additive**: new file, new collection, new middleware. Existing routes, auth, schemas, and the 24 documented `/api/pos/*` endpoints remain unchanged.
- Risk is contained by (a) env-flag-default-off, (b) try/except wrapping the entire middleware, (c) detached task for Mongo inserts, (d) 17 automated test cases including failure-isolation (test 10).
- Operational lever: enable on preprod for 7 days to capture POS behavior; review `pos_request_logs` for restaurants `739`, `760`, `475`; identify root cause per restaurant; decide whether to keep enabled in production or move to sampled mode.

Estimated effort: **1.5 – 2.5 hours** dev + **1 hour** testing.

Estimated LOC: ~250 lines in `core/pos_request_logger.py`, ~15 lines in `server.py`, ~200 lines of tests.

---

## 13. Owner Approval Needed

Please confirm before any code is written:

1. **Default value of `POS_REQUEST_LOGGING_ENABLED` in preprod?**
   - (a) `false` everywhere — operator flips manually [**recommended for prod**]
   - (b) `true` in preprod only (set in `/app/backend/.env` on this preview env), `false` in production [**recommended for this CR**]
   - (c) `true` everywhere

2. **TTL retention?**
   - (a) 7 days — minimal disk
   - (b) 30 days — default in this plan [**recommended**]
   - (c) 90 days
   - (d) other — specify

3. **Log response body?**
   - (a) Yes — `POS_REQUEST_LOGGING_CAPTURE_RESPONSE_BODY=true` (default). Enables full request/response replay for debugging. [**recommended**]
   - (b) No — status code + duration only. Storage savings ~50%.

4. **Path scope?**
   - (a) All `/api/pos/*` [**recommended**] — catches the deprecated `/pos/webhook/payment-received` endpoint, which is suspect #2 in the investigation report.
   - (b) Only `/api/pos/orders` — minimal storage but misses the deprecated-endpoint scenario.

5. **Mask PII (phone/email) by default?**
   - (a) No — keep `phone`/`email` visible for debugging [**recommended for preprod**]
   - (b) Yes — extend default `MASK_BODY_FIELDS` to include `phone,email,cust_mobile,cust_email` [**recommended for production if PDPB/GDPR applies**]

6. **Sample rate in production (if approved for prod later)?**
   - (a) 1.0 — log every request (~120 MB / 30d in current scale; OK)
   - (b) 0.1 — log 10%
   - (c) Decide post-preprod

Send the picks (e.g., "1b, 2b, 3a, 4a, 5a, 6c") and I will move from plan → implementation in a follow-up CR-002-impl ticket.

---

## 14. Final Status

```
cr_002_logging_plan_ready_for_owner_approval
```

No code written. No env variables added. No DB modified. Plan only.

