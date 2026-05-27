"""
Canonical WhatsApp template variable registry — P2 enriched.

Each variable declares:
  - key, label, example, description (UI)
  - sources: ordered fallback list (resolver walks until first non-empty)
  - fills_on_events: "*" or list of event keys that reliably populate
                     this variable's sources at trigger time
  - formatter: None | "currency" | "date" | "integer"

Resolution at send time is done by core.whatsapp.resolve_variable().
DO NOT add 'aliases' here — sources is the single source of truth.
"""

ALL_EVENTS = "*"
COUPON_EVENTS = ["coupon_earned"]
EXPIRY_EVENTS = ["points_expiring"]

WHATSAPP_VARIABLES = [
    {
        "key": "customer_name",
        "label": "Customer Name",
        "example": "John",
        "description": "The customer's full name.",
        "sources": [
            {"from": "customer", "field": "name"},
            {"from": "customer", "field": "customer_name"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
    {
        "key": "points_balance",
        "label": "Points Balance",
        "example": "1,250",
        "description": "Current loyalty points balance after this event.",
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
        "sources": [
            {"from": "event", "field": "points_redeemed"},
            {"from": "event", "field": "redeemed_points"},
            {"from": "customer", "field": "total_points_redeemed"},
        ],
        "fills_on_events": ["points_redeemed"],
        "formatter": "integer",
    },
    {
        "key": "wallet_balance",
        "label": "Wallet Balance",
        "example": "Rs.500",
        "description": "Current wallet balance after this event.",
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
    {
        "key": "tier",
        "label": "Customer Tier",
        "example": "Gold",
        "description": "Loyalty tier (Bronze/Silver/Gold/Platinum).",
        "sources": [
            {"from": "event", "field": "new_tier"},
            {"from": "customer", "field": "tier"},
            {"from": "customer", "field": "membership_tier"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
    {
        "key": "restaurant_name",
        "label": "Restaurant Name",
        "example": "Demo Restaurant",
        "description": "The brand/outlet name.",
        "sources": [
            {"from": "brand", "field": "restaurant_name"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
    {
        "key": "coupon_code",
        "label": "Coupon Code",
        "example": "SAVE20",
        "description": "Coupon code applied or earned.",
        "sources": [
            {"from": "event", "field": "coupon_code"},
        ],
        "fills_on_events": COUPON_EVENTS,
        "formatter": None,
    },
    {
        "key": "expiry_date",
        "label": "Expiry Date",
        "example": "31 Dec 2026",
        "description": "Points or coupon expiry date.",
        "sources": [
            {"from": "event", "field": "expiry_date"},
        ],
        "fills_on_events": EXPIRY_EVENTS,
        "formatter": "date",
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
