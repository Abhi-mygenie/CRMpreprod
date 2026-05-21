# CRM 1.0 — CR List

## CR Tracking Table

| CR | Name | Purpose | Priority | Depends On | Status |
|---|---|---|---|---|---|
| CR-001 | POS Order Data Mapping & CRM Visibility | Verify and fix POS order data mapping into CRM collections and UI visibility | P0 | None | plan_waiting_owner_answers |
| CR-002 | WhatsApp Automation Trigger Flow | Fix WhatsApp automation after POS order ingestion | P1 | CR-001 | intake_ready_blocked_by_cr001 |
| CR-003 | Loyalty Points Flow | Validate and fix loyalty points creation, earning, redemption, balances, and visibility | P1 | CR-001 | intake_ready_blocked_by_cr001 |
| CR-004 | Coupon Code Flow | Validate and fix coupon application, validation, storage, usage tracking, and CRM visibility | P1 | CR-001 | intake_ready_blocked_by_cr001 |
| CR-005 | Wallet Flow | Validate and fix wallet balance, wallet usage, wallet transactions, and CRM visibility | P1 | CR-001 | intake_ready_blocked_by_cr001 |

## Status Definitions

| Status | Meaning |
|---|---|
| `intake_ready` | CR is queued for analysis. No blockers. |
| `intake_ready_blocked_by_crXXX` | CR is queued but cannot begin analysis until the blocking CR is complete. |
| `analysis_in_progress` | CR is being analyzed (code + DB + UI inspection). |
| `analysis_complete` | Analysis done. Awaiting owner review of plan. |
| `planning_complete` | Plan approved by owner. Ready for implementation. |
| `implementation_in_progress` | Code changes underway. |
| `implementation_complete` | Code changes done. Awaiting QA. |
| `qa_in_progress` | Testing underway. |
| `qa_passed` | All tests pass. Ready for baseline update. |
| `qa_failed` | Tests failed. Returning to implementation. |
| `closed` | CR complete. Baseline updated. |

## Dependency Graph

```
CR-001 (P0)
  ├── CR-002 (P1)
  ├── CR-003 (P1)
  ├── CR-004 (P1)
  └── CR-005 (P1)
```

CR-001 must be completed first. CR-002 through CR-005 have no dependencies on each other and can theoretically be parallelized after CR-001, but the recommended order is sequential (002 → 003 → 004 → 005) for ease of review.
