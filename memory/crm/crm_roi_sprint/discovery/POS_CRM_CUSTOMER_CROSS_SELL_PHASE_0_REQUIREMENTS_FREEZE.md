# POS-CRM Customer Cross-Sell / Upsell / Notes API — Phase 0 Requirements Freeze

**Date:** 2026-02-26
**Status:** `pos_crm_cross_sell_phase_0_requirements_freeze_draft_awaiting_owner_inputs`
**Status (2026-05-26):** `pos_crm_cross_sell_phase_0_requirements_freeze_locked`
**Sprint:** ROI Measurement for CRM
**Sprint folder:** `/app/memory/crm/crm_roi_sprint/`
**Register entry:** `../00_register/ROI_MEASUREMENT_CR_REGISTER.md` (CR #3)
**Predecessor (registration):** `./POS_CRM_CUSTOMER_CROSS_SELL_UPSELL_SUGGESTIONS_API_DISCOVERY.md`

> **Purpose of this doc:** Freeze the requirements in **plain English** before any API contract or code work. List what CRM data we have today, what we can capture, what's possible because of that data, and what's still owner-decision-only. Hand a clean question list to the owner.

> **No code, DB, env, or POS write changes in this phase.**

---

## 1. The Scope, In Plain English

When a cashier opens an order in POS and selects a CRM customer, POS should be able to call **one CRM API** that returns everything the cashier needs to **personalise that order** for that specific customer:

1. **Who this customer is, in plain numbers.** Name, tier, total visits, total spend (gross + net), last visit date, loyalty points balance, wallet balance, available coupons.
2. **What this customer is worth.** Customer value — lifetime value, average order value, frequency, recency, churn risk, "VIP" flag. So the cashier (or POS UI) can decide how much to invest in this customer in this order.
3. **What this customer usually orders.** Top items, top categories, usual order size, usual order channel (dine-in / takeaway / delivery), usual time of day.
4. **All notes this customer has ever given — at order level.** Every distinct order-level note the cashier has captured for this customer in past orders, with how often it has been used and the latest date it was used. So if "less spicy", "no onion", "extra napkins" came up before, the cashier sees it before sending the KOT.
5. **All notes this customer has ever given — at item level.** Per item the customer has ordered before, every distinct note ever captured for that item by this customer. So when the cashier picks "Veg Pasta", they instantly see "extra cheese (used 3 times)" and "no garlic (used 1 time)".
6. **Cross-sell suggestions.** "Customer usually buys cake → suggest coffee." A small ordered list of items the customer is likely to add but hasn't yet, based on their history and other customers' co-purchase patterns.
7. **Upsell suggestions.** "Customer ordered regular pizza → suggest large / combo / premium variant." A small ordered list of better-revenue swaps for items already in the current cart.
8. **Why** for every suggestion. Each suggestion (cross-sell, upsell, note) carries a short human-readable reason (`"ordered 5 times in last 30 days"`, `"3 of 4 recent visits had this note"`) and a `source` tag (`history` / `ai` / `rules`) and a `confidence` so POS can sort/filter.

The API is **advisory only**. POS shows it; the cashier picks; nothing is auto-applied to the cart.

---

## 2. What Data CRM Has Today (best current understanding — to be verified in code dive)

> This table is the basis for what's possible "out of the box" vs. what needs new capture. **Verification of each row is a Phase 0 follow-up — not done yet in this freeze.**

| Need | Data source CRM likely has today | Reliability | Notes |
|---|---|---|---|
| Customer profile, tier, visits, spend, last visit | `customers` collection + derived from `orders` | High | Already shown on customer detail screen (subject to CR-002B & CR-005-B2 correctness). |
| Loyalty points (earned, redeemed, balance) | `points_transactions` + customer record | High | Already used by Loyalty CR. |
| Wallet balance (added, used) | wallet transactions + customer record | High | Already used by Wallet flows. |
| Available coupons for the customer | `coupons` + `coupon_usage` + customer scope | Medium | Affected by CR-005 B3 / B6 (per-user limit + total limit enforcement). |
| Past orders per customer | `orders` collection | High | Realtime + migrated; CR-001A schema corrections in place. |
| Items each customer has ordered (top items) | aggregated from `orders.items[]` | High | Used by customer detail "top items" today. |
| **Order-level notes the customer has given** | likely on each `orders.note` / `orders.remark` field | **TBD** | Field name + presence per restaurant to be verified. |
| **Item-level notes the customer has given** | likely on each `orders.items[].note` or modifier field | **TBD** | Whether captured at all, and whether key is stable per item — both unverified. |
| AI insights / preferences | possibly `customers.ai_insights` or a separate cache | TBD | Freshness + source unknown; CR-002B will check. |
| Cross-purchase patterns ("people who buy X also buy Y") | derivable from `orders.items[]` cooccurrence | **Not stored** | Can be computed on the fly or pre-aggregated; doesn't exist today. |
| Upsell mapping (regular → large / combo / premium) | **not in CRM** — sits in POS menu structure | **Not in CRM** | Likely needs POS menu metadata (variant groups, combo parents) — owner question. |
| Customer value / LTV / churn risk | derivable from `orders` + `points_transactions` + `wallet` | **Not stored** | Can compute on read; no model exists today. |

### What's almost certainly already in CRM (high confidence)
- Visits, spend, tier, loyalty, wallet, coupons, last visit, top items.

### What CRM needs to **verify** but probably has
- Item-level notes on `orders.items[].note` (or equivalent).
- Order-level notes on `orders.note` (or equivalent).

### What CRM does **not** have today and will need a new code path (read-side, not write-side)
- Cross-sell recommendations (cooccurrence-based or AI-based).
- Upsell variant mapping (requires POS menu metadata or a CRM-side mapping table).
- A unified "customer value" score.

---

## 3. Possibilities Today, Given The Data Above

These are the realistic shapes of the API response **today**, ordered from "ships with zero new data capture" to "needs new data work":

### Tier A — Ships purely on existing data (read-only aggregation)
- Customer summary (name, tier, visits, spend, last visit, loyalty, wallet, coupons available count).
- Customer value v0 — a simple computed score: `tier × visits × avg_order_value × recency_decay`. No model; pure SQL/Mongo.
- Top items (already used by customer detail "top items" block).
- Order-level notes — `distinct(orders.note where customer = X)` with counts and last-used date.
- Item-level notes — `distinct(orders.items[].note where customer = X and item = selected_item)` with counts and last-used date. **Conditional on those fields existing and being populated — Phase 0 verification needed.**

### Tier B — Cross-sell, ships on existing data with a new aggregation
- Cross-sell candidates from this customer's own basket cooccurrence (e.g. "ordered cake on 3 of last 5 visits and coffee on 2 of those — coffee is a fair suggestion when cart has cake").
- Cross-sell candidates from restaurant-wide cooccurrence (e.g. "across all customers, cake + coffee co-occurs 38% of the time"). Computable on demand; better as a nightly cache for performance.

### Tier C — Upsell, requires POS metadata
- Upsell suggestions need a "variant family" or "combo parent" concept. Options:
   - **C.1** POS exposes a `variant_group_id` per menu item → CRM groups them and suggests the higher-priced sibling.
   - **C.2** CRM maintains an owner-curated upsell mapping table (`from_item_id → to_item_id`, owner sets it up once per restaurant).
   - **C.3** Skip upsell in v1; ship cross-sell only.

### Tier D — AI-assisted layer (optional, later)
- LLM-generated short reasons / blurbs for each suggestion using customer history as context.
- LLM-generated note suggestions when no historical note exists ("for first-time customer, suggest standard prompts"). **Out of scope for v1 — flag for Phase 1+.**

---

## 4. The Single API We're Heading Toward (still a draft contract, owner-locked in Planning)

**One endpoint, one round trip, one response with everything the cashier needs.**

```
POST /api/pos/customers/order-suggestions
```

### Request (what POS sends after customer + cart state change)

```json
{
  "restaurant_id": "R689",
  "crm_customer_id": "<uuid>",
  "pos_customer_id": "<pos-side id, optional>",
  "current_cart": [
    { "item_id": "182042", "qty": 1, "unit_price": 100 }
  ],
  "selected_item": { "item_id": "182042" },
  "order_type": "dine_in | takeaway | delivery",
  "table_id": null,
  "room_id": null
}
```

### Response (everything in one shot)

```json
{
  "customer_summary": {
    "name": "Neelam Sharma",
    "phone": "+91XXXXXXXXXX",
    "tier": "BRONZE",
    "visits": 2,
    "gross_spend": 140,
    "net_spend": 140,
    "last_visit_at": "2026-05-26T...",
    "loyalty_points": 0,
    "wallet_balance": 0,
    "available_coupons_count": 1
  },

  "customer_value": {
    "score": 0.12,
    "band": "low | medium | high | vip",
    "avg_order_value": 70,
    "frequency_per_month": 0.5,
    "recency_days": 270,
    "churn_risk": "low | medium | high"
  },

  "customer_notes": [
    { "text": "less spicy", "used_count": 3, "last_used_at": "...", "source": "history", "confidence": 0.85 }
  ],

  "item_notes": [
    { "item_id": "182042", "text": "extra cheese", "used_count": 2, "last_used_at": "...", "source": "history", "confidence": 0.7 }
  ],

  "cross_sell_items": [
    { "item_id": "182045", "title": "Iced Coffee", "reason": "Customer ordered with cake on 3 of 5 last visits", "source": "history", "confidence": 0.62 }
  ],

  "upsell_items": [
    { "from_item_id": "182042", "to_item_id": "182043", "to_title": "Large Veg Pasta", "reason": "Larger variant of item in cart", "source": "rules", "confidence": 0.5 }
  ],

  "meta": {
    "generated_at": "...",
    "cache_hit": false,
    "feature_flags": { "cross_sell": true, "upsell": false, "ai": false }
  }
}
```

Field names, auth scheme, paging, caching, and exact threshold rules are **all** to be finalised in Planning after the owner answers Section 5.

---

## 5. Owner Questions — All The Decisions We Need Locked Before Planning

> Please answer with letter choices or free-form text. If a section is non-applicable just write "skip".

### A. Customer summary block
**A1.** Which fields do you want on the **customer_summary** block, in the order they should appear?
- a. Name + phone + tier + visits + spend + last visit + loyalty + wallet + coupons (default)
- b. Just name + phone + tier + spend + last visit
- c. Custom — please list

**A2.** Mask phone number in API response (e.g. `+91••••••3200`) or send full?

**A3.** Show **gross spend** or **net spend** (post-discount) — or both?

### B. Customer value scoring
**B1.** Do you want a single composite `score` (0-1) **and** a discrete `band` (`low/medium/high/vip`)?
- a. Both (default)
- b. Just band (cashier-friendly, no decimal)
- c. Just score (lets POS render its own band)

**B2.** What thresholds define `vip` vs `high` vs `medium` vs `low` for restaurant R689?
- a. CRM picks defaults (top 5% / next 15% / next 40% / rest) — recommended for v1
- b. Owner-driven per restaurant — please give numbers (e.g. VIP = ≥ 10 visits and ≥ ₹10,000 spend)

**B3.** Should `churn_risk` be returned? If yes — simple recency-based (`>90 days = high`) or skip for v1?

### C. Customer-level notes (order-level)
**C1.** From past orders, do you want **all distinct notes** ever given (with counts), or only the **top N most-used**?
- a. All distinct + counts (let POS truncate)
- b. Top N (suggest `N = 5`) — default
- c. Top N + "show more" via a second API call

**C2.** Time window for notes — last 90 days / last 365 days / all-time?
- a. All-time (default)
- b. Configurable per restaurant
- c. Last 90 days only

**C3.** Should the API also return notes captured on **cancelled / void / refund** orders? (Default: no — only positive completed orders.)

### D. Item-level notes
**D1.** Should item-level notes return only for the **`selected_item` POS just clicked**, or for **every item already in the cart** too?
- a. Just `selected_item` (default — minimal payload)
- b. Selected item + every item already in cart
- c. Everything the customer has ever noted on any item (largest payload, most context)

**D2.** Same time window decision as C2 — should item-level inherit, or have its own knob?

**D3.** What field on the order line stores the customer's note today? (We will verify in code, but if the owner already knows the field name on POS side, please confirm: `note`, `remark`, `instructions`, `customization`, or other.)

### E. Cross-sell
**E1.** Source preference:
- a. From this customer's own history only (safer, less variety)
- b. From restaurant-wide cooccurrence only (more variety, less personal)
- c. Hybrid — weighted blend (default, recommended)

**E2.** How many cross-sell items should the API return (max)?
- a. 3 (default — cashier-friendly)
- b. 5
- c. 10
- d. Configurable per restaurant

**E3.** Should items already in the current cart be **excluded** from cross-sell? (Default: yes.)

**E4.** Should out-of-stock / disabled items be filtered out, or is that POS's job? (Default: POS filters — CRM doesn't know POS stock state in real time.)

### F. Upsell
**F1.** Do you want upsell in v1?
- a. Yes, with a CRM-side **owner-curated mapping table** (you set "from regular → to large/combo" once per restaurant) — recommended
- b. Yes, but only if POS exposes a `variant_group_id` per menu item
- c. Skip upsell in v1 — ship cross-sell only

**F2.** If F1 = a: who maintains the mapping? Restaurant owner via CRM admin UI, or CRM ops team?

**F3.** How many upsell suggestions per cart, max? (Default: 1 per item already in cart, capped at 3 total.)

### G. Frequency, recency, weights
**G1.** Minimum number of past occurrences for a note / item / pattern to be suggested?
- a. 1 (any past occurrence — most aggressive)
- b. 2 (default)
- c. 3 (most conservative)

**G2.** Recency weighting — should recent orders count more than older ones?
- a. Yes, exponential decay (recommended)
- b. No, simple counts only (simpler to explain to cashier)

### H. Performance / caching
**H1.** Acceptable API latency target?
- a. <200 ms (default)
- b. <500 ms
- c. Best effort

**H2.** Caching strategy preference:
- a. Cache the customer's data for ~5 min per restaurant (default)
- b. Always live, no cache
- c. Pre-compute nightly + serve from cache

### I. POS UX (so we don't ship something POS can't render)
**I1.** Where will POS show the suggestion block? (Side panel, modal, inline below customer card, ...?)

**I2.** Will the cashier see a single "Suggestions" panel, or separate tabs (notes / cross-sell / upsell / customer value)?

**I3.** Should the cashier be able to **mark a suggestion as "not useful"** (so it stops surfacing)? If yes, CRM needs a tiny feedback endpoint.

**I4.** Auto-refresh on cart change vs. manual "Refresh suggestions" button?

### J. Privacy / multi-restaurant
**J1.** Are customer notes / item notes restricted to **the same restaurant**, or shared across the restaurant chain?
- a. Same restaurant only (default — safest)
- b. Shared across chain for the same `customer_id` (requires explicit owner approval)

**J2.** Any data-masking requirement before sending to POS (e.g. don't send phone for non-VIP)?

### K. Feature flags / rollout
**K1.** Should each block (`customer_value`, `cross_sell`, `upsell`, `ai`) be independently togglable per restaurant?
- a. Yes (default — safer rollout)
- b. No — all-on or all-off per CRM deployment

**K2.** Which restaurants are in scope for the first pilot? (Default suggestion: R689 only.)

### L. Auth / who can call this API
**L1.** Caller authentication model:
- a. POS service-to-service token (default — same model as existing POS endpoints)
- b. Per-cashier user token (more granular but heavier)
- c. Owner decides later

**L2.** Should the response be **rate-limited** per restaurant (to protect CRM from a hot POS terminal)?

### M. Out-of-scope confirmation
Please confirm the following stay out of v1:
- [ ] Auto-applying any suggestion to the cart
- [ ] LLM / AI-generated note text (we only echo historical notes in v1)
- [ ] Real-time stock lookup from CRM
- [ ] Cross-restaurant suggestions
- [ ] WhatsApp / SMS / email triggered by viewing a suggestion

---

## 6. What The Next Agent Will Do (after owner answers Section 5)

1. Take the locked answers and turn this doc into `../planning/POS_CRM_CROSS_SELL_API_CONTRACT_PLAN.md`.
2. Run the (small) code dive needed only after requirements are frozen:
   - Verify `orders.note` and `orders.items[].note` field names + populated %.
   - Confirm whether any POS-facing `/api/pos/customers/...` endpoint already exists.
   - Sample 2-3 real R689 customers and hand-simulate the API response on paper to validate the data is sufficient.
3. Produce the v0.1 API contract + a 4-tier rollout plan (Tier A → Tier B → Tier C → Tier D from Section 3).
4. Hand off to Implementation only after owner sign-off on the contract.

---

## 7. Strict Non-Goals For This Freeze

- No code changes
- No DB changes
- No env / deploy / migration
- No POS-side work
- No real customer data leaving the system
- No merging with CR-002B, CR-003, CR-004, or CR-005

---

## 8. Status

```
pos_crm_cross_sell_phase_0_requirements_freeze_draft_awaiting_owner_inputs
```

### Status Update (2026-05-26)

```
pos_crm_cross_sell_phase_0_requirements_freeze_locked
```

All owner answers received and locked. Graduated to Phase 1 Planning: `../planning/POS_CRM_CROSS_SELL_API_PHASE_1_PLAN.md`.

---

## 9. Owner Answers — Locked (2026-05-26)

### A. Customer summary block
- **A1:** **a** — Full set: Name + Phone + Tier + Visits + Spend + Last Visit + Loyalty + Wallet + Coupons (one less POS round-trip)
- **A2:** Full phone (POS already has it)
- **A3:** Both gross + net

### B. Customer value scoring
- **B1:** **c** — Return both `score` (0-100) and `band` (Low/Medium/High/VIP)
- **B2:** **Custom** — Intelligent composite score. 5-factor model: Total Spend 30%, Visit Frequency 25%, Recency 20%, AOV 15%, Order Consistency 10%. Skip loyalty/coupon factors. Bands: VIP ≥80, High 60-79, Medium 35-59, Low <35. CRM auto-calculates, no owner config in v1.
- **B3:** **d** — Return churn risk AND `win_back_recommendation` flag. Multi-factor model: Recency gap vs personal avg 40%, Frequency trend 30%, Spend trend 20%, Absolute recency 10%. High >0.7 (win_back=true), Medium 0.4-0.7, Low <0.4. Cross-CR linkage to CR-004 WhatsApp Marketing.
- **First-time customers (≤1 visit):** Omit `customer_value` block entirely.

### C. Customer-level notes (order-level)
- **C1:** **b** — Top 5 most-used
- **C2:** All-time (default)
- **C3:** No (exclude cancelled/void/refund orders)

### D. Item-level notes
- **D1:** **a** — Just `selected_item` (minimal payload)
- **D2:** Inherit from C2 (all-time)
- **D3:** Confirmed live — `GET /api/pos/customers/{id}/notes/items` (L2714) and `GET /api/pos/customers/{id}/notes/orders` (L2755). Reuse shared helpers.

### E. Cross-sell
- **E1:** **c** — Hybrid (customer history + restaurant-wide co-purchase)
- **E2:** **a** — 3 items max
- **E3:** Yes — exclude items already in current cart
- **E4:** POS filters (CRM doesn't know POS stock state)

### F. Upsell
- **F1:** **c** — Skip upsell in v1, ship cross-sell only

### G. Frequency, recency, weights
- **G1:** **b** — Minimum 2 past occurrences for a note/pattern to be suggested
- **G2:** **a** — Yes, recency weighting (recent orders count more)

### H. Performance / caching
- **H1:** **b** — <500ms
- **H2:** **a** — Cache customer data ~5 min per restaurant

### I. POS UX
- Deferred to POS team. API is advisory — POS decides how to render.

### J. Privacy / multi-restaurant
- **J1:** **a** — Same restaurant only (Phase 1)
- **J2:** No masking required

### K. Feature flags / rollout
- **K1:** **a** — Each block independently togglable (via `meta.feature_flags`)
- **K2:** **a** — R689 only for first pilot

### L. Auth
- **L1:** **a** — POS service-to-service token (same `verify_pos_auth` as all POS endpoints)
- **L2:** Best effort rate limiting, not a v1 blocker

### M. Out-of-scope confirmation
- [x] Auto-applying any suggestion to the cart — **confirmed out of v1**
- [x] LLM / AI-generated note text — **confirmed out of v1**
- [x] Real-time stock lookup from CRM — **confirmed out of v1**
- [x] Cross-restaurant suggestions — **confirmed out of v1** (Phase 1 = same restaurant only)
- [x] WhatsApp / SMS / email triggered by viewing a suggestion — **confirmed out of v1**

### Additional: Order Patterns
- **Added to scope:** `order_patterns` block — top items, top categories, avg items/order, usual channel, usual time of day. Derivable from `orders` collection.

### Additional: CRM Admin UI for Notes
- **B8 (CRM admin UI for customer notes):** Not needed — not logged as a sub-item.
