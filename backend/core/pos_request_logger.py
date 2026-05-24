"""
CR-002 — Configurable POS Request Logging
=========================================

Starlette middleware that persists inbound `/api/pos/*` request and response
metadata to MongoDB collection `pos_request_logs`.

Controlled entirely by environment variables (see `load_config()` below).
Default is DISABLED — wiring this middleware unconditionally is safe.

Design notes (see /app/memory/crm/CR_002_CONFIGURABLE_POS_REQUEST_LOGGING.md):
- middleware body capture re-injects request body so downstream handlers work
- response body iterator is consumed then rebuilt so client still gets it
- mongo writes are detached via asyncio.create_task to avoid blocking response
- every step is try/except wrapped so logging cannot break the original request
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import Message

_log = logging.getLogger("pos_request_logger")


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def load_config() -> dict:
    """Read env vars once. Returns a config dict snapshot."""
    def _bool(name: str, default: str) -> bool:
        return os.getenv(name, default).strip().lower() == "true"

    def _csv_set(name: str, default: str) -> set:
        return {x.strip().lower() for x in os.getenv(name, default).split(",") if x.strip()}

    return {
        "enabled": _bool("POS_REQUEST_LOGGING_ENABLED", "false"),
        "path_prefix": os.getenv("POS_REQUEST_LOGGING_PATH_PREFIX", "/api/pos"),
        "body_max_bytes": int(os.getenv("POS_REQUEST_LOGGING_BODY_MAX_BYTES", "50000")),
        "ttl_days": int(os.getenv("POS_REQUEST_LOGGING_TTL_DAYS", "30")),
        "capture_response_body": _bool("POS_REQUEST_LOGGING_CAPTURE_RESPONSE_BODY", "true"),
        "mask_headers": _csv_set(
            "POS_REQUEST_LOGGING_MASK_HEADERS",
            "authorization,x-api-key,cookie",
        ),
        "mask_body_fields": _csv_set(
            "POS_REQUEST_LOGGING_MASK_BODY_FIELDS",
            "token,api_key,crm_token,password,secret,access_token,refresh_token",
        ),
        "sample_rate": float(os.getenv("POS_REQUEST_LOGGING_SAMPLE_RATE", "1.0")),
    }


# ---------------------------------------------------------------------------
# Masking helpers
# ---------------------------------------------------------------------------

def _mask_value(v: Any) -> Any:
    """Show first 4 + last 4 chars of a credential-like string."""
    if v is None:
        return None
    s = str(v)
    if len(s) <= 12:
        return "***"
    return f"{s[:4]}***{s[-4:]}"


def mask_headers(raw: dict, mask_set: set) -> dict:
    """Lowercase headers and mask any whose name is in mask_set."""
    out = {}
    for k, val in raw.items():
        lk = k.lower()
        if lk in mask_set:
            if lk == "cookie":
                out[lk] = "***"
            elif lk == "authorization":
                parts = (val or "").split(" ", 1)
                if len(parts) == 2:
                    out[lk] = f"{parts[0]} {_mask_value(parts[1])}"
                else:
                    out[lk] = "***"
            else:
                out[lk] = _mask_value(val)
        else:
            out[lk] = val
    return out


def mask_body(obj: Any, mask_set: set) -> Any:
    """Recursively mask values for keys in mask_set (case-insensitive)."""
    if isinstance(obj, dict):
        masked = {}
        for k, v in obj.items():
            if isinstance(k, str) and k.lower() in mask_set:
                masked[k] = _mask_value(v)
            else:
                masked[k] = mask_body(v, mask_set)
        return masked
    if isinstance(obj, list):
        return [mask_body(x, mask_set) for x in obj]
    return obj


# ---------------------------------------------------------------------------
# Verdict classifier
# ---------------------------------------------------------------------------

def classify_verdict(status: int, parsed_resp: Any) -> str:
    if status == 401:
        return "auth_failed"
    if status == 404:
        return "not_found"
    if status == 422:
        return "validation_failed"
    if 500 <= status < 600:
        return "server_error"
    if 200 <= status < 300:
        if isinstance(parsed_resp, dict) and "success" in parsed_resp:
            return "success" if parsed_resp.get("success") else "business_rejection"
        return "success"
    return "unhandled"


# ---------------------------------------------------------------------------
# Index creation
# ---------------------------------------------------------------------------

async def ensure_pos_request_logs_indexes(db, ttl_days: int) -> None:
    """Create TTL + lookup indexes. Idempotent (safe to call on every startup)."""
    try:
        if ttl_days and ttl_days > 0:
            await db.pos_request_logs.create_index(
                "created_at",
                expireAfterSeconds=ttl_days * 86400,
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
        _log.info(
            "pos_request_logs indexes ensured (ttl_days=%s)", ttl_days
        )
    except Exception as e:  # pragma: no cover
        _log.warning("Failed to ensure pos_request_logs indexes: %s", e)


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

class POSRequestLoggingMiddleware(BaseHTTPMiddleware):
    """Persist inbound `/api/pos/*` requests & responses for debugging."""

    def __init__(self, app, db, config: dict):
        super().__init__(app)
        self.db = db
        self.cfg = config

    async def dispatch(self, request: Request, call_next):
        cfg = self.cfg

        # ---- Fast-path: disabled / wrong prefix / sampled out ----------------
        if not cfg["enabled"]:
            return await call_next(request)
        if not request.url.path.startswith(cfg["path_prefix"]):
            return await call_next(request)
        if cfg["sample_rate"] < 1.0 and random.random() > cfg["sample_rate"]:
            return await call_next(request)

        start = time.perf_counter()
        ts_iso = datetime.now(timezone.utc).isoformat()

        # ---- Read request body (and re-inject for downstream handler) -------
        try:
            raw_body = await request.body()
        except Exception as e:
            raw_body = b""
            _log.warning("pos_request_logger: failed reading request body: %s", e)

        async def _receive() -> Message:
            return {"type": "http.request", "body": raw_body, "more_body": False}

        # Rebuild request with replayable receive channel
        request = Request(request.scope, _receive)

        max_bytes = cfg["body_max_bytes"]
        truncated_req = len(raw_body) > max_bytes
        body_for_log = raw_body[:max_bytes]
        content_type = (request.headers.get("content-type") or "").lower()
        parsed_req: Any
        if "application/json" in content_type:
            try:
                parsed_req = json.loads(body_for_log)
                parsed_req = mask_body(parsed_req, cfg["mask_body_fields"])
            except Exception:
                parsed_req = body_for_log.decode("utf-8", errors="replace")
        elif body_for_log:
            parsed_req = body_for_log.decode("utf-8", errors="replace")
        else:
            parsed_req = None

        # ---- Run downstream -------------------------------------------------
        try:
            response: Response = await call_next(request)
        except Exception:
            # Let the original exception propagate; log nothing about response
            raise

        # ---- Read response body (rebuild Response so client gets data) ------
        resp_body = b""
        parsed_resp: Any = None
        if cfg["capture_response_body"]:
            try:
                async for chunk in response.body_iterator:
                    resp_body += chunk
                    # safety hard cap to avoid OOM on accidentally huge streams
                    if len(resp_body) > max_bytes * 4:
                        break
                response = Response(
                    content=resp_body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                )
            except Exception as e:
                _log.warning("pos_request_logger: response body capture failed: %s", e)

            truncated_resp = len(resp_body) > max_bytes
            resp_log = resp_body[:max_bytes]
            try:
                if resp_log:
                    parsed_resp = json.loads(resp_log)
                    parsed_resp = mask_body(parsed_resp, cfg["mask_body_fields"])
            except Exception:
                parsed_resp = resp_log.decode("utf-8", errors="replace")
        else:
            truncated_resp = False

        duration_ms = int((time.perf_counter() - start) * 1000)
        verdict = classify_verdict(response.status_code, parsed_resp)

        # ---- Best-effort: resolve user/restaurant from auth header ----------
        matched_user_id = None
        matched_restaurant_id = None
        matched_via = None
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
        except Exception:
            pass  # auth resolution failure must NEVER affect logging

        # ---- Build the log document -----------------------------------------
        try:
            xff = request.headers.get("x-forwarded-for", "")
            source_ip = (xff.split(",")[0].strip()
                         or (request.client.host if request.client else None))
        except Exception:
            source_ip = None

        doc = {
            "id": str(uuid.uuid4()),
            "timestamp": ts_iso,
            "method": request.method,
            "path": request.url.path,
            "query_params": dict(request.query_params),
            "source_ip": source_ip,
            "user_agent": request.headers.get("user-agent"),
            "headers_masked": mask_headers(dict(request.headers), cfg["mask_headers"]),
            "request_body": parsed_req,
            "request_body_bytes": len(raw_body),
            "request_body_truncated": truncated_req,
            "request_body_content_type": content_type or None,
            "response_status": response.status_code,
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
            "created_at": datetime.now(timezone.utc),
        }

        # ---- Persist (detached, never raise to caller) ----------------------
        try:
            asyncio.create_task(self._safe_insert(doc))
        except Exception as e:  # pragma: no cover
            _log.warning("pos_request_logger: schedule failed: %s", e)

        return response

    async def _safe_insert(self, doc: dict) -> None:
        try:
            await self.db.pos_request_logs.insert_one(doc)
        except Exception as e:
            _log.warning("pos_request_logs insert failed: %s", e)
