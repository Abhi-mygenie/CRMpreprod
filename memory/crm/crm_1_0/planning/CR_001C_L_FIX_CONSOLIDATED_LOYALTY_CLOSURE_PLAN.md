# CR-001C-L-FIX — Consolidated Loyalty Closure Plan (all gaps)

**Date:** 2026-05-25
**Status:** `cr001c_l_fix_consolidated_plan_ready_for_implementation`
**Branch:** `26-may`
**Database:** External MongoDB `52.66.232.149:27017/mygenie`
**Predecessor docs:**
- `planning/CR_001C_L_LOYALTY_L4A_ADMIN_REDEEM_HARDENING_PLAN.md` (closed)
- `planning/CR_004_LOYALTY_DEFAULTS_AND_UI_BUG_FIX.md` (only schema-level; this CR completes it)
- `implementation/CR_001C_L_L5_CLEANUP_IMPLEMENTATION_REPORT.md` (closed)

This is the **single doc** to close every remaining loyalty issue surfaced this session: the partial CR-004 ship, the UI input bugs, the hidden admin buttons, the missing per-tier UI, the missing disabled badge, and the R689 earn-% anomaly.

---

## 0. Owner Decisions Frozen (this session)

| # | Question | Decision |
|---|---|---|
| Q1 | Migration strategy for the 11 existing `loyalty_settings` docs | **B — Bulk overwrite** all 5 CR-004 fields on every restaurant, including ones already customised |
| Q2 | R689's anomalous `bronze_earn_percent=50, silver_earn_percent=69` | **B — Reset to schema defaults** (Bronze=5, Silver=7) |
| Q3 | Hidden Admin Redeem + Use Wallet buttons on `CustomerDetailPage.jsx` | **A — Unhide BOTH now** |
| Q4 | Misleading "Customer needs at least ₹X worth points" helper | **A — "At least X points required to redeem"** (no rupee math) |
| Q5 | Per-tier redemption-value inputs (LX-A backend) | **A — Include** as collapsible "Advanced — per-tier overrides" section |
| Q6 | "Loyalty Disabled" indicator when `loyalty_enabled=false` | **A — Include** pill on CustomerDetailPage + dashed banner on LoyaltySettingsPage |

---

## 1. Defect Inventory — verified in code

| # | Defect | Location | Severity |
|---|---|---|---|
| **D1** | 11/11 live restaurants have pre-CR-004 values (`min_order_value=100`, `redemption_value=0.25`, `max_redemption_percent=50`, `max_redemption_amount=500`, `min_redemption_points=100`). Schema defaults are correct but **never applied to DB** | Live `loyalty_settings` collection | 🟥 HIGH (owner-visible) |
| **D2** | `auth.py:178-214` register endpoint hardcodes OLD defaults — every new restaurant gets pre-CR-004 values, bypassing the schema | `backend/routers/auth.py` | 🟥 HIGH |
| **D3** | `auth.py:474-510` mygenie-login first-time path hardcodes OLD defaults — same bypass | `backend/routers/auth.py` | 🟥 HIGH |
| **D4** | `points.py:171-179` and `pos.py:1290-1297` and `pos.py:1744-1751` fallback dicts (settings doc missing case) hardcode OLD defaults | 3 sites | 🟧 MEDIUM (rare path) |
| **D5** | `LoyaltySettingsPage.jsx` line 148: `value={settings.max_redemption_percent \|\| 50}` — `\|\| 50` hides real value, breaks editing | Frontend | 🟥 HIGH |
| **D6** | Same `\|\| 50` pattern on line 149 helper text | Frontend | 🟥 HIGH |
| **D7** | `LoyaltySettingsPage.jsx` line 175: `\|\| 30` on `expiry_reminder_days` — same pattern, same problem | Frontend | 🟧 MEDIUM |
| **D8** | 23 numeric inputs use `parseFloat(e.target.value)` or `parseInt(e.target.value)` → returns `NaN` when user clears input. Result: field becomes uneditable / sticky after clear | Frontend, lines 98, 110, 114, 118, 122, 138, 142, 148, 153, 169, 175, 186, 187, 188, 205, 220, 222, 223, 239, 241, 242, 268, 285 | 🟥 HIGH (owner-visible "inputs not working") |
| **D9** | Misleading helper text `"Customer needs at least ₹{settings.min_redemption_points} worth points"` — points count rendered with ₹ symbol | `LoyaltySettingsPage.jsx` line 143 | 🟧 MEDIUM |
| **D10** | Admin Redeem button hidden — commented out in `CustomerDetailPage.jsx` lines 380-401 + 605, 612. L4-A backend unreachable from UI | Frontend | 🟥 HIGH (functionality unreachable) |
| **D11** | Use Wallet debit button hidden — same comment block, line 673 | Frontend | 🟧 MEDIUM |
| **D12** | Per-tier redemption-value inputs missing — backend has `bronze_redemption_value`, `silver_redemption_value`, `gold_redemption_value`, `platinum_redemption_value` but no UI exposure | Frontend gap | 🟧 MEDIUM |
| **D13** | No "Loyalty Disabled" indicator anywhere when `loyalty_enabled=false`. Owner can pause loyalty and have zero visual reminder | Frontend gap | 🟧 MEDIUM |
| **D14** | R689 specifically: `bronze_earn_percent=50, silver_earn_percent=69` — wildly off schema defaults | DB anomaly | 🟧 MEDIUM (owner-confirmed reset) |

---

## 2. Source-of-Truth Audit (already done)

| File / area | Lines verified |
|---|---|
| `backend/models/schemas.py` LoyaltySettings | 960–1017 (defaults correct: min_order=0, redemption=1.0, max%=100, max₹=None, min_redeem_pts=50) |
| `backend/routers/auth.py` register | 178–214 (hardcoded OLD) |
| `backend/routers/auth.py` mygenie-login first-time | 474–510 (hardcoded OLD) |
| `backend/routers/points.py` /earn fallback | 171–179 (hardcoded OLD) |
| `backend/routers/points.py` GET settings auto-create | 285–316 (CR-004 compliant ✅ — partial doc but values right) |
| `backend/routers/pos.py` order webhook fallback | 1290–1297 (hardcoded OLD) |
| `backend/routers/pos.py` payment-received fallback | 1744–1751 (hardcoded OLD) |
| `frontend/src/pages/LoyaltySettingsPage.jsx` numeric inputs | 23 inputs identified (line list above) |
| `frontend/src/pages/CustomerDetailPage.jsx` hidden buttons | Lines 380–401, 605, 612, 673 |
| Live MongoDB `loyalty_settings` collection | 11 docs, distribution confirmed |

---

## 3. Implementation Plan — 6 phases, ~3 hours

### Phase 1 — Backend default alignment (~20 min)

Single canonical helper function `default_loyalty_settings(user_id)` in `core/loyalty.py` (or `core/helpers.py`) that returns the dict of CR-004-compliant defaults, sourced from the Pydantic schema so drift is impossible:

```python
# core/loyalty.py
def default_loyalty_settings(user_id: str) -> dict:
    """Single source of truth for new-restaurant loyalty defaults.
    Always returns CR-004-compliant values. Sourced from the
    LoyaltySettings Pydantic model so schema and runtime cannot drift.
    """
    from models.schemas import LoyaltySettings  # local import to avoid cycle
    base = LoyaltySettings(id=str(uuid.uuid4()), user_id=user_id).model_dump()
    return base
```

Replace all 5 hardcoded-defaults blocks (auth.py:178-214, auth.py:474-510, points.py:171-179 fallback, pos.py:1290-1297, pos.py:1744-1751) with calls to this helper.

**Acceptance:** grep for `min_order_value.*100\.0` and `redemption_value.*0\.25` in backend returns 0 hits.

### Phase 2 — Live DB migration of 11 existing restaurants (~15 min)

One-shot script `backend/scripts/cr004_fix_bulk_apply.py`:

```python
"""CR-004-FIX: bulk-apply CR-004 defaults to all existing loyalty_settings docs.

Strategy: BULK (Q1=B) — forcibly overwrite all 5 CR-004 fields on every
restaurant. Owner-confirmed acceptable to trample any prior customisation.

Additional one-shot per Q2=B: reset R689's anomalous earn percents.
"""
async def main():
    bulk_update = {
        "min_order_value": 0,
        "redemption_value": 1.0,
        "max_redemption_percent": 100.0,
        "max_redemption_amount": None,
        "min_redemption_points": 50,
    }
    result = await db.loyalty_settings.update_many({}, {"$set": bulk_update})
    print(f"Updated {result.modified_count} restaurants with CR-004 defaults")

    # Q2=B — R689 earn % reset to schema defaults
    r689_user = await db.users.find_one({"restaurant_id": "689"})
    if r689_user:
        await db.loyalty_settings.update_one(
            {"user_id": r689_user["id"]},
            {"$set": {
                "bronze_earn_percent": 5.0,
                "silver_earn_percent": 7.0,
                "gold_earn_percent": 10.0,
                "platinum_earn_percent": 15.0,
            }}
        )
        print("R689 earn percents reset to schema defaults")
```

**Acceptance:** post-run mongo query shows all 11 docs have CR-004 values across all 5 fields; R689 specifically has bronze=5, silver=7.

### Phase 3 — Frontend input bug fix (~30 min)

Create a small helper at the top of `LoyaltySettingsPage.jsx`:

```jsx
// Safe numeric input handlers — replace parseFloat/parseInt on raw event values.
// Allows user to clear the input cleanly without producing NaN.
const onNumberChange = (field, parser = parseFloat) => (e) => {
    const raw = e.target.value;
    if (raw === "") {
        setSettings(prev => ({...prev, [field]: ""}));  // empty string preserves intent
        return;
    }
    const n = parser(raw);
    if (!Number.isNaN(n)) {
        setSettings(prev => ({...prev, [field]: n}));
    }
};

// Safe display value — coalesces null/undefined/"" to empty string so the field renders blank
const displayNumber = (v) => (v === null || v === undefined || Number.isNaN(v) ? "" : v);
```

Refactor every numeric `<Input type="number">` to use:
```jsx
value={displayNumber(settings.max_redemption_percent)}
onChange={onNumberChange("max_redemption_percent")}
```

Remove **every** `|| 50`, `|| 500`, `|| 30`, `|| 6`, `|| 25` etc. fallback in JSX. The blank state must round-trip cleanly.

For `max_redemption_amount` specifically (blank = no limit), the save path needs:
```jsx
// In the SAVE handler, convert "" → null before posting
const payload = {...settings};
if (payload.max_redemption_amount === "") payload.max_redemption_amount = null;
```

**Acceptance:** Manual smoke — clear any numeric field, the field stays empty (no NaN, no fallback). Type "5" then "0" — field shows "50". Save with `max_redemption_amount` blank — DB shows `null`, helper text shows "No limit per order".

### Phase 4 — Frontend label fix + per-tier UI + disabled badge (~60 min)

#### 4a. Helper text fix (D9, Q4=A)
Line 143:
```jsx
// BEFORE
<p>Customer needs at least ₹{settings.min_redemption_points} worth points</p>
// AFTER
<p>At least {settings.min_redemption_points || 0} points required to redeem</p>
```

#### 4b. Per-tier redemption-value section (D12, Q5=A)
Add new collapsible block below the base redemption_value input (after line 138):
```jsx
<Collapsible className="mt-3">
    <CollapsibleTrigger className="text-xs text-[#52525B] underline">
        Advanced — Per-tier overrides (optional)
    </CollapsibleTrigger>
    <CollapsibleContent className="grid grid-cols-2 gap-3 mt-2">
        {["bronze", "silver", "gold", "platinum"].map(tier => (
            <div key={tier}>
                <Label className="text-xs capitalize">{tier} ₹/point</Label>
                <Input
                    type="number" step="0.01" min="0"
                    value={displayNumber(settings[`${tier}_redemption_value`])}
                    onChange={onNumberChange(`${tier}_redemption_value`)}
                    placeholder={`Default ${settings.redemption_value}`}
                    data-testid={`${tier}-redemption-value-input`}
                />
            </div>
        ))}
    </CollapsibleContent>
</Collapsible>
```

Helper note inline: *"Leave blank to use the base value above."*

#### 4c. Loyalty-disabled badge (D13, Q6=A)
On `LoyaltySettingsPage.jsx` — at top of the form, when `settings.loyalty_enabled === false`:
```jsx
{!settings.loyalty_enabled && (
    <div className="border-2 border-dashed border-orange-400 bg-orange-50 rounded-lg p-3 mb-4" data-testid="loyalty-disabled-banner">
        <p className="text-sm text-orange-900 font-medium">
            Loyalty program is currently DISABLED. Customers earn no points and cannot redeem.
        </p>
    </div>
)}
```

On `CustomerDetailPage.jsx` — fetch loyalty settings once (lightweight call), and when disabled, show a small pill near the Total Points stat:
```jsx
{!loyaltySettings?.loyalty_enabled && (
    <Badge variant="outline" className="border-orange-400 text-orange-700 text-xs ml-2" data-testid="loyalty-disabled-pill">
        Loyalty Paused
    </Badge>
)}
```

### Phase 5 — Unhide admin Redeem + Use Wallet buttons (~10 min)

`CustomerDetailPage.jsx`:
- Line 380–401: uncomment the entire block
- Lines 605, 612: remove the "HIDDEN" comments (block already live, just clean up)
- Line 673: same — uncomment
- Both buttons need a `disabled={!loyaltySettings?.loyalty_enabled}` guard so they grey out when loyalty is paused
- Redeem button also keeps the existing `disabled={customer.total_points === 0}` guard
- Use Wallet button keeps `disabled={!customer.wallet_balance || customer.wallet_balance === 0}`

**Acceptance:** Both buttons visible, clickable when enabled, greyed-out when `loyalty_enabled=false` (with tooltip "Loyalty is currently paused"). L4-A redeem flow exercised end-to-end via UI (1 manual test).

### Phase 6 — QA + Implementation Report (~30 min)

#### 6a. New QA harness `backend/tests/qa_cr001c_l_fix_defaults_and_inputs.py` (~12 assertions)

| Group | Assertions |
|---|---|
| **G1 Backend default helper** | Schema → helper round-trip yields min=0, redemption=1.0, max%=100, max₹=None, min_redeem_pts=50 |
| **G2 Register endpoint** | POST `/auth/register` with new email → fetched loyalty_settings has CR-004 values |
| **G3 mygenie-login first-time** | mocked or skipped (live integration; smoke instead) |
| **G4 Settings auto-create via GET** | First `/api/loyalty/settings` GET creates doc with CR-004 values |
| **G5 Migration script idempotence** | Run script twice; second run modifies 0 docs (already CR-004-compliant) |
| **G6 R689 earn % reset** | R689's bronze=5, silver=7 post-migration |
| **G7 Per-tier override save** | PATCH `/api/loyalty/settings` with `gold_redemption_value=0.5` → reads back correctly; PATCH with null → cleared |
| **G8 LR + L4-A regression** | 1 admin redeem + 1 POS redeem still succeed end-to-end |

#### 6b. Live HTTP smoke
1. Fresh register → fetch settings → verify all 5 CR-004 values.
2. Existing R689 → fetch settings → verify CR-004 values + bronze=5.
3. PATCH max_redemption_amount=null → confirm helper shows "No limit per order" in next GET.
4. Admin redeem via UI flow (single browser test).

#### 6c. Implementation report
`implementation/CR_001C_L_FIX_CONSOLIDATED_IMPLEMENTATION_REPORT.md` with files-touched, defect closure map, QA results, smoke evidence.

---

## 4. Files Touched (cumulative)

| File | Type | LOC delta |
|---|---|---|
| `backend/core/loyalty.py` OR `backend/core/helpers.py` | M | +12 (new helper) |
| `backend/routers/auth.py` | M | −60 / +10 (2 hardcoded blocks → helper calls) |
| `backend/routers/points.py` | M | −10 / +3 (1 fallback block) |
| `backend/routers/pos.py` | M | −16 / +6 (2 fallback blocks) |
| `backend/scripts/cr004_fix_bulk_apply.py` | N | +40 |
| `backend/tests/qa_cr001c_l_fix_defaults_and_inputs.py` | N | +250 |
| `frontend/src/pages/LoyaltySettingsPage.jsx` | M | net +60 (helpers + 23 input refactors + per-tier + banner) |
| `frontend/src/pages/CustomerDetailPage.jsx` | M | net +20 (unhide 2 buttons + disabled pill + settings fetch) |

**No DB migration on schema; data-level only.** No new dependencies. No env change. Hot-reload.

---

## 5. Risk Register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Bulk overwrite (Q1=B) tramples a restaurant that intentionally set custom `max_redemption_percent` | Owner explicitly chose B | Backup the 11 docs to `/tmp/loyalty_settings_pre_cr004fix_backup.json` before bulk update for emergency restore |
| R2 | R689 reset (Q2=B) destroys owner's actual intent | Anomalous values look like data corruption, not config | Backup R689's doc to the same JSON; owner can request re-customisation post-fix |
| R3 | `onNumberChange` empty-string state breaks PATCH validation if Pydantic rejects `""` for `Optional[float]` | Medium — Pydantic will coerce or 422 | The save handler converts `""` → `null` for `max_redemption_amount` and `""` → `parseFloat(prev)` or skip the field for others. Unit-tested in G7 |
| R4 | Per-tier override saved with null doesn't clear an existing value | Pydantic `model_dump(exclude_none=True)` filter pattern used in PUT handler may drop nulls — must allow nulls to overwrite | Add explicit `null`-passthrough check on PATCH handler so per-tier overrides can be cleared back to "use base" |
| R5 | Unhiding Redeem button surfaces L4-A flow to owners who never used it; could generate support tickets | Acceptable — feature was always meant to be visible | Tooltip on disabled state explaining why |
| R6 | Disabled banner / pill cause layout shift on existing pages | Low | CSS uses margin not padding-collapse; QA visually inspects both pages |

---

## 6. Rollback

```bash
# Code-level
git checkout HEAD~1 -- backend/routers/auth.py backend/routers/points.py backend/routers/pos.py backend/core/loyalty.py frontend/src/pages/LoyaltySettingsPage.jsx frontend/src/pages/CustomerDetailPage.jsx
rm backend/scripts/cr004_fix_bulk_apply.py backend/tests/qa_cr001c_l_fix_defaults_and_inputs.py

# DB-level (restore the 11 settings docs)
python3 backend/scripts/cr004_fix_bulk_apply.py --restore /tmp/loyalty_settings_pre_cr004fix_backup.json

sudo supervisorctl restart backend
```

---

## 7. Acceptance Criteria

1. ✅ Grep `min_order_value.*100\.0` and `redemption_value.*0\.25` in backend returns 0 hits.
2. ✅ All 11 live `loyalty_settings` docs show CR-004 values on the 5 target fields.
3. ✅ R689 has `bronze_earn_percent=5.0, silver_earn_percent=7.0`.
4. ✅ Fresh `/auth/register` produces a settings doc with CR-004 values.
5. ✅ Clearing `max_redemption_amount` in UI → saves as `null` → helper text reads "No limit per order".
6. ✅ Typing "50" into Max % field keeps "50" (no character drop, no NaN, no `|| 50` fallback).
7. ✅ Helper text reads "At least 50 points required to redeem" (not "₹50 worth points").
8. ✅ Collapsible "Advanced — per-tier overrides" section visible; saving a Gold override = 0.5 persists; clearing it persists null.
9. ✅ When `loyalty_enabled=false`: banner visible on LoyaltySettingsPage; pill visible on CustomerDetailPage; Redeem + Use Wallet buttons disabled with tooltip.
10. ✅ Both Admin Redeem and Use Wallet buttons VISIBLE and CLICKABLE on CustomerDetailPage when loyalty is enabled.
11. ✅ End-to-end manual: pick a customer, click Redeem, enter 50 points → L4-A flow commits, `total_points_redeemed` increments, tier preserved.
12. ✅ All 313 prior QA assertions still pass + 12 new ≈ 325/325 PASS.
13. ✅ Backend hot-reloads clean, `/api/health` 200.
14. ✅ Implementation report + PRD entry + INDEX entry written.

---

## 8. Out-of-Scope (deferred to future CRs)

| Item | Reason deferred |
|---|---|
| Off-peak hours timezone fix (hardcoded IST `+5:30`) | C9, separate CR |
| Tier-upgrade WhatsApp from realtime POS | C8, separate WhatsApp Automation CR |
| Retire POS legacy aliases `used_loyalty_point` / `used_loyalty_points` | Zero-cost safety net, wait window |
| Manual `bonus` adopting atomic `$inc` | Race window narrow (admin-rate), Q-L4A-9 deferred |
| Migration legacy non-clean-slate path | Bigger refactor, no functional regression |
| Per-tier earn-percent UI (already exists via `*_earn_percent` fields, fully wired) | NOT a gap — present today |

---

## 9. Implementation Sequence

The next agent executes these in **risk-optimal order** (low-risk phases first so an early regression catches issues before the input refactor lands). Each phase is independently verifiable.

| Order | Phase | Risk | Why this position |
|---|---|---|---|
| **1st** | Phase 1 — Backend default helper + 5 hardcoded blocks | 🟢 Low | Pure refactor; backend boot is the test |
| **2nd** | Phase 2 — DB migration script + R689 reset | 🟢 Low (with pre-backup) | Backup → run → verify mongo state |
| **3rd** | Phase 5 — Unhide Redeem + Use Wallet buttons | 🟢 Low | Code already exists; reactivates known-working flow |
| **4th** | Phase 3 — Input bug fix (D8, 23 inputs) | 🟡 Medium | The one genuinely complex change; isolate from low-risk work |
| **5th** | Phase 4 — Helper text + per-tier UI + disabled badge | 🟢 Low | Pure additive UI |
| **6th** | Phase 6 — QA harness + regression + report | — | Final acceptance |

**Total: ~2.75 hours.** Ship as ONE CR. No PR split — the plan's phase boundaries already give all the isolation/rollback granularity a split would provide.

After each phase: backend health check + brief sanity smoke. Full 313+12 regression suite runs once at end of Phase 6.

---

## 10. Final Status

```
cr001c_l_fix_consolidated_plan_ready_for_implementation
```

On kickoff → `cr001c_l_fix_consolidated_implementation_in_progress`.
On QA pass → `cr001c_l_fix_consolidated_qa_passed_in_preview`.

After this CR ships, the **only** loyalty backlog items remaining are the 4 explicitly deferred above (off-peak TZ, tier-upgrade WA, POS-alias retirement, atomic bonus) — none owner-blocking.

---

**End of plan.**
