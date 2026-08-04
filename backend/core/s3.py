"""
CR-036 · AWS S3 client module
==============================

Reusable S3 client for CR-036 (multi-part S3 migration):
- Part 1+2: WhatsApp media header uploads + send delivery
- Part 3:   Bill logo uploads (dual-mode with local disk fallback per Q9)
- Part 4:   Invoice HTML+PDF writes (dual-mode with local disk fallback per Q10)

Safety property: if any AWS_* env var starts with `__PLACEHOLDER_` (or is empty),
`S3_CONFIGURED` is False and all callers gracefully fall back to their pre-CR-036
behaviour. The PR is a no-op without real AWS creds.

Bucket layout (single shared bucket, prefix-partitioned):
    s3://<bucket>/media-headers/<user_id>/<uuid>.<ext>   ← CR-036 Parts 1+2
    s3://<bucket>/bill-logos/<user_id>.<ext>              ← CR-036 Part 3
    s3://<bucket>/invoices/<token>/{invoice.html, .pdf}   ← CR-036 Part 4

Public-read is granted via bucket policy on these 3 prefixes AND via
ACL='public-read' on each put_object (defense in depth). Confirmed working
against `mygenie-prod` bucket in ap-south-1 via smoke test 2026-07-04.

References:
- integration_playbook_expert_v2 playbook 2026-07-04
- DECISIONS_LOG.md § 2026-07-03 [CR-036] q6, § 2026-07-04 [CR-036] q9-q12
"""

import logging
import os
from typing import Optional
from urllib.parse import quote

import boto3
from botocore.exceptions import ClientError, BotoCoreError

logger = logging.getLogger(__name__)

# --- Config from env ------------------------------------------------------

AWS_S3_BUCKET: str = os.environ.get("AWS_S3_BUCKET", "")
AWS_S3_REGION: str = os.environ.get("AWS_S3_REGION", "")
AWS_ACCESS_KEY_ID: str = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY: str = os.environ.get("AWS_SECRET_ACCESS_KEY", "")


def _is_placeholder(value: str) -> bool:
    """True if the value is empty or a well-known placeholder token."""
    if not value:
        return True
    v = value.strip()
    if v.startswith("__PLACEHOLDER"):
        return True
    return False


S3_CONFIGURED: bool = not (
    _is_placeholder(AWS_S3_BUCKET)
    or _is_placeholder(AWS_S3_REGION)
    or _is_placeholder(AWS_ACCESS_KEY_ID)
    or _is_placeholder(AWS_SECRET_ACCESS_KEY)
)


if S3_CONFIGURED:
    logger.info(
        "CR-036 S3 module initialised · bucket=%s · region=%s",
        AWS_S3_BUCKET, AWS_S3_REGION,
    )
else:
    logger.warning(
        "CR-036 S3 module NOT configured (placeholder or missing env vars). "
        "All CR-036 uploads will fall back to legacy local-disk behaviour."
    )


# --- Client (lazy, cached) ------------------------------------------------

_s3_client = None


def get_s3_client():
    """Return a cached boto3 S3 client, or None if S3 is not configured.

    Callers must always handle the None case and fall back to legacy behaviour.
    """
    global _s3_client
    if not S3_CONFIGURED:
        return None
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            region_name=AWS_S3_REGION,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        )
    return _s3_client


# --- URL helper -----------------------------------------------------------


def get_public_url(key: str) -> str:
    """Return the canonical virtual-hosted-style public URL for `key`.

    Example: `https://<bucket>.s3.<region>.amazonaws.com/bill-logos/abc.png`
    """
    if not S3_CONFIGURED:
        return ""
    safe_key = quote(key, safe="/")
    return f"https://{AWS_S3_BUCKET}.s3.{AWS_S3_REGION}.amazonaws.com/{safe_key}"


# --- Error logging helper -------------------------------------------------


def _log_client_error(op: str, key: str, err: Exception) -> None:
    if isinstance(err, ClientError):
        code = err.response.get("Error", {}).get("Code", "?")
        msg = err.response.get("Error", {}).get("Message", str(err))
        logger.error("S3 %s failed key=%s: %s (%s)", op, key, msg, code)
    else:
        logger.error("S3 %s failed key=%s: %s", op, key, err)


# --- Upload ---------------------------------------------------------------


def put_public_object(
    key: str,
    body: bytes,
    content_type: str,
    *,
    cache_control: Optional[str] = None,
) -> Optional[str]:
    """Upload `body` to `s3://<bucket>/<key>` with public-read ACL.

    Returns the public HTTPS URL on success, or None on failure / not-configured.
    Caller is responsible for graceful fallback.

    Sets ACL='public-read' explicitly (defense in depth alongside bucket policy).
    """
    s3 = get_s3_client()
    if s3 is None:
        logger.debug("put_public_object skipped (S3 not configured) key=%s", key)
        return None
    kwargs = {
        "Bucket": AWS_S3_BUCKET,
        "Key": key,
        "Body": body,
        "ContentType": content_type,
        "ACL": "public-read",
    }
    if cache_control:
        kwargs["CacheControl"] = cache_control
    try:
        s3.put_object(**kwargs)
        return get_public_url(key)
    except (ClientError, BotoCoreError) as e:
        _log_client_error("put_object", key, e)
        return None


# --- Existence check ------------------------------------------------------


def object_exists(key: str) -> bool:
    """True iff HEAD on `key` succeeds. False on not-found OR error OR not-configured.

    Used by dual-mode serve endpoints to decide S3-vs-local fallback.
    """
    s3 = get_s3_client()
    if s3 is None:
        return False
    try:
        s3.head_object(Bucket=AWS_S3_BUCKET, Key=key)
        return True
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey", "NotFound"):
            return False
        _log_client_error("head_object", key, e)
        return False
    except BotoCoreError as e:
        _log_client_error("head_object", key, e)
        return False


# --- Get bytes (used by PDF gen when HTML lives in S3) --------------------


def get_object_bytes(key: str) -> Optional[bytes]:
    """Return object body as bytes, or None on failure / not-configured."""
    s3 = get_s3_client()
    if s3 is None:
        return None
    try:
        resp = s3.get_object(Bucket=AWS_S3_BUCKET, Key=key)
        return resp["Body"].read()
    except (ClientError, BotoCoreError) as e:
        _log_client_error("get_object", key, e)
        return None


# --- Delete ---------------------------------------------------------------


def delete_object(key: str) -> bool:
    """Delete `key` from bucket. Idempotent — returns False if not-configured OR error.

    Returns True on successful deletion or already-absent object.
    """
    s3 = get_s3_client()
    if s3 is None:
        return False
    try:
        s3.delete_object(Bucket=AWS_S3_BUCKET, Key=key)
        return True
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey", "NotFound"):
            return True
        _log_client_error("delete_object", key, e)
        return False
    except BotoCoreError as e:
        _log_client_error("delete_object", key, e)
        return False
