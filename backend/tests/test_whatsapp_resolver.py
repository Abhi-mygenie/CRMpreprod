"""
P2: resolver + registry tests.
Covers Addendum A 1.5 fixes and AC-2 through AC-9.
"""
from core.whatsapp import build_body_values, resolve_variable
from core.whatsapp_variables import fills_on


# --- resolve_variable direct tests ---

def test_customer_name_from_customer():
    assert resolve_variable("customer_name", {"name": "Alice"}, {}, {}) == "Alice"

def test_points_earned_from_event():
    assert resolve_variable("points_earned", {}, {"points_earned": 50}, {}) == "50"

def test_points_earned_falls_to_bonus():
    assert resolve_variable("points_earned", {}, {"birthday_bonus": 100}, {}) == "100"

def test_tier_uses_new_tier_from_event():
    assert resolve_variable("tier", {"tier": "Bronze"}, {"new_tier": "Gold"}, {}) == "Gold"

def test_tier_falls_back_to_customer():
    assert resolve_variable("tier", {"tier": "Silver"}, {}, {}) == "Silver"

def test_restaurant_name_from_brand():
    assert resolve_variable("restaurant_name", {}, {}, {"restaurant_name": "Demo Cafe"}) == "Demo Cafe"

def test_restaurant_name_blank_without_brand():
    assert resolve_variable("restaurant_name", {}, {}, {}) == ""

def test_amount_currency_formatter():
    assert resolve_variable("amount", {}, {"amount": 1500}, {}) == "Rs.1,500"

def test_amount_falls_back_to_order_amount():
    assert resolve_variable("amount", {}, {"order_amount": 750.50}, {}) == "Rs.750.50"

def test_wallet_balance_zero():
    assert resolve_variable("wallet_balance", {"wallet_balance": 0}, {}, {}) == "Rs.0"

def test_points_balance_integer_formatter():
    assert resolve_variable("points_balance", {"total_points": 1250}, {}, {}) == "1,250"

def test_coupon_code_from_event():
    assert resolve_variable("coupon_code", {}, {"coupon_code": "SAVE20"}, {}) == "SAVE20"

def test_expiry_date_iso_formatted():
    assert resolve_variable("expiry_date", {}, {"expiry_date": "2026-12-31T00:00:00Z"}, {}) == "31 Dec 2026"

def test_unknown_variable():
    assert resolve_variable("nonexistent", {}, {}, {}) == ""


# --- build_body_values integration ---

def test_build_with_resolver_and_brand():
    body = build_body_values(
        ["{{1}}", "{{2}}", "{{3}}"],
        {"{{1}}": "customer_name", "{{2}}": "restaurant_name", "{{3}}": "amount"},
        {"name": "Eve"}, {"amount": 1000}, {"{{1}}": "map", "{{2}}": "map", "{{3}}": "map"},
        {"restaurant_name": "Pizza Hub"},
    )
    assert body == {"1": "Eve", "2": "Pizza Hub", "3": "Rs.1,000"}

def test_text_mode_still_works():
    body = build_body_values(
        ["{{1}}"], {"{{1}}": "Hello literal"}, {"name": "X"}, {}, {"{{1}}": "text"}, {},
    )
    assert body == {"1": "Hello literal"}


# --- fills_on coverage ---

def test_fills_on_universal():
    assert fills_on("customer_name", "birthday") is True
    assert fills_on("customer_name", "wallet_credit") is True

def test_fills_on_coupon_code():
    assert fills_on("coupon_code", "coupon_earned") is True
    assert fills_on("coupon_code", "birthday") is False

def test_fills_on_expiry_date():
    assert fills_on("expiry_date", "points_expiring") is True
    assert fills_on("expiry_date", "birthday") is False
