# Owner responses to F1–F4 (2026-09-28) and what they mean
## Ref: INV-2026-09-15-003 · supersedes §F recommendations in `VALIDATION_OF_CRM_REPLY_INV_022.md`

| # | Owner said | Summary | Decision |
|---|---|---|---|
| **F1** | "We should be able to identify the customer and send details to CRM. Ask CRM how feedback needs to be stored — it's their endpoint." | Customer App always identifies the diner (token when present; otherwise `phone` + `restaurant_id`). CRM decides how `/scan/feedback` accepts and stores it. A9-b in reply v2. | **CONFIRMED 2026-10-03** — A9-b wording approved by owner. |
| **F2** | "Why lose?" | In degraded-guest path (skip-otp failed / OTP unavailable), points preview left blank. No retry at checkout. No UI message. | **LOCKED 2026-10-03 — Option (a).** Blank/silent. Accepted. |
| **F3** | "Will approve after checking impact and new flow." | Admin-login to POS direct (CR-004 Option D) not approved yet. Must write `CR-2026-09-15-004/IMPACT_AND_NEW_FLOW.md` and present. | **PENDING** — impact doc not yet written. |
| **F4** | "Yes." | Tell CRM to remove `GET/PUT /scan/config/{rid}` and `GET/PUT /scan/menu/dietary-tags/{rid}` now (Q-CA-1). | **FROZEN YES.** |

---

## 1. F2 — why would the points preview be "lost", and does it have to be?

**Today** (`ReviewOrder.jsx:418`): if the diner has no CRM token, we read `customers` + `loyalty_settings` directly from CRM's DB to show name/points/tier. That direct read is the thing we are removing.

**When does a diner reach checkout without a token?**

| Path | How it happens | Has token? |
|---|---|---|
| Normal (skip-otp flows) | Landing page phone submit → `crmSkipOtpWithRetry` → token (`LandingPage.jsx:462`) | ✅ yes → points via `/scan/loyalty`. **Nothing lost.** |
| 409 → password-setup | Phone locked to OTP/password; diner completes password login | ✅ yes |
| **Degraded guest** | skip-otp retries exhausted: CRM 5xx / 429 / network (`LandingPage.jsx` "degrading to guest") | ❌ no |
| **OTP-only flows** | config has `skipOtp*` off for that order type → OTP required → CRM SMS not in production (CR-2026-09-14-001) → guest | ❌ no |

**Why CRM won't give points without a token:** INV-022 B2 — points/tier/wallet are personal data; CRM refuses to return them for an unauthenticated phone (anyone could type any phone and see their balance).

**So the "loss" is only in the two no-token rows, and each has a fix that is not a loss:**

| No-token case | Option | Result |
|---|---|---|
| Degraded guest (CRM was down at landing) | **Retry `skip-otp` once more at checkout** (same call the landing page makes). If CRM is back → token → points shown. If CRM still down → `/scan/loyalty` would fail too — and so would order linkage; nothing CRM-side is available anyway. | Preview lost **only while CRM is actually down**, which is already a degraded state. |
| OTP-only flow with SMS not live | (a) Temporarily treat as skip-otp at checkout, or (b) wait for CRM SMS to go live, or (c) show name only (B1 lookup) and "log in to see points" link. | Owner choice; (c) is the honest UI until SMS is live. |

**Recommendation to put to owner:** F2 = "retry skip-otp at checkout; if still no token, show name via lookup + 'log in to see your points'". Then nothing is lost in any reachable path.

---

## 2. New / revised questions for CRM (to go in the next brief — DO NOT send until owner confirms F2 and reviews F1 wording)

| # | Question |
|---|---|
| **A9-b** (replaces our earlier "accept login-only") | For `POST /scan/feedback`: we will always identify the diner — with the customer token when we have one, otherwise with `phone` (10-digit) + `restaurant_id` (`"689"`) which we capture on the landing page. How do you want to receive and store that? Options we see: (i) token-only as today — we call `skip-otp` first to obtain a token; (ii) accept `{phone, restaurant_id}` in the body when no token and resolve/create the customer server-side; (iii) something else. Also: do you want `order_id` mandatory when the feedback follows an order? Your endpoint, your rule — tell us and we comply. |
| **B2-b** (depends on F2) | If owner picks "retry skip-otp at checkout": no new CRM question. If owner wants points for an identified-but-unauthenticated phone: CRM already said no (B2) — do not re-ask unless owner insists. |
| Q-CA-1 | Already answered: remove the 4 routes now (F4 = yes). |
| Q-CA-3 | Change wording from "validated and accepted" to "direction accepted in principle; owner approval pending our impact/new-flow review (CR-004) and POS P5". |

---

## 3. Board / doc state after this

- F4 → frozen YES. O1 → can be frozen as A (CRM agreed, owner never objected; confirm with one click).
- F1 → reworded: "Identify diner; CRM defines storage (A9-b)". F2 → "owner asked why — see §1, proposal pending". F3 → "pending impact doc".
- `REPLY_TO_CRM_INV_022.md` → Q-CA-4 feedback line and Q-CA-3 wording revised; marked DRAFT v2, still not sent.
