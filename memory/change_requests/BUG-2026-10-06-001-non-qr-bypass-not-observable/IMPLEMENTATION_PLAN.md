# IMPLEMENTATION PLAN — BUG-2026-10-06-001

| Field | Value |
|---|---|
| **Item** | BUG-2026-10-06-001 — record non-QR policy decisions on the allow path too |
| **Gate** | Gate 2 **accepted by owner 2026-10-07** ("Gate 2 accepted for BUG-2026-10-06-001"). Gate 3 **not** open — nothing below is applied until "Role 3 approved for BUG-2026-10-06-001" |
| **Inputs** | `INTAKE_DOC.md` · `IMPACT_ANALYSIS.md` §9 rulings: D1=a · D4=b · D5=b · D6=yes |
| **Risk** | LOW (change) / HIGH (process — hotspot files `ReviewOrder.jsx`, `server.py`) |
| **Scope lock** | 5 files + 1 new test file. Anything else = stop and ask |
| **Code marker** | `// BUG-2026-10-06-001: <reason>` (JS) · `# BUG-2026-10-06-001: <reason>` (Py) at every edit |

---

## 0. Invariant (read before every edit)

> **Not one order outcome changes.** The telemetry call is inserted *beside* the decision, never *inside* it. If an edit moves `clearCart()`, `setShowNonQrBlockModal()`, or any `return`, the edit is wrong.

Behaviour table that must hold after every edit:

| `allowNonQrOrders` | `policy.block` | Event sent? | `allowed` | Diner outcome |
|---|---|---|---|---|
| `true` / missing / null | always `false` | **No** (D1) | — | unchanged |
| `false` | `true` | Yes | `false` | blocked + modal + cart cleared (unchanged) |
| `false` | `false` | **Yes (new)** | `true` | allowed (unchanged) |

---

## 1. Edit sequence (apply in this order; self-test after each)

### E1 — `frontend/src/utils/orderAccessPolicy.js` · payload builder gains the decision (`:76-83`)

Reasons block `:37-69` **untouched**.

```js
// BUG-2026-10-06-001: payload now carries the policy decision so allow-path
// events are distinguishable from blocks. `policy` optional for back-compat.
export const buildNonQrBlockPayload = (ctx, checkpoint, policy) => ({
  restaurant_id: String(ctx?.restaurantId || ''),
  checkpoint, // 'landing' | 'add_to_cart' | 'place_order'
  scanned_room_or_table: ctx?.scannedRoomOrTable || null,
  final_table_id: ctx?.scannedTableId ? String(ctx.scannedTableId) : '0',
  is_edit_mode: ctx?.isEditMode === true,
  is_authenticated: ctx?.isAuthenticated === true,
  decision: policy?.reason ?? null,
  allowed: policy ? policy.block === false : false,
});
```

Self-test E1: `node -e` import is not trivial under CRA; instead unit-check in browser console after E2 (payload visible in Network tab).

### E2 — `frontend/src/pages/LandingPage.jsx` · C1 (`:527-547`)

Replace the block from the debug `console.log` through the end of `if (policy.block) {…}` with:

```js
      // BUG-2026-10-06-001: gated behind the logger (prod-silent unless debug:order)
      logger.order('[CR-002 C1] policy decision', {
        policy, allowNonQrOrders, restaurantId, isScanned,
        scannedTableId, scannedRoomOrTable, scannedOrderType, isEditMode,
      });
      // BUG-2026-10-06-001: record the decision on BOTH paths when the policy
      // is enforced (allowNonQrOrders === false). Never when the switch is on (D1).
      if (allowNonQrOrders === false) {
        postNonQrBlock(
          buildNonQrBlockPayload(
            { restaurantId, scannedRoomOrTable, scannedTableId, isEditMode, isAuthenticated },
            'landing',
            policy
          )
        );
      }
      if (policy.block) {
        clearCart();
        setShowNonQrBlockModal(true);
        return;
      }
```

`logger` is already imported at `LandingPage.jsx:23`. Nothing else in the file changes.

### E3 — `frontend/src/pages/MenuItems.jsx` · C2 (`:478-500`) + D6

1. Add import: `import { useAuth } from '../context/AuthContext';` (file does not import it today — verify at Role 3 pre-flight).
2. In the component body, next to the other hooks: `const { isAuthenticated } = useAuth();`
3. Rewrite `isBlockedNonQrAdd`:

```js
  const isBlockedNonQrAdd = useCallback(() => {
    if (cartItems && cartItems.length > 0) return false;
    const policy = shouldBlockNonQrOrder(
      { restaurantId, isScanned, scannedTableId, scannedRoomOrTable, scannedOrderType, isEditMode },
      { allowNonQrOrders }
    );
    // BUG-2026-10-06-001: record allow + block when enforced; D6 adds isAuthenticated.
    if (allowNonQrOrders === false) {
      postNonQrBlock(
        buildNonQrBlockPayload(
          { restaurantId, scannedRoomOrTable, scannedTableId, isEditMode, isAuthenticated },
          'add_to_cart',
          policy
        )
      );
    }
    if (!policy.block) return false;
    clearCart();
    setShowNonQrBlockModal(true);
    return true;
  }, [
    cartItems, restaurantId, isScanned, scannedTableId, scannedRoomOrTable,
    scannedOrderType, isEditMode, allowNonQrOrders, clearCart, isAuthenticated,
  ]);
```

Note: the "first add only" semantics (`cartItems.length > 0 → return false`) are preserved — allow events at C2 fire once per cart, not per item.

### E4 — `frontend/src/pages/ReviewOrder.jsx` · C3 (`:890-910`) — **CRITICAL file**

Only the `{ … }` guard block changes:

```js
      const policy = shouldBlockNonQrOrder(
        { restaurantId, isScanned, scannedTableId, scannedRoomOrTable, scannedOrderType, isEditMode },
        { allowNonQrOrders }
      );
      // BUG-2026-10-06-001: record the decision on both paths when enforced.
      if (allowNonQrOrders === false) {
        postNonQrBlock(
          buildNonQrBlockPayload(
            { restaurantId, scannedRoomOrTable, scannedTableId, isEditMode, isAuthenticated },
            'place_order',
            policy
          )
        );
      }
      if (policy.block) {
        clearCart();
        setShowNonQrBlockModal(true);
        return;
      }
```

No other line in `ReviewOrder.jsx` is touched. Restaurant 716 logic elsewhere in the file: **not touched**.

### E5 — `backend/server.py` · model + doc + two-bucket cap (`:1657-1727`) — **CRITICAL file**

**E5a — model (`:1657-1665`)**
```python
class NonQrBlockEvent(BaseModel):
    """Client-side diagnostic event for a non-QR policy decision (block or allow)."""
    restaurant_id: str
    checkpoint: str  # 'landing' | 'add_to_cart' | 'place_order'
    scanned_room_or_table: Optional[str] = None
    final_table_id: Optional[str] = "0"
    is_edit_mode: bool = False
    is_authenticated: bool = False
    # BUG-2026-10-06-001: allow-path events carry the policy reason
    decision: Optional[str] = Field(default=None, max_length=40)
    allowed: bool = False
```

**E5b — constants (`:1667-1668`)**
```python
NON_QR_BLOCKS_COLLECTION = "non_qr_blocks"
NON_QR_BLOCKS_PER_RID_LIMIT = 200   # allowed == False (incl. legacy docs without the field)
NON_QR_ALLOWS_PER_RID_LIMIT = 1000  # BUG-2026-10-06-001 D4(b): separate bucket for allow events
```

**E5c — doc (`:1697-1709`)** — add two keys after `is_authenticated`:
```python
        "decision": event.decision,
        "allowed": bool(event.allowed),  # BUG-2026-10-06-001
```

**E5d — rolling cap (`:1714-1727`)** — scope the count/delete to the event's bucket:
```python
        # BUG-2026-10-06-001 D4(b): cap each bucket separately so allow events
        # cannot evict block history. Legacy docs (no `allowed`) count as blocks.
        bucket_filter = (
            {"restaurant_id": doc["restaurant_id"], "allowed": True}
            if doc["allowed"]
            else {"restaurant_id": doc["restaurant_id"], "allowed": {"$ne": True}}
        )
        limit = NON_QR_ALLOWS_PER_RID_LIMIT if doc["allowed"] else NON_QR_BLOCKS_PER_RID_LIMIT
        count = await db[NON_QR_BLOCKS_COLLECTION].count_documents(bucket_filter)
        if count > limit:
            excess = count - limit
            cursor = (
                db[NON_QR_BLOCKS_COLLECTION]
                .find(bucket_filter, {"_id": 1})
                .sort("ts", 1)
                .limit(excess)
            )
            …  # delete_many unchanged
```

No new route (D5=b). No new collection. No new index — `rid_ts_desc` still serves; the `allowed` filter scans ≤1 200 docs within one rid partition.

### E6 — NEW `backend/tests/smoke/test_bug_2026_10_06_001.py`

Follows `test_cr_2026_10_03_002.py` conventions (`pytestmark = pytest.mark.smoke`, `http_client` fixture).

| Test | Asserts |
|---|---|
| `test_legacy_block_shape_still_204` | POST without `decision`/`allowed` → 204 (regression V4) |
| `test_allow_event_204` | POST `{…, decision: "valid-qr", allowed: true}` → 204 |
| `test_block_event_204` | POST `{…, decision: "non-qr-dinein", allowed: false}` → 204 |
| `test_decision_too_long_422` | `decision` of 41 chars → 422 |
| `test_unknown_field_ignored_or_422` | documents current Pydantic extra-field behaviour (snapshot, not a rule) |

Uses a sentinel `restaurant_id` (`"test-bug-001"`) so real restaurants' buckets are untouched. DB-level assertions (bucket eviction) are done in Role 3 self-test via `mongosh`, not in pytest (suite has no DB fixture).

---

## 2. Files WILL / WILL NOT change (scope lock)

| WILL change | WILL NOT touch |
|---|---|
| `frontend/src/utils/orderAccessPolicy.js` `:76-83` only | `orderAccessPolicy.js:37-69` reasons |
| `frontend/src/pages/LandingPage.jsx` `:527-547` | `diagnosticsService.js` |
| `frontend/src/pages/MenuItems.jsx` import + hook + `:478-500` | `useScannedTable.js` |
| `frontend/src/pages/ReviewOrder.jsx` `:890-910` | every other line of `ReviewOrder.jsx` incl. 716 logic |
| `backend/server.py` `:1657-1727` | every other route; `/api/config/*`; auth |
| NEW `backend/tests/smoke/test_bug_2026_10_06_001.py` | contexts · `App.js` · localStorage/config keys · admin pages · collection/endpoint/index names |

---

## 3. Verification matrix (Role 3 self-test → QA)

Setup: test restaurant with `allowNonQrOrders: false` (TEST_RID 478 or owner-nominated); a second restaurant with the flag `true`/absent; `mongosh` read access to `non_qr_blocks`.

| # | Maps to | Steps | Expected | Owner-visible? |
|---|---|---|---|---|
| T1 | V1 | Flag off → open `/<rid>?walkin` QR path → Browse Menu → add item → place order | Allowed end-to-end; **3 docs**: `checkpoint` landing/add_to_cart/place_order, `decision: valid-qr`, `allowed: true` | DB |
| T2 | V2 | Flag off → rid 716 direct URL → Browse Menu | Allowed; doc `decision: rid-716-carveout, allowed: true` | DB |
| T3 | V2 | Flag off → edit-mode session → Browse Menu | Allowed; `decision: edit-mode` | DB |
| T4 | V2 | Flag off → takeaway mode → add → place | Allowed; `decision: non-dinein-mode` at each checkpoint | DB |
| T5 | V3 | Flag **on** → repeat T1 | Allowed; **zero** POSTs to `/api/diagnostics/non-qr-block` (Network tab) | Network |
| T6 | V4 | Flag off → direct URL, no scan → Browse Menu | Blocked, modal, cart empty; doc `decision: non-qr-dinein, allowed: false`, legacy fields identical to the 5 historical rid-698 docs | UI + DB |
| T7 | V5 | §5.2 + §5.7 minimum regression: dine-in QR / takeaway / delivery / edit order; both flag states | Every outcome identical to pre-change build | UI |
| T8 | V6 | Stop backend → run T1 | Diner flow unaffected; `logger.error` only | UI |
| T9 | V7 | Inspect one POST body | Keys exactly: `restaurant_id, checkpoint, scanned_room_or_table, final_table_id, is_edit_mode, is_authenticated, decision, allowed` — no PII | Network |
| T10 | V8 (D5=b) | `db.non_qr_blocks.aggregate([{$match:{restaurant_id}},{$group:{_id:{decision,allowed},n:{$sum:1}}}])` | Counts per reason | DB (manual) |
| T11 | D4 | Seed 1 005 `allowed:true` + 5 `allowed:false` for sentinel rid via POST loop | Allow bucket trimmed to 1 000; **all 5 blocks survive** | DB |
| T12 | D4 legacy | Insert 1 doc **without** `allowed` for sentinel rid; POST 201 blocks | Legacy doc counted in block bucket (evicted first as oldest) | DB |
| T13 | D6 | Logged-in diner → first add-to-cart with flag off | `is_authenticated: true` on the `add_to_cart` doc | DB |
| T14 | S4 | Prod build → Browse Menu | No `[CR-002 C1]` line in console unless `debug:order=true` | Console |
| T15 | build | `cd frontend && yarn build` (no `CI=true`) | Clean | — |
| T16 | tests | `cd /app && pytest -m smoke backend/tests/smoke/test_bug_2026_10_06_001.py -v` and `pytest -m contract backend/tests/ -v` | All pass; contract snapshots unchanged | — |

Pass criterion for Exit Gate: T1–T16 all PASS. T7 is the hotspot regression and may not be skipped.

---

## 4. Rollback

`git checkout -- frontend/src/utils/orderAccessPolicy.js frontend/src/pages/LandingPage.jsx frontend/src/pages/MenuItems.jsx frontend/src/pages/ReviewOrder.jsx backend/server.py && rm backend/tests/smoke/test_bug_2026_10_06_001.py`. No migration; docs written with the new fields remain valid for the old code (extra keys ignored on read).

---

## 5. Role 3 Exit Gate checklist (to be ticked by the implementer)

1. `index.yml`: `status: IMPLEMENTATION → QA`, `artefacts += IMPLEMENTATION_PLAN, QA_HANDOVER`, `code_markers: true`, `files` updated to final line numbers
2. `README.md` row for BUG-2026-10-06-001 updated
3. File ownership / `files:` field updated
4. 6 code markers present (`grep -rn "BUG-2026-10-06-001" frontend/src backend/server.py backend/tests` ≥ 6)
5. `yarn build` clean · pytest smoke + contract clean
6. T1–T16 recorded with evidence (DB dumps / screenshots) in `SELF_TEST.md`
7. `QA_HANDOVER.md` written: test accounts (aliases only), flag toggling steps, T1–T16 for Role 4 re-execution, owner smoke script (T1, T5, T6 in plain English)

---

## 6. Owner smoke script (for Role 8, plain English)

1. Turn the "require QR" switch **off** for your test restaurant. Scan the walk-in QR, browse, add an item, place the order. It should work exactly as before. Ask the agent: "show me the 3 new rows" — you should see `valid-qr / allowed`.
2. Open the restaurant by typing the URL (no QR). Tap Browse Menu. You should be blocked with the usual message. Ask for the row — `non-qr-dinein / blocked`.
3. Turn the switch **on**. Repeat step 1. Ask for new rows — there should be **none**.

```text
Planning complete: BUG-2026-10-06-001
Stage: Implementation Plan (Impact Analysis accepted at Gate 2, 2026-10-07)
Code reality: PARTIAL
Risk: LOW (change) / HIGH (process — hotspot files; T7 regression mandatory)
Files WILL change: orderAccessPolicy.js (builder only) · LandingPage.jsx · MenuItems.jsx · ReviewOrder.jsx · server.py:1657-1727 · NEW backend/tests/smoke/test_bug_2026_10_06_001.py
Files WILL NOT touch: reasons block · diagnosticsService.js · useScannedTable.js · contexts · App.js · admin · keys/names
Owner decisions: none open (D1=a, D4=b, D5=b, D6=yes)
Docs: this file · IMPACT_ANALYSIS.md · ../index.yml
Next: Gate 3 — say "Role 3 approved for BUG-2026-10-06-001" to start implementation
```
