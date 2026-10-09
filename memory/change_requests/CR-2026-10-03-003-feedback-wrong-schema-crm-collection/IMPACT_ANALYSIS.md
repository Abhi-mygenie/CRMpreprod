# IMPACT ANALYSIS — CR-2026-10-03-003

| Field | Value |
|---|---|
| **Item** | CR-2026-10-03-003 — Feedback written into CRM's `feedback` collection in our own schema; migrate to `POST /scan/feedback` |
| **Stage** | Impact Analysis (Role 2, step 8). Implementation Plan **not** written — awaits Gate 2 |
| **Date** | 2026-10-07 |
| **Author** | E1 (Role 2 — Planning, read-only) |
| **Intake** | `INTAKE_DOC.md` (2026-10-03) |
| **Code reality** | **PARTIAL** — page + wrong write exist; `crmSubmitFeedback` does not exist; CRM token-only endpoint shipped; CRM anonymous path **not** shipped |
| **Risk (area)** | **CRITICAL** by intake (live write into CRM-owned collection on shared DB) |
| **Risk (change)** | **MEDIUM** — the change *removes* the shared-DB write; residual risk is the external CRM dependency and a visible UX change |

---

## 1. Code reality — re-verified from source this session

| # | Item | Verified | Location |
|---|---|---|---|
| 1 | Page posts to our backend | ✅ | `FeedbackPage.jsx:34` → `POST {REACT_APP_BACKEND_URL}/api/config/feedback`, body `{name, email, rating, message, restaurant_id}` |
| 2 | Page does **not** use auth | ✅ | No `useAuth()` import — it cannot reach `crmToken` today |
| 3 | Success toast fires on any 2xx | ✅ | `:40-41` — "Thank you for your feedback!" regardless of where the data went |
| 4 | Backend writes our shape into `db.feedback` | ✅ | `server.py:1297 FeedbackCreate`, `:1304-1316 submit_feedback`, `insert_one` at `:1315` |
| 5 | Dead read route | ✅ | `server.py:1318-1324 GET /config/feedback/{rid}` — **zero frontend callers** (grep confirms) |
| 6 | `crmService.js` has no feedback function | ✅ | Pattern to copy: `crmAuthFetch(endpoint, token, opts)` `:176` — adds Bearer + per-restaurant `x-api-key` |
| 7 | Route registered | ✅ | `App.js:103` `/:restaurantId/feedback` |
| 8 | CRM token-only endpoint shipped | ✅ (2026-10-06 handover: 200 with token) | `POST {REACT_APP_CRM_URL}/scan/feedback` |
| 9 | CRM anonymous/hybrid path (CR-096) shipped? | ❌ **No** — re-probed this session against current `REACT_APP_CRM_URL`: no-token POST → **403** for both `{}` and `{phone, restaurant_id, rating}` (non-writing probe) | — |

Environment note: `REACT_APP_CRM_URL` host changed again since the last handover (owner-managed). Probe used the current value.

---

## 2. Data flow — before and after

```text
BEFORE
  FeedbackPage (anonymous form: name, email, rating, message)
      → our backend POST /api/config/feedback
      → db.feedback.insert_one({id, restaurant_id, name, email, rating, message, created_at})   ✘ CRM-owned collection, foreign shape
      → "Thank you" toast                                                                        ✘ false success

AFTER (token path — shippable now)
  FeedbackPage reads crmToken from useAuth()
      token present → crmSubmitFeedback(token, {rating, message, order_id?})
                    → CRM POST /scan/feedback (Bearer)  → CRM stores its own shape, linked to customer  ✔
                    → 2xx → success UI ; 4xx/5xx → honest error, no success toast               ✔
      token absent  → D2 decides (see §5)
  Backend: POST + GET /config/feedback and FeedbackCreate DELETED → grep "db.feedback" = 0 hits   ✔
```

---

## 3. Affected files and downstream consumers

### 3a. Files that WILL change

| File | Change | Hotspot? |
|---|---|---|
| `frontend/src/api/services/crmService.js` | **Add** `crmSubmitFeedback(token, { rating, message, order_id })` → `crmAuthFetch('/scan/feedback', token, { method: 'POST', body })`. v2 only (no v1 equivalent exists) | HIGH-adjacent (all CRM calls live here) — additive export, no existing function touched |
| `frontend/src/pages/FeedbackPage.jsx` | Import `useAuth`; replace `fetch` at `:34`; remove Name/Email fields + their validation (`:28`); honest error on failure; no-token behaviour per D2 | — |
| `backend/server.py` (`:1293-1324`) | Delete `FeedbackCreate`, `POST /config/feedback`, `GET /config/feedback/{rid}` | **CRITICAL** (Part C) — deletion only |
| `frontend/src/pages/FeedbackPage.css` | Only if removed fields leave orphan classes — cosmetic | — |

### 3b. Files that WILL NOT change

`AuthContext.jsx` (reads `crmToken` via existing hook only) · `RestaurantConfigContext.jsx` (`feedbackEnabled`, `feedbackIntroText` stay) · landing builtin menu entry `{id:"feedback"}` (`server.py:1148`) · `AdminConfig` toggle · `App.js` route · existing documents in CRM's `db.feedback` (**we never write or delete there** — D3) · any localStorage key.

### 3c. Downstream consumers

| Consumer | Impact |
|---|---|
| Diners **with** a CRM session (logged in / skip-otp) | Feedback now lands in CRM, correctly shaped, linked to their customer record. Name/Email no longer typed |
| Diners **without** a session | **Behaviour change** — today they can submit (into the void); after, per D2 |
| CRM feedback screens | Start showing Customer App feedback for the first time |
| `GET /api/config/feedback/{rid}` | Deleted — zero callers, nothing breaks |
| `CR-2026-10-03-001` (14 dead call sites) | Count drops 14 → 13; its doc needs a one-line note that the read route is removed by this CR |
| `INV-2026-09-15-002` ownership board | `feedback` row flips to "CRM exclusive" once this ships |
| `feedbackEnabled = false` restaurants | Unchanged — feature stays hidden |

---

## 4. Risk assessment

| Dimension | Rating | Why |
|---|---|---|
| Shared-DB write | **Removed** | Only live write into a CRM collection goes away — this is a risk *reduction* |
| External dependency | **MEDIUM** | Feedback now fails if CRM is down/rejects. Mitigated by honest error (acceptance #4) — this is the correct behaviour vs today's false success |
| Auth-adjacent | **LOW** | Read-only use of `crmToken`; no change to how it is issued/stored |
| UX | **MEDIUM (visible)** | Name/Email fields vanish; anonymous diners may be asked to sign in (D2). Owner must see this before Gate 3 |
| Data loss | **None** | Nothing migrated; existing foreign docs left in place (D3) |
| Hotspot exposure | server.py edit is a pure deletion of 3 unreferenced symbols — lowest-risk class of server.py edit. Smoke: `/api/config/{rid}` and `/api/auth/*` still respond |
| Rollback | **Trivial** | Revert 3 files; backend routes come back from git |

**Net:** MEDIUM. Intake's CRITICAL label describes the *defect area*; the *change* lowers exposure. Agent does not downgrade the registry label without owner word — owner may ratify MEDIUM at Gate 2.

---

## 5. Owner decisions required before Gate 2

| ID | Question | Options | Recommendation |
|---|---|---|---|
| **D2** | Anonymous diners — CRM hybrid path (CR-096) still returns 403 today | (a) Ship token-only now; no token → honest "Please sign in to leave feedback" (link to login); add hybrid body when CR-096 lands (one-line change in `crmSubmitFeedback`) (b) Wait for CR-096, ship both together (c) Keep anonymous feedback on our backend meanwhile | **(a).** Stops the live write into CRM's collection today; (c) is rejected because it keeps the defect; (b) leaves a CRITICAL-area defect open for an unknown period |
| **D3** | Existing foreign-shaped docs in CRM's `db.feedback` | (a) Ask CRM to purge/migrate (data task on their side) (b) Leave in place | **(a)** — raise as a CRM data task; we do not write a cleanup script against their collection |
| **D7** *(new)* | `order_id` — CRM accepts it optionally | (a) Omit in v1 (b) Pass last placed order id if present in session (c) Add an order picker | **(a) omit.** Smallest surface; (b) needs a reliable "last order" source that does not exist as a single key today |
| **D8** *(new, UX)* | Confirm removal of Name/Email fields is acceptable (intake prerequisite #3) | yes / no | **Yes** — identity comes from the token; typing a name again is redundant and was never read |
| **D9** *(new, sequencing)* | Read route `GET /config/feedback/{rid}` — delete here or leave to CR-2026-10-03-001? | here / CR-001 | **Here** — same code block, same session, one marker; CR-001 count becomes 13 |

---

## 6. Verification matrix (Impact-Analysis level; detail in Implementation Plan)

| Acceptance # | Check | Method |
|---|---|---|
| 1 | With CRM token → correctly shaped record on CRM side for the test rid | Submit via UI; confirm via CRM `GET` (if exposed) or CRM team |
| 2 | Without token → behaviour per D2; **never 500s, never silently drops** | UI with cleared `crm_token_<rid>` |
| 3 | `grep "db.feedback" backend/server.py` → 0 | grep |
| 4 | CRM rejects / down → error toast, **no** "Thank you" | Point `REACT_APP_CRM_URL` at a dead host, submit |
| 5 | `feedbackEnabled = false` hides the entry | Config toggle |
| 6 | `yarn build` clean (no `CI=true`) | build |
| New | Admin routes adjacent to the deleted block (`/config/banners`, custom pages) still respond | curl smoke |
| New | Submitting twice does not double-post / UI disables while submitting | UI |

---

## 7. Conflicts

- `CR-2026-10-03-001` — shared deletion (D9). Resolve by note, not code.
- `CR-2026-09-15-001` (profile v2 adapter) — same `crmService.js` file, different functions; additive export, no contention.
- No conflict with the BUG-2026-10-06-001 file set.

---

## 8. Role boundary

No application code written. `frontend/` and `backend/` unmodified by this analysis. Registry: `status INTAKE → PLANNING`, `artefacts: INTAKE, IMPACT_ANALYSIS`.

```text
Planning complete: CR-2026-10-03-003
Stage: Impact Analysis
Code reality: PARTIAL (CRM token path shipped; anonymous path 403 as of this session)
Risk: CRITICAL by area (intake) / MEDIUM as a change — owner to ratify
Files WILL change: crmService.js (add crmSubmitFeedback) · FeedbackPage.jsx · server.py:1293-1324 (delete 3 symbols) · FeedbackPage.css (cosmetic, if needed)
Files WILL NOT touch: AuthContext.jsx · RestaurantConfigContext.jsx · App.js · landing builtin entry · AdminConfig · CRM's existing feedback docs
Owner decisions: D2, D3, D7, D8, D9
Docs: this file · ../index.yml
Next: Gate 2 (owner accepts) → Implementation Plan → Gate 3 phrase "Role 3 approved for CR-2026-10-03-003"
```

---

## 9. Owner rulings — 2026-10-07

| ID | Ruling |
|---|---|
| D2 | **(a)** — ship token-only now; no token → honest "Please sign in to leave feedback" |
| D3 | **(a)** — ask CRM team to purge/convert the stray rows our backend wrote into their `feedback` collection; we do not touch it. Raise as a CRM data task alongside this CR |
| D7 | **(b)** — auto-attach the diner's most recent order. **Planning note:** no "last order id" is persisted today (`OrderSuccess.jsx:149` reads it from router state only). Two ways, needs a sub-ruling: **D7-i** call `crmGetOrders(token, 1)` on the feedback page and use the newest order (no new storage key, one extra CRM read, order must be in CRM); **D7-ii** persist `last_order_<rid>` in storage at order success (new storage key → HIGH per addendum Part C, touches `OrderSuccess.jsx` hotspot). **Ruling: D7-i** — fetch newest order via `crmGetOrders(token, 1)` on page open; `order_id` omitted if none |
| D8 | **yes** — remove Name/Email. UI reviewed by owner in chat (before/after + not-logged-in state) — **OK** |
| D9 | **here** — delete `GET /config/feedback/{rid}` in this CR; CR-2026-10-03-001 count → 13 |

Environment observation (not part of this CR): `REACT_APP_BACKEND_URL` is commented out in `frontend/.env`, so `FeedbackPage.jsx:9` resolves `API_URL` to `undefined` and today's submit posts to `undefined/api/config/feedback` in this preview — feedback is already failing here. Irrelevant after the fix (page will call CRM via `crmService`, which uses `REACT_APP_CRM_URL`).

Gate position after rulings: **all decisions D2, D3, D7(i), D8, D9 ruled. Owner holding at Gate 2 — Implementation Plan not to be written until "Gate 2 accepted for CR-2026-10-03-003".**
