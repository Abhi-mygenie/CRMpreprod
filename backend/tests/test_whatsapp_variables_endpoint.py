"""
P1 Item 2 acceptance: GET /api/whatsapp/variables returns the canonical list.
"""
import requests


def test_variables_endpoint_returns_canonical_list():
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip()
                break

    r = requests.get(f"{BASE}/api/whatsapp/variables", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "variables" in data
    keys = {v["key"] for v in data["variables"]}
    expected = {
        # CR-004 P2.5 baseline (23)
        "customer_name", "points_balance", "points_earned", "points_redeemed",
        "wallet_balance", "amount", "tier", "restaurant_name",
        "coupon_code", "expiry_date",
        "order_id", "old_tier", "expiring_points", "total_visits", "total_spent",
        "rating", "coupon_title", "coupon_discount", "coupon_expiry",
        "einvoice_link", "instagram_link", "google_review_link", "feedback_link",
        # CR-015 T5 additions (14, 2026-05-29) — order context
        "payment_method", "order_date", "order_time", "restaurant_order_id",
        "transaction_id", "table_id", "waiter_name", "order_type",
        "loyalty_points_used", "loyalty_discount", "wallet_used",
        "tax_amount", "item_count", "order_notes",
    }
    assert keys == expected, f"Missing: {expected - keys}, Extra: {keys - expected}"
    for v in data["variables"]:
        assert {"key", "label", "example", "description"}.issubset(v.keys())
