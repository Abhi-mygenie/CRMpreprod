# CR-033 — Discovery · Additional Audience Filters

> **Type**: Discovery Report (read-only, no code changes)
> **Date**: 2026-07-01
> **Requested by**: Owner
> **Role**: Investigation / Discovery Agent
> **Related**: INV-003 (surfaced current 14-filter state + 3 broken filters)
> **Status**: 🔵 Discovery complete — awaits owner priority ranking
> **Confidence**: HIGH (evidence: full Customer schema + live DB data-density audit + related-collection schema probe)

---

## 1 · Why this CR

INV-003 confirmed today's audience filter set is only 14 hardcoded dimensions in `build_customer_query()`, with 3 more (`vip_flag`, `has_birthday_this_month`, `whatsapp_opt_in`) that the frontend sends but backend ignores. Owner has said the current set is insufficient. This discovery enumerates what could realistically be added.

---

## 2 · Method

- Read full `Customer` Pydantic model (`schemas.py` lines 218-320) — 100+ fields
- Live-DB data-density audit (5 907 customers) — measured which fields actually have data
- Probed related collections (`orders`, `whatsapp_message_logs`, `feedback`, `points_transactions`, `campaigns`, `coupons`) for cross-collection filter feasibility
- Cross-referenced today's `build_customer_query()` to identify already-implemented dimensions

---

## 3 · Data-density audit (live DB, 5 907 customers)

Only these fields have non-trivial data today — critical because a filter without data is useless UX:

| Field | Populated | % | Verdict |
|---|---:|---:|---|
| `customer_type` | 5 905 | 100% | Already filterable |
| `dob` | 205 | 3.5% | Enables birthday-month filter |
| `anniversary` | 73 | 1.2% | Enables anniversary-month filter |
| `whatsapp_opt_in` | 62 | 1.0% | Already sent by UI, backend ignores (BUG-A) |
| `is_blocked` | 62 | 1.0% | Not filterable today |
| `complaint_flag` | 46 | 0.8% | Not filterable today |
| `vip_flag` | 46 | 0.8% | Backend ignores (BUG-A) |
| `blacklist_flag` | 46 | 0.8% | Not filterable today |
| `last_interaction_date` | 47 | 0.8% | Not filterable today |
| `notes` | 41 | 0.7% | Filterable via search text |
| `lead_source` | 40 | 0.7% | Not filterable today |
| `gst_number` | 35 | 0.6% | Enables has-GST filter |
| `gender` | 6 | 0.1% | Marginal, but zero cost |
| `city`, `state`, `pincode` | 1-2 | ~0% | Data missing — need POS/import to fill |
| `preferred_language` | 3 | 0.1% | Data missing |
| Everything else (dietary, allergies, preferred_dining_type, spice_level, kids_birthday, etc.) | 0 | 0% | Filter would be useless until data seeded |

**Related collections available for join-based filters:**
- `orders` — 58 900 docs with rich fields (`order_amount`, `order_type`, `payment_method`, `restaurant_id`, `items`, `created_at`, `coupon_code`, `wallet_used`, etc.)
- `points_transactions` — 12 492 docs (`transaction_type`, `points`, `created_at`)
- `whatsapp_message_logs` — 113 docs (`status`, `campaign_id`, `template_id`, `created_at`)
- `feedback` — 1 doc (sparse; low ROI for now)
- `campaigns`, `coupons` — small tables, joinable

Denormalised counts already on customer (no join needed): `total_visits`, `total_spent`, `total_points`, `total_coupon_used`, `wallet_balance`, `total_wallet_used`, `total_wallet_received`, `last_visit`.

---

## 4 · Proposed new filters — categorised by tier

### Tier P0 — "Wire up what's already half-built" (fix BUG-A, no new data required)

| # | Filter | Field | Type | Notes |
|---|---|---|---|---|
| P0-1 | VIP status | `vip_flag` | `true / false / all` | Fix BUG-A. UI already sends this; backend just needs the if-block. |
| P0-2 | Birthday this month | `dob` (parse month) | boolean | Fix BUG-A. Business-critical for greeting campaigns. Data exists on 205 customers. |
| P0-3 | WhatsApp opted-in | `whatsapp_opt_in` | `true / false / all` | Fix BUG-A. Critical for outbound-comms compliance. |
| P0-4 | Blocked | `is_blocked` | `true / false / all` | Symmetric with vip/complaint. UI already has toggle on CustomersPage. |
| P0-5 | Blacklisted | `blacklist_flag` | `true / false / all` | Symmetric with above. |
| P0-6 | Has complaint | `complaint_flag` | `true / false / all` | Support triage / recovery campaigns. |

**Effort:** ~30 min backend + 30 min frontend (6 checkbox rows) + smoke test. **All 6 use existing data.**

### Tier P1 — "Small additions, existing data / trivial join"

| # | Filter | Data source | UI shape | Notes |
|---|---|---|---|---|
| P1-1 | Anniversary this month | `anniversary` | boolean | Parallel to birthday-this-month. 73 customers have data. |
| P1-2 | Birthday in specific month | `dob` | month dropdown Jan-Dec | Enables "December birthdays campaign". |
| P1-3 | Age range | derived from `dob` | 18-25 / 26-35 / 36-50 / 50+ | Demographic segmentation. |
| P1-4 | Gender | `gender` | male / female / other / all | Low data today (6 docs) but zero cost. |
| P1-5 | Signed-up recently | `created_at` | last N days | New-customer welcome campaigns. |
| P1-6 | Lead source | `lead_source` | multi-select (Walk-in / Swiggy / Zomato / Instagram / Referral / Airbnb) | 40 customers have data. Attribution filter. |
| P1-7 | Has GST | `gst_number` | true / false / all | Corporate segmentation. |
| P1-8 | Has notes | `notes` | true / false / all | Enables "customers we've profiled" filter. |
| P1-9 | Wallet balance range | `wallet_balance` | ≤N / N-M / ≥M | Already denormalised on customer doc. |
| P1-10 | Total coupons used | `total_coupon_used` | 0 / 1-5 / 6+ | Denormalised on customer doc. |
| P1-11 | Points earned range | `total_points_earned` | brackets | Denormalised. |

**Effort:** ~1.5-2 hours backend + ~2 hours frontend + smoke. **All data already available.**

### Tier P2 — "Cross-collection joins (medium complexity)"

Requires aggregation pipelines or pre-computed materialised fields on customer. All feasible against live DB.

| # | Filter | Source | Cost | Notes |
|---|---|---|---|---|
| P2-1 | Last order date range | `orders.created_at` | MEDIUM · aggregation or add `last_order_at` cached field | Different from `last_visit` if you count non-visit orders (delivery/pickup). |
| P2-2 | Avg order value bracket | `orders` | MEDIUM · cached field | High-value vs low-value diner segmentation. |
| P2-3 | Order type preference | `orders.order_type` (Dine-In / Takeaway / Delivery) | MEDIUM | Enables "delivery-only customers" campaigns. |
| P2-4 | Payment method preference | `orders.payment_method` | MEDIUM | UPI-only vs cash-only segmentation. |
| P2-5 | Ordered a specific menu item | `orders.items[].food_id` | MEDIUM-HIGH · index needed | "Customers who bought pizza in last 60 days". |
| P2-6 | Ordered from a specific category | `orders.items[].category_id` | MEDIUM-HIGH | Category-level targeting. |
| P2-7 | Used specific coupon | `orders.coupon_code` | MEDIUM | Coupon-cohort follow-ups. |
| P2-8 | Off-peak diner | `orders.off_peak_bonus > 0` | MEDIUM | Reward off-peak habit. |
| P2-9 | Received campaign X | `whatsapp_message_logs.campaign_id` | LOW · already indexed | Campaign attribution. |
| P2-10 | WhatsApp message failed recently | `whatsapp_message_logs.status='failed'` | LOW | Delivery-health cleanup segment. |
| P2-11 | Never messaged on WhatsApp | absence in `whatsapp_message_logs` | LOW | Enables "first outreach" campaigns. |
| P2-12 | Redeemed points in last N days | `points_transactions` | MEDIUM | Loyalty-engagement segment. |
| P2-13 | Earned points but never redeemed | `points_transactions` | MEDIUM | Points-hoarder segment. |

**Effort:** ~1 day backend (aggregation pipelines + optional cached fields) + 1 day frontend + smoke. Consider phased: LOW-cost ones first.

### Tier P3 — "Data-model additions needed" (defer or bundle with CR-034 tags)

| # | Filter | Blocker |
|---|---|---|
| P3-1 | Dietary preference | `diet_preference` / `dietary` — 0 docs populated today |
| P3-2 | Cuisine preference | `cuisine_preference` — 0 docs |
| P3-3 | Preferred dining type | `preferred_dining_type` — 0 docs |
| P3-4 | Spice level | `spice_level` — 0 docs |
| P3-5 | Kids' birthday month | `kids_birthday` — 0 docs |
| P3-6 | Churn risk score bracket | `churn_risk_score` — 0 docs; needs AI pipeline first |
| P3-7 | NPS score range | `nps_score` — 0 docs |
| P3-8 | Free-form user-defined tags | See CR-034 |

Recommendation: add the filter dimensions to `build_customer_query` when data starts to exist (deferred). Do not add UI now — it would show empty results.

---

## 5 · UI implications

- Today's filter panel is one flat list of ~7 controls. Adding 11+ new controls in the same flat layout would be overwhelming.
- **Proposal:** group filters by section with collapse-headers (shadcn `Collapsible`):
  - Basic (tier, customer type, gender)
  - Loyalty & Spend (visits, spent, points, wallet, coupon usage)
  - Dates (last visit, birthday, anniversary, signup)
  - Engagement (whatsapp opt-in, campaign attribution, message status)
  - Flags (VIP, blocked, blacklisted, complaint, GST)
  - Advanced (order type, payment method, specific-item ordered) — collapsed by default
- Also refactor `DEFAULT_FILTERS` to allow the frontend page to stay lean — one config file, one map per section.

---

## 6 · AND / OR combinator question (blocking design decision)

Today all filters are AND (implicitly, because MongoDB `$and`). Owner will likely want OR at some point:

- "Tier=Gold **OR** total_spent > 10 000" — cross-dimension OR
- "Ordered pizza **OR** ordered pasta" — same-dimension OR

Options:
- **(a)** Keep AND-only. Simplest. Users compose OR via multiple audiences.
- **(b)** Add per-dimension OR (multi-select is already OR). Cross-dimension stays AND.
- **(c)** Full AND/OR/NOT tree (like Salesforce) — powerful but a UX minefield.

**Recommendation:** (b) — multi-select values within a dimension are OR (already the case in some fields), all dimensions AND together. Full tree is a stretch goal.

---

## 7 · Recommended MVP sequence

| Sprint / phase | Filters added | Effort |
|---|---|---|
| **Phase 1 (MVP · P0)** | Fix BUG-A (vip_flag, has_birthday_this_month, whatsapp_opt_in) + add is_blocked / blacklist / complaint_flag | ~1 hour |
| **Phase 2 (P1 quick wins)** | Anniversary this month · Birthday in month X · Age bracket · Lead source · Has GST · Wallet balance · Total coupons · Points earned | ~4 hours |
| **Phase 3 (P2 cross-join, only cheap ones)** | Received campaign X · WhatsApp status failed · Never messaged | ~4 hours |
| **Phase 4 (P2 expensive joins)** | Order-derived filters (last_order_date, avg_order_value, order_type, payment_method) | ~1 day (needs cached fields for perf) |
| **P3** | Defer until data-seeding CR fills the empty columns |

Total Phase 1 + 2 + 3 = ~1.5 days. Delivers the most business value.

---

## 8 · Open questions for owner

| # | Question |
|---|---|
| Q1 | Which tier(s) do we ship first? (My recommendation: Phase 1 + 2 as a single CR) |
| Q2 | AND/OR combinator choice? (My recommendation: option **b** — dimension-level multi-select = OR, dimensions AND together) |
| Q3 | Any filters you consider *must-have* that aren't listed above? |
| Q4 | Any filters listed as P1/P2 you'd bump to P0? |
| Q5 | Cached-field approach for P2 (add `last_order_at`, `avg_order_value` to customer doc, update on order webhook) — OK or would you rather live-aggregate? |
| Q6 | UI grouping (§5) — accepted, or keep flat panel? |

---

## 9 · Files this CR will touch (once approved & scoped)

Backend:
- `core/helpers.py::build_customer_query` — add the approved filter blocks
- `routers/customers.py` — if any new endpoint needed (e.g., distinct lead_source list)

Frontend:
- `pages/AudiencesPage.jsx` and/or `pages/SegmentsPage.jsx` — new filter rows + grouping
- Possibly a small `filter_config.js` to keep the growing list organised

**Hotspot files touched (§PART C):** 0.

---

## 10 · Discovery output block (Role 6)

```text
Discovery complete: CR-033
Confidence: HIGH
Additional filters proposed: 30 across 4 tiers (P0=6, P1=11, P2=13, P3=8 deferred)
Data-density audit: DONE (5,907 customers scanned; 60% of Customer fields have zero data)
Recommended MVP: Phase 1 (P0 · fix BUG-A + 3 new) + Phase 2 (P1 quick wins)
                 → 17 filter dimensions, ~5 hours effort, LOW risk
Blocked by: Owner answers Q1-Q6 (all substantive design choices)
Next role: PLANNING (once Q1-Q6 answered) → INTAKE (register CR-033) → IMPLEMENTATION
Report: memory/crm/crm_roi_sprint/discovery/CR_033_ADDITIONAL_AUDIENCE_FILTERS_DISCOVERY.md
```

*End of CR-033 discovery.*
