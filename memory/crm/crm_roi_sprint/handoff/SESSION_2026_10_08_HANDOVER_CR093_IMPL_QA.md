# Session handover — 2026-10-08 (night) — CR-093 implemented + QA PASS; 098 + 093 await consumer validation
**Roles this session**: Planning (093 plan walk-through, approval) → Implementation (093) → QA via testing agent (18/18).

## State
| CR | Status | Closure needs |
|---|---|---|
| 084 / 097 | 🔒 CLOSED | release batch |
| 090 | ⚫ CLOSED-OBSOLETE | — |
| **098** | 🟢 QA PASS 13/13 | Scan & Order validation (`handoff/CRM_TO_SCAN_ORDER_CR098_SHIPPED_PLEASE_VALIDATE_2026_10_08.md`) + owner smoke |
| **093** | 🟢 QA PASS 18/18 | Scan & Order validation (`handoff/CRM_TO_SCAN_ORDER_CR093_LOOKUP_LIVE_PLEASE_VALIDATE_2026_10_08.md`) + owner smoke |
| 089 | 📋 | Q1 pending; limiter `_lookup_rate_limited` in `scan.py` is reusable |
| 085 | 📋 | next big item; Q1–Q3 pending; fixes the 5 CRM-side phone gaps + the L7 foreign-diner gap |
| 094 / 096 / 086 / 087 / 095 / 088 | 📋 | per `planning/PLANNING_GATE_SEQUENCE_2026_10_08.md` §E |

## Owner rules (carry forward)
1. Live read-only probe is part of Planning.
2. Amend `handoff/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md` at every implementation exit gate.
3. Plain-English plan + risks → exact `OWNER APPROVAL REQUIRED` block → wait.
4. **Consumer-team (Scan & Order) validation with evidence is required before Closure of any `/scan/*` CR** (new rule 2026-10-08).
5. Owner overrode D-1 sequencing for 093 ("go now") — 098 and 093 both open for closure in parallel.
6. POS phone shape is correct; duplicates/junk are CRM-side (CR-085).

## Gotchas
- Lookup limiter keys on `X-Forwarded-For` first value; tests must vary it. Earlier runs used 10.9.x.x and QA's own range — pick fresh IPs.
- `scan_lookup_attempts` TTL deletes rows at window end; harmless growth within window.
- Test files read `CRM_TEST_OWNER_PASSWORD` from env.
