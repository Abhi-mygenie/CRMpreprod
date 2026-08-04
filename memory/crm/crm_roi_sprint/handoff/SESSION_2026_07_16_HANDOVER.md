# Session Handover — 2026-07-16

**Pod URL**: `https://crm-mongo-stack-1.preview.emergentagent.com`  
**Branch**: `main` (pulled from `Abhi-mygenie/CRMpreprod.git`)  
**DB**: Remote MongoDB `52.66.232.149:27017/mygenie`  
**Test credentials**: `owner@jehsnest.com / Qplazm@10` (Jeh's Nest, restaurant_id 635)

---

## What happened this session

1. **Repo bootstrapped** from `main` branch. Backend `.env` configured with all required env vars (JWT_SECRET, MYGENIE_API_URL, AuthKey URLs, campaign scheduler, POS logging, AWS S3, META_APP_ID). Frontend `.env` preserved. All deps installed (`pip install` + `yarn install`). Backend + frontend UP and healthy.

2. **INV-010: "Error in Message request &"** — Investigated template `premium_dinner_menu_1607_mygenie` (WID 41171) failing delivery on AuthKey while AuthKey-native template `premium_dinner_menu_1607_ak` (WID 41174) delivers fine.
   - **Root cause (HIGH confidence)**: Language code `en_US` + marketing category combination. CRM creates templates with `en_US`, AuthKey natively uses `en`. Meta enforces strict language matching for marketing templates. Evidence: utility `en_US` delivers ✅, marketing `en` delivers ✅, marketing `en_US` fails ❌.
   - **Fix applied**: `TemplateBuilderPage.jsx` — default language changed from `en_US` → `en`. Dropdown now offers `en` (default), `en_US`, `hi`.
   - **⚠ PENDING VERIFICATION**: Owner must create a new marketing template with `en` language, submit, sync, and test delivery. If it delivers → confirmed. If not → escalate to AuthKey with WIDs 41174 vs 41171.
   - Doc: `/app/memory/crm/crm_roi_sprint/investigations/INV_010_AUTHKEY_TEMPLATE_DELIVERY_ERROR.md`

3. **INV-011: Template Deletion Gaps** — Investigated missing delete functionality. Found 5 gaps: CRM delete is local-only (no Meta/AuthKey API call), status check misses deleted templates, sync never cleans stale records, no delete UI for AuthKey templates.
   - Doc: `/app/memory/crm/crm_roi_sprint/investigations/INV_011_TEMPLATE_DELETION_GAPS.md`

4. **CR-067 REGISTERED**: WhatsApp Template Deletion + Lifecycle Sync. P2, MEDIUM risk. 3 phases planned. **Q1-Q4 open — owner will answer.**
   - Intake doc: `/app/memory/crm/crm_roi_sprint/discovery/CR_067_TEMPLATE_DELETION_LIFECYCLE_INTAKE.md`
   - CR board updated: `/app/memory/CR_STATUS_DASHBOARD.md`

5. **BUG-015 (V19/V21/V22 soft warnings)**: Identified as still NOT applied in code. V19, V21, V22 still push to `errors[]` (hard block) instead of `warnings[]`. Fix plan exists at `/app/memory/crm/crm_roi_sprint/planning/BUG_015_V19_V21_V22_SOFT_WARNING_FIX.md`. **Not implemented this session.**

---

## Current state of open items

| Item | Status | Next action |
|---|---|---|
| **INV-010** (en_US delivery failure) | Fix applied, PENDING verification | Owner: create marketing template with `en`, test delivery |
| **BUG-015** (V19/V21/V22 soft warnings) | Plan exists, NOT implemented | Bug Fix agent: apply 5 edits from plan doc |
| **CR-067** (Template deletion) | 📋 REGISTERED, Q1-Q4 open | Owner answers Q1-Q4 → Planning → Implementation |
| **CR-066** (V11-V23 compliance) | ✅ Code complete, BUG-015 pending | Apply BUG-015 fix, then owner smoke |

---

## CR-067 Open Questions (owner to answer)

| # | Question | Options |
|---|---|---|
| **Q1** | Should CRM delete cascade to Meta automatically? | (a) Yes — one-click "Delete from Meta + CRM" · (b) Separate actions · (c) Always cascade |
| **Q2** | What happens to campaigns/events using a deleted template? | (a) Block delete if in-use · (b) Allow + mark "template removed" · (c) Force-unmap + delete |
| **Q3** | Should stale templates be auto-cleaned on sync? | (a) Auto-remove · (b) Show "Stale" badge · (c) Auto-clean after 7 days |
| **Q4** | Priority? | (a) Implement now · (b) After BUG-015 + INV-010 · (c) Backlog only |

---

## ENV notes

**Backend `.env` key additions this session**: None (all vars were already present from repo's `.emergent` config).

**Known `.env` issue**: `PUBLIC_BACKEND_URL` points to old deployment `crm-preprod-deploy.preview.emergentagent.com`. AuthKey delivery callbacks go there, not to this pod (`crm-mongo-stack-1`). Fix if callbacks are needed on this deployment.

---

## Files changed this session

| File | Change | Reason |
|---|---|---|
| `frontend/src/pages/TemplateBuilderPage.jsx` | Default language `en_US` → `en`, added `en` option to dropdown | INV-010 fix |
| `memory/crm/crm_roi_sprint/investigations/INV_010_*` | New | Investigation report |
| `memory/crm/crm_roi_sprint/investigations/INV_011_*` | New | Investigation report |
| `memory/crm/crm_roi_sprint/discovery/CR_067_*` | New | CR intake doc |
| `memory/CR_STATUS_DASHBOARD.md` | CR-067 row + transition added | Intake |
| `memory/PRD.md` | Updated | Session log |

---

## DO NOT

- Do NOT run `testing_agent_v3` without owner approval (per addendum §14 — owner re-enabled testing but prefers explicit go)
- Do NOT change coupon/loyalty/POS logic (CRITICAL risk areas per addendum)
- Do NOT send live WhatsApp messages without explicit owner approval
- Do NOT delete or reset `.git` or `.emergent` folders
- Do NOT use `npm` — use `yarn` only
- Do NOT re-introduce demo login (CR-015c)

---

## Recommended pickup order for next agent

1. **BUG-015**: Apply V19/V21/V22 soft warning fix (5 edits, ~15 LOC, `TemplateBuilderPage.jsx` only). Plan: `/app/memory/crm/crm_roi_sprint/planning/BUG_015_V19_V21_V22_SOFT_WARNING_FIX.md`
2. **INV-010 verification**: Owner tests new marketing template with `en` language → confirm or escalate
3. **CR-067**: After owner answers Q1-Q4 → Planning → Implementation
