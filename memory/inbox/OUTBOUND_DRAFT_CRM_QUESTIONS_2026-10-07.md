# OUTBOUND DRAFT — questions to CRM agent (owner sends; agents never send) — 2026-10-07

Context for CRM: we received `WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md` (Wave 1 rows CR-084 / CR-097 / CR-090).

## Q-A — Diner identity path after OTP removal (validation requested by owner)

On the Customer App, when a diner enters a phone number on the landing page we currently do one of two things, driven by our per-restaurant `skipOtp*` flags:

1. **flag on** → call `POST /scan/auth/skip-otp` silently and continue (no screen);
2. **flag off** → show our `/password-setup` page, which uses `POST /scan/auth/register` (set password) or `POST /scan/auth/login` (password).

With OTP gone (CR-084) and no customer password reset ever (CR-090), please validate:

- (a) Is **`skip-otp` the intended default identity path for all diners**, with the password page kept only as an opt-in for restaurants that want it? Or does CRM expect the password page to remain the default?
- (b) `skip-otp` logs in a password-protected customer **without** the password (contract L4). With no reset flow, a diner who forgets their password can never use the password path again — does CRM consider that acceptable, or should Customer App stop offering password login entirely?
- (c) Does `skip-otp` **create** a customer when the phone is unknown? (Our contract says `lookup` must not create; we need the same clarity for `skip-otp` before we make it the default.)
- (d) Firm date for **CR-096** (feedback hybrid intake) and **CR-093** (`lookup`) — both gate registered Customer App items (CR-2026-10-07-001, CR-2026-10-03-003 fast-follow).

## Not sent yet — CR-084 confirmation

Owner decision: Customer App will **first delete** its quarantined OTP code (CR-2026-10-07-002) and **then** confirm to CRM with evidence. No confirmation goes out before the deletion CR exits.
