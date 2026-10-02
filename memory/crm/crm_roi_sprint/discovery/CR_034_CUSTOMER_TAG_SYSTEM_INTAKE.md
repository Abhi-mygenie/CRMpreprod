# CR-034 — Intake · Customer Tag System

> **Type**: Intake doc (Role: INTAKE)
> **Date opened**: 2026-07-01
> **Owner requester**: Abhishek
> **Status**: 🔵 Intake complete — awaits Planning approval
> **Related**: INV-003 (feasibility + design sketch already done)
> **Companion CR**: CR-033 (additional filters — parallel effort)
> **Effort estimate**: ~8-10 hours dev + smoke
> **Risk**: LOW
> **Priority**: P1 (compensates for VIP phantom feature, unblocks manual segmentation use case)

---

## 1 · Title

**Add a per-tenant, free-form customer tagging system with a tag-based audience filter.**

---

## 2 · One-line summary

Let restaurant owners create arbitrary tags (e.g. `VIP`, `Regular`, `Anniversary Guest`, `High Roller`), attach one or more of them to any customer (individually or in bulk), and build audiences using a new `tags` filter dimension. Complements the rule-based filters — does not replace them.

---

## 3 · Problem statement

**Owner report**: "There are some tags which we use in the audience like VIP … we need a way to add a tag, and then tag can be attached to any customer. That tag can be used to make the audience."

**Current reality (per INV-003):**
- No `tags` field on `Customer` model. Zero customers have any tag data.
- No `tags` or `customer_tags` collection.
- "VIP" is a phantom feature — UI references it but the underlying `vip` field is never written; even the `vip_flag` boolean in the schema is used by only 46 of 5 907 customers, and the frontend filter for it is silently dropped by the backend (BUG-A from INV-003).
- Owners currently have only two ways to group customers: rule-based filters (INV-003 · 14 hardcoded dimensions) or the `tier` enum computed by the loyalty engine. There is no way to declare arbitrary manual membership.

**Gap:** rule-based segments are dynamic (membership changes as data changes). Tags are stable (membership stays until you untag). Both patterns are legitimate; only one exists today.

---

## 4 · Duplicate check

Grepped registries for `tag system`, `customer tags`, `customer_tags`, `tag audience`. **No duplicate CR/BUG.** INV-003 findings drive this intake.

---

## 5 · Severity & risk

| Field | Value |
|---|---|
| Severity | LOW (additive feature) |
| Risk | LOW · schema-less field on `Customer` · additive query condition in `build_customer_query` |
| Blast radius | 1 backend router (customers.py) · 1 backend helper (helpers.py) · 2 frontend pages (CustomersPage, AudiencesPage) |
| Money-critical path | NONE |
| Hotspot files (§PART C) | **0** |
| Rollback | Delete field from documents / remove filter block · idempotent |

---

## 6 · Scope

### In scope
- Add `Customer.tags: List[str] = []`
- Per-tenant catalog stored as `users.available_tags: List[str] = []` (auto-updated on any tag write)
- New CRUD endpoints:
  - `GET /api/customers/tags` — list distinct tags for tenant
  - `POST /api/customers/{id}/tags` — add tags to one customer (idempotent, dedupe)
  - `DELETE /api/customers/{id}/tags/{tag}` — remove one tag
  - `POST /api/customers/bulk-tag` — apply tag to N customer IDs
  - `POST /api/customers/bulk-untag` — remove tag from N customer IDs
- Extend `build_customer_query()` with a `tags` filter — semantics per Q2 below (OR default)
- Frontend UI:
  - **CustomersPage**: tag chip section on each row + "Add tag" inline chip input with autocomplete from tenant catalog
  - **CustomersPage**: bulk action "Tag / untag selected customers" (works with the existing multi-select checkbox column)
  - **AudiencesPage / SegmentsPage**: new "Tag" filter chip that multi-selects from tenant catalog

### Out of scope (deferred to follow-up CRs)
- Tag metadata (colours, descriptions) — would require moving to Approach B (normalised collection)
- Auto-tagging rules ("tag as `▷ big-spender` when total_spent > 10k")
- Tag rename / merge tooling
- Tag-based access control / segmentation permissions
- Tag deletion cleanup (remove tag from all customers when removed from catalog)

### Not affected
- Send pipeline (Freshmarketer webhook, DirectSend, campaigns) — tags are read-only for the audience builder; broadcast logic uses the resolved customer_id list, unchanged
- Existing filters — additive, no changes to today's 14 dimensions
- Loyalty tier logic — untouched
- POS integration — untouched

---

## 7 · Acceptance criteria (candidate — refined in Planning)

- **AC1** — POST /customers/{id}/tags with `{tags:["VIP","Anniversary"]}` adds both tags idempotently (no duplicates in the customer's array; new entries appear in the tenant's `available_tags`)
- **AC2** — DELETE /customers/{id}/tags/VIP removes only that tag; other tags on the same customer stay
- **AC3** — POST /customers/bulk-tag with 50 customer IDs + tag `Regular` applies to all 50 in one round-trip
- **AC4** — GET /customers/tags returns the tenant's active tag list sorted alphabetically
- **AC5** — Audience filter `{tags:["VIP"]}` returns customers with VIP in their tags array; `{tags:["VIP","Regular"]}` uses OR by default (returns customers with either), or AND if `tags_mode="all"` (design choice per Q2)
- **AC6** — Segment count computed correctly via `count_customers_by_filters` — no silent-ignore bug
- **AC7** — Tenant isolation: Tenant A's tags are not visible in Tenant B's tag catalog or audience filter
- **AC8** — Deleting a tag on the last-referenced customer removes it from `users.available_tags` (housekeeping) OR leaves it as an unused option (design decision — see Q3)
- **AC9** — CustomersPage UI: user can type a new tag name, hit Enter, it attaches to the current customer AND appears in the tenant catalog on next open
- **AC10** — Existing rule-based filters continue to work identically (no regression)

---

## 8 · Owner decisions LOCKED (from chat 2026-07-01)

| # | Decision |
|---|---|
| D1 | Ship as its own CR (CR-034), parallel to CR-033 (additional filters). Tags and filter-additions are logically distinct. |
| D2 | Use INV-003 Approach A (embedded on customer + per-tenant catalog). Approach B (normalised collection with colour/metadata) deferred. |

## 9 · Owner decisions OPEN (block Planning)

| # | Question | Options | Recommended default |
|---|---|---|---|
| Q1 | Where does the "add tag" UI live besides the customer page? | (a) Only CustomersPage · (b) Also on Customer Detail modal · (c) Also on OrdersPage row expand | (b) — both list-row chip and detail-modal expanded editor |
| Q2 | Multi-tag filter semantics — default | (a) OR (any tag matches) · (b) AND (all tags must match) · (c) User picks per-audience with a toggle | (a) OR default, offer toggle to switch (matches how most email tools work) |
| Q3 | When last customer with tag `X` is untagged, remove `X` from tenant catalog? | (a) Auto-remove · (b) Keep in catalog · (c) Show as "unused" with a delete action | (b) — keep to preserve muscle memory; add an admin cleanup screen later |
| Q4 | Tag name constraints | (a) Free-form any string · (b) Max length 30 chars, alphanumeric + space + `-` `_` · (c) Case-normalised (all lowercase) | (b) — sensible; case-preserving display but case-insensitive dedup |
| Q5 | Should `tier` (Bronze/Silver/Gold/Platinum) become a tag? | (a) Keep separate — tier is loyalty-computed · (b) Also expose as read-only tags | (a) — keep the mental model separation |
| Q6 | Migration for the 46 existing customers with `vip_flag=true` | (a) Auto-add `VIP` tag on backfill · (b) Leave `vip_flag` untouched and separate · (c) Migrate + deprecate the boolean | (a) — auto-tag on deploy, no-op for the rest |

Recommended defaults unblock immediately: Q1=b, Q2=a, Q3=b, Q4=b, Q5=a, Q6=a.

---

## 10 · Files that WILL change

| Layer | File | Change |
|---|---|---|
| Backend | `models/schemas.py` | Add `tags: List[str] = []` to `CustomerBase` + `CustomerUpdate`; add `available_tags: List[str] = []` to user schema |
| Backend | `routers/customers.py` | 5 new endpoints (list, add, remove, bulk-tag, bulk-untag) |
| Backend | `core/helpers.py::build_customer_query` | +1 filter block for `tags` with mode `any`/`all` |
| Backend | Migration script | Auto-add `VIP` tag to the 46 `vip_flag=true` customers (per Q6-a) |
| Frontend | `pages/CustomersPage.jsx` | Tag chip section per row + inline chip input + bulk-tag action on multi-select |
| Frontend | `pages/AudiencesPage.jsx` (and possibly `SegmentsPage.jsx`) | Tag filter chip with autocomplete + optional AND/OR toggle |
| Frontend | (optional) `components/TagChip.jsx` (new) | Reusable tag pill component |

---

## 11 · Files that WILL NOT be touched

- Any hotspot file (§PART C): `core/coupon.py`, `routers/pos.py`, `core/whatsapp.py`, `core/loyalty.py`, `core/campaign_jobs.py`, `services/invoice_generator.py` — all untouched
- Any router besides `customers.py`
- Send pipeline, event triggers, POS gateway — all untouched

---

## 12 · Intake output block (Role 6)

```text
Intake complete: CR-034
Title: Customer Tag System
Severity: LOW
Risk: LOW
Duplicate check: none
Blast radius: 3 backend files + 2 frontend files + 1 optional new component
Money-critical: NO
Hotspot files touched: 0
Effort: ~8-10 hours dev + smoke (Approach A embedded)
Blocking Qs (open): Q1-Q6 (all optional with recommended defaults)
Next role: PLANNING (produce full plan with regression matrix) OR
           skip to IMPLEMENTATION if owner accepts recommended defaults verbatim
Dashboard: row will be appended
Decisions: 2 rows will be appended
Companion CR: CR-033 (additional filters) — separate track
```

*End of CR-034 intake.*
