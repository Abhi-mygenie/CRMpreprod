# Session handover — 2026-10-09 — CR-089 + CR-085-A implemented & QA PASS; 085-A2 owner decision open
**Roles**: Planning (089 IA+plan, 085 IA, 085-A plan) → Implementation (089, 085-A) → QA via testing agent.

## State
| CR | Status | Closure needs |
|---|---|---|
| 084 / 097 | 🔒 CLOSED | release batch |
| 090 | ⚫ OBSOLETE | — |
| 098 | 🟢 QA PASS | Scan & Order evidence + owner smoke (note: `handoff/CRM_TO_SCAN_ORDER_CR098_…`) |
| 093 | 🟢 QA PASS | same (`…CR093_LOOKUP_LIVE…`) |
| 089 | 🟢 QA PASS (limiter 14/14) | same (`…CR089_SKIP_OTP_RATE_LIMIT…`) |
| **085-A** | 🟢 QA PASS 16/17 + 13/13 | **owner decision 085-A2** → validation notes to **Scan & Order AND POS** → smoke |
| 085-B / 087 | deferred | after whole batch (owner rule) |
| 094, 096, 086, 095, 088 | 📋 | per `planning/PLANNING_GATE_SEQUENCE_2026_10_08.md` §E |

## 085-A2 — the two open owner decisions (do NOT implement without ruling)
1. **Invalid-phone bills (W1 realtime, W2 webhook)**: implemented **F** (flag `phone_invalid`, bill still credits that flagged customer) instead of planned **G** (guest order, `customer_id:null`). G requires making `customer` optional across ~200 lines of the realtime order/loyalty path (§14). Options: (a) accept F, close 085-A; (b) open 085-A2 plan for G.
2. **POS `customer-lookup` (W5)** still returns `phone_invalid` records as `registered:true`. Hide them (mirror scan lookup) or keep for POS staff?

## Facts to carry
- Baseline `customers` = **7700** (QA removed 37 orphan `TEST_*` records 2026-10-09). Tests no longer hardcode baseline.
- Rate limiters trip if suites run back-to-back from one IP → run spaced or clear `scan_lookup_attempts`.
- Owner tenant for POS tests: `pos_owner_69_bdd4513c` (`restaurant_id:"69"`, POS create needs `pos_id`); loyalty webhook = `POST /api/pos/webhook/payment-received`.
- `core/phone.py` is the only phone rule. Malformed `country_code` → invalid.

## Owner rules (carry forward)
Live probe in planning · amend wave change-log at every exit gate · plain-English plan + risks → `OWNER APPROVAL REQUIRED` block · consumer-team validation before closure of `/scan/*` (and now POS-facing) changes · POS shape is correct, gaps are CRM-side · no data operations until batch complete.
