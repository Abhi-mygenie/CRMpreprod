# IMPLEMENTATION PLAN — CR-2026-10-03-003

| Field | Value |
|---|---|
| **Item** | CR-2026-10-03-003 — route diner feedback to CRM `POST /scan/feedback`; stop writing into CRM's `feedback` collection |
| **Gate** | Gate 2 **accepted by owner 2026-10-07** ("CR-2026-10-03-003 boot planning role gate 2 for implementation planning"). Gate 3 **not** open — nothing below is applied until "Gate 3 accepted / Role 3 approved for CR-2026-10-03-003" |
| **Inputs** | `INTAKE_DOC.md` · `IMPACT_ANALYSIS.md` §9 rulings: D2=a · D3=a · D7=b/i · D8=yes · D9=here |
| **Risk** | CRITICAL by area (intake) / MEDIUM as a change — the change *removes* the shared-DB write |
| **Scope lock** | 3 files + 1 new test file (+ CSS only if orphan classes). Anything else = stop and ask |
| **Code marker** | `// CR-2026-10-03-003: <reason>` (JS) · `# CR-2026-10-03-003: <reason>` (Py) |

---

## 0. Invariants (read before every edit)

1. **Zero writes to any CRM-owned collection from our backend after this ships.** `grep -n "db.feedback" backend/server.py` → 0.
2. **Never a false "Thank you".** Success UI only on a 2xx from CRM.
3. **Never create a customer.** We only call `/scan/feedback` with a token; no `skip-otp`, no lookup from this page.
4. **No change to how the CRM token is issued or stored.** We read `crmToken` from `useAuth()` and nothing else.

Behaviour table that must hold:

| State | What the diner sees | Network |
|---|---|---|
| `feedbackEnabled === false` | Feedback entry hidden (unchanged) | — |
| Token present, CRM 2xx | Form (stars + message) → green "Thank You" | `POST {CRM}/scan/feedback` with Bearer |
| Token present, CRM 4xx/5xx/unreachable | Form stays; red toast "Failed to submit. Please try again." | same, failed |
| **No token** (D2=a) | No form. Card: "Please sign in to leave feedback" + **Sign in** button → landing page | **no** feedback POST |

---

## 1. Code reality the plan depends on (re-verified 2026-10-07)

- `FeedbackPage.jsx` (138 lines) posts to `${REACT_APP_BACKEND_URL}/api/config/feedback`; no `useAuth`; validates `name` as required (`:28`).
- `crmService.js:176` `crmAuthFetch(endpoint, token, options)` adds Bearer + `x-api-key`; `crmGetOrders(token, limit=50, skip=0)` at `:399` → `GET /customer/me/orders`, returns `{ total_orders, orders: [...] }`, each order has `id` (`Profile.jsx:239`).
- `AuthContext.jsx:220` exposes `crmToken` via `useAuth()`.
- `server.py:1293-1324` — `FeedbackCreate`, `POST /config/feedback`, `GET /config/feedback/{rid}` (0 callers).
- CRM contract §4c row CR-096: body `{rating, message?, order_id?}` with token; `restaurant_id` short form if sent. Token path shipped; anonymous path **403** today.
- **Diner sign-in lives on the landing page** (phone + name → `crmSkipOtp`), not on `/login` (`Login.jsx` is admin-only). So the "Sign in" CTA must go to `/${restaurantId}`, not `/login`. **(P1 — planning decision, flagged for owner in the smoke brief.)**

---

## 2. Edit sequence

### E1 — `frontend/src/api/services/crmService.js` · add one export (after `crmGetOrders`, ~`:402`)

```js
/**
 * CR-2026-10-03-003: submit diner feedback to CRM (token path; CRM CR-096).
 * Body per contract §4c: { rating, message?, order_id? }. restaurant_id short form.
 * Returns CRM response (shape untyped — contract L7); callers only need the 2xx.
 */
export const crmSubmitFeedback = async (token, { rating, message, orderId, restaurantId }) => {
  const body = { rating, restaurant_id: String(restaurantId) };
  if (message) body.message = message;
  if (orderId) body.order_id = orderId;
  return crmAuthFetch('/scan/feedback', token, { method: 'POST', body: JSON.stringify(body) });
};
```

No existing function touched. Check `crmFetch` sets `Content-Type: application/json` by default (it does for other POST callers — verify at Role 3 pre-flight; if not, add the header in `options.headers` here only).

### E2 — `frontend/src/pages/FeedbackPage.jsx` · rewrite submit path, drop Name/Email, add no-token state, auto-attach newest order

Changes (the rest of the file — header, stars, textarea, success panel, CSS classes, `data-testid`s — stays):

1. Imports: remove `API_URL` constant; add
   `import { useAuth } from '../context/AuthContext';`
   `import { crmSubmitFeedback, crmGetOrders } from '../api/services/crmService';`
2. State: `form` becomes `{ rating: 0, message: '' }`; add `const { crmToken } = useAuth();` and `const [latestOrderId, setLatestOrderId] = useState(null);`
3. D7-i effect — fire once when token is present; failure is silent (feedback must still work without an order):
   ```js
   // CR-2026-10-03-003 D7-i: attach the diner's newest order if CRM has one
   useEffect(() => {
     if (!crmToken) return;
     let cancelled = false;
     crmGetOrders(crmToken, 1)
       .then((d) => { if (!cancelled) setLatestOrderId(d?.orders?.[0]?.id ?? null); })
       .catch(() => {});
     return () => { cancelled = true; };
   }, [crmToken]);
   ```
4. `handleSubmit`:
   ```js
   if (!form.rating || !form.message.trim()) { toast.error('Please add a rating and a message'); return; }
   setSubmitting(true);
   try {
     // CR-2026-10-03-003: CRM is the system of record for feedback (contract §4c)
     await crmSubmitFeedback(crmToken, {
       rating: form.rating, message: form.message.trim(), orderId: latestOrderId, restaurantId,
     });
     setSubmitted(true);
     toast.success('Thank you for your feedback!');
   } catch {
     toast.error('Failed to submit. Please try again.');
   } finally { setSubmitting(false); }
   ```
5. Render: delete the two `feedback-field` blocks for Name and Email (`data-testid` `feedback-name`, `feedback-email` go away — QA note).
6. No-token branch, placed before the form inside `feedback-content`:
   ```jsx
   {!crmToken ? (
     <div className="feedback-signin" data-testid="feedback-signin-required">
       <p className="feedback-intro">Please sign in to leave feedback.</p>
       <button className="feedback-btn" data-testid="feedback-signin-btn"
               onClick={() => navigate(`/${restaurantId}`)}>
         Sign in
       </button>
     </div>
   ) : submitted ? ( …existing success… ) : ( …form… )}
   ```
7. `FeedbackPage.css`: add `.feedback-signin { text-align:center; padding: 24px 0; }` only if needed for spacing; remove `.feedback-input` only if no other selector uses it (grep first). Cosmetic, optional.

### E3 — `backend/server.py` · delete `:1293-1324` (D9 included)

Remove in one block, leaving a one-line marker comment so the gap is explained:

```python
# CR-2026-10-03-003: feedback moved to CRM POST /scan/feedback (contract §4c, CRM CR-096).
# FeedbackCreate / POST /config/feedback / GET /config/feedback/{rid} deleted — zero callers.
```

Deleted symbols: `class FeedbackCreate`, `@config_router.post("/feedback")`, `@config_router.get("/feedback/{restaurant_id}")`. Nothing else in `server.py` references them (verify with grep at Role 3).

### E4 — NEW `backend/tests/smoke/test_cr_2026_10_03_003.py`

| Test | Asserts |
|---|---|
| `test_post_config_feedback_gone` | `POST /api/config/feedback` → 404 or 405 (route removed) |
| `test_get_config_feedback_gone` | `GET /api/config/feedback/478` → 404/405 |
| `test_adjacent_config_routes_alive` | `GET /api/config/478` → 200 (deletion didn't break the router block) |
| `test_no_db_feedback_reference` | static: read `server.py`, assert `"db.feedback"` not in source and `"FeedbackCreate"` not in source |

---

## 3. Files WILL / WILL NOT change

| WILL change | WILL NOT touch |
|---|---|
| `frontend/src/api/services/crmService.js` (+1 export) | every existing function in `crmService.js` |
| `frontend/src/pages/FeedbackPage.jsx` | `AuthContext.jsx` · `RestaurantConfigContext.jsx` (`feedbackEnabled`, `feedbackIntroText`) |
| `backend/server.py:1293-1324` (deletion + marker) | every other route · landing builtin `{id:"feedback"}` entry · `AdminConfig` toggle · `App.js` route |
| NEW `backend/tests/smoke/test_cr_2026_10_03_003.py` | CRM's `feedback` collection (D3 is a CRM task) · any localStorage key |
| `FeedbackPage.css` (optional, cosmetic) | |

---

## 4. Verification matrix (Role 3 self-test → QA)

Setup: restaurant 478 (`feedbackEnabled: true`); diner session via landing (phone `TEST_PHONE`), giving `crm_token_478` in localStorage. A second browser/profile with storage cleared for the no-token case.

| # | Maps to | Steps | Expected |
|---|---|---|---|
| T1 | Acc. 1 | Logged in → `/478/feedback` → 4 stars + message → Submit | 2xx from `{CRM}/scan/feedback`; request body `{rating:4, message, restaurant_id:"478", order_id?}`; "Thank You" panel |
| T2 | D7-i | On page open, logged in | one `GET /customer/me/orders?limit=1`; if diner has orders, `order_id` present in T1 body; if none, `order_id` absent and submit still 2xx |
| T3 | Acc. 2 / D2 | Cleared storage → `/478/feedback` | Sign-in card, no form, **no** POST; "Sign in" → lands on `/478` |
| T4 | Acc. 4 | Logged in; point `REACT_APP_CRM_URL` at a dead host (or intercept to 500) → Submit | Red toast; form stays; **no** success panel |
| T5 | Acc. 3 | `grep -n "db.feedback\|FeedbackCreate\|config/feedback" backend/server.py` | 0 hits (other than the marker comment) |
| T6 | Acc. 5 | Restaurant with `feedbackEnabled:false` → landing | Feedback entry hidden (unchanged behaviour) |
| T7 | Acc. 6 | `cd frontend && yarn build` | clean |
| T8 | adjacent | `curl /api/config/478`, `/api/config/banners/478` (or nearest sibling route) | 200 as before |
| T9 | tests | `pytest -m smoke backend/tests/smoke/test_cr_2026_10_03_003.py -v` · `pytest -m contract backend/tests/ -v` | pass; snapshots unchanged (public config contract does not include feedback routes — confirm) |
| T10 | UX | Double-tap Submit | button disabled while submitting; one POST only |
| T11 | validation | Submit with no stars or empty message | toast "Please add a rating and a message"; no POST |
| T12 | CRM-side | Ask CRM team (or `GET` if exposed) for the T1 record | present, linked to the test customer, `restaurant_id` "478" |

QA test-ids: `feedback-page`, `feedback-stars`, `feedback-star-N`, `feedback-message`, `feedback-submit-btn`, `feedback-success`, **new** `feedback-signin-required`, `feedback-signin-btn`; **removed** `feedback-name`, `feedback-email`.

---

## 5. Rollback

`git checkout -- frontend/src/api/services/crmService.js frontend/src/pages/FeedbackPage.jsx frontend/src/pages/FeedbackPage.css backend/server.py && rm backend/tests/smoke/test_cr_2026_10_03_003.py`. No migration. Rolling back re-opens the wrong-collection write — do it only for a blocking defect.

---

## 6. Cross-team notes (Role 3 writes, owner sends)

- **CRM data task (D3=a):** `CRM_NOTE_FEEDBACK_PURGE.md` — list the foreign-shaped rows in their `feedback` collection (ours have `name`, `email`, `created_at`, no `customer_id`), ask CRM to purge or convert; we do not touch them.
- **CR-2026-10-03-001:** one-line note — `GET /config/feedback/{rid}` removed by this CR; its dead-route count drops to 13.
- **INV-2026-09-15-002 ownership board:** `feedback` row → "CRM exclusive".

---

## 7. Role 3 Exit Gate checklist

1. `index.yml`: `status → QA`, `artefacts += IMPLEMENTATION_PLAN, SELF_TEST, QA_HANDOVER`, `code_markers: true`, `files` with final line numbers
2. `README.md` row updated; CR-001 note written; ownership board row flipped
3. Markers present: `grep -rn "CR-2026-10-03-003" frontend/src backend/` ≥ 4
4. `yarn build` clean · pytest smoke + contract clean
5. T1–T12 with evidence in `SELF_TEST.md`
6. `QA_HANDOVER.md` → Role 4 → `QA_REPORT.md`
7. **`SMOKE_BRIEF.md` + `.pdf`** (mandatory per §9, owner-ruled 2026-10-07) before `status → SMOKE`

---

## 8. Owner smoke script (preview; final in SMOKE_BRIEF after QA)

1. Open the restaurant, enter your phone on the home page as a diner, go to **Feedback** from the menu. Name/Email boxes are gone. Give stars + a message → Submit → "Thank You". Ask CRM (or the agent) to confirm the feedback appears in CRM for your number.
2. In a private window (not signed in), open **Feedback** directly. You should see "Please sign in to leave feedback" and a **Sign in** button that takes you to the home page. No form.
3. Ask the agent: "is there any feedback left in our old table?" → answer must be "our backend no longer writes there".

```text
Planning complete: CR-2026-10-03-003
Stage: Implementation Plan (Gate 2 accepted 2026-10-07)
Code reality: PARTIAL (CRM token path live; anonymous path 403)
Risk: CRITICAL by area / MEDIUM as a change
Files WILL change: crmService.js (+crmSubmitFeedback) · FeedbackPage.jsx · server.py:1293-1324 (delete) · NEW backend/tests/smoke/test_cr_2026_10_03_003.py · FeedbackPage.css (optional)
Files WILL NOT touch: AuthContext.jsx · RestaurantConfigContext.jsx · App.js · landing builtin entry · AdminConfig · CRM's feedback collection
Owner decisions: none open · P1 flagged (Sign-in CTA goes to landing page, since /login is admin-only)
Docs: this file · IMPACT_ANALYSIS.md · ../index.yml
Next: Gate 3 — "Gate 3 accepted for CR-2026-10-03-003"
```

---

## 9. GAP found after Gate 2 (owner question 2026-10-07) — D10 open, plan on HOLD until ruled

**Owner asked:** "at home page we have them enter phone — that is treated as login, right?" **Answer: only sometimes.** Verified in `LandingPage.jsx:575-700` and `:434-503`:

| # | Diner path on the home page | CRM token afterwards? |
|---|---|---|
| G1 | Dine-in at a restaurant with `showLandingCustomerCapture` **off** — **no phone box is shown at all** | **No** — and the Sign-in CTA would send them to a page with nothing to sign in with |
| G2 | Phone box shown but **optional** (`mandatoryCustomerPhone:false`, e.g. 478) and the diner leaves it blank | **No** |
| G3 | Phone entered, `skipOtp*` flag **false** (478 today) → `/password-setup`; diner taps back / abandons | **No** |
| G4 | Phone entered, lookup or CRM fails → "Continuing as guest" (`localStorage.guestCustomer`, phone kept) | **No** (phone known) |
| G5 | Phone entered, `skipOtp*` **true** → silent `crmSkipOtp` succeeds; or diner completes password-setup; or logs in via Login button | **Yes** |

Only G5 yields a token. With D2=a (token-only), G1–G4 diners see "Please sign in" and — for G1 — have no route to do so. UAT data today: 13 configs, `feedbackEnabled` at **1** (478: capture on, phone optional, skipOtp off → G2/G3 are live there).

**Options for D10**

| | Option | Scope | Trade-off |
|---|---|---|---|
| a | **Ship token-only now (D2=a as planned), accept G1–G4 see the sign-in card**; fast-follow with (c) when CRM CR-096 (hybrid, no-token) ships | 0 extra | Honest, stops the bad write today; feedback unavailable to guests meanwhile |
| b | Sign-in CTA becomes smart: if `guestCustomer.phone` exists (G4) call `crmSkipOtp` from the feedback page to obtain a token, then submit; G1–G3 still see the card | +1 helper call | Reuses the exact landing flow; `skip-otp` may create a customer — same as landing does today, but from a new page (owner must accept) |
| c | **Hybrid per CRM contract §4c (CR-096)**: no token → send `{phone, restaurant_id, rating, message}`; phone from `guestCustomer` or a single phone input on the feedback page; CRM links to existing customer or stores unlinked, **never creates** | +phone input | The designed end-state; **blocked** — CRM returns 403 today; needs CRM's firm date |
| d | Hold the whole CR until CR-096 ships, then do (c) in one go | 0 now | Leaves the wrong-collection write live for an unknown period |

**Recommendation: (a) now → (c) as a registered follow-up CR the day CR-096 lands.** Rejected (b): it moves customer-creation behaviour onto a second page for a partial gain (G4 only). Rejected (d): keeps a CRITICAL-area defect open.

If (a): sign-in card copy must be honest for G1 — "Feedback is available to signed-in diners. Sign in from the home page by entering your phone number." and the CTA stays. Register follow-up `CR: feedback hybrid/no-token path (depends on CRM CR-096)` at INTAKE.

**Owner ruling 2026-10-07: D10 = (a).** Token-only ships as planned; sign-in card copy per the "If (a)" note above; follow-up registered as **CR-2026-10-07-001** (INTAKE, blocked on CRM CR-096).
Context received same day: CRM Wave 1 (`inbox/WAVE_CHANGE_LOG_…2026-10-07.md`) deleted the OTP routes (CR-084) — no effect on this plan; `skip-otp`, `register`, `login` and token-gated `/scan/*` unchanged.

**Plan status:** HOLD released — awaiting "Gate 3 accepted for CR-2026-10-03-003".
