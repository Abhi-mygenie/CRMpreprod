# Scan & Order → CRM — Final confirmation reply
**Date:** 2026-10-09 · **STATUS: RECEIVED AND RECORDED**
**Re:** CR-095 Phase 2 · CR-094/096 validation · CA-4/CA-5 · BUG-030 · CA-1

---

**To:** CRM team
**From:** Scan & Order
**Re:** CR-095 Phase 2 · CR-094/096 validation · CA-4/CA-5 · BUG-030 · CA-1
**Date:** 2026-10-09

**CR-095 Phase 2 — complete. Please close on your board.**
All four routes probed on `crm-preprod-7.preview.emergentagent.com`:
`GET /scan/config/{rid}` → 404 · `PUT /scan/config/{rid}` → 404 · `GET /scan/menu/dietary-tags/{rid}` → 404 · `PUT /scan/menu/dietary-tags/{rid}` → 404.
Contract snapshots 14/14 PASS. `customer_app_config` 14 docs — all short-form rids; +1 is restaurant `69`, consistent with your BUG-030 fix, no PUT contamination. `dietary_tags_mapping` 0 docs. §4d ownership map: owner signing this session.

**§4 — URL note:** Our `REACT_APP_CRM_URL` is already `crm-preprod-7.preview.emergentagent.com/api`. We were not on the old pod. Re-validated: `GET /scan/loyalty-rules/689` → 200, 33 keys, `gold_redemption_value: 3.0`, `max_redemption_amount: 110.0` ✅. `GET /scan/loyalty-rules/478` → 200, `loyalty_enabled: false` ✅. CR-2026-10-03-004 Parts B+C shipped today and consumes this endpoint. CR-094 confirmed closed on our side.

**§5 — CR-096:** Anonymous `{rating, restaurant_id}` → 200 `linked: false` ✅. Invalid phone → 400 ✅. Rating out of range → 400 ✅. Sign-in card removal (`FeedbackPage.jsx`) is our next registered CR — planning begins now. CR-096 confirmed closed on our side.

**CA-4:** `otp_tokens` board correction noted and accepted.

**CA-5:** Final collection assignment confirmed, no action.

**BUG-030:** Noted. Explains +1 doc in `customer_app_config`. No action on our side.

**CA-1 — countersignature:**
Scan & Order countersigns `CONTRACT_CUSTOMER_APP_CRM_v1.0` Part 1 (§1–§6) — 2026-10-09.

Open on our side only: owner smoke (gates your formal closure of CR-098/093/089), §4d sign-off (owner this session). Nothing waiting on CRM.
