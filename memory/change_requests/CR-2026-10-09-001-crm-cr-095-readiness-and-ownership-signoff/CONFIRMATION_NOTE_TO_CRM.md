# CONFIRMATION NOTE TO CRM — CR-2026-10-09-001 (your CR-095) + CA-4 / CA-5

**Status:** DRAFT for owner to send · **Date:** 2026-10-09 · **Answers:** CA-2 · CA-4 · CA-5 · CA-8

---

**To:** CRM team
**From:** Scan & Order (Customer App) team
**Re:** Your 2026-10-09 reply — CR-102 noted · the four bounce-backs answered · **CR-095 released from the gate**
**Date:** 2026-10-09

Thanks — all accepted on our side too. CR-102 checked against our code: we already send `country_code: "+91"` on `skip-otp`, and our 400 / 429-with-`Retry-After` handling on both `skip-otp` and `lookup` covers the limiter changes. No change needed; we'll keep sending `country_code`.

## CA-2 + CA-8 — same answer: CR-095 is released. Ship it.

Owner ruling 2026-10-09: **CR-095 is decoupled from steps 2–3 of the September sequence. Remove the four routes whenever your gate opens.** Our steps 2–3 continue on their own CRs and no longer hold you.

Evidence that nothing of ours depends on them (re-verified today, read-only):

| Check | Result |
|---|---|
| `grep -rn "scan/config\|scan/menu/dietary"` across `frontend/src`, `backend/`, `backend/tests` | **0 hits** — no caller, no contract test, no fixture |
| What we actually read | our own `GET /api/config/{rid}` and `GET /api/dietary-tags/{rid}` → straight to the two collections we own |
| UAT `customer_app_config` | 13 docs, all short-form `restaurant_id` — none written by your PUT (your B3 concern is moot) |
| UAT `dietary_tags_mapping` | 0 docs |

Routes in scope, as per your board JSON: `GET`+`PUT /scan/config/{rid}` (`scan.py:717,740`) and `GET`+`PUT /scan/menu/dietary-tags/{rid}` (`scan.py:772,785`). One ask: please tell us when it has shipped. We will then (a) probe the four paths for 404, (b) run our contract snapshots, (c) confirm doc counts unchanged, and (d) mark **§4d** on the ownership map as signed both sides. The map's overall status stays DRAFT — that waits on POS and a separate owner item, not on you.

For the record, our steps 2–3 status: step 2 Part A done (`check-customer` → `lookup`); Parts B+C await **CR-094** (`loyalty-rules` still 404 on preview as of today); 13 dead routes tracked separately; step 3 (admin login → POS) unscheduled. None of it touches your four routes.

## CA-4 — the four collections "missing on UAT" (our B1)

`pos_event_logs` · `otp_tokens` · `segment_whatsapp_config` · `message_logs`

This was already reconciled on 2026-10-03 against your board JSON: all four exist in CRM **code** and had simply never been written on UAT, so Mongo had not created them. Not a gap. One correction for the board: your own E3 says `otp_tokens` does not exist and `customer_otps` is the OTP store — so the `otp_tokens` row should be **deleted**, not assigned.

## CA-5 — the four "unclaimed" collections (our B2)

Your candidate list (`non_qr_blocks`, `status_checks`, `message_logs`, `templates`) is not what we meant. Ours were:

`coupon_distributions` · `customer_documents` · `import_logs` · `webhook_logs`

All four are already claimed **CRM** in your board JSON with code evidence (CR-035 / CR-030 / CR-071-075). Nothing left to assign. On your candidates: `non_qr_blocks` and `status_checks` are **Customer App** (you confirmed `crm:""` on both); `message_logs` and `templates` are CRM. All consistent with the JSON — no action.

## FYI acknowledged

`customers` 7700 → 7705 from POS till traffic — noted, no action.

---

Open on our side, not yours: owner smoke on the six shipped items (gates formal closure of 098 / 093 / 089), and CA-1 countersignature (owner).
