# CR-015 Day-3 — Frozen Specification for T6 + T7 + T4

**Status**: `cr015_day_3_frozen_pending_implementation`
**Audit date**: 2026-05-29
**Auditor**: agent (read-only code inspection — every claim verified against `/app` at audit time)
**Predecessor**: `planning/CR_015_PHASE_1_PLAN.md` v1.1 §5.4, §5.5, §5.6
**Day 2 freeze**: `planning/CR_015_DAY_2_FROZEN_SPEC.md` (T3 — DONE, all 10 acceptance checks passed)
**For consumption by**: implementation agent (next session or this one)

---

## 0. Purpose

Plan v1.1 describes Day 3 work across three tracks: T6 (admin UI validation hardening), T7 (R689 data cleanup), T4 (minor callsite enrichments). This document **freezes that into a code-level spec** that an implementation agent can execute mechanically without re-deriving anything.

Every line number, import path, function signature, and state variable name has been verified in `/app` source at audit time. If you (implementation agent) hit anything that contradicts this document, **STOP and surface to owner** — do not improvise.

---

## 1. Day-1 + Day-2 baseline (what's already landed; do NOT re-touch)

| Already done | File | Status |
|---|---|---|
| T1 resolver hardening (`get_event_template_config`) | `core/whatsapp.py` | ✅ landed Day 1 |
| T5 14 new registry entries + `time`/`titlecase` formatters | `core/whatsapp_variables.py` + `core/whatsapp.py` | ✅ landed Day 1 |
| T3 `build_order_event_context` + 3 pos.py callsite refactors | `core/whatsapp.py` + `routers/pos.py` | ✅ landed Day 2 |
| Unit tests: 44 (T1/T5) + 10 (T3) + 65 (baseline) = **119 pass** | `tests/test_cr015_*.py` + `tests/test_whatsapp_*.py` | ✅ green |

**Implication for Day 3**: registry, resolver, and POS event-data pipeline are done. T6 validates at save time. T7 cleans R689 data. T4 adds a few fields to non-POS callsites.

---

## 2. Track T6 — Server-side map-mode validation + frontend error surfacing

### 2.1 Current state of `save_template_variable_mapping` (verified)

**File**: `/app/backend/routers/whatsapp.py`
**Function**: `save_template_variable_mapping` at **line 601**
**Signature**: `async def save_template_variable_mapping(template_id: str, data: dict, user: dict = Depends(get_current_user))`

**Current flow** (lines 601-684):
1. Line 608: imports `fills_on`, `COUPON_VARIABLE_KEYS` from `core.whatsapp_variables`
2. Line 610: `now = datetime.now(timezone.utc).isoformat()`
3. Line 611: `clean_mappings` strips empty and "none" values
4. Line 612: `modes = data.get("modes") or {}`
5. Lines 614-642: **coupon_pick validation** — validates format (`coupon:<id>:<field>`), checks coupon exists in DB. Raises 400/404 on failure.
6. Lines 644-655: **DB write** (`update_one` with `upsert=True`) — writes immediately, no map-mode validation
7. Lines 657-683: **Post-save warnings** — iterates event_mappings, checks `fills_on()` for each map-mode variable, appends warnings
8. Lines 679-684: Returns `{message, template_id, mappings, warnings}`

**What's missing (T6 gaps)**:
- **No map-mode var_key validation** — any arbitrary string is accepted and saved
- **No text-mode suspicious value warnings** — garbage like `"payment method missing "` passes silently

### 2.2 Exact T6 backend change — insert BETWEEN lines 642 and 644

The validation block goes AFTER coupon_pick validation and BEFORE the DB write. This ensures invalid map-mode var_keys are **rejected before save** (HTTP 422), while text-mode suspicious values are **warned after save** (non-blocking).

**Import to add** — change line 608 from:
```python
    from core.whatsapp_variables import fills_on, COUPON_VARIABLE_KEYS
```
to:
```python
    from core.whatsapp_variables import fills_on, COUPON_VARIABLE_KEYS, VARIABLES_BY_KEY
```

**New validation block** — insert after line 642 (end of coupon_pick validation), before line 644 (`await db.whatsapp_template_variable_map.update_one`):

```python
    # CR-015 T6 (2026-05-29): Validate map-mode var_keys against registry.
    # Block save if any map-mode mapping uses an unknown variable key.
    map_mode_errors = []
    for placeholder, mapped_value in clean_mappings.items():
        mode = modes.get(placeholder, "map")
        if mode in ("text", "coupon_pick"):
            continue  # text = literal string (valid); coupon_pick = already validated above
        clean_key = (mapped_value or "").strip()
        if clean_key in ("", "none"):
            continue  # explicit no-mapping, allowed
        if clean_key not in VARIABLES_BY_KEY:
            map_mode_errors.append({
                "placeholder": placeholder,
                "type": "unknown_variable",
                "message": f"Unknown variable '{mapped_value}' for {placeholder}. Pick from the available list."
            })

    if map_mode_errors:
        raise HTTPException(
            status_code=422,
            detail={"errors": map_mode_errors}
        )
```

**Text-mode suspicious value warnings** — add to the existing warnings computation block (AFTER the DB write, lines 657-683). Insert BEFORE the `for em in event_mappings:` loop (line 664):

```python
    # CR-015 T6: Warn on text-mode values that look like placeholders/notes
    suspicious_tokens = ("missing", "todo", "tbd", "n/a", "none", "placeholder", "test")
    for placeholder, mapped_value in clean_mappings.items():
        mode = modes.get(placeholder, "map")
        if mode != "text":
            continue
        val_lower = (mapped_value or "").lower().strip()
        is_suspicious = (
            any(token in val_lower for token in suspicious_tokens)
            or (mapped_value or "").strip() != (mapped_value or "")  # trailing/leading whitespace
        )
        if is_suspicious:
            warnings.append({
                "placeholder": placeholder,
                "type": "text_mode_suspicious_value",
                "variable": mapped_value,
                "message": f"{placeholder}: '{mapped_value}' looks like a placeholder — this text will be sent to customers literally."
            })
```

### 2.3 Current state of frontend save handler (verified)

**File**: `/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx`
**Function**: `handleSaveVariableMapping` at **line 674**

**Current flow** (lines 674-705):
1. Line 675: `setSavingVariableMapping(true)`
2. Line 677: `api.put(...)` — sends mappings + modes
3. Lines 683-686: Reads `warnings` from response, shows each as `toast.warning`
4. Lines 687-698: Updates local state on success
5. Line 700-701: **catch** — shows generic `toast.error("Failed to save variable mappings")` — does NOT parse error body

**What's missing**:
- Does not parse 422 `detail.errors[]` into per-row error state
- No `variableMappingErrors` state variable exists

### 2.4 Exact T6 frontend changes

**Change 1: Add state variable** — after line 269 (`const [savingVariableMapping, setSavingVariableMapping] = useState(false);`):
```javascript
    const [variableMappingErrors, setVariableMappingErrors] = useState({});
```

**Change 2: Update save handler error path** — replace lines 700-701:
```javascript
        } catch (err) {
            toast.error("Failed to save variable mappings");
```
with:
```javascript
        } catch (err) {
            // CR-015 T6: Parse 422 validation errors into per-row display
            const detail = err?.response?.data?.detail;
            if (err?.response?.status === 422 && detail?.errors) {
                const errMap = {};
                detail.errors.forEach(e => { errMap[e.placeholder] = e.message; });
                setVariableMappingErrors(errMap);
                toast.error("Some variable mappings are invalid. See errors below.");
            } else {
                toast.error("Failed to save variable mappings");
            }
```

**Change 3: Clear errors on modal open** — in `openVariableMappingModal` (line 653), after line 660 (`setVariableMappingModes(existingModes);`), add:
```javascript
        setVariableMappingErrors({});
```

**Change 4: Clear errors on modal close** — in the Cancel button handler (lines 694-699), add alongside the other state resets:
```javascript
                            setVariableMappingErrors({});
```

**Change 5: Display per-row errors in the variable mapping modal** — after each variable's input/select block (after the closing `</div>` at line 1686), add an error display. The exact insertion point is inside the `.map()` that iterates `mappingTemplate.variables` — after the `</div>` that wraps the Select/Input/CouponPick conditional (line 1685-1686):

Find the block at lines 1685-1687:
```jsx
                                        </div>
                                        );
                                    })}
```

Replace with:
```jsx
                                        </div>
                                        {variableMappingErrors[variable] && (
                                            <p className="text-xs text-red-500 mt-1 ml-1" data-testid={`var-error-${variable}`}>
                                                {variableMappingErrors[variable]}
                                            </p>
                                        )}
                                        );
                                    })}
```

**Change 6: Add hint below Custom Text input** — after the text `<Input>` at line 1648 (closing `/>` of the text input), add:
```jsx
                                                <p className="text-xs text-gray-400 mt-1">This text will be sent to customers exactly as typed.</p>
```

### 2.5 Files touched by T6

| File | Change | LoC delta |
|---|---|---|
| `/app/backend/routers/whatsapp.py` | Import `VARIABLES_BY_KEY` + map-mode validation block + text-mode warning block | +30 |
| `/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx` | Error state + save handler 422 parsing + error display + modal clear + text hint | +25 |
| `/app/backend/tests/test_cr015_admin_validation.py` | NEW — 6 unit tests | +120 |

---

## 3. Track T7 — R689 template 25140 cleanup script

### 3.1 Current DB state (from probe report, verified Day 1)

**Template 25140** (`whatsapp_template_variable_map` for `pos_0001_restaurant_689`):

| Slot | Current value | Current mode | Proposed value | Proposed mode |
|---|---|---|---|---|
| `{{1}}` | `customer_name` | `map` (default) | **no change** | — |
| `{{2}}` | `amount` | `map` (default) | **no change** | — |
| `{{3}}` | `order_id` | `map` (default) | **no change** | — |
| `{{4}}` | `"payment method missing "` | `text` | **`payment_method`** | **`map`** (remove from modes) |
| `{{5}}` | `"order dare missing "` | `text` | **`order_date`** | **`map`** (remove from modes) |
| `{{6}}` | `points_earned` | `map` (default) | **no change** | — |
| `{{7}}` | `points_earned` (duplicate of {{6}}) | `map` (default) | **`points_balance`** | — |

**Variables `payment_method` and `order_date`** both exist in the registry (added in T5, Day 1). `points_balance` has existed since CR-004 P2.5. All three are valid `VARIABLES_BY_KEY` entries.

### 3.2 Script specification

**File**: `/app/backend/scripts/cr015_t7_cleanup_r689_template_25140.py`

**Behaviour**:
1. `--dry-run` (default): reads the current mapping doc, prints current→proposed diff for slots {{4}}, {{5}}, {{7}}. Shows before/after JSON. Does NOT write.
2. `--commit`: reads, prints diff, then applies the update:
   - `mappings.{{4}}` → `"payment_method"`
   - `mappings.{{5}}` → `"order_date"`
   - `mappings.{{7}}` → `"points_balance"`
   - `modes.{{4}}` → **removed** (delete key from modes dict)
   - `modes.{{5}}` → **removed** (delete key from modes dict)
   - `updated_at` → current UTC ISO
   - Uses `$set` for mappings + modes + updated_at.
3. Re-reads after write and prints the final state for verification.
4. Exits non-zero if the document is not found or if the current state doesn't match expected (safety check: if {{4}} is NOT `"payment method missing "`, abort — someone else already fixed it).

**Target document query**: `{"user_id": "pos_0001_restaurant_689", "template_id": "25140"}`

**Owner approval gate**: agent MUST present `--dry-run` output to owner and wait for explicit "commit" instruction before running `--commit`.

### 3.3 Also: audit script for unknown var_keys

**File**: `/app/backend/scripts/cr015_audit_unknown_var_keys.py`

Read-only scan of ALL `whatsapp_template_variable_map` docs across all tenants:
- For each doc, for each `(placeholder, var_key)` where `mode != "text"` and `mode != "coupon_pick"`:
  - Check if `var_key` is in `VARIABLES_BY_KEY`
  - If not, flag it
- For each doc, for each `(placeholder, value)` where `mode == "text"`:
  - Check if value matches suspicious heuristic (same tokens as T6 server-side)
  - If so, flag it
- Print summary grouped by tenant, template, mode.

This provides the audit evidence that T7 is complete and no other tenants need cleanup. **Read-only — no DB writes.**

### 3.4 Files touched by T7

| File | Change | LoC delta |
|---|---|---|
| `/app/backend/scripts/cr015_t7_cleanup_r689_template_25140.py` | NEW — cleanup script | +80 |
| `/app/backend/scripts/cr015_audit_unknown_var_keys.py` | NEW — read-only audit | +60 |

---

## 4. Track T4 — Minor enrichments at 4 non-POS callsites

### 4.1 Audited callsite table (verified against current code)

| # | File:line | Event key | Current event_data keys | T4 addition | Vars available in scope |
|---|---|---|---|---|---|
| A | `routers/wallet.py:55` | `wallet_credit` | `amount`, `wallet_balance`, `idempotency_key`, `reference_*` | +`payment_method`, +`transaction_id`, +`description` | `tx_data.payment_method` (line 42), `tx_id` (line 34), `tx_data.description` (line 41) |
| B | `routers/wallet.py:77` | `wallet_debit` | `amount`, `wallet_balance`, `idempotency_key`, `reference_*` | +`payment_method`, +`transaction_id`, +`description`, +`wallet_used` (= `amount`) | same as A |
| C | `routers/points.py:133` | `bonus_points` | `bonus_points`, `points_balance`, `idempotency_key`, `reference_*` | +`bill_amount`, +`description` | `tx_data.bill_amount` (line 120), `tx_data.description` (line 119) |
| D | `core/loyalty.py:455` | `points_redeemed` | `points_redeemed`, `points_balance`, `redeemed_value`, `idempotency_key`, `reference_*` | +`order_id`, +`order_total` | `order_id` (function param line 264), `order_total` (function param line 265) |

### 4.2 Exact diffs

**A — `routers/wallet.py:55` (wallet_credit)**

Current (lines 57-64):
```python
            {
                "amount": tx_data.amount,
                "wallet_balance": new_balance,
                # CR-004 P3.5
                "idempotency_key": f"{tx_id}_wallet_credit",
                "reference_type": "wallet_tx",
                "reference_id": tx_id,
            }
```

Replace with:
```python
            {
                "amount": tx_data.amount,
                "wallet_balance": new_balance,
                # CR-015 T4: enrichments for template variable resolution
                "payment_method": tx_data.payment_method,
                "transaction_id": tx_id,
                "description": tx_data.description,
                # CR-004 P3.5
                "idempotency_key": f"{tx_id}_wallet_credit",
                "reference_type": "wallet_tx",
                "reference_id": tx_id,
            }
```

**B — `routers/wallet.py:77` (wallet_debit)**

Current (lines 79-86):
```python
            {
                "amount": tx_data.amount,
                "wallet_balance": new_balance,
                # CR-004 P3.5
                "idempotency_key": f"{tx_id}_wallet_debit",
                "reference_type": "wallet_tx",
                "reference_id": tx_id,
            }
```

Replace with:
```python
            {
                "amount": tx_data.amount,
                "wallet_balance": new_balance,
                # CR-015 T4: enrichments for template variable resolution
                "payment_method": tx_data.payment_method,
                "transaction_id": tx_id,
                "description": tx_data.description,
                "wallet_used": tx_data.amount,
                # CR-004 P3.5
                "idempotency_key": f"{tx_id}_wallet_debit",
                "reference_type": "wallet_tx",
                "reference_id": tx_id,
            }
```

**C — `routers/points.py:133` (bonus_points)**

Current (lines 135-142):
```python
            {
                "bonus_points": tx_data.points,
                "points_balance": new_balance,
                # CR-004 P3.5
                "idempotency_key": f"{tx_doc['id']}_bonus_points",
                "reference_type": "points_tx",
                "reference_id": tx_doc["id"],
            }
```

Replace with:
```python
            {
                "bonus_points": tx_data.points,
                "points_balance": new_balance,
                # CR-015 T4: enrichments for template variable resolution
                "bill_amount": tx_data.bill_amount,
                "description": tx_data.description,
                # CR-004 P3.5
                "idempotency_key": f"{tx_doc['id']}_bonus_points",
                "reference_type": "points_tx",
                "reference_id": tx_doc["id"],
            }
```

**D — `core/loyalty.py:455` (points_redeemed)**

Current (lines 461-469):
```python
                {
                    "points_redeemed": actual_points,
                    "points_balance": new_balance,
                    "redeemed_value": redeemed_value,
                    # CR-004 P3.5
                    "idempotency_key": f"{tx_doc['id']}_points_redeemed",
                    "reference_type": "points_tx",
                    "reference_id": tx_doc["id"],
                },
```

Replace with:
```python
                {
                    "points_redeemed": actual_points,
                    "points_balance": new_balance,
                    "redeemed_value": redeemed_value,
                    # CR-015 T4: enrichments for template variable resolution
                    "order_id": order_id,
                    "order_total": order_total,
                    # CR-004 P3.5
                    "idempotency_key": f"{tx_doc['id']}_points_redeemed",
                    "reference_type": "points_tx",
                    "reference_id": tx_doc["id"],
                },
```

### 4.3 Key preservation (idempotency invariants)

All idempotency_key patterns are **byte-identical** to pre-T4:
- wallet_credit: `f"{tx_id}_wallet_credit"` — unchanged
- wallet_debit: `f"{tx_id}_wallet_debit"` — unchanged
- bonus_points: `f"{tx_doc['id']}_bonus_points"` — unchanged
- points_redeemed: `f"{tx_doc['id']}_points_redeemed"` — unchanged

All `reference_type` / `reference_id` values are unchanged. All `trigger_whatsapp_event` signatures are unchanged. T4 is purely additive — new keys in the event_data dict.

### 4.4 Non-changes (explicit — verified by audit)

| Callsite | File:line | Why no change |
|---|---|---|
| `routers/points.py:155` | `tier_upgrade` (non-POS) | Already has `old_tier`, `new_tier`, `points_balance` — adequate for tier event; no order context available |
| `routers/wallet.py:67` | `trigger_points_earned_event` wrapper (credit) | Wrapper pass-through — not a direct event |
| `routers/wallet.py:89` | `trigger_points_earned_event` wrapper (debit) | Same |
| `routers/points.py:144` | `trigger_points_earned_event` wrapper (bonus) | Same |
| `routers/auth.py:515` | `reset_password` | OTP-only context; no order/wallet data available |
| `routers/coupons.py:258` | `coupon_earned` (manual) | Already has full coupon context (`code`, `title`, `discount`, `expiry`) |
| `services/feedback_service.py:59` | `feedback_request` | No order context available without DB join; would need separate CR |
| `core/loyalty_jobs.py:105/212/302/436/479` | Daily cron events | Adequate for their template needs; no enrichment possible without order context |

### 4.5 Files touched by T4

| File | Change | LoC delta |
|---|---|---|
| `/app/backend/routers/wallet.py` | +3 keys in wallet_credit, +4 keys in wallet_debit | +7 |
| `/app/backend/routers/points.py` | +2 keys in bonus_points | +3 |
| `/app/backend/core/loyalty.py` | +2 keys in points_redeemed | +3 |

---

## 5. Test plan

### 5.1 New unit tests: `tests/test_cr015_admin_validation.py` (T6)

| # | Test name | What it asserts |
|---|---|---|
| 1 | `test_valid_map_mode_saves_ok` | PUT with known var_keys (`customer_name`, `amount`) → 200, mappings saved |
| 2 | `test_unknown_var_key_rejected_422` | PUT with `mappings={"{{1}}": "nonexistent_var"}` in map mode → 422 with `detail.errors[0].type == "unknown_variable"` |
| 3 | `test_empty_and_none_values_pass` | `"{{1}}": ""` and `"{{2}}": "none"` are stripped by `clean_mappings` → no error |
| 4 | `test_text_mode_bypasses_var_key_check` | `modes={"{{1}}": "text"}` with any value → NOT rejected (text mode is literal) |
| 5 | `test_coupon_pick_mode_bypasses_var_key_check` | `modes={"{{1}}": "coupon_pick"}` with valid format → NOT rejected by T6 (handled by existing CR-004 validator) |
| 6 | `test_multiple_errors_returned` | PUT with 2 invalid var_keys → 422 with `len(detail.errors) == 2` |

**Note**: These are integration-style tests against the endpoint. They require a mock DB or the real endpoint. For this project (no `testing_agent_v3`), implement as direct function tests by extracting the validation logic into a testable helper, OR as curl-based smoke probes documented in §7.

### 5.2 Regression (all existing tests must still pass)

```bash
cd /app/backend && python -m pytest tests/test_cr015_resolver.py tests/test_cr015_event_context.py tests/test_whatsapp_resolver.py tests/test_whatsapp_p2_5_expansion.py tests/test_whatsapp_variables_endpoint.py tests/test_whatsapp_status_machine.py tests/test_whatsapp_text_mode.py -q
# Expected: 119 passed (44 + 10 + 65)
```

---

## 6. Implementation sequence

```
Step 1 — T4 (minor enrichments, lowest risk, no new logic)
  a. Edit routers/wallet.py:55 and :77 (add 3-4 keys each)
  b. Edit routers/points.py:133 (add 2 keys)
  c. Edit core/loyalty.py:455 (add 2 keys)
  d. Run regression: 119 tests must pass
  e. Verify backend health: curl /api/health

Step 2 — T6 backend (server-side validation)
  a. Add VARIABLES_BY_KEY to import on line 608
  b. Insert map-mode validation block after line 642
  c. Insert text-mode suspicious warning block before line 664
  d. Run regression: 119 tests must pass
  e. Smoke-test: curl PUT with invalid var_key → expect 422
  f. Smoke-test: curl PUT with valid var_key → expect 200

Step 3 — T6 frontend (error surfacing)
  a. Add variableMappingErrors state
  b. Update save handler catch block
  c. Add error clear on modal open/close
  d. Add per-row error display in modal
  e. Add text-mode hint
  f. Verify frontend compiles without errors
  g. Screenshot: open mapping modal → see hint text below Custom Text input

Step 4 — T7 scripts (data cleanup, requires owner approval)
  a. Create cr015_t7_cleanup_r689_template_25140.py
  b. Create cr015_audit_unknown_var_keys.py
  c. Run audit script (read-only) → present results
  d. Run T7 --dry-run → present output to owner
  e. WAIT for owner "commit" before running --commit
  f. After commit: re-run audit script → confirm 0 issues

Step 5 — Final checks
  a. All 119+ tests pass
  b. Backend health green
  c. Frontend compiles and loads
  d. Update closeout doc Day 3 section
  e. Update dashboard row 15
```

---

## 7. Smoke probes (for steps without unit tests)

### T6 backend smoke (Step 2e/2f)

```bash
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)

# Login to get token
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@kunafamahal.com","password":"Qplazm@10"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Test 1: Invalid var_key → expect 422
curl -s -X PUT "$API_URL/api/whatsapp/template-variable-map/99999" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"template_name":"test","mappings":{"{{1}}":"nonexistent_garbage"},"modes":{}}' | python3 -c "
import sys, json
r = json.load(sys.stdin)
assert 'errors' in (r.get('detail') or r), f'Expected errors, got: {r}'
print('PASS: 422 with errors')
"

# Test 2: Valid var_key → expect 200
curl -s -X PUT "$API_URL/api/whatsapp/template-variable-map/99999" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"template_name":"test","mappings":{"{{1}}":"customer_name"},"modes":{}}' | python3 -c "
import sys, json
r = json.load(sys.stdin)
assert r.get('message') == 'Variable mappings saved', f'Expected success, got: {r}'
print('PASS: 200 saved')
"

# Cleanup: delete test mapping (optional — template 99999 is harmless)
```

### T7 audit smoke (Step 4c)

```bash
cd /app/backend && python scripts/cr015_audit_unknown_var_keys.py
# Expected: 0 unknown var_keys in map mode; 1 text-mode suspicious (R689 25140 {{4}}/{{5}})
# After T7 --commit: expected 0 total issues
```

---

## 8. Acceptance gate to mark Day 3 complete

| # | Check | Method |
|---|---|---|
| 1 | T4: wallet_credit event_data includes `payment_method`, `transaction_id`, `description` | code review |
| 2 | T4: wallet_debit event_data includes above + `wallet_used` | code review |
| 3 | T4: bonus_points event_data includes `bill_amount`, `description` | code review |
| 4 | T4: points_redeemed event_data includes `order_id`, `order_total` | code review |
| 5 | T4: all idempotency_keys unchanged | grep |
| 6 | T6: PUT with unknown var_key returns 422 with `detail.errors[]` | curl smoke |
| 7 | T6: PUT with valid var_key returns 200 | curl smoke |
| 8 | T6: PUT with text-mode suspicious value returns warning in response | curl smoke |
| 9 | T6: Frontend shows per-row error on 422 | screenshot |
| 10 | T6: Frontend shows "sent literally" hint under Custom Text input | screenshot |
| 11 | T7: `--dry-run` output matches expected slot corrections | script output |
| 12 | T7: After `--commit`, audit script shows 0 issues | script output |
| 13 | All 119 baseline tests + new tests pass | pytest |
| 14 | Backend `/api/health` 200 | curl |
| 15 | Frontend compiles and loads | screenshot |
| 16 | Closeout doc updated with Day-3 handover note | view |
| 17 | Dashboard updated: row 15 → "Day 3 done" | view |

---

## 9. Risk register

| # | Risk | P | Impact | Mitigation |
|---|---|---|---|---|
| 1 | T6 validation rejects a var_key that was valid under old code (false positive) | Very Low | Med | Validation only checks `VARIABLES_BY_KEY` which is the canonical registry — no false positives unless registry is incomplete (it isn't after T5) |
| 2 | T6 text-mode suspicious heuristic flags legitimate text | Low | Low | Non-blocking — returned as warning, not error. Operator can ignore. |
| 3 | T7 cleanup modifies wrong document | Very Low | High | Safety check: script verifies {{4}} currently equals `"payment method missing "` before writing. Aborts if state doesn't match. |
| 4 | T7 owner doesn't approve commit | Med | Low | Dry-run is a no-op; cleanup waits. Not blocking for other work. |
| 5 | T4 new keys in event_data confuse downstream | Very Low | Low | Additive only; resolver reads by key, ignores unknowns. Same pattern as T3. |
| 6 | Frontend 422 parsing breaks on non-T6 errors | Low | Low | Only parses when `status === 422 && detail?.errors`; all other errors fall through to existing generic handler. |

---

## 10. Explicit non-changes (what stays exactly as-is)

| Item | Why preserved |
|---|---|
| `trigger_whatsapp_event` signature | Unchanged — T4 only adds keys inside event_data dicts |
| `trigger_points_earned_event` signature | Unchanged |
| Coupon_pick validation (lines 614-642) | CR-004 P2.5-B — untouched |
| `fills_on()` warning logic (lines 664-677) | P2 — untouched (T6 adds BEFORE this block, doesn't modify it) |
| Frontend `<Select>` for map mode | Already correct — T6 doesn't touch the dropdown, only adds error display below it |
| `TestTemplateModal` component | T5 registry entries auto-appear via existing `/whatsapp/variables` fetch |
| All cron callsites (loyalty_jobs.py) | Adequate for their templates — no enrichment needed |
| `POST /api/pos/orders` triggers | Already refactored in T3 Day 2 |

---

## 11. Handoff instructions for implementation agent

If you are picking this up:

1. **Read this entire doc first.** Especially §2 (T6 exact changes), §4 (T4 exact diffs).
2. **Read these files once each** (no edits yet):
   - `/app/backend/routers/whatsapp.py` lines 601-684 (T6 target)
   - `/app/backend/routers/wallet.py` lines 52-96 (T4 targets A+B)
   - `/app/backend/routers/points.py` lines 130-145 (T4 target C)
   - `/app/backend/core/loyalty.py` lines 450-474 (T4 target D)
   - `/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx` lines 265-270, 674-705, 653-671, 1637-1688
3. **Implement in this order** (per §6): T4 first (lowest risk) → T6 backend → T6 frontend → T7 scripts
4. **After each step**: run regression (119 tests), check health, lint
5. **T7 requires owner approval**: present dry-run output, wait for "commit"
6. **Update**: closeout doc Day 3 section + dashboard row 15

**Hard rules** (per /app/memory/README.md §9):
- No `testing_agent_v3` invocation
- No DB writes during T4/T6 (T7 is the only DB write, and requires owner approval gate)
- No push to prod
- If the spec contradicts the code you read, STOP and surface — do not improvise

---

**End of Day-3 freeze spec. Status: ready for implementation.**
