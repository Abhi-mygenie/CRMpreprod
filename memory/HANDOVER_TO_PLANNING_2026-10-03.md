# HANDOVER TO PLANNING AGENT (Role 2)
## From: Intake (Role 1) · Date: 2026-10-03 · Project: MyGenie Customer App
## Operating prompt: `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`

---

# 0. YOUR INSTRUCTION FROM THE OWNER (verbatim)

> *"write a handover for planning agent, who will present this complete intake batch and ask me for
> impact analysis, we will decide priority there for CRs"*

So your **first action is not to plan anything**. It is to:

1. **Present the complete intake batch below to the owner** — all 10 CRs and 4 investigations, with
   severity, risk and what each is blocked on.
2. **Ask the owner which items to take into Impact Analysis.** Do not choose for them.
3. **Agree priority with the owner at that point.** Intake deliberately did **not** set execution
   priority — the owner has reserved that decision for your conversation.

Only after that do you write `IMPACT_ANALYSIS` artifacts (§9).

**Read first:** this file → `change_requests/README.md` → `control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md`
(v1.0 Part 1 **FROZEN**) → the intake docs for whatever the owner selects.

---

# 1. GATE POSITION — read before you promise anything

Per §4 the flow is 13 gates. **Every item is at gate 1.**

| Gate | State |
|---|---|
| 1 Intake | ✅ complete — 14/14 items registered, registry audited clean 2026-10-03 |
| 2 Impact Analysis | ⬅ **YOU ARE HERE** (nothing written) |
| 3 Implementation Plan → 13 Release | not started |

**Zero lines of code have been written on this entire track.** The only code that exists is one
route, `GET /api/docs/ownership-board`. **20 direct CRM-table touches are still live in
`server.py`.** Nothing has been tested, because nothing has been built — do not let anyone infer
otherwise from the volume of documentation.

Per §15, **no item can be closed** and **no release is ready**. The owner has explicitly closed the
*session*, not the items.

---

# 2. THE COMPLETE INTAKE BATCH — present this table

## 2a. Ready to plan now (no external blocker)

| ID | What | Type | Sev | Risk | Blast | Note for the owner |
|---|---|---|---|---|---|---|
| **CR-2026-10-03-002** | `users` read → 6-field projection, so CRM's `api_key` / `authkey_api_key` / `mygenie_token` stop loading into our process on every admin request | **BUG — security** | **P0** | CRITICAL | SMALL (2 lines) | **The smallest, highest-value item in the batch.** No CRM/POS/frontend dependency. `INV-2026-10-03-001` proved the key is a real `dp_live_`-prefixed credential, not theoretical. Owner has twice chosen to leave it registered — worth re-offering once |
| **CR-2026-10-03-001** | delete the 14 dead CRM-table call sites in `server.py` | CR — cleanup | P3 | HIGH | MEDIUM | Takes direct CRM-table touches **20 → 6** in one pass, zero user-visible change. Owner-approved scope (O7). Sequence **before** CR-2026-09-15-004 |
| **CR-2026-09-15-001** | profile tabs → CRM v2 adapter (gaps G1–G5) | CR | P1 | HIGH | MEDIUM | Owner said "go" on 2026-09-28; never planned. Endpoints already live |

## 2b. Blocked on CRM shipping code

| ID | What | Type | Sev | Risk | Blocked on |
|---|---|---|---|---|---|
| **CR-2026-10-03-003** | feedback → `POST /scan/feedback` (hybrid intake). Today we write our own schema into CRM's `feedback` collection; nobody can read it and the diner still sees a success toast | **BUG — data integrity** | P1 | CRITICAL | CRM **CR-096** (number confirmed, no date — their planning gate is shut) |
| **CR-2026-10-03-004** | pre-login reads → CRM API: `check-customer` → `/scan/auth/lookup`, `loyalty-settings` → `/scan/loyalty-rules/{rid}`, retire `customer-lookup` | CR | P1 | CRITICAL | CRM **CR-093** + **CR-094** |

## 2c. Blocked on POS

| ID | What | Type | Sev | Risk | Blocked on |
|---|---|---|---|---|---|
| **CR-2026-09-15-004** | admin login off CRM's `users` → POS direct (direction D) | CR | P1 | CRITICAL | POS profile **path + response shape** (contract **O-14**) · owner **F3** approval |
| **CR-2026-10-03-006** | franchise multi-outlet admin — outlet picker + selected-outlet threading | CR — feature | P2 | CRITICAL | POS multi-entry **response shape** (**O-13**) · must land **after** CR-2026-09-15-004 |

## 2d. Parked (do not plan without the owner reopening)

| ID | What | Why parked |
|---|---|---|
| **CR-2026-10-03-005** | Call Waiter / Pay Bill are silent no-ops | POS confirmed **nothing reads `pos_event_logs`** — the buttons cannot work in the current architecture. POS parked the direction (P6) and the Pay-Bill semantics (P7); feature is **not built yet, not cancelled**. Leave buttons, flags and CRM endpoints in place |
| **CR-2026-09-15-002** | skip-otp dead 409/429 branch | behind CR-2026-09-15-001 |
| **CR-2026-09-15-003** | canonical phone alignment | India-only rollout; our `+91` path already produces CRM's canonical form |

## 2e. Investigations

| ID | What | State |
|---|---|---|
| **INV-2026-10-03-001** | 🔴 **SECURITY** — preprod issues a static `dp_live_`-prefixed CRM credential; shared UAT DB holds real customer PII incl. **114 `customer_documents`** | **DevOps/Ops own it.** Brief written. **No Customer App code expected** — if that changes it becomes a *new* CR, not a retrofit |
| INV-2026-09-15-003 | direct CRM-table access audit (the parent of 001–005) | COMPLETE — fully discharged |
| INV-2026-09-15-002 | shared-DB ownership map | OPEN — CRM's half received and reconciled; **`OWNERSHIP_MAP.md` deliberately unedited** until POS answers. Contract §2 carries the current truth |
| INV-2026-09-15-001 | profile 404 / CRM v2 contract gap | CLOSED |

---

# 3. OUTBOUND STATE (owner confirmed 2026-10-03)

| To | Item | State |
|---|---|---|
| **CRM** | Amendment **A-1** (§2d `pos_event_logs` consumer → NONE) | ✅ **sent** — owner: *"crm its given to them we can proceed our work."* Publish contract **v1.1** on their "agreed"; **do not edit frozen §2d before that** |
| **POS** | the four questions | ✅ **answered** — owner has replied to them |
| **DevOps** | security brief for INV-2026-10-03-001 | ⚠️ **state unconfirmed** — assume **not sent**; ask the owner |

## Still owed by POS — chase via the owner, not directly

| # | Outstanding |
|---|---|
| **O-14** | exact **profile endpoint path + response shape**. Their "ok" acknowledged the question; **verified 2026-10-03 that neither login response carries `restaurants[]`, an id or a name**, so this is genuinely still missing. **This is the single blocker on CR-2026-09-15-004** |
| **O-13** | multi-entry (franchise) response shape — just `{id,name}`? primary/head-office flag? can an entry be inactive? |
| **O-15** | which login path is canonical, `/login` or `/common-login`; is `/login` deprecated? **Both return 200 today, so nothing is broken** |
| O-4 / O-11 | Call Waiter direction + Pay Bill semantics — **parked by POS**, not outstanding |

## Still owed by the owner
**F3** approval (needs your `IMPACT_AND_NEW_FLOW.md` first — see §5) · **O-7** live-host JWT hash
check · the parked restaurant-**672** flag decision.

---

# 4. THE CONTRACT IS FROZEN — this constrains your planning

`control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` — **v1.0, Part 1 §1–§6 FROZEN**, signed by CRM and the
owner on 2026-10-03.

- **§1–§6 may not be changed by planning.** Any change needs written agreement from both teams plus
  a version bump (**§8 C1**). Amendment **A-1** is the worked example — a two-line correction still
  went to CRM for agreement rather than being quietly edited.
- **§2** is the authority on who may write which collection. **§4** is the authority on endpoint
  shapes and field quirks. **Plan against these, not against older briefs** — clause **C6** says the
  contract wins wherever an older brief, reply or the ownership board disagrees.
- **§7** is a live open-items list and is *not* frozen. 10 items closed, 8 open.

---

# 5. TRAPS — each of these cost real time to find

1. **"Code is truth" (§11) — re-verify every line number.** Intake verified all references against
   branch `3oct`, but verify again before you plan. This rule is how we learned CR-094 is a
   **drop-in URL swap** rather than an adapter rewrite: CRM warned their earn percentages are
   per-tier, and our code was **already** per-tier (`LoyaltyRewardsSection.jsx:29`).

2. **`exists` → `found` mapping in CR-2026-10-03-004 is mandatory.** CRM's `/scan/auth/lookup`
   returns `{exists, name}`; the route we retire returns `found`, and `found` drives
   `isNewCustomer` → the **first-visit-bonus line** (`LoyaltyRewardsSection.jsx:36`). Miss it and
   `!undefined === true` shows the bonus to **every diner**. Owner decision F2=(a) covered losing
   the points/tier preview — it never covered the bonus line, and the bonus line need not be lost.

3. **`AdminConfigContext.saveConfig` (`:226-241`) PUTs the entire ~106-key config object** — not
   just edited fields. Two consequences: config keys with no admin UI persist invisibly forever, and
   in CR-2026-10-03-006 a stale selected-outlet would overwrite one outlet's whole config with
   another's. **The riskiest line in that CR.**

4. **Two POS identities are in play.** `backend/.env` holds a service account
   (`MYGENIE_POS_LOGIN_PHONE` / `PASSWORD`) used for QR and table operations; the owner separately
   supplied an admin account (`test_credentials.md`). **Do not conflate them** when planning
   CR-2026-09-15-004.

5. **Hotspot files — no Fast Lane (§6).** `server.py`, `LandingPage.jsx`, `ReviewOrder.jsx`,
   `OrderSuccess.jsx` are all Part C CRITICAL. Every CR in this batch touches at least one.

6. **`zone_wise_topic: "zone_5_restaurant"`** from the POS login looks like it carries a restaurant
   id. **It does not** — it is a messaging topic. Do not parse an id out of it.

7. **Franchise is a latent bug, not a regression.** `users` already carries one `restaurant_id` per
   row, so franchise admins have always landed on one arbitrary outlet. CR-2026-09-15-004 does not
   cause it; it makes it visible. Do not describe it as a regression from that CR.

8. **CR-2026-09-15-004 ships single-outlet on `restaurants[0]`** — identical to our current
   behaviour and CRM's, so **no regression** — with two conditions agreed at intake: record
   `restaurants[0]` in code as a deliberate placeholder naming CR-2026-10-03-006, and **log a
   warning naming the outlets being ignored** when `restaurants[]` has more than one entry. That
   warning is also how we find out whether any real franchise admin exists today — nobody knows.

9. **Secret hygiene.** The `dp_live_` value is deliberately in **no** document. Keep it that way; do
   not paste it into an impact analysis.

---

# 6. YOUR FIRST DELIVERABLE AFTER THE OWNER CHOOSES

Whatever they pick, one artifact is already named and overdue:

**`CR-2026-09-15-004/IMPACT_AND_NEW_FLOW.md`** — the owner said on 2026-09-28 they would approve F3
*"after checking impact and new flow"*. It has never been written, and F3 is the gate on the whole
admin-login thread. Intake could not write it (Role 2 artifact). Contents the owner asked for:
current vs new sequence, touched files and routes, failure modes, rollback, and multi-restaurant
handling — the last now points at CR-2026-10-03-006. **POS's O-14 can be marked TBD**; the rest is
writable today.

---

# 7. WHAT NOT TO DO

- **Do not set execution priority yourself.** The owner reserved it for your conversation.
- **Do not edit frozen contract §1–§6.** Amendments go through §8 C1 — see A-1.
- **Do not edit `OWNERSHIP_MAP.md`.** Standing rule: rewritten and signed only after POS replies.
- **Do not plan the parked items** (CR-005, CR-2026-09-15-002/-003) unless the owner reopens them.
- **Do not plan a payments change under the name "Pay Bill"** — contract **§3 I6** reserves it as *a
  request to settle at the table, never an in-app payment* until POS confirms (O-11).
- **Do not chase CRM or POS directly.** Everything goes via the owner.
- **Do not claim anything is tested.** Nothing is.

---

# 8. SESSION RECORD

| | |
|---|---|
| Role held | **Role 1 — INTAKE** throughout. Owner declined to release the role twice; **no code written** |
| Registered this session | CR-2026-10-03-001…006 · INV-2026-10-03-001 |
| Registry audit | **14/14 compliant.** 3 gaps found and backfilled: CR-2026-09-15-004 had **no risk label** (§5 violation) and no output block; INV-2026-09-15-003 had no classification block; INV-2026-10-03-001 was missing its duplicate check. All three marked as audit-added with the date |
| Contract | v1.0 Part 1 **FROZEN** (CRM + owner). 39 ownership rows settled. 10 §7 items closed, 8 open. Amendment A-1 sent |
| Counterparty rounds | CRM ×3 (endpoint validation, round 2, board JSON) + sign-off · POS ×1 + a live login curl validated |
| Corrections on the record | **4** — *"CRM's endpoints are wrong"* (owner's; they were right) · *"buttons already hidden"* (owner's; true for 12 of 13) · *"672 is a live tenant"* (**mine**; UAT data) · *"the shared DB is used by POS"* (**mine**; contradicted our own G3). Running log in `SESSION_HANDOVER_2026-10-03.md` §14.4 |
| Full narrative | `/app/memory/SESSION_HANDOVER_2026-10-03.md` — 18 updates, chronological |

**Honest closing line for the owner:** this session converted an unscoped architecture problem into
a frozen contract with a counterparty signature and 14 evidence-backed registered items. It shipped
**no code**, and the P0 security item — two lines, no dependencies — is still open while every admin
request loads a live CRM credential into our process memory.
