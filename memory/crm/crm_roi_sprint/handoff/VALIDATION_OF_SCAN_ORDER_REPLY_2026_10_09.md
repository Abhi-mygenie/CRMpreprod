# Validation of Scan & Order reply (2026-10-09) to the consolidated bundle
**Role**: CRM main agent (validation, docs only) · **Result**: §2–§5 **ACCEPTED** · CA-3/6/7 **ACCEPTED** · CA-1/2/8 → owner · CA-4/5 **bounced back to them** · **1 new gap found (skip-otp ignores `country_code`)**

## 1. Claim-by-claim check against CRM code + DB
| § | Their claim | CRM check | Verdict |
|---|---|---|---|
| §2 | register/login → 404 `{"detail":"Not Found"}` | routes deleted (CR-098), QA iteration_2 + batch I3 | ✅ |
| §2 | skip-otp 200 for `9579504871` on 478 and 689 | both docs pre-exist (689 "MYGENieT" `+91`, 478 "mygenie " `+91`); **no new customer created** by their tests | ✅ |
| §2 | `/scan/auth/me` no token → 403 | our contract says 401/403 | ✅ |
| §3 | lookup `9579504871`/689 → `{"exists":true,"name":"MYGENieT"}` | DB name matches exactly | ✅ |
| §3 | now sends `country_code:"+91"` on lookup (patched 10-09) | `LookupRequest.country_code` honoured (`scan.py:197-200`) | ✅ good catch on their side |
| §3 | 429 honoured; lookup only on blur/submit | consistent with 20/min IP · 5/5 min phone | ✅ |
| §4 | 6th skip-otp → 429 `Retry-After: 275` | 5/300 s window → plausible | ✅ |
| §4 | retry ≤3× honouring `Retry-After`, then toast, stays on landing | matches our ask; BUG-025 (prefix evasion) irrelevant to them — they send digits-only | ✅ |
| §5 | `"98387 77712"` → same account; `0000000000` → 400 with our message surfaced; 9-digit → 400 | A2/A3/A4 of 085-A QA | ✅ |
| §5 | sends `phone` digits-only + `country_code` on **skip-otp** and **feedback** | ⚠️ **`SkipOTPRequest` has no `country_code` field** (`scan.py:192-194`); Pydantic silently drops it → skip-otp always assumes `+91`. `FeedbackSubmit` likewise ignores phone/cc (token-only today). Works for India; **contract mismatch** for any non-+91 diner: lookup would honour cc, skip-otp would not → different match keys for the same diner. | ⚠️ **new gap → propose CR-102** |
| CA-3 | `POST /scan/feedback` with diner token since 10-07; local endpoint deleted; no-token → sign-in card | matches CRM today (`scan.py:691` token-only). Hybrid no-token path = **CR-096** (not built yet) — their statement "A9-b live on our side" means *their* half. **Unblocks CR-096 planning.** | ✅ |
| CA-6 | 4× `*_earn_percent` fields acknowledged | matches CR-094 contract | ✅ **unblocks CR-094** |
| CA-7 | Call Waiter / Pay Bill inert, no promise | as agreed | ✅ |
| CA-1 | countersignature → owner | correct — owner action | → owner |
| CA-2 | still reading `/scan/config` + `dietary-tags`; date → owner | **the date is theirs to give** (when *they* stop reading) — not ours. Bounce back. | ↩︎ them |
| CA-4 / CA-5 | ask "OWNER" for the four missing / four unclaimed collection names | **origin error**: B1/B2 came from *their* 2026-10-03 message; the names must come from them. Our CA-5 candidates already listed; they need to confirm/correct. | ↩︎ them |
| CA-8 | rollout dates → owner | partly ours (CRM waves — already shipped) and partly theirs (their steps 2–3 date) | ↩︎ them for steps 2–3 |

## 2. Consequences for CRM closure
- **Consumer validation complete** for **CR-098, CR-093, CR-089, CR-085-A** (Scan & Order half). 085-A still needs the **POS** half (85-A2 note).
- Remaining gate for 098/093/089: **owner smoke** (plan §5 steps 1, 2, 5) → Closure role.
- **CR-096** and **CR-094** planning are now unblocked (CA-3, CA-6).
- **CR-095 GET half** still blocked on CA-2 (their cutover date).

## 3. New gap — proposed CR-102: `skip-otp` must accept `country_code`
`SkipOTPRequest{phone, restaurant_id}` → add `country_code: Optional[str] = "+91"` and pass it to `normalize_phone(req.phone, req.country_code)` (same as lookup `scan.py:283`), store `country_code: cc` (already done). Token `create_customer_token(customer_id, rid, phone)` unchanged. Backwards compatible (default +91). Tiny, same file as BUG-025 — **could ride with the BUG-025 implementation if owner agrees**. Also note for CR-096: `FeedbackSubmit` should accept `country_code` when the no-token path is added. Needs Intake registration (owner: say "register CR-102").

## 4. Side observation (not theirs)
`customers` baseline is now **7705** (was 7700 at end of iteration_7): 5 new r69 docs created via **POS** on 2026-10-08 10:22–11:17 (`Noname`, `lead_source: POS`) — owner's POS till traffic, not QA leakage, not Scan & Order. Tests asserting counts must snapshot before/after, not hard-code.

## 5. Reply to send (draft)
See `handoff/CRM_REPLY_TO_SCAN_ORDER_VALIDATIONS_ACCEPTED_CA_FOLLOWUPS_2026_10_09.md`.
