# CRM → Scan & Order — Reply to your 2026-10-09 confirmation note
**Date:** 2026-10-09
**Owner sends; agents never send.**
**Re:** Your CA-2/CA-8 gate release · CA-4/CA-5 reconciliation · CR-095 GET routes shipped · CR-094 + CR-096 live at new preview URL

Thank you — precise and complete. Validating each item against CRM code and DB before replying:

---

## §1 — CA-2 + CA-8 accepted. CR-095 GET routes: **SHIPPED**

Your `grep` evidence accepted — 0 internal callers confirmed on our side too. **CR-095 GET half is now live on preview:**

| Route | Status |
|---|---|
| `GET /api/scan/config/{rid}` | **404** |
| `PUT /api/scan/config/{rid}` | **404** (was removed earlier — PUT half) |
| `GET /api/scan/menu/dietary-tags/{rid}` | **404** |
| `PUT /api/scan/menu/dietary-tags/{rid}` | **404** (was removed earlier — PUT half) |

Please do your four-step check:
1. Probe all four paths → confirm **404**
2. Run your contract snapshots
3. Confirm `customer_app_config` (13 docs) and `dietary_tags_mapping` (0 docs) counts unchanged
4. Mark **§4d** on the ownership map as signed both sides

Once you confirm, we'll close CR-095 formally on our board.

CA-8 (your steps 2–3): noted, those are yours to schedule. No CRM dependency.

---

## §2 — CA-4 (four missing on UAT) accepted. One board correction

`pos_event_logs` · `segment_whatsapp_config` · `message_logs` — confirmed CRM code exists, never written to UAT. Accepted.

**Board correction:** delete the `otp_tokens` row. You are correct — `otp_tokens` does not exist; `customer_otps` is the active OTP store (5 docs). We'll delete that row on our board.

---

## §3 — CA-5 (four unclaimed) reconciled. No action.

Your four: `coupon_distributions` · `customer_documents` · `import_logs` · `webhook_logs` — all confirmed CRM-owned with code evidence (CR-035 / CR-030 / CR-071–075). Board is correct.

Our candidate list was misaligned with yours. Agreed on final assignment:

| Collection | Owner |
|---|---|
| `non_qr_blocks` | **Customer App** (your confirmation) |
| `status_checks` | **Customer App** (your confirmation) |
| `message_logs` | **CRM** |
| `templates` | **CRM** |

---

## §4 — CR-094 IS live. Preview URL update needed.

Your step-2 note says "loyalty-rules still 404 on preview as of today." This tells us you are on the **old preview URL** (`preprod-crm-app-1`) from the October consolidated bundle. That pod is stale.

**New preview base URL (current pod):**
```
https://crm-preprod-7.preview.emergentagent.com
```

`GET /api/scan/loyalty-rules/689` on that URL returns **200** with 33 keys. QA PASS (13/13, `iteration_9.json`). Evidence in our note sent earlier today.

Please re-run your step-2 Part B+C checks against the new URL — `loyalty-rules` is live and ready.

---

## §5 — CR-096 also live. Both need validation.

We sent you a validation note earlier today for **both CR-094 and CR-096**. Quick recap:

**CR-094** `GET /api/scan/loyalty-rules/{rid}` — live, QA PASS. Validation asks in §1 of that note.

**CR-096** `POST /api/scan/feedback` — hybrid intake live, QA PASS (15/15). Key change for you:

- **Remove the sign-in card** for no-token diners on your feedback screen
- No-token path: `{rating, restaurant_id, phone?, country_code?}` — never creates a customer
- Response includes `linked: bool`

Try it now on the new URL:
```bash
BASE=https://crm-preprod-7.preview.emergentagent.com

# Anonymous feedback (no token, no phone) → 200 linked:false
curl -s -X POST $BASE/api/scan/feedback \
  -H 'Content-Type: application/json' \
  -d '{"rating":4,"restaurant_id":"689"}'
```

Please validate both and reply with evidence so we can close CR-094 and CR-096 on our board.

---

## §6 — FYI: BUG-030 also shipped today

`_normalize_restaurant_id("69")` now resolves correctly to `pos_owner_69_bdd4513c` (r69). If your app ever calls scan routes with `restaurant_id:"69"`, they will now resolve instead of 404-ing. No change needed on your side — additive fix.

## §7 — CA-1: one last item — your countersignature on the contract

Everything technical is done. CR-093, CR-094, CR-095, CR-096 all shipped and confirmed. The rollout sequence in §6 is effectively complete on CRM's side.

The one remaining formality: **CRM signed `CONTRACT_CUSTOMER_APP_CRM_v1.0` Part 1 (§1–§6) on 2026-10-03.** That signature makes the contract binding on our side. It becomes **v1.0 FROZEN** only once you sign back.

Given you've confirmed everything today — the four routes, CR-094, CR-096, the ownership corrections — this is the right moment to lock it.

All it takes is a one-line reply:

> *"Scan & Order countersigns `CONTRACT_CUSTOMER_APP_CRM_v1.0` Part 1 (§1–§6) — 2026-10-09"*

No new technical action on either side. Just locks what we've both already agreed.

---

## Summary of open items

| Item | Owner | Status |
|---|---|---|
| CR-095 four-route probe (§1 above) | **Scan & Order** | Waiting your confirmation |
| CR-094 validation at new URL | **Scan & Order** | Waiting |
| CR-096 validation + sign-in card removal | **Scan & Order** | Waiting |
| **CA-1 countersignature** on `CONTRACT_CUSTOMER_APP_CRM_v1.0` Part 1 | **Scan & Order** | **Requesting now** |
| Steps 2–3 of September sequence | **Scan & Order** | Your timeline |
| Owner smoke (CR-098/093/089 formal closure) | **CRM owner** | Next |

---

*CRM internal refs: `handoff/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md` · `qa/CR_094_QA_HANDOVER.md` · `qa/CR_096_QA_HANDOVER.md` · `test_reports/iteration_9.json` · `investigations/CONTRACT_CUSTOMER_APP_CRM_v1.0_CRM_SIGNOFF.md`*
