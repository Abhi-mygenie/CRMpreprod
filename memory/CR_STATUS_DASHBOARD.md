# CR Status Dashboard — `crm_roi_sprint`

> **Live flat status board.** Update on every phase transition.
> One row per CR. No narrative. For narrative, read the linked discovery / planning / impl / QA doc.
> Last updated: **2026-05-29**

---

## 📌 Latest Session Snapshot

**Session date**: 2026-05-29
**Pod URL**: `https://a28cb9e3-2ed4-46d3-b9be-e6ab5f64fc70.preview.emergentagent.com` (AuthKey webhook rotated to this URL by owner on 2026-05-29)

### What happened this session
1. Project re-bootstrap into new pod (`a28cb9e3-…`) — repo re-cloned from branch `28-may`, deps installed, services UP, `/api/health` 200, remote MongoDB connected.
2. Pod URL rotation acknowledged — owner is updating AuthKey delivery-callback webhook to the new pod URL.
3. **CR-016 DEFERRED to next sprint** — owner decision (verbatim): *"actually it will come very complex we have almost definate event we used need to ensure they map and fire correctly for now we can mark cr to be taken in next spirint"*. §7 Q1–Q8 remain open and roll over to the next sprint. See `DECISIONS_LOG.md` 2026-05-29 entry.
4. Sprint focus pivots to **CR-015 first** (existing-event mapping + variable rendering fidelity), then **CR-014** (e-invoice mobile link). No event-engine work this sprint.

### 🎯 Next-agent handoff message

```
You are picking up the MyGenie CRM ROI sprint mid-flight.

READ FIRST in this order:
1. /app/memory/README.md
2. /app/memory/CR_STATUS_DASHBOARD.md (especially the "Latest Session Snapshot")
3. /app/memory/DECISIONS_LOG.md (every owner decision so far — note 2026-05-29 CR-016 deferral)

CURRENT STATE (2026-05-29):
- CR-004 P3.5 is CLOSED (full live test passed 2026-05-28)
- CR-016 is DEFERRED to NEXT sprint — do not ask its §7 questions this sprint
- 2 CRs are parked in Phase 0 discovery, in this priority order:
  - CR-015 Variable Mapping Fidelity — 8 questions in §7 of its discovery doc (UNPARK FIRST)
  - CR-014 E-Invoice — 2 questions in §15.6 of its discovery doc (UNPARK SECOND)

WHAT TO DO:
Wait for the owner to say "Resume CR-015" or "Resume CR-014".
Then:
  1. Read /app/memory/crm/crm_roi_sprint/discovery/CR_XYZ_*_DISCOVERY.md end-to-end
  2. Ask the owner the questions listed in §7 (or §15.6 for CR-014)
  3. After answers, write /app/memory/crm/crm_roi_sprint/planning/CR_XYZ_PHASE_1_PLAN.md
  4. Then implementation, then QA per CR lifecycle (README §4)

DO NOT:
- Call testing_agent_v3
- Push to crm.mygenie.online
- Write to remote MongoDB from ad-hoc scripts without explicit per-change approval
- Open CR-016 unless owner explicitly says "Resume CR-016 — moving up from next sprint"

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
```

If any of those fail → see `RUNBOOK.md` §1, §2, §11.

### Active queue (this sprint, after 2026-05-29 deferral)

| Order | CR | Why |
|---|---|---|
| 1 | CR-015 | Foundation — ensure the 27 existing hardcoded events fire + render variables correctly. Owner's stated sprint priority. |
| 2 | CR-014 | E-invoice mobile link — independent track; depends only on `send_bill` reliability (CR-004 P3.5 done ✅) + variable layer (CR-015). |
| — | CR-016 | **Deferred to next sprint.** |

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
