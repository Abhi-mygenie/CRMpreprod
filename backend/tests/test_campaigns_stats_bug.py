"""BUG-011 extension: /api/campaigns must return augmented delivered/read/failed."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-preprod-preview-4.preview.emergentagent.com").rstrip("/")
EMAIL = "owner@jehsnest.com"
PASSWORD = "Qplazm@10"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_health(headers):
    r = requests.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code in (200, 204)


def test_campaigns_list_augments_stats(headers):
    r = requests.get(f"{BASE_URL}/api/campaigns", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    camps = r.json()
    assert isinstance(camps, list)
    assert len(camps) > 0, "expected some campaigns for owner@jehsnest.com"

    # Each campaign should have the stat fields
    for c in camps:
        for k in ("total_sent", "total_delivered", "total_read", "total_failed"):
            assert k in c, f"campaign {c.get('name')} missing {k}"

    # At least one campaign that had messages sent should now show non-zero delivered/read/failed
    sent_camps = [c for c in camps if (c.get("total_sent") or 0) > 0]
    assert sent_camps, "expected some campaigns to have total_sent > 0"

    non_zero_metric = [
        c for c in sent_camps
        if (c.get("total_delivered") or 0) > 0
        or (c.get("total_read") or 0) > 0
        or (c.get("total_failed") or 0) > 0
    ]
    assert non_zero_metric, (
        "expected at least one sent campaign to have non-zero delivered/read/failed; "
        f"first 5 sent campaigns: {[{k: c.get(k) for k in ('name','total_sent','total_delivered','total_read','total_failed')} for c in sent_camps[:5]]}"
    )


def test_campaigns_testing6_specifically(headers):
    """Per agent note: 'Testing 6' should show sent=6 del=6 read=3 fail=1."""
    r = requests.get(f"{BASE_URL}/api/campaigns", headers=headers, timeout=30)
    assert r.status_code == 200
    camps = r.json()
    t6 = next((c for c in camps if c.get("name") == "Testing 6"), None)
    if not t6:
        pytest.skip("'Testing 6' campaign not found for this tenant")
    assert t6.get("total_sent", 0) > 0
    assert t6.get("total_delivered", 0) > 0 or t6.get("total_read", 0) > 0, (
        f"Testing 6 stats: {t6}"
    )


def test_history_all_still_augmented(headers):
    """Regression: BUG-011 endpoint still works."""
    r = requests.get(f"{BASE_URL}/api/campaigns/history/all", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    runs = r.json()
    assert isinstance(runs, list)
    if runs:
        for run in runs:
            for k in ("total_sent", "total_delivered", "total_read"):
                assert k in run
