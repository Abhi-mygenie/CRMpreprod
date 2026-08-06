# CR-025: Virtual Wallet Management — Discovery (Phase 0)

**Sprint**: ROI Measurement / CRM
**CR code**: CR-025
**Lifecycle stage**: `cr025_discovery_phase_0_brainstorming`
**Date**: 2026-06-06
**Owner**: Abhi
**Primary use case**: Canteens, student mess, campus food ordering, subscription-based food plans, institutional wallet

---

## 1. Problem Statement

The current Wallet module is a **placeholder**. The frontend shows "Wallet is disabled" or "Coming Soon". Backend has basic credit/debit endpoints and 12 historical transactions (synced from MyGenie). No tenant has `wallet_enabled=true`. Zero orders have used wallet balance.

The owner wants to build a **complete Virtual Wallet Management** system primarily targeting **canteens, student mess, campus food ordering, and subscription-based food plans** — where customers/students pre-load wallet balance and use it at checkout via POS or online ordering.

---

## 2. Current State — What EXISTS Today

### 2.1 Backend

| Component | File | Status | Notes |
|---|---|---|---|
| `POST /api/wallet/transaction` | `routers/wallet.py:14` | ✅ Works | Credit/debit with balance check, WhatsApp triggers |
| `GET /api/wallet/transactions/{customer_id}` | `routers/wallet.py:109` | ✅ Works | Transaction history per customer |
| `GET /api/wallet/balance/{customer_id}` | `routers/wallet.py:117` | ✅ Works | Returns current balance |
| `wallet_balance` on customer doc | `models/schemas.py:460` | ✅ Exists | `customers.wallet_balance` (float) |
| `total_wallet_received` / `total_wallet_used` | `models/schemas.py:461-462` | ✅ Exists | Aggregate tracking fields |
| `wallet_transactions` collection | DB | ✅ Exists | 12 docs (historical sync), basic schema |
| `wallet_used` on orders | `routers/pos.py:1434` | ✅ Works | POS deducts wallet at order time |
| Insufficient balance check | `routers/pos.py:1436` | ✅ Works | Returns error if wallet_used > wallet_balance |
| `wallet_enabled` toggle | `loyalty_settings` | ✅ Exists | But set to `false` for all 20 tenants |
| WhatsApp triggers | `wallet.py:53-105` | ✅ Works | `wallet_credit` + `wallet_debit` events fire |

### 2.2 Frontend

| Component | File | Status |
|---|---|---|
| `WalletPage.jsx` | `pages/WalletPage.jsx` | ❌ **Placeholder only** — shows "Wallet is disabled" or "Coming Soon" |
| Customer detail wallet section | `CustomerDetailPage.jsx` | ⚠️ Shows `wallet_balance` but no top-up/debit UI |

### 2.3 DB Data

- **wallet_transactions**: 12 docs (all historical MyGenie sync, no CRM-native transactions)
- **Customers with balance > 0**: 12 out of 5,032
- **Orders using wallet**: 0
- **Wallet enabled tenants**: 0 out of 20

### 2.4 What's MISSING (the gaps)

| # | Gap | Severity |
|---|---|---|
| G1 | **No wallet admin dashboard** — CRM owner can't see aggregate wallet stats, top-up customers, or manage wallet policies | 🔴 CRITICAL |
| G2 | **No bulk recharge** — can't load wallet for 500 students at once (canteen use case) | 🔴 CRITICAL |
| G3 | **No wallet rules engine** — no auto-recharge, expiry, max balance, min balance, daily limits | 🔴 CRITICAL |
| G4 | **No transaction ledger view** — admin can't see all wallet activity across customers | 🟡 HIGH |
| G5 | **No online ordering wallet integration** — only POS can deduct; online/app ordering can't | 🟡 HIGH |
| G6 | **No refund flow** — cancelled/failed orders don't auto-refund to wallet | 🟡 HIGH |
| G7 | **No wallet reports** — no recharge report, usage report, balance report | 🟡 HIGH |
| G8 | **No subscription/meal plan model** — no way to map "X meals/month" to wallet value | 🟡 MEDIUM |
| G9 | **No wallet top-up by customer** — only admin can credit; customer can't self-recharge via UPI/payment gateway | 🟡 MEDIUM |
| G10 | **No adjustment/correction flow** — admin can't fix wrong credits without creating visible debit | 🟠 LOW |
| G11 | **No duplicate debit prevention beyond wallet_used field** — idempotency not enforced | 🟠 LOW |
| G12 | **No partial payment** — POS handles it but CRM has no split-payment visibility (wallet + cash/UPI) | 🟠 LOW |

---

## 3. Target Use Cases

### 3.1 Primary: Campus Canteen / Student Mess

```
Admin (hostel/canteen manager)
  │
  ├── Bulk recharge: Upload CSV or select students → credit Rs.X each
  ├── Monthly meal plan: "Gold Plan = Rs.5,000/month" → auto-credit on 1st
  ├── View: Which students have low balance (<Rs.500)? Alert parents.
  ├── Reports: Daily canteen usage, student-wise consumption, meal-wise breakdown
  └── Rules: Max balance Rs.20,000, daily spend limit Rs.1,000, expiry 90 days
                    │
Student/Customer ◄──┘
  │
  ├── Check balance (WhatsApp / CRM link / POS screen)
  ├── Order food at canteen POS → wallet deducted automatically
  ├── Order online (app/web) → wallet deducted at checkout
  ├── Partial payment: Rs.200 from wallet + Rs.100 cash (if balance low)
  └── Get WhatsApp: "Rs.150 debited. Balance: Rs.4,850"
```

### 3.2 Secondary: Restaurant Prepaid / Gift Cards

```
Customer walks in → pays Rs.5,000 cash → admin credits wallet
Customer orders over multiple visits → wallet deducted each time
When balance < Rs.500 → WhatsApp reminder: "Recharge your wallet!"
Optional: Customer recharges via UPI link (self-service)
```

### 3.3 Tertiary: Corporate Meal Allowance

```
Company → CRM → bulk credit employees' wallets monthly
Employees → POS orders → wallet deducted
Company admin → monthly report: total spent, per-employee breakdown
Rules: Max Rs.500/day, weekdays only, no alcohol category
```

---

## 4. Proposed Module Scope

### 4.1 CRM-Side (Admin Dashboard)

| Feature | Priority | Description |
|---|---|---|
| **Wallet Dashboard** | P0 | Aggregate stats: total deposited, total used, total active balance, active wallets count, low-balance alerts |
| **Customer Wallet View** | P0 | Per-customer: balance, transaction history, top-up button, debit button, adjustment |
| **Bulk Recharge** | P0 | Select customers (by segment/audience or CSV upload) → credit Rs.X each → generates bulk wallet_transactions |
| **Transaction Ledger** | P0 | Admin-wide ledger: all credits/debits across all customers, filterable by date/type/customer/amount |
| **Wallet Rules** | P1 | Per-tenant config: max_balance, daily_spend_limit, min_recharge, expiry_days, auto_expiry_enabled |
| **Reports** | P1 | Recharge report, usage report, balance report, customer-wise ledger export (CSV) |
| **Meal Plans / Subscriptions** | P2 | Define plans (name, amount, frequency), assign to customers, auto-credit on schedule |
| **Low Balance Alerts** | P2 | WhatsApp notification when balance drops below threshold |
| **Customer Self-Recharge** | P3 | Payment gateway integration (Razorpay/Stripe) → customer pays → auto-credit |
| **Spend Category Rules** | P3 | Block wallet usage on specific item categories (e.g., alcohol) |

### 4.2 POS-Side (Already partially working)

| Feature | Status | What's needed |
|---|---|---|
| Wallet deduction at order | ✅ Works | No change needed |
| Insufficient balance error | ✅ Works | No change |
| Partial payment (wallet + cash) | ✅ POS handles | CRM visibility of split (P1) |
| Wallet balance display on POS | ⚠️ Via `/pos/customer-lookup` | Confirm field returned |
| Refund to wallet on order cancel | ❌ Missing | New endpoint or auto-trigger (P1) |

### 4.3 Online Ordering (Future)

| Feature | Priority | Notes |
|---|---|---|
| Wallet balance check at checkout | P2 | Needs API: `GET /api/wallet/balance/{customer_id}` (exists) |
| Wallet deduction at order placement | P2 | Needs API: `POST /api/wallet/debit-for-order` (new) |
| Split payment (wallet + online payment) | P3 | Complex — needs payment gateway coordination |

---

## 5. User Flows

### 5.1 Admin: Single Customer Top-Up
```
CRM → Wallet Dashboard → Search customer → Click "Top Up"
  → Enter amount + payment method (cash/UPI/bank transfer) + optional note
  → Confirm → wallet_transactions created → customer.wallet_balance updated
  → WhatsApp: "Rs.5,000 credited to your wallet. Balance: Rs.5,000"
```

### 5.2 Admin: Bulk Recharge
```
CRM → Wallet Dashboard → "Bulk Recharge" button
  → Option A: Select audience/segment (e.g., "All Students")
  → Option B: Upload CSV (phone, amount)
  → Enter amount (uniform) or use CSV amounts
  → Preview: "342 customers × Rs.5,000 = Rs.17,10,000 total"
  → Double confirm (>Rs.1,00,000)
  → Background task: iterate customers → credit each → log each transaction
  → Summary: 342 credited, 0 failed, total Rs.17,10,000
```

### 5.3 Student: Order at Canteen POS
```
POS → Student scans QR / gives phone number → POS looks up customer
  → POS shows: "Wallet Balance: Rs.4,850"
  → Student orders Thali Rs.150
  → POS sends: POST /api/pos/orders { wallet_used: 150.0 }
  → CRM: deducts Rs.150, new balance Rs.4,700
  → WhatsApp: "Rs.150 debited for Thali. Balance: Rs.4,700"
```

### 5.4 Order Cancellation → Auto-Refund
```
POS → Cancel order #12345 (wallet_used: Rs.150)
  → POST /api/pos/orders/cancel { order_id: 12345 }
  → CRM: credits Rs.150 back, new balance Rs.4,850
  → wallet_transactions: { type: "refund", amount: 150, ref: order_12345 }
  → WhatsApp: "Rs.150 refunded for cancelled order. Balance: Rs.4,850"
```

### 5.5 Meal Plan Auto-Credit
```
Admin → Wallet → Meal Plans → Create: "Monthly Mess Plan", Rs.5,000, Monthly, 1st of month
  → Assign to: "All Hostel Students" segment
  → APScheduler job fires on 1st → bulk credit → WhatsApp notification
```

---

## 6. Data Model

### 6.1 `wallet_transactions` collection (EXPAND existing)

```json
{
  "id": "uuid",
  "user_id": "pos_0001_restaurant_689",
  "customer_id": "uuid",
  "amount": 5000.0,
  "transaction_type": "credit | debit | refund | adjustment | expiry",
  "description": "Monthly meal plan recharge",
  "payment_method": "cash | upi | bank_transfer | online | system",
  "balance_before": 0.0,
  "balance_after": 5000.0,
  "reference_type": "manual | bulk_recharge | order | refund | meal_plan | adjustment | expiry",
  "reference_id": "order_uuid or recharge_batch_id",
  "batch_id": "uuid (for bulk recharges)",
  "performed_by": "admin_user_id | system | customer",
  "notes": "Optional admin note",
  "idempotency_key": "unique per transaction (prevents duplicates)",
  "created_at": "ISO datetime"
}
```

### 6.2 `wallet_rules` (NEW — per tenant, stored on `loyalty_settings` or separate)

```json
{
  "user_id": "pos_0001_restaurant_689",
  "wallet_enabled": true,
  "max_balance": 20000.0,
  "min_recharge": 100.0,
  "daily_spend_limit": 5000.0,
  "expiry_enabled": false,
  "expiry_days": 90,
  "low_balance_threshold": 500.0,
  "low_balance_alert_enabled": true,
  "auto_recharge_enabled": false,
  "auto_recharge_amount": 0,
  "auto_recharge_trigger_balance": 0,
  "blocked_categories": []
}
```

### 6.3 `wallet_recharge_batches` (NEW — for bulk recharges)

```json
{
  "id": "uuid",
  "user_id": "pos_0001_restaurant_689",
  "name": "January Mess Recharge",
  "audience_id": "segment_id or all-customers",
  "audience_name": "All Hostel Students",
  "amount_per_customer": 5000.0,
  "total_customers": 342,
  "total_amount": 1710000.0,
  "total_credited": 342,
  "total_failed": 0,
  "status": "completed | running | failed",
  "performed_by": "admin_user_id",
  "created_at": "ISO datetime",
  "completed_at": "ISO datetime"
}
```

### 6.4 `meal_plans` (NEW — P2, for subscription model)

```json
{
  "id": "uuid",
  "user_id": "pos_0001_restaurant_689",
  "name": "Monthly Mess Gold",
  "amount": 5000.0,
  "frequency": "monthly | weekly | quarterly",
  "credit_day": 1,
  "is_active": true,
  "assigned_audience_id": "segment_id",
  "assigned_customer_ids": [],
  "created_at": "ISO datetime"
}
```

### 6.5 Customer doc changes (EXPAND existing `customers` collection)

```
wallet_balance: 4850.0          ← exists
total_wallet_received: 15000.0  ← exists
total_wallet_used: 10150.0      ← exists
wallet_last_recharged_at: "ISO" ← NEW
wallet_expires_at: "ISO"        ← NEW (if expiry enabled)
meal_plan_id: "uuid"            ← NEW (P2)
```

---

## 7. API Contracts (Proposed)

### 7.1 Existing (no changes needed)

| Endpoint | Method | Status |
|---|---|---|
| `/api/wallet/transaction` | POST | ✅ Works (single credit/debit) |
| `/api/wallet/transactions/{customer_id}` | GET | ✅ Works |
| `/api/wallet/balance/{customer_id}` | GET | ✅ Works |

### 7.2 New Endpoints (P0)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/wallet/dashboard` | GET | Aggregate stats: total deposited, total used, total balance, active wallets, low-balance count |
| `/api/wallet/ledger` | GET | All transactions across all customers (paginated, filterable) |
| `/api/wallet/bulk-recharge` | POST | Bulk credit: `{ audience_id, amount, description }` → background task |
| `/api/wallet/recharge-batches` | GET | List all bulk recharge batches |
| `/api/wallet/rules` | GET/PUT | Get/update wallet rules for tenant |

### 7.3 New Endpoints (P1)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/wallet/refund` | POST | Refund for cancelled order: `{ order_id, amount }` |
| `/api/wallet/adjustment` | POST | Admin correction: `{ customer_id, amount, type: credit/debit, reason }` |
| `/api/wallet/reports/recharge` | GET | Recharge report (date range, CSV export) |
| `/api/wallet/reports/usage` | GET | Usage report (date range, customer-wise, CSV export) |
| `/api/wallet/reports/balance` | GET | Current balance report (all customers, sortable) |

### 7.4 New Endpoints (P2)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/wallet/meal-plans` | CRUD | Meal plan management |
| `/api/wallet/meal-plans/{id}/assign` | POST | Assign plan to audience/customers |
| `/api/pos/orders/cancel` | POST | Order cancellation → auto wallet refund |

---

## 8. Frontend Pages (Proposed)

### 8.1 Wallet Dashboard (P0) — Replace current placeholder

```
┌─────────────────────────────────────────────────────┐
│ Wallet Management                    [Bulk Recharge] │
│                                                      │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐   │
│ │Total │ │Total │ │Active│ │Active│ │Low Bal   │   │
│ │Depo- │ │Used  │ │Bal-  │ │Wal-  │ │Alerts    │   │
│ │sited │ │      │ │ance  │ │lets  │ │(<Rs.500) │   │
│ │17.1L │ │10.2L │ │6.9L  │ │342   │ │23        │   │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────────┘   │
│                                                      │
│ Tabs: [All Customers] [Low Balance] [Recently Used]  │
│                                                      │
│ ┌─ Customer List ────────────────────────────────┐  │
│ │ Name      Phone       Balance   Last Recharge  │  │
│ │ Rahul     9876543210  Rs.4,850  01 Jun 2026    │  │
│ │ Priya     8765432109  Rs.320    15 May 2026 ⚠️│  │
│ │ ...                                            │  │
│ │           [Top Up] [View Ledger] [Adjust]      │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ ┌─ Recent Transactions ──────────────────────────┐  │
│ │ Date       Customer   Type    Amount   Balance  │  │
│ │ Jun 6      Rahul      Debit   -150    4,850    │  │
│ │ Jun 6      Priya      Credit  +5,000  5,320    │  │
│ │ ...                                            │  │
│ └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 8.2 Bulk Recharge Page (P0)

```
Step 1: Select audience (segment dropdown or CSV upload)
Step 2: Enter amount + description + payment method
Step 3: Preview (N customers × Rs.X = Rs.Total)
Step 4: Confirm → Execute → Show results
```

### 8.3 Wallet Rules (P1) — Section in Loyalty Settings or standalone

```
Toggle: Wallet Enabled
Max Balance: [20,000]
Min Recharge: [100]
Daily Spend Limit: [5,000]
Expiry: [Enabled] [90 days]
Low Balance Alert: [Enabled] [Rs.500 threshold]
```

---

## 9. Edge Cases & Safety

| # | Edge Case | Handling |
|---|---|---|
| E1 | Insufficient balance | POS already returns 400. Online ordering should do the same. |
| E2 | Partial wallet + cash/UPI | POS handles split. CRM records `wallet_used` on order + remaining paid via other method. |
| E3 | Cancelled order refund | New: auto-credit wallet_used back. Create `refund` transaction. Idempotency via `order_id + refund`. |
| E4 | Failed order (network timeout at POS) | POS retries may cause double debit. Fix: `idempotency_key` on wallet transaction (order_id based). |
| E5 | Duplicate bulk recharge | `batch_id` + `idempotency_key` per customer in batch. If batch re-runs, skip already-credited customers. |
| E6 | Wallet balance goes negative | Should never happen — always check before debit. Add DB-level guard: `wallet_balance >= 0` assertion before update. |
| E7 | Expired balance | If expiry enabled: cron job checks `wallet_expires_at`, creates `expiry` transaction, zeroes balance. WhatsApp alert before expiry (7 days). |
| E8 | Max balance exceeded on recharge | Reject credit if `current_balance + amount > max_balance`. Return clear error. |
| E9 | Daily spend limit exceeded | Check sum of debits today < `daily_spend_limit` before POS deduction. |
| E10 | Admin credits wrong customer | `adjustment` transaction type with `reason` field. Audit trail preserved. |
| E11 | Concurrent debits (race condition) | Use MongoDB `findOneAndUpdate` with `$inc: -amount` and `wallet_balance >= amount` condition. Atomic. |

---

## 10. Reports

| Report | Priority | Content |
|---|---|---|
| **Recharge Report** | P1 | Date range → all credit transactions, grouped by day/week/month, total deposited, by payment method |
| **Usage Report** | P1 | Date range → all debit transactions, grouped by day/customer, linked to orders |
| **Balance Report** | P1 | Current snapshot: all customers with balance > 0, sortable by balance/name, CSV export |
| **Customer Ledger** | P1 | Per-customer: full transaction history, running balance, filters by type |
| **Batch Recharge Report** | P2 | Per-batch: who was credited, how much, success/fail count |
| **Expiry Report** | P2 | Upcoming expiries, expired amounts, customers affected |
| **Canteen-wise Usage** | P2 | If multi-outlet: usage per outlet/counter (requires `outlet_id` on transactions) |

---

## 11. Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Race condition on concurrent wallet debits | Medium | High (balance goes negative) | Atomic MongoDB `findOneAndUpdate` with balance check |
| Bulk recharge to 5000 students times out | Medium | Medium | Background task with progress tracking, batch processing |
| POS sends wallet_used for cancelled order, CRM doesn't refund | High | High (student loses money) | Build refund endpoint, POS sends cancel webhook |
| Expiry cron misses a run | Low | Medium | Idempotent expiry (check + skip if already expired), catch-up logic |
| Payment gateway integration complexity (self-recharge) | Medium | Low (P3 feature) | Defer to Phase 3, use Razorpay/Stripe playbook |
| Multi-outlet wallet isolation (student at campus A can't use at campus B) | Low | Medium | Default: wallet is per-tenant, shared across outlets. Isolation is future CR. |

---

## 12. Effort Estimate

| Phase | Scope | Effort |
|---|---|---|
| **P0** | Dashboard + single top-up/debit + bulk recharge + ledger + wallet rules toggle | ~3-4 days |
| **P1** | Refund flow + adjustment + reports (recharge/usage/balance) + CSV export | ~2-3 days |
| **P2** | Meal plans + subscription auto-credit + expiry cron + low-balance alerts | ~3-4 days |
| **P3** | Customer self-recharge (payment gateway) + spend category rules | ~3-4 days |
| **Total** | | ~11-15 days |

---

## 13. Owner Questions (blocks planning)

| # | Question | Impact | Recommended Default |
|---|---|---|---|
| **Q1** | Which phase to start with? P0 only, or P0+P1 together? | Scoping | P0 first, ship, then P1 |
| **Q2** | Primary tenant for testing? Kunafa Mahal or a canteen tenant? | Test data | Kunafa Mahal (most data), create test students |
| **Q3** | Bulk recharge: audience-based only, or also CSV upload with per-customer amounts? | P0 scope | Audience-based first, CSV in P1 |
| **Q4** | Wallet rules: store on `loyalty_settings` (extend existing) or new `wallet_rules` collection? | Architecture | Extend `loyalty_settings` (simpler, already has `wallet_enabled`) |
| **Q5** | Order cancellation refund: automatic (CRM auto-credits on cancel webhook) or manual (admin clicks refund)? | UX | Automatic for POS cancels, manual for admin adjustments |
| **Q6** | Do you need multi-outlet wallet isolation (student at canteen A can't spend at canteen B)? | Architecture | No — single wallet per customer per tenant. Future CR if needed. |
| **Q7** | Meal plan auto-credit: on which day? 1st of month? Configurable? | P2 scoping | Configurable per plan |
| **Q8** | Self-recharge payment gateway preference? Razorpay / Stripe / both? | P3 scoping | Razorpay (India focus) |
| **Q9** | Should wallet transactions be visible to the customer (via a customer-facing page/WhatsApp)? | UX | Yes — WhatsApp on every credit/debit (already wired), plus balance check via WhatsApp bot (future) |
| **Q10** | Daily spend limit: hard block or soft warning? | Rules | Hard block at POS (reject if exceeded) |

---

## 14. Out of Scope

| Item | Reason |
|---|---|
| Payment gateway integration (Razorpay/Stripe) | P3 — complex, needs separate CR |
| Multi-currency wallet | India only for now |
| Inter-tenant wallet transfer | Not a use case |
| Wallet-to-wallet transfer (student to student) | Regulatory complexity, defer |
| Credit line / negative balance | Not prepaid model |
| Blockchain/crypto wallet | Out of scope permanently |
| Wallet statements via email/PDF | P3 — after email channel exists |

---

## 15. Resume Signal

**CR-025 is PARKED at Phase 0 Discovery.**

To resume: Owner answers Q1-Q10 (especially Q1 scope, Q3 bulk recharge, Q5 refund flow). Then agent writes `planning/CR_025_PHASE1_WALLET_MANAGEMENT_PLAN.md` with locked decisions, file plan, API contracts, acceptance criteria.

---

**End of Phase 0 Discovery. CR-025 PARKED. Awaiting Q1-Q10 before planning.**
