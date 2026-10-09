# INTAKE DOC — CR-2026-09-12-012

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-012 |
| **Title** | Thick-page decomposition — `pages/ReviewOrder.jsx` (2,070 lines) → `features/checkout/{hooks,components}`; page ≤ 300 lines; behaviour-preserving |
| **Classification** | CR — Refactor |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Baseline §5 / handover §3 ("main change-risk driver") under owner item 4 |
| **Severity** | P2 |
| **Risk** | **CRITICAL** (`ReviewOrder.jsx` = order placement + payment payload; Part C; no Fast Lane) |
| **Status** | INTAKE ✅ — blocked on CR-005 (CI) + CR-007 (facade) CLOSED; may run in parallel with Master Outlet |
| **Parent** | CR-2026-09-12-001 (Wave 5) |

## 1. Problem

Payment orchestration, table/room guards, delivery-fee recompute (L771-800), 716 branches, edit-order state machine, Razorpay + COD + retry paths all in one component. Every CR touching checkout re-tests everything.

## 2. Scope

**IN:** extract `useOrderSubmit`, `useDeliveryFee`, `useTableLocation`, `usePaymentSelection`; presentational components; **payload fields unchanged** (`payment_method`/`payment_type` semantics per addendum rule 3; `finalTableId='0'` rule 10).
**OUT:** any business-rule change; 716 flag work (CR-2026-08-03-001 lands first).

## 3. Duplicate Check

ROADMAP P0-3 refactor target; no prior CR. CR-2026-02-XX-001 (fetch timeouts in ReviewOrder) RELATED. **DISTINCT.**

## 4. Blast Radius

LARGE — dine-in, takeaway, delivery, room, edit-order, Razorpay, COD, 401-retry, stock-out 422 (CR-2026-09-07-001 layer 3), time-controlled ordering (CR-2026-08-06-001).

## 5. Regression required (CRITICAL)

Full E2E matrix across all order types × payment modes × edit mode; payload byte-diff against pre-refactor capture.

---

```text
Intake complete: CR-2026-09-12-012
Classification: CR (Refactor)
Severity: P2
Risk: CRITICAL
Duplicate check: DISTINCT
Evidence: captured
Blast radius: LARGE
Docs updated: this file; README.md
Next: Planning (after CR-005, CR-007)
```
