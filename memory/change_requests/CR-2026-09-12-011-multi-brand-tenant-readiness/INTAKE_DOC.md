# INTAKE DOC — CR-2026-09-12-011

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-011 |
| **Title** | Multi-brand tenant readiness — typed `resolveTenant(hostname) → {type: brand|restaurant, id}`, backend `get_tenant()` dependency enforced in every repository, tenant-namespaced storage keys via `session.js`; raise POS public master-outlet data leak |
| **Classification** | CR — Architecture prerequisite (no user-facing feature) |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Owner item 4 ("so building multibrand is much easier, no conflict") |
| **Severity** | P1 |
| **Risk** | HIGH (tenant entry point + all repositories) |
| **Status** | INTAKE ✅ — blocked on CR-006 + CR-007 CLOSED |
| **Parent** | CR-2026-09-12-001 (Wave 4) |

## 1. Problem

Tenant today = numeric `restaurantId` from URL/hostname with a hard fallback; backend routes take `restaurant_id` inconsistently (some path, some body, some none). A brand/group layer cannot be added without a typed resolver and a mandatory tenant parameter on every data access.

## 2. Scope

**IN:** FE `resolveTenant` extending `useRestaurantId` (P5 in `master_outlet/ARCHITECTURE_REEVALUATION.md`); BE `get_tenant()` dependency; repository signatures require tenant; `session.js` key builder accepts `{brandId?, restaurantId}` **without changing existing key strings**; ticket to POS team re `master-outlet/{id}` leaking `crm_token`, `upi_id`, `email`.
**OUT:** Master Outlet UI/flows (own CRs, after D1–D6); brand data model in DB (Phase B or Master Outlet Planning).

## 3. Duplicate Check

| Item | Relationship |
|---|---|
| `master_outlet/PRE_MODULE_ARCHITECTURE_READINESS.md`, `ARCHITECTURE_REEVALUATION.md` P4/P5/P7 | This CR implements the *prerequisites* those docs assume |
| CR-2026-09-12-009 | Removes the `478` fallback that `resolveTenant` must not reintroduce |

**Verdict: DISTINCT.**

## 4. Blast Radius

LARGE (entry routing + all data access), but additive if done after CR-006/007.

---

```text
Intake complete: CR-2026-09-12-011
Classification: CR (Architecture prerequisite)
Severity: P1
Risk: HIGH
Duplicate check: DISTINCT
Evidence: captured
Blast radius: LARGE
Docs updated: this file; README.md
Next: Planning (after CR-006, CR-007 CLOSED)
```
