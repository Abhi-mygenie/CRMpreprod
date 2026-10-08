# SESSION 2026-09-28 — BATCH INTAKE (from INV-022) — CR-093 → CR-095

**Role:** INTAKE (registration only — zero code changes)
**Source:** Customer App brief `inbox/CRM_BRIEF_ENDPOINT_VALIDATION.md` (ref INV-2026-09-15-003) → `investigations/INV_022_CRM_REPLY_ENDPOINT_VALIDATION_BRIEF.md` (closed 2026-09-28, HIGH confidence, 9/10 steps)
**Evidence basis:** code (`routers/scan.py` 102-170 / 303-348 / 464-499 / 717-808, `routers/auth.py:360-559`, `routers/pos.py:2041`, `routers/pos_loyalty.py:44-77`, `core/auth.py:11`) + preprod Mongo read-only probes (13 `customer_app_config` docs, collection existence) + `Old API doc/API_DOC_CRM_APP.md` §C4-C5 (origin)
**Owner rulings feeding this intake (2026-09-28):** B1/B2 → CRM builds lookup, points login-gated · B3 → CRM builds loyalty-rules · C1 → Option (a) POS-direct (no CRM code) · D1 YES · D2 YES · symmetric rule (CRM never reads Customer App collections) · Customer App reads CRM only via API (`users` read-freeze retired).

Items with **no CRM code** (C1 Option a, `users` freeze retirement, POS coordination note) are **not** registered as CRs — they are carried in the outbound reply `investigations/INV_022_CRM_REPLY_TO_CUSTOMER_APP_ENDPOINT_VALIDATION.md`.

---

## 0. Summary board

| CR | Title | Type | Sev | Risk | Effort | Source row(s) | Blocks Customer App? |
|---|---|---|---|---|---|---|---|
| **CR-093** | Public customer lookup `POST /scan/auth/lookup` → `{exists, name}` (no create, no token, rate-limited) | CR (new public auth-adjacent route) | **P1** | **HIGH** (public, phone enumeration surface, `scan.py` auth block) | ~1 h | B1, B2 | **YES** — their landing-page greet + checkout name prefill have no safe source today |
| **CR-094** | Public loyalty rules `GET /scan/loyalty-rules/{restaurant_id}` (whitelisted subset of `loyalty_settings`) | CR (new public read route) | P2 | MEDIUM (read-only; reuses CR-080 L-1 whitelist; **no calculation change**) | ~1 h | B3 | Recommended — "you will earn N points" preview; app can ship without |
| **CR-095** | Remove 4 orphan routes: `PUT+GET /scan/config/{rid}`, `PUT+GET /scan/menu/dietary-tags/{rid}` (Customer-App-owned collections; PUTs are **unscoped cross-tenant writes**) | BUG (security / ownership) | **P1** | **CRITICAL** (other team's production data; cross-tenant write hole) | ~15 min + cutover gate | D1, D2, E2, symmetric rule | **YES for ownership sign-off**; removal itself gated on Customer App cutover (Q-CA-1) |

**Recommended order:** CR-093 → CR-094 (both additive, can ship together) → CR-095 (after Customer App confirms Q-CA-1).

---

## 1. CR-093 — `POST /scan/auth/lookup` (phone + restaurant_id → `{exists, name}`)

- **Classification:** CR (feature) · **Severity: P1** · **Risk: HIGH** — new **public, unauthenticated** route in the `scan.py` auth block; returns existence + name for any phone → enumeration surface; auth-adjacent per addendum (approval needed to plan/implement).
- **Need (Customer App B1/B2):** diner types phone on landing/checkout → "Welcome back, Alok" + name prefill. Today the only stand-in is `skip-otp`, which **creates an unverified customer per typed phone** (junk data; amplifies CR-089).
- **Owner ruling:** name-only lookup OK; **points / tier / wallet require login** (privacy).
- **Code reality:** MISSING. Closest: `POST /api/pos/customer-lookup` (`pos.py:2041`) — needs tenant POS API key, returns full customer + loyalty + documents → not usable from a browser.
- **Fix direction (for Planning):** new route in `scan.py` next to `skip-otp`. Body `{phone, restaurant_id}` (same schema as `SkipOTPRequest`); normalise rid; `find_one` on `customers` by exact `phone` + `user_id` with projection `{name:1}`; respond `{exists: bool, name: str|null}`; **no insert, no token**. Rate-limit per IP + per phone (reuse the `request-otp` 5-min counter pattern or in-memory limiter — Planning to decide); 429 on breach. No `is_blocked` leak. Add to contract v2.1 + OpenAPI.
- **Duplicate check:** DISTINCT. RELATED: CR-089 (skip-otp guard rails — same limiter can be shared), CR-085 (phone format — lookup uses exact match until 085 lands).
- **Blast radius:** SMALL (1 file, 1 new route, no existing behaviour changed). Regression: `scan` auth routes unaffected.
- **Evidence:** INV-022 §3.3; `scan.py:303-348` (skip-otp side-effect); `pos.py:2041-2075`.
- **Owner questions:**
  - **Q1** Rate-limit values — rec: 10 req/min per IP, 5 req/5 min per phone+rid.
  - **Q2** Return full stored `name` or first token only — rec: full stored `name` (Customer App trims).

## 2. CR-094 — `GET /scan/loyalty-rules/{restaurant_id}` (public loyalty rules)

- **Classification:** CR (feature) · **Severity: P2** · **Risk: MEDIUM** — public read-only route; **does not touch** `core/loyalty.py` / `core/helpers.py` calculation (addendum §14 rule not triggered); exposes restaurant-level rules, not customer data.
- **Need (Customer App B3):** "You will earn N points" preview at checkout needs earn %, tier mins, redemption value, min order, first-visit bonus. They asked to fold these into `GET /scan/config/{rid}` — **rejected**: that collection is Customer-App-owned (D1) and is being removed from CRM (CR-095).
- **Owner ruling:** CRM builds and names the endpoint.
- **Code reality:** PARTIAL — exact whitelist exists at `GET /api/pos/loyalty/settings` (`pos_loyalty.py:44-77`, CR-080 L-1) but POS-key-authenticated; staff `GET /api/loyalty/settings` (`points.py:304`) returns the full doc (campaign limits, VIP thresholds — not for diners).
- **Fix direction (for Planning):** new public route in `scan.py` C4 block; normalise rid → `user_id`; `loyalty_settings.find_one` (fallback `default_loyalty_settings`); return CR-080 L-1 whitelist **plus** `min_order_value`, `first_visit_bonus_enabled`, `first_visit_bonus_points`, and per-tier `bronze/silver/gold/platinum_redemption_value` (CR-001C-LX). Envelope `{success,message,data}`. Cache-friendly (`Cache-Control: public, max-age=300`). Add to contract v2.1 + OpenAPI.
- **Duplicate check:** DISTINCT. RELATED: CR-088 (`expiring_soon` in `/scan/loyalty` — different scope: customer balance vs restaurant rules), CR-080 L-1 (same whitelist, different auth).
- **Blast radius:** SMALL (1 file, 1 new route). Regression: none on existing routes.
- **Evidence:** INV-022 §3.3; `pos_loyalty.py:44-77`; preprod `loyalty_settings` keys for r689.
- **Owner questions:**
  - **Q1** Include per-tier redemption values (`*_redemption_value`) in addition to flat `redemption_value`? — rec: yes (tier-aware preview matches POS behaviour since CR-001C-LX).

## 3. CR-095 — Remove orphan `/scan/config` + `/scan/menu/dietary-tags` routes (4 routes)

- **Classification:** BUG (security / ownership) · **Severity: P1** · **Risk: CRITICAL** — routes write **another team's production data** (`customer_app_config` 13 docs preprod / 28 live-era; `dietary_tags_mapping`); PUTs are **unscoped** (URL `restaurant_id` never compared to `user["id"]` → any CRM staff JWT can overwrite any tenant's branding/feature flags). Owner may upgrade to P0 if treated as a security incident.
- **Owner rulings:** D1 YES (O1 = Customer App owns `customer_app_config`) · D2 YES · symmetric rule → GETs go too.
- **Origin (INV-022 §3.5):** April-2026 API-doc exercise found these collections with zero CRM code and *planned* "CRM admin updates branding from dashboard" (C4/C5). `scan.py` was built; the CRM frontend screen never was. Assumption never agreed with the Customer App team.
- **Code reality:** DEAD — no frontend reference, no backend caller, no tests; none of the 13 config docs carry `created_at` (CRM PUT adds it on insert → CRM never created one); `dietary_tags_mapping` does not exist in preprod. **But mounted and reachable.**
- **Fix direction (for Planning):** delete `get_app_config`, `update_app_config`, `get_dietary_tags`, `update_dietary_tags` + `AppConfigUpdate`/`DietaryTagsUpdate` models (`scan.py:102-175, 713-808`). Decide 404 (delete) vs 410 Gone stub for a deprecation window (Q2). Update contract v2.1 (remove §C4/C5), regenerate OpenAPI. Closes "normalisation bug in `restaurant_id` on config save" (E2) by removal.
- **Sequencing / gate:** Customer App **currently reads `GET /scan/config`** (their B3 text). Removal only after they confirm direct-read cutover (**Q-CA-1** in outbound reply). PUT removal could go first (nobody calls it) — Q1.
- **Duplicate check:** DISTINCT. RELATED: Issue 2 "cross-team DB write conflicts" (handover — this CR *is* its resolution), CR-057 (config validation — unrelated scope), addendum §15 Q6 (multi-tenant isolation of these two collections — answered: Customer-App-owned, CRM exits).
- **Blast radius:** SMALL for CRM (nothing internal uses the routes) · **MEDIUM for Customer App** until cutover (GET consumer). Regression: all other `/scan/*` routes unaffected; run scan smoke after removal.
- **Evidence:** INV-022 §3.5; `scan.py:740-765` (no tenant check), `scan.py:785-808`; frontend grep = 0 hits; DB `created_at` trace.
- **Owner questions:**
  - **Q1** Remove the two PUTs immediately (zero callers, closes the write hole) and the two GETs after Q-CA-1? — rec: yes, two-step.
  - **Q2** Hard remove (404) or 410 Gone stub with message for 2 weeks? — rec: 410 stub for GETs during cutover window, then delete; PUTs hard-removed.

---

## 4. Not registered (no CRM code)

| Item | Why not a CR | Carried in |
|---|---|---|
| C1 Option (a) — Customer App authenticates against MyGenie POS directly | Zero CRM change | Outbound reply §C + POS note |
| Retire `users` read-contract freeze | Docs only (dashboard row below) | Dashboard transition |
| JWT-secret overlap (handover Issue 3, P0) | **Resolved by design** under C1 (a) — no shared secret needed. Keep as owner-confirmed closure, not a CR | Dashboard transition |
| `pos_event_logs` ownership | Needs Customer App / POS answer (Q-CA-2) first | Outbound reply §6 |
| POS Q: `restaurants[]` ever >1 | POS-side question | POS note |

## 5. Still proposed, NOT registered (await owner word)

| Proposed | From | Status |
|---|---|---|
| CR-091 — invoice GST % label wrong on mixed GST/VAT orders (`invoice_generator.py` denominator) | INV-021 | owner options A–D pending (POS brief sent 2026-09-28) |
| CR-092 — live digital-invoice generation silently failing since 2026-08-04 | INV-021 | needs live logs; owner intake approval pending |
