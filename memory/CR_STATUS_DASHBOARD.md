# CR Status Dashboard — `crm_roi_sprint`

> **Live flat status board.** Update on every phase transition.
> One row per CR. No narrative. For narrative, read the linked discovery / planning / impl / QA doc.
> Last updated: **2026-05-29**

---

## 📌 Latest Session Snapshot

**Session date**: 2026-05-29 (CR-015 🟢 CLOSED + CR-017 🟢 CLOSED)
**Pod URL**: `https://c158ad1e-e16c-449c-b11f-8eaabb028c19.preview.emergentagent.com`
**Branch**: `29-may`
**POS + AuthKey webhook**: pointed at this preview pod (owner repointed mid-session)

### What happened this session (full chronology)

1. **Repo re-bootstrapped** from branch `29-may` (was `28-may`). Deps installed, services UP, health green.
2. **Doc audit** — verified CR-015a/b/c docs were updated in `29-may`. Found DECISIONS_LOG.md missing 4 entries → appended (CR-015c removal, CR-015b dead-code, sprint priority, real creds).
3. **T7 script updated + committed** — narrowed to `{{7}}` only (`points_earned` → `points_balance`). `{{4}}`/`{{5}}` already fixed via UI.
4. **T2 SKIPPED** — owner decided resolver handles int→str already.
5. **Live test UNPARKED** — owner repointed POS + AuthKey webhook to preview pod.
6. **Order 869329** — WhatsApp sent+read but `{{6}}` showed "Loyalty Points Used: 0" when 1106 were used. Root cause: `{{6}}` mapped to `points_earned` instead of `loyalty_points_used`.
7. **{{6}} fixed** — remapped to `loyalty_points_used`. DB write verified.
8. **Full template-vs-mapping audit** — 4 R689 templates, 18 slots, 0 remaining mismatches.
9. **Clean live test PASSED** — orders 869331 (009577) and 869333 (009579) both sent + read, all 7 slots correct.
10. **CR-015 CLOSED** — `cr015_closed_live_test_passed`.
11. **CR-017 registered + implemented + closed** — hot production fix. Added `projected_points_earned`, `projected_earn_percent`, `earn_ratio_display` to `/pos/max-redeemable`. Curl-verified. POS handoff doc updated.

### 🎯 Next-agent handoff message

```
You are picking up the MyGenie CRM ROI sprint.

READ FIRST: README.md → CR_STATUS_DASHBOARD.md (this snapshot) → DECISIONS_LOG.md

CURRENT STATE (2026-05-29 session close):
- CR-015: 🟢 CLOSED (live test passed — 2 clean orders, 7/7 slots correct)
- CR-015a/b/c: 🟢 ALL DONE
- CR-017: 🟢 CLOSED (projected points earned added to /pos/max-redeemable)
- CR-014: ⏸ parked — NEXT to unpark (2 questions in §15.6 C1+C2)
- CR-016: ⏸ deferred to next sprint

POS + AuthKey webhook: pointed at this preview pod.
TEST LOGIN: owner@kunafamahal.com (see test_credentials.md)

DO NOT:
- Re-introduce demo login
- Add variable-mapping UI to WhatsApp Automation / Segments (Templates-page-only by design)
- Remap {{6}} back to points_earned (must stay loyalty_points_used)
- Run T2 normalization (owner skipped it)
```

### Sanity checks for the next agent

```bash
sudo supervisorctl status                          # backend + frontend RUNNING
curl -s http://localhost:8001/api/health           # {"status":"healthy",...}
grep REACT_APP_BACKEND_URL /app/frontend/.env      # confirm preview URL
```

### Active queue (this sprint)

| Order | CR | Status | Next action |
|---|---|---|---|
| 1 | **CR-014** | ⏸ Discovery parked | Ready to unpark — 2 questions (§15.6 C1+C2) |
| — | ~~CR-015~~ | 🟢 CLOSED | Live test passed |
| — | ~~CR-017~~ | 🟢 CLOSED | Implemented + verified |
| — | ~~CR-016~~ | ⏸ Deferred next sprint | — |

---

## Status legend

| Light | Meaning |
|---|---|
| 🟢 | **Closed** — live-test passed, CR done |
| 🟡 | **In flight** — agent actively working in current session |
| 🔵 | **Planning approved** — implementation can start any time |
| ⏸ | **Parked** — discovery (or later phase) complete but waiting on owner answer |
| 🔴 | **Blocked** — waiting on external dependency or another CR |
| 📋 | **Registered only** — placeholder, no discovery yet |
| ❌ | **Cancelled / dropped** |

---

## CR Board

| # | CR | Phase | Status | Effort | Blockers / Owner asks | Last touched |
|---|---|---|---|---|---|---|
| 002 | Loyalty engine | Closed | 🟢 | — | — | 2026-05 |
| 002B | Birthday/Anniversary | Closed | 🟢 | — | — | 2026-05 |
| 003 | Coupon analytics dashboard | Closed Phase 1 | 🟢 | — | Phase 2 backlog | 2026-05 |
| **004** | **WhatsApp Utility + Marketing** | **Closed (P3.5)** | **🟢** | — | Optional Commit 8 hardening (IP allowlist) available, not blocking | **2026-05-28** |
| 005 | (per register) | — | (see register) | — | — | — |
| 006 | (per register) | — | (see register) | — | — | — |
| 007 | (per register) | — | (see register) | — | — | — |
| 008 | (per register) | — | (see register) | — | — | — |
| 009 | (per register) | — | (see register) | — | — | — |
| 010 | (per register) | — | (see register) | — | — | — |
| 011 | Coupon Optimizer | Discovery | ⏸ | — | (see register) | — |
| 012 | WhatsApp Template Builder | Planning | 🔵 | — | (see register) | — |
| 013 | Template Gallery | Discovery | 🔴 blocked by CR-012 P1 | — | (see register) | — |
| **014** | **E-Invoice PDF + Mobile HTML Link** | **Discovery Phase 0 done** | **⏸** | ~8-10 days | **2 owner confirmations**: C1 address strategy, C2 required-vs-optional (see CR-014 §15.6) | **2026-05-28** |
| **015** | **WhatsApp Template Variable Mapping Fidelity** | **CLOSED — live test passed** | **🟢** | done | T1-T7 done. T2 skipped. {{6}} mismatch fixed. Full audit passed. Live test: orders 869331+869333, 7/7 slots correct, status=read. | **2026-05-29** |
| **017** | **/pos/max-redeemable Projected Points Earned** | **CLOSED — implemented + verified** | **🟢** | done | Hot fix. 3 additive fields: `projected_points_earned`, `projected_earn_percent`, `earn_ratio_display`. Curl-verified. POS handoff updated. | **2026-05-29** |
| **015a** | **Preview Sample Data Gap for T5 Variables** | **Implemented & verified** | **🟢** | done | Preview "NA" fixed: 14 T5 sample values in `customers.py` sample-data + frontend registry-`example` fallback. Closeout: `implementation/CR_015A_PREVIEW_SAMPLE_DATA_CLOSEOUT.md`. | **2026-05-29** |
| **015b** | **Dead Variable-Mapping Code Removal** | **Implemented & verified** | **🟢** | done | Removed orphaned/unreachable mapping modal cluster on WhatsApp Automation page + unused `availableFields`/`getPreviewMessage` on Segments. Mapping is **Templates-page-only**. Closeout: `implementation/CR_015B_DEAD_VARIABLE_MAPPING_CODE_CLOSEOUT.md`. | **2026-05-29** |
| **015c** | **Remove Demo Login** | **Implemented & verified** | **🟢** | done | Demo login fully removed (was 404). Backend endpoint/constants/`is_demo` + frontend button/banner/context. Tests → real login (11 pass). Closeout: `implementation/CR_015C_REMOVE_DEMO_LOGIN_CLOSEOUT.md`. | **2026-05-29** |
| **016** | **Dynamic Event Registry + Trigger Configuration UI** | **Discovery Phase 0 done — DEFERRED to next sprint** | **⏸ next-sprint** | ~9-10 days | **Deferred 2026-05-29 by owner**: existing event mapping/firing fidelity (CR-015) takes priority. §7 Q1–Q8 still open. | **2026-05-29** |

> When a row's first column shows a number ≤ 010 with no detail above, look up the full row in `crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md`.

---

## Active queue (in priority order — recommended sequence)

Owner can re-order; this is a recommendation. **CR-016 deferred to next sprint as of 2026-05-29.**

| Order | CR | Why first |
|---|---|---|
| 1 | **CR-014** | E-invoice mobile link — ready to unpark. 2 questions in §15.6 (C1+C2). |
| — | ~~CR-015~~ | **🟢 CLOSED** — live test passed (2026-05-29). |
| — | ~~CR-016~~ | **Deferred to next sprint** (2026-05-29). |

---

## Out-of-sprint backlog (not yet registered)

| Idea | Source | Notes |
|---|---|---|
| Force re-send admin action for stuck-Pending rows | Suggested in CR-004 P3.5 finish summary | Owner declined backfill but per-row manual nudges may be useful |
| OR / nested condition logic | CR-016 out-of-scope | Would become CR-016b |
| Custom webhook signals (tenant-defined) | CR-016 out-of-scope | Would become CR-016c |
| Per-customer event mute / unsubscribe | CR-016 out-of-scope | Privacy / DPDP compliance CR |
| Event analytics dashboard | CR-016 out-of-scope | Read-side analytics CR |
| Multi-channel events (SMS, email, push) | CR-016 out-of-scope | Separate channel CR per provider |
| Credit notes (mutability of invoices) | CR-014 out-of-scope | GST compliance for amendments |
| Email invoice channel | CR-014 out-of-scope | When email channel exists |

---

## Recent transitions (newest first)

| Date | CR | From → To |
|---|---|---|
| 2026-05-29 | **CR-017** | — → ⏸ → **🟢 CLOSED**. Registered, discovered, approved, implemented, verified in single session. 3 fields added to `/pos/max-redeemable`. POS handoff updated. |
| 2026-05-29 | **CR-015** | 🟡 code complete + data clean → **🟢 CLOSED — live test passed**. Orders 869331 (009577, Rs.409, abhi123, points_balance=70) and 869333 (009579, Rs.2571, abhishek jain, points_balance=128) — both WhatsApp sent + read, all 7 slots correct. |
| 2026-05-29 | CR-015 | 🟡 Code complete, live test parked → 🟡 **CODE COMPLETE + DATA CLEAN**. POS repointed to preview. Order 869329 received (WhatsApp sent+read). {{6}} semantic mismatch found (`points_earned` mapped where template says "Loyalty Points Used") → fixed to `loyalty_points_used`. Full audit across all 4 R689 templates (18 slots): **0 remaining mismatches**. Awaiting 1 clean order for formal closure. |
| 2026-05-29 | CR-015 | 🟡 Day 3 done, T7 pending → 🟡 **CODE COMPLETE, live test parked**. T7 committed ({{7}} `points_earned`→`points_balance`; {{4}}/{{5}} were already fixed via UI). T2 skipped (owner: resolver handles int→str). Live test parked (POS at prod, order 009573 didn't land on preview). |
| 2026-05-29 | CR-015a | ⏸ frozen spec → 🟢 **IMPLEMENTED** (backend: 14 T5 sample values in `customers.py` sample-data — curl-verified 37 keys; frontend: registry-example fallback in `WhatsAppAutomationContent.jsx` + `TemplatesPage.jsx`; preview shows values, no "NA"). Doc: `planning/CR_015A_PREVIEW_SAMPLE_DATA_FROZEN_SPEC.md` |
| 2026-05-29 | CR-015c | — → 🟢 **Demo login FULLY REMOVED** (owner-approved). Backend `/demo-login` endpoint + constants + `is_demo` schema field; frontend Demo Login button + AuthContext demo code + DemoModeBanner (deleted) + CustomersPage `isDemoMode`. Tests switched to real login (11 passed). demo-login now 404. Doc: `discovery/CR_015C_REMOVE_DEMO_LOGIN_DISCOVERY.md` |
| 2026-05-29 | CR-015b | — → 🟢 **Dead variable-mapping code REMOVED** (owner-approved B2 + Segments leftovers; orphaned mapping modal cluster on WhatsApp Automation page + unused `availableFields`/`getPreviewMessage` on Segments deleted; lint/compile clean, zero residual refs). Doc: `discovery/CR_015B_DEAD_VARIABLE_MAPPING_CODE_DISCOVERY.md` |
| 2026-05-29 | CR-015a | — → ⏸ **Frozen spec written** (`planning/CR_015A_PREVIEW_SAMPLE_DATA_FROZEN_SPEC.md`, Option A + partial B); awaiting impl after CR-015b |
| 2026-05-29 | CR-015 | 🟡 Day 3 frozen → 🟡 **Day 3 DONE — T4+T6 landed, T7 dry-run complete, awaiting owner commit** (119/119 tests, 5/5 smoke probes, frontend compiles) |
| 2026-05-29 | CR-015 | 🟡 Day 2 done → 🟡 **Day 3 spec FROZEN** (T6+T7+T4 freeze doc at `planning/CR_015_DAY_3_FROZEN_SPEC.md`, 17 acceptance checks) |
| 2026-05-29 | CR-015 | 🟡 Day 2 frozen → 🟡 **Day 2 DONE — T3 landed** (`build_order_event_context` + 3 pos.py callsites refactored, 119/119 tests, lint clean) |
| 2026-05-29 | CR-015 | 🟡 Day 1 done → 🟡 **Day 2 spec FROZEN, T3 ready for implementation** (freeze doc at `planning/CR_015_DAY_2_FROZEN_SPEC.md`) |
| 2026-05-29 | CR-015 | 🟡 Phase 1 plan approved → 🟡 **Day 1 DONE** (T1 resolver hardening + T5 registry expansion landed, 109/109 tests, live smoke confirmed Bug #1 resolved) |
| 2026-05-29 | CR-015 | ⏸ discovery parked → 🟡 **Phase 1 plan drafted, awaiting sign-off** (Q1–Q8 all answered `a`) |
| 2026-05-29 | CR-016 | ⏸ discovery parked → ⏸ **deferred to next sprint** (owner: "we have almost definate event we used need to ensure they map and fire correctly") |
| 2026-05-29 | sprint queue | reaffirmed: CR-015 (P1) → CR-014 (P2); CR-016 out of this sprint |
| 2026-05-29 | pod URL | rotated to `a28cb9e3-…` (AuthKey webhook updated by owner) |
| 2026-05-28 evening | CR-016 | created → ⏸ discovery parked (cooldown removed per owner) |
| 2026-05-28 evening | CR-015 | created → ⏸ discovery parked |
| 2026-05-28 evening | CR-014 | discovery parked → discovery parked + Profile fields appendix added |
| 2026-05-28 evening | **CR-004 P3.5** | parked → **🟢 closed (Option A live test passed; 17/17 ACs)** |
| 2026-05-28 afternoon | CR-004 P3.5 | implementation complete → ⏸ parked awaiting Option A live test |
| 2026-05-28 afternoon | CR-004 P3.5 | receive-side hotfix applied (form-urlencoded parser) |
| 2026-05-28 morning | CR-014 | created → ⏸ discovery parked |
| 2026-05-26 | CRM 1.0 baseline | closed |

---

## How to update this dashboard

1. After any CR phase transition, edit the row's `Phase` + `Status` + `Last touched` cells.
2. Append a row to "Recent transitions" with date + CR + from→to.
3. If a brand-new CR is registered, add a new row above the relevant section and reference its discovery doc.
4. If a CR is closed, change light to 🟢 and clear "Blockers / Owner asks" column.

---

**End of dashboard.**
er any CR phase transition, edit the row's `Phase` + `Status` + `Last touched` cells.
2. Append a row to "Recent transitions" with date + CR + from→to.
3. If a brand-new CR is registered, add a new row above the relevant section and reference its discovery doc.
4. If a CR is closed, change light to 🟢 and clear "Blockers / Owner asks" column.

---

**End of dashboard.**
