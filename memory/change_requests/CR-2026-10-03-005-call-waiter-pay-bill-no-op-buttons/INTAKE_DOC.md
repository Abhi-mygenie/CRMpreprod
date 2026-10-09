# INTAKE DOC — CR-2026-10-03-005

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-03-005 |
| **Title** | "Call Waiter" and "Pay Bill" buttons are live in the UI but do nothing — silent no-op on landing page and order-success page |
| **Classification** | **BUG (customer-visible, silent failure)** → becomes a feature-wiring CR once CRM confirms the endpoints |
| **Date Registered** | 2026-10-03 |
| **Reported By** | INV-2026-09-15-003 (Q-CA-2 "our buttons are stubs") · owner question **O5** · owner 2026-10-03: the endpoints we had noted are **wrong** → **Q-CA-6** raised to CRM |
| **Severity** | **P2** — a diner presses a visible button, nothing happens anywhere. **Measured exposure 2026-10-03: 1 of 13 tenants** (restaurant `672`, `showLandingPayBill: true`); the other 12 have all four flags `false`. See §1b |
| **Risk** | **HIGH by file** — `LandingPage.jsx` (§6.7) and `OrderSuccess.jsx` (§6.8) are both hotspots; the change itself is additive (two handlers) |
| **Status** | 🅿️ **PARKED 2026-10-03** — POS answered **P1 = (b): nothing in POS reads `pos_event_logs`**, so with CRM write-only the collection is unread estate-wide and these buttons **cannot work in the current architecture**. POS then parked the direction (P2) and the Pay-Bill semantics (P3) — "feature is not live". Resume only when POS returns. See `INV-002/VALIDATION_OF_POS_REPLY_2026-10-03.md` |
| **Parent** | INV-2026-09-15-003 · owner O5 |
| **Blast radius** | **SMALL** — 2 FE pages + 1 service function |

## 1. Problem (code truth, verified on `3oct` 2026-10-03)

```
LandingPage.jsx:738   const handleCallWaiter = () => { /* TODO: Integrate with call waiter API */ logger.order('Call waiter triggered'); };
LandingPage.jsx:743   const handlePayBill   = () => { /* TODO: Integrate with pay bill flow  */ logger.order('Pay bill triggered'); };
OrderSuccess.jsx:490  const handleCallWaiter = () => { … logger.order('Call waiter triggered for order', orderData.orderId); };
OrderSuccess.jsx:495  const handlePayBill   = () => { … logger.order('Pay bill triggered for order', orderData.orderId); };
```

Both buttons are **rendered for real diners** whenever the config flags allow it
(`LandingPage.jsx:1193-1215` gated on `showCallWaiter` / `showPayBill`;
`OrderSuccess.jsx:822-842`, additionally gated on dine-in/room context, `FEAT-002-PREP`).
Pressing either writes a line to the browser console and nothing else — **no API call, no toast,
no confirmation, and no signal to the restaurant**. The diner reasonably believes a waiter has
been called.

**Why it is not already wired:** the endpoints are CRM's. An earlier CRM brief listed
`POST /scan/call-waiter` and `POST /scan/request-bill` with a `table_id` field (INV-022 A10), but
the **owner flagged these as incorrect on 2026-10-03**, so **Q-CA-6** now asks CRM for the correct
paths, exact body and auth requirement. Separately, Q-CA-2 / POS **P1** establish who actually
*consumes* the resulting event (`pos_event_logs` — CRM says it is not them; it must be POS or the
feature is dead end-to-end even if we wire it).

## 1-POS. POS answer (2026-10-03) — **nobody reads the events. The feature cannot work as designed.**

POS answered **P1 = (b): POS does not read `pos_event_logs`.** Combined with CRM's own evidence
(write-only: 3 writes, 0 reads) and our zero touches, that means **no component anywhere in the
estate reads this collection.** Every Call Waiter / Pay Bill row ever written is unread.

So this CR is not "buttons not yet wired" — it is **"buttons that cannot work in the current
architecture"**. Wiring them to CRM's (correct) endpoints would still reach nobody.

POS also **parked** the direction question (P2 — CRM-pushes vs move-to-POS) and the Pay-Bill
semantics (P3). **Owner clarified 2026-10-03: "not live" means NOT BUILT YET, not cancelled** — so
this CR is **PARKED, not withdrawn**, and the buttons, config flags and CRM endpoints should all be
left in place for the eventual build. **This CR is therefore PARKED**, with evidence rather than
assumption.

Two consequences recorded elsewhere:
- Contract **A-1** — frozen §2d annotates this collection *"consumer = POS, required"*, which is now
  factually wrong. It needs a **v1.1 amendment agreed with CRM** under §8 C1; it has **not** been
  edited unilaterally.
- The parked **restaurant 672** config flag is still worth deciding independently — a dead button
  is dead regardless of who eventually owns the design.

## 1a. CRM answer (round 2, 2026-10-03) — **the endpoints were never wrong**

CRM replied with file:line evidence (`scan.py:845,863`): the paths we already had are **correct**.

| Item | Confirmed value |
|---|---|
| Endpoints | `POST /scan/call-waiter` · `POST /scan/request-bill` |
| Body | `{table_id, message?}` (`TableAction`) |
| Auth | **customer token required** (`verify_customer_token`) |
| Side effect | one doc into `pos_event_logs`: `{type: call_waiter\|request_bill, user_id, customer_id, table_id, message, status:"pending", created_at}` |

**The owner's 2026-10-03 assertion that these endpoints were incorrect is withdrawn — the original
brief was accurate.** The real gap is different and worse: **CRM only *produces* these events and
never reads `pos_event_logs`.** So wiring our buttons to the correct endpoint would still not
reach a waiter unless **POS consumes that collection** (POS question **P1**).

Two consequences for this CR:
1. The technical blocker is no longer an unknown endpoint — it is **POS consumption**. Acceptance
   criterion 6 is therefore the gating one, not criterion 1.
2. CRM has **parked the direction question** and handed it back: keep Call Waiter / Pay Bill in CRM
   as event producers with POS consuming, or move them to POS entirely? **Owner decision required.**

Because the wiring is now blocked on an architecture decision rather than a missing contract, the
**interim mitigation in §2 is the only part of this bug that can be fixed today** and should be
decided separately.

## 1b. Live exposure — **measured, not assumed (2026-10-03)**

The owner stated the buttons are "already hidden by configuration". **Verified against the live
shared DB and the code — correct for 12 of 13 tenants, with one exception.**

| Layer | Finding |
|---|---|
| Frontend default | `RestaurantConfigContext.jsx:37-40` — `showCallWaiter`, `showPayBill`, `showLandingCallWaiter`, `showLandingPayBill` all default **`false`**, and config is merged as `{...DEFAULT_CONFIG, ...apiData}` (L253). So a missing key = hidden. ✅ |
| Backend no-config default | `server.py:1071-1074` — all four keys returned **`false`** when a restaurant has no config document. ✅ |
| `isOn()` caveat | `RestaurantConfigContext.jsx:423` is `config[key] !== false`, i.e. **default-true** — but it never sees a missing key for these four, because `DEFAULT_CONFIG` supplies them. Safe *only* because of that. |
| **Live data (13 config docs)** | `showCallWaiter` **0 true** · `showPayBill` **0 true** · `showLandingCallWaiter` **0 true** · `showLandingPayBill` → **1 true: restaurant `672`** |

**So: on this database, restaurant 672 renders a "Pay Bill" button on its landing page (dine-in
contexts only) that does nothing when pressed.** Every other tenant is genuinely hidden.

> ### CORRECTION 2026-10-03 — scope of that finding
> An earlier version of this section called 672 "a live tenant with real diners". **That was an
> over-reach and is withdrawn.** The probe ran against the **shared UAT** database
> (`MONGO_URL` → `52.66.232.149/mygenie`, the same shared instance this whole investigation is
> about) — so the 24 orders and 17 customers are **UAT rows, not production traffic**. Liveness was
> inferred, not evidenced.
>
> What the evidence does support, precisely:
> - On the shared UAT DB, **672 is the only one of 13 tenants with any of the four flags on**.
> - The **code behaviour is environment-independent**: any tenant, in any environment, whose config
>   has `showLandingPayBill: true` renders a dead button.
> - Whether any **production** tenant has it set is **unknown and not checkable from here** — we
>   have no production DB access. That is a question for the owner, not something to assert.

### PARKED 2026-10-03 (owner instruction)

The 672 flag decision and the orphan-config-key sweep below are **PARKED**. No config write, no CR
registered for the orphan-key class. Resume when the owner asks. The analysis is kept so it does
not have to be rediscovered.

Also parked-by-correction: an earlier draft described the shared DB as being used by POS. **It is
not** — the shared `mygenie` DB is **Customer App + CRM only** (owner, 2026-10-03), which is what
ground rule **G3** says. See contract **O-12** for the consequence: POS cannot consume
`pos_event_logs` by reading it, so the only live options are *CRM pushes to POS* or *move the
actions to POS*.

### Why only 672, and why it will not self-heal

| Finding | Evidence |
|---|---|
| The key is present in **all 13** config docs, explicitly valued — 12 `false`, 672 `true` | per-doc probe, 2026-10-03 |
| 672's doc was last written **2026-08-14** | its `updated_at` |
| Nothing in the code is special about 672 | `LandingPage.jsx:865-866` reads the flag generically |
| No admin screen can set or clear it | `VisibilityTab.jsx:113-114`, `AdminVisibilityPage.jsx:89-90` expose only `showCallWaiter`/`showPayBill` |
| **The flag is sticky.** `AdminConfigContext.saveConfig` (`:226-241`) PUTs **the entire config object** (`{...config}`, ~106 keys) on every admin save — not just the edited fields. So an orphan key that is already `true` in state is **re-persisted on every future save**, invisibly, forever | `context/AdminConfigContext.jsx:231-241` |

So it was almost certainly switched on once during UAT testing in August — via a direct
`PUT /api/config/` or an older build that had a toggle — and every admin save since has faithfully
written it back. `customer_app_config` has no audit trail, so **who set it cannot be determined
from the data**.

**Generalised intake note (candidate for its own small CR):** config keys that no admin screen
controls are still round-tripped on every save. Orphan flags therefore persist silently and cannot
be cleared through the product. `showLandingCallWaiter` / `showLandingPayBill` are the two known
instances; a sweep of the 106-key config model against the admin UI would find any others.

**Sub-finding — the two landing flags have no admin toggle.** `VisibilityTab.jsx:113-114` and
`AdminVisibilityPage.jsx:89-90` expose only `showCallWaiter` / `showPayBill`.
`showLandingCallWaiter` / `showLandingPayBill` are accepted by the config API
(`server.py:169-170`) and read by `LandingPage.jsx:865-866`, but **no admin screen can turn them
off** — so 672's flag cannot be cleared from the admin UI, only by a direct config write. Recorded
here; can be split into its own small CR if the owner prefers.

**Revised exposure:** on the shared UAT DB, 1 tenant / 1 button / dine-in only. Production status
unknown — not checkable from here. The bug is real but narrow, so the interim mitigation is a
single-tenant config write rather than a code change.

## 2. Scope

**IN**
- `crmService.js`: `crmCallWaiter()` / `crmRequestBill()` against the endpoints CRM confirms in Q-CA-6.
- Wire the 4 handlers; send the scanned table identifier (`useScannedTable.js` exposes `tableId`; CRM's field name is `table_id`).
- Real user feedback: success toast, failure toast, and a disabled/loading state so the button cannot be spammed.
- **Interim mitigation, shippable without CRM (Planning to recommend):** while Q-CA-6 is open, either hide the two buttons by default or show an honest "please ask at the counter" message instead of a dead click. **Owner decision required** — this is the part of the bug we can fix today.

**OUT**
- `pos_event_logs` — we never read or write it (Q-CA-2 answer stands); the consumer question is POS **P1**.
- Any actual payment capture. "Pay Bill" here is a *request to settle the bill at the table*, **not** a payment flow — must be confirmed with the owner at Planning so this does not silently become a payments CR (Part C: payments = CRITICAL, separate gate).
- The `showCallWaiter` / `showPayBill` config flags themselves (ours, already working).
- `OrderSuccess.jsx` polling / status logic.

## 3. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| Owner question **O5** | O5 is the decision ("wire now or leave stub"); this CR is the work item | SAME TOPIC — this is its registration |
| CR-2026-09-12-013 | Decomposition of `LandingPage.jsx` / `OrderSuccess.jsx` | RELATED — sequence to avoid conflict on hotspot files |
| CR-2026-10-03-004 | Also edits `LandingPage.jsx` | RELATED — sequence |
| `FEAT-002-PREP` markers in `OrderSuccess.jsx` | The prep work that added the dine-in gating | RELATED — this CR completes it |

## 4. Code exists? **PARTIAL** — UI, config gating and handlers exist; the handlers have no body and `crmService` has no such functions.

## 5. Files

| Will change | Will NOT touch |
|---|---|
| `frontend/src/pages/LandingPage.jsx` · `frontend/src/pages/OrderSuccess.jsx` · `frontend/src/api/services/crmService.js` | `backend/server.py` · `CartContext.js` · payment payload · `pos_event_logs` |

## 6. Acceptance criteria

1. On rid 689 dine-in, pressing **Call Waiter** issues the CRM call confirmed in Q-CA-6 and shows a success toast.
2. A CRM failure (5xx / network) shows an error toast — **never a silent no-op**; this is the acceptance criterion that closes the bug.
3. Rapid double-press cannot fire two requests (disabled / in-flight state).
4. Same behaviour from the order-success page, with the order / table context attached.
5. When `showCallWaiter` / `showPayBill` are off, the buttons stay hidden (unchanged).
6. Someone on the restaurant side can actually *see* the request (needs POS **P1**) — if not, the end-to-end feature is **not** closable and the interim mitigation stands instead.
7. Order placement and order-status polling regression passes (hotspot files).

## 7. Prerequisites / blockers
1. ~~CRM answer to Q-CA-6~~ — **ANSWERED 2026-10-03**, see §1a. Contract clause frozen in `control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` §4a.
2. **POS P1-refined** — does anything in POS **read** `pos_event_logs`? CRM is write-only with 0 reads, so if POS does not read it, nothing in the system does. **Gating blocker.**
3. **POS P6** — direction: keep the actions in CRM with POS consuming, or move them to POS entirely? **The owner referred this decision to POS on 2026-10-03** (contract **O-4**). POS must also state **how staff actually get notified** — that is the real acceptance criterion.
4. **POS P7** — confirm "Pay Bill" = request to settle at the table, **not** an in-app payment. **Owner referred this to POS**; reserved meanwhile as contract clause **§3 I6**. Nothing may be planned under this name that touches money until POS confirms.
5. **Interim mitigation — narrowed by measurement (§1b).** The owner's position is that the buttons are already hidden by configuration, which is true for 12 of 13 tenants. The residual action is therefore a **single-tenant config fix: clear `showLandingPayBill` on restaurant `672`** — no code change. Note it cannot be done from the admin UI (§1b sub-finding); it needs a config API write or a direct document update. Owner to confirm whether to clear it now or leave it.

```text
Intake complete: CR-2026-10-03-005
Classification: BUG (customer-visible silent failure) → feature wiring
Severity: P2
Risk: HIGH (LandingPage.jsx + OrderSuccess.jsx hotspots); additive change
Duplicate check: DISTINCT (same topic as owner question O5; related CR-2026-09-12-013, CR-2026-10-03-004)
Evidence: captured (LandingPage.jsx:738-746,1193-1215 · OrderSuccess.jsx:490-498,822-842)
Blast radius: SMALL
Docs updated: this file, ../README.md, ../../PRD.md
Next: BLOCKED — CRM Q-CA-6 + POS P1 → owner decision on interim mitigation → Planning
```
