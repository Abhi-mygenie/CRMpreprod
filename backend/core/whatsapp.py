"""
WhatsApp Messaging Service via AuthKey.io
Handles single and bulk message sending
"""

import httpx
import logging
from typing import Optional, Dict, List, Any
from datetime import datetime, timezone
from dataclasses import dataclass
from core.whatsapp_variables import VARIABLES_BY_KEY, get_variable

logger = logging.getLogger(__name__)

AUTHKEY_API_URL = "https://console.authkey.io/restapi/requestjson.php"


@dataclass
class WhatsAppMessage:
    """Single WhatsApp message payload"""
    phone: str
    country_code: str
    template_id: str  # wid from AuthKey
    body_values: Dict[str, str]  # {"1": "John", "2": "500"}
    media_url: Optional[str] = None
    media_filename: Optional[str] = None
    customer_id: Optional[str] = None  # For logging


@dataclass
class SendResult:
    """Result of a send operation"""
    success: bool
    phone: str
    message_id: Optional[str] = None
    error: Optional[str] = None
    response_data: Optional[Dict] = None
    http_status: Optional[int] = None           # CR-004 P3.5: AuthKey HTTP status (200/4xx/5xx)
    raw_response: Optional[Dict] = None         # CR-004 P3.5: alias of response_data, kept for clarity in logs


async def send_single_message(
    api_key: str,
    message: WhatsAppMessage,
    timeout: int = 15
) -> SendResult:
    """
    Send a single WhatsApp message via AuthKey.io
    
    Args:
        api_key: AuthKey.io API key
        message: WhatsAppMessage object with all details
        timeout: Request timeout in seconds
    
    Returns:
        SendResult with success status and details
    """
    try:
        # Build request payload
        payload = {
            "country_code": message.country_code.replace("+", ""),
            "mobile": message.phone.replace(" ", "").replace("-", ""),
            "wid": message.template_id,
            "type": "media" if message.media_url else "text",
            "bodyValues": message.body_values or {}
        }
        
        # Add media headers if present
        if message.media_url:
            payload["headerValues"] = {
                "headerFileName": message.media_filename or "file",
                "headerData": message.media_url
            }
        
        logger.info(f"Sending WhatsApp to {message.country_code}{message.phone}, template: {message.template_id}")
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                AUTHKEY_API_URL,
                headers={
                    "Authorization": f"Basic {api_key}",
                    "Content-Type": "application/json"
                },
                json=payload
            )
            
            response_data = response.json() if response.text else {}
            
            logger.info(f"AuthKey RAW response for {message.phone}: status_code={response.status_code}, body={response_data}")
            # Check for explicit failure first
            status_val = response_data.get("status") or response_data.get("Status")
            is_fail = (
                status_val == "Fail" or 
                status_val == "fail" or 
                status_val is False or
                "Invalid" in response_data.get("Message", "") or
                "insufficient" in response_data.get("Message", "").lower()
            )
            
            # Check for success patterns
            is_success = (
                response.status_code == 200 and 
                not is_fail and
                (status_val == "Success" or 
                 status_val is True or
                 response_data.get("message_id") is not None or
                 response_data.get("LogID") is not None or
                 "Submitted Successfully" in response_data.get("Message", ""))
            )
            
            # CR-004 P3.5 G1: AuthKey's canonical id field is `logid` (lowercase,
            # confirmed from real webhook sample 2026-05-28). Keep camelCase/snake_case
            # variants as defensive fallbacks but lowercase is authoritative.
            extracted_logid = (
                response_data.get("logid")
                or response_data.get("LogID")
                or response_data.get("log_id")
                or response_data.get("message_id")
                or response_data.get("msgid")
            )

            if is_success:
                logger.info(f"WhatsApp sent successfully to {message.phone} (logid={extracted_logid})")
                return SendResult(
                    success=True,
                    phone=message.phone,
                    message_id=extracted_logid,
                    response_data=response_data,
                    http_status=response.status_code,
                    raw_response=response_data,
                )
            else:
                error_msg = response_data.get("message") or response_data.get("error") or str(response_data)
                logger.error(f"WhatsApp send failed for {message.phone}: {error_msg}")
                return SendResult(
                    success=False,
                    phone=message.phone,
                    error=error_msg,
                    response_data=response_data,
                    http_status=response.status_code,
                    raw_response=response_data,
                )
                
    except httpx.TimeoutException:
        logger.error(f"WhatsApp send timeout for {message.phone}")
        return SendResult(
            success=False,
            phone=message.phone,
            error="Request timeout"
        )
    except Exception as e:
        logger.error(f"WhatsApp send error for {message.phone}: {str(e)}")
        return SendResult(
            success=False,
            phone=message.phone,
            error=str(e)
        )


async def send_bulk_messages(
    api_key: str,
    messages: List[WhatsAppMessage],
    batch_size: int = 50,
    delay_between_batches: float = 1.0
) -> Dict[str, Any]:
    """
    Send multiple WhatsApp messages in batches
    
    Args:
        api_key: AuthKey.io API key
        messages: List of WhatsAppMessage objects
        batch_size: Number of messages per batch (default 50)
        delay_between_batches: Seconds to wait between batches
    
    Returns:
        Summary dict with success/failure counts and details
    """
    import asyncio
    
    results = {
        "total": len(messages),
        "sent": 0,
        "failed": 0,
        "results": [],
        "started_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Process in batches
    for i in range(0, len(messages), batch_size):
        batch = messages[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (len(messages) + batch_size - 1) // batch_size
        
        logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} messages)")
        
        # Send batch concurrently
        tasks = [send_single_message(api_key, msg) for msg in batch]
        batch_results = await asyncio.gather(*tasks)
        
        for result in batch_results:
            results["results"].append({
                "phone": result.phone,
                "success": result.success,
                "message_id": result.message_id,
                "error": result.error,
                "http_status": result.http_status,         # CR-004 P3.5 G2
                "raw_response": result.raw_response,       # CR-004 P3.5 G2
            })
            if result.success:
                results["sent"] += 1
            else:
                results["failed"] += 1
        
        # Delay between batches (except for last batch)
        if i + batch_size < len(messages) and delay_between_batches > 0:
            await asyncio.sleep(delay_between_batches)
    
    results["completed_at"] = datetime.now(timezone.utc).isoformat()
    logger.info(f"Bulk send complete: {results['sent']}/{results['total']} sent, {results['failed']} failed")
    
    return results


def _format_value(value, formatter):
    """Apply a formatter to a resolved value. Returns "" for None."""
    if value is None or value == "":
        return ""
    if formatter == "currency":
        try:
            n = float(value)
            return f"Rs.{int(n):,}" if n == int(n) else f"Rs.{n:,.2f}"
        except (ValueError, TypeError):
            return str(value)
    if formatter == "integer":
        try:
            return f"{int(float(value)):,}"
        except (ValueError, TypeError):
            return str(value)
    if formatter == "date":
        from datetime import datetime as dt
        try:
            if isinstance(value, str):
                d = dt.fromisoformat(value.replace("Z", "+00:00"))
                return d.strftime("%d %b %Y")
            return str(value)
        except (ValueError, TypeError):
            return str(value)
    return str(value)


def resolve_variable(var_key, customer, event_data=None, brand=None):
    """
    Resolve a single template variable via its registry source chain.
    Replaces the legacy field_aliases dict.
    Returns "" if no source yields a non-empty value.
    """
    entry = get_variable(var_key)
    if not entry:
        return ""
    event_data = event_data or {}
    brand = brand or {}

    for source in entry.get("sources", []):
        scope = source.get("from")
        field = source.get("field")
        if not scope or not field:
            continue
        if scope == "customer":
            value = customer.get(field)
        elif scope == "event":
            value = event_data.get(field)
        elif scope == "brand":
            value = brand.get(field)
        else:
            continue

        if value not in (None, "", 0):
            return _format_value(value, entry.get("formatter"))
        # 0 is valid for integers (e.g., points_balance=0)
        if value == 0 and entry.get("formatter") in ("integer", "currency"):
            return _format_value(0, entry.get("formatter"))

    return ""


def _check_event_data_for_coupon_field(field, event_data):
    """CR-004 P2.5-B D-4: Check if event_data has the real coupon value (event-trigger priority)."""
    field_map = {
        "code": "coupon_code",
        "title": "coupon_title",
        "discount": "coupon_discount",
        "expiry": "coupon_expiry",
    }
    event_key = field_map.get(field)
    if not event_key:
        return None
    val = event_data.get(event_key)
    # Also check the alias "discount" for coupon_discount
    if val is None and field == "discount":
        val = event_data.get("discount")
    return val


def _format_coupon_field(field, value):
    """Apply appropriate formatter for coupon pick fields."""
    if field == "discount":
        return _format_value(value, "currency")
    if field == "expiry":
        return _format_value(value, "date")
    return str(value) if value else ""


def build_body_values(
    template_variables: List[str],
    variable_mappings: Dict[str, str],
    customer_data: Dict[str, Any],
    event_data: Dict[str, Any] = None,
    variable_modes: Dict[str, str] = None,
    brand_data: Dict[str, Any] = None,
    coupon_pick_data: Dict[str, Any] = None,
) -> Dict[str, str]:
    """
    Build the bodyValues dict for AuthKey send.
    For each {{n}}: text mode -> literal; coupon_pick -> resolve from picked coupon
    (event_data wins for event triggers per D-4); map mode -> resolve via registry.
    """
    body_values = {}
    modes = variable_modes or {}
    event_data = event_data or {}

    for var in template_variables:
        var_num = var.strip("{}") if var else ""
        if not var_num:
            continue
        mapped_field = variable_mappings.get(var, "")
        mode = modes.get(var, "map")

        if not mapped_field:
            body_values[var_num] = ""
            continue

        if mode == "text":
            body_values[var_num] = str(mapped_field)
        elif mode == "coupon_pick":
            # CR-004 P2.5-B: Parse "coupon:<id>:<field>"
            parts = mapped_field.split(":")
            if len(parts) == 3 and parts[0] == "coupon":
                field = parts[2]  # "code", "title", "discount", "expiry"
                # D-4: For event triggers, event_data wins over picked coupon
                event_value = _check_event_data_for_coupon_field(field, event_data)
                if event_value is not None and event_value != "":
                    body_values[var_num] = _format_coupon_field(field, event_value)
                elif coupon_pick_data:
                    body_values[var_num] = _format_coupon_field(field, coupon_pick_data.get(field, ""))
                else:
                    body_values[var_num] = ""
            else:
                body_values[var_num] = ""
        else:
            body_values[var_num] = resolve_variable(
                mapped_field, customer_data, event_data, brand_data,
            )

    return body_values


async def get_user_authkey(db, user_id: str) -> Optional[str]:
    """Get AuthKey API key for a user"""
    user = await db.users.find_one({"id": user_id}, {"authkey_api_key": 1})
    return user.get("authkey_api_key") if user else None


async def get_event_template_config(db, user_id: str, event_key: str) -> Optional[Dict]:
    """
    Get template configuration for an event trigger
    
    Returns:
        Dict with template_id, template_name, is_enabled, variable_mappings
    """
    # Get event-template mapping
    event_map = await db.whatsapp_event_template_map.find_one(
        {"user_id": user_id, "event_key": event_key},
        {"_id": 0}
    )
    
    if not event_map or not event_map.get("is_enabled", True):
        return None
    
    template_id = event_map.get("template_id")
    if not template_id:
        return None
    
    # Get variable mappings for this template
    var_map = await db.whatsapp_template_variable_map.find_one(
        {"user_id": user_id, "template_id": template_id},
        {"_id": 0}
    )
    
    return {
        "template_id": template_id,
        "template_name": event_map.get("template_name", ""),
        "is_enabled": event_map.get("is_enabled", True),
        "variable_mappings": var_map.get("mappings", {}) if var_map else {},
        "variable_modes": var_map.get("modes", {}) if var_map else {}
    }


async def log_message_attempt(
    db,
    user_id: str,
    customer_id: Optional[str],
    phone: str,
    event_type: str,
    template_id: str,
    result: SendResult,
    template_name: Optional[str] = None,
    campaign_id: Optional[str] = None,
    country_code: str = "91",
    body_values: Optional[Dict] = None,
    customer_name: Optional[str] = None,
    # CR-004 P3.5 - new fields
    reference_type: Optional[str] = None,       # G3: "order" | "coupon" | "feedback" | "wallet_tx" | "points_tx" | "customer"
    reference_id: Optional[str] = None,         # G3
    pos_order_id: Optional[str] = None,         # G3 (denormalized for filtering)
    idempotency_key: Optional[str] = None,      # G6: unique-per-user prevents double-fires
    is_test: bool = False,                       # G7
    media_url: Optional[str] = None,             # G10
    media_filename: Optional[str] = None,        # G10
    message_body_text: Optional[str] = None,     # G4 (always None in Commit 2; rendering deferred)
    channel: str = "wp",                         # webhook field, default at send
):
    """
    Log a WhatsApp message attempt to whatsapp_message_logs.

    CR-004 P3.5: writes the complete row schema (section 4 of plan) at send time so
    the webhook only has to update status + timestamps + reason later.

    Idempotency: if (user_id, idempotency_key) already exists, this call is a
    no-op (logs INFO, returns the existing row). Prevents duplicate WhatsApps
    on POS retries or cron re-runs.

    Returns: the inserted row (or existing row on idempotency hit).
    """
    import uuid

    now = datetime.now(timezone.utc).isoformat()
    status = "pending" if result.success else "rejected"

    # CR-004 P3.5 G9: normalize country_code to digits-only ("91", not "+91")
    cc_normalized = (country_code or "91").replace("+", "").strip() or "91"

    log_entry = {
        # Identity & ownership
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "is_test": is_test,

        # Reference back to triggering object
        "event_type": event_type,
        "reference_type": reference_type,
        "reference_id": reference_id,
        "pos_order_id": pos_order_id,
        "idempotency_key": idempotency_key,

        # Recipient
        "customer_id": customer_id,
        "customer_name": customer_name or "",
        "customer_phone": phone,
        "country_code": cc_normalized,

        # Template
        "template_id": template_id,
        "template_name": template_name or "",
        "campaign_id": campaign_id,

        # What was sent
        "body_values": body_values or {},
        "message_body_text": message_body_text,    # G4: always None in Commit 2
        "media_url": media_url,
        "media_filename": media_filename,
        "channel": channel,

        # AuthKey send-time response (G5)
        "message_id": result.message_id,
        "authkey_http_status": result.http_status,
        "authkey_raw_response": result.raw_response,

        # AuthKey webhook-derived fields (populated later by webhook)
        "meta_message_id": None,
        "keypress": None,
        "button_param_value": None,
        "time_raw": None,
        "mobile_mismatch": False,

        # Lifecycle
        "status": status,
        "delivered_at": None,
        "read_at": None,
        "rejected_at": now if status == "rejected" else None,
        "failure_reason": result.error if status == "rejected" else None,
        "error": result.error,
        "resend_count": 0,
        "last_resend_at": None,

        # Audit
        "status_history": [
            {
                "status": status,
                "timestamp": now,
                "action": "initial_send",
            }
        ],
        "created_at": now,
        "updated_at": now,
    }

    # CR-004 P3.5 G6: idempotency. Unique sparse index on (user_id, idempotency_key)
    # rejects duplicates. We catch and treat as no-op.
    try:
        await db.whatsapp_message_logs.insert_one(log_entry)
    except Exception as exc:
        # DuplicateKeyError surfaces as Exception from motor; check by name to
        # avoid importing pymongo errors here.
        if exc.__class__.__name__ == "DuplicateKeyError" and idempotency_key:
            logger.info(
                f"Idempotency hit on {event_type} for user={user_id} "
                f"key={idempotency_key!r}; skipping duplicate send-log."
            )
            existing = await db.whatsapp_message_logs.find_one(
                {"user_id": user_id, "idempotency_key": idempotency_key},
                {"_id": 0},
            )
            return existing
        # Any other exception: re-raise so trigger_whatsapp_event's outer try/except
        # records it and we don't silently drop messages.
        raise

    return log_entry


async def trigger_whatsapp_event(
    db,
    user_id: str,
    event_type: str,
    customer: Dict[str, Any],
    event_data: Dict[str, Any] = None
) -> Optional[SendResult]:
    """
    Main trigger function - fires WhatsApp message for an event if configured.
    
    Args:
        db: Database instance
        user_id: Restaurant user ID
        event_type: Event trigger type (e.g., "points_earned", "wallet_credit")
        customer: Customer document with name, phone, points, etc.
        event_data: Optional event-specific data (amount, points, etc.)
    
    Returns:
        SendResult if message was sent, None if not configured/disabled
    
    Usage:
        await trigger_whatsapp_event(
            db, user["id"], "wallet_credit",
            customer, {"amount": 500, "new_balance": 1500}
        )
    """
    try:
        # 1. Get user's AuthKey API key + brand data (combined query — P2)
        user_doc = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "authkey_api_key": 1, "restaurant_name": 1,
             "einvoice_link": 1, "instagram_link": 1,
             "google_review_link": 1, "feedback_link": 1},
        )
        if not user_doc:
            return None
        api_key = user_doc.get("authkey_api_key")
        if not api_key:
            logger.debug(f"No AuthKey API key for user {user_id}, skipping WhatsApp trigger")
            return None
        brand_data = {
            "restaurant_name": user_doc.get("restaurant_name", ""),
            "einvoice_link": user_doc.get("einvoice_link", ""),
            "instagram_link": user_doc.get("instagram_link", ""),
            "google_review_link": user_doc.get("google_review_link", ""),
            "feedback_link": user_doc.get("feedback_link", ""),
        }

        # 2. Get template configuration for this event
        config = await get_event_template_config(db, user_id, event_type)
        if not config:
            logger.debug(f"No template configured for event {event_type}, skipping")
            return None

        if not config.get("is_enabled", True):
            logger.debug(f"Event {event_type} is disabled, skipping")
            return None

        template_id = config["template_id"]
        variable_mappings = config.get("variable_mappings", {})

        # 3. Pre-resolve coupon_pick data (CR-004 P2.5-B — async DB lookup done here)
        coupon_pick_data = None
        variable_modes = config.get("variable_modes", {})
        coupon_pick_ids = set()
        for placeholder, mapped in variable_mappings.items():
            if (variable_modes.get(placeholder) == "coupon_pick"
                    and mapped and mapped.startswith("coupon:")):
                parts = mapped.split(":")
                if len(parts) == 3:
                    coupon_pick_ids.add(parts[1])

        if coupon_pick_ids:
            cpn_id = next(iter(coupon_pick_ids))
            cpn_doc = await db.coupons.find_one(
                {"id": cpn_id, "user_id": user_id}, {"_id": 0}
            )
            if cpn_doc:
                coupon_pick_data = {
                    "code": cpn_doc.get("code", ""),
                    "title": cpn_doc.get("title", ""),
                    "discount": cpn_doc.get("discount_value", 0),
                    "expiry": cpn_doc.get("end_date", ""),
                }
            else:
                logger.warning(f"Coupon pick: coupon {cpn_id} not found for user {user_id}")

        # 4. Build body values via P2 registry resolver
        template_variables = list(variable_mappings.keys()) if variable_mappings else []
        body_values = build_body_values(
            template_variables,
            variable_mappings,
            customer,
            event_data,
            variable_modes=variable_modes,
            brand_data=brand_data,
            coupon_pick_data=coupon_pick_data,
        )
        
        # 5. Prepare message
        phone = customer.get("phone", "").replace(" ", "").replace("-", "")
        country_code = customer.get("country_code", "+91").replace("+", "")
        
        if not phone:
            logger.warning(f"Customer {customer.get('id')} has no phone number")
            return None
        
        message = WhatsAppMessage(
            phone=phone,
            country_code=country_code,
            template_id=template_id,
            body_values=body_values,
            customer_id=customer.get("id")
        )
        
        # 6. Send message
        logger.info(f"Triggering WhatsApp for event {event_type} to {phone}")
        result = await send_single_message(api_key, message)

        # 7. Log the attempt with full details (CR-004 P3.5: complete row schema)
        ed = event_data or {}
        await log_message_attempt(
            db, user_id, customer.get("id"), phone,
            event_type, template_id, result,
            template_name=config.get("template_name"),
            campaign_id=ed.get("campaign_id"),
            country_code=country_code,
            body_values=body_values,
            customer_name=customer.get("name"),
            # CR-004 P3.5 - extract enrichment fields from event_data (callsites add these in Commit 3)
            reference_type=ed.get("reference_type"),
            reference_id=ed.get("reference_id"),
            pos_order_id=ed.get("pos_order_id"),
            idempotency_key=ed.get("idempotency_key"),
            is_test=False,
            media_url=ed.get("media_url"),
            media_filename=ed.get("media_filename"),
            message_body_text=None,   # G4: deferred (template body not in our DB)
            channel="wp",
        )

        return result

    except Exception as e:
        # CR-004 P3.5 G8: failures BEFORE send still produce a visible row. No silent black holes.
        logger.error(f"WhatsApp trigger error for {event_type} (user={user_id}, customer={customer.get('id')}): {str(e)}")
        try:
            ed = event_data or {}
            failed_result = SendResult(
                success=False,
                phone=(customer.get("phone") or "").replace(" ", "").replace("-", ""),
                error=f"trigger_error: {str(e)}",
            )
            await log_message_attempt(
                db,
                user_id,
                customer.get("id"),
                failed_result.phone,
                event_type,
                "",  # template_id unknown at this point
                failed_result,
                template_name=None,
                campaign_id=ed.get("campaign_id"),
                country_code=(customer.get("country_code", "+91") or "+91").replace("+", ""),
                body_values=None,
                customer_name=customer.get("name"),
                reference_type=ed.get("reference_type"),
                reference_id=ed.get("reference_id"),
                pos_order_id=ed.get("pos_order_id"),
                idempotency_key=ed.get("idempotency_key"),
                is_test=False,
                channel="wp",
            )
        except Exception as inner_exc:
            # Last-resort: log to file so a missing row is at least discoverable in supervisor logs
            logger.exception(
                f"FATAL: failed to log trigger_error row for event={event_type} "
                f"user={user_id} customer={customer.get('id')} inner_exc={inner_exc}"
            )
        return None


async def trigger_points_earned_event(
    db,
    user_id: str,
    customer: Dict[str, Any],
    points: int,
    source: str,
    balance_after: int,
    extra: Optional[Dict[str, Any]] = None,
) -> Optional[SendResult]:
    """
    Trigger points_earned event (for bonus_points, wallet_credit, wallet_debit, coupon_earned)
    NOT for regular purchase/bill points.

    CR-004 P3.5: `extra` is merged into event_data so callers can inject
    idempotency_key, reference_type, reference_id, pos_order_id, etc.
    """
    event_data = {
        "points_earned": points,
        "points": points,
        "source": source,
        "points_balance": balance_after,
        "balance_after": balance_after,
    }
    if extra:
        event_data.update(extra)
    return await trigger_whatsapp_event(
        db, user_id, "points_earned", customer, event_data
    )
