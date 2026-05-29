# CR Status Dashboard — `crm_roi_sprint`

> **Live flat status board.** Update on every phase transition.
> One row per CR. No narrative. For narrative, read the linked discovery / planning / impl / QA doc.
> Last updated: **2026-05-29**

---

## 📌 Latest Session Snapshot

**Session date**: 2026-05-29 (session closed)
**Pod URL**: `https://130d0c66-4570-4905-b61d-f2c58758616d.preview.emergentagent.com` (pod rotated; AuthKey webhook needs updating by owner)

### What happened this session (full chronology)

1. **Project re-bootstrap** into new pod (`130d0c66-…`) — repo re-cloned from branch `28-may`, deps installed, services UP, `/api/health` 200, remote MongoDB connected.
2. **Doc restoration** — CR_STATUS_DASHBOARD.md snapshot was stale (described start-of-previous-session, not Day 1 work/probe/freeze). PRD.md was accidentally overwritten to 39 lines; restored to 487-line original from git. Both updated to reflect current state.
3. **CR-016 DEFERRED to next sprint** — owner decision. §7 Q1–Q8 remain open.
4. **CR-015 Day 2 IMPLEMENTED** — T3 (`build_order_event_context` + 3 pos.py callsite refactors). 10 new tests, 119/119 total pass.
5. **CR-015 Day 3 investigation** — full code audit of T6/T7/T4 against plan v1.1. No scope deviations found.
6. **CR-015 Day 3 frozen spec** written — `planning/CR_015_DAY_3_FROZEN_SPEC.md`, 17 acceptance checks.
7. **CR-015 Day 3 IMPLEMENTED** — T4 (4 callsite enrichments) + T6 (server 422 validation + frontend error surfacing) + T7 scripts (dry-run complete). 119/119 tests, 5/5 curl smoke probes, frontend compiles. **T7 commit awaiting owner approval.**
8. **CR-015a discovered** — owner reported preview shows "NA" for new T5 variables. Root cause: `GET /api/customers/sample-data` missing 14 T5 keys. Discovery doc written. Fix scoped (~22 LoC).

### 🎯 Next-agent handoff message

```
You are picking up the MyGenie CRM ROI sprint. CR-015 is Day 3 done.

READ FIRST in this order:
1. /app/memory/README.md
2. /app/memory/CR_STATUS_DASHBOARD.md (this snapshot)
3. /app/memory/DECISIONS_LOG.md

CURRENT STATE (2026-05-29 session close):
- CR-004 P3.5: CLOSED (live test passed 2026-05-28)
- CR-016: DEFERRED to next sprint
- CR-014: PARKED in Phase 0 (2 questions in §15.6)
- CR-015: Day 3 DONE. Status:
    ✅ Day 1: T1 (resolver) + T5 (14 new variables + 2 formatters)
    ✅ Day 2: T3 (build_order_event_context + 3 pos.py callsites)
    ✅ Day 3: T4 (4 minor enrichments) + T6 (server 422 + frontend errors) + T7 (dry-run done)
    ⏸ T7 COMMIT: awaiting owner approval (say "commit" to apply R689 cleanup)
    ⏳ Day 4: T2 (DB normalization) + live integration test → CR-015 closure
- CR-015a (sub-CR): Preview shows "NA" for T5 variables — sample-data endpoint
    missing 14 keys. Discovery complete, fix is ~22 LoC.
    Doc: discovery/CR_015A_PREVIEW_SAMPLE_DATA_GAP_DISCOVERY.md

TWO OWNER ACTIONS NEEDED:
1. T7 commit: review dry-run output, say "commit" to fix R689 template 25140
2. CR-015a: approve fix approach (recommend Option A+B per discovery doc §5)

AFTER OWNER ACTIONS:
- Implement CR-015a (~15 min)
- Run T7 --commit
- Day 4: T2 + live integration test → close CR-015
- Then: unpark CR-014

DO NOT:
- Call testing_agent_v3
- Push to crm.mygenie.online
- Write to remote MongoDB without explicit per-change approval
- Start CR-016
```

### Sanity checks for the next agent

```bash
sudo supervisorctl status                          # backend + frontend RUNNING
curl -s http://localhost:8001/api/health           # {"status":"healthy",...}
grep REACT_APP_BACKEND_URL /app/frontend/.env      # confirm preview URL
cd /app/backend && python -m pytest tests/test_cr015_resolver.py tests/test_cr015_event_context.py tests/test_whatsapp_*.py -q  # 119 passed
```

### Active queue (this sprint)

| Order | CR | Status | Next action |
|---|---|---|---|
| 1 | **CR-015** | 🟡 Day 3 done, T7 commit pending | Owner says "commit" → T7 applied → Day 4 (T2 + live test) |
| 1a | **CR-015a** | ⏸ Discovery done | Owner approves → implement (~15 min) |
| 2 | CR-014 | ⏸ Discovery parked | Unpark after CR-015 closes |
| — | ~~CR-016~~ | ⏸ Deferred next sprint | — |

### 🎯 Next-agent handoff message

```
You are picking up the MyGenie CRM ROI sprint mid-flight.
CR-015 (Variable Mapping Fidelity) is IN FLIGHT — Day 1 done, Day 2 frozen.

READ FIRST in this order:
1. /app/memory/README.md
2. /app/memory/CR_STATUS_DASHBOARD.md (this snapshot)
3. /app/memory/DECISIONS_LOG.md (especially 2026-05-29 entries)
4. /app/memory/crm/crm_roi_sprint/planning/CR_015_DAY_2_FROZEN_SPEC.md  ← YOUR NEXT WORK

CURRENT STATE (2026-05-29 end of session):
- CR-004 P3.5 is CLOSED (full live test passed 2026-05-28)
- CR-016 is DEFERRED to NEXT sprint — do not touch
- CR-014 is PARKED in Phase 0 — 2 questions in §15.6 of its discovery doc (UNPARK AFTER CR-015)
- CR-015 is IN FLIGHT:
    ✅ Day 1: T1 (resolver hardening) + T5 (registry expansion) DONE — 109/109 tests
    ✅ Day 2: Spec FROZEN — ready for implementation
    ⏳ Day 2 impl: T3 (build_order_event_context + 3 pos.py callsites) — PICK UP HERE
    ⏳ Day 3: T6 (admin UI 422 validation) + T7 (R689 cleanup) + T4 (minor enrichments)
    ⏳ Day 4: T2 (DB normalization) + live integration test

WHAT TO DO:
1. Open /app/memory/crm/crm_roi_sprint/planning/CR_015_DAY_2_FROZEN_SPEC.md
2. Read §4 (frozen code spec) and §9 (handoff instructions)
3. Implement T3 mechanically per the spec — DO NOT improvise
4. If spec contradicts code, STOP and surface to owner
5. After T3: run all tests (expect 54+65=119), update closeout doc, update dashboard

DO NOT:
- Call testing_agent_v3
- Push to crm.mygenie.online
- Write to remote MongoDB from ad-hoc scripts without explicit per-change approval
- Open CR-016 unless owner explicitly says "Resume CR-016"
- Skip the freeze doc and re-derive T3 from the plan — the freeze doc IS the spec

Sanity-check first thing:
  sudo supervisorctl status
  curl -s http://localhost:8001/api/health
  Confirm pod URL matches /app/frontend/.env::REACT_APP_BACKEND_URL
  If pod URL changed since this snapshot, follow RUNBOOK §11.
```

### Sanity checks for the next agent (run before any work)

```bash
sudo supervisorctl status                          # backend + frontend RUNNING
curl -s http://localhost:8001/api/health           # {"status":"healthy",...}
grep REACT_APP_BACKEND_URL /app/frontend/.env      # confirm preview URL still valid
cd /app/backend && python -m pytest tests/test_cr015_resolver.py tests/test_whatsapp_*.py -q  # 109 passed
```

If any of those fail → see `RUNBOOK.md` §1, §2, §11.

### Active queue (this sprint, after 2026-05-29 deferral + Day 1 work)

| Order | CR | Status | Why |
|---|---|---|---|
| 1 | **CR-015** | **🟡 Day 2 frozen, T3 ready for impl** | Foundation — ensure the 27 existing hardcoded events fire + render variables correctly. T1+T5 done; T3 next. |
| 2 | CR-014 | ⏸ Discovery parked | E-invoice mobile link — depends on variable layer (CR-015). Unpark after CR-015. |
| — | ~~CR-016~~ | ⏸ Deferred to next sprint | Dynamic event registry — owner decided to stabilize existing events first. |

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
| **015** | **WhatsApp Template Variable Mapping Fidelity** | **Day 3 done (T1-T6 landed, T7 dry-run done); T7 commit + Day 4 remaining** | **🟡** | ~1 day remaining (T7 commit + T2 + live test) | T7 dry-run output ready for owner review. After commit: Day 4 = T2 (DB norm) + live test. | **2026-05-29** |
| **015a** | **Preview Sample Data Gap for T5 Variables** | **Discovery complete** | **⏸** | ~15 min | Sub-CR of 015. Preview shows "NA" for 14 T5 variables — `sample-data` endpoint missing keys. Discovery at `discovery/CR_015A_PREVIEW_SAMPLE_DATA_GAP_DISCOVERY.md`. Awaiting owner approval of fix approach. | **2026-05-29** |
| **016** | **Dynamic Event Registry + Trigger Configuration UI** | **Discovery Phase 0 done — DEFERRED to next sprint** | **⏸ next-sprint** | ~9-10 days | **Deferred 2026-05-29 by owner**: existing event mapping/firing fidelity (CR-015) takes priority. §7 Q1–Q8 still open. | **2026-05-29** |

> When a row's first column shows a number ≤ 010 with no detail above, look up the full row in `crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md`.

---

## Active queue (in priority order — recommended sequence)

Owner can re-order; this is a recommendation. **CR-016 deferred to next sprint as of 2026-05-29.**

| Order | CR | Why first |
|---|---|---|
| 1 | **CR-015** | Foundation — without clean variable mapping, the existing 27 events render incorrectly. Sprint priority per owner direction 2026-05-29. |
| 2 | **CR-014** | E-invoice mobile link — depends on (a) variables (CR-015) and (b) `send_bill` reliability (CR-004 P3.5 done ✅). Could ship in parallel once CR-015 mid-flight. |
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
| 2026-05-29 | CR-015a | — → ⏸ **Registered + discovery complete** (sub-CR: preview sample-data missing 14 T5 keys) |
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
