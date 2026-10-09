# CONTRACT — MyGenie Customer App ↔ MyGenie CRM
## Interface & Data-Ownership Contract · **v1.0 — FROZEN (Part 1 §1–§6)**
## Frozen: 2026-10-03 · Signed by MyGenie CRM and MyGenie Customer App (owner)
## Owner (Customer App): Abhi-mygenie · Counterparty: MyGenie CRM team
## Basis: INV-2026-09-15-002 (ownership map + CRM board reply) · INV-2026-09-15-003 (direct-table audit) · CRM replies INV-022 round 1 + round 2 + ownership-board JSON + contract sign-off · owner decisions 2026-09-15 / 2026-09-28 / 2026-10-03

### Revision history
| Rev | Date | Change |
|---|---|---|
| RC1 | 2026-10-03 | First consolidation of INV-017/018/022 round 1 + round 2 into a signable contract |
| **RC2** | 2026-10-03 | CRM's ownership-board JSON received → **§2 completed to all 39 collections** (36 agreed, 3 contested). **O-1, O-2, O-3 closed.** New items **D-1** (`pos_event_logs` owner semantics), **D-2** (`orders`/`order_items` "Shared" label), **D-3** (`otp_tokens` contradiction with CRM's own E3), **O-10** (`users` change-notice gap created by CRM withdrawing B4) |
| **RC3** | 2026-10-03 | **Owner ruled D-1 and D-2** → §2d resolved, every one of the 39 rows now has an owner. `pos_event_logs` owner = **CRM** (the writer), consumer = POS required, inert until POS consumes. `orders`/`order_items` owner = **CRM**, annotated "originates in POS via webhook"; the "Shared" label rejected. **O-4 and the Pay-Bill definition referred to POS by the owner** → new POS questions **P6** and **P7**; POS **P5** also written up. D-3 still with CRM (one line). New clause **§3 I6** reserving the Pay-Bill semantics. |
| **v1.0 FROZEN** | **2026-10-03** | **Customer-App owner countersigned. Part 1 §1–§6 is now FROZEN** and may only change under the §8 change-control rules (written agreement from both teams + a version bump). §7 continues as a live open-items list without reopening Part 1. |

> **FROZEN 2026-10-03.** Part 1 (§1–§6) is signed by both MyGenie CRM and the MyGenie Customer App
> owner and is now binding under §8 change control. Part 2 (§7) is a live open-items list and is
> **not** frozen; it is owed by POS and the owner, and nothing in it reopens Part 1.
>
> **How to read this.** Part 1 (§1–§6) was **ready to freeze** — every clause has been agreed by
> both teams in writing and verified against code on both sides. Part 2 (§7) **cannot freeze yet**
> and lists exactly what is missing and from whom. Part 3 (§8–§9) is the change-control and
> signature block. **Nothing in this document is implemented yet on the Customer App side** — the
> contract defines the target state; the work items that reach it are CR-2026-10-03-001..005 and
> CR-2026-09-15-001/-004.

---

# PART 1 — FROZEN (signed by both teams, 2026-10-03)

## §1 Ground rules

| # | Rule | Status |
|---|---|---|
| **G1** | **Customer App never reads or writes a CRM-owned collection.** All customer data is accessed through CRM's `/scan/*` HTTP API. | ✅ Agreed both sides. **Not yet true in code** — 6 live violations remain; see §6 for the plan that closes them. |
| **G2** | **CRM never reads or writes a Customer-App-owned collection**: `customer_app_config`, `dietary_tags_mapping`, `non_qr_blocks`, `status_checks`. | ✅ Agreed both sides (symmetric rule). CRM's 4 routes that touched the first two are being removed under CRM **CR-095**. |
| **G3** | **POS never writes the shared DB directly.** POS → CRM API → DB. | ✅ Agreed. Board wording corrected accordingly. |
| **G4** | **CRM is not the identity provider for restaurant admins.** CRM's own admin login proxies MyGenie POS; the `users` row is a cache. Customer App will authenticate admins against POS directly. | ✅ Agreed in principle (CRM INV-022 C1). ⏸ **Customer-App owner approval pending** (F3) — see §7. |
| **G5** | Both teams share one MongoDB (`mygenie`). **Any collection drop, rename, index or schema migration is a cross-team CRITICAL change** and requires the other team's written agreement before execution. | ✅ Agreed. |

## §2 Collection ownership — all 39 rows

**Rule: "Owner" = the only team allowed to write. Everyone else goes through that team's API.**
CRM's side was supplied as code-scanned JSON with read/write counts and file:line evidence
(`INV-002/crm_reply/INV_022_CRM_OWNERSHIP_BOARD_REPLY.md`, received 2026-10-03) and reconciled in
`INV-002/RECONCILIATION_CRM_BOARD_2026-10-03.md`. **36 of 39 rows agreed; 3 ruled by the owner on 2026-10-03 (see §2d).** All 39 rows now have an owner.

### 2a. Customer App owned — 4 rows, agreed by CRM in writing

| Collection | Customer App | CRM | Basis |
|---|---|---|---|
| `customer_app_config` | RW | none after CR-095 (today RW via 4 orphan routes) | OD-7 · O1 = A · **CRM concurs** |
| `dietary_tags_mapping` | RW | none after CR-095 (today RW via 4 orphan routes) | O2 = A · **CRM concurs** |
| `non_qr_blocks` | RW | none — "never referenced anywhere in CRM code" | uncontested |
| `status_checks` | RW | none — "never referenced anywhere in CRM code" | uncontested |

### 2b. CRM owned, Customer App consumes via `/scan/*` — 7 rows

| Collection | CRM | Customer App target state | Note |
|---|---|---|---|
| `customers` | RW (R132/W65) | **none** | `pos.py`, `customers.py`, `scan.py` |
| `users` | RW (R45/W28) | **none** after §6 step 3 | ⚠️ we still read it until then — **CRM has agreed to give advance notice before renaming or dropping any of the six fields we depend on** (§7 O-10, closed 2026-10-03) |
| `feedback` | RW | **none** after CR-2026-10-03-003 | write `scan.py:834`; A9-b intake per §4c |
| `points_transactions` | RW (R10/W16) | none | `core/loyalty.py` |
| `wallet_transactions` | RW (R4/W3) | none | placeholder module, 0 active tenants |
| `coupons` | RW (R33/W10) | none | `core/coupon.py` |
| `loyalty_settings` | RW (R39/W4) | none | feeds `/scan/loyalty-rules/{rid}` (CR-094) |

### 2c. CRM owned, Customer App never touches — 26 rows

`import_logs` (CR-035) · `webhook_logs` (CR-030) · `coupon_distributions` · `customer_documents`
(S3, CR-071/072/075) · `customer_otps` (**the customer OTP store**) · `otp_tokens` (**staff
password reset** — see D-3) · `segment_whatsapp_config` · `message_logs` (legacy, dead) ·
`campaigns` · `campaign_runs` · `campaign_test_sends` · `coupon_transactions` · `coupon_usage` ·
`cron_job_logs` · `custom_templates` · `invoices` · `loyalty_mismatch_logs` ·
`migration_sync_logs` · `pos_request_logs` · `segments` · `whatsapp_callback_logs` ·
`whatsapp_event_template_map` · `whatsapp_message_logs` · `whatsapp_template_variable_map` ·
`templates` (dead read-only alias of `custom_templates`, retire in a CRM cleanup CR).

All confirmed by CRM's code scan. Customer App has **zero** code on any of them.

### 2d. Previously contested — **RULED BY OWNER 2026-10-03**

| Collection | Owner | Customer App | CRM | POS | Ruling |
|---|---|---|---|---|---|
| `pos_event_logs` | **CRM** (sole writer) | **never** | **W only** — 3 writes, 0 reads (`scan.py:859`, `scan.py:877`, `pos.py:2484`) | **consumer — required** | **D-1 ruled: owner = the writer.** CRM proposed assigning ownership to the consumer (POS); the owner kept this document's rule ("owner = the only team allowed to write") so it stays consistent across all 39 rows. **The collection is inert until POS consumes it** — see POS **P1-refined**. |
| `orders` | **CRM** | **never** (the one read at `server.py:820` is dead and dies with CR-2026-10-03-001) | RW — R34/W6, via POS webhook (`pos.py`) + `migration.py` | **origin of the data**, writes nothing directly | **D-2 ruled.** Annotated *"data originates in POS via webhook"*. The label "Shared" was **rejected** — on a shared database it is the exact status this investigation exists to remove, and it leaves neither team a clear veto on schema change. No G3 violation: POS calls CRM's webhook, CRM performs the write. |
| `order_items` | **CRM** | never | RW — R16/W6/IDX4, same path as `orders` | origin of the data | as `orders` |


## §3 Identity contract

| # | Clause | Detail |
|---|---|---|
| **I1** | **Canonical phone = 10-digit national, digits only.** No `+91`, no spaces, no leading zero. | CRM matches on the **exact string**; a mismatch creates a duplicate customer silently (INV-018 GAP-14). Customer App already produces this for Indian numbers (`LandingPage.jsx:373`, `ReviewOrder.jsx:271`). Non-Indian numbers are out of scope — India-only rollout (CR-2026-09-15-003 PARKED). |
| **I2** | **Pre-login identity** = `phone` (canonical, per I1) + `restaurant_id` in **short form** (`"689"`). | Sent only on pre-token calls (`register`, `login`, `skip-otp`, `lookup`). |
| **I3** | **Post-login identity** = CRM customer JWT. The `restaurant_id` claim is the **full form** `pos_0001_restaurant_689`. `pos_id` is the constant `"0001"`. | `crmService.js:30-37` already extracts the short id from the full-form claim. |
| **I4** | Do **not** resend `restaurant_id` on authenticated routes — CRM reads it from the token. | Already true in `crmService.js`. |
| **I5** | **Personal data (points, tier, wallet balance) is login-gated.** CRM will not return it for an unauthenticated phone. | CRM B2. Consequence accepted by owner as **F2 = option (a)**: when the diner has no token the points preview is simply **not rendered** — no retry, no message, no error toast. |
| **I6** | **"Pay Bill" means a request to settle the bill at the table. It is NOT an in-app payment.** It raises a staff request. It does not collect card details, does not call a payment gateway and does not mark an order paid. | Reserved clause — the owner has referred the definitive answer to POS (**P7**). Until POS confirms, no team may plan or build anything under this name that touches money. Rationale: payments are CRITICAL risk under the operating prompt Part C and carry a different approval bar; the name is ambiguous enough to drift there by accident. |

## §4 API contract — endpoints the Customer App consumes from CRM

Base: `REACT_APP_CRM_URL` + `REACT_APP_CRM_API_VERSION` (`v2`). All responses are wrapped in an
envelope that `crmFetch` unwraps.

### 4a. Live today, token required

| Endpoint | Purpose | Agreed field notes |
|---|---|---|
| `GET /scan/auth/me` | header profile card | live, in use |
| `GET /scan/orders?limit=50` | order history | **no `skip`, cap 50.** Raw order doc — Customer App maps `id→order_id`, `created_at→date`, `order_amount→total`, `order_status→status`. Only `orders` returns a true `total`. Pagination = CRM **CR-088** |
| `GET /scan/loyalty` | balance / tier / `points_monetary_value` / `wallet_balance` | the **only** source of current balance (no `balance_after` on ledger rows) |
| `GET /scan/points/history?limit=50` | points ledger | **no `order_id`** on rows. `earn`,`bonus` = credit (+); `redeem`,`expired` = debit (−) |
| `GET /scan/wallet/history?limit=50` | wallet ledger | as above |
| `GET /scan/coupons` | coupons | expiry field is **`end_date`**, not `expires_at` |
| `PUT /scan/profile` | profile edit | live, in use |
| `GET`/`POST` `/scan/addresses`, `PUT`/`DELETE /scan/addresses/{id}`, `PUT /scan/addresses/{id}/default` | delivery addresses | live, in use. `PUT` returns only `address_id` — re-fetch for the list |
| `POST /scan/call-waiter` · `POST /scan/request-bill` | table actions | body `{table_id, message?}`, **customer token required** (scan.py:845,863). Writes one `pos_event_logs` doc. ⚠️ **CRM never reads that collection — POS must consume it or the action is inert.** See §7 O-4 |

### 4b. Live today, pre-login

| Endpoint | Purpose | Notes |
|---|---|---|
| `POST /scan/auth/skip-otp` | mint a customer token from `{phone, restaurant_id}` | the mechanism that makes login precede checkout in all normal flows. Known and **owner-accepted** risk (OD-3): phone + rid alone yields a 24h token |
| `POST /scan/auth/register` · `POST /scan/auth/login` | password customers | live |
| `POST /scan/auth/request-otp` · `POST /scan/auth/verify-otp` | OTP login | **quarantined on our side** (CR-2026-09-14-001) — SMS delivery not confirmed in production. Contract clause: no Customer App flow depends on OTP until CRM confirms live SMS delivery |

### 4c. CRM to build

| Endpoint | CRM CR | Replaces (ours, to be deleted) | Contract |
|---|---|---|---|
| `POST /scan/auth/lookup` `{phone, restaurant_id}` → `{exists, name}` | **CR-093** | `POST /api/auth/check-customer` (`server.py:494`) | No token. **Must not create a customer** (that is why we are not using `skip-otp` for lookup). **Mapping note:** `exists` replaces the `found` flag our retired `/api/customer-lookup` returned — it drives `isNewCustomer` and therefore the **first-visit-bonus line** (`LoyaltyRewardsSection.jsx:36`), not just the greeting |
| `GET /scan/loyalty-rules/{rid}` (public) | **CR-094** | `GET /api/loyalty-settings/{rid}` (`server.py:1492`) | Must expose **four per-tier** earn percentages — `bronze_earn_percent`, `silver_earn_percent`, `gold_earn_percent`, `platinum_earn_percent` (**not** a single `base_earn_percent`; CRM `schemas.py:1007-1010`) — plus `redemption_value`, `min_order_value`, `first_visit_bonus_enabled`, `first_visit_bonus_points`, `points_monetary_value`. **Verified 2026-10-03 as a field-for-field match with what our route returns and our UI reads** (`server.py:1505-1520`, `LoyaltyRewardsSection.jsx:29`) → drop-in replacement, URL swap only. CRM confirmed it will **not** be folded into `/scan/config` |
| `POST /scan/feedback` — **hybrid intake** | **CR-096** (confirmed 2026-10-03; step-1 wave, firm date at CRM's PLANNING gate) | `POST /api/config/feedback` (`server.py:1292`) | **Frozen design (A9-b, CRM round 2):** (1) token present → use it; (2) no token → accept `{phone, restaurant_id}` and resolve to an **existing** customer by canonical phone; (3) no match → store **unlinked** (`customer_id: null`) with `phone` + `restaurant_id` — **never create a customer**; (4) `order_id` **optional**, linked when present. Body otherwise `{rating, message?}`. **`restaurant_id` = short form `"689"`** (CRM normalises internally via `_normalize_restaurant_id`, `scan.py:30`) |

### 4d. CRM to remove (no Customer App caller — verified by grep)

`GET /scan/config/{rid}` · `PUT /scan/config/{rid}` · `GET /scan/menu/dietary-tags/{rid}` ·
`PUT /scan/menu/dietary-tags/{rid}` — CRM **CR-095**, scheduled for **step 4** of §6.

### 4e. Customer-App endpoints CRM must never call

`GET /api/config/{rid}` · `PUT /api/config/` · `GET /api/dietary-tags/available` and everything
else under our `/api/*`. Our config surface is ours (G2).

## §5 Known limitations both sides accept

| # | Limitation | Accepted by |
|---|---|---|
| **L1** | No pagination beyond 50 rows on any history endpoint until CRM CR-088. | both |
| **L2** | No `expiring_soon` on points (CRM P-3). Customer App does not render it. | both |
| **L3** | Points preview is absent for a diner with no token. | owner, F2 = (a) |
| **L4** | `skip-otp` logs in password-protected customers without a password. | owner, OD-3 |
| **L5** | Feedback may be stored unlinked when the phone matches no existing customer. | CRM A9-b, owner F1 |
| **L6** | Non-Indian phone numbers are not supported end-to-end. | owner, India-only |
| **L7** | OpenAPI response schemas are untyped `{}` — adapters must be built against live probes, not the spec. | both; CRM to improve via CR-088 |

## §6 Execution sequence — agreed by both teams

| Step | Who | Work | Tracked as |
|---|---|---|---|
| **1** | **CRM** | Ship `POST /scan/auth/lookup` + `GET /scan/loyalty-rules/{rid}`; ship the feedback hybrid intake | CR-093 · CR-094 · **CR-096** (feedback) |
| **2** | **Customer App** | Wire the three; delete the 3 pre-login routes; delete the 14 dead routes; migrate feedback | CR-2026-10-03-004 · CR-2026-10-03-001 · CR-2026-10-03-003 |
| **3** | **Customer App** | Move admin login to POS direct; stop reading `users` | CR-2026-09-15-004 (gated on F3 + POS P5) |
| **4** | **CRM** | Remove the 4 orphan config/dietary routes; both sides sign `OWNERSHIP_MAP.md` | CR-095 |
| — | **Customer App, now** | Interim: 7-field projection on the two `users` reads so CRM's API keys stop loading into our admin auth path | **CR-2026-10-03-002** (P0, independent of every step above) |
| — | **CRM, after step 4** | Send refreshed OpenAPI + contract **v2.1** diff | CR-088 |

---

# PART 2 — §7 OPEN ITEMS (not frozen; owed by POS and the owner)

| # | Open item | Owed by | Blocks |
|---|---|---|---|
| ~~O-1~~ | ~~Ownership-board JSON~~ | — | ✅ **CLOSED 2026-10-03** — received, 39 rows, code-scanned with file:line. Reconciled in `INV-002/RECONCILIATION_CRM_BOARD_2026-10-03.md` |
| ~~O-2~~ | ~~B1 / B2 reconciliation~~ | — | ✅ **CLOSED** — resolved by the JSON itself. B1's four (`pos_event_logs`, `otp_tokens`, `segment_whatsapp_config`, `message_logs`) exist in CRM **code** and were absent from UAT only because never written. B2's four (`coupon_distributions`, `customer_documents`, `import_logs`, `webhook_logs`) are now claimed with code evidence instead of by elimination |
| ~~O-3~~ | ~~`templates`~~ | — | ✅ **CLOSED** — CRM-owned, dead read-only alias of `custom_templates` (`whatsapp.py:2383`), retire in a CRM cleanup CR |
| ~~D-1~~ | ~~`pos_event_logs` owner semantics~~ | — | ✅ **RULED 2026-10-03** — owner = **CRM** (the sole writer); consumer = POS, required; Customer App never. Recorded in §2d. POS **P1-refined** still needed to know whether the collection is live or inert |
| ~~D-2~~ | ~~`orders` / `order_items` label~~ | — | ✅ **RULED 2026-10-03** — owner = **CRM**, annotated "originates in POS via webhook". "Shared" rejected. Recorded in §2d |
| ~~D-3~~ | ~~`otp_tokens` contradiction~~ | — | ✅ **CLOSED 2026-10-03 by CRM's sign-off.** Round-1 E3 was scoped to the *customer* OTP store (`customer_otps`, `scan.py:193-287`); `otp_tokens` is a separate **staff** password-reset store (`auth.py:608-751`) and does exist. Both statements true in their own scope; our restored row is correct as filed |
| **O-4** | **Call Waiter / Pay Bill direction.** CRM parked it and handed it back; **owner has referred it to POS** → now POS **P6** (keep in CRM with POS consuming, or move to POS entirely — *and how does staff actually get notified*). Bundled with POS **P1-refined**: does anything read `pos_event_logs` at all? | **POS** | §4a footnote · CR-2026-10-03-005 |
| **O-11** | **"Pay Bill" semantics (new).** Reserved as clause **§3 I6**: a request to settle at the table, **not** an in-app payment. Owner referred the definitive answer to POS → **P7**. Until POS confirms, nothing may be planned under this name that touches money. | **POS** | §3 I6 · CR-2026-10-03-005 scope |
| **A-1** | 🔴 **AMENDMENT REQUIRED — §2d annotation is now factually wrong.** POS answered **P1 = (b): POS does NOT read `pos_event_logs`** (2026-10-03). Frozen §2d annotates that collection *"consumer = POS — required"*; with CRM write-only (3 writes / 0 reads) and POS not reading, **no system component reads it at all.** The collection is **write-only across the entire estate** — every Call Waiter / Pay Bill row ever written is unread. **This annotation cannot be edited unilaterally**: §2 is frozen, so under **§8 C1** the change needs written agreement from CRM plus a version bump → **v1.1**. Proposed amended text: *"owner = CRM (sole writer) · consumer = NONE as at 2026-10-03 · POS confirmed it does not read this collection · the events are unconsumed; a consumer must be designated before any producer is wired."* Ownership itself is unchanged. **Action: raise with CRM as a v1.1 amendment; do not edit §2d until they agree.** | **us → CRM** | §2d · supersedes O-12 · CR-2026-10-03-005 |
| ~~O-12~~ | ~~POS does not use the shared DB~~ | — | ✅ **CONFIRMED BY POS 2026-10-03.** P1 = (b): POS does not read `pos_event_logs`; POS integrates only via CRM's API/webhook, consistent with **G3**. The consequence is now tracked as **A-1** (a frozen-text amendment), and P6/P7 are parked by POS — so the only live options if the feature is ever revived are *CRM pushes to POS* or *move the actions to POS*. Reading the shared DB is confirmed off the table |
| **O-13** | **POS `restaurants[]` can hold MULTIPLE entries — franchises** (POS answer to P4.2, 2026-10-03). CRM silently takes `restaurants[0]`, and our admin login likewise carries exactly **one** `restaurant_id` (`server.py:620`, minted into the token at `:613`). So a franchise admin managing several outlets currently gets whichever outlet happens to be first. **POS has not yet sent the multi-entry response shape** — requested. This materially widens **CR-2026-09-15-004**: the POS-direct admin login needs an **outlet picker** plus a notion of "currently selected outlet" threaded through every admin operation (config save, QR, visibility), because `customer_app_config` is keyed per `restaurant_id`. | **POS** (shape) + **owner** (picker UX) | G4 · §6 step 3 · CR-2026-09-15-004 |
| **O-14** | **POS admin profile endpoint path + response shape still not supplied.** POS replied "ok" to P4.1, which acknowledged rather than answered. **Confirmed still open 2026-10-03 by live test:** both `POST /auth/vendoremployee/login` and `/common-login` return **200** but contain **no `restaurants[]`, no restaurant id and no name** — only `token`, `crm_token`, `firebase_token`, `first_login`, role/permission fields and `zone_wise_topic`. So the profile call is definitely separate and its path is unknown. (`zone_wise_topic: "zone_5_restaurant"` is a messaging topic — **do not** parse a restaurant id from it.) Without this, CR-2026-09-15-004 cannot be planned. Evidence: `INV-002/VALIDATION_OF_POS_LOGIN_CURL_2026-10-03.md` | **POS** | §6 step 3 · CR-2026-09-15-004 |
| **O-15** | **Which POS login path is canonical?** Our code calls `/auth/vendoremployee/login`; the owner's working curl uses `/auth/vendoremployee/common-login`. **Both return 200 today** — so there is no live bug — but `common-login` is the richer variant (`permissions[]` + `login_type` instead of `role[]`). Ask POS whether `/login` is deprecated, so we migrate deliberately rather than discover it through failing admin QR generation. | **POS** | CR-2026-09-15-004 · `refresh_pos_token` |
| ~~O-16~~ | ~~`dp_live_` credential from preprod~~ | — | ➡️ **ESCALATED 2026-10-03 to `INV-2026-10-03-001`** (security investigation, owner instruction). Preprod issues a static `dp_live_`-prefixed CRM credential, and the shared UAT DB holds real customer PII incl. **114 `customer_documents`**. **Owning team: DevOps/Ops** with CRM and POS input — **not a Customer App code item and outside this contract**. Brief ready: `INV-2026-10-03-001/BRIEF_FOR_DEVOPS_UAT_DATA_HYGIENE.md`. Its **Q9** (do preprod and production share any secret?) should be answered together with **O-7** |
| **O-12-note** | **Owner correction 2026-10-03: POS does not use the shared `mygenie` DB at all.** The shared DB is **Customer App + CRM only**; POS integrates exclusively through CRM's API/webhook — which is what **G3** already says, stated the other way round. **Consequence for §2d:** the annotation *"consumer = POS, required"* on `pos_event_logs` assumed POS could read the collection. **If POS never touches the DB it cannot consume `pos_event_logs` by reading it** — so those events are inert unless **CRM pushes them to POS**, or the two actions move to POS entirely. This does **not** change ownership (CRM remains the sole writer; §2d stands) and does **not** reopen frozen §1–§6; it narrows the live options for POS **P6** to: *(a) keep in CRM and CRM pushes to POS*, or *(b) move both actions to POS*. **Reading the DB is not on the table.** | **POS** (P6), then CRM | §2d annotation · §4a footnote · CR-2026-10-03-005 |
| **O-5** | **POS P5** — admin profile endpoint path; can `restaurants[]` hold more than one entry? | POS | G4 · §6 step 3 · CR-2026-09-15-004 (F3) |
| **O-6** | **F3 approval** — owner to approve POS-direct admin login after reading `CR-2026-09-15-004/IMPACT_AND_NEW_FLOW.md` (not yet written). | **owner** | G4 · §6 step 3 |
| **O-7** | **GAP-11 live host.** **Our half is VERIFIED AND CLOSED** (2026-10-03): `server.py:47-49` takes `JWT_SECRET` from env with **no fallback** and refuses to start without it, HS256 pinned, single encode/decode path, 63-char non-placeholder secret, plus incidental payload-shape isolation (`:338-342`, `:355-372`). CRM verified their no-fallback build in **preview**. **The live CRM host cannot be verified from our codebase** — no access. Owner has a 3-step check in `INV-003/O-7_GAP-11_LIVE_HOST_CHECK.md` §3; the decisive one is comparing **SHA-256 hashes** of the two secrets, which requires no secret to be exchanged. Residual risk: **low but unmeasured.** | **owner** | a security clause; does not block the API contract |
| ~~O-8~~ | ~~Feedback CR number + short-form rid~~ | — | ✅ **CLOSED 2026-10-03.** Feedback CR = **CR-096**, rides the step-1 wave; firm date at CRM's PLANNING gate (not yet open). `restaurant_id` = **short form `"689"`**, normalised CRM-side (`scan.py:30`) |
| **O-9** | **CR-093 / CR-094 / CR-096 not shipped yet.** Contract text frozen; the endpoints do not exist. CRM's PLANNING gate is not open, so there are **no dates yet**. Probe each on UAT before wiring (R7). | CRM | §6 step 1 |
| ~~O-10~~ | ~~`users` change notice~~ | — | ✅ **CLOSED 2026-10-03 — CRM agreed.** They will give **advance notice** before renaming or dropping any of `id`, `email`, `phone`, `password_hash`, `restaurant_id`, `pos_id` until we confirm §6 step 3 is complete; all six confirmed present on their side. This was the item most likely to cause a silent admin-login outage |

**Verdict: Part 1 §1–§6 is complete, internally consistent and SIGNED BY CRM (2026-10-03).
CRM has no open items left** — D-3, O-8 and O-10 all closed in their sign-off, and they explicitly
concur with the D-1/D-2 rulings, so those rows are mutually agreed rather than unilaterally ruled.
**One Customer-App countersignature turns Part 1 into v1.0 FROZEN; nothing in it needs editing
first.** What remains is **POS** (P1-refined, P5, P6, P7) and **two owner actions** (F3, O-7).
`OWNERSHIP_MAP.md` stays deliberately unedited until POS replies.

---

# PART 3 — CHANGE CONTROL & SIGNATURES

## §8 Change control

| # | Rule |
|---|---|
| **C1** | Any change to §2 (ownership), §3 (identity) or §4 (endpoints) requires **written agreement from both teams** before implementation, and a version bump of this document. |
| **C2** | Adding, removing or changing the shape of any `/scan/*` endpoint the Customer App consumes requires **notice plus a refreshed OpenAPI/contract diff**. No silent field renames — every field rename in this track so far (`expires_at`→`end_date`, `expired`/`bonus` sign semantics, `table_id`) cost a debugging cycle. |
| **C3** | Breaking changes need a deprecation window: both versions live until the consuming team confirms migration. |
| **C4** | **Collection-level changes** (drop, rename, index, schema migration) follow **G5** — cross-team CRITICAL, written approval first. |
| **C5** | Either team may propose a change at any time; silence is **not** consent. |
| **C6** | This document is the single source of truth. Where it conflicts with an older brief, reply or board HTML, **this document wins** and the older artefact is marked superseded. |

## §9 Signatures

| Party | Scope accepted | Name | Date |
|---|---|---|---|
| MyGenie CRM team | **Part 1 §1–§6** | ✅ **SIGNED (owner-authorised)** — `INV-003/crm_replies/CONTRACT_v1.0_CRM_SIGNOFF.md`, validated clean in `INV-003/VALIDATION_OF_CRM_SIGNOFF_2026-10-03.md` | **2026-10-03** |
| MyGenie Customer App (owner) | **Part 1 §1–§6** | ✅ **COUNTERSIGNED — Abhi-mygenie** (owner instruction, 2026-10-03: *"Yes — mark it v1.0 FROZEN and record you as signatory"*) | **2026-10-03** |
| MyGenie POS team | **G3** + §7 O-4/O-5/O-11 only | ☐ pending — POS has not yet replied to P1-refined / P5 / P6 / P7 | |

> ## STATUS: **v1.0 — PART 1 §1–§6 FROZEN (2026-10-03)**
>
> Both teams have signed. **§1–§6 may now change only under §8 change control**: written agreement
> from both teams, a version bump, and for endpoint changes a refreshed OpenAPI/contract diff.
> Silence is not consent (C5). Where any older brief, reply or the ownership board disagrees with
> this document, **this document wins** (C6).
>
> **§7 remains open and is not part of the freeze.** Nothing in §7 reopens Part 1. Remaining items
> are **POS-only** (P1-refined, P5, P6, P7 → O-4, O-5, O-11), **two owner actions** (F3, O-7) and
> **O-9** (CRM's CR-093 / CR-094 / CR-096 are queued behind their PLANNING gate — no dates yet).
>
> **POS is not a signatory to Part 1.** POS signs only ground rule **G3** plus the three §7 items
> that are theirs. Their reply does not require Part 1 to be re-signed.

---

## Appendix A — Customer App violations still open against G1 (code truth, `3oct`, 2026-10-03)

| Site | File:line | Collection | Closes under |
|---|---|---|---|
| 14 dead routes | `server.py` — 365, 531, 539, 663, 674, 703, 728, 820, 973, 997, 1016, 1042, 1044, 1308 | `customers`, `orders`, `points_transactions`, `wallet_transactions`, `coupons`, `feedback` | CR-2026-10-03-001 |
| admin auth reads | `server.py:367`, `server.py:587` | `users` | CR-2026-10-03-002 (projection, now) → CR-2026-09-15-004 (removal) |
| feedback write | `server.py:1303` ← `FeedbackPage.jsx:34` | `feedback` | CR-2026-10-03-003 |
| `check-customer` | `server.py:494` ← `LandingPage.jsx:86, 607` | `customers` | CR-2026-10-03-004 |
| `loyalty-settings` | `server.py:1496` ← `ReviewOrder.jsx:145` | `loyalty_settings` | CR-2026-10-03-004 |
| `customer-lookup` | `server.py:1539` ← `ReviewOrder.jsx:418` | `customers` | CR-2026-10-03-004 |

**Scorecard: 20 direct touches today → 0 when §6 steps 2–3 complete.**
