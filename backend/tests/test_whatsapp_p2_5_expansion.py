"""
P2.5: Variable expansion tests — 13 new variables.
"""
from core.whatsapp import resolve_variable
from core.whatsapp_variables import fills_on, WHATSAPP_VARIABLES


def test_variable_count_is_23():
    assert len(WHATSAPP_VARIABLES) == 23


# --- Tier 1: zero-code-change variables ---

def test_order_id():
    assert resolve_variable("order_id", {}, {"order_id": "ORD-123"}, {}) == "ORD-123"

def test_order_id_falls_to_pos_order_id():
    assert resolve_variable("order_id", {}, {"pos_order_id": "POS-456"}, {}) == "POS-456"

def test_old_tier():
    assert resolve_variable("old_tier", {}, {"old_tier": "Silver"}, {}) == "Silver"

def test_old_tier_only_on_upgrade():
    assert fills_on("old_tier", "tier_upgrade") is True
    assert fills_on("old_tier", "birthday") is False

def test_expiring_points():
    assert resolve_variable("expiring_points", {}, {"expiring_points": 150}, {}) == "150"

def test_total_visits():
    assert resolve_variable("total_visits", {"total_visits": 25}, {}, {}) == "25"

def test_total_spent_currency():
    assert resolve_variable("total_spent", {"total_spent": 50000}, {}, {}) == "Rs.50,000"

def test_rating():
    assert resolve_variable("rating", {}, {"rating": 5}, {}) == "5"

def test_rating_only_on_feedback():
    assert fills_on("rating", "feedback_received") is True
    assert fills_on("rating", "birthday") is False


# --- Tier 2: coupon variables (need enriched trigger site) ---

def test_coupon_title():
    assert resolve_variable("coupon_title", {}, {"coupon_title": "Lunch Special"}, {}) == "Lunch Special"

def test_coupon_discount_currency():
    assert resolve_variable("coupon_discount", {}, {"coupon_discount": 150}, {}) == "Rs.150"

def test_coupon_discount_falls_to_discount():
    assert resolve_variable("coupon_discount", {}, {"discount": 200.50}, {}) == "Rs.200.50"

def test_coupon_expiry_formatted():
    assert resolve_variable("coupon_expiry", {}, {"coupon_expiry": "2026-12-31"}, {}) == "31 Dec 2026"

def test_coupon_vars_only_on_coupon_earned():
    for v in ["coupon_title", "coupon_discount", "coupon_expiry"]:
        assert fills_on(v, "coupon_earned") is True
        assert fills_on(v, "birthday") is False


# --- Profile link placeholders ---

def test_instagram_link_from_brand():
    assert resolve_variable("instagram_link", {}, {}, {"instagram_link": "https://ig.com/myplace"}) == "https://ig.com/myplace"

def test_google_review_link_from_brand():
    assert resolve_variable("google_review_link", {}, {}, {"google_review_link": "https://g.page/r/x"}) == "https://g.page/r/x"

def test_feedback_link_from_brand():
    assert resolve_variable("feedback_link", {}, {}, {"feedback_link": "https://forms.gle/abc"}) == "https://forms.gle/abc"

def test_einvoice_link_from_event():
    # einvoice_link can come from event (per-order) or brand (default)
    assert resolve_variable("einvoice_link", {}, {"einvoice_link": "https://inv.com/123"}, {}) == "https://inv.com/123"

def test_einvoice_link_falls_to_brand():
    assert resolve_variable("einvoice_link", {}, {}, {"einvoice_link": "https://inv.com/default"}) == "https://inv.com/default"

def test_profile_links_fill_on_all():
    for v in ["instagram_link", "google_review_link", "feedback_link"]:
        assert fills_on(v, "birthday") is True
        assert fills_on(v, "send_bill") is True


# --- Categories present ---

def test_all_variables_have_category():
    for v in WHATSAPP_VARIABLES:
        assert "category" in v, f"{v['key']} missing category"


# --- Regression: existing P2 variables still work ---

def test_p2_regression_customer_name():
    assert resolve_variable("customer_name", {"name": "Alice"}, {}, {}) == "Alice"

def test_p2_regression_tier_upgrade():
    assert resolve_variable("tier", {"tier": "Bronze"}, {"new_tier": "Gold"}, {}) == "Gold"

def test_p2_regression_restaurant_name():
    assert resolve_variable("restaurant_name", {}, {}, {"restaurant_name": "Cafe"}) == "Cafe"
