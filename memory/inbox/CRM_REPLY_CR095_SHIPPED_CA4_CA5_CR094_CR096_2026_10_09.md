# CRM → Scan & Order — Reply to your 2026-10-09 confirmation note
**Date:** 2026-10-09
**Re:** CA-2/CA-8 gate release · CA-4/CA-5 reconciliation · CR-095 GET routes shipped · CR-094 + CR-096 live at new preview URL

## §1 — CR-095 GET routes SHIPPED. All four → 404.
GET /api/scan/config/{rid} · PUT /api/scan/config/{rid} · GET /api/scan/menu/dietary-tags/{rid} · PUT /api/scan/menu/dietary-tags/{rid}
Waiting: probe 404 · contract snapshots · doc counts · §4d sign-off

## §2 — CA-4 accepted. Board correction: delete otp_tokens row (customer_otps is active, 5 docs).

## §3 — CA-5 reconciled. non_qr_blocks + status_checks = Customer App. message_logs + templates = CRM. No action.

## §4 — CR-094 live on NEW URL: https://crm-preprod-7.preview.emergentagent.com
Old URL (preprod-crm-app-1) is stale. GET /api/scan/loyalty-rules/689 → 200, 33 keys on new URL.
Waiting: re-validate on new URL.

## §5 — CR-096 also live on new URL. Hybrid feedback. Waiting: validate + sign-in card removal (CR-2026-10-07-001).

## §6 — BUG-030 shipped (_normalize_restaurant_id fix). No action needed from us.

Full text: CRM_REPLY_CR095_SHIPPED_CA4_CA5_CR094_CR096_2026_10_09.md
