# CR-001C-C V3-A Happy Hour Admin UI — Implementation Report

**Date:** 2026-05-25
**Phase:** V3-A Happy Hour — production UI wired to backend
**Status:** `cr001c_coupon_v3a_admin_ui_implementation_qa_passed`
**Plan reference:** `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3A_UI_WIRING_PLAN.md`
**QA report:** `/app/memory/crm/crm_1_0/qa/CR_001C_C_COUPON_V3A_ADMIN_UI_QA_REPORT.md`

---

## 1. Summary

The "Happy Hour" tile at `/coupons` is now live (previously "Soon"). Owner can create / edit / list / toggle / delete time-window coupons with weekday, start/end time and IANA timezone. All round-trip persistence verified against the external MongoDB.

**Single file touched:** `frontend/src/pages/CouponsPage.jsx` (8 self-contained edits per the plan).
**No backend / DB / env / dependency / supervisor changes.**
**Combined regression:** V1 plain flat coupon and existing UI flows untouched (Q11-Q12 in QA report).

---

## 2. Critical Implementation Decision (vs. prior guide)

The old `handoff/CR_001C_C_COUPON_V3_UI_IMPLEMENTATION_GUIDE.md` suggested sending `payload.offer_type = "time_window"`. This was **wrong** — the backend validator `_v3a_validate_offer_type` (`backend/models/schemas.py:48-65`) **rejects** that value. V3-A is **compositional**: a Happy Hour coupon is any normal coupon (`offer_type="simple"`) with the time-window fields populated.

**Applied in the implementation:**
- `payload.offer_type = "simple"` for Happy Hour (`handleSubmit` branch).
- Edit-mode detection (`resolveTypeFromCoupon`) keys off the time-window field presence — NOT off `offer_type`.

Both verified end-to-end in QA (Q2/Q3 roundtrip + Q4 edit).

---

## 3. Files Changed

| File | Type | LOC delta | Sections touched |
|---|---|---|---|
| `frontend/src/pages/CouponsPage.jsx` | EXTEND | **+74 / -7** | Constants (DAYS, TIMEZONES); `COUPON_TYPES[time_window]` (flipped enabled + scope/dtype/color); `EMPTY_FORM` (4 V3-A fields); `resolveTypeFromCoupon` (V3-A detection branch); `openEdit` (4-field rehydration); `handleSubmit` (Happy Hour payload branch); new Time Window form section between V2 selectors and Validity block |

No new imports — `Clock`, `Input`, `Select`, `Separator`, `Label` were already imported by V1/V2.
No new dependencies in `package.json`.

---

## 4. 8 Edits Applied (per plan §6)

| # | Plan ref | Outcome |
|---|---|---|
| 1 | Add `DAYS` (7 Mon-Sun ints) + `TIMEZONES` (7 IANA strings) constants after `SCOPE_LABELS` | ✅ |
| 2 | `COUPON_TYPES[time_window]` → `enabled:true, scope:"order", dtype:null, color:"from-cyan-500 to-cyan-600"` | ✅ |
| 3 | `EMPTY_FORM` += `valid_days:[]`, `start_time:""`, `end_time:""`, `timezone:"Asia/Kolkata"` | ✅ |
| 4 | `resolveTypeFromCoupon` early-return `"time_window"` when any of `valid_days.length>0 \|\| start_time \|\| end_time` | ✅ |
| 5 | `openEdit` `setForm({...})` += 4 V3-A field rehydrations | ✅ |
| 6 | `handleTypeSelect` — no code change needed (tile config handles it) | ✅ verified |
| 7 | `handleSubmit` — new Happy Hour branch (keeps `offer_type:"simple"`, sends `valid_days`/`start_time`/`end_time`/`timezone`, with `[]→null` normalisation) | ✅ |
| 8 | New Time Window form section between V2 selectors and Validity — 7 weekday toggle buttons (`data-testid="day-{0..6}"`), `<Input type="time" required>` for both, `<Select>` of TIMEZONES, helper text "Overnight windows (e.g. 22:00 → 02:00) are supported." | ✅ |

`data-testid` coverage added: `time-window-days`, `day-0` … `day-6`, `start-time`, `end-time`, `timezone-select`.

---

## 5. Verification Highlights

| Check | Result |
|---|---|
| ESLint on `CouponsPage.jsx` | ✅ No issues |
| Frontend HTTP 200 after hot-reload | ✅ |
| Create Happy Hour via API, fields persist | ✅ `offer_type:"simple"`, `valid_days:[0,1,2,3,4]`, `start_time:"12:00"`, `end_time:"15:00"`, `timezone:"Asia/Kolkata"` |
| Edit Happy Hour (PUT) — change days/times/tz | ✅ All 4 fields updated correctly |
| Invalid `start_time:"25:99"` rejected | ✅ HTTP 422 from `_v3a_validate_hhmm` |
| Overnight `22:00 → 02:00` accepted | ✅ Persisted as-is |
| V1 plain flat coupon still works | ✅ `valid_days:null`, `start_time:null`, `offer_type:"simple"` — no V1 contamination |
| Toggle active/inactive | ✅ 200 OK both directions |
| Delete | ✅ 200 OK |
| UI visual: Happy Hour tile no longer "Soon" | ✅ Screenshot in QA report |
| UI visual: weekday buttons toggle cyan | ✅ Screenshot in QA report |
| UI visual: timezone defaults to Asia/Kolkata | ✅ Screenshot in QA report |

---

## 6. Scope Discipline

- ✅ Touched only `frontend/src/pages/CouponsPage.jsx`.
- ✅ V1+V2 behaviour preserved — discovery + Q11 regression confirms.
- ✅ V3-B / V3-C tiles still "Soon" — no premature wiring.
- ✅ `/coupons-v3-preview` route kept (will be removed after V3-B + V3-C ship).
- ✅ No changes to backend, DB, env, dependencies, supervisor, Wallet, Loyalty, POS pipeline, `/app/memory/final/`.

---

## 7. Out of Scope (deferred, per plan §11)

- Happy Hour list-view badge (still shows "Order" badge — backend stores `discount_scope:"order"`).
- "Offer summary" plain-English panel inside the form (preview line 329).
- Composing Happy Hour with V2 (item/category) in the same drawer.
- V3-A2 analytics counter `used_outside_window_attempts`.
- Removing `/coupons-v3-preview` route.

---

## 8. Acceptance Criteria — Status

| # | Acceptance criterion (from plan §12) | Met |
|---|---|---|
| 1 | "Happy Hour" tile no longer marked "Soon" and is clickable | ✅ |
| 2 | Form has all required sections (code/title/discount/weekdays/times/timezone/validity/limits/channels/stackable) | ✅ |
| 3 | `GET /api/coupons/{id}` returns the 5 expected fields with correct shapes | ✅ |
| 4 | Editing rehydrates all V3-A fields | ✅ |
| 5 | All V1+V2 flows still work | ✅ |
| 6 | No backend / DB / env / dependency / supervisor change | ✅ |

---

## 9. Effort

| Step | Estimated | Actual |
|---|---|---|
| 8 file edits | 40 min | ~10 min (parallel `search_replace`) |
| Manual QA | 20 min | ~10 min (parallel curl) |
| Implementation + QA reports + index update | 15 min | ~10 min |
| **Total** | **~1.5 h** | **~30 min** |

Significantly under the planned estimate due to parallel tool execution and pre-staged plan.

---

## 10. Final Status

```
cr001c_coupon_v3a_admin_ui_implementation_qa_passed
```

Backend unchanged (still 31/31 V3-A QA + combined 211/211 across V1→V3-C). UI wiring complete. Owner can now author Happy Hour coupons from `/coupons` immediately.

Next ready-to-pick: **V3-B BOGO / BXGY UI wiring** (per `handoff/SESSION_1_AGENT_HANDOVER.md` §3 P1).
