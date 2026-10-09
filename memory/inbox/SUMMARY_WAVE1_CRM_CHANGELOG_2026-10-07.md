# SUMMARY — CRM Wave Change Log (received 2026-10-07)

Source: `WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS_2026-10-07.md` (CRM agent). Owner instruction: "we are removing the entire OTP process."

## What CRM is telling us

| CRM item | What changed | Status on CRM side | What they ask of Customer App |
|---|---|---|---|
| **CR-084** | `POST /scan/auth/request-otp` and `POST /scan/auth/verify-otp` **deleted → 404**. Reason: the OTP code was returned in the response body (`dev_otp`), so anyone could mint a customer token | CONFIRMED 2026-10-08, QA pending | **Remove any residual call to the two routes.** No payload changes elsewhere |
| **CR-097** | Staff password routes deleted (`/auth/register`, `/auth/reset-password`, `/auth/forgot-password/*`) → 404. POS is the single owner of staff passwords | CONFIRMED 2026-10-08 | None (POS-facing, informational) |
| **CR-090** | Closed OBSOLETE — CRM will **never** build OTP delivery or customer password reset | closed | Informational: customer identity = POS auth + CRM `skip-otp` / `lookup` |
| Unchanged | `skip-otp` (today's login), `register`, `login` (password), all token-gated `/scan/*` | — | — |
| Coming | **Wave 2:** CR-093 `lookup`, CR-094 loyalty-rules · **Wave 3:** CR-085/086/087, **CR-096 feedback hybrid** · **Wave 4:** CR-095/089/088 | planned | Rows will be added as each is planned; we should re-probe before relying on any |
| Process | This log becomes **Customer App contract v2**, superseding `CONTRACT_CUSTOMER_APP_CRM_v1.0` §4a–4c after all waves close | — | Expect a v2 contract to review/sign |

## Where we stand (checked in code this session)

- **No live call** to `request-otp` / `verify-otp` exists. `crmSendOtp` / `crmVerifyOtp` throw `OTP-DEFERRED` and their bodies are commented out (CR-2026-09-14-001, status SMOKE). `PasswordSetup.jsx` imports are commented. So CR-084's "action for Customer App" is **already satisfied functionally**.
- What is now **stale**: CR-2026-09-14-001 says *"Restore when live"*. CRM-090 says it will never be live. The quarantined code, the `otpRequired*` / `skipOtp*` admin toggles' *OTP* semantics, and contract v1.0 §4 row "quarantined… until CRM confirms live SMS" are all obsolete.
- `crmResetPassword` / `crmForgotPassword` (also quarantined) target routes that are now 404 — dead for good.

## Effect on open items

- **CR-2026-10-03-003 (feedback):** none on the token path. Gap G3 (password page) remains until CR-096. D10=a ruled → follow-up **CR-2026-10-07-001** registered, blocked on CR-096 (Wave 3).
- **CR-2026-09-14-001 (OTP quarantine):** its exit condition ("restore when live") can never be met → needs a successor CR that **deletes** the quarantined code and retires the OTP semantics (see question below).
- **Contract v1.0:** row at line 126 needs a note; full supersession comes with CRM's v2.

## Questions for owner

1. Register a CR to **permanently delete** the OTP-DEFERRED code (`crmSendOtp`, `crmVerifyOtp`, `crmForgotPassword`, `crmResetPassword`, commented PasswordSetup handlers, backend `otp_store`/`generate_otp`/`verify_otp`/`OTPRequest` remnants) and to **rename or retire** the admin `skipOtp*` toggles (they now mean "skip the password page", not "skip OTP")? Or fold it into CR-2026-09-14-001 and re-open that one?
2. The `/password-setup` page is now the only "identity" step for a diner who enters a phone. With OTP gone, is the owner's intent that **every** diner path becomes `skip-otp` (silent login, no password page) — i.e. set all `skipOtp*` flags true by default? That would also close gap G3 for feedback.
3. Shall I draft a one-line **reply to the CRM agent** confirming "no residual OTP calls on Customer App; quarantined since CR-2026-09-14-001; deletion CR to follow"? (Owner sends; agents never send.)
