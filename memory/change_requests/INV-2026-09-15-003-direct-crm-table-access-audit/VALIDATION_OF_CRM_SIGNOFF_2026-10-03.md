# Validation of CRM's sign-off on CONTRACT v1.0-RC3
## Ref: `crm_replies/CONTRACT_v1.0_CRM_SIGNOFF.md` · Received 2026-10-03
## Verdict: **ACCEPT. No conflicts. CRM's signature is valid and complete for Part 1 §1–§6.**
## Of the two items CRM highlighted, **neither is a conflict** — and one is already satisfied in our code.

Method: every claim re-verified against our code on `3oct` (`server.py`, `LoyaltyRewardsSection.jsx`,
`ReviewOrder.jsx`, `crmService.js`) before accepting.

---

## 1. Conflict check — none found

| CRM's statement | Checked against | Verdict |
|---|---|---|
| §2a/2b/2c match their JSON exactly | our §2 was built from their JSON | ✅ consistent |
| §2d D-1/D-2: **"CRM concurs — no objection"** to owner = sole writer | this was our ask #6 ("object before signature, not after") — they did it the right way round | ✅ **the two contested rows are now agreed by both sides**, not merely ruled by us |
| §3 I1–I6 agreed, incl. I6 Pay-Bill reserved → POS | contract §3 | ✅ |
| §4a endpoints incl. `scan.py:845,863`, `{table_id, message?}`, customer token, write-only to `pos_event_logs` | our §4a | ✅ identical |
| §4d — 4 routes confirmed orphan | our grep: no caller in `frontend/src` | ✅ |
| §6 sequence agreed; feedback CR = **CR-096**, step-1 wave | our §6 step 1 said "number TBD" | ✅ **closes O-8** |
| Signs Part 1 §1–§6, cannot sign Part 2 (POS + owner items) | our §7 assigns those to POS and the owner, not CRM | ✅ correct reading |

**No clause is contradicted, narrowed or reinterpreted anywhere in the sign-off.** This is a clean
signature, not a conditional one.

---

## 2. Their Highlight #2 — **already satisfied on our side. No adapter work.**

CRM warned that `loyalty_settings` carries **four per-tier** earn percentages rather than a single
value, in case our adapter assumed one. **Our code is already per-tier**, and has been all along:

| Our code | What it does |
|---|---|
| `LoyaltyRewardsSection.jsx:29` | `loyaltySettings[\`${tier}_earn_percent\`] \|\| loyaltySettings.bronze_earn_percent \|\| 5` — reads the **tier-specific** field, falls back to bronze, then to 5 |
| `LoyaltyRewardsSection.jsx:88` | bronze path for the not-logged-in case |
| `server.py:1505-1508, 1517-1520` | our own route already returns **all four** tier fields |

And the field lists match **one for one**:

| Field | CRM will return (CR-094) | Our route returns today | Our UI reads |
|---|---|---|---|
| `bronze/silver/gold/platinum_earn_percent` | ✅ all four | ✅ all four | ✅ `${tier}_earn_percent` |
| `redemption_value` | ✅ | ✅ | ✅ |
| `min_order_value` | ✅ | ✅ | ✅ |
| `first_visit_bonus_enabled` | ✅ | ✅ | ✅ |
| `first_visit_bonus_points` | ✅ | ✅ | ✅ (via the bonus line) |
| `points_monetary_value` | ✅ (extra) | ✗ | not needed here — we take it from `/scan/loyalty` |
| `found` | ✗ | ✅ (ours) | **not read from this response** — see §3 |

**So CR-094 is a drop-in replacement for `GET /api/loyalty-settings/{rid}`.** The only thing to do
in CR-2026-10-03-004 is swap the URL. Worth noting their heads-up was good practice — it just
happened to land on something we already had right.

Corroboration of **I3** as a bonus: our route derives `user_id = f"pos_0001_restaurant_{rid}"`
(`server.py:1495`) and CRM's `_normalize_restaurant_id("689")` produces the same string
(`scan.py:30`). Both sides independently build the identical full-form id — the identity clause is
not theoretical.

---

## 3. One finding of our own — `exists` must map to `found` (first-visit bonus)

Not a conflict with CRM, but a scope item their sign-off let us catch before we write code.

`/api/customer-lookup` (the route **CR-2026-10-03-004 retires**) returns a `found` flag, and our UI
uses it for more than the points preview:

```
LoyaltyRewardsSection.jsx:36   const isNewCustomer = lookedUpCustomer && !lookedUpCustomer.found;
ReviewOrder.jsx:423            if (data.found && data.name) { ... }
ReviewOrder.jsx:1867           const pts = lookedUpCustomer?.found ...
```

`isNewCustomer` is what drives the **"first visit bonus" line** at checkout. Owner decision
**F2 = (a)** accepted losing the *points/tier* preview for a diner with no token — it did **not**
consider the first-visit-bonus line, which depends on the same response.

**Good news: nothing is actually lost.** CRM's B1 endpoint returns `{exists, name}`, and `exists`
is semantically our `found`. So the mapping is:

| Old | New | Drives |
|---|---|---|
| `found` (`/api/customer-lookup`) | **`exists`** (`POST /scan/auth/lookup`, CR-093) | `isNewCustomer` → first-visit-bonus line |
| `name` | `name` | greet-by-name / checkout pre-fill |

**Action:** added to CR-2026-10-03-004 scope so the first-visit-bonus line survives the swap. If we
had missed it, the bonus would have silently started showing for *every* diner
(`!undefined === true` → everyone treated as new).

---

## 4. Part-2 items closed by this sign-off

| # | Was | Now |
|---|---|---|
| **D-3** | `otp_tokens` contradicted CRM's own E3 | ✅ **CLOSED.** E3 was scoped to the *customer* OTP store (`customer_otps`, `scan.py:193-287`); `otp_tokens` is a separate **staff** password-reset store (`auth.py:608-751`) and does exist. Our restored row is correct as filed |
| **O-8** | feedback CR number + short-form rid unknown | ✅ **CLOSED.** Feedback CR = **CR-096**, step-1 wave, firm date at their PLANNING gate. `restaurant_id` = **short form `"689"`**, normalised CRM-side |
| **O-10** | no change notice on the six `users` fields | ✅ **CLOSED — agreed.** CRM will give advance notice before renaming/dropping `id`, `email`, `phone`, `password_hash`, `restaurant_id`, `pos_id` until we confirm §6 step 3. All six confirmed present. **This was the risk most likely to cause a silent admin-login outage; it is now covered** |
| **O-7** | GAP-11 live host | unchanged — **owner action**, not CRM's. Preview verified; live host still to confirm |
| **O-9** | CR-093/094 not shipped | unchanged — now also CR-096. Their PLANNING gate is not yet open, so **no dates yet** |
| D-1/D-2 | ruled by owner | ✅ now **mutually agreed** (CRM concurs explicitly) |

**Remaining Part-2 items are POS-only plus two owner actions** — exactly as CRM states in their §D.

---

## 5. What is now required from us

1. **Countersign Part 1.** On the Customer-App signature, §1–§6 becomes **v1.0 FROZEN**. Nothing in
   Part 1 needs editing first — CRM accepted it as written.
2. Record **CR-096** in §6 step 1 and make the CR-094 field list explicit (four tier fields, not
   `*_earn_percent`), so no future adapter repeats the ambiguity CRM flagged.
3. Carry the `exists` → `found` mapping into CR-2026-10-03-004.

Still ours to chase, unchanged: **POS** (P1-refined, P5, P6, P7), **F3**, **O-7**, and the stray
`showLandingPayBill` on restaurant 672.

```text
Validation complete: CRM sign-off on contract v1.0-RC3
Verdict: ACCEPT — clean signature, no conflicts, no conditional clauses
Highlights raised by CRM: 2 — #1 concurrence (not a conflict), #2 already satisfied in our code (evidence in §2)
Closed by this sign-off: D-3, O-8, O-10 · D-1/D-2 upgraded from "owner ruled" to "mutually agreed"
New finding of ours: exists→found mapping required so the first-visit-bonus line survives CR-004
Next: owner countersignature → Part 1 v1.0 FROZEN
```
