# CRM 1.0 — Deferred UI Bugs / Observations

Lightweight tracker for UI/UX issues observed during preview QA that are
**not blocking** current implementation phases and can be addressed in a
later UX polish pass. Each entry is annotated with severity, where it was
spotted, and an unambiguous reproduction path so a future agent can pick
it up without context.

Conventions:
- **Severity:** P0 (data-corrupting), P1 (misleading), P2 (cosmetic).
- **Status:** `open` / `in-progress` / `closed`.
- **Owner:** unassigned unless explicitly claimed.

---

## UI-BUG-001 — Customer list "SPENT" column rounds to nearest ₹K, hiding meaningful spend differences between customers

| Field | Value |
|---|---|
| **ID** | UI-BUG-001 |
| **Severity** | P1 — misleading |
| **Status** | open |
| **Owner** | unassigned |
| **Discovered on** | 2026-05-23 |
| **Discovered during** | CR-001C-L LF-MERGE post-migration verification on `Jeh's Nest` (`pos_0001_restaurant_635`) |
| **Where in UI** | Customer list page (the "Highest Spend" sorted view). Affected column: **SPENT**. |
| **Frontend file (likely candidate)** | `frontend/src/pages/Customers.jsx` (or equivalent table component) — wherever `total_spent` is formatted via a `formatINR` / `compactCurrency` helper. |

### Reproduction
1. Migrate a restaurant with customers whose `total_spent` falls between ₹2,500 and ₹3,500.
2. Sort by **Highest Spend**.
3. Customer list shows three customers all labeled "₹3K" in the SPENT column, with very different POINTS values (156, 129, 109).

### Why it looks like a bug
A user reading the screen reasonably assumes:
- Customer 1, 2, 3 all spent the same amount (because the SPENT label is identical).
- Therefore points should also be identical.

But they are not — and the user has no way to see why from the UI alone.

### Root cause
The display formatter compacts `total_spent` to `₹{round(value/1000)}K` when value ≥ ₹1,000. Actual values from the database for the three top customers were:
- ₹3,130 (rounded to ₹3K)
- ₹2,677 (rounded to ₹3K)
- ₹2,510 (rounded to ₹3K)

Points differ for two reasons (both correct backend behavior):
1. **Actual `total_spent` differs by hundreds of rupees** — hidden by the compact display.
2. **Per-order `int()` truncation in `core.loyalty.calculate_points`** — customers with many small orders (e.g. ₹0–₹20 per order) lose more to per-order rounding. Some orders are below `min_order_value=₹10` and earn 0.

### Proposed fix (later)
Two options, either acceptable:

- **Option A (preferred):** show full rupees with thousand-separators in the SPENT column (`₹3,130`, `₹2,677`, `₹2,510`). The column has horizontal space.
- **Option B (alternative):** keep "K" abbreviation but add ≥1 decimal precision (`₹3.1K`, `₹2.7K`, `₹2.5K`).

Either makes the differences immediately visible.

### Validation evidence captured at discovery
```
#1 (no name)        9 orders   sum ₹3,130   sum_pe 156   te 156  (clean: all orders ≥ ₹100)
#2 saurav          37 orders   sum ₹2,677   sum_pe 129   te 129  (14 orders < ₹10 → earn 0; −4 pts trunc loss)
#3 Abhishek Goyal  55 orders   sum ₹2,510   sum_pe 109   te 109  (13 orders < ₹10 → earn 0; −16 pts trunc loss)
```

Backend points are **correct** per `core.loyalty.calculate_points`. The UI is the only layer that needs work.

### Out-of-scope for current phase
- ❌ Not changing the backend points math.
- ❌ Not changing `min_order_value` policy.
- ❌ Not changing the per-order `int()` truncation rule.
- Owner has accepted the math as faithful to the L3 spec.

---

<!--
  Append new entries below this line as UI-BUG-002, UI-BUG-003, ...
  Keep entries short. One full reproduction recipe per bug.
-->
