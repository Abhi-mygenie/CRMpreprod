# CR-015a — Preview Sample Data Gap — IMPLEMENTATION CLOSEOUT

**Parent CR**: CR-015 (WhatsApp Template Variable Mapping Fidelity)
**Status code**: `cr015a_implemented_2026_05_29`
**Implemented**: 2026-05-29
**Spec**: `../planning/CR_015A_PREVIEW_SAMPLE_DATA_FROZEN_SPEC.md`
**Discovery**: `../discovery/CR_015A_PREVIEW_SAMPLE_DATA_GAP_DISCOVERY.md`

---

## What was the problem
Template preview bubble showed red **"NA"** for the 14 CR-015 T5 order-context variables
(payment_method, order_date, etc.) because `GET /api/customers/sample-data` only returned the
original 23 keys. Live sends were unaffected (they use `build_order_event_context`). Preview-only UX defect.

## What was implemented (Option A + partial Option B)
**Backend — `routers/customers.py` (`get_sample_customer_data`)**
- Added 14 static T5 sample values to the `sample` dict, mirroring the registry `example` fields:
  `payment_method=UPI`, `order_date=25 May 2026`, `order_time=7:45 PM`, `restaurant_order_id=KM-1234`,
  `transaction_id=TXN9876543`, `table_id=T5`, `waiter_name=Ramesh`, `order_type=Dine-In`,
  `loyalty_points_used=200`, `loyalty_discount=Rs.50`, `wallet_used=Rs.100`, `tax_amount=Rs.85`,
  `item_count=3`, `order_notes=No onion in biryani`.

**Frontend — registry-`example` fallback in `resolvePreviewWithSampleData`**
- `components/shared/WhatsAppAutomationContent.jsx` and `pages/TemplatesPage.jsx`: when
  `sampleCustomerData[mappedField]` is empty/undefined, fall back to
  `availableVariables.find(v => v.key === mappedField)?.example`. Self-healing for future registry additions.

## Verification
- `GET /api/customers/sample-data` → **37 keys**, all 14 T5 keys present & non-empty (curl, real owner login).
- Visual: Templates "Map Template Variables" modal preview renders values — **no red "NA"**.
- Frontend lint clean; webpack compiles. Core pytest 75 passed.

## Notes / scope
- SegmentsPage inline preview (uses same `sample-data` endpoint) is auto-fixed by the backend change.
- The WhatsApp Automation orphaned mapping modal was removed in CR-015b, so the fallback there
  applies to the live automation-card + template-preview resolvers.
- Out of scope: pre-existing empty keys (order_id, coupon_*, old_tier, etc.) — empty before T5.

**End of CR-015a closeout.**
