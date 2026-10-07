# Session Handover — 2026-09-28 → 2026-10-03 · Customer App ↔ CRM Contract v1.0 (Part 1 signed)

> **Mode this session**: INVESTIGATION gate only. **Zero application code changed.** All output = documents, decisions, outbound briefs.
> **Next gate**: PLANNING for CR-093 · CR-094 · CR-095 · CR-096 (owner has NOT yet said "plan …"). Do not write code until the owner opens it.
> **Read order for next agent**: this file → `CR_STATUS_DASHBOARD.md` rows 093–096 → `DECISIONS_LOG.md` (2026-09-28 / 2026-10-03 entries) → `investigations/CONTRACT_CUSTOMER_APP_CRM_v1.0_CRM_SIGNOFF.md` → `discovery/SESSION_2026_09_28_BATCH_INTAKE_CR093_CR095.md`.

---

## 1. What this session was about

The Customer App (Scan & Order) team sent CRM three briefs (`CRM_BRIEF_ENDPOINT_VALIDATION.md`, `CRM_BRIEF_OWNERSHIP_BOARD.md`, `REPLY_TO_CRM_INV_022.md`) and then the formal contract `CONTRACT_CUSTOMER_APP_CRM_v1.0.md` (RC3). CRM's job was to (a) validate every claim against the codebase + preprod DB, (b) answer their questions, (c) fill in the shared-DB ownership board, (d) sign off the contract, and (e) raise the POS-owed items to POS.

**Outcome**: CRM **signed Part 1 (§1–§6)** of the contract on 2026-10-03, owner-authorised. Four CRs (093–096) are registered and parked at the PLANNING gate. The full `OWNERSHIP_MAP.md` freeze is still blocked — but by POS and owner items, not CRM.

---

## 2. Investigations done (all read-only, HIGH confidence)

| Ref | What we checked | Result |
|---|---|---|
| **INV-022 (endpoint validation)** | 30-row Customer App brief vs `scan.py` / `auth.py` / preprod DB | A1/A3/A7/A8 exact · A2/A4/A5/A6/A9/A10 exist with field/auth differences · B1–B3 MISSING → CRM builds · C1/C2 CRM is not the IdP · D1/D2 four orphan routes confirmed. Doc: `investigations/INV_022_CRM_REPLY_ENDPOINT_VALIDATION_BRIEF.md` |
| **INV-022 (ownership board)** | Full backend scan for every read/write op on 38+ shared collections | Board filled with `crm` R/W/RW per collection + file:line evidence. Added `templates` (legacy, likely dead) which was missing from their board. Doc: `investigations/INV_022_CRM_OWNERSHIP_BOARD_REPLY.md` |
| **GAP-11 (JWT fallback)** | `core/auth.py:11` | `JWT_SECRET = os.environ['JWT_SECRET']`, no hardcoded fallback (removed in CR-027). **Preview verified only** — live host is owner action (O-7). |
| **pos_event_logs** | Who reads it? | CRM: 3 writes (`scan.py:859`, `scan.py:877`, `pos.py:2484`), **0 reads**. POS confirmed **P1 = NO** (POS doesn't read it either). ⇒ Call Waiter / Pay Bill are **inert end-to-end** today. Collection is overloaded with two doc shapes (table-action vs WhatsApp event audit). |
| **D-3 (`otp_tokens` vs E3)** | Two OTP stores | `customer_otps` (customer scan OTP, `scan.py:193–287`) ≠ `otp_tokens` (staff password-reset, `auth.py:608–751`). Both exist; both CRM-owned. |
| **CR-094 shape** | `loyalty_settings` earn fields | Earn percent is **per-tier** (`bronze/silver/gold/platinum_earn_percent`, `schemas.py:1007–1010`), not a single `base_earn_percent`. Flagged to Customer App as Highlight #2. |
| **`users` six-field interface** | `id, email, phone, password_hash, restaurant_id, pos_id` | All six present (`auth.py`, `schemas.py`). Change-notice agreed (C2 / O-10). |
| **SSO (`vendoremployee/login`)** | Does CRM call POS `POST /api/v1/auth/vendoremployee/login`? | **Yes** — admin SSO in `routers/auth.py` calls it then `GET /api/v1/vendoremployee/profile`. Request/response shape explained to owner (last item before this handover). |

---

## 3. Contract v1.0 — what was discussed and agreed

### 3a. Agreed by CRM (signed)
| § | Item | CRM position |
|---|---|---|
| §1 G1–G5 | Ground rules; symmetric rule **CRM never reads Customer App collections; Customer App reads CRM only via API** | ✅ Agreed (owner rule, 2026-09-28) |
| §2a–2c | 36 ownership rows | ✅ Match our JSON exactly |
| §2d D-1/D-2 | Owner ruled **"owner = sole writer"** → `pos_event_logs`, `orders`, `order_items` = **CRM-owned** (CRM originally proposed POS / Shared) | ✅ Accepted, no objection (Highlight #1) |
| §3 I1–I6 | Identity: canonical 10-digit phone · short-form rid (`"689"`) pre-login · full-form rid (`pos_0001_restaurant_689`) in JWT · "Pay Bill" name reserved → POS | ✅ Agreed |
| §4a/4b | Live endpoint list incl. `call-waiter` / `request-bill` (`table_id`, customer token), `skip-otp`, OTP login quarantined | ✅ Accurate |
| §4c | CR-093 / CR-094 / feedback (CR-096) shapes | ✅ Agreed (per-tier caveat) |
| §4d | CR-095 removal of 4 orphan routes | ✅ Agreed |
| §4e / §5 L1–L7 / §6 | Limits + rollout sequence | ✅ Agreed; L7 (untyped OpenAPI) improved via CR-088 |
| C2 / O-10 | Advance notice before renaming/dropping any of six `users` fields until Customer App finishes §6 step 3 | ✅ Agreed |

### 3b. Decisions locked (see `DECISIONS_LOG.md`)
- **A9-b / CR-096**: feedback intake = **hybrid** — token if present; else `{phone, restaurant_id(short)}` resolves **existing** customer only; no match → store **unlinked** (`customer_id: null`); **never create a customer**; `order_id` optional.
- **Q-CA-6 / P6**: Call Waiter / Pay Bill direction **PARKED** by owner (TBD later). No CRM change to those two routes until revisited.
- **C1 Option (a)**: Customer App authenticates admins against **MyGenie POS directly** — CRM is not the IdP. Kills JWT-secret-overlap P0; `users` read-freeze **retired**.
- **CR-095**: orphan routes removed (not locked); PUTs first (zero callers), GETs after Customer App cutover (Q-CA-1).

### 3c. Agreed rollout sequence (§6)
1. **CRM** ships CR-093 (`POST /scan/auth/lookup`) + CR-094 (`GET /scan/loyalty-rules/{rid}`) + CR-096 (feedback hybrid) — "step-1 wave"
2. **Customer App** wires them, deletes its 3 pre-login routes + 14 dead routes
3. **Customer App** switches admin login to POS
4. **CRM** removes the 4 orphan routes (CR-095) → both sides sign `OWNERSHIP_MAP.md`
5. **CRM** sends refreshed `/api/openapi.json` subset + contract v2.1 diff after 093/094/095 QA pass

---

## 4. Changes needed on CRM side (registered, parked at PLANNING)

| CR | Change | Priority / Risk | Open Qs before planning closes | File(s) |
|---|---|---|---|---|
| **CR-093** | New public `POST /scan/auth/lookup` → `{exists, name}`; no create, no token, rate-limited | P1 / HIGH (public auth-adjacent) | **Q1** rate-limit values (rec: 10/min per IP, 5/5min per phone+rid) · **Q2** full stored `name` vs first token (rec: full) | `routers/scan.py` |
| **CR-094** | New public `GET /scan/loyalty-rules/{rid}` — CR-080 L-1 whitelist + `min_order_value`, `first_visit_bonus_enabled`, `first_visit_bonus_points`, 4× `*_earn_percent`, `redemption_value`, `points_monetary_value` | P2 / MEDIUM (read-only) | **Q1** also include per-tier `*_redemption_value`? (rec: yes) | `routers/scan.py` (shape ref `pos_loyalty.py:44`) |
| **CR-095** | Remove `GET+PUT /scan/config/{rid}`, `GET+PUT /scan/menu/dietary-tags/{rid}` + `AppConfigUpdate` / `DietaryTagsUpdate` models (`scan.py:102–175, 713–808`) | P1 / CRITICAL (other team's prod data; unscoped cross-tenant write) | **Q1** PUTs now, GETs after Q-CA-1 (rec: yes) · **Q2** 404 vs 410 stub for GETs during cutover (rec: 410 then delete) · **gate**: Customer App cutover confirmation | `routers/scan.py` |
| **CR-096** | `POST /scan/feedback` hybrid intake (design frozen §4c, see 3b) | P2 / MEDIUM | None — design frozen. Depends on CR-085 for canonical phone; until then exact 10-digit match | `routers/scan.py:816–834`, `services/feedback_service.py` |

**Recommended planning order**: 093 → 094 → 096 (ship together as step-1 wave) → 095 (after Q-CA-1).

### Related, not in this wave (already registered, unchanged this session)
- **CR-084** `dev_otp` leak (P1) — blocked on owner scope decision (bypass-only vs remove OTP flow).
- **CR-085** phone canonicalisation (P1 CRITICAL) — CR-096 safe matching depends on it; owner Q1–Q3 + 5 restaurant IDs pending.
- **CR-086 / 087** customer_sync + backfill (P1) — owner Qs pending.
- **CR-088** `/scan/*` hygiene incl. expose `/api/openapi.json` (P2) — needed for the v2.1 OpenAPI refresh promised to Customer App.
- **CR-089 / 090** skip-otp guard rails, OTP delivery (P2).
- **CR-091 / 092** invoice tax lines + live invoice silent failure (proposed, not registered — owner decision on INV-021 options A–D).

---

## 5. ⏳ PENDING — what we still need **from the Scan & Order / Customer App agent**

> Next agent: present this list to the owner as "these are the items to send to / get from the Customer App agent".

| # | Item | Why we need it | Blocks |
|---|---|---|---|
| **CA-1** | **Countersignature** on `CONTRACT_CUSTOMER_APP_CRM_v1.0` Part 1 (§1–§6) | CRM signed 2026-10-03; contract becomes **v1.0 FROZEN** only on their signature | Contract freeze |
| **CA-2** | **Q-CA-1 — cutover confirmation**: tell us when Customer App has stopped reading `GET /scan/config/{rid}` and `GET /scan/menu/dietary-tags/{rid}` (reads its own collections directly) | CR-095 GET removal is gated on this | CR-095 (GET half) |
| **CA-3** | **Confirm A9-b hybrid** feedback design as written in §4c, and that they will switch from their `POST /api/config/feedback` to CRM `POST /scan/feedback` | Already owner-approved on CRM side; need their ACK before planning closes | CR-096 |
| **CA-4** | **B1 — the exact four collection names "missing on UAT"** | Cannot answer against UAT DB without names | Ownership board completeness |
| **CA-5** | **B2 — the exact four "unclaimed" collections** they meant (our candidates: `non_qr_blocks`, `status_checks`, `message_logs`, `templates`) | Reconcile against our scan | Ownership board completeness |
| **CA-6** | **Acknowledge per-tier earn fields** for CR-094 adapter (4× `*_earn_percent`, not one `base_earn_percent`) | Avoid adapter mismatch at integration | CR-094 integration |
| **CA-7** | **Acknowledge Call Waiter / Pay Bill are inert** (POS P1 = NO) and that direction (P6) is parked — their UI should not promise a waiter is notified | Customer-facing correctness | None (informational) |
| **CA-8** | **Confirm they accept the rollout sequence §6** (CRM step-1 wave → they wire → admin login to POS → CR-095) and give a target date for their step 2–3 | Lets us set a firm ship date at PLANNING | Planning dates |
| **CA-9** | After 093/094/096 land: they receive refreshed `/api/openapi.json` subset + contract **v2.1** diff from us (CRM-owed, tracked) | Their request #1 | CR-088 |

### What CRM owes Customer App (for completeness)
- Firm ship date for CR-093/094/096 — set at PLANNING gate.
- OpenAPI + contract v2.1 refresh after implementation (CA-9).
- Advance notice before any change to the six `users` fields (C2).

---

## 6. ⏳ PENDING — from **POS** (not CRM's to resolve)

| # | Item | Status |
|---|---|---|
| P1 | Does POS read `pos_event_logs`? | ✅ Answered **NO** |
| P5 | Admin profile endpoint path + `restaurants[]` cardinality (POS → Customer App) | Open — CRM has no input |
| P6 | Call Waiter / Pay Bill direction (keep in CRM + POS consumes vs move to POS) | ⏸ **PARKED** by owner |
| P7 | "Pay Bill" semantics = settle-at-table request, **not** in-app payment | **Open** — needs POS one-line confirm |
| — | `POS_BRIEF_ORDER_TAX_FIELDS_2026-09-28.md` (INV-021: send `gst_tax`/`vat_tax`/`service_tax` + SC base) | Sent; awaiting POS |

## 7. ⏳ PENDING — from **Owner**

| # | Item |
|---|---|
| F3 | Approve POS-direct admin login for Customer App (Option a) — needed for OWNERSHIP_MAP freeze |
| O-7 | Confirm live host has `JWT_SECRET` set (no-fallback build) |
| — | **Open PLANNING gate**: say `plan 093 094 095 096` (or subset) and answer the 5 open Qs in §4 |
| — | CR-084 scope · CR-085 Q1–Q3 + 5 restaurant IDs · CR-086 Q1–Q2 · CR-087 rule lift · INV-021 options A–D (CR-091/092) |
| — | Google Sheets bug/CR tracker — discussed, parked by owner |

---

## 8. Artefacts produced this session

| File | Purpose |
|---|---|
| `investigations/INV_022_CRM_REPLY_ENDPOINT_VALIDATION_BRIEF.md` | 30-row validation (final) |
| `investigations/INV_022_CRM_REPLY_TO_CUSTOMER_APP_ENDPOINT_VALIDATION.md` | Outbound round-1 reply (sent) |
| `investigations/INV_022_CRM_OWNERSHIP_BOARD_REPLY.md` | Filled ownership board JSON (sent) |
| `investigations/INV_022_CRM_REPLY_TO_CUSTOMER_APP_ROUND2.md` | Round-2 answers Q-CA-1/5/6, A9-b, GAP-11, sequencing (sent) |
| `investigations/CONTRACT_CUSTOMER_APP_CRM_v1.0_CRM_SIGNOFF.md` | Formal Part-1 sign-off + 4 CRM-owed answers (sent) |
| `handoff/CRM_TO_POS_POS_EVENT_LOGS_AND_TABLE_ACTIONS_2026_10_03.md` | POS brief P1/P6/P7 (sent; P1/P6 answered) |
| `discovery/SESSION_2026_09_28_BATCH_INTAKE_CR093_CR095.md` | Intake for 093–095 |
| `DECISIONS_LOG.md` | +5 entries (A9-b, Q-CA-6, contract sign, C2 notice, POS P1/P6) |
| `CR_STATUS_DASHBOARD.md` | Rows 093–096 + header |

## 9. Environment / credentials
- Services up; no code changed, no restart needed. Test tenant: `owner@thegoankitchen.com / Qplazm@10` (see `/app/memory/test_credentials.md`).
- Operating prompt: `control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` — gate protocol is mandatory.
