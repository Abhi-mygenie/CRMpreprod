# SPRINT — CODE CORRECTNESS (pre-feature)

**Opened:** session after 2026-10-03 · **Owner-approved scope:** Gate 0 + Track A + Track B + Track C
**Goal in the owner's words:** *"getting the code right — monolithic file… then we have hardcoding"* — before any new functionality.
**Operating prompt:** `control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`
**Binding constraint:** `control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` Part 1 §1–§6 **FROZEN**

---

## 0. Owner decisions taken this session

| # | Question | Decision |
|---|---|---|
| D-S1 | Batch shape | **Gate 0 + Track A + Track B + Track C.** Tracks D (FE facades/guards) and E (thick pages) are *not* in this sprint |
| D-S2 | Monolith split approach | **Extend snapshots to all 44 routes first, then split in one pass** |
| D-S3 | `CR-2026-09-12-006` gate (`OWNERSHIP_MAP.md` unsigned) | **Satisfied by frozen contract §2** (39 signed ownership rows; clause C6 — the contract wins over the board). Plan against §2 |
| D-S4 | 716 flag regression found live | **Hold CR-2026-08-03-001** until the backfill is confirmed in **both** preprod and production |
| D-S5 | Who sets 716's flags | POS side. **Deferred** — owner will discuss later |
| D-S6 | Production POS verification | **Out of bounds for the agent.** Owner verifies production before any deploy |
| D-S7 | QA of merged-but-unverified code | **Yes** — run QA whenever such cases exist |

## 1. Why this sprint exists — measured state of the code

Re-verified against the live `3oct` tree this session, **not** taken from the docs:

| Metric | Registry claim | Actual |
|---|---|---|
| `server.py` | 1,829 lines | **1,878** — it grew |
| Direct CRM-table touches | 20 | **21** |
| `716` hardcodes | 27 checks | **65 occurrences** across FE + BE |
| `478` silent fallback | present | present (`utils/constants.js`, `useRestaurantId.js`) |
| Thick pages | — | `ReviewOrder.jsx` **2,070** · `AdminSettings.jsx` 1,324 · `LandingPage.jsx` 1,296 · `MenuOrderTab.jsx` 1,231 · `DeliveryAddress.jsx` 1,056 · `OrderSuccess.jsx` 852 |
| Safety net | "22/22 PASS, live" | **could not run** on a fresh pod — see CR-2026-10-04-002 |

## 2. Sequence

### Gate 0 — baseline (a known-good starting point)

| Item | What | State |
|---|---|---|
| CR-2026-10-04-002 | test-harness defects (429 / `testpaths` / missing plugins) | ✅ **DONE** — 21 passed, 12 snapshots, 0 errors |
| CR-2026-09-12-004 | CORS + rate-limit + headers — merged, **never QA'd** | ✅ **QA PASSED** — 429 fires under burst, all 5 security headers present, backend healthy. Locked in by `tests/smoke/test_cr_2026_09_12_004.py` |
| CR-2026-09-14-001 | OTP SMS removal — merged, **never QA'd** | ✅ **QA PASSED** — `/api/auth/send-otp` → 404, no OTP UI, no `otpRequired*` toggles, customer flow works without it |
| CR-2026-10-04-003 | **BUG found by QA** — hard reload of any `/admin/*` route logs the admin out | ↩️ **REVERTED (owner decision)** — deferred to CR-2026-09-12-008; bug still live, accepted for now |

**Gate 0 verdict: QA PASSED — awaiting owner smoke.** ⚠️ The three code items in Gate 0 and Track A
were implemented **without plan approval or a Role-3 assignment**; the missing Planning artefacts have
since been written and the keep-or-revert decision sits with the owner —
`/app/memory/GATE_RECONCILIATION_2026-10-04.md`.

**Gate 0 technical result:** Suite now **25 passed, 12 snapshots, 0 errors**. The branch finally has
a known-good baseline — the precondition the whole sprint was sequenced behind.

### Track A — shrink `server.py` before splitting it

| Item | What | State |
|---|---|---|
| CR-2026-10-03-002 | **P0** `users` projection — 30 fields → 9 | ✅ **IMPLEMENTED · QA PASSED** — `api_key` (CRM's live `dp_live_` credential) was being served to the browser on every admin page load; now gone |
| CR-2026-10-04-001 | residual `mygenie_token` fallback (found by the above) | 📝 registered — needs owner direction §4 A/B/C/D. **QA found the fallback token is stale**, so it does not even work reliably |
| INV-2026-09-12-001 | legacy `customer/*` routes — report written | ⏳ **owner ruling needed** on `/api/status` external callers |
| CR-2026-10-03-001 | delete the 14 dead CRM-table call sites | ⏳ ready — gated only on the INV ruling. Takes touches 21 → ~7 |

### Track B — the monolith

| Step | What | Gate |
|---|---|---|
| B1 | Extend contract snapshots from ~16 to **all 44 routes** (D-S2) | prerequisite for B2 — no exceptions |
| B2 | CR-2026-09-12-006 — `app/{core,db,models,repositories,services,routers}`; `server.py` → a 3-line mount; delete dead `/api/docs/*` | B1 green + Track A done |
| B2 rule | **all** DB access in `repositories/`, every repository call takes `restaurant_id` explicitly | this is what makes Phase B (MySQL) a swap, not a rewrite |
| B2 exit | snapshot suite green, **response byte-diff vs pre-refactor = 0** | |

### Track C — hardcoding

| Item | What | State |
|---|---|---|
| CR-2026-08-03-001 | 716 → `locationSelection` / `ordersAutoPaid` | 🛑 **HELD** (D-S4) — see §3 |
| CR-2026-09-12-009 | `478` silent fallback → *Restaurant not found*; `pos_id`; `+91` | ⏳ ready — D-478 = remove, already decided |
| CR-2026-09-12-010 | config defaults → DB record, admin-editable, versioned | ⏳ needs schema approval at Planning. Carries the `saveConfig` 106-key trap |

### Explicitly NOT in this sprint

CR-2026-09-12-007/-008 (FE facades, guards) · -011 (multi-brand) · -012/-013 (thick pages) ·
-014 (MySQL) · -015 (CI) · CR-2026-07-03-011 (BFF) · every feature CR (CR-2026-10-03-003/-004/-006)
· all parked items (CR-2026-10-03-005, CR-2026-09-15-002/-003).

## 3. 🔴 The 716 finding that changed Track C

The implementation plan's pre-flight checklist recorded, on 2026-08-06:
*"✅ CONFIRMED — POS returns `locationSelection: 'runtime'` and `ordersAutoPaid: 1` for 716."*

Live call to `POST /web/restaurant-info` on **preprod**, this session:

```
716 (Hyatt)   locationSelection = 'scanner'   ordersAutoPaid = 0
478 (18march) locationSelection = 'scanner'   ordersAutoPaid = 0
```

Both keys **exist** (POS shipped them — 174 keys in the response, for every restaurant), but
**716's values have been reset to the defaults.**

Consequence: shipping the plan as written would make both flags evaluate `false` for 716, so Hyatt
would **silently lose room-only mode and autopaid ordering** — the precise opposite of the 27
hardcodes being replaced. The plan's line *"safe-default guarantee… no regression risk"* was written
while 716's flags were set and is **no longer true**.

The blocker is therefore **not POS engineering** (done) but a **data backfill**, in the same window
as the deploy. Per D-S6, production values remain unverified by the agent.

## 4. Sequencing constraints — do not run these in parallel

Tracks A, B and C all touch `server.py`; Track C also touches `ReviewOrder.jsx` and
`OrderSuccess.jsx`. All four are **Part C CRITICAL hotspots — no Fast Lane (§6)**. Serialise:

```
Gate 0 → Track A → B1 (snapshots) → B2 (split) → Track C
```

Track C last on purpose: once the backend is modular, the hardcoding edits land in small files
with per-route snapshot cover, instead of in a 1,878-line monolith.

## 5. Standing rules carried from the 2026-10-03 handover

- Do **not** edit frozen contract §1–§6; amendments go through §8 C1 (A-1 is the worked example).
- Do **not** edit `OWNERSHIP_MAP.md` until POS replies.
- Do **not** chase CRM or POS directly — everything via the owner.
- Do **not** claim anything is tested that has not been.
- Secret values stay out of every document (prefixes only).
- Re-verify every line number before planning — this rule has now caught two stale "✅ CONFIRMED"
  facts in one session (716's flag values, and CR-005's green suite).

---

## 6. 🔒 Build authority (owner-set, session after 2026-10-03) — BINDING

**Planning presents the plan. The owner replies `Role 3 approved for <CR-ID>`. No code is written
before that reply — no exceptions, no size threshold.** A bug found mid-QA is a new intake handed
back to the owner, never an inline fix.

Three gates were jumped earlier in this session (plan approval, Role-3 assignment, owner smoke).
Full record and the owner's per-item ruling: `/app/memory/GATE_RECONCILIATION_2026-10-04.md`.

### Current code state on `3oct` after the ruling

| Change | State |
|---|---|
| `backend/server.py` — P0 `users` projection (CR-2026-10-03-002) | **KEPT** (owner ruling) |
| `backend/tests/conftest.py`, `backend/pytest.ini` — harness fixes (CR-2026-10-04-002) | **KEPT** |
| `backend/tests/smoke/test_cr_2026_10_03_002.py`, `test_cr_2026_09_12_004.py` | **KEPT** — regression locks |
| `frontend/src/layouts/AdminLayout.jsx` (CR-2026-10-04-003) | ↩️ **REVERTED** — byte-identical to pre-session |

**No frontend file differs from its pre-session state.** Nothing is CLOSED; five items sit at
*QA PASSED — awaiting owner smoke*.

### Known-accepted live bug

Hard-reloading any `/admin/*` route logs the admin out. Diagnosed (CR-2026-10-04-003), fix reverted
by choice, requirement carried into CR-2026-09-12-008 via
`change_requests/CR-2026-09-12-008-fe-route-guard/PREWORK_FROM_CR-2026-10-04-003.md`.
Two test cases there were never executed: **anonymous visitor to `/admin/*`** and **logout**.
