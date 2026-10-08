# CR-100 — Impact Analysis: tolerate legacy customers with missing `country_code` in identity match (forward-fix)
**Date**: 2026-10-09 · **Role**: Planning Agent · **Origin**: BUG-025/026 planning Q4 — owner chose **alternative** (forward-fix now, not wait for 085-B) · **Status**: 🟡 PLANNING — Impact Analysis only; **Implementation Plan not opened** (owner: "stay in planning") · **No code changed.**

## 1. Problem
`phone_match(user_id, phone, cc)` (`core/phone.py`) matches `{user_id, phone, country_code: cc}` exactly. 53 legacy customer docs have `country_code: null` (never written by the old importer/webhook — CR-085 IA gap G2). For those diners every skip-otp / POS / CRM match misses → a **new duplicate** is silently created with zero history.

## 2. Live evidence (read-only probe 2026-10-09)
| Fact | Value |
|---|---|
| Docs with `country_code: null` | **53** — r635: 49 · r689: 4 |
| All phones valid-looking (10 digits, 6-9 start) | 53/53 |
| Active in last 90 days (`last_visit`) | **0** |
| With points > 0 / visits > 0 | 0 / 0 |
| Already have a `+91` twin (duplicate already created by a later match miss) | **13** |
| `phone_match()` call sites (routers + core) | 12 (+ 1 inline equivalent in `scan.py:295` lookup) |
Urgency is **low** (dormant records), but each future login/bill for one of these 53 creates another duplicate → forward-fix stops the bleed; 085-B then merges the 13 twins and back-fills `country_code` on the rest.

## 3. Options
| Option | Change | Pros | Cons |
|---|---|---|---|
| **A (recommended)** | `phone_match()` returns `country_code: {"$in": [cc, None]}` **only when `cc == "+91"`** (default market). Foreign cc stays exact. Switch `scan.py:295` lookup to the helper. | one line, every channel fixed at once (single source of truth), no data write, honours "no data ops until 085-B" | for the 13 twin cases `find_one` may return either doc (both 0-history → harmless until 085-B merge); `$in` with `None` matches missing *and* null — intended |
| B | Same as A **plus** self-heal: when the matched doc has null cc, `$set country_code:"+91"` | duplicates stop and data converges | it is a data write → violates owner rule "all data ops after batch"; rejected unless owner lifts |
| C | Do nothing until 085-B | zero code | duplicates keep forming for 53 diners |

## 4. Blast radius / risk
- Files: `core/phone.py` (helper, 1–2 lines), `routers/scan.py:295` (use helper), tests. **No** change to pos.py/customers.py bodies — they already call the helper.
- Identity rule change → addendum §14 "customer identity/merge rules" → **owner approval required**, full identity regression (085a suite + POS create/lookup/orders + sync F11 dry-run).
- Index `{user_id, phone, country_code}` still used (`$in` on the trailing key → IXSCAN; verify with explain).
- Risk: **MEDIUM** (critical area, tiny change, dormant data). Blast radius: SMALL (53 docs, 2 tenants).

## 5. Owner questions (for the Implementation Plan gate)
| Q | Question | Recommendation |
|---|---|---|
| Q1 | Option A (read-tolerance only) vs B (tolerance + self-heal write) | **A** (B conflicts with the no-data-ops rule) |
| Q2 | For the 13 twin cases, prefer the `+91` doc when both exist? (needs `sort=[("country_code",-1)]` at the 12 call sites, or accept either) | **accept either** now (both 0-history); 085-B merges |
| Q3 | Apply tolerance only for `+91`, or for any cc when stored cc is null? | **+91 only** (all 53 are Indian numbers; foreign cc must stay exact) |

## 6. Verification matrix (draft for Impl Plan)
| V | Case | Expected |
|---|---|---|
| V1 | skip-otp `9876543210` r689 (legacy null-cc doc) | matches existing doc; **no** new customer; token issued |
| V2 | POS `customer-lookup` same phone | `registered:true` |
| V3 | POS `/pos/orders` same phone | links to existing doc, no duplicate |
| V4 | CRM Add Customer same phone | duplicate rejected |
| V5 | lookup `/scan/auth/lookup` same phone | `exists:true` |
| V6 | foreign cc `+61` phone vs null-cc doc | **no** match (exact) |
| V7 | `explain()` on the tolerant query | IXSCAN on `{user_id, phone, country_code}` |
| V8 | full identity regression: `test_cr085a_normalization.py`, `test_cr093_lookup.py`, `test_cr089_skip_otp.py`, POS create/update/lookup | PASS; baseline 7700 |

## 7. Relationship to other items
- **BUG-027** (test leak) root cause = this gap; tests switch to a cc-bearing phone regardless (BUG-025/026 plan E3/E4).
- **CR-085-B** report must list the 53 null-cc docs and the 13 twins (merge candidates).
- **Owner rule (2026-10-09)**: after all data changes (085-B / 087), a complete validation test runs on the **production DB**.

```
Planning complete: CR-100
Stage: Impact Analysis (Implementation Plan NOT opened — owner hold)
Code reality: NONE (exact-match helper live)
Risk: MEDIUM (§14 identity rule; tiny change; dormant data)
Files WILL change (when planned): core/phone.py · routers/scan.py:295 · tests
Files WILL NOT touch: routers/pos.py · routers/customers.py bodies · stored data
Owner decisions: Q1 A/B · Q2 twin preference · Q3 +91-only
Docs: planning/CR_100_IMPACT_ANALYSIS.md
Next: owner opens Implementation Plan gate for CR-100 (after BUG-025/026 implementation)
```
