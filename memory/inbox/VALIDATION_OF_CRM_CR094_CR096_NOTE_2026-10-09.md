# VALIDATION — CRM note "CR-094 + CR-096 live, please validate" (2026-10-09)

**Source:** `memory/inbox/CRM_TO_SCAN_ORDER_CR094_CR096_LIVE_PLEASE_VALIDATE_2026_10_09.md` · **Validated by:** E1, read-only probes against `REACT_APP_CRM_URL` (= the preview base CRM cites) · **Date:** 2026-10-09

## Verdict in one line

Both endpoints behave exactly as documented (7/7 probes + 4 extra edge cases). **Our app does not consume either yet** — that is the registered work CR-2026-10-03-004 Parts B+C (loyalty-rules) and CR-2026-10-07-001 (hybrid feedback), both now unblocked. CRM's "consumer-validated" stamp therefore needs two replies: *endpoint validated today* now, *consumer wired* after each CR ships.

---

## §1 CR-094 `GET /scan/loyalty-rules/{rid}`

| CRM ask | Probe | Result |
|---|---|---|
| 1. 689 → 200, exactly 33 keys, per-tier redemption non-null | `data` = 33 keys; bronze/silver/gold/platinum = 1.0 / 2.0 / 3.0 / 4.0; `max_redemption_amount` 110.0; `points_expiry_months` 2 | ✅ |
| 2. a `loyalty_enabled: false` tenant still returns all 33 keys | 478 → 200, 33 keys, `loyalty_enabled: false`; only null = `max_redemption_amount` (documented "no cap") | ✅ |
| — 404 unknown rid | 999999 → 404 | ✅ |
| — public: junk bearer ignored | `Authorization: Bearer junk` → 200 | ✅ |
| — `Cache-Control` | `no-store` on preview, as CRM warned; verify on prod domain later | ℹ️ |
| 3. our pre-login "earn N points" preview renders from the live endpoint | **Not yet.** `ReviewOrder.jsx:145` still calls our `GET /api/loyalty-settings/{rid}` → `server.py:971` reads CRM's `loyalty_settings` collection directly | ❌ pending CR-2026-10-03-004 B+C |

### Gaps the B+C planning must absorb (found by diffing CRM's 33 keys against what our UI reads today)

| # | Today | CRM contract | Impact |
|---|---|---|---|
| G1 | `LoyaltyRewardsSection.jsx:34,91` and `ReviewOrder.jsx:861,1874` use the single `redemption_value` | per-tier `*_redemption_value` is authoritative ("do not fall back") | On 689 a gold diner is shown ₹1/pt but is entitled to ₹3/pt → **preview and redemption discount understated** for silver+ |
| G2 | Section shown iff POS `restaurant.is_loyalty === 'Yes'` && admin toggle (`ReviewOrder.jsx:489-498`) | `loyalty_enabled` flag; CRM says hide all copy when false | Two sources of truth → owner decision at planning (CRM flag likely authoritative; POS value becomes fallback or is dropped) |
| G3 | Redemption capped only by subtotal (`handleUsePoints`) | `min_redemption_points`, `max_redemption_percent`, `max_redemption_amount` (689 cap ₹110) | We can currently let a diner redeem beyond CRM's rules → CRM would reject or mis-settle at order time |
| G4 | `server.py:988-1004` hardcodes 0.25 / 100 defaults when settings not found | CRM returns 404 for unknown rid, real values otherwise | Defaults disappear with Part C; UI must handle 404 (hide section) |
| G5 | Shape flat `{found, …}` | `{success, message, data:{…}}` | Adapter in `crmService.js` (same pattern as `crmLookupCustomer`) |
| G6 | — | Bonus copy: only `first_visit_*` may be promised; birthday/anniversary/feedback informational | Our UI promises only first-visit today (`LoyaltyRewardsSection.jsx:37`) ✅ keep it that way |
| G7 | — | 60/min per IP, `Retry-After` | One call per Review Order mount — fine; reuse existing 429 toast pattern |

## §2 CR-096 `POST /scan/feedback` hybrid

| CRM ask / case | Probe | Result |
|---|---|---|
| E anonymous `{rating, restaurant_id}` | 200, `linked:false`, feedback_id returned | ✅ |
| C known phone 7505242126 @689 | 200, `linked:true` | ✅ |
| D unknown phone | 200, `linked:false` | ✅ |
| F invalid phone 0000000000 | 400 "Enter a valid mobile number" | ✅ |
| B stale bearer | 401 "Invalid customer token" | ✅ |
| **A token path** (skip-otp 9579504871 @478 → bearer) | 200, `linked:true` | ✅ |
| extra: rating 6 | 400 "Rating must be between 1 and 5" | ✅ |
| extra: unknown rid | 404 "Restaurant not found" | ✅ |
| extra: no token **and** no rid | **422** "restaurant_id required when not logged in" | ⚠️ contract says 400; harmless (we always send rid) — mention to CRM |
| 2. our no-token flow end-to-end, sign-in card gone | **Not yet.** `FeedbackPage.jsx:85-92` still shows the sign-in card; `crmSubmitFeedback` (`crmService.js:376`) is token-only | ❌ pending CR-2026-10-07-001 |
| "Remove any call to your own `POST /api/config/feedback`" | Already deleted 7 Oct (CR-2026-10-03-003) — `server.py:791` tombstone, 0 frontend refs | ✅ already done |

**Note for CR-2026-10-07-001 planning:** CRM's case C means we can pass the phone the diner typed at landing (we hold it in session after `skip-otp`/lookup) to get `linked:true` without forcing sign-in — matches the hybrid intake the CR was registered for. Rate limits 10/min IP, 3/10 min per phone+restaurant → client-side rating validation + 429 toast.

## §3 CA items — unchanged on CRM's side because our note has not been sent yet

Answers already drafted in `CR-2026-10-09-001-…/CONFIRMATION_NOTE_TO_CRM.md` (CA-2/CA-8: CR-095 released, ship at will · CA-4: four names + delete `otp_tokens` row · CA-5: CRM's guess corrected). **Owner has not pasted it yet.** The reply below repeats them so CRM gets everything in one message.

## What this unblocks in our registry

| CR | Was blocked on | Now |
|---|---|---|
| **CR-2026-10-03-004 Parts B+C** (P1) | CR-094 | **unblocked** — Planning next; G1–G7 above feed the IA |
| **CR-2026-10-07-001** (P2) | CR-096 | **unblocked** — Planning after B+C (both touch customer-facing pages; sequence to avoid double smoke) |

Side-effect of the probes: 5 feedback rows written on CRM preview for 689/478 (messages prefixed "validation probe"). Informational for CRM.
