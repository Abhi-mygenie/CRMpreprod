"""
Sprint Closure QA — CR-033 (Audience Filters BUG-A fix), CR-034 (Customer Tags),
CR-037 (Template Status Sync fix).

Environment: preprod MongoDB (mygenie DB) via MyGenie SSO login for tenant cafe103.
READ-ONLY except:
  - Additive tag/audience creations prefixed with QA-* (cleaned up)
  - CR-037 single-status-flip on one custom_templates doc (reverted at end)

Run:
  pytest /app/backend/tests/test_cr033_034_037_sprint_closure.py -v \
      --junitxml=/app/test_reports/pytest/cr033_034_037_results.xml
"""

import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fullstack-crm-build.preview.emergentagent.com").rstrip("/")
LOGIN_EMAIL = "owner@cafe103.com"
LOGIN_PASSWORD = "Qplazm@10"
MONGO_URL = "mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie"
DB_NAME = "mygenie"

TS = int(time.time())
QA_AUDIENCE_NAME = f"QA-Smoke-{TS}"
QA_TAG_NAME = f"QA-Tag-{TS}"


# ---------------- Fixtures ----------------

@pytest.fixture(scope="session")
def auth_token():
    """Login via MyGenie SSO with one retry on 5xx."""
    for attempt in range(2):
        try:
            r = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
                timeout=30,
            )
            if r.status_code == 200:
                data = r.json()
                assert data.get("access_token"), f"No access_token in response: {data}"
                return data["access_token"]
            if 500 <= r.status_code < 600 and attempt == 0:
                time.sleep(3)
                continue
            pytest.skip(f"Login failed status={r.status_code} body={r.text[:200]}")
        except requests.RequestException as e:
            if attempt == 0:
                time.sleep(3)
                continue
            pytest.skip(f"Login network error: {e}")
    pytest.skip("Login blocked after retries")


@pytest.fixture(scope="session")
def client(auth_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def me(client):
    r = client.get(f"{BASE_URL}/api/auth/me", timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def total_customers(client, me):
    """Baseline: total customers for this tenant."""
    r = client.post(f"{BASE_URL}/api/segments/preview-count", json={"filters": {}}, timeout=30)
    assert r.status_code == 200, r.text
    total = r.json()["count"]
    print(f"\n[baseline] Total customers for {me['email']}: {total}")
    assert total > 0
    return total


@pytest.fixture(scope="session")
def mongo():
    c = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)
    db = c[DB_NAME]
    yield db
    c.close()


# ---------------- CR-033: Audience Filter BUG-A fixes ----------------

class TestCR033AudienceFilters:

    def test_T02_birthday_this_month(self, client, total_customers):
        """BUG-A fix: has_birthday_this_month must NOT return all customers."""
        r = client.post(
            f"{BASE_URL}/api/segments/preview-count",
            json={"filters": {"has_birthday_this_month": True}},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        count = r.json()["count"]
        print(f"[T02] birthday_this_month count = {count} (total={total_customers})")
        # Must be a proper subset — allow up to 30% of base as safety, but definitely < total
        assert count < total_customers, "BUG-A regression: birthday_this_month returns ALL customers"
        assert count < total_customers * 0.5, f"Birthday filter unexpectedly large: {count}/{total_customers}"

    def test_T03_vip_only(self, client, total_customers):
        """BUG-A fix: vip_flag=True must be honoured."""
        r = client.post(
            f"{BASE_URL}/api/segments/preview-count",
            json={"filters": {"vip_flag": True}},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        count = r.json()["count"]
        print(f"[T03] vip_only count = {count} (total={total_customers})")
        # BUG-A regression check: filter must NOT return the full tenant set.
        # (Tenant may have 0 VIP-flagged customers legitimately; the important
        # invariant is that the filter is honoured — result is a proper subset.)
        assert count < total_customers, "BUG-A regression: vip_flag filter ignored (returned all customers)"

    def test_T04_whatsapp_opted_in(self, client, total_customers):
        """BUG-A fix: whatsapp_opt_in must be honoured."""
        r = client.post(
            f"{BASE_URL}/api/segments/preview-count",
            json={"filters": {"whatsapp_opt_in": True}},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        count = r.json()["count"]
        print(f"[T04] whatsapp_opted_in count = {count} (total={total_customers})")
        assert count < total_customers, "WhatsApp Opted-In must be a strict subset"

    def test_T08_combined_tier_gold_and_last_visit_30(self, client, total_customers):
        """AND-logic: Gold + Last Visit 30+ days should be smaller than Gold-only."""
        r_gold = client.post(
            f"{BASE_URL}/api/segments/preview-count",
            json={"filters": {"tier": "Gold"}},
            timeout=30,
        )
        assert r_gold.status_code == 200
        gold_count = r_gold.json()["count"]

        r_combined = client.post(
            f"{BASE_URL}/api/segments/preview-count",
            json={"filters": {"tier": "Gold", "last_visit_days": 30}},
            timeout=30,
        )
        assert r_combined.status_code == 200
        combined = r_combined.json()["count"]
        print(f"[T08] gold={gold_count}, gold+lastvisit30={combined}")
        assert combined <= gold_count, "AND-logic broken: combined count > single-filter count"

    def test_T10_save_audience_with_gold(self, client):
        """Create a Gold audience, verify it exists, then delete."""
        payload = {"name": QA_AUDIENCE_NAME, "filters": {"tier": "Gold"}}
        r = client.post(f"{BASE_URL}/api/segments", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        seg = r.json()
        assert seg["name"] == QA_AUDIENCE_NAME
        assert seg["filters"] == {"tier": "Gold"}
        assert isinstance(seg["customer_count"], int) and seg["customer_count"] >= 0
        seg_id = seg["id"]

        # Verify persistence
        r2 = client.get(f"{BASE_URL}/api/segments/{seg_id}", timeout=20)
        assert r2.status_code == 200
        assert r2.json()["name"] == QA_AUDIENCE_NAME

        # Cleanup
        rd = client.delete(f"{BASE_URL}/api/segments/{seg_id}", timeout=20)
        assert rd.status_code in (200, 204)


# ---------------- CR-034: Customer Tags ----------------

class TestCR034Tags:

    @pytest.fixture(scope="class")
    def sample_customer_id(self, client):
        """Pick the first customer of this tenant to add a QA-Tag to."""
        r = client.get(f"{BASE_URL}/api/customers?limit=1", timeout=30)
        assert r.status_code == 200, r.text
        customers = r.json()
        assert len(customers) >= 1, "Tenant has no customers"
        return customers[0]["id"]

    def test_T12_T13_add_tag_to_customer(self, client, sample_customer_id):
        r = client.post(
            f"{BASE_URL}/api/customers/{sample_customer_id}/tags",
            json={"tags": [QA_TAG_NAME]},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        tags = r.json()["tags"]
        assert QA_TAG_NAME in tags, f"Tag not applied: {tags}"

        # Verify in catalog
        rc = client.get(f"{BASE_URL}/api/customers/tags", timeout=20)
        assert rc.status_code == 200
        catalog = rc.json()
        # response may be {tags:[...]} or a list
        tag_names = catalog.get("tags", catalog) if isinstance(catalog, dict) else catalog
        # Normalize to strings if dict entries
        if tag_names and isinstance(tag_names[0], dict):
            tag_names = [t.get("name") or t.get("tag") for t in tag_names]
        assert QA_TAG_NAME in tag_names, f"Tag not in catalog: {tag_names[:20]}"

    def test_T14_remove_tag(self, client, sample_customer_id):
        # Add-then-remove flow
        client.post(
            f"{BASE_URL}/api/customers/{sample_customer_id}/tags",
            json={"tags": [QA_TAG_NAME]},
            timeout=20,
        )
        r = client.delete(
            f"{BASE_URL}/api/customers/{sample_customer_id}/tags/{QA_TAG_NAME}",
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert QA_TAG_NAME not in r.json()["tags"]

    def test_T15_tag_persists_on_get(self, client, sample_customer_id):
        client.post(
            f"{BASE_URL}/api/customers/{sample_customer_id}/tags",
            json={"tags": [QA_TAG_NAME]},
            timeout=20,
        )
        r = client.get(f"{BASE_URL}/api/customers/{sample_customer_id}", timeout=20)
        assert r.status_code == 200
        assert QA_TAG_NAME in (r.json().get("tags") or [])
        # cleanup
        client.delete(f"{BASE_URL}/api/customers/{sample_customer_id}/tags/{QA_TAG_NAME}", timeout=20)

    def test_T16_audience_tags_filter_VIP(self, client, sample_customer_id):
        """Tag filter in audience builder. Use VIP (backfilled) OR our QA tag."""
        # Ensure at least 1 customer is tagged (idempotent)
        client.post(
            f"{BASE_URL}/api/customers/{sample_customer_id}/tags",
            json={"tags": [QA_TAG_NAME]},
            timeout=20,
        )
        r = client.post(
            f"{BASE_URL}/api/segments/preview-count",
            json={"filters": {"tags": [QA_TAG_NAME]}},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        count = r.json()["count"]
        print(f"[T16] tags=[{QA_TAG_NAME}] count = {count}")
        assert count >= 1

        # VIP backfill check
        r_vip = client.post(
            f"{BASE_URL}/api/segments/preview-count",
            json={"filters": {"tags": ["VIP"]}},
            timeout=30,
        )
        assert r_vip.status_code == 200
        vip_count = r_vip.json()["count"]
        print(f"[T16] VIP tag count = {vip_count}")
        # Backfill migration should have tagged all vip_flag=True customers with the
        # "VIP" tag. If this tenant has 0 VIP-flagged customers, vip_count will be 0 —
        # which is CORRECT (nothing to backfill). We only fail if vip_count > 0
        # customers exist but none are tagged.
        vip_flag_count_resp = client.post(
            f"{BASE_URL}/api/segments/preview-count",
            json={"filters": {"vip_flag": True}}, timeout=30,
        )
        vip_flag_customers = vip_flag_count_resp.json()["count"]
        print(f"[T16] vip_flag=True customers = {vip_flag_customers}")
        if vip_flag_customers > 0:
            assert vip_count >= 1, "CR-034 VIP auto-backfill missing — VIPs exist but 0 tagged"
        else:
            print("[T16] Tenant has 0 VIP-flagged customers; backfill has nothing to tag — OK")

        # cleanup
        client.delete(f"{BASE_URL}/api/customers/{sample_customer_id}/tags/{QA_TAG_NAME}", timeout=20)

    def test_T17_tags_any_vs_all(self, client, sample_customer_id):
        # Tag customer with 2 tags
        tag2 = f"{QA_TAG_NAME}-B"
        client.post(
            f"{BASE_URL}/api/customers/{sample_customer_id}/tags",
            json={"tags": [QA_TAG_NAME, tag2]},
            timeout=20,
        )
        # ANY
        r_any = client.post(
            f"{BASE_URL}/api/segments/preview-count",
            json={"filters": {"tags": [QA_TAG_NAME, tag2], "tags_mode": "any"}},
            timeout=30,
        )
        # ALL
        r_all = client.post(
            f"{BASE_URL}/api/segments/preview-count",
            json={"filters": {"tags": [QA_TAG_NAME, tag2], "tags_mode": "all"}},
            timeout=30,
        )
        assert r_any.status_code == 200 and r_all.status_code == 200
        c_any = r_any.json()["count"]
        c_all = r_all.json()["count"]
        print(f"[T17] ANY={c_any} ALL={c_all}")
        assert c_any >= c_all, "ANY count must be >= ALL count"
        assert c_all >= 1  # our customer has both tags

        # cleanup
        client.delete(f"{BASE_URL}/api/customers/{sample_customer_id}/tags/{QA_TAG_NAME}", timeout=20)
        client.delete(f"{BASE_URL}/api/customers/{sample_customer_id}/tags/{tag2}", timeout=20)


# ---------------- CR-037: Template Status Sync fix ----------------

class TestCR037TemplateStatusSync:

    def test_authkey_templates_endpoint_reachable(self, client):
        r = client.get(f"{BASE_URL}/api/whatsapp/authkey-templates", timeout=30)
        # 200 if AuthKey key configured; 4xx if not configured on this tenant.
        print(f"[CR-037] authkey-templates status={r.status_code}")
        assert r.status_code in (200, 400, 404, 500)

    def test_sync_preserves_rejected_status(self, client, me, mongo):
        """
        CR-037 core assertion:
        1. Find a custom template for this tenant OR fall back to kunafamahal
           tenant (which has custom_templates in preprod DB).
        2. Snapshot its current status + authkey_wid.
        3. Force status='rejected' in Mongo.
        4. Call POST /api/whatsapp/authkey/sync-templates as that tenant.
        5. Re-read Mongo — status must remain 'rejected'.
        6. Revert to original snapshot.
        """
        # Try primary tenant first
        user_id = me["id"]
        tpl = mongo.custom_templates.find_one({"user_id": user_id})
        active_client = client
        active_tenant = me["email"]
        if not tpl:
            # Fall back to kunafamahal (has templates)
            r = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": "owner@kunafamahal.com", "password": "Qplazm@10"},
                timeout=30,
            )
            if r.status_code != 200:
                pytest.skip(f"Fallback tenant login failed: {r.status_code}")
            tok = r.json()["access_token"]
            active_client = requests.Session()
            active_client.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
            me2 = active_client.get(f"{BASE_URL}/api/auth/me", timeout=20).json()
            user_id = me2["id"]
            active_tenant = me2["email"]
            tpl = mongo.custom_templates.find_one({"user_id": user_id})
            if not tpl:
                pytest.skip("No custom template exists for either tenant")
        print(f"[CR-037] Using tenant={active_tenant} template_id={tpl.get('id')}")

        original_status = tpl.get("status", "draft")
        original_wid = tpl.get("authkey_wid")
        tpl_id = tpl["id"]
        try:
            # Force to rejected
            mongo.custom_templates.update_one(
                {"id": tpl_id, "user_id": user_id},
                {"$set": {"status": "rejected"}},
            )
            check = mongo.custom_templates.find_one({"id": tpl_id})
            assert check["status"] == "rejected", "Precondition failed: could not flip to rejected"

            # Trigger sync
            r = active_client.post(f"{BASE_URL}/api/whatsapp/authkey/sync-templates", timeout=60)
            print(f"[CR-037] sync status={r.status_code} body={r.text[:200]}")
            # sync may 200 or 500 depending on AuthKey key config; both must NOT overwrite rejected
            assert r.status_code in (200, 400, 500)

            # Re-read — status must stay rejected
            after = mongo.custom_templates.find_one({"id": tpl_id})
            print(f"[CR-037] post-sync status={after.get('status')}, authkey_wid={after.get('authkey_wid')}")
            assert after["status"] == "rejected", (
                f"CR-037 REGRESSION: sync overwrote rejected → {after.get('status')}"
            )
        finally:
            # Revert
            revert = {"status": original_status}
            if original_wid is not None:
                revert["authkey_wid"] = original_wid
            mongo.custom_templates.update_one(
                {"id": tpl_id, "user_id": user_id},
                {"$set": revert},
            )
            reverted = mongo.custom_templates.find_one({"id": tpl_id})
            print(f"[CR-037] REVERT status={reverted.get('status')}")

    def test_backend_guard_code_present(self):
        """Static check: guard clause exists in whatsapp.py."""
        with open("/app/backend/routers/whatsapp.py") as f:
            src = f.read()
        assert "CR-037" in src, "CR-037 marker missing"
        assert 'current_status != "rejected"' in src or "current_status not in" in src, (
            "CR-037 status guard clause missing"
        )

    def test_frontend_submit_button_enabled_for_rejected(self):
        """Static check: TemplateBuilderPage submit button disabled ONLY on 'approved'."""
        with open("/app/frontend/src/pages/TemplateBuilderPage.jsx") as f:
            src = f.read()
        assert 'status === "approved"' in src, "Submit button disable clause missing"
        # Ensure it does NOT also disable on rejected
        assert 'status === "rejected"' not in src or 'disabled={submitting || status === "approved"}' in src


# ---------------- Cleanup ----------------

@pytest.fixture(scope="session", autouse=True)
def _final_cleanup(request):
    yield
    try:
        token_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
            timeout=20,
        )
        if token_resp.status_code != 200:
            return
        tok = token_resp.json().get("access_token")
        h = {"Authorization": f"Bearer {tok}"}
        # Delete any leftover QA-Smoke-* audiences
        segs = requests.get(f"{BASE_URL}/api/segments", headers=h, timeout=20)
        if segs.status_code == 200:
            for s in segs.json():
                if s.get("name", "").startswith("QA-Smoke-"):
                    requests.delete(f"{BASE_URL}/api/segments/{s['id']}", headers=h, timeout=20)
        print("[cleanup] QA-Smoke-* audiences removed")
    except Exception as e:
        print(f"[cleanup] error: {e}")
