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
            
            if is_success:
                logger.info(f"WhatsApp sent successfully to {message.phone}")
                return SendResult(
                    success=True,
                    phone=message.phone,
                    message_id=response_data.get("message_id") or response_data.get("msgid"),
                    response_data=response_data
                )
            else:
                error_msg = response_data.get("message") or response_data.get("error") or str(response_data)
                logger.error(f"WhatsApp send failed for {message.phone}: {error_msg}")
                return SendResult(
                    success=False,
                    phone=message.phone,
                    error=error_msg,
                    response_data=response_data
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
                "error": result.error
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


def build_body_values(
    template_variables: List[str],
    variable_mappings: Dict[str, str],
    customer_data: Dict[str, Any],
    event_data: Dict[str, Any] = None,
    variable_modes: Dict[str, str] = None,
    brand_data: Dict[str, Any] = None,
) -> Dict[str, str]:
    """
    Build the bodyValues dict for AuthKey send.
    For each {{n}}: text mode -> literal; map mode -> resolve via registry.
    """
    body_values = {}
    modes = variable_modes or {}

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
    customer_id: str,
    phone: str,
    event_type: str,
    template_id: str,
    result: SendResult,
    template_name: str = None,
    campaign_id: str = None,
    country_code: str = "91",
    body_values: Dict = None,
    customer_name: str = None
):
    """Log a WhatsApp message attempt to database for status tracking"""
    import uuid
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Map result to status
    status = "pending" if result.success else "rejected"
    
    log_entry = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "customer_id": customer_id,
        "customer_name": customer_name or "",
        "customer_phone": phone,
        "country_code": country_code,
        "event_type": event_type,
        "template_id": template_id,
        "template_name": template_name or "",
        "campaign_id": campaign_id,
        "status": status,
        "message_id": result.message_id,
        "error": result.error,
        "body_values": body_values or {},
        "resend_count": 0,
        "status_history": [
            {
                "status": status,
                "timestamp": now,
                "action": "initial_send"
            }
        ],
        "created_at": now,
        "updated_at": now
    }
    
    await db.whatsapp_message_logs.insert_one(log_entry)
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
            {"_id": 0, "authkey_api_key": 1, "restaurant_name": 1},
        )
        if not user_doc:
            return None
        api_key = user_doc.get("authkey_api_key")
        if not api_key:
            logger.debug(f"No AuthKey API key for user {user_id}, skipping WhatsApp trigger")
            return None
        brand_data = {"restaurant_name": user_doc.get("restaurant_name", "")}

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

        # 3. Build body values via P2 registry resolver
        template_variables = list(variable_mappings.keys()) if variable_mappings else []
        body_values = build_body_values(
            template_variables,
            variable_mappings,
            customer,
            event_data,
            variable_modes=config.get("variable_modes", {}),
            brand_data=brand_data,
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
        
        # 7. Log the attempt with full details
        await log_message_attempt(
            db, user_id, customer.get("id"), phone,
            event_type, template_id, result,
            template_name=config.get("template_name"),
            campaign_id=event_data.get("campaign_id") if event_data else None,
            country_code=country_code,
            body_values=body_values,
            customer_name=customer.get("name")
        )
        
        return result
        
    except Exception as e:
        logger.error(f"WhatsApp trigger error for {event_type}: {str(e)}")
        return None


async def trigger_points_earned_event(
    db,
    user_id: str,
    customer: Dict[str, Any],
    points: int,
    source: str,
    balance_after: int
) -> Optional[SendResult]:
    """
    Trigger points_earned event (for bonus_points, wallet_credit, wallet_debit, coupon_earned)
    NOT for regular purchase/bill points.
    """
    return await trigger_whatsapp_event(
        db, user_id, "points_earned", customer,
        {
            "points_earned": points,
            "points": points,
            "source": source,
            "points_balance": balance_after,
            "balance_after": balance_after
        }
    )
