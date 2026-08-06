"""
CR-036 Batch B.1 · Meta media upload helper
============================================

Two responsibilities:
1. resolve_meta_app_id(user) — env-first with per-tenant override (Q14-revert).
2. upload_to_meta_uploads(user, file_bytes, mime, filename) — 2-step resumable
   upload to Meta Graph API /uploads → returns opaque handle string.

References:
  - DECISIONS_LOG § 2026-07-11 [CR-036] §q14-revert
  - Meta WhatsApp Business Cloud API: Resumable Upload
"""

import logging
import os

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

META_GRAPH_BASE = os.environ.get("META_GRAPH_API_URL", "https://graph.facebook.com/v18.0")


def resolve_meta_app_id(user: dict) -> str:
    """
    Env-first Meta APP_ID resolver.
    Per DECISIONS_LOG § 2026-07-11 [CR-036] §q14-revert.

    Order:
      1. user['meta_app_id'] → per-tenant override (dormant for current tenants)
      2. os.environ['META_APP_ID'] → AuthKey's shared Meta Business App id
      3. neither → HTTPException(503)
    """
    override = (user.get("meta_app_id") or "").strip()
    if override:
        return override
    env_val = (os.environ.get("META_APP_ID") or "").strip()
    if env_val:
        return env_val
    raise HTTPException(
        status_code=503,
        detail="Meta App ID not configured. Contact admin or set override in Settings > WhatsApp.",
    )


async def upload_to_meta_uploads(
    user: dict,
    file_bytes: bytes,
    mime: str,
    filename: str,
) -> str:
    """
    Two-step Meta resumable upload → returns opaque handle string.

    Step A: POST /{app_id}/uploads → creates upload session → returns {id: "upload:..."}
    Step B: POST /{session_id} with file_offset=0 + binary body → returns {h: "4:abc..."}

    Requires user to have meta_access_token set (fetched from DB before call).
    """
    app_id = resolve_meta_app_id(user)
    access_token = (user.get("meta_access_token") or "").strip()
    if not access_token:
        raise HTTPException(
            status_code=400,
            detail="Meta Access Token missing — configure in Settings > WhatsApp > Meta API.",
        )

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Step A — create upload session
        step_a_url = f"{META_GRAPH_BASE}/{app_id}/uploads"
        step_a_resp = await client.post(
            step_a_url,
            headers={"Authorization": f"OAuth {access_token}"},
            data={
                "file_length": str(len(file_bytes)),
                "file_type": mime,
                "file_name": filename,
            },
        )
        if step_a_resp.status_code != 200:
            logger.error("CR-036 Meta upload Step A failed: %s %s", step_a_resp.status_code, step_a_resp.text)
            raise HTTPException(status_code=502, detail=f"Meta upload session creation failed: {step_a_resp.text[:200]}")

        session_id = step_a_resp.json().get("id")
        if not session_id:
            raise HTTPException(status_code=502, detail="Meta upload Step A: missing session ID in response")

        # Step B — upload binary
        step_b_url = f"{META_GRAPH_BASE}/{session_id}"
        step_b_resp = await client.post(
            step_b_url,
            headers={
                "Authorization": f"OAuth {access_token}",
                "file_offset": "0",
            },
            content=file_bytes,
        )
        if step_b_resp.status_code != 200:
            logger.error("CR-036 Meta upload Step B failed: %s %s", step_b_resp.status_code, step_b_resp.text)
            raise HTTPException(status_code=502, detail=f"Meta upload binary failed: {step_b_resp.text[:200]}")

        handle = step_b_resp.json().get("h")
        if not handle:
            raise HTTPException(status_code=502, detail="Meta upload Step B: missing handle in response")

        logger.info("CR-036 Meta upload success: handle=%s (app_id=%s)", handle[:20], app_id)
        return handle
