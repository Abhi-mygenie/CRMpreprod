# CR-001B — Historical / Migration Data Audit

> **Status:** `cr001b_docs_updated_forward_only_fix_owner_decision_recorded` (2026-05-21 — old-order cleanup removed from scope; audit remains read-only/planning)
> **Sprint:** CRM 1.0
> **Priority:** P2 (audit-only; no live customer impact)
> **Parent:** CR-001 (see `CR_001_INDEX.md`)
> **Date:** 2026-05-21
> **Code surface:** `/app/backend/routers/migration.py` (`background_order_sync`) + `/app/backend/routers/customers.py` (`background_customer_sync`)
> **Companion:** `CR_001A_REALTIME_POS_WEBHOOK.md`

---

## 1. Objective

Independently verify that the migration ingestion path (`background_order_sync` pulling from MyGenie REST API) is mapping every field consumed downstream. Document findings. **No code changes, no DB mutations** in this CR unless separately approved.

**Out of scope per owner decision (2026-05-21):** any cleanup, backfill, marking, or mutation of pre-fix realtime orders. The 17 affected realtime orders (1 recoverable + 16 unrecoverable, 2026-05-21 cohort) remain in DB as-is.

---

## 2. Scope

In scope:
- **Read-only audit** of `/app/backend/routers/migration.py` `background_order_sync` (L17–176) field mapping against:
  - the MyGenie REST API response shape (sample one live response)
  - the current `POSOrderWebhook` / `OrderItem` schema (with CR-001A H1 aliases applied)
  - every field consumed by CRM dashboards, analytics, customer detail UI, and Phase 1 logic from CR-001A and CR-001C
- One-shot **read-only** data-quality scan of historical orders to document any gaps.
- Decide the future of the migration path: keep as primary historical backfill or sunset (planning decision only).

Out of scope:
- Any change to realtime ingestion → **CR-001A**.
- Any UI / analytics work → **CR-001C**.
- New migration features.
- ❌ **Marking / cleanup / backfill / mutation of old realtime orders** (owner decision 2026-05-21).
- ❌ **Any code change in `migration.py`** unless a separate CR-001B-fix is opened after the audit completes.

---

## 3. Inputs

| Input | Source |
|---|---|
| Migration code path | `/app/backend/routers/migration.py` L17–176 |
| MyGenie REST response (sample) | needs one live sample captured — owner action item |
| Realtime POS payload (sample) | `pos_request_logs` order `868862` (already captured) |
| CRM consumer set | `services/analytics_service.py`, `routers/customers.py`, `routers/points.py`, `routers/wallet.py`, frontend `CustomerDetailPage.jsx`, Dashboard |

---

## 4. Audit checklist

For each field consumed downstream, confirm: (a) realtime sends it, (b) migration sets it, (c) names match.

### 4.1 Order-level fields

| Field | Realtime sends? | Migration sets? | Notes |
|---|---|---|---|
| `pos_order_id` | yes (`order_id`) | yes | ✓ |
| `pos_restaurant_id` | yes (`restaurant_id`) | yes | ✓ |
| `pos_id` | yes | yes | ✓ |
| `cust_mobile`, `cust_name`, `cust_email` | partial (no email) | yes | confirm consistency |
| `order_amount` | yes | yes | ✓ |
| `order_type` | yes (`delivery`/`dinein`/`take_away`/`WalkIn`/...) | needs check — does MyGenie API return same vocabulary? | **AUDIT-O1** |
| `payment_method` / `payment_status` / `payment_type` | sometimes | needs check | **AUDIT-O2** |
| `tax_amount`, `gst_tax`, `vat_tax`, `service_tax`, `tip_amount`, `delivery_charge`, `coupon_discount`, `wallet_used` | not seen in captured payload yet | needs check | **AUDIT-O3** — likely partially populated |
| `order_created_at` | yes (after CR-001A H1) — POS field `created_at` | yes (migration sets `order_created_at` directly) | ✓ after H1 |
| `address_id`, `room_id`, `paid_room` | no (POS sends none) | no | gated on CR-001A Q11/Q10 |
| `mygenie_synced`, `last_synced_at` | not set | set | distinguishes paths — **keep as-is** |
| `source` / `ingestion_path` field | not set | not set | **AUDIT-O4** — propose adding `ingestion_source: "realtime" \| "migration"` as a non-breaking marker. Optional. |

### 4.2 Item-level fields

| Field | Realtime sends? | Migration sets? | Notes |
|---|---|---|---|
| `item_name` | yes | yes | ✓ |
| `pos_food_id` | yes (`item_id`, after CR-001A H1) | yes (from `food_details.id`) | type drift — realtime captured value is a string `"2248345"`, migration uses `food_details.get("id")` which may be int. **AUDIT-I1** — confirm; standardize to `str` |
| `item_qty` | yes (`qty`, after CR-001A H1) | yes (from `quantity`) | ✓ |
| `item_price` | yes (`price`, after CR-001A H1) | yes (from `price` or `unit_price`) | ✓ |
| `item_category` | not seen | needs check | **AUDIT-I2** |
| `variant`, `variations`, `add_ons`, `add_on_ids`, `add_on_qtys` | not seen in 868862 (single-item combo) | needs check | **AUDIT-I3** — likely only populated when actually present |
| `gst_amount`, `vat_amount`, `discount_amount`, `service_charge` | not seen | needs check | **AUDIT-I4** |
| `is_veg` | not seen yet | needs check | **AUDIT-I5** — CR-001A A4 writes `is_veg` to `order_items` from realtime; migration must do the same for parity |
| `station`, `item_type`, `food_status`, `ready_at`, `serve_at`, `cancel_at` | not seen | needs check | **AUDIT-I6** — operational fields, lower priority |
| `item_notes` | not seen | needs check | **AUDIT-I7** |

### 4.3 Customer-level fields (touched by migration's auto-create)

| Field | Realtime path | Migration path | Notes |
|---|---|---|---|
| `total_orders` | $inc on realtime | needs check — does migration aggregate over imported orders? | **AUDIT-C1** |
| `total_amount_spent` | $inc on realtime | needs check | **AUDIT-C2** |
| `last_order_date` / `last_interaction_date` / `updated_at` | set on realtime (CR-001A A1) | needs check | **AUDIT-C3** |
| `total_points_earned`, `total_wallet_used` | $inc on realtime (CR-001A A2) | needs check — migration should set these to the sum of awarded points / wallet uses across imported orders | **AUDIT-C4** |
| `addresses[]` | populated via `POST /api/pos/customers/{id}/addresses` | needs check — does migration backfill addresses from MyGenie? | **AUDIT-C5** |

---

## 5. ISSUE-10 — Customer Migration Sync Stops Mid-Loop (RESOLVED via minimal fix 2026-05-21)

> Full root-cause, evidence, and fix diff in `/app/memory/crm/crm_1_0/findings/ISSUE_10_CUSTOMER_MIGRATION_SYNC_STOPS_MID_LOOP.md`.

**Root cause confirmed (CRM-side, zero POS fault):** `customer_addresses` array from MyGenie can contain `null` entries. `/app/backend/routers/customers.py` L123 called `mg_addr.get("id", "")` on those nulls → `AttributeError` → broad outer `except` swallowed the exception → entire background task died with `status="failed"` stored only in-memory.

**Reproduced across 3 restaurants** (635 crashed at 228/234, 541 at 0/N, 689 at 6/2,034) — every one failed at the first customer whose `customer_addresses` array contained a `null`.

**Fix applied (preview env, owner-scoped to "null-address guard only"):** 5-line `isinstance(mg_addr, dict)` guard inside the address loop. Skips non-dict entries with a `logger.warning(...)` and continues. No other code changed.

**Status:** awaiting verification re-sync for 689 / 541 / 635 by owner. Diagnostic INFO/EXCEPTION logging retained in code for future regressions.

**Out-of-scope follow-ups deferred (still tracked in findings doc §6 as F1/F2/F4):** safe `.get("id")` for `mygenie_customer["id"]` on L89/L101/L154; per-record `try/except` in the main loop; persisting `customer_sync_runs` to MongoDB. These will be re-raised only if a new failure mode surfaces.

---

## 6. ~~Cleanup workstream — 16 unrecoverable realtime orders~~ — REMOVED FROM SCOPE (owner decision 2026-05-21)

> The cleanup workstream previously documented here (mark `items[].item_data_lost`, delete `items[]`, re-fetch from MyGenie, etc.) is **no longer part of CR-001B**.
>
> **Owner decision (2026-05-21):** old realtime broken item data will **remain in DB as-is**. No mark, no backfill, no re-fetch, no historical correction script. The 17 affected realtime orders (1 recoverable `pos_order_id=868862` + 16 unrecoverable, 2026-05-21 cohort across restaurants 478 / 523 / 675) are explicitly accepted as known historical data noise.
>
> Q15 (cleanup of 16 unrecoverable orders) is therefore **closed without action**.

---

## 7. Open questions (CR-001B scope)

| Q# | Topic | Options | Status / Recommended |
|---|---|---|---|
| **Q14** | Audit depth | A) AUDIT-O1..O4 + AUDIT-I1..I7 + AUDIT-C1..C5 (full); B) order + customer only, skip item-level operational fields (skip AUDIT-I6/I7); C) item-level audit only | Pending — recommend **A** (do it once, do it right) |
| **Q14.1** | After audit, who fixes migration gaps? | a) reopen migration code in same CR; b) split a CR-001B-fix sub-CR after audit completes; c) accept gaps and document only | Pending — recommend **b** (avoids scope creep; CR-001B stays read-only) |
| ~~Q15~~ | ~~Cleanup of 16 unrecoverable orders~~ | n/a | **CLOSED 2026-05-21 — owner decision: leave as-is, no cleanup.** |
| **Q17** | ISSUE-10 customer-sync hotfix | n/a | **APPLIED 2026-05-21** — minimal null-address guard only (5-line `isinstance` check + diagnostic logging). F1/F2/F4 in findings doc §6 remain proposals, not approved. |
| **Q18** | Re-sync customers post-ISSUE-10 hotfix | A) all 8 restaurants; B) active prod only; C) just 689 | Owner currently re-syncing affected restaurants on preview env. |

---

## 8. Deliverables

1. Written audit report at `/app/memory/crm/crm_1_0/findings/CR_001B_MIGRATION_AUDIT_REPORT.md` listing every AUDIT-* item with **finding** (pass / gap / unknown), **evidence query**, and **proposed fix description (no code change in this CR)**.
2. ~~One-time cleanup migration applied to the 16 affected realtime orders per Q15 outcome.~~ **REMOVED — owner decision 2026-05-21, see §6.**
3. (Conditional) Follow-up CR proposal if Q14.1 = b.

---

## 9. Test plan (lightweight — audit is read-only)

- For each AUDIT-* item, run an aggregation query and record sample IDs.
- ~~Cleanup spot-check and idempotency verification~~ — n/a, cleanup removed from scope.
- Confirm no DB writes occur during the audit (it is read-only by design).

---

## 10. Status

```
cr001b_docs_updated_forward_only_fix_owner_decision_recorded
```

Outstanding: Q14, Q14.1.
Closed: Q15 (owner decision: leave as-is), Q17 (applied 2026-05-21).
In-progress: Q18 (re-sync verification by owner on preview env).

Independent of CR-001A and CR-001C — read-only audit can start as soon as Q14 / Q14.1 are answered.

---

## 11. Change log

| Date | Change |
|---|---|
| 2026-05-21 | Initial CR-001B split out of CR-001. |
| 2026-05-21 | ISSUE-10 discovered (customer sync stops mid-loop). Diagnostic logging + null-address guard deployed (owner-scoped, minimal). Q17 closed. |
| 2026-05-21 | Owner decision: forward-only fix. Cleanup of 16 unrecoverable realtime orders **removed from CR-001B scope**. Q15 closed without action. CR-001B remains a read-only audit; any subsequent migration code fix requires a separate CR-001B-fix. |
