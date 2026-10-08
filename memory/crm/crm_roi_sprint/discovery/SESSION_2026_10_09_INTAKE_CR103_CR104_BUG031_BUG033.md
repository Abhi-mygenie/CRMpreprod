# Intake — POS ↔ Customer App loyalty-rules contract validation gaps (CR-103 · CR-104 · BUG-031 · BUG-032 · BUG-033 · CR-094 amendments Q4–Q6)
**Date**: 2026-10-09 · **Role**: Intake Agent (Role 1) · **Source**: owner ask "validate CR-094 against the POS contract — anything missing / mismatched" → read-only comparison of `handoff/CR_079_CR_081_CR_080_POS_API_CONTRACT_v1_FINAL.md` §3.1 + `routers/pos_loyalty.py:44-74` vs `planning/CR_094_IMPLEMENTATION_PLAN.md` + live `loyalty_settings` (41 docs) · **No code changed.**

| ID | Class | Severity | Risk | Dup check | Evidence | Blast | Status |
|---|---|---|---|---|---|---|---|
| **CR-103** | CR — POS API contract parity (additive) | P2 | MEDIUM (POS consumer contract; `pos_loyalty.py`, not `pos.py` §14) | DISTINCT (CR-080 L-1 shipped 15 fields; no parity item exists) | captured | SMALL | 📋 REGISTERED |
| **CR-104** | CR — loyalty feature gap (feedback bonus never awarded) | P3 | HIGH (awards points = §14 loyalty; `core/loyalty.py`-adjacent) | DISTINCT (CR-094 Q2 / CR-096 Q4 only reference "an award CR" — none registered) | captured | MEDIUM | 📋 REGISTERED — owner confirm/cancel |
| **BUG-031** | PLAN_GAP — CR-094 plan silent on `null` semantics | P2 | LOW | DISTINCT | captured (40/41 docs null) | SMALL | 📋 REGISTERED → CR-094 amendment Q4 |
| **BUG-032** | PLAN_GAP — CR-094 test R6 targets r69 → 404 | P3 | LOW (tests only) | RELATED BUG-030 (cause) | captured | SMALL | 📋 REGISTERED → CR-094 amendment Q5 |
| **BUG-033** | DOC — POS contract v1 §3.1 incomplete | P3 | LOW (docs only) | DISTINCT | captured | SMALL | 📋 REGISTERED |
| **CR-094 Q6** | scope question (not an ID) | — | — | — | — | — | owner decision pending |

## 0. What was compared
| | POS `GET /pos/loyalty/settings` (CR-080 L-1, live, signed) | CR-094 `GET /scan/loyalty-rules/{rid}` (plan approved) |
|---|---|---|
| Consumer / auth | POS till · `X-API-Key` | Customer App · public |
| Tenant resolution | API key → `user.id` | URL rid → `_normalize_restaurant_id` |
| Envelope | `{success,message,data}` | same (`_resp`) ✅ |
| Missing-doc fallback | `default_loyalty_settings()` | same ✅ |
| Fields | 15 | 29 = same 15 (identical names/types/defaults ✅) + 14 |

14 CR-094-only fields: `bronze/silver/gold/platinum_redemption_value`, `max_redemption_percent`, `max_redemption_amount`, `min_order_value`, `first_visit_bonus_enabled/points`, `feedback_bonus_enabled/points`, `off_peak_bonus_type`, `off_peak_bonus_value`, `points_expiry_months`.

Consistent, no action: four-tier `*_earn_percent` names (CA-6 = POS) · schema-sourced defaults · envelope · earn maths description · `user_id` isolation.

## 1. CR-103 — POS L-1 parity: add the 14 CR-094 fields to `GET /pos/loyalty/settings`
**Where**: `routers/pos_loyalty.py:57-73` (15-key dict); contract `handoff/CR_079_CR_081_CR_080_POS_API_CONTRACT_v1_FINAL.md` §3.1.
**Gap**: CRM redemption maths (`core/helpers.get_redemption_value_for_tier`) resolves **per-tier value → restaurant `redemption_value` → 0.25**. POS receives only `redemption_value`. r689 has per-tier ₹1/2/3/4 → till shows "1 pt = ₹1", Customer App (after CR-094) shows ₹2 for Silver → **two screens, two truths**. Till also lacks `min_order_value`, `max_redemption_*`, `off_peak_bonus_type/value`, `points_expiry_months`.
**Live impact today**: nil — 1/41 tenants sets per-tier values; POS gets redeemable amounts server-side from `/pos/max-redeemable`. Contract hole, cheap to close.
**Fix sketch** (Planning): extend the dict to the same 29-key whitelist CR-094 ships (one shared constant, or copy) — additive, backward-compatible; contract §3.1 v1.1 + change-log row for the POS agent. ~20 min + POS smoke.
**Owner Q-A**: ship with CR-094 (same whitelist constant, one QA pass) or queue after batch?

## 2. CR-104 — Feedback bonus is configured but never awarded
**Where**: `loyalty_settings.feedback_bonus_enabled/points` exist (`schemas.py`, defaults True/25; r689 True/50) and are shown in Loyalty Settings UI; **no write path awards them** — `grep feedback_bonus routers core` → schema only. First-visit (`pos.py:705`, `customers.py:865`), birthday/anniversary (`loyalty_jobs.py`) and off-peak are all awarded.
**Why now**: CR-094 Q2 (owner yes) exposes `feedback_bonus_*` publicly with the caveat "hide copy until an award CR exists"; CR-096 Q4 (owner **no**) keeps award out of 096. The referenced "award CR" was never registered → dangling promise to the Customer App.
**Fix sketch** (Planning, if confirmed): on linked feedback (CR-096 case A/B: `customer_id` set) and `loyalty_enabled && feedback_bonus_enabled` → award `feedback_bonus_points` once per (customer, order_id|feedback) via existing points-award helper; `points_transactions` type `bonus`, description "Feedback bonus". Guard: one award per order. §14 loyalty → owner approval + regression.
**Owner Q-B**: (a) confirm as P3 backlog after 096 · (b) cancel (then CR-094 should **drop** the two `feedback_bonus_*` fields rather than publish a bonus that never pays — reverses Q2) · (c) defer decision to 096 closure.

## 3. BUG-031 — CR-094 plan does not define `null` handling (PLAN_GAP)
**Where**: `planning/CR_094_IMPLEMENTATION_PLAN.md` E1 `{k: settings.get(k, defaults.get(k))}`.
**Data**: `*_redemption_value` are `Optional[float]=None` → **null in 40/41 docs**, key absent in 11 old docs (→ default None). `max_redemption_amount` null in 38/41 (null = **no cap**, semantic).
**Effect as planned**: Customer App gets `"silver_redemption_value": null` for nearly every tenant and must re-implement the CRM fallback chain → parity risk, the exact thing CR-094 exists to avoid.
**Options** → **CR-094 amendment Q4**: (a) ship raw nulls + document rule "null → `redemption_value` → 0.25"; **(b) resolve server-side** with the existing read-only helper `get_redemption_value_for_tier(tier, settings)` so the app always receives the effective ₹/point per tier (recommended — one truth, `core/loyalty.py` untouched). `max_redemption_amount` stays null (documented "no cap") either way.

## 4. BUG-032 — CR-094 plan test R6 cannot pass as written (PLAN_GAP, caused by BUG-030)
**Where**: plan §1 E2 "R6 parity … for r69 (owner API key)".
**Fact**: The Goan Kitchen user id is `pos_owner_69_bdd4513c`; `_normalize_restaurant_id("69")` → `pos_0001_restaurant_69` → no `users` doc → **404** (= BUG-030). r69 also `loyalty_enabled:false` (ENV-001) and has no per-tier values → nothing to compare.
**Fix** → **CR-094 amendment Q5**: R6 (and V10 smoke) move to **r689 / Kunafa Mahal** (`pos_0001_restaurant_689`, has `api_key`, loyalty on, per-tier ₹1/2/3/4 set — best parity fixture). BUG-030 stays its own item (owner a/b).
**Owner note**: until BUG-030 is decided the Customer App gets 404 on loyalty-rules for the owner's primary smoke tenant too.

## 5. BUG-033 — POS contract v1 §3.1 documentation gaps (DOC)
**Where**: `handoff/CR_079_CR_081_CR_080_POS_API_CONTRACT_v1_FINAL.md` §3.1 + "String Constants" table.
**Gaps**: Field Reference describes **10 of 15** fields (missing `silver/gold/platinum_earn_percent`, `off_peak_start_time`, `off_peak_end_time`) · `off_peak_bonus_type` ∈ `"multiplier" | "flat"` (both live) not in String Constants · `off_peak_*_time` = restaurant-local `HH:MM` (Asia/Kolkata) unstated · `points_expiry_months: 0` = never expires (`loyalty_jobs.py:242`) unstated · `loyalty_enabled:false` rule stated for POS but must be mirrored for Customer App.
**Fix**: docs-only; fold into CR-103 contract v1.1 (POS side) and CR-094 consumer note (Customer App side: constants, tz, `0`=never, `null`=no cap, "when `loyalty_enabled:false` show nothing"). No separate planning.

## 6. CR-094 amendment Q6 — birthday / anniversary bonus fields (scope question)
CR-094 ships first-visit (awarded) and feedback (not awarded, see CR-104) bonus fields but omits `birthday_bonus_enabled/points`, `anniversary_bonus_enabled/points`, which **are** awarded (`core/loyalty_jobs.py:32,139`). If the Customer App collects DOB/anniversary these are the honest ones to preview. **Q6**: add the 4 fields (29 → 33; also to CR-103)? Recommendation: yes if Customer App profile has DOB; otherwise no.

## 7. Gate consequence for CR-094
Approved plan is **under amendment** (Q4 null handling · Q5 R6 fixture · Q6 scope). Per R4 scope-lock the implementation gate is **paused** until owner answers Q4–Q6 and the plan + `DECISIONS_LOG.md` are updated (Planning role, docs only). Q-A/Q-B (CR-103/104) do not block CR-094 except Q-B(b).

```
Intake complete: CR-103 · CR-104 · BUG-031 · BUG-032 · BUG-033 (+ CR-094 amendment Q4–Q6)
Classification: CR ×2 · BUG ×3 (PLAN_GAP ×2, DOC ×1) · scope question ×1
Severity: P2 (103, 031) · P3 (104, 032, 033)
Risk: MEDIUM (103) · HIGH (104, §14 loyalty) · LOW (031/032/033)
Duplicate check: DISTINCT ×4 · RELATED ×1 (032 ← BUG-030)
Evidence: captured (pos_loyalty.py:44-74; contract §3.1; schemas.py:998-1073; helpers.py:32-48; loyalty_settings probe 41 docs: per-tier null 40, key absent 11, max_amount null 38; users r69 = pos_owner_69_bdd4513c)
Blast radius: SMALL (103/031/032/033) · MEDIUM (104)
Docs updated: this file · BUG_REGISTRY_CAMPAIGNS.md (031–033) · 00_register/ROI_MEASUREMENT_CR_REGISTER.md (rows 56–60) · CR_STATUS_DASHBOARD.md (rows 103/104/BUG-031–033 + 094 note + transition) · planning/CR_094_IMPLEMENTATION_PLAN.md (amendment banner) · PRD.md
Owner decisions: CR-094 Q4 (a/b) · Q5 (r689 yes/no) · Q6 (birthday/anniversary yes/no) · CR-103 Q-A (with 094 / after batch) · CR-104 Q-B (a/b/c)
Next: owner answers → "choose planning role: amend CR-094 plan (+ CR-103 IA if Q-A = with 094)" → then implementation gate
```
