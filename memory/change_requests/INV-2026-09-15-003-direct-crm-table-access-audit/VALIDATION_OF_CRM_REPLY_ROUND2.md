# Validation of CRM reply ROUND 2 against Customer App code
## Ref: INV-2026-09-15-003 · Reply file: `crm_replies/INV_022_CRM_REPLY_TO_CUSTOMER_APP_ROUND2.md`
## Received: 2026-10-03 · Verdict: **ACCEPT all 4 answers. 2 corrections to our own record. 1 new owner decision needed.**

Method: each CRM answer checked against `server.py`, `crmService.js`, `LandingPage.jsx`,
`ReviewOrder.jsx`, `FeedbackPage.jsx`, `OrderSuccess.jsx`, `useScannedTable.js` on branch `3oct`.

---

## 1. Row-by-row

| # | CRM answer | Checked against our code | Verdict |
|---|---|---|---|
| **Q-CA-1** | Will remove the 4 config/dietary routes under **CR-095**, but **after** we wire B1+B3 | No Customer App file calls `/scan/config` or `/scan/menu/dietary-tags` (grep clean). We told them it was ungated; they chose to sequence it anyway. | ✅ **ACCEPT.** Their sequencing is stricter than needed and costs us nothing. No action. |
| **A9-b** | **DECIDED — hybrid.** Token if present; else `{phone (10-digit), restaurant_id}` resolved to an **existing** customer; if no match, store **unlinked** (`customer_id: null`) rather than create a customer; `order_id` optional. Depends on CRM **CR-085** (canonical phone) — until then exact 10-digit match. Asks us to confirm, then they scope a small additive CR. | Exactly the F1 position the owner locked on 2026-10-03 ("we identify the diner, CRM decides storage"). Our `LandingPage.jsx:373` already normalises to `.replace(/\D/g,'').replace(/^91/,'').slice(-10)`, and `ReviewOrder.jsx:271` strips `+91` — so we can supply canonical 10-digit **today for Indian numbers** (the only ones in scope, CR-2026-09-15-003 parked India-only). "No silent customer creation" is strictly better than our option (i), which would have called `skip-otp` just to obtain a token. | ✅ **ACCEPT — better than what we asked for.** **Unblocks CR-2026-10-03-003** at contract level. Still needs a CRM CR number + ship date. |
| **Q-CA-6** | **The paths we had were CORRECT**: `POST /scan/call-waiter`, `POST /scan/request-bill` (scan.py:845,863), body `{table_id, message?}`, **customer token required**. Each writes one doc to `pos_event_logs`. **CRM only produces — it never reads `pos_event_logs`.** Direction (keep in CRM vs move to POS) **parked by owner**. | `useScannedTable.js` exposes `tableId` → matches CRM's `table_id` (A10, already noted). Our handlers are empty stubs (`LandingPage.jsx:738-746`, `OrderSuccess.jsx:490-498`). | ✅ **ACCEPT** — and see **§2 correction 1**. CR-2026-10-03-005 stays blocked, but the blocker is now **POS consumption**, not the endpoint paths. |
| **Q-CA-5** | Board JSON returned in companion doc `INV_022_CRM_OWNERSHIP_BOARD_REPLY.md`. Added one collection we did not list: **`templates`** (legacy read-only fallback, likely dead). | We have zero code touching `templates`. Our board lists `custom_templates` (121 docs in UAT) — **`templates` is a different name**; needs a probe to confirm it exists. | ⚠️ **COMPANION DOC NOT RECEIVED.** Without that JSON the ownership map cannot be frozen. **Owner must forward it.** |
| Request 1 | Refreshed OpenAPI + contract v2.1 after CR-093/094/095 land (OpenAPI exposure tracked as CR-088) | Needed because the current OpenAPI has untyped `{}` response schemas — we cannot pre-build adapters safely (R7). | ✅ ACCEPT. Logged as a contract obligation. |
| Request 2 | **GAP-11 verified in CRM *preview*** — `core/auth.py:11` has no hardcoded JWT fallback (removed under CR-027), `JWT_SECRET` from env. ⚠️ **They cannot read production — owner must confirm the live host.** | Our admin JWT is a separate secret (`backend/.env JWT_SECRET`); the risk was CRM's old default secret making CRM customer tokens validate on our admin routes. | ✅ ACCEPT for preview. **Open action on owner**, not on CRM. |

---

## 2. Two corrections to our own record

**Correction 1 — the Call Waiter / Pay Bill endpoints were never wrong.**
On 2026-10-03 the owner flagged `/scan/call-waiter` and `/scan/request-bill` as incorrect, and we
raised **Q-CA-6** on that basis. CRM has now confirmed, with file:line evidence
(`scan.py:845,863`), that **both paths, the `{table_id, message?}` body and the customer-token
requirement are exactly right**. The original brief was accurate. What was actually missing was
never the path — it is that **nothing consumes `pos_event_logs`**, so wiring the buttons to a
correct endpoint would still not reach a waiter. That is POS question **P1**, and it is the real
blocker. `CR-2026-10-03-005` is updated accordingly; the "endpoints are wrong" premise is withdrawn.

**Correction 2 — Q-CA-1 is no longer "remove now".**
We told CRM the 4 routes were safe to remove immediately. CRM has chosen to hold CR-095 until we
have wired B1+B3. Harmless, but our sequencing commitment now has CRM's removal as **step 4**, not
"any time". Reflected in the contract.

---

## 3. One new decision for the owner

CRM parked the **Q-CA-6 direction** question and handed it back: *keep Call Waiter / Pay Bill in
CRM as event producers with POS consuming, or move them to POS entirely?*
This is an architecture decision the owner must make; it is not blocking the contract freeze for
any other clause. Until it is answered, `CR-2026-10-03-005` stays parked — and the diner keeps
pressing a dead button, which is why the interim mitigation (hide, or honest message) should be
decided separately and now.

---

## 4. What CRM is waiting on from us

| # | CRM's ask | Our answer (ready to send) |
|---|---|---|
| **B1** | Exact names of the four collections missing on our UAT | `pos_event_logs`, `otp_tokens`, `segment_whatsapp_config`, `message_logs` — enumerated live on UAT `mygenie`, all four NOT FOUND. (CRM already told us in E3 that `otp_tokens` does not exist and `customer_otps` is the OTP store — so that row should be **deleted**, not assigned.) |
| **B2** | Exact names of the four unclaimed collections | `coupon_distributions` (2 docs), `customer_documents` (114), `import_logs` (44), `webhook_logs` (10) — all present in UAT, **zero** Customer App code touches any of them. CRM's E4 already claimed all four as CRM-owned; we need that confirmed in the board JSON. |
| **A9-b** | Confirm the hybrid design | **Confirmed** (see row above). Request: a CRM CR number + expected ship date, and whether `restaurant_id` is the short form (`"689"`). |
| **Q-CA-6** | Owner direction | Deferred — owner decision pending. |

---

## 5. State after this round

| Item | Before round 2 | After round 2 |
|---|---|---|
| CR-2026-10-03-003 (feedback) | BLOCKED on A9-b | **Contract settled**; blocked only on CRM's additive CR shipping |
| CR-2026-10-03-004 (pre-login) | BLOCKED on CR-093/094 | unchanged — CRM has not shipped them yet |
| CR-2026-10-03-005 (call waiter) | BLOCKED on Q-CA-6 "wrong endpoints" | **Premise withdrawn.** Endpoints correct; blocked on **POS P1** + owner direction |
| CR-2026-10-03-001 / -002 | unblocked | unchanged — still unblocked, owner-gated |
| `OWNERSHIP_MAP.md` freeze | waiting on CRM JSON | **still waiting — companion doc not received** |
| GAP-11 | open | preview verified; **open on owner for the live host** |

```text
Validation complete: CRM reply round 2 (INV-022 R2)
Verdict: ACCEPT 4/4 answers · 2 corrections to our own record · 1 new owner decision
Confidence: HIGH (file:line evidence from CRM, cross-checked against our grep)
Blocking the full freeze: CRM ownership-board JSON (not received) · CR-093/094/095 not shipped · POS P5 + P1 · owner GAP-11 live-host confirmation
Next: publish CONTRACT_CUSTOMER_APP_CRM_v1.0.md (Part 1 freezable now, Part 2 pending) → owner sign → send
```
