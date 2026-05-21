# CR-005 — Wallet Flow — Analysis

> **Status:** `analysis_not_started`
> **Sprint:** CRM 1.0
> **Priority:** P1
> **Depends On:** CR-001

## Objective
Validate and fix wallet balance, wallet usage, wallet transactions, and CRM visibility.

## Sections To Be Filled

### 1. Wallet Debit Flow Audit (POS Order)
_Trace wallet_used validation and deduction in pos_order_webhook._

### 2. Wallet Credit Flow Audit (CRM UI)
_Trace manual wallet top-up via /api/wallet/transaction._

### 3. Wallet Balance Accuracy Audit
_Check if `customers.wallet_balance` accurately reflects sum of credits minus debits._

### 4. Running Totals Audit
_Check `total_wallet_received`, `total_wallet_used` on customer record — are they maintained?_

### 5. Wallet Transactions Collection Audit
_Verify `wallet_transactions` entries are created with correct type, amount, balance_after._

### 6. CRM UI Audit
_Check Customer Detail wallet tab, Dashboard wallet section, Wallet page._

### 7. Identified Issues
_List all issues found during analysis._

### 8. Recommendations
_Proposed fixes, ordered by priority._

---

**WARNING:** Do not use this placeholder as implementation approval. Analysis must be completed and reviewed before planning begins.
