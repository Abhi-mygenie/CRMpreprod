# CR Status Dashboard — `crm_roi_sprint`

> **Live flat status board.** Update on every phase transition.
> One row per CR. No narrative. For narrative, read the linked discovery / planning / impl / QA doc.
> Last updated: **2026-05-28 evening**

---

## 📌 Latest Session Snapshot

**Session date**: 2026-05-28 (full-day session)
**Pod URL during session**: `https://5f05cc67-3064-4ad7-867f-57dadd86ee50.preview.emergentagent.com`

### What happened this session
1. **Project bootstrap** — wiped `/app`, cloned `Abhi-mygenie/CRMpreprod` branch `28-may`, configured remote MongoDB, installed all deps, services running ✅
2. **CR-004 P3.5 CLOSED** ✅
   - Discovered AuthKey delivery callbacks arrive as `application/x-www-form-urlencoded`, not JSON
   - Hotfixed `routers/whatsapp.py::message_status_callback` with a content-type-aware parser (~+30 LoC)
   - Ran Option A live test: fired synthetic POS order `E2E1779979662` (Rs.555, abhi @ 7505242126) at preview's `/api/pos/orders` → full `pending → delivered → read` lifecycle verified in 71 seconds
   - **17/17 acceptance criteria PASS**
   - Closure report at `crm/crm_roi_sprint/qa/CR_004_PHASE_3_5_LIVE_TEST_REPORT.md`
3. **3 new CRs registered + parked in Phase 0 discovery**:
   - **CR-014 E-Invoice PDF + Mobile HTML Link** — 3-mode renderer, public token URL, mobile HTML + PDF, fields gap matrix, Profile-page extension plan
   - **CR-015 WhatsApp Template Variable Mapping Fidelity** — system-wide fix: resolver type-mismatch, event-data forwarding leak (only 10 of 40 POS fields forwarded today), registry expansion, admin UI hardening
   - **CR-016 Dynamic Event Registry + Trigger Configuration UI** — move 27 hardcoded events from `schemas.py` to a tenant-editable `events` collection; 16 predefined source signals; reuses existing WhatsApp Automation page + new 4-tab modal; **NO cooldown** (frequency from signal cadence + conditions)
4. **Investigated WhatsApp variable rendering bug** (template showed "Test" 7 times) — 3 stacked bugs identified, fully documented in CR-015. NO code edits, investigation only.
5. **Control-plane docs created**: `README.md` (entry point), `CR_STATUS_DASHBOARD.md` (this file), `DECISIONS_LOG.md`, `RUNBOOK.md`, `AGENT_PLAYBOOK.md` — first-class governance layer
6. **PRD.md updated** to reflect closure + 3 new CRs

### 🎯 Next-agent handoff message (copy-paste this verbatim to the next agent)

```
You are picking up the MyGenie CRM ROI sprint mid-flight.

READ FIRST in this order:
1. /app/memory/README.md
2. /app/memory/CR_STATUS_DASHBOARD.md (especially the "Latest Session Snapshot")
3. /app/memory/DECISIONS_LOG.md (every owner decision so far)

CURRENT STATE:
- CR-004 P3.5 is CLOSED (full live test passed 2026-05-28)
- 3 CRs are parked in Phase 0 discovery awaiting owner answers:
  - CR-014 E-Invoice — 2 questions in §15.6 of its discovery doc
  - CR-015 Variable Mapping Fidelity — 8 questions in §7 of its discovery doc
  - CR-016 Dynamic Event Registry — 8 questions in §7 of its discovery doc

WHAT TO DO:
Wait for the owner to tell you "Resume CR-XYZ" (where XYZ is 014, 015, or 016).
When they do:
  1. Read /app/memory/crm/crm_roi_sprint/discovery/CR_XYZ_*_DISCOVERY.md end-to-end
  2. Ask the owner the questions listed in §7 (or §15.6 for CR-014)
  3. After answers, write /app/memory/crm/crm_roi_sprint/planning/CR_XYZ_PHASE_1_PLAN.md
  4. Then implementation, then QA per the CR lifecycle in README §4

DO NOT:
- Call testing_agent_v3 (owner has opted out)
- Push to crm.mygenie.online (owner pushes manually)
- Write to remote MongoDB from ad-hoc scripts (read OK; writes need explicit per-change approval)

Sanity-check first thing (before answering owner):
  sudo supervisorctl status
  curl -s http://localhost:8001/api/health
  Confirm pod URL matches /app/frontend/.env::REACT_APP_BACKEND_URL

If pod URL has changed since the snapshot, follow RUNBOOK procedure #11 to rotate.
```

### Sanity checks for the next agent (run before any work)

```bash
sudo supervisorctl status                          # backend + frontend RUNNING
curl -s http://localhost:8001/api/health           # {"status":"healthy",...}
grep REACT_APP_BACKEND_URL /app/frontend/.env      # confirm preview URL still valid
```

If any of those fail → see `RUNBOOK.md` §1, §2, §11.

### Recommended unpark order (when owner is ready)

| Order | CR | Why |
|---|---|---|
| 1 | CR-015 | Foundation — without clean variable mapping, no template renders correctly. Unblocks CR-014 + CR-016 downstream. |
| 2 | CR-016 | Dynamic events build on top of clean variable layer. |
| 3 | CR-014 | E-invoice link uses the `einvoice_link` variable (already in registry); could ship in parallel with CR-016 once CR-015 is done. |

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
| **015** | **WhatsApp Template Variable Mapping Fidelity** | **Discovery Phase 0 done** | **⏸** | ~6-7 days | **8 owner answers** (see CR-015 §7); consequential: Q1 (template_id canonical type), Q3 (giant context vs projections), Q4 (admin UI block save) | **2026-05-28** |
| **016** | **Dynamic Event Registry + Trigger Configuration UI** | **Discovery Phase 0 done** | **⏸** | ~9-10 days | **8 owner answers** (see CR-016 §7); consequential: Q1 (built-in editability), Q4 (operator set), Q6 (daily-cron signals to custom events) | **2026-05-28** |

> When a row's first column shows a number ≤ 010 with no detail above, look up the full row in `crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md`.

---

## Active queue (in priority order — recommended sequence)

Owner can re-order; this is a recommendation.

| Order | CR | Why first |
|---|---|---|
| 1 | **CR-015** | Foundation — without clean variable mapping, no template renders correctly. Unblocks CR-014 + CR-016 downstream. |
| 2 | **CR-016** | Dynamic events build on top of clean variable layer. Once both land, owner can self-serve nearly all template work. |
| 3 | **CR-014** | E-invoice link depends on (a) variables (CR-015) and (b) `send_bill` event being reliable (CR-004 P3.5 done ✅). Could ship in parallel with CR-016. |

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
