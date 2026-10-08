# CR-096 — Impact Analysis: `POST /scan/feedback` hybrid intake (token **or** phone; never create)
**Date**: 2026-10-09 · **Role**: Planning Agent · **Design frozen**: Contract v1.0 §4c / A9-b (owner-approved; Customer App CA-3 ✅ 2026-10-09) · **Owner date**: w/c 27 Oct · **Status**: ✅ IA CLOSED 2026-10-09 (Q1 401 · Q2 phone optional / 400 on invalid supplied · Q3 order_id null · Q4 no) — Impl Plan gate NOT yet opened · **No code changed.**

## 1. Frozen design (not up for change)
(1) token present → use it (today's path); (2) no token → body carries `{phone, restaurant_id(short)}` → resolve **existing** customer by canonical phone; (3) no match → store **unlinked** `customer_id: null`; (4) **never create a customer**; (5) `order_id` optional. Customer App already posts with token and shows a sign-in card for no-token diners until this ships; their local `POST /api/config/feedback` is deleted.

## 2. Code reality (read-only 2026-10-09)
| Fact | Evidence |
|---|---|
| `POST /scan/feedback` exists, **token-required** (`Depends(verify_customer_token)`), body `FeedbackSubmit{rating, message?, order_id?}` | `scan.py:95-98, 691-718` |
| Writes `feedback{id,user_id,customer_id,customer_phone,rating,message,order_id,status:"pending",source:"scan_and_order",created_at}` then `$inc feedback_count`, `$set last_rating` on the customer | `:698-716` |
| CRM staff Feedback page reads `GET /api/feedback` (`routers/feedback.py:44`) and already tolerates `customer_id:null` (1 such doc exists; `customer_name`/`customer_phone` optional) | probe; `FeedbackPage.jsx` |
| `feedback` collection: 9 docs, **no indexes** besides `_id` | probe |
| `loyalty_settings.feedback_bonus_enabled/points` exist but **no code awards it** anywhere (grep) | probe |
| Canonical match helper + rate-limit helper available (`normalize_phone`, `phone_match`, `_lookup_rate_limited`) | `core/phone.py`, `scan.py:60` |
| CR-102 lesson: no-token schema must carry `country_code` (default `+91`) | `planning/CR_102_IMPACT_AND_IMPL_PLAN.md` |

## 3. Proposed behaviour
- Make `auth` **optional**: `auth: Optional[dict] = Depends(optional_customer_token)` (new tiny dependency wrapping `verify_customer_token`, returns `None` when no/invalid header — **Q1**: invalid token → 401 or treat as no-token?).
- Schema `FeedbackSubmit` + `phone: Optional[str]`, `country_code: Optional[str]="+91"`, `restaurant_id: Optional[str]` (short). Validation: no token **and** no `(phone, restaurant_id)` → 422; `rating` 1–5 → 400 as today.
- No-token path: `rid = _normalize_restaurant_id(restaurant_id)`; `normalize_phone(phone, cc)`; invalid phone → **still store unlinked** with `phone_invalid:true`? (**Q2**: reject 400 vs accept-unlinked; recommended **accept unlinked** — feedback must never be lost; store `customer_phone_raw`).
- Match: `db.customers.find_one(phone_match(rid, phone, cc) + {"is_blocked": {"$ne": True}})` → `customer_id` or `null`. **Never insert**.
- Stored doc adds: `customer_phone` (canonical), `country_code`, `identity_source: "token" | "phone" | "none"`, `linked: bool`. Customer stats update only when linked.
- Rate limit (no-token only): IP 10/min (`fb-ip:`), phone 3/10 min (`fb-ph:{rid}:{cc}{digits}`) — ordered IP → normalise → phone (BUG-025 pattern). Token path unchanged (already identity-bound).
- `order_id` optional; if given and belongs to another tenant → ignore (store null) rather than 400 (**Q3**).
- **Q4** feedback bonus: owner's settings have `feedback_bonus_*` but nothing awards it. Out of scope for 096 (would be a loyalty write — §14 adjacent) → register as follow-up CR if wanted.
- Index: `feedback {user_id:1, created_at:-1}` (staff list) — additive, non-blocking.

## 4. Impact / blast radius
- Files: `routers/scan.py` (route + schema + optional-auth dep ~60 lines), `core/auth.py` only if the optional dependency must live there (prefer local in `scan.py`), tests. CRM Feedback page: no change (already null-safe); optional later: show "unlinked" badge.
- Public write endpoint → spam vector → mitigated by limits + 500-char `message` cap + unlinked rows carry no PII beyond phone.
- Not §14 (no identity create/merge; read-only match). Risk **MEDIUM** (public write) → tests + limits.
- Customer App change: send `{phone, country_code, restaurant_id}` when no token; remove sign-in card. Contract v1.1 note.

## 5. Owner questions
| Q | Question | Recommendation |
|---|---|---|
| Q1 | Invalid/expired token on feedback: 401 (today) or fall back to no-token path? | **401** — keep token semantics strict; Customer App refreshes via skip-otp |
| Q2 | No-token with **invalid** phone: 400 or store unlinked (`phone_invalid:true`)? | **store unlinked** — never lose feedback; flag for staff |
| Q3 | `order_id` not found / other tenant: 400 or store null? | **store null** |
| Q4 | Award `feedback_bonus_points` on linked feedback? | **No** in 096 — separate CR (loyalty write) |

## 6. Verification (draft)
V1 token path unchanged (linked, stats +1) · V2 no token + known phone (`9838777712`/689) → linked, customer `feedback_count` +1, **no customer created** · V3 no token + unknown phone → `customer_id:null`, count unchanged · V4 no token + invalid phone → per Q2 · V5 no token + no phone → 422 · V6 rating 0/6 → 400 · V7 limits: 11th/min per IP → 429; 4th/10 min per phone → 429 · V8 staff `GET /api/feedback` lists unlinked rows without 500; FeedbackPage renders · V9 `order_id` cross-tenant → null · V10 customers count snapshot equal.

```
Planning complete: CR-096
Stage: Impact Analysis
Code reality: PARTIAL (token path live; no-token path absent)
Risk: MEDIUM (public write; mitigated by limits + never-create)
Files WILL change: routers/scan.py (schema + route + optional-auth dep) · tests/test_cr096_feedback.py (new) · feedback index
Files WILL NOT touch: core/phone.py · routers/pos.py · routers/feedback.py · FeedbackPage.jsx · stored data
Owner decisions: Q1 invalid token · Q2 invalid phone · Q3 order_id mismatch · Q4 feedback bonus
Docs: planning/CR_096_IMPACT_ANALYSIS.md
Next: owner answers → Implementation Plan (ship target w/c 27 Oct)
```


## Owner rulings 2026-10-09 (amend §3/§5)
- **Phone is optional** on the no-token path. `{restaurant_id}` alone is valid → anonymous feedback, `customer_id:null`, `identity_source:"none"`, `linked:false`.
- **Q2 → 400 on invalid supplied phone** (not store-unlinked). Customer App validates client-side and sends canonical digits + `country_code`; CRM applies the same validity rule as skip-otp. Junk phones are never stored.
- **Q4 → No** (bonus award = separate CR).
- **Q1 → 401** on expired/invalid token (FINAL 2026-10-09). **Q3 → store `order_id:null`** + `order_id_raw` (FINAL 2026-10-09).
Validation matrix therefore: no token + no phone → 200 unlinked (V4a); no token + invalid phone → 400 (V4b); no token + valid unknown phone → 200 unlinked with `customer_phone` (V3); no token + valid known phone → 200 linked (V2). `restaurant_id` required when no token (422 otherwise).

## Behavioural spec — diner cases (frozen 2026-10-09)
| Case | Input | Result |
|---|---|---|
| A logged-in (token valid) | token | linked; `feedback_count` +1 |
| B token expired/invalid | bad token | **401** → app re-runs skip-otp, resubmits |
| C existing customer, no token, valid phone | `{restaurant_id, phone, country_code}` | linked by canonical phone; no create |
| D unknown phone, no token | same | unlinked `customer_id:null`, phone kept; **no create** |
| E no phone, no token | `{restaurant_id}` | anonymous unlinked, `identity_source:"none"` |
| F invalid supplied phone | junk phone | **400 "Enter a valid mobile number"**; nothing stored |
| G blocked customer | match has `is_blocked` | stored unlinked |
| any | `order_id` missing/other tenant | stored, `order_id:null`, `order_id_raw` kept |
| any | no token and no `restaurant_id` | 422 |
