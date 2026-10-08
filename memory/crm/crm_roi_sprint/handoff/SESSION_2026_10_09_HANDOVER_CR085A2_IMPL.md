# Session handover — 2026-10-09 — CR-085-A2 implemented (guest order + lookup hides flagged); self-test 68/68

| Item | State | Next |
|---|---|---|
| **CR-085-A2** | 🟢 IMPLEMENTED, self-test 68/68 | **QA** (`qa/CR_085A2_QA_HANDOVER.md`) → POS validation note → owner smoke → closes **CR-085-A** together |
| CR-098 / 093 / 089 / 085-A | code + QA done | awaiting Scan & Order (and POS) validation evidence |
| CR-085-B | deferred, **report-first**, last in batch | nothing until all other CRs closed |
| CR-096 / 094 / 086 / 087 / 095 / 088 / 082 | queued | owner opens next gate |

## Owner rulings this session (all in `DECISIONS_LOG.md`)
1. Invalid-phone bills → **guest order** (G), `pos_customer_id` still wins.
2. POS `customer-lookup` hides `phone_invalid` records (shipped with A2).
3. 085-B = per-restaurant correction report → review → cleanup; last CR of batch.
4. Coupon on guest bill → **c1** usage recorded `customer_id:null`; per-user/specific-users skipped; CR-082 `requires_customer` stays queued.
5. Defaults stood: (a) wallet on guest accepted/not debited, (b) invoice yes / WhatsApp no.

## Code
`routers/pos.py` only (18 `# CR-085-A2` markers; E1–E5) + `tests/test_cr085a_normalization.py` (A9 rewritten, A7b/A11/A11b/A11c/A12 new, cleanup extended). No other file. No stored data changed.

## Facts for next agent
- Baseline customers **7700**. Limiter: clear `scan_lookup_attempts` between back-to-back suite runs (shared `so-ph:` buckets → 429).
- Legacy `Customer ` doc `phone:""` (id `388c4f46-…`, 34 visits, r69 POS tenant) is live G3 evidence → 085-B report.
- Wave change-log POS row for 085-A must be updated to "guest order LIVE on preview + lookup hides flagged" and a second POS note sent (done this session if dashboard says so).
