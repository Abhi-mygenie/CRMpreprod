# Wave A — Grouping, sequence and file-conflict map
**Date**: 2026-10-10 · **Role**: Planning Agent · Companion to the four Impact Analyses: `CR_111_IMPACT_ANALYSIS.md` · `CR_113_CR_114_IMPACT_ANALYSIS.md` · `CR_115_IMPACT_ANALYSIS.md` · `CR_110_AMEND_BUG_035_IMPACT_ANALYSIS.md`. Owner approved 4-group composition (Q10, 2026-10-10).

## 1. Groups

| Group | Items | Risk | Code reality | Est. |
|---|---|---|---|---|
| **G1 Importer** | CR-111 + BUG-036 | LOW | PARTIAL | ½ session |
| **G2 Observability** | CR-113 + CR-114 (script) + BUG-028 + BUG-038 + BUG-039 | LOW (113 d: LOW→MEDIUM) | NONE | 1–1½ sessions |
| **G3 Sync resilience** | CR-115 + BUG-037, slices **115-A** (401 flag/banner, resume, guard=no-op) and **115-B** (re-link) | MEDIUM | (a) NONE · (b) PARTIAL · (c) FULL · (d) NONE | 1–1½ sessions |
| **G4 Token script** | CR-110 amend + BUG-035 + BUG-040 | LOW edit / MEDIUM–CRITICAL run | FULL, wrong selector | ½ session |

## 2. Shared-file matrix (who touches what)

| File | G1 | G2 | G3 | G4 | Conflict? |
|---|---|---|---|---|---|
| `routers/customers.py` | importer `:100-150`, `:1586-1703` | sync loop `:364-379`, `:457-473`, log payloads `:575-609`; `list_customers` `:1087+` | sync 401 `:308-320`; loop head `:287`; post-insert `:528-530`; **post-loop re-link** after `:584`; endpoint `:734-770` | — | **G2 ↔ G3 same loop** → G2 first; G1 independent |
| `routers/migration.py` | — | loop `:209-230`, log payloads `:523-550`, status `:570-645` | 401 `:154-166`; loop head `:139`; endpoint `:799-842` | — | **G2 ↔ G3** adjacent hunks → G2 first |
| `routers/pos.py` | — | W2 guest branch `:1800-1819` + realtime order doc +1 key (~`:1740`) | — | — | none |
| `routers/auth.py` | — | — | `$set` `:367-371` +2 keys; `get_me` +1 | — | none |
| `models/schemas.py` | — | `Customer` +2 optional | `UserResponse` +1 optional | — | different classes; none |
| `server.py` | — | 2 index creations | — | — | none |
| `CustomersPage.jsx` | — | chip, badge, BUG-028 | — | — | none |
| `MigrationPage.jsx` | — | breakdown +3 counters | resume buttons | — | different blocks; G2 first |
| `DashboardPage.jsx` | — | — | banner | — | none |
| `scripts/push_and_refresh_tokens.py` | — | — | — | rewrite | none |
| new: `core/data_quality.py`, `scripts/data_quality_snapshot.py` | — | ✓ | — | — | none |
| tests | `test_cr111_*` | `test_cr113_*`, `test_cr114_*` | `test_cr115_*` | `test_cr110_selector` | none |

## 3. Sequence

```
G1 (CR-111)  ───────────────┐
                            ├─► Wave-A QA regression ─► owner smoke ─► Closure Wave A ─► prod deploy ─► 3 snapshot runs (baseline)
G2 (CR-113+114) ─► G3-A ─► G3-B ─┘
                     │
                     └─► G4 (CR-110 amend) — plan with G3, implement after G3-A, run on prod only with owner password + Q1 proof
```

- **G1 ∥ G2**: no shared hunks; can be implemented in parallel sessions (rebase before writing).
- **G2 → G3**: hard order. G3 writes `link_status:"linked_late"` (defined by G2) and increments counters that live in G2's log payloads.
- **G3-A → G3-B**: same CR, two implementation slices so QA can bisect sync-loop regressions. G3-B is the only data write to `orders` in Wave A.
- **G3-A → G4**: G4's primary selector is `mygenie_token_invalid`.
- **Prod `.env` (CR-113 e)**: independent of code; can be done by infra at deploy time (all 8 `POS_REQUEST_LOGGING_*` keys required, `SAMPLE_RATE=1.0`, `TTL_DAYS=7`, restart).

## 4. Cross-group decisions that must be consistent

| Topic | Decision owner | Groups affected |
|---|---|---|
| `link_status` vocabulary (`linked · linked_late · linked_backfill(reserved) · unlinked_no_customer · unlinked_invalid_phone · anonymous`) | G2 IA §2.1 | G2, G3, CR-087, CR-114, PROC-001 |
| G-6 orphan KPI = `customer_id:null ∧ guest_order≠true ∧ (pid ∨ cust_mobile)` | G2 IA §2.2 | G2 (114), PROC-001, CR-116 |
| `mygenie_token_invalid` / `_at` on `users`; cleared on login and on script refresh | G3 IA §2.1 | G3, G4 |
| No stats/points on late-linked orders | owner Q3 ruling | G3, CR-087 (recompute needs separate approval) |
| Ordering guard already exists (F1) — docs stale | G3 IA §1.3 | recurrence doc G-4, intake G-4 → correct at Implementation |

## 5. Owner questions across Wave A — **ALL RULED 2026-10-10** (ruling in bold where it differs from recommendation)

| # | Group | Question | Recommendation |
|---|---|---|---|
| 111-Q1 | G1 | honour `country_code` column? | no — `+91`-only this CR |
| 113-Q1 | G2 | `pos_guest_events` TTL | 90 d |
| 113-Q2 | G2 | register **BUG-038** and fold into CR-113(b)? | **registered 2026-10-10, folded** |
| 113-Q3 | G2 | badge also on CustomerDetailPage? | optional, +3 lines |
| 113-Q4 | G2 | prod snapshot → file (read-only user) | yes |
| 115-Q1 | G3 | keep existing 200/`success:false` guard (no 409)? | **owner: change to 409** |
| 115-Q2 | G3 | refuse sync start when flag set & no header token? | yes |
| 115-Q3 | G3 | resume for both syncs? | yes |
| 115-Q4 | G3 | phone fallback in re-link? | **pid only** (ruled); exclude placeholder ids (BUG-039) |
| 110-Q1 | G4 | verify `crm_token` is a valid sync Bearer on preprod before any prod run | **mandatory (ruled)** |
| new | G2 | CR-113(a) scope adds: BUG-039 placeholder-id classification · persist `pos_customer_id` on realtime order docs | **approved** |
| new | G2/G4 | BUG-039, BUG-040 registered; CR-118 registered for next batch | done |
| 110-Q2 | G4 | password via `getpass` prompt | yes |

## 6. Wave A exit (unchanged from intake, adjusted for Q2 ruling)
All four groups QA-green on preprod → owner smoke → Closure → prod deploy (code + `.env`) → **`data_quality_snapshot.py --all` run on 3 calendar days** (file output on prod) → `invalid_unflagged = 0` and `orphan_orders` delta understood → Wave B.
