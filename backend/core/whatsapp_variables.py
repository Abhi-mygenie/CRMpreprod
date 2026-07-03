"""
Canonical WhatsApp template variable registry.

37 variables total (23 from CR-004 P2.5 + 14 from CR-015 T5 — 2026-05-29).
+ 3 menu variables from CR-020 (2026-06-05) = 40 total.
Each variable declares sources, fills_on_events, formatter, and block (CR-020).
Resolution at send time by core.whatsapp.resolve_variable().

Variable scopes:
  - "customer": from customer document (always available)
  - "event": from event_data dict (available only on specific events)
  - "brand": from users collection (always available via brand_data injection)

CR-015 T5 additions (2026-05-29): order-context variables populated by
build_order_event_context() in core.whatsapp at POS order-triggered callsites.
See planning/CR_015_PHASE_1_PLAN.md §4.1 for the full table.
"""

ALL_EVENTS = "*"
COUPON_EVENTS = ["coupon_earned"]
EXPIRY_EVENTS = ["points_expiring"]
ORDER_EVENTS = ["send_bill", "send_bill_auto", "send_bill_manual", "new_order_customer"]
FEEDBACK_EVENTS = ["feedback_request"]

WHATSAPP_VARIABLES = [
    # ── General / Customer ────────────────────────────────────────
    {
        "key": "customer_name",
        "label": "Customer Name",
        "example": "John",
        "description": "The customer's full name.",
        "category": "general",
        "block": "customer",
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
        "block": "brand",
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
        "block": "loyalty",
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
        "block": "loyalty",
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
            "welcome_message", "send_bill", "send_bill_auto",
        ],
        "formatter": "integer",
    },
    {
        "key": "points_redeemed",
        "label": "Points Redeemed",
        "example": "100",
        "description": "Points redeemed in this transaction.",
        "category": "loyalty",
        "block": "loyalty",
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
        "block": "loyalty",
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
        "block": "loyalty",
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
        "block": "loyalty",
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
        "block": "loyalty",
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
        "block": "customer",
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
        "block": "customer",
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
        "block": "customer",
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
        "block": "order_bill",
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
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "order_id"},
            {"from": "event", "field": "pos_order_id"},
        ],
        "fills_on_events": ORDER_EVENTS + ["welcome_message"],
        "formatter": None,
    },

    # ── Coupon ────────────────────────────────────────────────────
    {
        "key": "coupon_code",
        "label": "Coupon Code",
        "example": "SAVE20",
        "description": "Coupon code applied or earned.",
        "category": "coupon",
        "block": "coupon",
        "picker": "coupon",
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
        "block": "coupon",
        "picker": "coupon",
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
        "block": "coupon",
        "picker": "coupon",
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
        "block": "coupon",
        "picker": "coupon",
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
        "block": "feedback",
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
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "einvoice_link"},
            {"from": "brand", "field": "einvoice_link"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": None,
    },
    {
        "key": "einvoice_token",
        "label": "E-Invoice Token",
        "example": "c70c5c76dff54277a23144256ba5a543",
        "description": "Invoice token for dynamic URL button suffix.",
        "category": "links",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "einvoice_token"},
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
        "block": "brand",
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
        "block": "brand",
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
        "block": "brand",
        "sources": [
            {"from": "brand", "field": "feedback_link"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },

    # ── CR-015 T5 (2026-05-29): Order-context variables ──
    # Source from event_data populated by build_order_event_context() at POS
    # order-triggered callsites. Backward-compatible: existing templates that
    # don't reference these keys are unaffected.
    {
        "key": "payment_method",
        "label": "Payment Method",
        "example": "UPI",
        "description": "Payment method used (UPI, Card, Cash, etc.). Title-cased for display.",
        "category": "order",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "payment_method"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": "titlecase",
    },
    {
        "key": "order_date",
        "label": "Order Date",
        "example": "25 May 2026",
        "description": "Date the order was placed.",
        "category": "order",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "order_created_at"},
            {"from": "event", "field": "order_date"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": "date",
    },
    {
        "key": "order_time",
        "label": "Order Time",
        "example": "7:45 PM",
        "description": "Time the order was placed (12-hour with AM/PM).",
        "category": "order",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "order_created_at"},
            {"from": "event", "field": "order_time"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": "time",
    },
    {
        "key": "restaurant_order_id",
        "label": "Bill Number",
        "example": "KM-1234",
        "description": "Restaurant's own bill/order number (printed on receipt).",
        "category": "order",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "restaurant_order_id"},
            {"from": "event", "field": "pos_order_id"},
            {"from": "event", "field": "order_id"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": None,
    },
    {
        "key": "transaction_id",
        "label": "Transaction ID",
        "example": "TXN9876543",
        "description": "Payment gateway transaction reference.",
        "category": "order",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "transaction_id"},
        ],
        "fills_on_events": ORDER_EVENTS + ["wallet_credit", "wallet_debit"],
        "formatter": None,
    },
    {
        "key": "table_id",
        "label": "Table Number",
        "example": "T5",
        "description": "Table identifier for dine-in orders.",
        "category": "order",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "table_id"},
            {"from": "event", "field": "table_no"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": None,
    },
    {
        "key": "waiter_name",
        "label": "Waiter Name",
        "example": "Ramesh",
        "description": "Staff member who served the order.",
        "category": "order",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "employee_name"},
            {"from": "event", "field": "waiter_name"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": None,
    },
    {
        "key": "order_type",
        "label": "Order Type",
        "example": "Dine-In",
        "description": "Dine-In, Takeaway, or Delivery (title-cased).",
        "category": "order",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "order_type"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": "titlecase",
    },
    {
        "key": "loyalty_points_used",
        "label": "Loyalty Points Used",
        "example": "200",
        "description": "Loyalty points redeemed on this order.",
        "category": "loyalty",
        "block": "loyalty",
        "sources": [
            {"from": "event", "field": "loyalty_points_used"},
            {"from": "event", "field": "points_redeemed"},
        ],
        "fills_on_events": ORDER_EVENTS + ["points_redeemed"],
        "formatter": "integer",
    },
    {
        "key": "loyalty_discount",
        "label": "Loyalty Discount",
        "example": "Rs.50",
        "description": "₹ discount from loyalty redemption on this order.",
        "category": "loyalty",
        "block": "loyalty",
        "sources": [
            {"from": "event", "field": "loyalty_discount"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": "currency",
    },
    {
        "key": "wallet_used",
        "label": "Wallet Used",
        "example": "Rs.100",
        "description": "Wallet amount applied to this order.",
        "category": "wallet",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "wallet_used"},
            {"from": "event", "field": "amount"},
        ],
        "fills_on_events": ORDER_EVENTS + ["wallet_debit"],
        "formatter": "currency",
    },
    {
        "key": "tax_amount",
        "label": "Tax Amount",
        "example": "Rs.85",
        "description": "Total tax on this order (GST/VAT inclusive).",
        "category": "order",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "tax_amount"},
            {"from": "event", "field": "gst_tax"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": "currency",
    },
    {
        "key": "item_count",
        "label": "Item Count",
        "example": "3",
        "description": "Number of items in the order.",
        "category": "order",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "item_count"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": "integer",
    },
    {
        "key": "order_notes",
        "label": "Order Notes",
        "example": "No onion in biryani",
        "description": "Special instructions or notes for the order.",
        "category": "order",
        "block": "order_bill",
        "sources": [
            {"from": "event", "field": "order_notes"},
        ],
        "fills_on_events": ORDER_EVENTS,
        "formatter": None,
    },

    # ── Menu (CR-020: static owner-bound menu items from POS API) ──────
    {
        "key": "menu_item_name",
        "label": "Menu Item Name",
        "example": "Veg Biryani",
        "description": "Name of a menu item picked by the owner.",
        "category": "menu",
        "block": "menu",
        "picker": "menu_item",
        "sources": [],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
    {
        "key": "menu_item_price",
        "label": "Menu Item Price",
        "example": "Rs.299",
        "description": "Price of a menu item picked by the owner.",
        "category": "menu",
        "block": "menu",
        "picker": "menu_item",
        "sources": [],
        "fills_on_events": ALL_EVENTS,
        "formatter": "currency",
    },
    {
        "key": "menu_category_name",
        "label": "Menu Category Name",
        "example": "Biryani",
        "description": "Name of a menu category picked by the owner.",
        "category": "menu",
        "block": "menu",
        "picker": "menu_category",
        "sources": [],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
]

VARIABLES_BY_KEY = {v["key"]: v for v in WHATSAPP_VARIABLES}

COUPON_VARIABLE_KEYS = {v["key"] for v in WHATSAPP_VARIABLES if v.get("category") == "coupon"}


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
