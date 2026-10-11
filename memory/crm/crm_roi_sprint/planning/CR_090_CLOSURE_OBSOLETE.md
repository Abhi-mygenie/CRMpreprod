# CR-090 — Closure note: OBSOLETE
## Customer OTP delivery provider + customer forgot/reset-password

**Date**: 2026-10-08 · **Ruling**: Owner ("CR-090 → close as obsolete (nothing left to deliver OTPs for)")
**Prior state**: 🔴 BLOCKED — P2, HIGH, blocked on Q1 (delivery channel)

## Why obsolete
| Original need (INV-017 GAP-04/05) | What happened |
|---|---|
| Deliver customer OTPs via SMS/WhatsApp so `dev_otp` can leave the response | **CR-084 deletes the customer OTP flow entirely.** No OTP to deliver. |
| Customer forgot/reset-password | Customer App authenticates against MyGenie POS (INV-022 C1 option a, Contract v1.0). CRM is not the customer IdP. Customer password login in `scan.py` (`/auth/register`, `/auth/login` with `password_hash`, 2 docs) is a legacy path the Customer App does not use. |
| Staff OTP via WhatsApp `reset_password` event | **CR-097 removes** staff forgot-password + the WA event. Staff password is owned by POS. |

## Open questions — all void
Q1 channel · Q2 platform vs per-tenant sender · Q3 priority — no longer apply.

## If a customer password-reset need ever returns
It would be a **new CR** against the Customer App ↔ POS auth contract, not a revival of CR-090.

## Registry
`CR_STATUS_DASHBOARD.md` row 090 → ⚫ CLOSED-OBSOLETE (2026-10-08). Transition logged.
