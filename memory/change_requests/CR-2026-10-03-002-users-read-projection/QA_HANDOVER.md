# QA HANDOVER — CR-2026-10-03-002 (users read projection)

**Status:** IMPLEMENTED · self-tested · **awaiting QA (Role 4)**
**Severity:** P0 security · **Risk:** CRITICAL by area (admin auth path), change is additive
**Branch:** `3oct` · **Code marker:** `# CR-2026-10-03-002`

---

## 1. What changed — 1 file, 3 edits

`backend/server.py`

| Edit | Location | Change |
|---|---|---|
| 1 | before `get_current_user` (~L354) | added `USERS_AUTH_PROJECTION` + `USERS_LOGIN_PROJECTION` constants (single definition point, so the two call sites cannot drift) |
| 2 | `get_current_user` (L379) | `{"_id": 0}` → `USERS_AUTH_PROJECTION` |
| 3 | `POST /api/auth/login` step 2 (L599) | `{"_id": 0}` → `USERS_LOGIN_PROJECTION` |

Effect: the `users` document goes from **30 fields to 9**. Dropped, among others:
`api_key` (CRM's live `dp_live_`-prefixed credential), `authkey_api_key`,
`pos_crm_token_response`, and — on the `get_current_user` path only — `password_hash`.

`mygenie_token` is **deliberately retained**. See `IMPACT_ANALYSIS.md` §3: `GET /api/table-config`
reads it as a live fallback, and dropping it would have caused an admin-screen outage.
Residual tracked as **CR-2026-10-04-001**.

**Nothing else touched** — no frontend, no `.env`, no schema, no CRM document ever written.

## 2. Self-test evidence

```
pytest (contract + smoke)   → 21 passed · 12 snapshots passed · 0 errors
POST /api/auth/login        → 200, user payload byte-identical (7 fields + pos_token set)
GET  /api/auth/me           → 200, keys = [email, id, mygenie_token, phone, pos_id,
                                           pos_name, restaurant_id, restaurant_name, user_type]
                              api_key ABSENT · authkey_api_key ABSENT · password_hash ABSENT
```

Tested through the external preview URL, not `localhost`.

## 3. What QA must cover (the 3 things self-test could not)

| # | Test | Why it matters | Expected |
|---|---|---|---|
| **Q1** | Admin **QR / table-config** screen, with `localStorage.pos_token` **deleted** before load | This is the exact path that the originally-planned projection would have broken. It exercises the `mygenie_token` DB fallback | Tables/rooms list loads. **Not** `400 "No POS token provided"` |
| **Q2** | Admin config **save** → reload → value persists, and lands under the right `restaurant_id` | `restaurant_id` comes out of the projected document | saved value persists on the correct outlet |
| **Q3** | Full admin surface after a **hard reload** (JWT restored from `localStorage`, so `/api/auth/me` is the only identity source) | `/auth/me` now returns a narrower object into `AuthContext` | no blank screens, no `undefined` in admin headers, Visibility/Menu/Content tabs all render |

> **Q3 update (session after 2026-10-03).** Q3 initially failed on a **pre-existing, unrelated** bug
> — `AdminLayout` redirected to `/login` before `AuthContext` finished restoring the session
> (CR-2026-10-04-003). That fix was implemented and then **reverted at the owner's instruction**,
> because it belongs to CR-2026-09-12-008. **Consequence: a hard reload of `/admin/*` still bounces
> to `/login` in `3oct`, and that is expected, accepted behaviour — not a defect of this CR.**
>
> This CR's own concern — whether the narrower `/api/auth/me` object still hydrates the admin UI —
> was therefore re-verified *without* the reverted fix, via login → navigate: the sidebar,
> `owner@18march.com` and `18march` all render and no `undefined` appears. Re-test Q3 that way, not
> by reloading.

Also re-confirm: customer login + profile/orders/points/wallet are **unaffected** (those read
`db.customers`, untouched) — one pass is enough.

## 4. Known, accepted deviations from the Intake doc

1. **Intake said "7-field projection"; shipped 9 (login: 10).** Reason: `mygenie_token` is consumed
   at `server.py:902-905`, and `restaurant_name` / `pos_name` are returned by the login response.
   The Intake's claim *"nothing in our code reads them"* is corrected in `IMPACT_ANALYSIS.md` §3.
2. **Acceptance criterion 2 is intentionally not met literally.** `/api/auth/me` no longer returns
   the *same* fields — returning fewer is the entire point. No frontend consumer reads any removed
   field (`grep` → 0 hits).

## 5. Rollback

Revert the 3 edits in `backend/server.py`. No migration, no env change, no data change.
Hot reload picks it up; no supervisor restart needed.

## 6. Unrelated finding, logged not fixed

`users` holds `pos_crm_token_response` — an undocumented token blob named in no CR and in no
contract ownership row. It is now projected away, so it is harmless to us, but **CRM may not know
it is storing it**. Worth raising with CRM via the owner at the next round. Not a Customer App defect.
