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
        "customer_name", "points_balance", "points_earned", "points_redeemed",
        "wallet_balance", "amount", "tier", "restaurant_name",
        "coupon_code", "expiry_date",
    }
    assert keys == expected, f"Missing: {expected - keys}, Extra: {keys - expected}"
    for v in data["variables"]:
        assert {"key", "label", "example", "description"}.issubset(v.keys())
