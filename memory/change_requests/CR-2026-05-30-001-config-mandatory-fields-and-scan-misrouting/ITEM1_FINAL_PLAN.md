# CR-2026-05-30-001 — Item 1 Final Plan (Revised after Playbook + Owner Q&A)

| Field | Value |
|---|---|
| Date | 2026-05-30 |
| Mode | Planning only — **NO CODE / CONFIG EDITS** |
| Supersedes | `ITEM1_IMPLEMENTATION_PLAN.md` |

---

## 1. Owner-locked decisions

| # | Decision | Final answer |
|---|---|---|
| Interpretation | Wire up the 5 existing dead toggles + add new `otpRequiredDelivery`. No new master flag. | ✅ |
| Default behaviour | Missing/null/undefined flag → OTP IS required (current behaviour preserved) | ✅ |
| D1 | Delivery has its own toggle `otpRequiredDelivery` | ✅ |
| D2 | Do NOT touch `LandingPage.jsx:738-739` mandatory-override for takeaway/delivery. Out of scope. | ✅ |
| D3 | No fall-through to /password-setup. Make the `crmSkipOtp` call reliable (retry + backoff). If all retries fail → degraded-mode guest (D=b confirmed). | ✅ |
| D4 | Empty-phone path stays — already navigates straight to menu today, no `crmSkipOtp` call needed | ✅ |
| D5 | Edit-Order path unchanged | ✅ |
| D6 | Authenticated users unchanged | ✅ |
| D7 | Integration playbook reviewed and shared with owner | ✅ |
| 716 | In scope — honours the flag like every other restaurant | ✅ |
| Q1 (409 handling) | 409 from `skip-otp` → fall through to `/password-setup` (this specific phone needs OTP, skip is forbidden for it). The only allowed exception to "no fall-through". | ✅ |
| Q2 (API key) | **Withdrawn.** Production already runs `crmSkipOtp` today via the "Skip for now" button. The same per-restaurant `x-api-key` map in `REACT_APP_CRM_API_KEY` already works in prod. No new credential needed. | ✅ |

---

## 2. Why Q2 was withdrawn (proof from code)

`crmService.js:17-115` already implements:
- Per-restaurant JSON-map key lookup from `REACT_APP_CRM_API_KEY={ "<rid>": "<key>", … }`
- Resolution chain: explicit `restaurantId` → from `userId` → from JWT (lines 92-105)
- Auto-injection of `x-api-key` header by `crmFetch` (line 115)
- Missing-key warning only — does NOT block the call (line 108-110)

`PasswordSetup.handleSkip` (`PasswordSetup.jsx:65-82`) already calls `crmSkipOtp(phone, userId)` in prod whenever a user taps "Skip for now". **That production path works today.** This CR re-uses the exact same helper from a different call site (Landing instead of password-setup screen). Contract, headers, body, key resolution — **all unchanged**.

> Net new effort on CRM credentials: **zero**.

---

## 3. Final mode → flag mapping (single source of truth)

```text
function pickOtpFlag({selectedMode, scannedOrderType, scannedRoomOrTable, scannedTableId}):

  if scannedRoomOrTable === 'room':
      return 'otpRequiredRoomOrders'             # covers 716 and any room-QR restaurant

  if scannedRoomOrTable === 'walkin':
      return 'otpRequiredWalkIn'

  if scannedOrderType === 'delivery' OR selectedMode === 'delivery':
      return 'otpRequiredDelivery'               # NEW flag

  if scannedOrderType === 'takeaway' OR selectedMode === 'takeaway':
      return 'otpRequiredTakeaway'

  if scannedOrderType === 'dinein' AND hasAssignedTable(scannedTableId)
                                   AND scannedRoomOrTable === 'table':
      return 'otpRequiredDineInWithTable'

  # walk-in dine-in (no tableId) / legacy direct URL
  return 'otpRequiredDineIn'
```

Runtime gate (single expression):

```text
shouldShowOtpPage(flagName, config) := config[flagName] !== false
```

Returns `true` for `true | undefined | null | missing` — `false` only when admin explicitly saved `false`. Matches D6 (default preserves current behaviour).

---

## 4. Final flow

```text
LandingPage handleBrowseMenu (~line 442 onwards):

  validation (mandatory name/phone) — UNCHANGED
  POST /api/auth/check-customer — UNCHANGED

  if NO phone captured:
      navigate('/menu')  # UNCHANGED, matches D4

  if phone captured AND existing user / new user branch:
      flag = pickOtpFlag({...})
      if shouldShowOtpPage(flag, config):
          navigate('/password-setup', {...})    # TODAY'S PATH — UNCHANGED
      else:
          # NEW BRANCH — silent skip
          try:
              data = await crmSkipOtpWithRetry(phone, buildUserId(rid))
              setCrmAuth(data.token, {name, phone, ...data.customer}, rid)
              navigateToMenu()
          except 409 Conflict:
              # Phone is locked to OTP — only allowed fall-through
              navigate('/password-setup', {...})
          except (after retries exhausted, transport / 5xx / 429):
              # D=b degraded guest mode
              localStorage.setItem('guestCustomer', JSON.stringify({name, phone, rid}))
              toast('Continuing as guest')
              navigateToMenu()
          except (400 / 401 / 403 / 404 / 422):
              # Unrecoverable user-data error
              toast.error('Could not continue. Please retry.')
              # Stay on landing — let user fix input or retry
```

---

## 5. New `crmSkipOtpWithRetry` wrapper (planning only)

A new tiny wrapper around the existing `crmSkipOtp` — does NOT modify the helper itself.

```text
async function crmSkipOtpWithRetry(phone, userId, {maxAttempts=3, baseDelayMs=500, maxDelayMs=4000}={}):
  attempt = 0
  while True:
      try:
          return await crmSkipOtp(phone, userId)    # existing helper, untouched
      except CrmError as e:
          status = e.statusCode

          # Non-retriable - bubble immediately to caller's specific handlers
          if status in (400, 401, 403, 404, 409, 422):
              throw e

          # Retriable
          if status in (429, 500, 502, 503, 504) OR isNetworkError(e):
              if attempt >= maxAttempts - 1:
                  throw e
              delay = min(baseDelayMs * 2**attempt, maxDelayMs) + jitter
              # Honour Retry-After header if present
              if e.retryAfterMs: delay = max(delay, e.retryAfterMs)
              await sleep(delay)
              attempt += 1
              continue

          throw e
```

**Why a wrapper (not modifying `crmSkipOtp` itself):**
- Zero risk to the existing "Skip for now" button — it keeps calling the bare helper (one-shot, today's behaviour).
- Only the new Landing-side call gets the retry policy.
- Easy to revert if any production regression: delete the wrapper, the original helper is untouched.

---

## 6. Edit surface (final)

| File | Lines | Change |
|---|---|---|
| `frontend/src/utils/otpPolicy.js` | **new file, ~30 lines** | `pickOtpFlag`, `shouldShowOtpPage` pure helpers |
| `frontend/src/api/services/crmSkipOtpRetry.js` | **new file, ~40 lines** | `crmSkipOtpWithRetry` wrapper. Reads error.status from `crmFetch` shape. |
| `frontend/src/pages/LandingPage.jsx` | ~487-520 | Wrap the two `navigate('/<rid>/password-setup', …)` calls. Else-branch calls `crmSkipOtpWithRetry` → `setCrmAuth` → `navigateToMenu()`. Handle 409 → password-setup. Handle exhausted retries → guest mode + toast. |
| `frontend/src/pages/LandingPage.jsx` | imports | Add `crmSkipOtpWithRetry`, `buildUserId`, `pickOtpFlag`, `shouldShowOtpPage` |
| `frontend/src/context/RestaurantConfigContext.jsx` | L93-103 + L443-450 | Add `otpRequiredDelivery: false` to defaults + serializer (mirrors the existing 5). 4 lines. |
| `frontend/src/components/AdminSettings/VisibilityTab.jsx` | ~L131-135 area | Add one `<ToggleRow field="otpRequiredDelivery" label="OTP Required for Delivery Orders" />` row, alphabetised with the others. 1 line. |
| `backend/server.py` | — | **No change.** Backend config endpoint already accepts arbitrary dict fields — `otpRequiredDelivery` flows through automatically. |

**Total: 2 new files + 3 small edits in existing files. ~75 lines added. Zero deletions. Zero backend changes. Zero DB migrations.**

---

## 7. crmFetch error-shape inspection (read-only check, for the wrapper)

Already read `crmService.js:121-140`. The error path:
- Non-JSON response → throws `Error(text || 'CRM returned non-JSON response (${response.status})')`
- 4xx/5xx with JSON body → throws `Error(message)` with no status code preserved

**Gap to address inside the wrapper:** today the existing helper does NOT preserve HTTP status code on the thrown Error. The wrapper either needs to:
- (a) **Enhance `crmFetch`** to attach `error.status = response.status` (one-line change in `crmService.js:129-140`)
- (b) **Parse the error message** to infer the status — fragile

Recommendation: **option (a)** — single-line attach `error.status = response.status` on the existing `throw`. Safe, additive, no behavior change for existing callers (they read `error.message` only). Adds <5 lines.

This is the ONE change to a shared module. It's defensive and shouldn't risk regressions to other CRM helpers — but mentioning it explicitly so you know.

---

## 8. Test scenarios (planning only — for the future testing-agent run)

Listed in priority order. Each tested against a non-716 restaurant AND restaurant 716.

| # | Scenario | Expected |
|---|---|---|
| 1 | All flags absent (most restaurants today) | `/password-setup` shown (no regression) |
| 2 | `otpRequiredDineInWithTable=false`, table QR scan, phone entered | Direct to menu, CRM token attached |
| 3 | `otpRequiredTakeaway=false`, takeaway mode, phone entered | Direct to menu, CRM token attached |
| 4 | `otpRequiredDelivery=false`, delivery mode, phone entered | Direct to menu, CRM token attached |
| 5 | `otpRequiredRoomOrders=false`, room QR (incl. 716) | Direct to menu, CRM token attached |
| 6 | `otpRequiredWalkIn=false`, walkin QR | Direct to menu, CRM token attached |
| 7 | `otpRequiredDineIn=false`, direct URL no scan | Direct to menu, CRM token attached |
| 8 | `otpRequiredDineInWithTable=false` BUT `otpRequiredDineIn=true` (mode mismatch) | Direct to menu only if scanned context = table; password-setup for walk-in dine |
| 9 | Customer enters NO phone | Direct to menu, no `crmSkipOtp` call (D4 unchanged) |
| 10 | Authenticated returning customer | Direct to menu (D6 unchanged), no `crmSkipOtp` call |
| 11 | `crmSkipOtp` returns 200 first try | Direct to menu, retry counter = 1 |
| 12 | `crmSkipOtp` returns 503 twice then 200 | Direct to menu, retry counter = 3, log entries showing backoff |
| 13 | `crmSkipOtp` returns 503 three times (exhausted) | Direct to menu as guest, toast shown, no CRM token attached |
| 14 | `crmSkipOtp` returns 409 (phone locked to OTP) | Falls through to `/password-setup` (the only allowed fall-through) |
| 15 | `crmSkipOtp` returns 422 (bad phone format) | Toast error, stays on landing, user can fix input |
| 16 | `crmSkipOtp` network error (no response) | Retries 3x, then guest mode |
| 17 | Restaurant 716, `otpRequiredRoomOrders=false` | Direct to menu — confirms 716 in-scope per owner answer |
| 18 | Existing "Skip for now" button on `/password-setup` | Unchanged — still calls bare `crmSkipOtp` (no retry wrapper) |
| 19 | Edit-Order flow | Unchanged — no /password-setup, no `crmSkipOtp` (D5) |
| 20 | Items 2 & 3 regression | `table_id` propagation, room context, `placeOrder` payloads — all identical |

---

## 9. Risk assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Flipping `otpRequired*=false` for the wrong mode → admin confused | Medium | Default OFF for the new `otpRequiredDelivery`. Existing 5 already in admin UI today — no new admin-side learning curve. |
| `crmSkipOtp` rate-limits hit when call volume jumps | Medium | Retry-with-backoff + degraded guest fallback. No worse than current `Skip for now` UX. |
| CRM 409 semantic differs from playbook assumption | Medium | Q1=b is reversible — if 409 means something else, we change one branch. |
| `crmFetch` status-preservation change (§7) breaks other CRM helpers | Low | Additive — `error.status` is new; existing `error.message` reads unaffected. |
| Sub-1 % of users see "Continuing as guest" toast when CRM is healthy | Low | Acceptable per D=b. Monitor with G5-style log. |
| Breaks Item 2 / 3 fixes still pending | None | Item 1 surface is between Landing and /menu. Items 2 & 3 are between /review-order and POS. Zero overlap. |

---

## 10. Authorisation required before implementation

1. **Confirm Q1=b is final** — 409 falls through to `/password-setup`. ✅ owner confirmed.
2. **Confirm the §7 one-line change to `crmFetch`** is acceptable (attaches `error.status` to the thrown error). The alternative is message-parsing which I'd advise against.
3. **Implementation phasing** — single PR with all 5 file changes, OR Phase A (`otpPolicy.js` + LandingPage gate, default flags = current behaviour, no observable change) followed by Phase B (admin enables a flag in pre-prod and tests)?

> **No code edited. No config edited. Awaiting owner answer on items 2 & 3 of §10 to proceed with implementation.**
