"""
Canonical WhatsApp template variable registry.

Single source of truth for variables that owners can map to template placeholders.
This file is the ONLY place to add/remove variables — both frontend pages
fetch from GET /api/whatsapp/variables which serves this list.

P1 scope (2026-05-27): 10 variables, no DB schema binding yet.
DB binding (source collection + field + formatter) is deferred to P2.
"""

WHATSAPP_VARIABLES = [
    {"key": "customer_name",   "label": "Customer Name",   "example": "John",
     "description": "The customer's full name"},
    {"key": "points_balance",  "label": "Points Balance",  "example": "1,250",
     "description": "Current loyalty points balance"},
    {"key": "points_earned",   "label": "Points Earned",   "example": "50",
     "description": "Points earned in this transaction"},
    {"key": "points_redeemed", "label": "Points Redeemed", "example": "100",
     "description": "Points redeemed in this transaction"},
    {"key": "wallet_balance",  "label": "Wallet Balance",  "example": "Rs.500",
     "description": "Current wallet balance"},
    {"key": "amount",          "label": "Amount",          "example": "Rs.1,000",
     "description": "Transaction or order amount"},
    {"key": "tier",            "label": "Customer Tier",   "example": "Gold",
     "description": "Loyalty tier (Bronze/Silver/Gold/Platinum)"},
    {"key": "restaurant_name", "label": "Restaurant Name", "example": "Demo Restaurant",
     "description": "The brand/outlet name"},
    {"key": "coupon_code",     "label": "Coupon Code",     "example": "SAVE20",
     "description": "Coupon code applied or earned"},
    {"key": "expiry_date",     "label": "Expiry Date",     "example": "31 Dec 2026",
     "description": "Points or coupon expiry date"},
]
