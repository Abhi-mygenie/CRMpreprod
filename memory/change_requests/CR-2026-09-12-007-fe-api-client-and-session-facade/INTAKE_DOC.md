# INTAKE DOC — CR-2026-09-12-007

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-007 |
| **Title** | Frontend API-client facade (`src/api/clients/{own,pos,crm}.js`) + `src/session/session.js` storage facade; migrate 14 raw-`fetch` files, 20 direct `process.env` reads, 56 direct storage calls |
| **Classification** | CR — Refactor (GAP-014 + GAP-011 partial) |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Agent proposal under owner item 4 (multi-brand readiness) |
| **Severity** | P1 |
| **Risk** | CRITICAL (touches `api/interceptors` HIGH, `AuthContext.jsx` CRITICAL, `CartContext.js` HIGH per Part C) |
| **Status** | INTAKE ✅ — blocked on NEW-2 (standard) + NEW-3 (BFF direction) |
| **Parent** | CR-2026-09-12-001 (Wave 3) |

---

## 1. Problem

Three backends wired from 20+ files; axios and fetch mixed; timeouts inconsistent (CR-004 added some); storage keys read/written in 56 places. Multi-brand adds a fourth call surface and a tenant dimension to every key — impossible to do safely without a single choke-point.

## 2. Scope

**IN:** one axios instance per backend (base URL read once, timeout, auth interceptor, normalised error); `session.js` with typed getters/setters for every key in addendum §8 — **key names unchanged** (rule 1); migrate call-sites; Jest tests for clients + session.
**OUT:** renaming storage keys; provider reorder; changing which backend serves what (NEW-3 / CR-011); unified token manager redesign (GAP-011 full — separate CR later).

## 3. Duplicate Check

| Item | Relationship |
|---|---|
| GAP-014, GAP-011 | Partial execution |
| CR-2026-07-03-004 fetch timeouts | Its AbortController plumbing folds into the clients |
| CR-2026-07-03-011 full POS proxy | If NEW-3 = BFF, `pos.js` client later points at own API — facade makes that a one-line change |

**Verdict: DISTINCT.**

## 4. Blast Radius

LARGE (every network call, every storage access). Mitigation: mechanical migration per file, Jest cover, Playwright regression on 5 critical flows (addendum §5.1–5.6).

---

```text
Intake complete: CR-2026-09-12-007
Classification: CR (Refactor)
Severity: P1
Risk: CRITICAL
Duplicate check: DISTINCT
Evidence: captured (umbrella §5)
Blast radius: LARGE
Docs updated: this file; README.md
Next: Planning (after NEW-2, NEW-3; after CR-005 CLOSED)
```

## Addendum 2026-09-15 — scope fold-ins from INV-2026-09-15-001 (owner OD-4 = yes, after plan approval)

| Gap | Change | Files | Note |
|---|---|---|---|
| **G8** | Remove dead per-restaurant `x-api-key` mechanism: `REACT_APP_CRM_API_KEY` JSON map, `getApiKeyForRestaurant`, `x-api-key` header in `crmFetch` (CRM ignores it on all `/scan/*`). Purge key from `.env.example` + rotation checklist. | `crmService.js:15-55,107-115`, `frontend/.env.example` | Security hygiene — secret shipped in bundle for nothing |
| **G6** | JWT helper reads claim **`restaurant_id`** (`pos_0001_restaurant_{rid}`), not `user_id` — two copies: `crmService.js:38-49`, `AuthContext.jsx:13-24`. Belongs in the session facade. | as listed | AuthContext = CRITICAL hotspot → full gate, regression on login/scope-switch/legacy-token migration |

Owner approval to **implement** still required at Planning gate (OD-4 "yes after approval").
