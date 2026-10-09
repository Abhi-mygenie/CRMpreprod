# IMPACT ANALYSIS — BUG-2026-10-06-001

| Field | Value |
|---|---|
| **Item** | BUG-2026-10-06-001 — Non-QR policy telemetry records blocks but never bypasses |
| **Stage** | Impact Analysis (Role 2, step 8). Implementation Plan **not** written — awaits Gate 2 |
| **Date** | 2026-10-07 |
| **Author** | E1 (Role 2 — Planning, read-only) |
| **Intake** | `INTAKE_DOC.md` (2026-10-06) |
| **Code reality** | **PARTIAL** — pipe, collection, index and reason strings exist; only the allow-path call is missing |
| **Risk (change)** | **LOW** — additive, fire-and-forget, zero order-outcome change |
| **Risk (process)** | **HIGH** — touches 2 CRITICAL-default hotspot files (`ReviewOrder.jsx`, `server.py`, addendum Part C). Hotspot approval + §5.2/§5.7 minimum regression apply. No Fast Lane |

---

## 1. Code reality — re-verified from source this session

| # | Claim in intake | Verified | Actual location |
|---|---|---|---|
| 1 | C1 landing: `postNonQrBlock` inside `if (policy.block)` | ✅ | `LandingPage.jsx:538-547`; debug `console.log` at `:527-536` |
| 2 | C2 add-to-cart: `if (!policy.block) return false;` before the call | ✅ | `MenuItems.jsx:490-498`; only fires when cart is empty (`:478`) |
| 3 | C3 place order: inside `if (policy.block)` | ✅ | `ReviewOrder.jsx:901-910` |
| 4 | Policy returns a reason on every path | ✅ | `orderAccessPolicy.js:37-69` — 6 reasons |
| 5 | Payload builder owns the shape | ✅ | `orderAccessPolicy.js:76-83` `buildNonQrBlockPayload` — no `decision`/`allowed` field today |
| 6 | Backend accepts and stores | ✅ | `server.py:1657-1665 NonQrBlockEvent`, `:1687 POST /api/diagnostics/non-qr-block`, doc `:1697-1709` |
| 7 | Index exists | ✅ | `rid_ts_desc` on `(restaurant_id, ts)` `:1677-1680` |
| 8 | No read endpoint exists | ✅ | `diagnostics_router` has **one** route (POST). `GET` summary does not exist |

**Two facts the intake did not surface:**

- **F1 — Rolling cap of 200 per restaurant** (`server.py:1668`, `:1714-1727`). The route deletes the oldest docs once a restaurant exceeds 200. Today only blocks are stored, so 200 ≈ months of history. After the fix, every QR diner at a switch-off restaurant produces up to **3 allow events per order** (C1 + C2 + C3). A busy restaurant would roll the cap in a day and **push its rare block events out of the collection**. The fix as sketched in chat would make the block history *less* durable than today — the opposite of the intent. See §5 D4.
- **F2 — `is_authenticated` not sent from C2.** `MenuItems.jsx:493` omits `isAuthenticated` from the payload context (C1 and C3 include it). Pre-existing; not caused by this bug. Noted, out of scope unless owner wants it folded in (one-line).

Minor: `selectedMode` is a documented policy input (`orderAccessPolicy.js:28`) but no checkpoint passes it. Pre-existing, no behavioural effect today, **not** in scope.

---

## 2. Data flow — before and after

```text
BEFORE (today)
  checkpoint → shouldBlockNonQrOrder → { block, reason }
       block=true  → clearCart → postNonQrBlock(payload) → POST → db.non_qr_blocks   ✔ recorded
       block=false → (C1 only) console.log in diner's browser                        ✘ lost

AFTER (proposed)
  checkpoint → shouldBlockNonQrOrder → { block, reason }
       allowNonQrOrders === false ?
           yes → postNonQrBlock(payload + { decision: reason, allowed: !block })     ✔ both outcomes recorded
           no  → nothing                                                              (no estate-wide flood)
       block=true → clearCart + modal exactly as today                                ✔ unchanged
```

Order outcome is decided **before** and **independently of** the telemetry call on every path. The telemetry call is `sendBeacon`/`fetch keepalive` in a `try/catch` (`diagnosticsService.js:14-38`) — it cannot throw into the caller.

---

## 3. Affected files and downstream consumers

### 3a. Files that WILL change

| File | Change | Hotspot? |
|---|---|---|
| `frontend/src/pages/LandingPage.jsx` (~`:527-547`) | Move `postNonQrBlock` out of `if (policy.block)`, guard with `allowNonQrOrders === false`; remove/gate the `console.log` at `:527` (intake S4) | HIGH (addendum §6.7) |
| `frontend/src/pages/MenuItems.jsx` (~`:490-498`) | Same; call before the `if (!policy.block) return false;` early-return | — |
| `frontend/src/pages/ReviewOrder.jsx` (~`:901-910`) | Same | **CRITICAL** (Part C) |
| `frontend/src/utils/orderAccessPolicy.js` (`:76-83`) | `buildNonQrBlockPayload(ctx, checkpoint, policy)` adds `decision`, `allowed`. **Reason logic `:37-69` untouched** | — |
| `backend/server.py` (`:1657-1665`, `:1697-1709`) | `NonQrBlockEvent` + `decision: Optional[str]`, `allowed: bool = False`; write both into doc. Cap handling per D4 | **CRITICAL** (Part C) |
| `backend/server.py` (new, only if D5 = yes) | `GET /api/diagnostics/non-qr-block/{rid}/summary` — admin JWT, `$group` by `decision`/`allowed` | CRITICAL |

Deviation from the chat plan: the two new fields belong in `buildNonQrBlockPayload` (policy module owns the record shape, by its own comment) — **not** in `diagnosticsService.js`, which stays a dumb transport. `diagnosticsService.js` therefore moves to the WILL-NOT list.

### 3b. Files that WILL NOT change

`orderAccessPolicy.js:37-69` (reasons) · `diagnosticsService.js` · `useScannedTable.js` · `RestaurantConfigContext.jsx` · `CartContext.js` · `AuthContext.jsx` · admin pages · `App.js` · any localStorage key · any config key · collection name, endpoint path, index name.

### 3c. Downstream consumers

| Consumer | Impact |
|---|---|
| Existing docs in `db.non_qr_blocks` (5 known for rid 698) | **None.** New fields are additive; old docs simply lack `decision`/`allowed`. Reader must treat missing `allowed` as `false` (= legacy block) |
| Restaurant 716 | **Zero behavioural change.** Carve-out stays. It becomes visible as `decision: rid-716-carveout, allowed: true` — only when 716 has the switch off |
| Restaurants with switch on/absent (the default, estate-wide) | **Zero events emitted**, as today |
| Restaurants with switch off | Allow events start flowing; see F1 cap interaction |
| `CR-2026-10-06-001` (walk-in enforcement A/B/C/D) | Becomes **sizable** — this is the point |
| `CR-2026-10-06-002` (multi-menu skip) | Same files, HELD. No merge contention if this ships first |
| `CR-2026-07-04-004` (client telemetry + admin read endpoint) | Still INTAKE — **not built**, so intake S5 "reuse its read endpoint" is not available today. See D5 |

---

## 4. Risk assessment

| Dimension | Rating | Why |
|---|---|---|
| Order-outcome change | **None** | Decision taken before telemetry; telemetry cannot throw |
| Customer-facing UI | **None** | No new UI on the diner side |
| Data / schema | **LOW** | Two additive optional fields, same collection, same index |
| PII | **None added** | Payload stays `rid, checkpoint, scan type, table id, flags`; server adds IP/UA as today |
| Volume / cost | **MEDIUM → mitigated** | Up to 3 events per QR order at switch-off restaurants. Bounded by cap; cap strategy must change (D4) |
| Hotspot exposure | **HIGH process** | `ReviewOrder.jsx` + `server.py` are CRITICAL-default. Minimum regression §5.2 (order placement) + §5.7 (non-QR block) mandatory |
| Rollback | **Trivial** | Revert 5 files; no migration; old docs unaffected |

**Net:** change risk LOW; process risk HIGH because of file class, not because of logic. Recommend the registry carry `risk: LOW` with `status_note` recording the hotspot regression obligation, **or** owner ratifies MEDIUM. Agent does not downgrade from the Part C default without owner word.

---

## 5. Owner decisions required before Gate 2

| ID | Question | Options | Recommendation |
|---|---|---|---|
| **D1** | Log `policy-disabled` (switch on/absent) allow events? | (a) No (b) Yes, sampled | **(a) No.** It is one event per page view at every restaurant for zero diagnostic value |
| **D4** *(new, from F1)* | Rolling cap of 200 per restaurant will now be consumed by allow events and evict blocks | (a) Raise cap to e.g. 2 000 (b) Separate caps: 200 for `allowed:false`, 1 000 for `allowed:true` (c) Replace cap with a Mongo TTL index (e.g. 30 days — matches CR-2026-07-04-004's intent) | **(b).** Keeps block history as durable as today; allows are the high-volume stream and get their own budget. (c) is cleaner but is a new index on a shared DB — needs the cross-team note |
| **D5** *(new, from F3 §1 row 8)* | Intake V8 "owner can see a per-restaurant count by reason" — nothing exists to read it | (a) Add minimal admin-JWT `GET …/summary` in this item (b) Defer V8 to CR-2026-07-04-004, verify V1–V7 via direct DB read | **(a).** ~20 lines, read-only, admin-gated; without it the owner has to ask an agent to query Mongo to answer "is my switch doing anything?" |
| **D6** *(minor, F2)* | Fold the missing `isAuthenticated` on C2 into this fix? | yes / no | **Yes** — one word, same line, same marker |

---

## 6. Verification matrix (Impact-Analysis level; detail in Implementation Plan)

| Intake V# | Check | Method |
|---|---|---|
| V1 | Switch off + walk-in QR → allowed **and** `decision: valid-qr, allowed: true` | Browser + Mongo read |
| V2 | 716 carve-out, edit mode, takeaway/delivery → allowed + correct `decision` | Browser + Mongo read |
| V3 | Switch on/absent → **zero** events on landing, add, place | Network tab shows no POST |
| V4 | Block path unchanged: `decision: non-qr-dinein, allowed: false`, modal, `clearCart` — legacy docs still readable | Browser + Mongo read |
| V5 | **Not one order outcome changes** | §5.2 + §5.7 minimum regression, all 3 checkpoints, both switch states |
| V6 | Backend down → diner flow unaffected | Stop backend, run V1 |
| V7 | No PII in payload | Payload diff |
| V8 | Per-rid count by reason visible | D5(a): `GET …/summary`; D5(b): Mongo `$group` |
| New | Cap behaviour per D4 — blocks survive a flood of allows | Seed 250 allows + 5 blocks, assert blocks remain |

---

## 7. Conflicts

None blocking. `CR-2026-10-06-001` / `-002` touch the same three pages but are HELD on owner rulings; shipping this first is the recommended order (it is what lets them be sized). `CR-2026-07-04-004` overlaps on the *read* side only (D5).

---

## 8. Role boundary

No application code written. `frontend/` and `backend/` unmodified by this analysis. Registry: `status INTAKE → PLANNING`, `artefacts: INTAKE, IMPACT_ANALYSIS`.

```text
Planning complete: BUG-2026-10-06-001
Stage: Impact Analysis
Code reality: PARTIAL
Risk: LOW (change) / HIGH (process — 2 CRITICAL-default hotspot files)
Files WILL change: LandingPage.jsx · MenuItems.jsx · ReviewOrder.jsx · orderAccessPolicy.js (payload builder only) · server.py (model + doc, cap per D4, optional GET per D5)
Files WILL NOT touch: orderAccessPolicy.js:37-69 · diagnosticsService.js · useScannedTable.js · contexts · admin pages · App.js · localStorage/config keys
Owner decisions: D1, D4, D5, D6
Docs: this file · ../index.yml
Next: Gate 2 (owner accepts) → Implementation Plan → Gate 3 phrase "Role 3 approved for BUG-2026-10-06-001"
```

---

## 9. Owner rulings — 2026-10-07 (recorded verbatim-equivalent)

| ID | Ruling |
|---|---|
| D1 | **(a)** — do not log `policy-disabled`; events only where the rule is enforced (`allowNonQrOrders === false`) |
| D4 | **(b)** — two buckets: cap 200 for `allowed:false`, cap 1 000 for `allowed:true`, per restaurant |
| D5 | **(b)** — **no** read endpoint in this item; V8 verified by direct DB read; owner-facing summary deferred to CR-2026-07-04-004 |
| D6 | **yes** — add `isAuthenticated` to the C2 payload context |

Gate position after rulings: **Gate 2 decisions complete; owner has NOT said "Gate 2 accepted" and has asked to stay at gate.** Implementation Plan not to be written until instructed.
