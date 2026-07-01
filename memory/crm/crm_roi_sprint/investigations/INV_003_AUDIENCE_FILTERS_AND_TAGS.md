# INV-003 — Audience filters, customer tags, and dynamic tagging feasibility

> **Type**: Investigation Report (read-only, no code changes)
> **Date**: 2026-07-01
> **Requested by**: Owner
> **Role**: Investigation Agent (Role 6)
> **Related**: (none prior) · surfaces 4 latent defects (BUG-A .. BUG-D)
> **Step budget used**: 10 / 10
> **Confidence**: HIGH · code + live-DB evidence

---

## Questions Investigated

- **A** — How do audience filters work? Are they hardcoded when building an audience?
- **B** — How do customer tags (e.g., "VIP") work?
- **C** — Are filters using tags today?
- **D** — Feasibility of a dynamic user-defined tag system that could complement (or replace) filter-based audiences.

---

## TL;DR

1. **Audience filters are 100% hardcoded** — both in the frontend UI and the backend translator function. There is no schema, no registry, no admin config. Adding a new filter dimension requires code changes in two files.
2. **There is no customer tag system in this product.** No `tags` field on customers, no `tags` collection, no tag-management UI. "VIP" appears in the UI but **the `vip` field does not exist on any customer document in the live DB** — it's a phantom feature.
3. **A dynamic tag system is feasible and low-risk to build** (~1-1.5 days). No hotspot files touched. It would sit alongside existing filters (both would work).
4. **Latent defects discovered:** 4 filters that the frontend sends but the backend silently ignores; 1 completely dormant field; 1 phantom UI feature; 1 audience with a misleading customer count.

---

## Q1 — How do audience filters work?

### Answer: **Hardcoded end-to-end. There is no dynamic filter registry.**

### Storage shape
`segments` collection stores each audience as:
```
{ id, user_id, name, filters: dict, customer_count, last_counted_at, created_at, updated_at }
```
`filters` is a **plain Python dict** in the Pydantic model (`schemas.py` line 924) — no validation, no shape enforcement.

### Frontend defines the vocabulary (7 keys)
`AudiencesPage.jsx` line 30:
```
DEFAULT_FILTERS = {
  tier: "all",
  last_visit_days: "all",
  total_spent: "all",
  total_visits: "all",
  has_birthday_this_month: false,
  vip_flag: "all",
  whatsapp_opt_in: "all"
}
```
`SegmentsPage.jsx` (the older/richer segment builder) adds a few more (`city`, `dietary`, `allergies`, `favorite_food`, `points_min/max`, `visits_min/max`, `spent_min/max`, `customer_type`, `search`).

### Backend implements the semantics — as a hardcoded if-else chain
`core/helpers.py::build_customer_query()` (lines 220-316) translates the filter dict to a MongoDB query by explicitly handling exactly these 14 keys:

| # | Key | Backend handling |
|---|---|---|
| 1 | `tier` | `$in` array or scalar equality |
| 2 | `city` | `$in` or equality |
| 3 | `customer_type` | equality |
| 4 | `last_visit_days` | last_visit < (now - N days) |
| 5 | `points_min` | `total_points >= N` |
| 6 | `points_max` | `total_points <= N` |
| 7 | `visits_min` | `total_visits >= N` |
| 8 | `visits_max` | `total_visits <= N` |
| 9 | `total_visits` | hardcoded bucket: "0", "1-5", "6-10", "10+" |
| 10 | `total_spent` | hardcoded bucket: "0-500", "500-2000", "2000-5000", "5000-10000", "10000+" |
| 11 | `spent_min` / `spent_max` | numeric range |
| 12 | `dietary` | `$in` or equality |
| 13 | `allergies` | `$in` or equality |
| 14 | `favorite_food` | case-insensitive regex |
| — | `search` | multi-field regex on name, phone, email |

### Filter values (dropdown options) are also hardcoded
- **Tier** dropdown options are literal JSX: `Bronze`, `Silver`, `Gold`, `Platinum` (`AudiencesPage.jsx` lines 336-339).
- **Spent buckets** are literal strings: `0-500`, `500-2000`, `2000-5000`, `5000-10000`, `10000+`.
- **Visits buckets** are literal strings: `0`, `1-5`, `6-10`, `10+`.
- **Customer type** literal: `normal`, `corporate`.
- **Dietary / allergies** enums.

**Conclusion:** the entire filter system is a fixed vocabulary. To add a new filter dimension, you must edit `build_customer_query()` (backend) + the appropriate page component (frontend). Nothing dynamic.

### Live DB evidence — real segments
Sampled 5 segments from live DB:

| Segment name | Stored filters |
|---|---|
| Gold Customers | `{tier: ["Gold"]}` |
| Inactive 30+ Days | `{last_visit_days: "30"}` |
| Birthday This Month | `{has_birthday_this_month: true}` ⚠️ |
| VIP High Spenders | `{total_spent: "10000+", vip_flag: "true"}` ⚠️ |
| abhsihek | `{tier: "Bronze", last_visit_days: "all", total_spent: "10000+", total_visits: "all", has_birthday_this_month: false, vip_flag: "all", whatsapp_opt_in: "all"}` |

⚠️ = uses filter keys that the backend does NOT implement. See BUG-A below.

---

## Q2 — How do customer tags work?

### Answer: **They don't. There is no tag system in this product.**

### Evidence 1 — Schema check
`Customer` model in `schemas.py` (lines 220-280) has **no `tags` field**. It has:
- `tier` (loyalty grade, auto-computed by points)
- `customer_type` (normal / corporate — user-selected at creation)
- `segment_tags: Optional[List[str]]` — **defined but dormant** (see BUG-C)
- `lead_source`, `favorite_category`, `preferred_language`, `dietary`, `allergies` — attribute-like fields but each is a single-value string, not a tag list

### Evidence 2 — Live DB check
| Check | Result |
|---|---|
| Customers with any `tags` field | **0** |
| Customers with populated `segment_tags` | **0** |
| Customers with `vip=true` | **0** (field itself never set on any doc) |
| Collections with "tag" in name | **None** |
| Distinct `tier` values | `Bronze, Silver, Gold, Platinum` (hardcoded enum) |
| Distinct `customer_type` values | `"", corporate, normal` |

### Evidence 3 — What "VIP" actually is
`CustomersPage.jsx` has extensive UI for a VIP concept:
- Filter dropdown `VIP Only / Non-VIP` (lines 928-930)
- Yellow "VIP Customer" label in customer detail (line 1662)
- Crown icon "VIP Customer" (line 2179)
- Frontend segments store `vip_flag: "true"` on segments named "VIP..."

**But:**
- `vip` is not in the `Customer` Pydantic model
- Zero customers in the DB have the field set
- `build_customer_query` does not handle `vip_flag` → any segment filtered on VIP silently ignores that criterion

So the "VIP" feature is **half-built infrastructure** — UI exists, backend field/filter never got wired.

### Evidence 4 — What actually acts like tags today
Two fields function *conceptually* like enum tags (fixed vocabulary chosen by system, not user):
- **`tier`** — auto-computed based on total points/spend (loyalty engine writes it). Not user-editable per customer.
- **`customer_type`** — set once at creation, choose from `normal` or `corporate`.

Both are single-value scalars, not multi-value tag arrays. They're categorical attributes, not tags.

---

## Q3 — Do filters currently use tags?

### Answer: **No — because tags don't exist. And 3 filter dimensions that pretend to exist are silently dropped by the backend.**

Cross-checking the two sides:

| Filter key (frontend sends) | Backend handles? |
|---|---|
| `tier` | ✅ |
| `city` | ✅ |
| `customer_type` | ✅ |
| `last_visit_days` | ✅ |
| `points_min` / `points_max` | ✅ |
| `visits_min` / `visits_max` | ✅ |
| `total_visits` (bucket) | ✅ |
| `total_spent` (bucket) | ✅ |
| `spent_min` / `spent_max` | ✅ |
| `dietary` / `allergies` | ✅ |
| `favorite_food` | ✅ |
| `search` | ✅ |
| **`vip_flag`** | **❌ IGNORED** |
| **`has_birthday_this_month`** | **❌ IGNORED** |
| **`whatsapp_opt_in`** | **❌ IGNORED** |

Three filters are UI-only — the backend query builder never consumes them → the resulting audience count is wrong when those criteria are the only differentiator.

---

## Q4 — Can we add a dynamic user-defined tag system?

### Answer: **Yes — feasible in ~1-1.5 days, low risk.** No hotspot files.

### Design sketch (proposal, not implementation)

**Data model — pick one of two approaches:**

**Approach A · embedded (simpler, MVP-ready)**
```
Customer.tags: List[str] = []              // free-form tag names
User.available_tags: List[str] = []        // per-tenant catalog of tags in use
```
- **Pros:** Zero new collections. Fast queries via `{"tags": {"$in": [...]}}`.
- **Cons:** Renaming a tag requires bulk update across customers. No color/metadata per tag.

**Approach B · normalised (future-proof)**
```
New collection `customer_tags`:
  { id, user_id, name, color, description, created_by, created_at, member_count }
Customer.tag_ids: List[str] = []           // references
```
- **Pros:** Tags have metadata (color, description). Renaming is cheap.
- **Cons:** Extra join/lookup, more code.

**Recommendation:** ship Approach A first (2-3 hours). Migrate to B if metadata becomes necessary later.

**Backend endpoints needed (Approach A):**
- `GET /api/customers/tags` → distinct tags for this tenant
- `POST /api/customers/{id}/tags` → add tags to a single customer (idempotent)
- `DELETE /api/customers/{id}/tags/{tag}` → remove one tag
- `POST /api/customers/bulk-tag` → apply tag to N customer IDs (audience bulk-tag action)
- Extend `build_customer_query`: add a `tags` filter with `$all` (AND) or `$in` (OR) semantics

**Frontend UI:**
- **CustomersPage** — add a "Tags" chip section on each customer row + a bulk action "Tag selected customers…" on the list
- **AudiencesPage** — add a "Tag" filter chip that lets you type/pick from the tenant's tag catalog
- Optional autocomplete via existing shadcn `Command` component

### Effort & risk
| Metric | Value |
|---|---|
| Backend LOC | ~120 |
| Frontend LOC | ~150 (chip input, filter dropdown, bulk action) |
| DB migration | none (schema-less) |
| Hotspot files touched (§PART C) | **0** |
| Regression risk | LOW — tags are additive; existing filters keep working |
| Effort estimate | ~8-10 hours dev + smoke |
| Related nice-to-haves | auto-tagging rules ("Tag customers with spent > 10k as ▷ big-spender"), tag color badges, tag deletion cleanup |

### How tagging complements (not replaces) filters
- **Filters** = declarative rules. Membership is computed live. "All customers who spent >5k in last 30 days" evolves as data changes.
- **Tags** = declarative membership. Written on the customer document. "Customers I manually tagged as VIP" is stable until you untag.
- **Hybrid** = "Tagged VIP OR spent > 10k" — the ideal audience builder. Requires modest backend work to allow tag+filter combined AND/OR expressions.

---

## Latent defects discovered along the way (worth logging as BUGs)

| ID | Defect | Impact | Where |
|---|---|---|---|
| **BUG-A** | 3 filter keys sent by frontend (`vip_flag`, `has_birthday_this_month`, `whatsapp_opt_in`) are silently ignored by `build_customer_query()`. Segment counts are wrong when those are the differentiating criteria. | MEDIUM — misleading counts, misleading audience emails/messages | `core/helpers.py:220-316` |
| **BUG-B** | The `vip` field on customers is referenced by UI (CustomersPage filter, badges, VIP toggle) but is not in the Pydantic model and has never been written to any of the current customers | HIGH cosmetic / LOW functional — feature appears functional but does nothing | `schemas.py Customer model`, DB |
| **BUG-C** | `customers.segment_tags: Optional[List[str]]` is defined but never populated by any code path. Dead field. | LOW — noise in schema, potential future confusion | `schemas.py` lines 230, 335, 445 |
| **BUG-D** | Segment "VIP High Spenders" (live DB, `id=9e278f81-...`) has stored filter `{vip_flag: "true", total_spent: "10000+"}` and shows `customer_count=4`. The vip_flag is dropped — the 4 customers are just the total_spent≥10000 set. Users are led to believe there's VIP filtering happening. | MEDIUM — trust erosion | Live DB `segments` collection |

**Recommendation:** file BUG-A + BUG-B as a bundle. BUG-C + BUG-D become documentation cleanup / decision items.

---

## Files consulted (evidence sources)

| File | Lines | Purpose |
|---|---|---|
| `/app/backend/models/schemas.py` | 220-280, 909-928 | Customer model + Segment model |
| `/app/backend/core/helpers.py` | 220-316 | `build_customer_query()` translator |
| `/app/backend/routers/customers.py` | 995-996, 1339-1500 | Segment CRUD + refresh + preview endpoints |
| `/app/frontend/src/pages/AudiencesPage.jsx` | 30, 80-88, 327-390 | DEFAULT_FILTERS, filter tag chips, filter UI |
| `/app/frontend/src/pages/SegmentsPage.jsx` | (surveyed) | Older/richer segment builder — same shape, more knobs |
| `/app/frontend/src/pages/CustomersPage.jsx` | 919-930, 1662, 2179 | VIP UI references (all references to phantom `vip` field) |
| Live DB `customers` collection | distinct + count | 0 with `tags`, 0 with `vip`, tier ∈ {Bronze,Silver,Gold,Platinum} |
| Live DB `segments` collection | 5 samples | Filter shape examples · BUG-D evidence |
| Live DB collection listing | full | No tag-related collection exists |

---

## Investigation Agent — output block (Role 6)

```text
Investigation complete: INV-003
Root cause: N/A (architecture + feasibility inquiry, not a single-issue bug hunt)
Confidence: HIGH
Steps used: 10 / 10
Findings:
  1. Filters are hardcoded end-to-end (7 frontend keys × 14 backend keys handled).
  2. No user-defined tag system exists. "VIP" is a phantom feature.
  3. 4 latent defects (BUG-A..BUG-D) surfaced.
  4. Dynamic tagging is feasible, low risk, ~1-1.5 days effort.
Recommendation:
  A) Owner reviews defects — decide which of BUG-A/BUG-B/BUG-C/BUG-D to file
     and prioritise.
  B) Owner decides: build tag system (Approach A first) or park it.
  C) If tag system approved, next step = INTAKE role to register CR-033 (or
     next-available ID) with acceptance criteria and open questions
     (tag data model choice A/B, AND/OR filter combination semantics, whether
     tier/customer_type should be migrated to the new tag store, whether we
     also want auto-tagging rules).
Report: memory/crm/crm_roi_sprint/investigations/INV_003_AUDIENCE_FILTERS_AND_TAGS.md
Next role: Owner decision — BUG intake (for defects) and/or CR intake (for tag feature).
```

*End of INV-003.*
