# INTAKE DOC — CR-2026-09-12-006

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-006 |
| **Title** | Backend modular split — `server.py` (1,829 lines) → `app/{core,db,models,repositories,services,routers}`; behaviour-preserving; delete dead `/api/docs/*` |
| **Classification** | CR — Refactor (GAP-013 + GAP-018) |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Owner ("correct the architecture so file is no more 1,829-line single file") |
| **Severity** | P1 |
| **Risk** | CRITICAL (`server.py` CRITICAL per Part C; every API call depends on it) |
| **Status** | INTAKE ✅ — Planning blocked until CR-2026-09-12-005 is CLOSED (needs contract snapshots) |
| **Parent** | CR-2026-09-12-001 (Wave 2) |

---

## 1. Problem

Single file holds 11 collections' data access, ~60 routes, auth, POS proxy, uploads, telemetry, dead doc routes. Any change has full-API blast radius; multi-brand work would add more to the same file.

## 2. Target shape (Planning refines)

```
backend/app/
  main.py  core/{config,security}.py  db/mongo.py
  models/  repositories/  services/  routers/  middleware/
backend/server.py  → `from app.main import app`
```
Rules: routers never touch `db`; all Mongo access inside `repositories/` (this is the **Phase B MySQL hinge**); every repository method takes `restaurant_id` explicitly (multi-brand prep); route paths, status codes, payloads unchanged.

## 3. Scope

**IN:** split by domain in order auth → config → customer → banners/pages → feedback/loyalty/dietary → uploads/telemetry/health; remove 8 `/api/docs/*` routes (GAP-018); keep `/api/customer/*` legacy routes until INV-2026-09-12-001 verdict.
**OUT:** any behaviour change; CR-003/004 fixes (land before this); POS proxy expansion (CR-011).

## 4. Duplicate Check

| Item | Relationship |
|---|---|
| GAP-013, GAP-018 | Execution |
| v2 Correction Plan Phase 9 (modularisation) | Reuse module list |
| CR-2026-07-03-011 full POS proxy | New proxy endpoints must land in `routers/pos.py` — CR-011 becomes easier after this |

**Verdict: DISTINCT.**

## 5. Blast Radius

LARGE (entire API). Mitigation: contract snapshot green after each domain extraction; supervisor entrypoint stays `server:app`.

## 6. Regression required (CRITICAL)

Full snapshot suite; admin login → config save → customer app reflects; upload; table-config with `X-POS-Token`; non-qr telemetry; healthz.

---

```text
Intake complete: CR-2026-09-12-006
Classification: CR (Refactor)
Severity: P1
Risk: CRITICAL
Duplicate check: DISTINCT
Evidence: captured (umbrella §5)
Blast radius: LARGE
Docs updated: this file; README.md
Next: Planning (after CR-005 CLOSED)
```

## Addendum 2026-09-15 — SHARED-DB GUARD + Option A re-scope

- **Fact:** MongoDB is **shared with CRM** (INV-2026-09-15-001 §10, verified). `db.orders` is CRM's POS-ingest collection; `customer_app_config` is served by both backends.
- **Rule:** this CR may **delete routes/modules only**. It must **not** drop, rename, or re-index any collection. Any collection change → separate CR with **owner + CRM approval**.
- **Option A (owner D-A):** `/api/customer/*` routes (profile/orders/points/wallet/coupons/update-profile) are retirement candidates — CRM `/scan/*` serves that data. Deletion still waits for **INV-2026-09-15-002 OWNERSHIP_MAP** sign-off. `/api/status` external-caller question (INV-2026-09-12-001) remains open.
- INV-2026-09-12-001's "can be deleted outright" wording is **withdrawn**; use the ownership map instead.
