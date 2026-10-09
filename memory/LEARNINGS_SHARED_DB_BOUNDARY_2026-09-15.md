# Learnings — Shared DB / CRM boundary (INV-2026-09-15-002 + -003)
## Written 2026-09-15 after owner discussion. Read this before touching any `db.*` call in server.py.

## The rule (owner, 2026-09-15)
**Customer App must not read or write any MongoDB collection that CRM writes.**
Customer data flows only through CRM `/api/scan/*`. **No permanent exceptions.** The `users` read for
admin login is a *temporary* violation tracked as **CR-2026-09-15-004** (projection first, then replace
with CRM admin-login API or our own `admin_users`).

## Owner decisions taken in chat 2026-09-15 (freeze on board)
- **O2 = A** dietary tags → Customer App owns.
- **O6 = option 1** greet-by-name, checkout pre-fill, points preview → ALL via CRM API. We do not peek
  into `customers`/`loyalty_settings`. "Token-less" is only a question of *how* CRM exposes it
  (public endpoint vs require login first) — CRM decides; either way it is CRM's API.
- **O4 → CR-004** `users` exception is not acceptable long-term; separate CR registered.

## What we own (and may write)
`customer_app_config` (OD-7) · `dietary_tags_mapping` (owner: ours, O2=A) · `non_qr_blocks` · `status_checks`.
Everything else in `mygenie` is CRM's. POS does **not** write to Mongo directly — POS pushes to
CRM's API and CRM writes. Do not describe POS as "sharing the DB".

## Facts verified by code + live DB (do not re-derive)
1. `server.py` has 31 `db.*` calls. 11 on our 4 collections; **20 on 8 CRM collections**.
2. Of those 20: **14 dead** (no frontend caller — frontend already uses `crmService.js` → `/scan/*`),
   **6 live**: `feedback` write (wrong schema), `users` ×2 (admin auth, no projection),
   `customers` ×2 + `loyalty_settings` ×1 (pre-login lookups, token-less — no CRM equivalent).
3. `/api/auth/login` customer branch is dead: `Login.jsx` sends email+password (admin);
   `AuthContext.login()` is defined but never called. Only the admin branch runs.
4. `feedback` collection's only doc is CRM-shaped (`user_id, customer_name, customer_phone, status`).
   Our insert uses `restaurant_id, name, email`. Zero rows of ours exist → safe to delete route.
5. No admin page reads `GET /api/config/feedback/{rid}` — admins see feedback in CRM dashboard.
6. Profile tabs (orders/points/wallet) call CRM via `crmGetOrders/Points/Wallet` but still on
   **v1 paths** `/customer/me/*` → 404 on v2. Fix = `/scan/orders`, `/scan/points/history`,
   `/scan/wallet/history` (CR-2026-09-15-001). They do NOT and should NOT come from our backend.
7. JWT: ours = 63-char env secret; CRM's is different but has a hardcoded fallback
   `dinepoints-secret-key-2024` (CRM-side risk). No cross-validation possible today.
8. `restaurant_id` in `customer_app_config` is short string `"689"`. CRM's PUT does not normalise →
   duplicate-doc risk if ever called with `pos_0001_restaurant_689`.

## CRM reply INV-022 (2026-09-28) — validated, all accepted (see INV-003/VALIDATION_OF_CRM_REPLY_INV_022.md)
- Symmetric rule now agreed: CRM never touches our 4 collections either. CRM removes PUT+GET /scan/config and /scan/menu/dietary-tags (CR-095). We already read both via our own API → tell CRM "remove now".
- CRM builds `POST /scan/auth/lookup {phone, restaurant_id}` → `{exists,name}` (CR-093) and public `GET /scan/loyalty-rules/{rid}` (CR-094). Points/tier/wallet stay login-gated. We already skip-otp on landing (LandingPage.jsx:462) so login precedes checkout except in the degraded-guest fallback.
- `POST /scan/feedback` = token required, body `{rating, message?, order_id?}`; name/email NOT accepted. Feedback becomes login-only.
- **Admin login: CRM is not the identity provider.** CRM proxies MyGenie POS `login → profile`; its `users` row is a cache. We must do the same (we already call POS `/auth/vendoremployee/login` in `refresh_pos_token`). CR-004 → Option D. "Stable users fields" contract retired. `pos_id` = constant `"0001"`.
- Phone to CRM = exact 10 digits (no +91). Token `restaurant_id` claim is FULL form; `crmService.js:37` already handles it.
- A2 no `skip`; A4 no `order_id`; A5 no `balance_after`; A6 `end_date`; A10 field is `table_id`.
- `otp_tokens` does not exist (OTP store = `customer_otps`). `import_logs`, `webhook_logs`, `coupon_distributions`, `customer_documents` = CRM-owned. JWT fallback removed in CRM code (live-host check pending).

## Owner responses to F1–F4 (2026-09-28) — see INV-003/OWNER_RESPONSES_F1-F4_2026-09-28.md
- F1: do NOT frame feedback as "login-only" or "anonymous". Owner position: we always identify the diner (token, else phone+restaurant_id) and CRM defines how its endpoint stores it → ask CRM (A9-b).
- F2: owner rejects "we lose the preview" as a given. Only no-token paths (degraded guest = CRM down; OTP-only = SMS not live) lack points; fix = retry skip-otp at checkout + lookup name + "log in to see points". Present, don't assume.
- F3: POS-direct admin login NOT approved yet. Must write CR-004 IMPACT_AND_NEW_FLOW.md first.
- F4: YES — tell CRM to remove the 4 config/dietary routes now.
- General: owner wants options with impact spelled out before a brief goes out; never send a CRM brief containing a position the owner has not confirmed.

## Mistakes made this session (don't repeat)
- Rated `feedback` as "LOW risk, append-only" before checking the live doc shape. Always inspect
  one real document before classifying a shared collection.
- Said "POS shares the DB" without evidence. Say "POS → CRM API → DB".
- Listed 34 collection names against a 33-count probe. Re-count on next probe.
- Wrote "feedback becomes login-only — accept" as a recommendation; owner reframed it as CRM's storage decision with us always identifying the diner. Don't convert a CRM constraint into our product decision without asking.
- Wrote "degraded guest loses points preview" as a fact; it is a design choice with a fix. State the fix with the loss.

## Customer identity (how we identify a customer to CRM)
- Pre-login: `phone` 10-digit national + `restaurant_id` short `"689"`.
- Post-login: CRM customer JWT (claims `customer_id`, `restaurant_id`, `phone`) as Bearer. Don't re-send restaurant_id if token carries it (CRM to confirm).
- Admin: email+password → today CRM `users` read (CR-004 replaces).

## Where things live
- Board: `change_requests/INV-2026-09-15-002-.../OWNERSHIP_BOARD.html` → `GET /api/docs/ownership-board`
- Audit: `change_requests/INV-2026-09-15-003-direct-crm-table-access-audit/INVESTIGATION_REPORT.md`
- CRM briefs: `.../INV-002/CRM_BRIEF_OWNERSHIP_BOARD.md` (fill-in JSON) · `.../INV-003/CRM_BRIEF_ENDPOINT_VALIDATION.md` (A/B/C/D buckets)
- Owner Qs: O1–O7 on the board. POS Qs: P1–P4. CRM Qs: A1–A6, B1–B4.

## Next steps in order (post INV-022)
1. Owner confirms F2 proposal + F1 wording → send `REPLY_TO_CRM_INV_022.md` DRAFT v2 (includes A9-b) + `CRM_BRIEF_OWNERSHIP_BOARD.md`. F4 already yes.
1b. Write CR-004 `IMPACT_AND_NEW_FLOW.md` → owner F3 approval. Ask POS P5 in parallel.
2. **P0 code**: projection on `users` reads (server.py L587, L367) — interim until CR-004 D.
3. **O7** → delete 14 dead call sites. Zero user impact.
4. **CR-2026-09-15-001** → profile tabs to v2 paths with field adapters (A2/A4/A5/A6 notes).
5. Feedback → `/scan/feedback` login-only (new CR, after F1).
6. When CRM ships CR-093/094: swap `check-customer` → `/scan/auth/lookup`, `loyalty-settings` → `/scan/loyalty-rules`; delete our 3 pre-login routes.
7. CR-004 D: POS login→profile admin auth, once POS answers P5.
8. Sign OWNERSHIP_MAP.md after CRM board JSON + POS P1/P4/P5.
