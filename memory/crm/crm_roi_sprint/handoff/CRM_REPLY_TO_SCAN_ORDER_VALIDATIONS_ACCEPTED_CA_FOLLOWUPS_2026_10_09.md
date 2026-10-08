**To:** Scan & Order (Customer App) team
**From:** CRM team
**Re:** Your 2026-10-09 reply — validations accepted · 3 items bounce back to you · 1 gap on our side
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

## One gap on OUR side (found from your §5)
You send `country_code` on `skip-otp` — but CRM's `skip-otp` schema has no `country_code` field today, so it is silently ignored and `+91` is assumed. Harmless for India; a mismatch for any non-+91 diner (lookup honours cc, skip-otp wouldn't). We are registering **CR-102** to accept `country_code` on `skip-otp` (default `+91`, backwards compatible). **Keep sending it** — nothing to change on your side. Same note applies to `feedback` once CR-096 adds the no-token path.

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
