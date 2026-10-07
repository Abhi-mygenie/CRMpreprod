# CR-CANDIDATE — Template Page Tab Restructure + Filter Bug Fix

> **Type**: Discovery + Implementation Plan (single doc — tab restructure supersedes BUG-only fix)
> **Date**: 2026-07-01
> **Requested by**: Owner
> **Status**: 🔵 Planning drafted — awaits owner decisions Q1-Q6
> **Supersedes**: INV-002 (5-bug patch approach)
> **Effort**: ~1 hour dev + smoke test
> **Risk**: LOW-MEDIUM · single file · no backend · no schema
> **Files WILL change**: `frontend/src/pages/TemplatesPage.jsx` only
> **Files WILL NOT touch**: any backend router, any Pydantic model, any DB collection

---

## 1 · Problem restatement

Today, `TemplatesPage` renders two logically-different template families in one vertical scroll:

- **CRM Templates** (`custom_templates` collection — built via Template Builder, submitted to Meta via AuthKey)
- **AuthKey Templates** (imported live from AuthKey.io — represent the tenant's actual approved Meta templates)

The current UI stacks them: CRM section on top, AuthKey section below. Filters and counters were designed for AuthKey and never adapted for CRM → 5 defects surfaced in INV-002 (BUG-A through BUG-E).

**Owner's refined ask:**
> "Instead of two lists in one scroll, put them in tabs. The same status filter (Approved / Pending / Rejected / Draft) and mapping toggle (Mapped / Not-Mapped) work inside each tab independently. Don't show both together."

This eliminates the root cause of all 5 defects in one architectural change instead of patching them individually.

---

## 2 · Discovery — current state audit

### 2.1 Data sources on this page

| Source | State variable | Loaded from | Row identity | Status field |
|---|---|---|---|---|
| AuthKey live templates | `authkeyTemplates` | `GET /api/whatsapp/authkey-templates` | `tpl.wid` | `temp_status ∈ {1,3,4}` (1=approved, 3=rejected, 4=pending) |
| CRM (custom) templates | `customTemplates` | `GET /api/whatsapp/custom-templates` | `ct.id` (UUID) | `status ∈ {draft, pending, approved, rejected}` |
| Variable mappings | `templateVariableMappings` | `GET /api/whatsapp/template-variable-map` | keyed on `wid` (AuthKey only) | — |
| Sample data | `sampleCustomerData` | `GET /api/customers/sample-data` | — | — |
| In-use flags | `inUseTemplateIds` | `GET /api/whatsapp/templates-in-use` | Set | — |

### 2.2 Interactions that live on this page

| Action | AuthKey row | CRM row |
|---|---|---|
| Preview body (WhatsApp bubble) | ✅ | ✅ |
| Status badge | ✅ (Approved / Pending / Rejected / Unknown) | ✅ (Draft / Pending / Approved / Rejected) |
| Map variables (open normal mapping modal) | ✅ (only if approved) | ❌ (uses labels instead) |
| Set Labels (direct-send) | ❌ | ✅ (all statuses) |
| Submit to Meta | ❌ | ✅ (only if draft) |
| Edit template | ❌ (immutable at AuthKey) | ✅ (draft) / rejected has "Edit & Resubmit" |
| Delete | ✅ | ✅ (unless in use — shows Lock icon) |
| Unmap from all events | ✅ (rejected + in-use) | ❌ |
| Mapped / Not-Mapped badge | ✅ (approved only) | Not surfaced today |

Conclusion: the two families have **completely different action sets**. Tab separation is architecturally natural — they are not just filtered views of the same list.

### 2.3 The 5 defects observed today (already in INV-002)

- BUG-A: dropdown counters use AuthKey only
- BUG-B: "CRM Templates" section header gated on AuthKey list
- BUG-C: Mapped / Not-Mapped counters exclude CRM
- BUG-D: Mapping toggle filter never applies to CRM
- BUG-E: Draft and All dropdown entries have no counts

**All 5 are collapsed away by the tab restructure** — because inside each tab the source is single, so counts, filters, and toggles all operate on one homogeneous list.

---

## 3 · Proposed UI (new layout)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Templates                                    [+ Add Template]        │
│                                                                        │
│  ┌────────────────────┐ ┌────────────────────┐                        │
│  │ CRM Templates (19) │ │ AuthKey Templates (N) │                     │  ← Tabs
│  └────────────────────┘ └────────────────────┘                        │
│                                                                        │
│  ┌──── (active tab content) ────────────────────────────────────────┐ │
│  │  [Status ▼: Approved (8)]  [Mapped(5) | Not Mapped(3)]  [Category▼]│
│  │  ──────────────────────────────────────────────────────────────── │ │
│  │  <cards for whichever tab is active>                               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 Rules per tab

**CRM Templates tab:**
- Status dropdown values: `All`, `Draft`, `Pending`, `Approved`, `Rejected` — counts derived from `customTemplates` filtered by `.status`
- Mapping toggle: shown only when status = Approved. Counts based on CRM "mapped" definition (see Q1 below).
- Category filter: applies here (CRM templates have `category` field)
- `+ Add Template` button: **only visible on this tab** (users cannot create AuthKey templates from the CRM)

**AuthKey Templates tab:**
- Status dropdown values: `All`, `Pending`, `Approved`, `Rejected` — no `Draft` option (AuthKey never has drafts). Counts from `authkeyTemplates.temp_status`.
- Mapping toggle: shown only when status = Approved. Counts based on `whatsapp_template_variable_map` (existing logic).
- Category filter: **hidden** (AuthKey templates don't have a category the user chose — the meta_data.category field is inherited from Meta).
- No `+ Add Template` button (would move to CRM tab only).

### 3.2 Tab counts

Each tab title shows the total for that source:
- `CRM Templates (19)` — `customTemplates.length`
- `AuthKey Templates (N)` — `authkeyTemplates.length`

### 3.3 Empty states per tab

- Empty CRM tab → "No CRM templates yet. Click Add Template to create your first."
- Empty AuthKey tab → "No AuthKey templates. Ensure your AuthKey account is connected."
- Filter yields nothing inside a non-empty tab → same "No templates match current filters" card as today

---

## 4 · Files that WILL change

### 4.1 Only file touched: `frontend/src/pages/TemplatesPage.jsx`

| Change | Rough LOC | Notes |
|---|---|---|
| Add `activeTab` state variable (`"crm" \| "authkey"`) | +2 | Default = `"crm"` (see Q4) |
| Wrap header + filters + list into a Tabs component (`@/components/ui/tabs`) | ~30 | Two `TabsTrigger` + two `TabsContent` |
| Split filter block into two mirror IIFEs (one per tab) | -15 net | Simpler than current combined IIFE |
| CRM tab: compute `draftCustom / pendingCustom / approvedCustom / rejectedCustom` from `customTemplates` | +8 | |
| CRM tab: `mappedCount / notMappedCount` derived from approved CRM using **owner's answer to Q1** | +4 | Blocked by Q1 |
| AuthKey tab: keep existing `approvedAuthkey / pendingAuthkey / rejectedAuthkey` logic verbatim | 0 | No change to current AuthKey behaviour |
| Move `+ Add Template` button to appear only inside CRM tab | move | Line 481 relocation |
| Move `categoryFilter` control to appear only inside CRM tab | move | Line 472 relocation |
| Delete the now-orphaned "CRM Templates" / "AuthKey Templates" section headers (lines 489, 562) | -2 | Tab labels replace them |
| Delete old combined empty-state card (line 565) | -1 | Each tab has its own empty state |

**Estimated total delta:** ~40 LOC added, ~20 removed, net +20. Layout heavy, logic light.

### 4.2 Existing shadcn component reuse

- Use `/app/frontend/src/components/ui/tabs.jsx` (already imported elsewhere in the codebase — `AudiencesPage.jsx`, `CampaignHistoryPage.jsx` etc.)
- Style: match existing app pill/tab treatment (rounded-full active pill, gray inactive) — consistent with the campaigns pages

---

## 5 · Files that WILL NOT be touched

| File | Why exempt |
|---|---|
| `backend/routers/whatsapp.py` | Endpoints unchanged — same shapes returned |
| `backend/routers/pos.py` | Direct-send / webhook logic irrelevant to this page |
| `backend/core/whatsapp.py` | Variable resolution unchanged |
| `backend/models/schemas.py` | No new model, no schema change |
| MongoDB collections | No schema change |
| Any other frontend page | Isolated |

**Confirmed:** this fix does NOT touch any file in the §PART C hotspot list.

---

## 6 · Regression matrix

Because behaviour is layout-only, regression is limited to visual verification of these 20 states:

| # | Tab | Status filter | Map toggle | Expected |
|---|---|---|---|---|
| 1 | CRM | All | — | All CRM templates listed |
| 2 | CRM | Draft | — | Only status=draft |
| 3 | CRM | Pending | — | Only status=pending |
| 4 | CRM | Approved | Mapped | Only status=approved that meet Q1's "mapped" definition |
| 5 | CRM | Approved | Not Mapped | Only status=approved that do NOT meet Q1's definition |
| 6 | CRM | Rejected | — | Only status=rejected |
| 7 | CRM | any | any + Category=marketing | Filtered by category also |
| 8-14 | AuthKey | All / Pending / Approved+Mapped / Approved+NotMapped / Rejected — × current behaviour | should match today's behaviour exactly (regression guard) |
| 15 | Tab switch | preserves selected tab across page reloads? | See Q5 |
| 16 | + Add Template button | only visible on CRM tab | ✅ |
| 17 | Category filter | only visible on CRM tab | ✅ |
| 18 | Empty CRM tab | shows "No CRM templates yet" | ✅ |
| 19 | Empty AuthKey tab | shows AuthKey empty-state copy | ✅ |
| 20 | Live-data smoke | tab counts match `customTemplates.length` / `authkeyTemplates.length` on this tenant | ✅ |

All verified by manual screenshot / click walkthrough. No pytest suite required (frontend-only change).

---

## 7 · Rollback plan

- Single-file change → revert via git checkout of the previous version of `TemplatesPage.jsx`.
- No DB migration, no env var flip, no backend restart needed.
- Emergent platform rollback also available.

---

## 8 · Owner decisions required before coding starts

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | "Mapped" meaning for CRM templates | (a) `variable_labels` set (direct-send) · (b) `whatsapp_template_variable_map` entry exists (event send) · (c) both must be set · (d) either qualifies | (d) — most permissive; matches user's mental model of "this template can be used somewhere" |
| Q2 | Default tab on page load | (a) CRM Templates · (b) AuthKey Templates · (c) remember last used (localStorage) | (a) — matches the fact that most user actions (create, submit, edit, set labels) happen on CRM templates |
| Q3 | Tab-switch behaviour: does the status filter carry over? | (a) reset to "All" on switch · (b) preserve · (c) preserve only if it exists in the other tab | (a) — cleanest; also prevents "Draft" being selected then switching to AuthKey which has no Draft |
| Q4 | Tab labels — pluralisation & count position | (a) `CRM Templates (19)` · (b) `CRM (19)` · (c) `19 · CRM Templates` | (a) — descriptive and consistent with existing app style |
| Q5 | Should we also update the sidebar breadcrumb / page title, or is "Templates" still fine? | (a) Keep "Templates" · (b) Rename to "WhatsApp Templates" | (a) — no change |
| Q6 | Ship as new CR or as a BUG fix? Since it changes UX beyond bug scope, it feels like a CR. | (a) BUG-009 (bundles INV-002 A-E) · (b) CR-031 (new UX ticket) · (c) BUG-009 + reference CR-031 for docs | (b) — new CR-031 titled "TemplatesPage · Tab-based restructure" is cleaner in the changelog |

---

## 9 · Estimated timeline once questions are answered

| Step | Time |
|---|---|
| Register CR-031 in dashboard + write intake doc | 5 min |
| Implement TemplatesPage.jsx changes | 40 min |
| Manual smoke of 20 states with screenshots | 20 min |
| Update CR_STATUS_DASHBOARD.md + DECISIONS_LOG.md | 5 min |
| **Total** | **~70 min** |

---

## 10 · What I need from you now

Answer Q1-Q6 in one line each (e.g. `Q1=d Q2=a Q3=a Q4=a Q5=a Q6=b`) and I'll:

1. Switch to **INTAKE** role to register the new CR properly
2. Then **IMPLEMENTATION** role for the code change
3. Then produce a **QA handover** with the 20-state screenshot matrix

No code is written until you approve the plan.

---

*End of discovery + plan for CR-031 candidate.*
