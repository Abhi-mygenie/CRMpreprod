# Session Handover — 2026-10-10 · Wave A **Impact Analysis complete** (4 groups) · next: owner answers 11 Qs → Intake BUG-038 → Implementation Plans
**For the next agent.** Read in this order: (1) `memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`, (2) this file, (3) `planning/WAVE_A_SEQUENCE_AND_CONFLICTS_2026_10_10.md` (grouping, file map, consolidated owner Qs), (4) the four IAs: `planning/CR_111_IMPACT_ANALYSIS.md` · `planning/CR_113_CR_114_IMPACT_ANALYSIS.md` · `planning/CR_115_IMPACT_ANALYSIS.md` · `planning/CR_110_AMEND_BUG_035_IMPACT_ANALYSIS.md`, (5) previous handover `SESSION_2026_10_10_HANDOVER_DQ1_BATCH_INTAKE.md`.
**Language**: English. **No code changed. No data written.** Backend `.env` is on **preprod** (`52.66.232.149/mygenie`); prod read-only URL kept commented for CR-116.

## 1. Owner rulings this session
Q10 → 4 groups · Q1 → 100 % / 7-day prod POS request log · Q2 → CR-114 is a **manual script**, no cron, no API · Q3 → CR-115(d) re-link in scope, link-only · env → preprod. Logged in `DECISIONS_LOG.md` (2026-10-10 Wave A Planning entry).

## 2. Key findings (code is truth)
1. **CR-115(c) already exists** — `migration.py:828-833` blocks order sync until `last_customer_sync_at`; UI toasts the message. Recommend no change; docs G-4 stale.
2. **`Customer` schema (`schemas.py:447`, `extra="ignore"`) strips `phone_invalid`** → CR-113(d) needs +2 optional fields.
3. **BUG-038 candidate** — `customers.py:470/473` reference `phone_match` (function) instead of `phone_match_doc`: F11 dedup hit → AttributeError → record counted as *failed*, existing customer not updated; `duplicates_merged` in `/migration/status` is mislabeled. Needs Intake; recommend fold fix into CR-113(b).
4. CR-110 script: shared password hard-coded default; selects all 89 tenants (BUG-035 confirmed); **`crm_token` validity as a sync Bearer unverified** (110-Q1) — prod run blocked until proven on preprod.
5. CR-115(b): per-page progress already persisted (`current_page`) → resume = new entry point only; POS pagination drift risk documented.
6. CR-113(e): all 8 `POS_REQUEST_LOGGING_*` keys are read without defaults → prod `.env` must have all of them or backend fails at import.

## 3. Open owner questions (11) — see `WAVE_A_SEQUENCE_AND_CONFLICTS_2026_10_10.md` §5
111-Q1 · 113-Q1..Q4 · 115-Q1..Q4 · 110-Q1..Q2. Recommendations given per row.

## 4. Next steps
1. Owner answers §3 (or accepts recommendations) → say **"register BUG-038"** (Intake, 5 min) → **"choose planning role for implementation planning of Group 1 / Group 2"**.
2. Implementation order: G1 ∥ G2 → G3-A → G3-B → G4. CR-113 **before** CR-115 (shared loops, `link_status` vocabulary).
3. Do **not** run `scripts/push_and_refresh_tokens.py` on prod. Do **not** touch POS APIs (CR-103 parked).

## 5. Files touched (docs only)
`planning/CR_111_IMPACT_ANALYSIS.md` · `planning/CR_113_CR_114_IMPACT_ANALYSIS.md` · `planning/CR_115_IMPACT_ANALYSIS.md` · `planning/CR_110_AMEND_BUG_035_IMPACT_ANALYSIS.md` · `planning/WAVE_A_SEQUENCE_AND_CONFLICTS_2026_10_10.md` · `CR_STATUS_DASHBOARD.md` (DQ-1 rows 111/113/114/115/BUG-035 → 🟡, transition row) · `DECISIONS_LOG.md` · `PRD.md` · `backend/.env` (preprod restored) · this file.

## 6. Addendum — Intake after IA (same day)
Registered **BUG-038 / BUG-039 / BUG-040 / CR-118** (`discovery/SESSION_2026_10_10_INTAKE_BUG038_BUG040_CR118.md`). Owner rulings on IA Qs logged in `DECISIONS_LOG.md`. **Still open: CR-115(d) match rule** (a id-only · b id+phone · c drop (d), rely on full re-sync). CR-115(c) now **changes to 409** (scope update in `CR_115_IMPACT_ANALYSIS.md` §1.3/§2.3 superseded by owner ruling). POS brief must include **P-16** (provisioning hook / restaurant list) and **P-17** (no placeholder customer ids). Owner action outside CRM: rotate the shared POS password (BUG-040).

## 7. Sept-2026 prod probe (owner Q)
~83 % of September bills (both paths) have no customer id and no phone — walk-ins; 0 placeholder ids; realtime orders do not persist `pos_customer_id` → proposed CR-113(a) scope add (owner approval pending). Details: intake doc §6.

## 8. Final state — all Wave A owner questions CLOSED (2026-10-10)
CR-115(d) = pid-only re-link (exclude placeholder ids) · CR-113(a) + realtime `pos_customer_id` key approved · CR-115(c) 409 · resume both · snapshot→file · 110 preprod proof. IAs, sequence doc, dashboard, decisions log updated. **Next agent: open Implementation Plan for Group 1 and Group 2 when owner says "choose planning role for implementation planning of Group 1 / Group 2".** No code written this session.
