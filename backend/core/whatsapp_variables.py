"""
Canonical WhatsApp template variable registry — P2.5 expanded.

23 variables total (10 original + 13 new).
Each variable declares sources, fills_on_events, formatter.
Resolution at send time by core.whatsapp.resolve_variable().

Variable scopes:
  - "customer": from customer document (always available)
  - "event": from event_data dict (available only on specific events)
  - "brand": from users collection (always available via brand_data injection)
"""

ALL_EVENTS = "*"
COUPON_EVENTS = ["coupon_earned"]
EXPIRY_EVENTS = ["points_expiring"]
ORDER_EVENTS = ["send_bill", "send_bill_auto", "send_bill_manual", "new_order_customer"]
FEEDBACK_EVENTS = ["feedback_received"]

WHATSAPP_VARIABLES = [
    # ── General / Customer ────────────────────────────────────────
    {
        "key": "customer_name",
        "label": "Customer Name",
        "example": "John",
        "description": "The customer's full name.",
        "category": "general",
        "sources": [
            {"from": "customer", "field": "name"},
            {"from": "customer", "field": "customer_name"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
    {
        "key": "restaurant_name",
        "label": "Restaurant Name",
        "example": "Demo Restaurant",
        "description": "The brand/outlet name.",
        "category": "general",
        "sources": [
            {"from": "brand", "field": "restaurant_name"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },

    # ── Loyalty / Points ──────────────────────────────────────────
    {
        "key": "points_balance",
        "label": "Points Balance",
        "example": "1,250",
        "description": "Current loyalty points balance after this event.",
        "category": "loyalty",
        "sources": [
            {"from": "event", "field": "points_balance"},
            {"from": "event", "field": "balance_after"},
            {"from": "customer", "field": "total_points"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": "integer",
    },
    {
        "key": "points_earned",
        "label": "Points Earned",
        "example": "50",
        "description": "Points earned in this transaction.",
        "category": "loyalty",
        "sources": [
            {"from": "event", "field": "points_earned"},
            {"from": "event", "field": "points"},
            {"from": "event", "field": "bonus_points"},
            {"from": "event", "field": "birthday_bonus"},
            {"from": "event", "field": "anniversary_bonus"},
            {"from": "event", "field": "first_visit_bonus"},
        ],
        "fills_on_events": [
            "points_earned", "bonus_points", "birthday", "anniversary",
            "first_visit", "welcome_message", "send_bill", "send_bill_auto",
        ],
        "formatter": "integer",
    },
    {
        "key": "points_redeemed",
        "label": "Points Redeemed",
        "example": "100",
        "description": "Points redeemed in this transaction.",
        "category": "loyalty",
        "sources": [
            {"from": "event", "field": "points_redeemed"},
            {"from": "event", "field": "redeemed_points"},
            {"from": "customer", "field": "total_points_redeemed"},
        ],
        "fills_on_events": ["points_redeemed"],
        "formatter": "integer",
    },
    {
        "key": "tier",
        "label": "Customer Tier",
        "example": "Gold",
        "description": "Loyalty tier (Bronze/Silver/Gold/Platinum).",
        "category": "loyalty",
        "sources": [
            {"from": "event", "field": "new_tier"},
            {"from": "customer", "field": "tier"},
            {"from": "customer", "field": "membership_tier"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
    {
        "key": "old_tier",
        "label": "Previous Tier",
        "example": "Silver",
        "description": "Tier before upgrade (only on tier_upgrade event).",
        "category": "loyalty",
        "sources": [
            {"from": "event", "field": "old_tier"},
        ],
        "fills_on_events": ["tier_upgrade"],
        "formatter": None,
    },
    {
        "key": "expiring_points",
        "label": "Expiring Points",
        "example": "150",
        "description": "Number of points about to expire.",
        "category": "loyalty",
        "sources": [
            {"from": "event", "field": "expiring_points"},
        ],
        "fills_on_events": EXPIRY_EVENTS,
        "formatter": "integer",
    },
    {
        "key": "expiry_date",
        "label": "Expiry Date",
        "example": "31 Dec 2026",
        "description": "Points or coupon expiry date.",
        "category": "loyalty",
        "sources": [
            {"from": "event", "field": "expiry_date"},
        ],
        "fills_on_events": EXPIRY_EVENTS,
        "formatter": "date",
    },
    {
        "key": "total_visits",
        "label": "Total Visits",
        "example": "25",
        "description": "Customer's lifetime visit count.",
        "category": "loyalty",
        "sources": [
            {"from": "customer", "field": "total_visits"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": "integer",
    },
    {
        "key": "total_spent",
        "label": "Total Spent",
        "example": "Rs.50,000",
        "description": "Customer's lifetime spend.",
        "category": "loyalty",
        "sources": [
            {"from": "customer", "field": "total_spent"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": "currency",
    },

    # ── Wallet ────────────────────────────────────────────────────
    {
        "key": "wallet_balance",
        "label": "Wallet Balance",
        "example": "Rs.500",
        "description": "Current wallet balance after this event.",
        "category": "wallet",
        "sources": [
            {"from": "event", "field": "wallet_balance"},
            {"from": "customer", "field": "wallet_balance"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": "currency",
    },
    {
        "key": "amount",
        "label": "Amount",
        "example": "Rs.1,000",
        "description": "Transaction or order amount.",
        "category": "wallet",
        "sources": [
            {"from": "event", "field": "amount"},
            {"from": "event", "field": "order_amount"},
            {"from": "event", "field": "bill_amount"},
            {"from": "event", "field": "discount"},
            {"from": "customer", "field": "total_spent"},
        ],
        "fills_on_events": [
            "send_bill", "send_bill_auto", "send_bill_manual",
            "wallet_credit", "wallet_debit", "coupon_earned",
            "new_order_customer",
        ],
        "formatter": "currency",
    },

    # ── Order ─────────────────────────────────────────────────────
    {
        "key": "order_id",
        "label": "Order ID",
        "example": "ORD-12345",
        "description": "Order reference number.",
        "category": "order",
        "sources": [
            {"from": "event", "field": "order_id"},
            {"from": "event", "field": "pos_order_id"},
        ],
        "fills_on_events": ORDER_EVENTS + ["first_visit"],
        "formatter": None,
    },

    # ── Coupon ────────────────────────────────────────────────────
    {
        "key": "coupon_code",
        "label": "Coupon Code",
        "example": "SAVE20",
        "description": "Coupon code applied or earned.",
        "category": "coupon",
        "sources": [
            {"from": "event", "field": "coupon_code"},
        ],
        "fills_on_events": COUPON_EVENTS,
        "formatter": None,
    },
    {
        "key": "coupon_title",
        "label": "Coupon Title",
        "example": "Lunch Special",
        "description": "Human-readable coupon name.",
        "category": "coupon",
        "sources": [
            {"from": "event", "field": "coupon_title"},
        ],
        "fills_on_events": COUPON_EVENTS,
        "formatter": None,
    },
    {
        "key": "coupon_discount",
        "label": "Coupon Discount",
        "example": "Rs.150",
        "description": "Amount saved with this coupon.",
        "category": "coupon",
        "sources": [
            {"from": "event", "field": "coupon_discount"},
            {"from": "event", "field": "discount"},
        ],
        "fills_on_events": COUPON_EVENTS,
        "formatter": "currency",
    },
    {
        "key": "coupon_expiry",
        "label": "Coupon Expiry",
        "example": "31 Dec 2026",
        "description": "Coupon validity end date.",
        "category": "coupon",
        "sources": [
            {"from": "event", "field": "coupon_expiry"},
        ],
        "fills_on_events": COUPON_EVENTS,
        "formatter": "date",
    },

    # ── Feedback ──────────────────────────────────────────────────
    {
        "key": "rating",
        "label": "Feedback Rating",
        "example": "5",
        "description": "Customer's feedback star rating.",
        "category": "feedback",
        "sources": [
            {"from": "event", "field": "rating"},
        ],
        "fills_on_events": FEEDBACK_EVENTS,
        "formatter": None,
    },

    # ── Profile Links (brand-level, managed from restaurant profile) ──
    {
        "key": "einvoice_link",
        "label": "E-Invoice Link",
        "example": "https://invoice.example.com/bill/123",
        "description": "Link to the bill PDF / e-invoice.",
        "category": "links",
        "sources": [
            {"from": "event", "field": "einvoice_link"},
            {"from": "brand", "field": "einvoice_link"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": None,
    },
    {
        "key": "instagram_link",
        "label": "Instagram Link",
        "example": "https://instagram.com/myrestaurant",
        "description": "Restaurant's Instagram page link.",
        "category": "links",
        "sources": [
            {"from": "brand", "field": "instagram_link"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
    {
        "key": "google_review_link",
        "label": "Google Review Link",
        "example": "https://g.page/r/myrestaurant/review",
        "description": "Link for customers to leave a Google review.",
        "category": "links",
        "sources": [
            {"from": "brand", "field": "google_review_link"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
    {
        "key": "feedback_link",
        "label": "Feedback Form Link",
        "example": "https://forms.google.com/myform",
        "description": "Link to web feedback form or Google Form.",
        "category": "links",
        "sources": [
            {"from": "brand", "field": "feedback_link"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
]

VARIABLES_BY_KEY = {v["key"]: v for v in WHATSAPP_VARIABLES}


def get_variable(key):
    """Return the registry entry for a variable key, or None."""
    return VARIABLES_BY_KEY.get(key)


def fills_on(var_key, event_key):
    """Return True if the variable reliably fills on the given event."""
    v = VARIABLES_BY_KEY.get(var_key)
    if not v:
        return False
    fills = v.get("fills_on_events")
    if fills == ALL_EVENTS:
        return True
    return event_key in (fills or [])
