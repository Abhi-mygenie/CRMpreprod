# INTAKE DOC — CR-2026-09-12-016

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-016 |
| **Title** | Delete the dead source references to `REACT_APP_CRM_API_KEY` and `REACT_APP_RESTAURANT_ID` |
| **Classification** | **CR** — dead-code deletion |
| **Date Registered** | 2026-10-06 (ID reserved 2026-09-12; filed today) |
| **Reported By** | Decision **D-007-2** in `CR-2026-07-03-007/IMPACT_ANALYSIS_F07_2026-09-12.md`, which ends: *"Provisional ID `CR-2026-09-12-016`. **Owner drives Role 1 to file it.**"* |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Severity** | **P3** — cleanup, no functional effect |
| **Risk** | **LOW** — deleting references to keys that are not supplied |
| **Status** | 📝 REGISTERED (Role 1 done) — Wave 3 |
| **Parent** | `CR-2026-07-03-007-prod-deploy-env-hardening` |
| **Blast radius** | **SMALL** — frontend source references only |

## 1. Why it exists

`CR-2026-07-03-007`'s env audit flagged two frontend environment keys as dead. Its impact analysis
recorded the ruling and spun off a provisional ID rather than widening its own scope:

> **D-007-2** — 2 audit-flagged FE keys (`REACT_APP_CRM_API_KEY`, `REACT_APP_RESTAURANT_ID`) →
> **(b)** — new CR to grep and delete dead source references. Wave 3. Provisional ID
> `CR-2026-09-12-016`. Owner drives Role 1 to file it.

That filing never happened. The ID has been cited in two documents and the Wave-1 closure handover
for roughly four weeks with no registry row behind it. **This intake is the filing it asked for** —
nothing in scope has changed.

## 2. Scope

Grep the frontend for both keys and delete every reference that is provably unused — the
`process.env` reads, any `.env.example` lines, and any dead branch that only exists to consume them.

Explicitly **out of scope**: `REACT_APP_RESTAURANT_ID`'s behavioural cousin, the hardcoded `478`
default in `useRestaurantId.js`. That belongs to `CR-2026-09-12-009`. Deleting a key and changing a
default-restaurant fallback are different changes with different risk, and conflating them is how a
P3 cleanup turns into a customer-facing incident.

## 3. Verification required before closure

| # | Check |
|---|---|
| V1 | Neither key appears anywhere in `frontend/src` after the change |
| V2 | Build is clean, no new lint or unused-import warnings |
| V3 | Neither key is present in `frontend/.env` — and if either is, **stop and re-intake**: it would mean the key is live, not dead |
| V4 | CRM calls still work (confirming `REACT_APP_CRM_API_KEY` really was unused) |
| V5 | Restaurant resolution still works from the URL (confirming `REACT_APP_RESTAURANT_ID` really was unused) |
| V6 | Contract snapshots unchanged — a deletion must not move a single response byte |

**V3 must run first.** The audit that flagged these keys ran in September; if either has since been
re-added to `.env`, the premise of this CR is void.

## 4. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| `CR-2026-07-03-007` (prod deploy env hardening) | Parent. Owns the audit and the env posture; this owns only the dead-reference deletion | **DISTINCT** |
| `CR-2026-07-03-012` (leaked-cred doc scrub + CI lint on `REACT_APP_*_PASSWORD/SECRET/TOKEN`) | Its CI lint rule is the thing that stops these keys coming back | **RELATED** |
| `CR-2026-09-12-009` (remove `478` / `pos_id` / `+91` hardcoding) | Owns the `478` default — deliberately excluded here, see §2 | **RELATED — scope boundary** |

**Verdict: DISTINCT.**

## 5. Sequencing note

Wave 3, as D-007-2 set. It should run **after** `CR-2026-09-12-006` (backend modular split), not
before — a deletion CR competing with a large refactor for the same files produces avoidable merge
pain, and this one is in no hurry.

---

```text
Intake complete: CR-2026-09-12-016
Classification: CR (dead-code deletion)
Severity: P3
Risk: LOW
Duplicate check: DISTINCT (parent CR-2026-07-03-007; RELATED CR-2026-07-03-012, CR-2026-09-12-009)
Evidence: captured — CR-2026-07-03-007/IMPACT_ANALYSIS_F07_2026-09-12.md D-007-2 and §88, SESSION_HANDOVER_WAVE_1_CLOSURE_2026-09-12.md:114
Blast radius: SMALL — frontend source references
Docs updated: this file; ../index.yml; ../README.md; ../INTAKE_PASS_2026-10-06.md
Next: Planning, Wave 3, after CR-2026-09-12-006. Run V3 first — it can void the CR
```
