# CRM reply — 2026-10-09 — validations accepted · CR-102 shipped · 4 bounce-backs

**Filed:** 2026-10-09 · **Source:** CRM team message (pasted by owner) · **Supersedes nothing; follows our 2026-10-09 validation reply**

## What CRM accepted (closed both sides at consumer-validation level)
CR-098, CR-093 (`country_code` fix acknowledged), CR-089, CR-085-A, CA-3 (→ CRM plans CR-096), CA-6 (→ CR-094 unblocked), CA-7.
Formal closure of 098/093/089 waits on **our owner smoke**; 085-A also waits on POS half.

## CR-102 — shipped on CRM preview, informational
| CRM change | Our code today | Verdict |
|---|---|---|
| `skip-otp` now honours `country_code` (optional, default `+91`); request `{phone, restaurant_id, country_code?}` | `crmService.js:304` sends `country_code: '+91'` | ✅ already compliant, keep |
| skip-otp per-phone limit 5/5 min keyed on canonical number; invalid phone → `400 "Enter a valid mobile number"`, counts against IP 30/min | `LandingPage.jsx:476` 400 → toast + stay on landing; `:482` 429 → Retry-After toast + stay | ✅ handled |
| `lookup` IP limit 10/min checked **before** validation → invalid phone may get `429` not `400` | auto-lookup (`LandingPage.jsx:103`) swallows any error silently; Browse-Menu lookup (`:601`) falls to guest + menu on error | ✅ handled — no diner-visible change |
**No code change required.** Optional re-verify: five plain skip-otp calls + one `+91`-prefixed → sixth returns 429.

## Bounce-backs — CRM says these are ours
| Item | CRM ask | Our position (from memory) |
|---|---|---|
| **CA-2** cutover date | date we stop reading `GET /scan/config/{rid}` + `GET /scan/menu/dietary-tags/{rid}` so CR-095 can remove them | **We never called them** — `grep` of frontend + backend for `scan/config` / `dietary-tags` CRM routes is clean (re-checked 2026-10-09). `customer_app_config` / `dietary_tags_mapping` are **Customer-App-owned** collections per the agreed board (RECONCILIATION_CRM_BOARD_2026-10-03.md §Ours); our backend reads them directly and that is correct. Cutover date = **effective immediately**; CRM may ship CR-095 any time. |
| **CA-4** four collections missing on UAT (our B1) | the names | `pos_event_logs`, `otp_tokens`, `segment_whatsapp_config`, `message_logs`. Already reconciled 2026-10-03: all exist in CRM code, simply never written on UAT. `otp_tokens` row should be **deleted** from the board (CRM's own E3: `customer_otps` is the OTP store). |
| **CA-5** four unclaimed collections (our B2) | confirm CRM's guess `non_qr_blocks`, `status_checks`, `message_logs`, `templates` | **Guess is wrong.** Ours were `coupon_distributions`, `customer_documents`, `import_logs`, `webhook_logs` — all four already claimed **CRM** in the board JSON with code evidence (CR-035/030/071-075). `non_qr_blocks` + `status_checks` are **Customer App** (CRM confirmed `crm:""`); `message_logs` + `templates` are CRM. Nothing left to assign. |
| **CA-8** steps 2–3 date | our wiring + admin-login-to-POS | **Owner decision pending** |

## FYI
`customers` 7700 → 7705 from POS till traffic on CRM test tenant — not our tests. No action.
