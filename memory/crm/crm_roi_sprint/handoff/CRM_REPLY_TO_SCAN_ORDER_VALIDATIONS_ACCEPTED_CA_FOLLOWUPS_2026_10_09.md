**To:** Scan & Order (Customer App) team
**From:** CRM team
**Re:** Your 2026-10-09 reply — validations accepted · 3 items bounce back to you · skip-otp hardening shipped
> **STATUS: FINAL VERSION SENT by owner 2026-10-09** (includes the shipped-today addendum for BUG-025 / BUG-029 / CR-102). Awaiting their answers on CA-2 / CA-4 / CA-5 / CA-8.
**Date:** 2026-10-09

Thank you — fast and precise. Status after checking every claim against CRM code and the preview DB:

## Accepted — consumer validation CLOSED on both sides
- **§2 CR-098** ✅ (your skip-otp runs on 478/689 matched existing records; nothing new created — good)
- **§3 CR-093** ✅ (DB confirms `MYGENieT`; thanks for adding `country_code` — correct fix)
- **§4 CR-089** ✅ (retry-with-`Retry-After` + toast behaviour is exactly what we wanted)
- **§5 CR-085-A** ✅
- **CA-3** ✅ → CRM now starts planning **CR-096** (hybrid no-token feedback). Until it ships, your sign-in card for no-token diners is the right behaviour.
- **CA-6** ✅ → **CR-094** planning unblocked. **CA-7** ✅ noted.
CRM closes 098/093/089 formally after the owner's smoke test; 085-A also waits for the POS half.

## Shipped today on preview — informational, no change needed on your side
Your §5 showed you send `country_code` on `skip-otp`; our schema was silently dropping it. Fixed and QA'd (CR-102), together with two limiter tightenings:
- `POST /scan/auth/skip-otp` now **accepts and honours `country_code`** (optional, default `"+91"`) — **keep sending it**. Request is now `{phone, restaurant_id, country_code?}` (contract v1.1 additive note).
- skip-otp per-phone limit (5 / 5 min) is now keyed on the canonical number, so `+91 98387…`, `098387…` and `98387 77712` share one bucket. Invalid phones still count against the IP limit (30 / min) and return `400 "Enter a valid mobile number"`.
- `POST /scan/auth/lookup` now checks the IP limit (10 / min) **before** phone validation — an invalid phone can return `429` instead of `400` once an IP's quota is spent. Response shapes unchanged.
Your retry/toast handling already covers all of this. If you want to re-verify: one `+91`-prefixed skip-otp after five plain ones should now give `429`.

## Bounce-backs — these need YOUR side, not the CRM owner
| Item | Why it's yours | What we need |
|---|---|---|
| **CA-2** cutover date | The date is when *you* stop reading `GET /scan/config/{rid}` + `GET /scan/menu/dietary-tags/{rid}` directly. CRM's CR-095 GET removal waits for it. | a target date |
| **CA-4** four collections "missing on UAT" | This came from *your* 2026-10-03 message (B1). We can't check UAT without the names. | the four names |
| **CA-5** four "unclaimed" collections | Also your item (B2). Our scan's candidates: `non_qr_blocks`, `status_checks`, `message_logs`, `templates`. | confirm or correct |
| **CA-8** steps 2–3 date | CRM's step-1 wave has shipped (084/097/098/093/089/085-A). The remaining dates are your wiring + admin-login-to-POS. | a target date |

## For the CRM owner (not you)
CA-1 countersignature — forwarded to the owner.

## FYI
`customers` count moved 7700 → 7705 today from POS till traffic on our test tenant — not from your tests (verified). No action.
