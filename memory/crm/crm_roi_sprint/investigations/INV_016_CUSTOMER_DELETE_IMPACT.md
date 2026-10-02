# INV-016 — Investigation Report
## Customer Delete — Full Impact Analysis

**Date**: 2026-08-06
**Role**: Investigation Agent
**Triggered by**: Owner question — "there is no option to delete customer — if we give an option what is impact, check all possibilities"
**Steps used**: 10/10
**Confidence**: HIGH — full code read, all collections traced

---

## 1. Hypotheses Formed

| # | Hypothesis | Eliminated / Confirmed |
|---|---|---|
| H1 | Delete is simple — just remove the customer record | ❌ ELIMINATED — 13 collections reference customer_id |
| H2 | Soft delete (is_blocked) is sufficient | PARTIAL — exists in POS auth, not exposed in CRM UI |
| H3 | Impact is HIGH — many collections, S3 data, business rules | ✅ CONFIRMED |

---

## 2. What Already Exists (Discovered)

### Finding 1 — Hard delete endpoint EXISTS but is INCOMPLETE

```
DELETE /api/customers/{customer_id}
Auth: Bearer JWT (CRM)
Location: customers.py:1877
```

**What it currently does**:
```python
await db.customers.delete_one({"id": customer_id, "user_id": user["id"]})
await db.points_transactions.delete_many({"customer_id": customer_id})
return {"message": "Customer deleted"}
```

**Only 2 of 13 affected collections cleaned up.** No frontend button exposes it — the endpoint exists but is unused.

---

### Finding 2 — Soft delete endpoint EXISTS (POS auth only)

```
DELETE /api/pos/customers/{customer_id}
Auth: X-API-Key (POS)
Location: pos.py:2606
```

**What it does**: Sets `is_blocked=True`. Customer is hidden from POS typeahead search (query filters `is_blocked: {$ne: True}`). Customer still visible in CRM frontend. Zero cascade. Fully reversible.

---

### Finding 3 — No frontend delete button anywhere

Confirmed by code search: `CustomerDetailPage.jsx` and `CustomersPage.jsx` have NO delete customer button. The only customer-level delete in the frontend is the **tag delete** (`api.delete('/customers/{id}/tags/{tag}')`).

---

### Finding 4 — S3 delete function exists but is NOT called on customer delete

`core/s3.py:258` has `delete_object(key: str) -> bool` that calls `s3.delete_object(Bucket=..., Key=...)`. But the current `delete_customer` function never calls it. Identity documents (Aadhaar, Passport, etc.) remain on S3 after customer deletion = **cost leak + privacy violation**.

---

## 3. Full Orphan Map — 13 Collections

If a customer is hard-deleted today, the following collections would have orphaned `customer_id` references:

| Collection | What's stored | Delete risk | Can cascade-delete? |
|---|---|---|---|
| `orders` | All order history, revenue, loyalty | **HIGH** — analytics will lose customer attribution | Yes, with care |
| `order_items` | Line items per order | HIGH — linked to orders | Yes |
| `points_transactions` | Loyalty earn/redeem ledger | HIGH — ⚠️ partially handled today | ✅ Already in delete |
| `wallet_transactions` | Wallet credits/debits | MEDIUM | Yes |
| `coupon_usage` | Coupon redemption records | MEDIUM — coupon analytics still work (count by coupon_id) | Yes |
| `coupon_transactions` | Legacy coupon history | LOW | Yes |
| `feedback` | Customer ratings | LOW | Yes |
| `whatsapp_message_logs` | All message history | LOW — analytics by user_id not customer_id | Yes |
| `customer_documents` | **S3 identity files + DB records** | **HIGH** — S3 files NOT cleaned = data privacy + cost | Yes + `core/s3.delete_object()` |
| `customer_otps` | QR scan OTP tokens | LOW | Yes |
| `loyalty_mismatch_logs` | Loyalty audit trail | LOW | Yes |
| `coupon_distributions` | CR-081 coupon assignments | LOW | Yes |
| `pos_event_logs` | POS event trigger audit | LOW | Yes |

---

## 4. Business Logic Impact

### 4.1 Analytics (Revenue + Lifecycle)
- **Revenue totals**: Unaffected — aggregated by `user_id`, not `customer_id`
- **Customer counts**: Decrease (correct)
- **Repeat customer %**: Changes — orders remain but customer is gone
- **Order records**: Remain with orphaned `customer_id` field — analytics still count them as restaurant revenue

### 4.2 POS Auto-Recreate Risk
If a customer is hard-deleted and then visits again:
- POS sends `POST /api/pos/orders` with the same phone number
- `_find_or_create_customer` (pos.py:663) finds no match → **auto-creates a NEW customer**
- Merchant loses all previous loyalty, points, coupons for that phone number
- Two separate customer records may exist for the same person (old deleted + new recreated)

### 4.3 Coupon Analytics Integrity
`coupon_usage` records store `customer_id`. After customer deletion:
- `GET /api/analytics/coupons/top` — usage counts still correct (grouped by `coupon_code`)
- `GET /api/analytics/customer-lifecycle` — customer removed from counts (correct)
- `GET /api/pos/coupons/{id}/usage` — usage row shows `customer_name: null` (C-7 in CR-081 already handles this gracefully)

### 4.4 WhatsApp Campaign Safety
If a campaign is running and customer is deleted mid-run:
- Existing `whatsapp_message_logs` remain (orphaned customer_id)
- Future campaign targeting: customer no longer in segment → not selected ✅
- Scheduled campaigns: customer won't appear in next audience resolution ✅

### 4.5 Invoice Records
Invoices (`invoices` collection) embed customer name, phone, and GST at creation time (denormalised). Deleting customer does NOT corrupt existing invoices — they're self-contained snapshots.

---

## 5. Three Options — Full Comparison

### Option A — Expose Soft Delete in CRM UI (SIMPLEST)

**What it does**: Add "Deactivate Customer" button → sets `is_blocked=True`
**Data preserved**: Everything
**Analytics**: Unaffected
**Reversible**: ✅ Yes — reactivate with PUT
**POS**: Hidden from typeahead immediately
**S3**: Safe (documents preserved)
**Effort**: LOW (~45 min — frontend button + alert dialog)
**Risk**: LOW — no data deletion

**Limitation**: Customer is not truly "deleted" — data remains in DB. For GDPR/privacy compliance, this is NOT a delete.

---

### Option B — Anonymise (GDPR-Style)

**What it does**: Wipe PII fields; replace with anonymous placeholders
- `name` → "Deleted Customer"
- `phone` → "000-DELETED-{short_id}"
- `email` → null
- `dob`, `anniversary`, `gst_name`, `gst_number` → null
- `addresses` → []
- Set `is_blocked=True` + `is_deleted=True`
- **Keep**: `customer_id`, `total_points`, `total_spent`, `total_visits`, `tier`, `orders`, `coupon_usage` — analytics intact

**Data preserved**: Business history (revenue, points, loyalty)
**Analytics**: Fully intact — revenue, repeat rates, lifecycle counts all correct
**Reversible**: ❌ No — PII is gone
**S3 documents**: Must delete S3 objects + `customer_documents` records (using `core/s3.delete_object`)
**Effort**: MEDIUM (~2 hrs)
**Risk**: LOW-MEDIUM — no cascade deletes, no order data loss

**Best for**: GDPR/privacy compliance while preserving business analytics.

---

### Option C — Hard Delete with Full Cascade (COMPLETE)

**What it does**: Delete customer + all 13 related collections + S3 files

Cascade order (dependencies must be respected):
```
1. customer_documents → delete_many + s3.delete_object(s3_key) per doc
2. coupon_usage         → delete_many
3. coupon_transactions  → delete_many
4. coupon_distributions → delete_many
5. points_transactions  → delete_many  (already coded)
6. wallet_transactions  → delete_many
7. whatsapp_message_logs → delete_many
8. feedback             → delete_many
9. loyalty_mismatch_logs → delete_many
10. customer_otps        → delete_many
11. pos_event_logs       → delete_many
12. order_items          → delete_many (linked to orders)
13. orders               → delete_many
14. customers            → delete_one  ← last
```

**Data preserved**: None — complete erasure
**Analytics**: Orders deleted → restaurant revenue totals CHANGE (could confuse owner)
**Reversible**: ❌ No
**S3 documents**: Must clean via `core/s3.delete_object(s3_key)`
**Effort**: HIGH (~3 hrs)
**Risk**: HIGH — deletes financial records (orders, coupon_usage), analytics totals change

**Best for**: Complete data erasure (e.g. owner explicitly requests "remove all trace").

---

## 6. Current Status Summary

| Surface | Exists? | Gaps |
|---|---|---|
| Soft delete (POS auth) | ✅ `DELETE /api/pos/customers/{id}` | Not exposed in CRM frontend |
| Hard delete (CRM auth) | ✅ `DELETE /api/customers/{id}` | Only 2/13 collections cleaned. No frontend button. S3 not cleaned. |
| CRM frontend delete button | ❌ Does not exist | No button on CustomerDetailPage or CustomersPage |
| Analytics after delete | Depends on option | See Option A/B/C |

---

## 7. Recommended Approach — Owner Must Decide

| Question | Option A | Option B | Option C |
|---|---|---|---|
| Truly removes customer? | ❌ No (blocked only) | Partial (PII wiped) | ✅ Yes (full erasure) |
| Analytics intact? | ✅ Yes | ✅ Yes | ❌ Revenue totals change |
| GDPR/privacy compliant? | ❌ No | ✅ Yes | ✅ Yes |
| Reversible? | ✅ Yes | ❌ No | ❌ No |
| Effort | ~45 min (LOW) | ~2 hrs (MEDIUM) | ~3 hrs (HIGH) |
| Risk | LOW | LOW-MEDIUM | HIGH |

**Agent recommendation**: Start with **Option A** (soft delete button in CRM UI) immediately — it's already coded in POS auth, just needs a UI button. Then add **Option B** (anonymise) for GDPR use cases. Option C (hard delete) only if owner explicitly needs full erasure.

---

## 8. Investigation Output

```
Investigation complete: INV-016
Root cause: Customer delete has HIGH impact. DELETE /api/customers/{id} exists
            but is incomplete (only 2/13 collections cleaned, S3 not cleaned,
            no frontend button). Soft delete exists in POS auth but not in CRM UI.
Classification: BE + FE
Confidence: HIGH
Steps used: 10/10
Evidence: customers.py:1877 (incomplete hard delete), pos.py:2606 (soft delete),
          core/s3.py:258 (delete_object available), 13 collections mapped
Recommendation: INTAKE — register new CR. Owner must choose Option A/B/C.
Report: investigations/INV_016_CUSTOMER_DELETE_IMPACT.md
```
