# CRM sign-off — CONTRACT_CUSTOMER_APP_CRM_v1.0 (v1.0-RC3)

## From: MyGenie CRM · Re: `CONTRACT_CUSTOMER_APP_CRM_v1.0.md` (v1.0-RC3) + `REPLY_TO_CRM_ROUND2_AND_FREEZE.md`
## Date: 2026-10-03 · Status: **✅ CRM SIGNS PART 1 (§1–§6). Owner-authorised.**

Validated Part 1 (§1–§6) line-by-line against CRM code. **CRM signs Part 1.** No blocking conflicts.
Two items to highlight (both already resolvable), and the four CRM-owed answers are given below.

---

## A. Validation result — Part 1 §1–§6

| Section | Verdict | Evidence |
|---|---|---|
| **§1 Ground rules G1–G5** | ✅ Agree | G2 collections (`customer_app_config`, `dietary_tags_mapping`, `non_qr_blocks`, `status_checks`) confirmed: CRM touches only the first two, via the 4 orphan routes removed by CR-095. |
| **§2a/2b/2c (36 rows)** | ✅ Match our JSON exactly | All read/write counts + file:line are ours. |
| **§2d D-1/D-2 (ruled by owner)** | ✅ Accept — see Highlight #1 | Owner applied "owner = sole writer" → `pos_event_logs`=CRM, `orders`/`order_items`=CRM. |
| **§3 Identity I1–I6** | ✅ Agree | I1 canonical 10-digit; I2 short-form rid pre-login; I3 full-form rid in JWT (`pos_0001_restaurant_689`); I6 Pay-Bill reserved → POS. |
| **§4a / §4b (live endpoints)** | ✅ Accurate | incl. `POST /scan/call-waiter`+`/scan/request-bill` (scan.py:845,863, customer token, `{table_id, message?}`, write-only to `pos_event_logs`); `skip-otp`; OTP login quarantined. |
| **§4c (CR-093/094/feedback)** | ✅ Agree — see Highlight #2 | Field names for CR-094 all exist (per-tier). |
| **§4d (CR-095 removal)** | ✅ Agree | 4 routes confirmed orphan. |
| **§4e / §5 L1–L7 / §6 sequence** | ✅ Agree | L7 (untyped OpenAPI) → improved via CR-088. Feedback CR = **CR-096** (step-1 wave). |

## B. Highlights (non-blocking)

**Highlight #1 — ownership convention differs from our proposal (we accept).**
We proposed `pos_event_logs` owner = **POS** (consumer) and `orders`/`order_items` = **Shared (POS-origin)**.
The owner ruled **owner = the sole writer**, making all three **CRM-owned** (with "inert until POS consumes" /
"originates in POS via webhook" notes preserved). This is coherent and gives CRM the schema veto on
`orders`/`order_items`. **CRM concurs — no objection.** (Per your ask #6, raised now, not after signature.)

**Highlight #2 — CR-094 earn-percent is per-tier, not a single value.**
Contract §4c asks CR-094 to expose `*_earn_percent`. Heads-up for your adapter: our `loyalty_settings`
has **four** tier fields — `bronze_earn_percent`, `silver_earn_percent`, `gold_earn_percent`,
`platinum_earn_percent` (`schemas.py:1007–1010`) — not one `base_earn_percent`. CR-094 will return all four
plus `redemption_value`, `min_order_value`, `first_visit_bonus_enabled`, `first_visit_bonus_points`,
`points_monetary_value`. No conflict, just so you map the right fields.

## C. The four CRM-owed answers

- **D-3 (`otp_tokens` vs E3)** — ✅ Confirmed in one line: **our round-1 E3 ("does not exist") referred to the
  *customer* OTP store, which is `customer_otps`** (scan.py:193–287). `otp_tokens` is a **separate staff
  password-reset store** (`auth.py:608–751`) and **does exist**. Both statements are true in their own scope;
  the restored row (CRM-owned, staff-reset) is correct.
- **O-8 (feedback CR number + rid form)** — Feedback CR = **CR-096** (registered 2026-10-03; `POST /scan/feedback`
  hybrid). **`restaurant_id` in the feedback body = SHORT form `"689"`** — confirmed. CRM normalises it with the
  same helper as all pre-login routes: `_normalize_restaurant_id("689")` → `pos_0001_restaurant_689`
  (scan.py:30). Ship date: CR-096 rides the **step-1 wave** with CR-093/094; firm date set at the PLANNING gate
  (not yet opened).
- **O-10 / C2 (`users` change notice)** — ✅ **Agreed.** CRM will give **advance notice** before renaming or
  dropping any of the six fields `id`, `email`, `phone`, `password_hash`, `restaurant_id`, `pos_id` until you
  confirm §6 step 3 is complete. All six confirmed present (`auth.py`, `schemas.py`). Costs us one message — fine.
- **O-7 (GAP-11 live host)** — Preview verified by us (`auth.py:11`, no fallback). Live-host `JWT_SECRET`
  confirmation is an **owner action**, tracked; not a CRM code item and does not block the API contract.

## D. Scope CRM cannot sign / what still blocks the OWNERSHIP_MAP freeze

CRM signs **Part 1 §1–§6**. The remaining Part-2 open items are **not CRM's to resolve**:
- **POS**: P1-refined (does anything read `pos_event_logs`?), P5 (admin profile endpoint), P6 (Call Waiter/Pay
  Bill direction — O-4), P7 (Pay-Bill semantics — O-11 / I6).
- **Owner**: F3 (approve POS-direct admin login), O-7 (live-host JWT).

`OWNERSHIP_MAP.md` stays unfrozen until POS replies + owner F3 — unchanged by this signature.

## E. Signature

| Party | Scope accepted | Name | Date |
|---|---|---|---|
| MyGenie CRM team | Part 1 §1–§6 | **✅ SIGNED (owner-authorised)** | 2026-10-03 |

On the Customer-App countersignature this becomes **v1.0 FROZEN** for Part 1.
