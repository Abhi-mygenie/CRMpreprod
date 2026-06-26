"""
CR-014 Phase 2: Invoice generator service.
Renders food invoices (Mode A / GST Tax Invoice) from order data + user bill_settings.
Produces HTML (Jinja2) and PDF (weasyprint).
"""
import uuid
from pathlib import Path
from datetime import datetime, timezone
from jinja2 import Environment, FileSystemLoader

TEMPLATE_DIR = Path(__file__).parent.parent / "templates"
DATA_DIR = Path("/app/data/invoices")
DATA_DIR.mkdir(parents=True, exist_ok=True)

_jinja_env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)), autoescape=True)


def _fmt(value, decimals=2):
    """Format number with commas and decimals."""
    if value is None:
        return "0.00"
    try:
        v = float(value)
        if v == int(v) and decimals <= 2:
            return f"{int(v):,}"
        return f"{v:,.{decimals}f}"
    except (ValueError, TypeError):
        return str(value)


def _amount_in_words(amount):
    """Convert amount to Indian English words."""
    try:
        amt = int(round(float(amount)))
    except (ValueError, TypeError):
        return ""
    if amt <= 0:
        return ""

    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
            "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
            "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def _words(n):
        if n == 0:
            return ""
        if n < 20:
            return ones[n]
        if n < 100:
            return tens[n // 10] + (" " + ones[n % 10] if n % 10 else "")
        if n < 1000:
            return ones[n // 100] + " Hundred" + (" " + _words(n % 100) if n % 100 else "")
        if n < 100000:
            return _words(n // 1000) + " Thousand" + (" " + _words(n % 1000) if n % 1000 else "")
        if n < 10000000:
            return _words(n // 100000) + " Lakh" + (" " + _words(n % 100000) if n % 100000 else "")
        return _words(n // 10000000) + " Crore" + (" " + _words(n % 10000000) if n % 10000000 else "")

    return "Rupees " + _words(amt) + " Only"


def _format_date(date_str, fmt="DD MMM YYYY"):
    """Parse various date formats and return formatted string."""
    if not date_str:
        return ""
    try:
        # Try ISO format first
        dt = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        try:
            dt = datetime.strptime(str(date_str)[:19], "%Y-%m-%d %H:%M:%S")
        except (ValueError, TypeError):
            return str(date_str)[:16]

    if fmt == "DD/MM/YYYY":
        return dt.strftime("%d/%m/%Y, %I:%M %p")
    elif fmt == "MM/DD/YYYY":
        return dt.strftime("%m/%d/%Y, %I:%M %p")
    elif fmt == "YYYY-MM-DD":
        return dt.strftime("%Y-%m-%d, %H:%M")
    else:  # DD MMM YYYY
        return dt.strftime("%d %b %Y, %I:%M %p")


def _order_type_display(ot):
    mapping = {
        "dinein": "Dine-In", "dine_in": "Dine-In", "Dine In": "Dine-In",
        "delivery": "Delivery", "Delivery": "Delivery",
        "takeaway": "Takeaway", "take_away": "Takeaway", "Takeaway": "Takeaway",
        "pos": "POS",
    }
    return mapping.get(ot, str(ot).title())


def _payment_display(pm):
    mapping = {
        "cash": "Cash", "upi": "UPI", "card": "Card", "cc": "Credit Card",
        "cash_on_delivery": "Cash on Delivery", "online": "Online Payment",
        "wallet": "Wallet", "credit": "Credit",
    }
    return mapping.get(str(pm).lower(), str(pm).title())


def _detect_invoice_mode(order: dict) -> str:
    """Detect invoice mode from order data.
    Returns: 'hotel_room' (Pattern A), 'hotel_folio' (Pattern B), or 'food' (default).
    """
    import re
    ri = order.get("room_info")
    if ri and isinstance(ri, dict):
        room_price = float(ri.get("room_price", 0) or 0)
        if room_price > 0:
            return "hotel_room"

    for it in order.get("items", []):
        name = (it.get("item_name") or "").strip()
        price = float(it.get("item_price", 0) or 0)
        if re.match(r"^check\s*in$", name, re.IGNORECASE) and price == 0:
            return "hotel_folio"

    return "food"


def _format_date_short(date_str):
    """Format date as '14 Jan 2026' (no time)."""
    if not date_str:
        return ""
    try:
        dt = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
        return dt.strftime("%d %b %Y")
    except (ValueError, TypeError):
        try:
            dt = datetime.strptime(str(date_str)[:10], "%Y-%m-%d")
            return dt.strftime("%d %b %Y")
        except (ValueError, TypeError):
            return str(date_str)[:10]


def generate_invoice_html(order: dict, user: dict, customer: dict = None, event_data: dict = None) -> dict:
    """
    Generate invoice HTML from order data and user profile/bill_settings.
    Returns: { "token": str, "html": str, "html_path": str, "invoice_number": str }
    """
    bs = user.get("bill_settings") or {}
    token = uuid.uuid4().hex

    # Invoice number: {prefix}/{bill_number}
    prefix = bs.get("invoice_prefix") or (user.get("restaurant_name", "INV")[:2].upper())
    bill_number = order.get("restaurant_order_id", order.get("pos_order_id", ""))
    invoice_number = f"{prefix}/{bill_number}" if bill_number else f"{prefix}/{token[:8]}"

    # Currency symbol
    cs = bs.get("currency_symbol", "Rs.")

    # Colors
    header_color = bs.get("header_color", "#2B2B2B")
    accent_color = bs.get("accent_color", "#F26B33")

    # Restaurant info
    restaurant_name = user.get("restaurant_name", "")
    restaurant_initials = restaurant_name[:2].upper() if restaurant_name else "?"
    logo_url = bs.get("bill_logo_url", "")

    # Date formatting
    date_format = bs.get("date_format", "DD MMM YYYY")
    order_date = _format_date(order.get("order_created_at") or order.get("created_at"), date_format)

    # Determine if GST invoice
    gstin = user.get("gstin", "")
    gst_tax = float(order.get("gst_tax", 0) or 0)
    is_gst_invoice = bool(gstin and gst_tax > 0)

    # Items
    raw_items = order.get("items", [])
    items = []
    item_total_raw = 0.0
    for it in raw_items:
        qty = int(it.get("item_qty", 1) or 1)
        unit_price = float(it.get("item_price", 0) or 0)
        addon = float(it.get("addon_amount", 0) or 0)
        variation = float(it.get("variation_amount", 0) or 0)
        item_discount = float(it.get("discount_amount", 0) or 0)
        line_total = (unit_price * qty) + addon + variation - item_discount
        item_total_raw += line_total

        variant_parts = []
        if it.get("variant"):
            variant_parts.append(str(it["variant"]))
        if it.get("add_ons") and isinstance(it["add_ons"], list):
            for ao in it["add_ons"]:
                if isinstance(ao, dict) and ao.get("name"):
                    variant_parts.append(ao["name"])
                elif isinstance(ao, str):
                    variant_parts.append(ao)

        items.append({
            "name": it.get("item_name", "Item"),
            "qty": qty,
            "unit_price": _fmt(unit_price),
            "line_total": _fmt(line_total),
            "is_veg": it.get("is_veg", True),
            "variant": ", ".join(variant_parts) if variant_parts else "",
            "gst_amount": float(it.get("gst_amount", 0) or 0),
        })

    item_count = len(items)

    # Totals
    delivery_charge = float(order.get("delivery_charge", 0) or 0)
    subtotal_raw = item_total_raw + delivery_charge
    coupon_discount = float(order.get("coupon_discount", 0) or 0)
    loyalty_discount = float(order.get("loyalty_discount", 0) or order.get("crm_loyalty_discount", 0) or 0)
    wallet_used = float(order.get("wallet_used", 0) or 0)
    self_discount = float(order.get("self_discount", 0) or order.get("order_discount", 0) or 0)
    total_discounts = coupon_discount + loyalty_discount + wallet_used + self_discount
    taxable_amount = subtotal_raw - total_discounts

    vat_tax = float(order.get("vat_tax", 0) or 0)
    service_tax = float(order.get("service_tax", 0) or 0) + float(order.get("service_gst_tax_amount", 0) or 0)
    tip_amount = float(order.get("tip_amount", 0) or 0)
    round_up = float(order.get("round_up", 0) or 0)
    grand_total = float(order.get("order_amount", 0) or 0)

    # Tax rate derivation (CGST/SGST split for intra-state)
    cgst = 0.0
    sgst = 0.0
    tax_rate_half = ""
    if gst_tax > 0 and taxable_amount > 0:
        total_rate = (gst_tax / taxable_amount) * 100
        half_rate = round(total_rate / 2, 1)
        if half_rate == int(half_rate):
            half_rate = int(half_rate)
        tax_rate_half = str(half_rate)
        cgst = gst_tax / 2
        sgst = gst_tax / 2

    # Customer info
    cust_name = order.get("cust_name", "")
    cust_phone = order.get("cust_mobile", "")
    if cust_phone and not cust_phone.startswith("+"):
        cust_phone = f"+91 {cust_phone}"

    customer_gstin = ""
    if customer:
        customer_gstin = customer.get("gst_number", "")

    # Delivery address
    delivery_address = ""
    if order.get("order_type") in ("delivery", "Delivery") and customer:
        addrs = customer.get("addresses", [])
        if addrs and isinstance(addrs, list):
            addr = addrs[0] if isinstance(addrs[0], dict) else {}
            parts = [addr.get("address", ""), addr.get("address_line_2", "")]
            delivery_address = ", ".join(p for p in parts if p)

    # Loyalty data
    points_earned = order.get("points_earned", 0) or 0
    points_balance = (event_data or {}).get("points_balance", "—")
    customer_tier = (event_data or {}).get("tier", "")
    wallet_balance = (event_data or {}).get("wallet_balance", "")
    loyalty_points_used = order.get("loyalty_points_used", 0) or order.get("crm_loyalty_points_redeemed", 0) or 0

    # Build template context
    ctx = {
        # Colors / branding
        "header_color": header_color,
        "accent_color": accent_color,
        "logo_url": logo_url,
        "restaurant_initials": restaurant_initials,
        "restaurant_name": restaurant_name,
        "tagline": bs.get("tagline", ""),
        "address_line1": user.get("address_line1", ""),
        "address_line2": user.get("address_line2", ""),
        "city": user.get("city", ""),
        "state": user.get("state", ""),
        "pincode": user.get("pincode", ""),
        "phone": user.get("phone", ""),
        "email": user.get("email", ""),

        # Invoice meta
        "is_gst_invoice": is_gst_invoice,
        "invoice_number": invoice_number,
        "order_date": order_date,
        "bill_number": bill_number,

        # GSTIN/FSSAI strip
        "show_gstin": bs.get("show_gstin", True),
        "gstin": gstin,
        "show_fssai": bs.get("show_fssai", True),
        "fssai_license": user.get("fssai_license", ""),

        # Customer
        "customer_name": cust_name,
        "customer_phone": cust_phone,
        "order_type": order.get("order_type", ""),
        "order_type_display": _order_type_display(order.get("order_type", "")),
        "table_id": order.get("table_id", ""),
        "show_customer_gstin": bs.get("show_customer_gstin", True),
        "customer_gstin": customer_gstin,
        "delivery_address": delivery_address,

        # Items
        "show_veg_dots": bs.get("show_veg_dots", True),
        "items": items,
        "item_count": item_count,
        "cs": cs,

        # Totals
        "item_total": _fmt(item_total_raw),
        "item_total_raw": item_total_raw,
        "delivery_charge": delivery_charge,
        "delivery_charge_display": _fmt(delivery_charge),
        "has_subtotal_diff": delivery_charge > 0,
        "subtotal": _fmt(subtotal_raw),
        "coupon_discount": coupon_discount,
        "coupon_discount_display": _fmt(coupon_discount),
        "coupon_code": order.get("coupon_code", ""),
        "loyalty_discount": loyalty_discount,
        "loyalty_discount_display": _fmt(loyalty_discount),
        "loyalty_points_used": loyalty_points_used,
        "wallet_used": wallet_used,
        "wallet_used_display": _fmt(wallet_used),
        "self_discount": self_discount,
        "self_discount_display": _fmt(self_discount),
        "taxable_amount": taxable_amount,
        "taxable_amount_display": _fmt(taxable_amount),
        "gst_tax": gst_tax,
        "gst_tax_display": _fmt(gst_tax),
        "cgst": cgst,
        "cgst_display": _fmt(cgst),
        "sgst": sgst,
        "sgst_display": _fmt(sgst),
        "tax_rate_half": tax_rate_half,
        "vat_tax": vat_tax,
        "vat_tax_display": _fmt(vat_tax),
        "service_tax": service_tax,
        "service_tax_display": _fmt(service_tax),
        "tip_amount": tip_amount,
        "tip_display": _fmt(tip_amount),
        "round_up": round_up,
        "round_up_display": _fmt(round_up),
        "grand_total": _fmt(grand_total),

        # Amount in words
        "show_amount_in_words": bs.get("show_amount_in_words", True),
        "amount_in_words": _amount_in_words(grand_total),

        # Payment
        "payment_method_display": _payment_display(order.get("payment_method", "")),
        "payment_status": order.get("payment_status", ""),

        # Loyalty
        "show_loyalty_section": bs.get("show_loyalty_section", True),
        "points_earned": points_earned,
        "points_balance": points_balance,
        "customer_tier": customer_tier,
        "wallet_balance": wallet_balance,

        # Footer
        "footer_message": bs.get("footer_message", ""),
        "footer_contact": bs.get("footer_contact", user.get("phone", "")),
        "show_sac_code": bs.get("show_sac_code", True),
        "sac_code": bs.get("sac_code", ""),
        "terms_and_conditions": bs.get("terms_and_conditions", ""),
        "social_instagram": bs.get("social_instagram", ""),
        "social_google_review": bs.get("social_google_review", ""),

        # PDF URL (filled by caller)
        "pdf_url": "",
    }

    template = _jinja_env.get_template("invoice_food.html")
    html = template.render(**ctx)

    # Save HTML to disk
    invoice_dir = DATA_DIR / token
    invoice_dir.mkdir(parents=True, exist_ok=True)
    html_path = invoice_dir / "invoice.html"
    html_path.write_text(html, encoding="utf-8")

    return {
        "token": token,
        "html": html,
        "html_path": str(html_path),
        "invoice_number": invoice_number,
        "invoice_dir": str(invoice_dir),
    }


def _build_common_ctx(order, user, customer=None, event_data=None):
    """Build template context shared across all invoice modes."""
    bs = user.get("bill_settings") or {}
    cs = bs.get("currency_symbol", "Rs.")
    header_color = bs.get("header_color", "#2B2B2B")
    accent_color = bs.get("accent_color", "#F26B33")
    restaurant_name = user.get("restaurant_name", "")
    date_format = bs.get("date_format", "DD MMM YYYY")

    prefix = bs.get("invoice_prefix") or (restaurant_name[:2].upper() if restaurant_name else "INV")
    bill_number = order.get("restaurant_order_id", order.get("pos_order_id", ""))
    invoice_number = f"{prefix}/{bill_number}" if bill_number else f"{prefix}/{uuid.uuid4().hex[:8]}"

    cust_name = order.get("cust_name", "")
    cust_phone = order.get("cust_mobile", "")
    if cust_phone and not cust_phone.startswith("+"):
        cust_phone = f"+91 {cust_phone}"

    # Tax
    gst_tax = float(order.get("gst_tax", 0) or 0)
    vat_tax = float(order.get("vat_tax", 0) or 0)
    service_tax = float(order.get("service_tax", 0) or 0) + float(order.get("service_gst_tax_amount", 0) or 0)
    delivery_charge = float(order.get("delivery_charge", 0) or 0)
    coupon_discount = float(order.get("coupon_discount", 0) or 0)
    loyalty_discount = float(order.get("loyalty_discount", 0) or order.get("crm_loyalty_discount", 0) or 0)
    wallet_used = float(order.get("wallet_used", 0) or 0)
    self_discount = float(order.get("self_discount", 0) or order.get("order_discount", 0) or 0)
    round_up = float(order.get("round_up", 0) or 0)
    grand_total = float(order.get("order_amount", 0) or 0)

    cgst = sgst = 0.0
    tax_rate_half = ""
    # We'll compute taxable after caller adds food_total
    if gst_tax > 0:
        cgst = gst_tax / 2
        sgst = gst_tax / 2

    return {
        "header_color": header_color, "accent_color": accent_color,
        "logo_url": bs.get("bill_logo_url", ""),
        "restaurant_initials": restaurant_name[:2].upper() if restaurant_name else "?",
        "restaurant_name": restaurant_name,
        "tagline": bs.get("tagline", ""),
        "address_line1": user.get("address_line1", ""), "address_line2": user.get("address_line2", ""),
        "city": user.get("city", ""), "state": user.get("state", ""), "pincode": user.get("pincode", ""),
        "phone": user.get("phone", ""), "email": user.get("email", ""),
        "invoice_number": invoice_number,
        "order_date": _format_date(order.get("order_created_at") or order.get("created_at"), date_format),
        "bill_number": bill_number,
        "show_gstin": bs.get("show_gstin", True), "gstin": user.get("gstin", ""),
        "show_fssai": bs.get("show_fssai", True), "fssai_license": user.get("fssai_license", ""),
        "customer_name": cust_name, "customer_phone": cust_phone,
        "show_veg_dots": bs.get("show_veg_dots", True),
        "cs": cs,
        "delivery_charge": delivery_charge, "delivery_charge_display": _fmt(delivery_charge),
        "coupon_discount": coupon_discount, "coupon_discount_display": _fmt(coupon_discount),
        "coupon_code": order.get("coupon_code", ""),
        "loyalty_discount": loyalty_discount, "loyalty_discount_display": _fmt(loyalty_discount),
        "gst_tax": gst_tax, "gst_tax_display": _fmt(gst_tax),
        "cgst": cgst, "cgst_display": _fmt(cgst), "sgst": sgst, "sgst_display": _fmt(sgst),
        "tax_rate_half": tax_rate_half,
        "vat_tax": vat_tax, "vat_tax_display": _fmt(vat_tax),
        "service_tax": service_tax, "service_tax_display": _fmt(service_tax),
        "round_up": round_up, "round_up_display": _fmt(round_up),
        "grand_total": _fmt(grand_total),
        "show_amount_in_words": bs.get("show_amount_in_words", True),
        "amount_in_words": _amount_in_words(grand_total),
        "payment_method_display": _payment_display(order.get("payment_method", "")),
        "payment_status": order.get("payment_status", ""),
        "show_loyalty_section": bs.get("show_loyalty_section", True),
        "points_earned": order.get("points_earned", 0) or 0,
        "points_balance": (event_data or {}).get("points_balance", "—"),
        "customer_tier": (event_data or {}).get("tier", ""),
        "wallet_balance": (event_data or {}).get("wallet_balance", ""),
        "footer_message": bs.get("footer_message", ""),
        "footer_contact": bs.get("footer_contact", user.get("phone", "")),
        "show_sac_code": bs.get("show_sac_code", True), "sac_code": bs.get("sac_code", ""),
        "terms_and_conditions": bs.get("terms_and_conditions", ""),
        "social_instagram": bs.get("social_instagram", ""),
        "social_google_review": bs.get("social_google_review", ""),
        "pdf_url": "",
    }


def _parse_food_items(raw_items, skip_checkin=False):
    """Parse order items into display-ready dicts. Optionally skip 'Check In' items."""
    import re
    items = []
    total = 0.0
    for it in raw_items:
        name = (it.get("item_name") or "Item").strip()
        price = float(it.get("item_price", 0) or 0)
        if skip_checkin and re.match(r"^check\s*in$", name, re.IGNORECASE) and price == 0:
            continue
        qty = int(it.get("item_qty", 1) or 1)
        addon = float(it.get("addon_amount", 0) or 0)
        variation = float(it.get("variation_amount", 0) or 0)
        discount = float(it.get("discount_amount", 0) or 0)
        line_total = (price * qty) + addon + variation - discount
        total += line_total
        variant_parts = []
        if it.get("variant"):
            variant_parts.append(str(it["variant"]))
        if it.get("add_ons") and isinstance(it["add_ons"], list):
            for ao in it["add_ons"]:
                if isinstance(ao, dict) and ao.get("name"):
                    variant_parts.append(ao["name"])
                elif isinstance(ao, str):
                    variant_parts.append(ao)
        items.append({
            "name": name, "qty": qty, "unit_price": _fmt(price), "line_total": _fmt(line_total),
            "line_total_raw": line_total, "is_veg": it.get("is_veg", True),
            "variant": ", ".join(variant_parts) if variant_parts else "",
            "serve_at": it.get("serve_at") or "",
        })
    return items, total


def generate_hotel_room_html(order, user, customer=None, event_data=None):
    """Pattern A: Hotel Folio with room charges + food items."""
    ctx = _build_common_ctx(order, user, customer, event_data)
    ri = order.get("room_info", {}) or {}

    room_price = float(ri.get("room_price", 0) or 0)
    advance = float(ri.get("advance_payment", 0) or 0)
    balance = float(ri.get("balance_payment", 0) or 0)
    room_number = ri.get("room_number") or str(order.get("table_id", "")) or "—"
    room_type = ri.get("room_type", "")
    check_in = ri.get("check_in") or order.get("order_created_at") or ""
    check_out = ri.get("check_out") or order.get("order_updated_at") or ""
    nights = ri.get("nights")
    rate_per_night = ri.get("rate_per_night")

    if not nights and check_in and check_out:
        try:
            ci = datetime.fromisoformat(str(check_in).replace("Z", "+00:00"))
            co = datetime.fromisoformat(str(check_out).replace("Z", "+00:00"))
            nights = max((co - ci).days, 1)
        except (ValueError, TypeError):
            nights = None

    if not rate_per_night and nights and room_price > 0:
        rate_per_night = room_price / nights

    items, food_total = _parse_food_items(order.get("items", []), skip_checkin=True)

    # Tax rate
    gst_tax = ctx["gst_tax"]
    taxable = food_total + room_price - ctx["coupon_discount"] - ctx["loyalty_discount"]
    if gst_tax > 0 and taxable > 0:
        half = round((gst_tax / taxable) * 50, 1)
        ctx["tax_rate_half"] = str(int(half) if half == int(half) else half)

    ctx.update({
        "room_price": room_price, "room_price_display": _fmt(room_price),
        "advance_payment": advance, "advance_display": _fmt(advance),
        "balance_payment": balance, "balance_display": _fmt(balance),
        "room_number": room_number, "room_type": room_type,
        "check_in_display": _format_date_short(check_in),
        "check_out_display": _format_date_short(check_out),
        "nights": nights,
        "rate_per_night": rate_per_night,
        "rate_per_night_display": _fmt(rate_per_night) if rate_per_night else "",
        "items": items, "item_count": len(items),
        "food_total": food_total, "food_total_display": _fmt(food_total),
    })

    token = uuid.uuid4().hex
    template = _jinja_env.get_template("invoice_hotel_room.html")
    html = template.render(**ctx)

    invoice_dir = DATA_DIR / token
    invoice_dir.mkdir(parents=True, exist_ok=True)
    (invoice_dir / "invoice.html").write_text(html, encoding="utf-8")

    return {
        "token": token, "html": html,
        "html_path": str(invoice_dir / "invoice.html"),
        "invoice_number": ctx["invoice_number"],
        "invoice_dir": str(invoice_dir),
        "mode": "hotel_room",
    }


def generate_hotel_folio_html(order, user, customer=None, event_data=None):
    """Pattern B: Guest F&B Folio with day-grouped items."""
    ctx = _build_common_ctx(order, user, customer, event_data)

    items, food_total = _parse_food_items(order.get("items", []), skip_checkin=True)

    # Group by serve_at date
    from collections import OrderedDict
    day_map = OrderedDict()
    for it in items:
        serve = str(it.get("serve_at", ""))[:10]
        if not serve or serve == "None":
            serve = str(order.get("order_created_at", ""))[:10]
        if serve not in day_map:
            day_map[serve] = []
        day_map[serve].append(it)

    days = []
    for date_str in sorted(day_map.keys()):
        day_items = day_map[date_str]
        day_total = sum(it["line_total_raw"] for it in day_items)
        days.append({
            "date_str": date_str,
            "date_display": _format_date_short(date_str),
            "day_items": day_items,
            "total": day_total,
            "total_display": _fmt(day_total),
        })

    stay_days = len(days)
    total_items = len(items)

    # Derive check-in/out from item dates
    all_dates = sorted(day_map.keys())
    check_in_display = _format_date_short(all_dates[0]) if all_dates else ""
    check_out_display = _format_date_short(all_dates[-1]) if all_dates else ""
    room_number = str(order.get("table_id", "")) or ""

    # Tax rate
    gst_tax = ctx["gst_tax"]
    taxable = food_total - ctx["coupon_discount"] - ctx["loyalty_discount"]
    if gst_tax > 0 and taxable > 0:
        half = round((gst_tax / taxable) * 50, 1)
        ctx["tax_rate_half"] = str(int(half) if half == int(half) else half)

    ctx.update({
        "days": days, "stay_days": stay_days, "total_items": total_items,
        "food_total": food_total, "food_total_display": _fmt(food_total),
        "check_in_display": check_in_display, "check_out_display": check_out_display,
        "room_number": room_number,
    })

    token = uuid.uuid4().hex
    template = _jinja_env.get_template("invoice_hotel_folio.html")
    html = template.render(**ctx)

    invoice_dir = DATA_DIR / token
    invoice_dir.mkdir(parents=True, exist_ok=True)
    (invoice_dir / "invoice.html").write_text(html, encoding="utf-8")

    return {
        "token": token, "html": html,
        "html_path": str(invoice_dir / "invoice.html"),
        "invoice_number": ctx["invoice_number"],
        "invoice_dir": str(invoice_dir),
        "mode": "hotel_folio",
    }


def generate_invoice_pdf(token: str, html: str = None) -> str:
    """Generate PDF from invoice HTML using weasyprint. Returns pdf_path."""
    import weasyprint

    invoice_dir = DATA_DIR / token
    pdf_path = invoice_dir / "invoice.pdf"

    if not html:
        html_path = invoice_dir / "invoice.html"
        if html_path.exists():
            html = html_path.read_text(encoding="utf-8")
        else:
            raise FileNotFoundError(f"No HTML found for token {token}")

    wp = weasyprint.HTML(string=html, base_url=str(invoice_dir))
    wp.write_pdf(str(pdf_path))
    return str(pdf_path)


async def create_invoice(db, order: dict, user: dict, customer: dict = None, event_data: dict = None, base_url: str = "") -> dict:
    """
    Full pipeline: generate HTML → generate PDF → store record in invoices collection.
    Returns: { "token", "invoice_number", "invoice_url", "pdf_url" }
    """
    # Check for existing invoice for this order (dedup)
    existing = await db.invoices.find_one({
        "user_id": user["id"],
        "restaurant_order_id": order.get("restaurant_order_id", ""),
    }, {"_id": 0})
    if existing:
        return {
            "token": existing["token"],
            "invoice_number": existing.get("invoice_number", ""),
            "invoice_url": f"{base_url}/api/invoices/{existing['token']}",
            "pdf_url": f"{base_url}/api/invoices/{existing['token']}/pdf",
        }

    # Generate HTML based on detected mode
    mode = _detect_invoice_mode(order)
    if mode == "hotel_room":
        result = generate_hotel_room_html(order, user, customer, event_data)
    elif mode == "hotel_folio":
        result = generate_hotel_folio_html(order, user, customer, event_data)
    else:
        result = generate_invoice_html(order, user, customer, event_data)
    token = result["token"]
    detected_mode = result.get("mode", "food_gst" if user.get("gstin") else "food_receipt")

    # Generate PDF
    pdf_path = generate_invoice_pdf(token, result["html"])

    # Store record
    invoice_doc = {
        "id": str(uuid.uuid4()),
        "token": token,
        "user_id": user["id"],
        "pos_order_id": order.get("pos_order_id", ""),
        "restaurant_order_id": order.get("restaurant_order_id", ""),
        "customer_id": order.get("customer_id", ""),
        "invoice_number": result["invoice_number"],
        "mode": detected_mode,
        "order_type": order.get("order_type", ""),
        "order_amount": float(order.get("order_amount", 0) or 0),
        "html_path": result["html_path"],
        "pdf_path": pdf_path,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.invoices.insert_one(invoice_doc)

    return {
        "token": token,
        "invoice_number": result["invoice_number"],
        "invoice_url": f"{base_url}/api/invoices/{token}",
        "pdf_url": f"{base_url}/api/invoices/{token}/pdf",
    }
