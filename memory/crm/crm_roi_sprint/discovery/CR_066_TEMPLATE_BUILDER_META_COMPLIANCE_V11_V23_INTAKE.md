# CR-066 Intake: Template Builder Meta Compliance Validation — V11-V23

**Date**: 2026-07-16
**Source**: INV-009 (Template Builder Validation Gap Audit)
**Classification**: CR (Change Request) — additive validation, no existing behaviour altered
**Severity**: P1 — Templates pass CRM validation but fail silently at send-time; campaign sends wasted
**Risk**: HIGH — touches Template Builder validation layer (FE `TemplateBuilderPage.jsx` + BE `routers/whatsapp.py`), but purely additive (no send-path, no trigger-path, no hotspot file logic changed)

---

## 1. Problem Statement

CR-023 Phase 2 shipped V1–V10 Meta compliance validations for the Template Builder. CR-062 shipped a WhatsApp formatting toolbar (bold/italic/strikethrough/monospace). Neither included validation for WhatsApp formatting markers or several other Meta template rules.

**Result**: Templates with orphan `_`, unmatched `*`, excess emojis, variables at body start/end, etc. pass all CRM checks, get approved by Meta, and then **fail at send-time** — silently wasting campaign sends with "error in message" from AuthKey. The user has no way to know what's wrong.

**Confirmed failure**: `daily_premiumlunchmenu_2026` (wid=41117) — orphan `_` after `inquire!!!!` caused persistent send failure. INV-009 §1.

---

## 2. Duplicate Check

| Existing CR | Overlap | Verdict |
|---|---|---|
| CR-023 Phase 2 | Shipped V1-V10. This CR adds V11-V23 | **DISTINCT** — new scope |
| CR-062 | Shipped formatting toolbar. This CR adds validation for those markers | **DISTINCT** — complementary |
| CR-032 | Feature-flags CRM template authoring. Orthogonal | **NO OVERLAP** |
| CR-061 | Per-tenant allowlist gating. Orthogonal | **NO OVERLAP** |

---

## 3. Code Reality

**Existing**: `validateMetaCompliance()` in `TemplateBuilderPage.jsx` (lines 21-99) with V1-V10. Backend safety-net V1-V4 in `routers/whatsapp.py` (lines 747-791). Real-time inline warnings via `getBodyWarnings()`, `getHeaderWarnings()`, `getFooterWarnings()`.

**Missing**: All 20 gaps documented in INV-009 §Full Validation Gap Audit. Zero code exists for any of V11-V23.

---

## 4. Scope — 3 Tiers

### HARD BLOCK — prevent submission (10 checks, 0/10 approved templates violate):

| ID | Validation | Rule |
|---|---|---|
| **V11** | Unmatched formatting markers (`*`, `_`, `~`, ` ``` `) | After excluding bullet-point `* ` at line-start, remaining `*` count must be even. `_`, `~` count must be even. ` ``` ` count must be even. |
| **V12** | Variable at start/end of body | `body.trim()` cannot start with `{{` or end with `}}` |
| **V13** | Adjacent variables without text | `}}` immediately followed by `{{` (with only whitespace) is blocked |
| **V14** | Formatting wrapping variables | Patterns like `*{{1}}*`, `_{{2}}_` blocked |
| **V15** | Body hard limit enforcement | Body > 1024 chars → block |
| **V16** | Emoji count > 10 | Meta hard limit |
| **V17** | > 2 consecutive newlines | Meta whitespace rule |
| **V18** | > 4 consecutive spaces or tabs | Meta whitespace rule |
| **V20** | Formatting in header/footer text | `*`, `_`, `~` not allowed in header text or footer |
| **V23** | URL shorteners in body | bit.ly, tinyurl etc. → block |

### SOFT WARNING — yellow toast, non-blocking (3 checks, 6/10 approved templates violate):

> **BUG-015 (2026-07-16)**: Originally hard blocks per Q2. Owner smoke revealed false positives. Q2 revised.

| ID | Validation | Rule | Evidence |
|---|---|---|---|
| **V19** | Body > 550 chars (Marketing/Utility) | Advisory only | 6/10 approved templates exceed 550 chars (up to 711) |
| **V21** | Category-content mismatch | Heuristic: Utility + promo keywords | 6/10 approved Utility templates contain promo words |
| **V22** | ALL CAPS blocks | > 20 consecutive uppercase chars | 6/10 approved templates have ALL CAPS (up to 185 chars) |

---

## 5. Blast Radius

| Area | Impact |
|---|---|
| `TemplateBuilderPage.jsx` | `validateMetaCompliance()` extended with V11-V23. `getBodyWarnings()` extended for real-time inline warnings. Preview renderer updated to highlight orphan markers in red. |
| `routers/whatsapp.py` | `create_meta_template()` backend safety-net extended with all P0 checks (V11-V15) |
| Existing templates | **ZERO impact** — validation is on submission only, not retroactive |
| Send path | **ZERO impact** — `core/whatsapp.py`, `core/campaign_jobs.py` untouched |
| Other pages | **ZERO impact** — TemplatesPage, CampaignWizardPage, SettingsPage untouched |

**Hotspot files**: `routers/whatsapp.py` (1550 LOC, HIGH-risk per addendum §7) — but change is additive validation in `create_meta_template()` only, not in send/webhook/callback paths. Risk mitigated by scope containment.

---

## 6. Evidence

- INV-009: `/app/memory/crm/crm_roi_sprint/investigations/INV_009_TEMPLATE_BUILDER_VALIDATION_GAP_AUDIT.md`
- INV-008: `/app/memory/crm/crm_roi_sprint/investigations/INV_008_TEMPLATE_NEWLINE_ENCODING_INVESTIGATION.md`
- Failed template: `daily_premiumlunchmenu_2026` (wid=41117) — orphan `_`, 13 unbalanced `*`, Utility category mismatch
- Clean template: `special_dinner_menu_latest` (wid=40609) — passes all G1-G20, 0 blockers
- Meta rules source: Web research (Meta April 2026 update, Infobip compliance guide, AuthKey/Wati documentation)

---

## 7. Effort Estimate

| Tier | FE | BE | Total |
|---|---|---|---|
| P0 (V11-V15) | ~2 hrs | ~1 hr | ~3 hrs |
| P1 (V16-V20) | ~1.5 hrs | ~0.5 hr | ~2 hrs |
| P2 (V21-V23) | ~1 hr | — | ~1 hr |
| Preview error highlighting | ~1 hr | — | ~1 hr |
| **Total** | **~5.5 hrs** | **~1.5 hrs** | **~7 hrs** |

**Recommended phasing**: Ship P0 first (blocks failures), P1 in same session if time permits, P2 backlog.

---

## 8. Owner Decisions — ALL LOCKED (2026-07-16)

| # | Question | Decision | Locked |
|---|---|---|---|
| Q1 | Ship P0+P1 together or P0 only first? | **(a) All together — P0+P1+P2 in one session** | ✅ 2026-07-16 |
| Q2 | Should P0 checks be HARD BLOCK or WARNING? | **(a) Hard block — prevent submission** | ✅ 2026-07-16 |
| Q3 | Retroactively flag existing drafts? | **(a) No — only on new submissions** | ✅ 2026-07-16 |
| Q4 | Hotspot approval for `routers/whatsapp.py`? | **(a) Approved** — additive validation in `create_meta_template` only | ✅ 2026-07-16 |

---

## Intake Output

```
Intake complete: CR-066
Classification: CR (Change Request)
Severity: P1
Risk: HIGH (hotspot file, but additive-only)
Duplicate check: DISTINCT (extends CR-023 Phase 2 V1-V10 with V11-V23)
Evidence: INV-009 full audit + failed template + Meta API rules research
Blast radius: SMALL (2 files: TemplateBuilderPage.jsx + routers/whatsapp.py validation section)
Docs updated: CR_STATUS_DASHBOARD.md, this intake doc
Next: Owner answers Q1-Q4 → Planning
```
