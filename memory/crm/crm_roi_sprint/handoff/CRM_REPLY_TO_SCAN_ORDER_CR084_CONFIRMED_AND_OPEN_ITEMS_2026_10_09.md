**To:** Scan & Order (Customer App) team
**From:** CRM team
**Re:** CR-084 — confirmation received, aligned · what is still open from your side
**Date:** 2026-10-09

Thanks — your 2026-10-08 note is recorded as the consumer confirmation for **CR-084** (`final/CR_084_CR_097_CLOSURE.md`, change-log row). Both sides CLOSED. `CR-2026-09-14-001` "restore when live" voided on our records too; `customer_otps` is no longer written by CRM (5 legacy docs remain, drop deferred to the hygiene CR).

One alignment check on what you deleted: `crmForgotPassword` / `crmResetPassword` — CRM never exposed a customer forgot/reset-password route (INV-017), and the staff `/auth/forgot-password/*` + `PUT /auth/reset-password` routes were removed under **CR-097** the same day. So those deletions are correct; nothing to restore.

### Still open from your side (sent 2026-10-08 / 10-09, no reply yet)
| # | CRM item | What we need from you | Doc we sent |
|---|---|---|---|
| 1 | **CR-098** customer password routes retired (`POST /scan/auth/register`, `POST /scan/auth/login` → 404) | Confirm `PasswordSetup.jsx` / any password login path no longer calls them; skip-otp is your only login | `CRM_TO_SCAN_ORDER_CR098_SHIPPED_PLEASE_VALIDATE_2026_10_08.md` |
| 2 | **CR-093** `POST /scan/auth/lookup` live | Validate `{phone, country_code?, restaurant_id}` → `{exists, name}`; 400 on bad input; 429 + `Retry-After` on limits | `CRM_TO_SCAN_ORDER_CR093_LOOKUP_LIVE_PLEASE_VALIDATE_2026_10_08.md` |
| 3 | **CR-089** skip-otp rate limit (30/min/IP, 5/5 min/phone) | Confirm your retry/backoff handles 429 + `Retry-After` | `CRM_TO_SCAN_ORDER_CR089_SKIP_OTP_RATE_LIMIT_PLEASE_VALIDATE_2026_10_09.md` |
| 4 | **CR-085-A** canonical phone on skip-otp + lookup | Validate: `"98387 77712"` logs into the same record as `9838777712`; `0000000000` → `400 "Enter a valid mobile number"` (new) — make sure your UI shows that message | `CRM_TO_SCAN_ORDER_AND_POS_CR085A_LIVE_PLEASE_VALIDATE_2026_10_09.md` |
| 5 | Contract items **CA-1 … CA-9** (countersignature of CONTRACT v1.0 Part 1, Q-CA-1 cutover date for `/scan/config` + `dietary-tags` GETs, A9-b feedback confirmation, B1/B2 collection names, CR-094 per-tier earn fields, inert Call-Waiter/Pay-Bill acknowledgement, rollout §6 dates) | Answers | `SESSION_2026_10_03_HANDOVER_CONTRACT_V1_CUSTOMER_APP.md` §CA |

### FYI (no action)
- **CR-085-A2** shipped 2026-10-09: POS bills with junk/blank phones are now guest orders (`customer_id:null`). Affects `/scan/orders` only in that such orders never appear under any customer — by design.
- Known minor on our side (BUG-025, registered): skip-otp per-phone limit can currently be exceeded by prefixing `+91`/`0`; fix queued. Does not affect you.

Items 1–4 are the last gate before we formally close CR-098 / 093 / 089 / 085-A. A one-line "validated on preview, date" per item is enough.
