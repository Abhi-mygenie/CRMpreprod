# INTAKE DOC — CR-2026-10-03-003

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-03-003 |
| **Title** | Customer feedback is written straight into CRM's `feedback` collection in our own schema — nobody can read it; migrate to `POST /scan/feedback` |
| **Classification** | **BUG (data integrity + architecture violation)** + contract alignment |
| **Date Registered** | 2026-10-03 |
| **Reported By** | INV-2026-09-15-003 §3E (F1) — classified **class A, "wrong, fix now"**; the only *live write* into a CRM-owned collection |
| **Severity** | **P1** — the feature appears to work to the diner ("Thank you for your feedback!") but the data is unusable by the restaurant and pollutes a CRM collection |
| **Risk** | **CRITICAL by area** — writes into a CRM-owned collection on a **shared** MongoDB; cross-team impact (addendum §2) |
| **Status** | 📝 REGISTERED (Role 1 done) — **A9-b decided + CRM CR number confirmed: CR-096** (step-1 wave). Design frozen in contract §4c; `restaurant_id` = short form. Blocked only on CR-096 shipping |
| **Parent** | INV-2026-09-15-003 |
| **Blast radius** | **SMALL** — 1 FE page, 2 BE routes |

## 1. Problem (code truth, verified on `3oct` 2026-10-03)

| Side | Evidence |
|---|---|
| Frontend | `pages/FeedbackPage.jsx:34` → `POST {API_URL}/api/config/feedback` with `{name, email, rating, message, restaurant_id}`. Form validates `name`, `rating`, `message` — it is **anonymous**, the diner retypes their name. |
| Backend | `server.py:1292-1304` `submit_feedback` inserts `{id, restaurant_id, name, email, rating, message, created_at}` into **`db.feedback`** |
| Reality | `feedback` is **CRM-owned**. Its documents are CRM-shaped: `{user_id, customer_id, customer_name, customer_phone, rating, message, status}`. CRM's own feedback screens filter on `user_id` / `customer_id` / `status`. |

**Consequence:** every submission lands as a foreign-shaped document that CRM's UI cannot list,
is attached to no customer, has no `status` for the restaurant to action, and is never read by us
either (`GET /api/config/feedback/{rid}` has zero admin-page callers → it is one of the 14 dead
sites in CR-2026-10-03-001). The diner gets a success toast for data that goes nowhere.

**CRM's replacement** (INV-022 A9): `POST /scan/feedback`, **token-only**, body
`{rating, message?, order_id?}` — CRM takes name/phone from the customer token.
Owner position **F1** (confirmed 2026-10-03): *we* always identify the diner — customer token when
we have one, otherwise `phone` + `restaurant_id` captured on the landing page — and **CRM decides
how to receive and store it**. That is open question **A9-b** in `REPLY_TO_CRM_INV_022.md`.

## 1a. CRM answer A9-b (round 2, 2026-10-03) — **design decided, hybrid**

CRM's owner-approved answer, now frozen in `control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` §4c:

| Case | CRM behaviour |
|---|---|
| Customer token present | use it (today's behaviour, `scan.py:816 verify_customer_token`) |
| No token | accept `{phone (canonical 10-digit), restaurant_id}` in the body; resolve to an **existing** customer by canonical phone and attach |
| No match | store the feedback **unlinked** (`customer_id: null`) with `phone` + `restaurant_id` — **never create a customer**, so feedback cannot become a silent customer-creation vector |
| `order_id` | **optional**; linked when present, recommended when the feedback follows an order |

This is better than the option we proposed (which would have called `skip-otp` purely to obtain a
token, creating a customer as a side effect). Until CRM's canonical-phone CR-085 ships, matching is
on the exact 10-digit string — which our code already produces for Indian numbers
(`LandingPage.jsx:373`, `ReviewOrder.jsx:271`); India-only is the confirmed rollout scope.

**Still needed from CRM:** the additive CR number + ship date, and confirmation that
`restaurant_id` in the body is the **short** form (`"689"`). Tracked as contract item **O-8**.

## 2. Scope

**IN**
- `FeedbackPage.jsx` → call CRM `POST /scan/feedback` via `crmService` instead of our backend.
- Remove the Name / Email form fields (CRM does not accept them; identity comes from the token) — **final shape depends on A9-b**.
- Optional `order_id`: add an "which order?" picker or pass the last order id from context (Planning decides).
- Delete `POST /api/config/feedback` and its `FeedbackCreate` model (server.py L1286-1304).
- `GET /api/config/feedback/{rid}` (L1306) is deleted by **CR-2026-10-03-001** — do not duplicate.
- No-token behaviour: per A9-b answer — either call `skip-otp` first to obtain a token, or send `{phone, restaurant_id}`.

**OUT**
- Backfill / repair of the already-written foreign-shaped documents in `feedback` → **CRM's call, raise as a CRM data task** (we must not write or delete in their collection).
- `feedbackEnabled` / `feedbackIntroText` config flags (ours, unchanged).
- Any admin-side feedback reading UI (does not exist).

## 3. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| CR-2026-10-03-001 | Deletes the dead *read* route `GET /api/config/feedback/{rid}` | RELATED — this CR deletes the *write*; sequence either way |
| INV-2026-09-15-002 | `feedback` was one of the 3 real disagreements on the ownership board | RELATED — closing this CR flips the row to "CRM exclusive" |
| CR-2026-09-15-001 | Profile v2 adapter — different endpoints | DISTINCT |

## 4. Code exists? **PARTIAL** — the page and the (wrong) write exist; no CRM call, no `crmSubmitFeedback` in `crmService.js`.

## 5. Files

| Will change | Will NOT touch |
|---|---|
| `frontend/src/pages/FeedbackPage.jsx` · `frontend/src/api/services/crmService.js` (new `crmSubmitFeedback`) · `backend/server.py` (delete route + model) | `RestaurantConfigContext.jsx` · `AuthContext.jsx` · existing `feedback` documents |

## 6. Acceptance criteria

1. Submitting feedback as a diner **with** a CRM token creates a correctly-shaped record visible on CRM's side for rid 689.
2. Behaviour **without** a token matches whatever CRM specifies in A9-b — and never 500s or silently drops the submission.
3. `grep "db.feedback" backend/server.py` returns **nothing**.
4. Failure path is honest: if CRM rejects or is down, the diner sees an error — **no false "Thank you" toast** (this is the core of the bug).
5. `feedbackEnabled = false` still hides the feature.
6. `yarn build` clean (no `CI=true`).

## 7. Prerequisites / blockers
1. ~~CRM answer to A9-b~~ — **ANSWERED 2026-10-03** (hybrid, §1a). Design frozen in the contract.
2. **CRM to ship the additive feedback CR** — number + date outstanding (contract item **O-8**), plus short-form `restaurant_id` confirmation. **This is now the only hard blocker.**
3. Owner confirmation that removing the Name/Email fields from the feedback form is acceptable UX. Note: under the hybrid, identity comes from the token or from the phone we already captured on the landing page — the diner never needs to retype their name. Worth re-confirming at Planning because it is visible.

```text
Intake complete: CR-2026-10-03-003
Classification: BUG (data integrity + architecture violation)
Severity: P1
Risk: CRITICAL (write into CRM-owned collection on shared DB)
Duplicate check: DISTINCT (related: CR-2026-10-03-001, INV-2026-09-15-002)
Evidence: captured (FeedbackPage.jsx:34, server.py:1292-1304, CRM doc shape from INV-003 §3E)
Blast radius: SMALL
Docs updated: this file, ../README.md, ../../PRD.md
Next: BLOCKED — CRM A9-b answer → Planning
```
