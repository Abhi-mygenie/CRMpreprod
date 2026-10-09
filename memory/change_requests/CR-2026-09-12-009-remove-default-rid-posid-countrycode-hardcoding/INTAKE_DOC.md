# INTAKE DOC — CR-2026-09-12-009

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-009 |
| **Title** | Remove non-716 hardcodings — default restaurant `478` fallback, `pos_id`, country code `+91` → config / explicit error |
| **Classification** | CR — Cleanup / Hardcoding removal (INV-2026-08-03-001 Part 2) |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Owner ("remove hardcoding if any") |
| **Severity** | P2 |
| **Risk** | MEDIUM (`useRestaurantId.js` is the tenant entry point for every route) |
| **Status** | INTAKE ✅ — blocked on D-478 |
| **Parent** | CR-2026-09-12-001 (Wave 3) |

## 1. Problem

| Hardcode | Location | Multi-brand impact |
|---|---|---|
| `const defaultRestaurantId = "478"` | `utils/useRestaurantId.js:134` | Unknown hostname silently serves restaurant 478 — wrong tenant, wrong brand |
| `pos_id` default | per INV-2026-08-03-001 Part 2 (Planning to pin lines) | Cross-tenant POS calls |
| `+91` phone normalisation | per INV Part 2 / BUG-008 | Blocks non-India brands |

## 2. Scope

**IN:** unresolved tenant → explicit `RestaurantNotFound` page (or dev-only env override, per D-478); `pos_id` from restaurant-info/config; `defaultCountryCode` from config.
**OUT:** 716 items (CR-2026-08-03-001); brand-level resolver (CR-011).

## 3. Duplicate Check

| Item | Relationship |
|---|---|
| CR-2026-08-03-001 | Covers 716 only (7 scope items) — verified 2026-09-12; 478/pos_id/+91 NOT in its scope |
| INV-2026-08-03-001 Part 2 | Evidence source |
| GAP-016 | Adjacent |

**Verdict: DISTINCT.**

## 4. Blast Radius

MEDIUM — QR entry for all restaurants; preview URLs that rely on the fallback must add `/478`.

---

```text
Intake complete: CR-2026-09-12-009
Classification: CR (Cleanup)
Severity: P2
Risk: MEDIUM
Duplicate check: DISTINCT
Evidence: captured (§1)
Blast radius: MEDIUM
Docs updated: this file; README.md
Next: Planning (after D-478)
```
