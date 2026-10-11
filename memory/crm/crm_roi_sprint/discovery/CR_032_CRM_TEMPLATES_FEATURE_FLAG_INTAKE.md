# CR-032 — CRM Template Builder Feature Flag (per-restaurant self-service toggle)

> **Type**: Intake doc (Role: INTAKE)
> **Date opened**: 2026-07-01
> **Owner requester**: Abhishek
> **Status**: 🔵 Intake complete — awaiting planning approval
> **Supersedes approach of**: CR-031 (tabs) — now deferred to next sprint
> **Related investigation**: INV-002 (surfaced the underlying UI bugs)
> **Effort estimate**: ~2 hours (from planning conversation)
> **Risk**: LOW
> **Priority**: P1 (unblocks CR-031 deferral + removes visual noise for 79% of tenants)

---

## 1 · Title

**Add a per-restaurant self-service feature flag to hide the CRM WhatsApp Template Builder for tenants that don't use it.**

---

## 2 · One-line summary

Introduce a `features.crm_templates_enabled` boolean on each user (tenant) document, default `false`, toggleable via a switch on the Settings page. When off, the CRM Templates section, "Add Template" button, "Set Labels" button, and `/template-builder` route are all hidden — the TemplatesPage effectively reverts to AuthKey-only view (as it was before the CRM Template Builder was introduced).

---

## 3 · Problem statement

**Reported by**: Owner (see chat transcript 2026-07-01)

- 22 of 28 tenants (79%) have zero CRM templates → for them the CRM Templates section is dead weight
- The remaining 6 tenants (21%) hit the 5-bug filter mess documented in INV-002
- Tab restructure (CR-031) fixes the mess but is a UX-heavy change that must be designed carefully
- Owner wants to **remove noise from the 79% first**, then tackle the tabs work with less pressure

---

## 4 · Duplicate check

Grepped `CR_STATUS_DASHBOARD.md`, `DECISIONS_LOG.md`, `BUG_REGISTRY_CAMPAIGNS.md` for:
- `feature flag`, `feature_flag`, `crm_templates_enabled`, `CRM Template Builder toggle`

Only unrelated match found in DECISIONS_LOG.md line 579 (referring to config env vars from CR-027). **No duplicate CR/BUG exists.**

---

## 5 · Severity & Risk classification

| Field | Value | Reasoning |
|---|---|---|
| Severity | LOW | Not a bug — feature addition. No customer money impact. No live data mutation. |
| Risk | LOW | Zero hotspot files (§PART C). Schema-less field on `users` collection. Rollback = set flag `true` for all → behaves as today. |
| Blast radius | 1 backend endpoint, 1 optional guard, 1 context tweak, 2 frontend pages | All isolated · no shared modules |
| Regression scope | Manual smoke of 6 scenarios (S1-S6 in planning doc) | No hotspot regression required |
| Money-critical path affected? | NO | Send pipeline (`/pos/send`, `/pos/webhook`, campaign scheduler, loyalty, coupons) unchanged |

---

## 6 · Blast radius — files that WILL change

| Layer | File | Change |
|---|---|---|
| Backend | `routers/auth.py` | Return `features` sub-object on `/api/auth/me` |
| Backend | `routers/settings.py` (new or existing) | `PATCH /api/settings/features` endpoint |
| Backend | `routers/whatsapp.py` (optional) | 403 guard on `POST /custom-templates` if flag off |
| Backend | `users` collection | New field `features.crm_templates_enabled: bool` |
| Frontend | `contexts/AuthContext.jsx` | Add `features` to context |
| Frontend | `pages/SettingsPage.jsx` | New "Beta Features" card with `<Switch>` |
| Frontend | `pages/TemplatesPage.jsx` | Wrap CRM section + Add button in `if (crm_templates_enabled)` |
| Frontend | Route config | Guard `/template-builder` route |

---

## 7 · Files that WILL NOT be touched

- Any file in §PART C hotspot list (`core/coupon.py`, `routers/pos.py`, `core/whatsapp.py`, `core/loyalty.py`, `models/schemas.py`, `core/campaign_jobs.py`, `services/invoice_generator.py`)
- Any DB collection other than `users` (`custom_templates`, `whatsapp_template_variable_map`, `webhook_logs` all untouched)
- Backend send pipeline — Freshmarketer webhook, DirectSend, campaign broadcasts, event triggers ALL keep working for any tenant with existing custom_templates regardless of flag state

---

## 8 · Owner decisions locked (from planning chat 2026-07-01)

| # | Decision | Locked value |
|---|---|---|
| D1 | Toggle owner | Any restaurant owner can toggle it themselves (self-service) — option (a) |
| D2 | Default value for new tenants | `false` (opt-in) |
| D3 | Backfill for existing 6 tenants with `custom_templates` | Auto-enable all 6 during rollout so nothing breaks for them |
| D4 | CR-031 (tabs) | Deferred — parked in dashboard, revisit next sprint or when N tenants have flag on |

---

## 9 · Owner decisions still open (blocking Planning role)

| # | Question | Options | Blocking? |
|---|---|---|---|
| Q1 | Add the defensive 403 guard on `POST /api/whatsapp/custom-templates` when flag off? | (a) Yes — API stays consistent with UI · (b) No — UI-only gating is enough | Optional |
| Q2 | Also gate `AudiencesPage` / `CampaignsPage` template-picker to hide CRM templates when flag off? | (a) Yes · (b) No — only TemplatesPage matters | Optional |
| Q3 | Audit log flag-flip events? | (a) Yes, log to new `feature_flag_audit` collection · (b) No | Optional |
| Q4 | Settings card copy — what should the toggle label + help text say? | Owner to draft OR agent proposes and owner confirms in Planning | Recommended before code |

Recommended defaults (unblock immediately): Q1=a, Q2=b, Q3=b, Q4=agent-proposes-in-plan.

---

## 10 · Acceptance criteria (candidate — refined in Planning)

- AC1: New tenant logs in fresh → TemplatesPage shows AuthKey templates only, no "Add Template" button, no CRM section header
- AC2: `/template-builder` route is inaccessible (redirect or 404) when flag off
- AC3: Settings page has a "Beta Features" card with a switch labelled "Enable CRM Template Builder" (or similar — pending Q4)
- AC4: Toggling the switch persists via `PATCH /api/settings/features` and re-renders the page (no full reload required)
- AC5: The 6 existing tenants (post-backfill) see current behaviour unchanged
- AC6: Freshmarketer webhook + DirectSend continue to work regardless of flag state (backend send path is NOT gated)
- AC7: Flag is tenant-isolated — Tenant A toggling their flag does not affect Tenant B
- AC8: (If Q1=a) POST `/api/whatsapp/custom-templates` returns 403 when flag is off

---

## 11 · Assumptions

- `/api/auth/me` (or equivalent user-profile endpoint) exists and is already called on login (needs verification in Planning — takes ~2 min)
- `SettingsPage.jsx` exists and has room for one more card (verified — exists per CR-028)
- shadcn `Switch` component is already installed (verified — used elsewhere in the codebase)
- `users` collection uses the same `id` field as the JWT `user_id` claim (verified in prior CRs)

---

## 12 · Intake output (Role 6 spec)

```text
Intake complete: CR-032
Title: CRM Template Builder feature flag (self-service)
Severity: LOW
Risk: LOW
Duplicate check: none
Blast radius: 4 backend files (2 modified, 1 optional, 1 new) + 4 frontend files
Money-critical: NO
Hotspot files touched: 0
Effort: ~2 hours
Blocking Qs (open): Q1-Q4 (all optional — recommended defaults documented)
Next: PLANNING role → produce full implementation plan with regression matrix.
      Or, if owner accepts recommended defaults verbatim, skip to IMPLEMENTATION.
Dashboard row: appended (see CR_STATUS_DASHBOARD.md)
Decisions logged: 4 rows appended (see DECISIONS_LOG.md)
CR-031 disposition: marked DEFERRED — tabs work parked until CR-032 ships +
                    tenant adoption warrants revisiting.
```

---

*End of CR-032 intake.*
