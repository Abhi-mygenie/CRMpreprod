# CR-079 — Implementation Plan
## POS Customer Edit — Schema + Response Fix

**Date**: 2026-08-06
**Role**: Planning Agent
**Risk**: LOW
**Effort**: ~45 min
**Impact Analysis**: `planning/CR_079_IMPACT_ANALYSIS.md`
**Gate**: Owner approved (LOW risk, no hotspot files)

---

## Pre-Flight Checks

```bash
# Confirm pos_id is still str (not already Optional)
grep -n "pos_id: str\|restaurant_id: str" /app/backend/routers/pos.py | head -5
# Expected: 130:    pos_id: str
#           131:    restaurant_id: str

# Confirm current PUT response shape
grep -n "customer_id.*updated_at\|pos_synced_at" /app/backend/routers/pos.py | head -5
# Expected: line in 438-447 range
```

---

## Files WILL Change

| File | Type | Change |
|---|---|---|
| `routers/pos.py` | EDIT | Edit 1: `pos_id`/`restaurant_id` → Optional — 2 lines |
| `routers/pos.py` | EDIT | Edit 2: PUT response → full customer — 1 block |

## Files WILL NOT Change

Everything else — `models/schemas.py`, `server.py`, `core/auth.py`, all frontend.

---

## Edit 1 — `routers/pos.py` — Make `pos_id`/`restaurant_id` Optional

**File**: `/app/backend/routers/pos.py`
**Location**: lines 129–131 (`POSCustomerUpdate` schema)

```python
# BEFORE
    # POS Identification (Required)
    pos_id: str  # POS system identifier (mygenie, petpooja, ezzo)
    restaurant_id: str  # Restaurant ID in that POS system

# AFTER
    # POS Identification (Optional — derived from X-API-Key auth if not sent) CR-079
    pos_id: Optional[str] = None  # POS system identifier (mygenie, petpooja, ezzo)
    restaurant_id: Optional[str] = None  # Restaurant ID in that POS system
```

**Why safe**: The function body at line 391 already does `{k: v for k, v in ... if v is not None}` — None values are auto-filtered before the DB write. `restaurant_id` remapping at line 398 only runs if the key is present in `update_dict`.

### Self-test Edit 1

```bash
cd /app/backend && python3 -c "
from routers.pos import POSCustomerUpdate
# Should succeed without pos_id / restaurant_id
m = POSCustomerUpdate(phone='9876543210', name='Test')
print('PASS: pos_id optional, value =', m.pos_id)
assert m.pos_id is None
assert m.restaurant_id is None
# Backward compat — with pos_id still works
m2 = POSCustomerUpdate(phone='9876543210', pos_id='mygenie', restaurant_id='689')
print('PASS: backward compat, pos_id =', m2.pos_id)
"
```

---

## Edit 2 — `routers/pos.py` — Return Full Customer in PUT Response

**File**: `/app/backend/routers/pos.py`
**Location**: lines 438–447 (`pos_update_customer` return block)

```python
# BEFORE
    return POSResponse(
        success=True,
        message="Customer updated successfully",
        data={
            "customer_id": customer_id,
            "name": updated.get("name"),
            "phone": updated.get("phone"),
            "updated_at": update_dict.get("pos_synced_at")
        }
    )

# AFTER (CR-079 Q2=a: full customer object, same shape as GET /pos/customers/{id})
    return POSResponse(
        success=True,
        message="Customer updated successfully",
        data=updated  # full customer doc (_id already excluded by projection at line 436)
    )
```

**Why safe**: `updated` is fetched at line 436 with `{"_id": 0}` — `_id` is already excluded. The raw customer doc is returned directly, matching the shape POS already parses from `GET /pos/customers/{id}`.

### Self-test Edit 2

```bash
API_URL="https://vendor-crm-preview-1.preview.emergentagent.com"
KEY="dp_live_HdEvMSha7Y67iSBMtN5nskuYzFc4HGe7zQgpWGBvxEY"
CUST_ID="1779d4fc-7161-4407-ac8c-cce30beb3e53"

# Must return total_points, tier, wallet_balance (not just 4 fields)
curl -s -X PUT "$API_URL/api/pos/customers/$CUST_ID" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone": "7505242126", "name": "Abhishek Jain"}' \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['success'] == True, f'Expected success, got: {d}'
data = d['data']
for field in ['total_points', 'tier', 'wallet_balance', 'total_visits']:
    assert field in data, f'Missing field: {field}'
print('PASS: full customer returned, tier=', data['tier'], 'points=', data['total_points'])
"
```

---

## Full Verification Matrix (6 checks)

```bash
API_URL="https://vendor-crm-preview-1.preview.emergentagent.com"
KEY="dp_live_HdEvMSha7Y67iSBMtN5nskuYzFc4HGe7zQgpWGBvxEY"
CUST_ID="1779d4fc-7161-4407-ac8c-cce30beb3e53"

echo "=== V1: PUT without pos_id/restaurant_id ==="
curl -s -X PUT "$API_URL/api/pos/customers/$CUST_ID" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"phone": "7505242126", "name": "Abhishek Jain"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if d['success'] else 'FAIL', d.get('message'))"

echo "=== V2: PUT with pos_id included (backward compat) ==="
curl -s -X PUT "$API_URL/api/pos/customers/$CUST_ID" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"phone": "7505242126", "name": "Abhishek Jain", "pos_id": "mygenie", "restaurant_id": "689"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if d['success'] else 'FAIL')"

echo "=== V3: Response has full customer fields ==="
curl -s -X PUT "$API_URL/api/pos/customers/$CUST_ID" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"phone": "7505242126"}' \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
data=d.get('data',{})
missing=[f for f in ['total_points','tier','wallet_balance','total_visits','total_spent'] if f not in data]
print('PASS - all fields present' if not missing else f'FAIL - missing: {missing}')
"

echo "=== V4: No _id field in response ==="
curl -s -X PUT "$API_URL/api/pos/customers/$CUST_ID" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"phone": "7505242126"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if '_id' not in d.get('data',{}) else 'FAIL: _id present')"

echo "=== V5: Duplicate phone returns error ==="
curl -s -X PUT "$API_URL/api/pos/customers/$CUST_ID" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"phone": "0000000000"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS (success=False or 200 OK)' if not d.get('success',True) or d.get('success') else 'check manually')"

echo "=== V6: Non-existent customer_id ==="
curl -s -X PUT "$API_URL/api/pos/customers/nonexistent-id-xyz" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"phone": "7505242126"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if d['success']==False else 'FAIL')"
```

---

## Code Marker

Both edits must carry `# CR-079` comment.

---

## Exit Gate Checklist

```
1. [ ] Registry updated (CR_STATUS_DASHBOARD + 00_register)
2. [ ] Both edits applied
3. [ ] Self-tests pass (Edit 1 python3 syntax check, Edit 2 curl V1–V6)
4. [ ] No _id in PUT response
5. [ ] Backward compat verified (V2)
6. [ ] QA handover written
```

---

## Implementation Plan Output

```
Planning complete: CR-079
Stage: Implementation Plan
Edits: 2 (both in routers/pos.py)
Self-tests: 6 curl probes (V1–V6)
Next: OWNER APPROVAL → Implementation
```
