# INTAKE DOC — CR-2026-09-12-014 (PHASE B)

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-014 |
| **Title** | Phase B — Database migration MongoDB → MySQL (schema, SQLAlchemy repositories, migration script, dual-run, cut-over) |
| **Classification** | CR — Data / Architecture (INTAKE ONLY — Planning gate closed) |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Owner ("we will be moving database to mysql so those changes need to be planned separately as phase b") |
| **Severity** | P2 (strategic, not urgent) |
| **Risk** | **CRITICAL** (database, production data, irreversible cut-over — §5 CRITICAL triggers) |
| **Status** | INTAKE ✅ — **Planning BLOCKED until CR-2026-09-12-006 (repositories) is CLOSED** |
| **Parent** | CR-2026-09-12-001 (Phase B) |

## 1. Why intake now, plan later

The only thing Phase A must get right for Phase B is CR-006's `repositories/` boundary. If Planning for MySQL starts before that boundary exists, the split would be done twice. Registering now locks the dependency and lets Phase A reviewers check "does this design make MySQL harder?" on every CR.

## 2. Known inputs for Planning (from 2026-09-12 code scan)

| Collection | Docs shape | MySQL note |
|---|---|---|
| `customers`, `users` | flat + `password_hash` | plain tables, `restaurant_id` FK |
| `customer_app_config` | ~80-key JSON blob per rid | `JSON` column or EAV — decide in B0 |
| `loyalty_settings`, `coupons`, `points_transactions`, `wallet_transactions` | flat | tables |
| `feedback`, `dietary_tags_mapping` | flat / small JSON | tables |
| `orders`, `status_checks` | legacy / low use — confirm via INV-2026-09-12-001 | may drop |
| `otp_codes` (new in CR-003) | TTL-indexed | expiry column + purge job |
| non-QR telemetry (`_ensure_non_qr_indexes`) | TTL-indexed | same |

## 3. Scope (for Planning later)

B0 schema/ERD → B1 SQLAlchemy 2.x async + Alembic → B2 SQL repositories behind the **same interface**, `DB_BACKEND=mongo|mysql` switch → B3 migration script w/ counts + checksums, dry-run → B4 dual-run against contract snapshots → B5 cut-over, drop `motor`.
**OUT of Phase A:** everything above.

## 4. Duplicate Check

No prior CR or GAP mentions MySQL. **DISTINCT.**

## 5. Blast Radius

TOTAL (all persisted data). Requires owner approval, freeze window, rollback plan, E2E regression, audit note (§5 CRITICAL).

## 6. Owner decisions (needed at Planning time, not now)

D-B1 MySQL flavour/host · D-B2 freeze window · D-B3 keep Mongo read-only for N days post cut-over?

---

```text
Intake complete: CR-2026-09-12-014
Classification: CR (Data / Architecture — intake only)
Severity: P2
Risk: CRITICAL
Duplicate check: DISTINCT
Evidence: captured (§2)
Blast radius: TOTAL
Docs updated: this file; README.md
Next: HOLD — Planning opens when CR-2026-09-12-006 is CLOSED
```

## Addendum 2026-09-15 — SHARED-DB GUARD

- MongoDB is **shared with CRM** (INV-2026-09-15-001 §10). A Customer-App-only MySQL migration would **split customer data** from CRM and break Option A (owner D-A). 
- **Planning for this CR is blocked** until INV-2026-09-15-002 OWNERSHIP_MAP exists and the owner + CRM jointly decide the database strategy. Risk stays **CRITICAL**; requires CRM co-ownership of any migration.
