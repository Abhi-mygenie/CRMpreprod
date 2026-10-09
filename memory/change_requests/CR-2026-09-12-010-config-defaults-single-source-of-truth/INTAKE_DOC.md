# INTAKE DOC — CR-2026-09-12-010

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-010 |
| **Title** | Config defaults single source of truth — collapse backend `get_app_config()` defaults / FE `DEFAULT_CONFIG` / DB triplication (GAP-008) |
| **Classification** | CR — Refactor / Config baseline |
| **Date Registered** | 2026-09-12 |
| **Reported By** | GAP-008 under owner item 4 |
| **Severity** | P1 — multi-brand will add brand-level defaults; a third layer on a triplicated base is unmanageable |
| **Risk** | HIGH (`RestaurantConfigContext.jsx` HIGH per Part C; ~80 flags; `isOn()` semantics must not change) |
| **Status** | INTAKE ✅ — blocked on G0.7 |
| **Parent** | CR-2026-09-12-001 (Wave 3) |

## 1. Problem

Defaults live in `server.py get_app_config()` (~L1044-1170), `RestaurantConfigContext.jsx DEFAULT_CONFIG` (L28+), and per-restaurant DB docs. `v2/DEFAULTS_3WAY_DIFF.md` documents drift.

## 2. Scope

**IN:** single `DEFAULTS` in backend `services/config_service.py` (after CR-006); `GET /api/app-config/defaults`; FE bootstraps from it with a tiny offline fallback; backfill script for restaurants lacking config docs; CR-2026-08-03-001's two new flags and CR-009's `defaultCountryCode` register here.
**OUT:** changing any default value; `isOn()` behaviour; removing legacy `otpRequired*` flags (addendum rule 5).

## 3. Duplicate Check

| Item | Relationship |
|---|---|
| GAP-008 | Execution |
| `v2/PHASE3_DEFAULTS_CONSOLIDATION_IMPLEMENTATION_PLAN.md` + `PHASE3C_BEFORE_AFTER_PROOF.md` | Reuse plan |
| CR-2026-07-03-005 theme & flags dedup | RELATED — coordinate |

**Verdict: DISTINCT.**

## 4. Blast Radius

LARGE (every UI flag for every restaurant). Mitigation: 3-way diff must be zero before switch; snapshot `/api/config/{rid}` for all live rids.

---

```text
Intake complete: CR-2026-09-12-010
Classification: CR (Refactor / Config)
Severity: P1
Risk: HIGH
Duplicate check: DISTINCT
Evidence: captured
Blast radius: LARGE
Docs updated: this file; README.md
Next: Planning (after G0.7 and CR-006)
```
