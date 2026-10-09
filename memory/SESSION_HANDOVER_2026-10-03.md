# SESSION HANDOVER — 2026-10-03 — Shared-DB boundary track (supersedes 2026-09-28)

## For the next agent. Read in this order:
1. this file · 2. `LEARNINGS_SHARED_DB_BOUNDARY_2026-09-15.md` ·
3. `change_requests/README.md` → section **"Shared-DB boundary remediation (registered 2026-10-03)"** ·
4. `change_requests/INV-2026-09-15-003-direct-crm-table-access-audit/` (REPLY_TO_CRM_INV_022 · VALIDATION · OWNER_RESPONSES_F1-F4)

## 0. Your first move — READ THE CONTRACT, THEN ASK

> **UPDATED LATER THE SAME DAY — see §7 at the bottom.** CRM's round-2 reply arrived after the
> owner's deferral, A9-b and Q-CA-6 are now settled, and the contract has been drafted:
> **`/app/memory/control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` (v1.0-RC1)**. Read that first — it
> supersedes every earlier brief, reply and board HTML where they conflict (clause C6).

**Owner statement, verbatim (2026-10-03): "i will answer these once contract is frozen."**

The owner has deferred all five open decisions until the CRM contract is frozen (i.e. CRM has
replied to `REPLY_TO_CRM_INV_022.md` and shipped/confirmed CR-093, CR-094, A9-b, Q-CA-6).
**Do not start Planning. Do not write code. Do not re-ask the five questions** unless the owner
says the contract is frozen or brings new information. Open with a short recap and ask what
changed since.

## 1. What happened in this session

INTAKE (Role 1) only. Owner asked for **every** remaining gap from INV-2026-09-15-003 + CRM reply
INV-022 to be registered. Five items filed with full INTAKE_DOCs. **Zero code changed.**
All line references were re-verified against the live `3oct` code before filing.

| ID | What | Severity / Risk | State |
|---|---|---|---|
| **CR-2026-10-03-001** | Delete the 14 dead CRM-table call sites in `server.py` | P3 / HIGH (hotspot file) | 📝 REGISTERED — **unblocked**, owner approved (O7) |
| **CR-2026-10-03-002** | **BUG/security** — `db.users` reads (L367, L587) pull CRM's `api_key`, `authkey_api_key`, `mygenie_token`; add 7-field projection | **P0** / CRITICAL (admin auth path) | 📝 REGISTERED — **unblocked**, owner approved. Carved out of CR-2026-09-15-004 §2 |
| **CR-2026-10-03-003** | **BUG/data-integrity** — feedback written into CRM's `feedback` collection in our schema; nobody can read it, diner still sees a success toast | P1 / CRITICAL | 📝 REGISTERED — blocked on CRM **A9-b** |
| **CR-2026-10-03-004** | Pre-login reads → CRM API (`/scan/auth/lookup`, `/scan/loyalty-rules/{rid}`, retire `customer-lookup` per F2=a) | P1 / CRITICAL (`LandingPage.jsx`, `ReviewOrder.jsx`) | 📝 REGISTERED — blocked on CRM **CR-093 + CR-094** |
| **CR-2026-10-03-005** | **BUG/customer-visible** — Call Waiter / Pay Bill buttons are silent no-ops for real diners | P2 / HIGH | 📝 REGISTERED — blocked on CRM **Q-CA-6** + POS **P1**; interim mitigation possible today |

Boundary scorecard when all five close: **20 direct CRM-table touches → 0.**

## 2. The five questions the owner has deferred

Ask these again **only once the contract is frozen**:

1. Planning order for the two unblocked items — CR-002 alone / CR-002 then CR-001 / both in one pass?
2. CR-001 — delete the dead routes outright, or quarantine with `CR-2026-10-03-001` markers first (the CR-2026-09-14-001 OTP pattern)?
3. CR-005 — interim behaviour today: hide the buttons / show "please ask at the counter" / leave the dead click?
4. Write `CR-2026-09-15-004/IMPACT_AND_NEW_FLOW.md` (F3) now with POS profile endpoint as TBD, or wait for POS P5?
5. Confirm "Pay Bill" = *request to settle at the table*, **not** an in-app payment (must be written into CR-005 before Planning so it cannot drift into a payments change).

## 3. What "contract frozen" requires — the waiting list

| Who | Owes us | Unblocks |
|---|---|---|
| **CRM** | Answer to **A9-b** (how to send/store feedback: token-only vs `{phone, restaurant_id}`; is `order_id` mandatory) | CR-2026-10-03-003 |
| **CRM** | Ship **CR-093** `POST /scan/auth/lookup` + **CR-094** `GET /scan/loyalty-rules/{rid}`, plus refreshed OpenAPI / contract v2.1 | CR-2026-10-03-004 |
| **CRM** | Answer to **Q-CA-6** (correct Call Waiter / Pay Bill paths, body, auth) | CR-2026-10-03-005 |
| **CRM** | Filled-in ownership board JSON (Q-CA-5) · GAP-11 live-host confirmation · CR-095 (remove its 4 config/dietary routes — already safe) | Signing `OWNERSHIP_MAP.md` |
| **POS** | **P5** admin profile endpoint + can `restaurants[]` have >1 · **P1** who consumes `pos_event_logs` · P4 phone format (low value, India-only) | CR-2026-09-15-004 (F3) · CR-2026-10-03-005 |
| **Owner** | Forward the two CRM docs (both APPROVED TO SEND since 2026-10-03) | everything above |

**Docs the owner still has to send** (unchanged, approved, not yet confirmed sent):
- `INV-2026-09-15-003-direct-crm-table-access-audit/REPLY_TO_CRM_INV_022.md` (v2, APPROVED)
- `INV-2026-09-15-002-shared-db-collection-ownership-map/CRM_BRIEF_OWNERSHIP_BOARD.md`
- `INV-2026-09-15-002-shared-db-collection-ownership-map/QUESTIONS_FOR_POS_2026-09-15.md` (**add P5** before sending)

## 4. Frozen decisions — do not reopen
F1 ✅ (we identify the diner; CRM defines storage) · **F2 = option (a)** blank/silent points preview
when no token, no retry, no message · F4 ✅ frozen yes (CRM removes its 4 routes now) ·
**O7 ✅ approved** (delete 14 dead sites) · O1 = A · O2 = A (dietary tags ours) · O3 resolved ·
O6 = via CRM API · OD-3 accepted · OD-7 we own `customer_app_config` writes · India-only rollout.
**F3 still PENDING** (POS-direct admin login — owner will approve only after reading the impact doc).

## 5. Do-not-repeat
- Don't re-ask the five questions in §2 before the contract is frozen — the owner has explicitly deferred them.
- Don't call POS-direct admin login "approved". F3 is pending.
- Don't edit `OWNERSHIP_MAP.md` early.
- Don't start Planning on CR-001/CR-002 just because they are technically unblocked — the owner tied *all* sequencing to the contract freeze.
- Don't fold CR-2026-10-03-002 back into CR-2026-09-15-004; it was carved out deliberately so a P0 security fix isn't gated on an unapproved architecture change.
- Don't touch CRM's existing `feedback` documents (repair/backfill is CRM's data task, not ours).
- Don't let CR-005 drift into a payments change (see §2 q5).

## 6. Code state
Unchanged. The only code ever written on this whole track is one route,
`GET /api/docs/ownership-board` in `server.py`. Frontend and backend running; nothing to QA.

---

## 7. UPDATE — same day, after CRM round 2 arrived

Owner uploaded two CRM artefacts. Round 1 (`..._ENDPOINT_VALIDATION.md`) is byte-identical to the
copy already on file. Round 2 is new → saved to
`change_requests/INV-2026-09-15-003-direct-crm-table-access-audit/crm_replies/INV_022_CRM_REPLY_TO_CUSTOMER_APP_ROUND2.md`.
Owner's instruction: *"let's move to contract freezing between two."*

### 7.1 New artefacts (all docs, no code)

| File | What it is |
|---|---|
| **`control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md`** | **THE deliverable.** v1.0-RC1, unsigned. Part 1 §1–§6 freezable now; Part 2 §7 = 9 blockers O-1..O-9; Part 3 §8–§9 change control + signatures. Clause **C6: this document beats every older brief/reply/board where they conflict.** |
| `INV-003/VALIDATION_OF_CRM_REPLY_ROUND2.md` | Row-by-row verdict: 4/4 accepted, 2 corrections to our own record, 1 new owner decision |
| `INV-003/REPLY_TO_CRM_ROUND2_AND_FREEZE.md` | Draft reply — answers CRM's B1/B2 with exact collection names, confirms A9-b, requests signature. **Awaiting owner sign-off.** |

### 7.2 What changed in the CR states

| CR | Change |
|---|---|
| **CR-2026-10-03-003** (feedback) | **A9-b DECIDED — hybrid.** Design frozen in contract §4c. Blocked only on CRM's additive CR number + ship date (O-8) |
| **CR-2026-10-03-005** (call waiter) | **Premise withdrawn.** CRM proved with `scan.py:845,863` that the paths, body `{table_id, message?}` and customer-token requirement were **correct all along** — the owner's "these endpoints are wrong" was mistaken. Real blocker = **nothing consumes `pos_event_logs`** (POS P1). CRM parked the direction question and handed it back to the owner (O-4) |
| CR-2026-10-03-001 / -002 | unchanged — still unblocked, still owner-gated |
| CR-2026-10-03-004 | unchanged — CRM has not shipped CR-093/094 (O-9) |

### 7.3 Do not repeat this mistake

We raised **Q-CA-6** to CRM asserting their endpoints were wrong, on the owner's say-so, **without
verifying against CRM's code or asking for evidence first**. CRM answered with file:line proof that
we were wrong. Cost: one round-trip and a question we did not need to ask. **Rule: when the owner
asserts a third-party fact, ask for the basis or verify before putting it in a brief** — the same
lesson as F2 ("don't state a limitation as fact without the why"), one layer out.

### 7.4 The six deferred owner questions now

§2's five, **plus one new one from CRM**:

6. **O-4 — Call Waiter / Pay Bill direction:** keep them in CRM as event producers with POS
   consuming, or move them to POS entirely? CRM parked it and handed it back.

And the single highest-value chase, which is not a decision but an email:
**O-1 — CRM's `INV_022_CRM_OWNERSHIP_BOARD_REPLY.md` never reached us.** Without that JSON
`OWNERSHIP_MAP.md` cannot be signed, which keeps CR-2026-09-12-006 (backend split), CR-010
(config defaults) and CR-014 (MySQL migration) blocked. Chase this before anything else.

### 7.5 Code state — still unchanged
One route, `GET /api/docs/ownership-board`. Nothing to QA. 20 direct CRM-table touches still live.

---

## 8. UPDATE 2 — CRM's ownership-board JSON arrived (O-1 closed)

Owner forwarded `INV_022_CRM_OWNERSHIP_BOARD_REPLY_resend.md`. Saved to
`INV-002/crm_reply/INV_022_CRM_OWNERSHIP_BOARD_REPLY.md`, with the JSON extracted to
`INV-002/crm_reply/crm_board_reply.json` so it can be pasted straight into the board's
"Import CRM JSON" control.

### 8.1 What it contains
All **39** collections (our 38 + `templates`, which CRM added), each with `crm` R/W value, proposed
owner, and a note carrying read/write op counts and file:line. Derived from a read-only scan of
CRM's codebase — better evidence than our side had for the 8 rows we assigned by elimination.
Split: **CRM 32 · Customer App 4 · Shared (POS-origin) 2 · POS 1**.

### 8.2 Reconciliation result — `INV-002/RECONCILIATION_CRM_BOARD_2026-10-03.md`
**36 of 39 rows agree.** Notably CRM concedes `customer_app_config` and `dietary_tags_mapping` as
**Customer App-owned** in writing (O1/O2 closed), and claims all 8 previously-unclaimed rows with
code evidence. **Our B1 and B2 questions are answered by the JSON itself** — the four collections
"missing on UAT" exist in CRM's code and were simply never written there.

### 8.3 Four things the next agent must carry
| # | Item | Needs |
|---|---|---|
| **D-1** | `pos_event_logs` — CRM assigns ownership to the **consumer** (POS); our contract rule assigns it to the **sole writer** (CRM: 3 writes, 0 reads). Cannot have both definitions in one document. Recommendation written: owner = CRM, consumer = POS (required), Customer App never, inert until POS consumes | **owner ruling** (bundle with O-4) |
| **D-2** | `orders`/`order_items` — CRM proposes "Shared (POS-origin)". Recommendation: owner = CRM annotated "originates in POS via webhook". **Do not accept the label "Shared"** — that is the exact status this investigation exists to remove, and it leaves neither team a veto on schema change. No G3 violation either way | **owner ruling** |
| **D-3** | `otp_tokens` — CRM's board says it exists (staff password-reset, `auth.py:608-751`); their round-1 **E3** said it does not, and we deleted the row on that basis. Row restored; one-line clarification requested. No impact on us | CRM, one line |
| **O-10** | **New risk.** CRM withdrew the B4 stable-interface promise on `users` because we withdrew the ask — but we read `users` on **every admin request** until step 3, which is gated on F3 + POS P5. A rename of any of the 6 fields breaks admin login silently. Asked for notice only | CRM |

### 8.4 State
Contract is now **v1.0-RC2** (`control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md`): §2 completed to 39 rows,
O-1/O-2/O-3 closed, D-1..D-3 + O-10 added. Reply updated:
`INV-003/REPLY_TO_CRM_ROUND2_AND_FREEZE.md` — still **awaiting owner sign-off before sending**.

**`OWNERSHIP_MAP.md` is still deliberately unedited.** The standing rule was "sign only after CRM
board JSON **and** POS P1/P4/P5". The CRM half is now in; POS is not, and D-1/D-2 need the owner.
**The freeze is no longer blocked by CRM — it is blocked by POS and by three owner rulings.**

### 8.5 Code state — still unchanged
One route, `GET /api/docs/ownership-board`. Nothing to QA. 20 direct CRM-table touches still live.

---

## 9. UPDATE 3 — owner rulings; contract v1.0-RC3; POS is now the only blocker

### 9.1 Rulings taken
| # | Ruling |
|---|---|
| **D-1** | `pos_event_logs` **owner = CRM** (sole writer; 3 writes, 0 reads), consumer = **POS required**, marked *inert until POS consumes*. CRM's consumer-ownership proposal declined to keep "owner = writer" consistent across all 39 rows |
| **D-2** | `orders` / `order_items` **owner = CRM**, annotated *"data originates in POS via webhook"*. "Shared" label rejected |
| **O-4** | Call Waiter / Pay Bill direction → **referred to POS** (new **P6**) |
| **Pay Bill definition** | → **referred to POS** (new **P7**); reserved meanwhile as contract clause **§3 I6** — a request to settle at the table, **never** an in-app payment |
| Interim mitigation | Owner: "already hidden by configuration" — **verified, see 9.3** |

**All 39 ownership rows now have an owner. Part 1 of the contract is ready for signature.**
Contract is at **v1.0-RC3**. Only CRM item left is **D-3** (one-line `otp_tokens` clarification,
zero impact on us) and **O-10** (change notice on the 6 `users` fields).

### 9.2 POS brief extended — `INV-002/QUESTIONS_FOR_POS_2026-09-15.md`
| # | Question | Why it matters |
|---|---|---|
| **P1-refined** | Does anything in POS **read** `pos_event_logs`? CRM is write-only with **0 reads** — so if POS doesn't read it, **nothing in the system does** and every Call Waiter / Pay Bill event ever written went nowhere | gating for CR-2026-10-03-005 |
| **P5** | Admin profile endpoint path + can `restaurants[]` hold >1? | gating for CR-2026-09-15-004 (F3) — the last direct CRM-table read |
| **P6** | Keep the two actions in CRM with POS consuming, or move to POS? **And how does a waiter actually find out** — screen, sound, ticket? | that notification path is the real acceptance criterion, not the API call |
| **P7** | Confirm "Pay Bill" = request to settle at table, not in-app payment | scope/approval risk; payments are CRITICAL under the operating prompt Part C |

P2 and P3 marked **CLOSED by CRM**; P4 **parked** (India-only).

### 9.3 The "already hidden" claim — measured, and one exception found
Verified against the live shared DB and code rather than taken on trust:

- Frontend `RestaurantConfigContext.jsx:37-40` defaults all four flags **false**, merged as
  `{...DEFAULT_CONFIG, ...apiData}` (L253). Backend `server.py:1071-1074` also returns **false**
  when a restaurant has no config doc. So missing keys are safe — despite `isOn()` (L423) being
  `!== false`, i.e. default-**true**, which would otherwise have shown them.
- **Live data, 13 config docs:** `showCallWaiter` 0 true · `showPayBill` 0 true ·
  `showLandingCallWaiter` 0 true · **`showLandingPayBill` → 1 true: restaurant `672`.**
- **So restaurant 672 is showing a dead Pay Bill button today.** 12 of 13 tenants are genuinely hidden.
- **Sub-finding:** `showLandingCallWaiter` / `showLandingPayBill` have **no admin toggle** —
  `VisibilityTab.jsx:113-114` and `AdminVisibilityPage.jsx:89-90` expose only the non-Landing pair.
  672's flag therefore **cannot be cleared from the admin UI**; it needs a config API write. Can be
  split into its own small CR if the owner wants.

Probe script kept at `/app/memory/tools/probe_config_flags.py` (read-only).

### 9.4 Lesson for the next agent
Two owner statements this session turned out to need verification — "the CRM endpoints are wrong"
(they were correct) and "the buttons are already hidden" (true for 12 of 13). Neither was
carelessness; both were reasonable beliefs about a system with 13 tenants and two near-identical
flag pairs. **Rule: verify owner-stated facts against code or data before writing them into a
contract or a brief — and report the exception without softening it.**

### 9.5 Code state — still unchanged
One route, `GET /api/docs/ownership-board`. Nothing to QA. 20 direct CRM-table touches still live.

---

## 10. UPDATE 4 — doc-hygiene sweep (answer to "is everything on our side updated?")

Audited the whole track for staleness. **Five artefacts were out of date; all fixed.** Nothing else
on our side is pending a doc update.

| File | Was stale because | Now |
|---|---|---|
| `INV-002/OWNERSHIP_BOARD.html` | `pos_event_logs` note still said the Call Waiter endpoints were INCORRECT · `customer_otps` note still said "otp_tokens does not exist" · no `otp_tokens` or `templates` row · O5 still an Owner decision · B1 uncorrected | Owner ruling recorded on the row · `otp_tokens` **restored** + `templates` **added** · O5 reassigned to POS with the 12-of-13 exposure · B1 annotated with the E3 contradiction · banner added pointing at `crm_reply/crm_board_reply.json` and stating the contract wins (C6) · header line refreshed. **Verified live** at `/api/docs/ownership-board` |
| `INV-002/OWNERSHIP_MAP.md` | said "3 CRM answers pending (Q2/Q4/Q5)" — CRM has answered everything | status corrected; **rows deliberately untouched** per the standing rule; explicit pointer that contract §2 is authoritative and gets signed only after POS replies |
| `INV-003/REPLY_TO_CRM_INV_022.md` | still "APPROVED — READY TO SEND"; it has been sent *and* answered | marked **SENT / ANSWERED / SUPERSEDED** + the Q-CA-6 correction stated inline so nobody re-reads the wrong premise |
| `INV-002/CRM_BRIEF_OWNERSHIP_BOARD.md` | still "approved to send" | marked **SENT and ANSWERED — do not resend**, with pointers to the reply + reconciliation |
| `INV-003/CRM_BRIEF_ENDPOINT_VALIDATION.md` | undated status; fully answered across both rounds | marked **SENT and FULLY ANSWERED / SUPERSEDED**; contract §4 is authoritative |

### 10.1 The outbound set is now exactly 3 files
| To | File |
|---|---|
| CRM | `control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` (the thing to sign) |
| CRM | `INV-003/REPLY_TO_CRM_ROUND2_AND_FREEZE.md` (covering letter; chat version in `MESSAGE_TO_CRM_AGENT_2026-10-03.md`) |
| POS | `INV-002/QUESTIONS_FOR_POS_2026-09-15.md` (read the 2026-10-03 addendum — P1-refined, P5, P6, P7) |

Everything else is an audit trail and is now explicitly marked do-not-send.

### 10.2 Known doc debt, deliberately left
- `OWNERSHIP_MAP.md` rows are still the pre-CRM-reply draft **by design** — it is rewritten and
  signed only once POS answers. Contract §2 carries the current truth in the meantime.
- The board's CRM column is still our *interpretation* for most rows; CRM's authoritative values
  are in `crm_reply/crm_board_reply.json` and get applied by the board's "Import CRM JSON" control
  (a runtime action, not a file edit).
- Board decision state (O1–O5, F1–F4) lives in browser localStorage, not in the file — so the
  "0/23 frozen" counter is per-browser and not a record of what has actually been decided. The
  decisions of record are in the contract and in `OWNER_RESPONSES_F1-F4_2026-09-28.md`.

---

## 11. UPDATE 5 — CRM SIGNED Part 1. Awaiting owner countersignature.

`INV-003/crm_replies/CONTRACT_v1.0_CRM_SIGNOFF.md` · validated in
`INV-003/VALIDATION_OF_CRM_SIGNOFF_2026-10-03.md` → **ACCEPT. No conflicts. No conditional clauses.**

### 11.1 What the signature gives us
- CRM validated §1–§6 against their own code and **signed Part 1**.
- They **concur** with the owner's D-1/D-2 rulings → those three rows are now *mutually agreed*,
  not unilaterally ruled. (They raised their disagreement-then-concurrence **before** signature,
  which is exactly what we asked for.)
- **D-3, O-8, O-10 closed** — see 11.2.
- **CRM has no open items left.** One owner countersignature → **Part 1 = v1.0 FROZEN**. Nothing in
  Part 1 needs editing first.

### 11.2 Closures
| # | Resolution |
|---|---|
| **D-3** | Round-1 E3 ("otp_tokens does not exist") was scoped to the **customer** OTP store (`customer_otps`, `scan.py:193-287`). `otp_tokens` is a separate **staff** password-reset store (`auth.py:608-751`) and does exist. Our restored row is correct as filed |
| **O-8** | Feedback CR = **CR-096**, step-1 wave; firm date at CRM's PLANNING gate (not open yet). `restaurant_id` = **short form `"689"`** |
| **O-10** | ✅ **CRM agreed to advance notice** before renaming/dropping any of the six `users` fields until §6 step 3 completes. This was the likeliest silent-outage risk on the whole track |

### 11.3 Two things validation caught — both matter for CR-2026-10-03-004
1. **CRM's per-tier warning is already satisfied.** They flagged that `loyalty_settings` has four
   tier earn percentages, not one. Our code has always been per-tier
   (`LoyaltyRewardsSection.jsx:29` → `${tier}_earn_percent` with a bronze fallback) and
   `server.py:1505-1520` already returns all four. Field-for-field match → **CR-094 is a URL swap,
   no adapter.**
2. **`exists` → `found` is mandatory.** CR-093 returns `{exists, name}`; our retiring
   `/api/customer-lookup` returns `found`, and `found` drives
   `isNewCustomer = lookedUpCustomer && !lookedUpCustomer.found`
   (`LoyaltyRewardsSection.jsx:36`) → the **first-visit-bonus line**. Miss the mapping and
   `!undefined === true` shows the bonus to **every diner**. Owner decision F2=(a) covered losing
   the points/tier preview; it never covered the bonus line — **and the bonus line does not have to
   be lost.** Recorded as CR-2026-10-03-004 §1a + acceptance criterion 7.

### 11.4 What is left, in full
| Owed by | Items |
|---|---|
| **Owner** | **countersign Part 1** · F3 (approve POS-direct admin login, needs `CR-2026-09-15-004/IMPACT_AND_NEW_FLOW.md` written) · O-7 (confirm live-host `JWT_SECRET`) · clear `showLandingPayBill` on restaurant **672** |
| **POS** | P1-refined · P5 · P6 · P7 — brief ready at `INV-002/QUESTIONS_FOR_POS_2026-09-15.md` |
| **CRM** | nothing. CR-093/094/096 are queued behind their PLANNING gate (O-9) — no dates yet |

### 11.5 Code state — still unchanged
One route, `GET /api/docs/ownership-board`. Nothing to QA. 20 direct CRM-table touches still live.
The two unblocked CRs (CR-2026-10-03-001 cleanup, CR-2026-10-03-002 P0 projection) remain
owner-gated and can start the moment the owner says go.

---

## 12. UPDATE 6 — CONTRACT v1.0 PART 1 FROZEN · owner says STAY IN INTAKE

### 12.1 Frozen
Owner countersigned on 2026-10-03. `control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` is now
**v1.0 — Part 1 §1–§6 FROZEN**, signed by **MyGenie CRM** and **Abhi-mygenie**.

- §1–§6 change **only** under §8: written agreement from both teams + version bump (+ refreshed
  OpenAPI/contract diff for endpoint changes). Silence is not consent (C5). The contract beats every
  older brief, reply and the ownership board on conflict (**C6**).
- **§7 is NOT frozen** and nothing in it reopens Part 1. Owed by **POS** (P1-refined, P5, P6, P7)
  and the **owner** (F3, O-7), plus **O-9** (CRM's CR-093/094/096 behind their PLANNING gate).
- **POS is not a Part-1 signatory** — it signs only G3 plus its three §7 items. A POS reply does
  **not** require re-signing Part 1.

### 12.2 ⚠️ Owner instruction: STAY IN INTAKE ROLE
Asked whether to start the two unblocked CRs and whether to write the F3 impact doc, the owner
answered **"stay in intake role"** to both.

**So, explicitly, for the next agent:**
- **Do NOT write code.** CR-2026-10-03-001 (14 dead routes) and CR-2026-10-03-002 (P0 `users`
  projection) are technically unblocked and owner-approved in scope, but **implementation has not
  been authorised**. They stay 📝 REGISTERED.
- **Do NOT write Planning artefacts** — that includes `CR-2026-09-15-004/IMPACT_AND_NEW_FLOW.md`
  (the F3 doc). Planning is Role 2; the owner has kept us in Role 1.
- Intake work that *is* in scope: registering new items, validating incoming CRM/POS replies,
  keeping the registry/contract/board in sync, and read-only evidence gathering.

### 12.3 Restaurant 672 — identified, awaiting owner decision
Owner asked what 672 is before deciding on the stray flag. Probed read-only
(`memory/tools/probe_restaurant_672.py`):

| | |
|---|---|
| Name | **Krunch N Grill** (tagline "mahendra") |
| Config last updated | 2026-08-14 |
| `restaurantOpen` | **true** · `allowNonQrOrders`: true |
| Orders | **24** — 11 `dinein`, 9 `pos`, 3 `delivery`, 1 `take_away`; latest **2026-09-18** |
| Customers | 17 · loyalty_settings present |
| The flag | `showLandingPayBill: true` (the only tenant of 13 with any of the four flags on) |

**Verdict: a live tenant with real dine-in traffic, not a sandbox.** Real diners there can press a
Pay Bill button that does nothing. **No change made** — the owner decides. Note it cannot be
cleared from the admin UI (CR-2026-10-03-005 §1b).

### 12.4 Correction to something I told the owner
I said "the two documents have gone to POS" — **wrong, there is only ONE POS document**:
`INV-002/QUESTIONS_FOR_POS_2026-09-15.md` (read its 2026-10-03 addendum). The *two* documents were
the CRM pair (contract + round-2 reply), and CRM has since replied and signed, so that pair is done.
**Outbound now: 1 file, to POS.**

### 12.5 Code state — unchanged
One route, `GET /api/docs/ownership-board`. Nothing to QA. 20 direct CRM-table touches still live.

---

## 13. UPDATE 7 — CORRECTION on restaurant 672 (owner was right)

**Owner challenge:** *"why this button will come only in 672, we are on preview this is all UAT data"*

### 13.1 I was wrong — claim withdrawn
I described 672 as "a live tenant with real dine-in traffic". The probe ran against the **shared
UAT** DB (`MONGO_URL` → `52.66.232.149/mygenie` — remote, and the very shared instance this
investigation is about, **not** a pod-local copy). The 24 orders and 17 customers are **UAT rows**.
I inferred production liveness from UAT data and stated it as fact. Corrected in
CR-2026-10-03-005 §1b with the correction kept visible rather than silently edited out.

### 13.2 What the evidence actually supports
| Claim | Status |
|---|---|
| On the shared UAT DB, 672 is the only one of 13 tenants with any of the four flags on | ✅ evidenced |
| The code behaviour is environment-independent — any tenant anywhere with `showLandingPayBill: true` renders a dead button | ✅ evidenced (`LandingPage.jsx:865-866`) |
| Any **production** tenant has it on | ❓ **unknown, not checkable from here** — no production DB access. Owner question only |
| 672 has real diners | ❌ **withdrawn** |

### 13.3 Why only 672 — and why it is sticky
- The key is present in **all 13** docs with explicit values (12 `false`, 672 `true`, written 2026-08-14).
- Nothing in code singles out 672; the flag is read generically.
- **No admin screen can set or clear it** (`VisibilityTab.jsx:113-114`, `AdminVisibilityPage.jsx:89-90`
  expose only the non-Landing pair).
- **`AdminConfigContext.saveConfig` (`:226-241`) PUTs the whole ~106-key config object** on every
  admin save — not just edited fields. So an orphan key already `true` in state gets re-persisted
  forever, invisibly. That is why it will never self-heal.
- `customer_app_config` has **no audit trail** → who set it cannot be determined from the data.

### 13.4 New generalised finding — candidate for its own small CR
**Config keys that no admin screen controls are still round-tripped on every save**, so orphan flags
persist silently and cannot be cleared through the product. `showLandingCallWaiter` and
`showLandingPayBill` are the two known instances. A sweep of the 106-key config model against the
admin UI would reveal any others. Not registered yet — owner is keeping us in INTAKE and has not
asked for it; raise it when the 672 decision is taken.

### 13.5 Lesson (third of this session, same shape)
Three times now a confident statement needed walking back: "CRM's endpoints are wrong" (they were
right), "the buttons are already hidden" (true for 12 of 13), and now "672 is a live tenant"
(UAT data). The first two were the owner's assertions that I should have verified; **this one was
mine.** Rule, restated: **state what the evidence shows and name the environment it came from.**
"24 orders in the shared UAT DB" and "24 real diners" are not the same sentence.

---

## 14. UPDATE 8 — CORRECTION 2 (POS does not use the shared DB) + PARK

**Owner:** *"this db is not used by pos correction again, park this for later, and suggest what shd be next steps"*

### 14.1 The correction
The shared `mygenie` DB is **Customer App + CRM only**. **POS never touches it** — it integrates
purely through CRM's API and webhooks. I had said "shared by CRM and POS": wrong, and it
contradicted **G3** of the contract we had *just frozen*, where the correct answer was already
written down. The claim existed only in chat, not in any artefact (grepped to confirm).

### 14.2 Why this matters more than a wording fix
§2d annotates `pos_event_logs` as *"consumer = POS, required"* — which assumed POS could **read**
the collection. If POS never touches the DB:

- **POS P1-refined effectively answers itself**: POS cannot be reading `pos_event_logs`.
- **POS P6 has only two live options**: *(a)* actions stay in CRM and **CRM pushes** each event to a
  POS endpoint, or *(b)* actions **move to POS** and we call POS directly.
- **"POS reads the collection" is off the table.**
- Ownership is unaffected — CRM is still the sole writer, §2d stands.

Recorded as contract **O-12** in the **live §7**, *not* by editing frozen §1–§6 — correct discipline:
§7 is where reality lands; §1–§6 only moves under §8 change control. POS brief updated with the
framing **and an explicit invitation to contradict it**: if POS does read the shared DB somewhere,
that is a bigger finding than the feature itself, because it breaks a signed ground rule.

### 14.3 PARKED (owner instruction) — do not action these
| Item | State |
|---|---|
| Restaurant **672** `showLandingPayBill` | **PARKED.** No config write made. Analysis kept in CR-2026-10-03-005 §1b |
| **Orphan-config-key sweep** — keys with no admin control are still round-tripped on every save (`AdminConfigContext.saveConfig:226-241` PUTs all ~106 keys), so orphan flags persist invisibly and cannot be cleared through the product | **PARKED.** Not registered as a CR. Two known instances: `showLandingCallWaiter`, `showLandingPayBill` |

### 14.4 Running correction count — read this before asserting anything
Four walked-back claims this session: "CRM's endpoints are wrong" (owner's, they were right),
"buttons already hidden" (owner's, true for 12 of 13), "672 is a live tenant" (mine, UAT data),
"the shared DB is used by POS" (mine, contradicted our own G3).

**Two of the four were mine, and both were avoidable by reading what we had already written down.**
Before stating a cross-system fact: check the frozen contract first — §1–§6 is now the authority on
who touches what. If it is not in there, say "unknown" and name the environment the evidence came
from.

---

## 15. UPDATE 9 — POS replied. `pos_event_logs` has no consumer; franchises widen the admin-login CR.

Validated in `INV-002/VALIDATION_OF_POS_REPLY_2026-10-03.md`.

| # | POS answer | Outcome |
|---|---|---|
| **P1** | **"no, (b)"** — POS does not read `pos_event_logs` | ✅ decisive. CRM write-only + POS not reading + us never touching = **nobody reads it estate-wide**. Triggers amendment **A-1** |
| **P2** | park, will get back | 🅿️ direction deferred |
| **P3** | "feature is not live", park | 🅿️ Pay-Bill semantics deferred; contract **§3 I6** stands as the reserved definition |
| **P4.1** | "ok" | ❌ **not an answer** — acknowledged the question. Exact path + response shape still needed → **O-14** |
| **P4.2** | "yes — for franchise; will check response shape" | ⚠️ **new fact, widens CR-2026-09-15-004** → **O-13** |
| **P4.3** | "walk me through" | 📖 explained in the validation doc §4; awaiting their answer |

### 15.1 🔴 A-1 — the first change-control event. Do not shortcut this.
Frozen **§2d** says `pos_event_logs` *"consumer = POS — required"*. POS's answer makes that
**factually wrong**. **It has NOT been edited.** §2 is inside frozen Part 1, so under **§8 C1** the
change needs **written agreement from CRM + a version bump to v1.1**. Proposed text is in the
contract's §7 row A-1. Ownership is unchanged (CRM remains sole writer); only the consumer
annotation moves.

This matters as precedent: the contract's value is that a signed line cannot be quietly corrected.
**Raise A-1 with CRM; do not edit §2d until they agree.**

### 15.2 CR-2026-10-03-005 → PARKED (with evidence)
Reframed from "buttons not yet wired" to **"buttons that cannot work in the current
architecture"** — wiring them to CRM's correct endpoints would still reach nobody. POS parked both
P2 and P3. The parked **restaurant 672** flag remains worth deciding independently: a dead button is
dead regardless of who eventually owns the design.

### 15.3 CR-2026-09-15-004 → scope widened by franchises
Our login returns **one** `restaurant_id` (`server.py:587-626`, token from `user["id"]` at `:613`);
CRM silently takes `restaurants[0]`; `customer_app_config` is keyed **per restaurant**. A franchise
admin with 3 outlets silently lands on whichever is first. The CR now needs an **outlet picker**, a
**selected-outlet** concept threaded through config save / QR / visibility, and a persistence
decision. **Do not plan this CR on the single-outlet assumption.**

### 15.4 Still owed by POS
**O-14** exact profile endpoint path + response shape · **O-13** multi-entry shape (just
`{id,name}`? primary/head-office flag? inactive entries?) · **P4.3** rate limit, token lifetime,
refresh endpoint.

### 15.5 Why P4.3 actually matters (for whoever has to chase it)
`server.py:609` calls POS `vendoremployee/login` on **every** admin login via
`refresh_pos_token`, and hands the token to the browser for `localStorage` (read back as
`X-POS-Token`, `server.py:896-903`). It is **not** stored server-side, so there is **no cache and no
refresh path other than re-sending the password**. After CR-2026-09-15-004, POS becomes the only
identity path. Therefore: a per-IP rate limit would appear as random admin login failures (all our
traffic leaves one server IP), and a short token lifetime would appear as silent mid-session QR
failures. Neither is a problem today; both become outages once POS is the sole identity provider.

---

## 16. UPDATE 10 — owner decisions on the POS reply

| # | Decision |
|---|---|
| **A-1** | **Draft it** → `control/AMENDMENT_A-1_pos_event_logs_consumer.md`, **awaiting owner sign-off before sending**. Frozen §2d still **not** edited — correct under §8 C1 |
| **POS follow-up** | **Do not chase.** They said they would come back on O-13 (multi-entry shape), O-14 (profile path + shape) and P4.3 |
| **Franchise** | **Separate CR** → **CR-2026-10-03-006** registered. CR-2026-09-15-004 stays single-outlet |
| **Call Waiter** | "not live" = **not built yet, not cancelled** → CR-2026-10-03-005 **parked, not withdrawn**. Leave the buttons, flags and CRM endpoints in place |
| **Role** | **STAY IN INTAKE.** Still no code, still no Planning artefacts |

### 16.1 CR-2026-10-03-006 — franchise multi-outlet admin (new)
P2 / CRITICAL area / **LARGE** blast radius. Blocked on POS **O-13**; must land **after**
CR-2026-09-15-004.

Two things the next agent must not miss:
- **The danger point:** `AdminConfigContext.saveConfig` (`:226-241`) PUTs the **entire ~106-key
  config object**. A stale selected-outlet value would therefore overwrite one outlet's whole
  config with another's. That is the riskiest line in the CR.
- **It is a latent bug, not a new one.** `users` already carries one `restaurant_id` per row, so
  franchise admins have always landed on a single arbitrary outlet. POS-direct login does not cause
  it; it just makes multi-outlet visible for the first time. Do not describe it as a regression
  from CR-004.

### 16.2 The guard that keeps the split safe
CR-2026-09-15-004 ships taking `restaurants[0]` — **identical to our current behaviour and CRM's,
so no regression**. Two conditions were attached so the interim cannot quietly become permanent:
1. `restaurants[0]` is recorded **in code** as a deliberate placeholder naming CR-2026-10-03-006.
2. **New acceptance criterion:** the backend **logs a warning naming the outlets it is ignoring**
   when `restaurants[]` has more than one entry. A franchise admin editing the wrong outlet is
   otherwise completely silent — and this is also how we find out whether any real franchise admin
   exists today, which nobody currently knows.

### 16.3 Registry state — 6 CRs on this track
| CR | State |
|---|---|
| CR-2026-10-03-001 (14 dead routes) | 📝 unblocked, **owner-gated** (intake) |
| CR-2026-10-03-002 (P0 `users` projection) | 📝 unblocked, **owner-gated** (intake) |
| CR-2026-10-03-003 (feedback → CR-096) | 📝 blocked on CRM shipping CR-096 |
| CR-2026-10-03-004 (pre-login → CRM API) | 📝 blocked on CRM CR-093/094 |
| CR-2026-10-03-005 (Call Waiter / Pay Bill) | 🅿️ **PARKED — not withdrawn** |
| **CR-2026-10-03-006 (franchise)** | 📝 **NEW** — blocked on POS O-13, after CR-004 |
Plus CR-2026-09-15-001 (profile v2, ready to plan) and -004 (admin login, blocked on O-14 + F3).

---

## 17. UPDATE 11 — POS login curl validated (A-1 signed off, O-7 half closed, see §16 and below)

### 17.1 A-1 and O-7 (same turn, before the curl)
- **A-1 APPROVED by owner and ready to send** → `control/AMENDMENT_A-1_MESSAGE_TO_CRM.md` (chat
  version) + `control/AMENDMENT_A-1_pos_event_logs_consumer.md` (formal). Frozen §2d still not
  edited; publish **v1.1** on CRM's "agreed", no Part-1 re-signature.
- **O-7: our half VERIFIED AND CLOSED** → `INV-003/O-7_GAP-11_LIVE_HOST_CHECK.md`. `JWT_SECRET` env-only
  with **no fallback** and the app refuses to boot without it (`server.py:47-49`), HS256 pinned,
  single encode/decode path, 63-char non-placeholder secret. **CRM's live host is NOT verifiable
  from this codebase** — owner has a 3-step check; the decisive one compares SHA-256 hashes of the
  two secrets, which closes it permanently with no secret exchanged. Residual risk: **low but
  unmeasured**. Also recorded: our cross-service isolation works by **accident** of payload shape,
  not design — optional 2-line `iss` hardening noted, deliberately not registered.

### 17.2 The POS login curl — three outcomes
Owner supplied a curl for `/auth/vendoremployee/common-login`. Our code calls
`/auth/vendoremployee/login`. **Both tested, both 200.**

| Outcome | Detail |
|---|---|
| ✅ **No live bug** | Our path still works, so `refresh_pos_token` is fine and admin QR is not broken. This was the first thing to check — a rename would have been a silent outage |
| ❌ **O-14 still open** | **Neither response contains `restaurants[]`, a restaurant id, or a name.** Keys are `token`, `crm_token`, `firebase_token`, `first_login`, role/permission fields, `zone_wise_topic`. The profile call is separate and its path is still unknown → **CR-2026-09-15-004 still cannot be planned**. ⚠️ `zone_wise_topic: "zone_5_restaurant"` is a messaging topic — **do not** parse a restaurant id out of it |
| 🔴 **O-16 (new, security)** | Both logins return an **identical static** `crm_token` prefixed **`dp_live_`** from a **preprod** host. Static ⇒ a stored per-restaurant API key, not a session token — almost certainly the `api_key` in CRM's `users` row, i.e. **the exact secret class CR-2026-10-03-002 projects away**. Either the prefix is misleading, or preprod issues **production** CRM credentials. Owner to ask POS/CRM; **if live, treat as exposed and rotate** (pasted in chat + returned in test responses). **Value not written to any memory doc** |

**O-15 (new):** which POS login path is canonical? `/common-login` is the richer variant
(`permissions[]` + `login_type`). Ask whether `/login` is deprecated so we migrate deliberately
rather than through a failing QR flow. **No code change needed today** — `refresh_pos_token` reads
only `data["token"]`, which both return.

### 17.3 Credentials
POS preprod account recorded in `memory/test_credentials.md` with three warnings: third-party (can
be revoked without notice), neither login response carries restaurant data, and it is **distinct
from** the `MYGENIE_POS_LOGIN_PHONE`/`PASSWORD` service account already in `backend/.env`.
**Two POS identities are in play — do not conflate them when planning CR-2026-09-15-004.**

### 17.4 Hygiene
Temp response files under `/tmp` deleted after inspection so the `dp_live_` value is not left on
disk. Probe scripts kept (read-only) at `memory/tools/`.

---

## 18. UPDATE 12 — O-16 escalated to a security investigation; full register below

### 18.1 INV-2026-10-03-001 registered (SECURITY)
Owner instruction: flag O-16 as a security issue, handle as a **separate investigation**, and file a
**brief to DevOps** about UAT dumps carrying customer data and tokens.

`INV-2026-10-03-001-uat-secrets-and-pii-exposure/` — **P1 SECURITY · owning team DevOps/Ops**
(+ CRM, POS). Two findings: the static `dp_live_`-prefixed CRM credential issued by preprod, and
real customer PII in the shared UAT DB including **114 `customer_documents`**.

**Filed as an INVESTIGATION, not a CR, on purpose:** nothing in this repo causes it and no change
here fixes it. Filing it as a code CR would bury it in a queue nobody who can fix it reads.
Deliverable `BRIEF_FOR_DEVOPS_UAT_DATA_HYGIENE.md` (draft, needs owner sign-off), 9 questions split
by team; **Q9 pairs with contract O-7**.

Contract **O-16 marked ESCALATED** and closed out of §7 — environment/data practice is outside the
Customer App ↔ CRM interface contract.

**Hygiene:** secret value never written to any doc, `/tmp` responses deleted, no production access,
no DB writes, `customer_documents` counted but never opened. Keep it that way.

### 18.2 THE REGISTER — every gap, and where it is tracked
Nine items carry an ID. Everything else is a contract §7 item or explicitly parked.

| ID | What | Type | Pri | State |
|---|---|---|---|---|
| CR-2026-10-03-001 | delete 14 dead CRM-table call sites | CR cleanup | P3 | unblocked, **owner-gated** |
| CR-2026-10-03-002 | `users` 6-field projection | **BUG security** | **P0** | unblocked, **owner-gated** |
| CR-2026-10-03-003 | feedback wrong schema → `POST /scan/feedback` | **BUG data** | P1 | blocked: CRM **CR-096** |
| CR-2026-10-03-004 | pre-login reads → CRM API | CR | P1 | blocked: CRM **CR-093/094** |
| CR-2026-10-03-005 | Call Waiter / Pay Bill no-op | **BUG UX** | P2 | 🅿️ **PARKED** (not withdrawn) |
| CR-2026-10-03-006 | franchise multi-outlet admin | CR feature | P2 | blocked: POS **O-13** |
| **INV-2026-10-03-001** | UAT secrets + PII | **INV security** | **P1** | 🔍 brief ready |
| CR-2026-09-15-001 | profile v2 adapter | CR | P1 | ready to plan |
| CR-2026-09-15-004 | admin login off CRM `users` | CR | P1 | blocked: **O-14** + F3 |
| CR-2026-09-15-002 / -003 | skip-otp dead branch / canonical phone | CR | P2/P4 | 🅿️ parked |

### 18.3 Known, deliberately NOT registered — say so if asked
| Item | Why not |
|---|---|
| Restaurant **672** stray `showLandingPayBill` | owner **parked**; lives in CR-2026-10-03-005 §1b as a config fix, not a CR |
| **Orphan config keys** round-tripped on every save (`AdminConfigContext.saveConfig` PUTs all ~106 keys, so keys with no admin UI persist invisibly) | owner **parked**; analysis in CR-2026-10-03-005 §1b. **Would be a legitimate small CR if revived** |
| Optional `iss` claim on our JWTs | owner hasn't asked; risk low; `users` dependency disappears at §6 step 3. Noted in `INV-003/O-7_GAP-11_LIVE_HOST_CHECK.md` §2a |
| Shared phone normaliser in front of `crmService` | belongs to parked CR-2026-09-15-003 / CR-2026-09-12-009 |
| POS `/login` vs `/common-login` migration | contract **O-15** — no CR needed unless POS says `/login` is deprecated |

### 18.4 Contract §7 ledger — 8 closed, 8 open
**Closed:** O-1, O-2, O-3 (CRM board JSON) · D-1, D-2 (owner rulings, CRM concurs) · D-3, O-8, O-10
(CRM sign-off) · O-12 (POS confirmed) · O-16 (escalated to INV).
**Open:** **A-1** (amendment, approved — awaiting send) · **O-4** (POS direction) · **O-5/O-14**
(POS profile path + shape) · **O-6/F3** (owner approval) · **O-7** (owner: live-host hash check) ·
**O-9** (CRM CR-093/094/096, planning gate shut) · **O-11** (Pay Bill semantics, POS) ·
**O-13** (POS franchise shape) · **O-15** (canonical login path).

### 18.5 Code state — still unchanged, still INTAKE
One route, `GET /api/docs/ownership-board`. **20 direct CRM-table touches still live.** No code has
been written on this entire track. Nothing to QA, nothing for the testing agent.

---

## 19. SESSION CLOSED 2026-10-03 — handover is to the PLANNING agent

Owner closed the **session**, not the items. Confirmed: *"Yes — close the session, items stay open
at intake."*

### 19.1 ➡️ The next agent must read `/app/memory/HANDOVER_TO_PLANNING_2026-10-03.md`
That is now the primary entry point, not this file. Owner instruction, verbatim:

> *"write a handover for planning agent, who will present this complete intake batch and ask me for
> impact analysis, we will decide priority there for CRs"*

So Planning's first action is **not** to plan: present the batch → ask the owner which items go to
Impact Analysis → **agree priority with the owner there.** Intake deliberately set severity and risk
but **no execution priority** — the owner reserved that.

### 19.2 Owner decisions at close
| Decision | Outcome |
|---|---|
| Close scope | **Session only.** All 14 items stay at gate 1 of 13 |
| CR-2026-10-03-002 (P0, 2 lines) | **Leave registered.** Owner declined to ship it — offered twice. Every admin request still loads CRM's live-prefixed `api_key` into our process memory |
| CRM | Amendment **A-1 sent** — *"crm its given to them we can proceed our work."* Publish **v1.1** on their "agreed"; **do not edit frozen §2d before then** |
| POS | Owner has **replied** to POS. Still owed by POS: **O-14** (profile path + shape — the blocker on CR-2026-09-15-004), **O-13** (franchise shape), **O-15** (canonical login path). O-4/O-11 are parked by POS, not outstanding |
| DevOps brief | **State unconfirmed** — assume **not sent**. Planning should ask |
| Offline context | Owner skipped — defaults assumed |

### 19.3 Registry audit result (the last intake act)
**14/14 compliant.** Three gaps found and backfilled, each annotated as audit-added:
- **CR-2026-09-15-004** had **no risk label at all** — a §5 violation on an item about to be planned.
  Now **CRITICAL** (security + auth + production data). Also had no output block.
- **INV-2026-09-15-003** — the audit that spawned five CRs — had no classification block. Now
  P1 / CRITICAL / LARGE.
- **INV-2026-10-03-001** was missing its duplicate check. **My own omission, same day.**

### 19.4 State at close
Contract **v1.0 Part 1 FROZEN** (CRM + owner signatures) · 39 ownership rows settled · §7 at
10 closed / 8 open · amendment A-1 in flight · **20 direct CRM-table touches still live** ·
**zero lines of code written** · nothing tested, because nothing was built.

### 19.5 Role discipline held
Role 1 — INTAKE — for the entire session. The owner declined to release the role twice, so no code
and no Planning artefacts were produced. `CR-2026-09-15-004/IMPACT_AND_NEW_FLOW.md` remains
unwritten and is flagged as Planning's first overdue deliverable (F3 gates the admin-login thread).
