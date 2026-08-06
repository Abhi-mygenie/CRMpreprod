# Batch Intake — 2026-07-03 (Session close)

> **Role**: INTAKE
> **Date**: 2026-07-03
> **Owner requester**: Abhishek
> **Reporter**: Owner (verbal report + 1 screenshot annotation)
> **Session context**: New session opened after code re-pull. Owner reported 5 items in a single message.

---

## Items reported

| # | Owner statement (verbatim) | Assigned ID | Type | Priority (proposed) | Risk | Status after intake |
|---|---|---|---|---|---|---|
| 1 | "need functionality download the message report for every campaign, event etc" | **CR-042** | Feature (CR) | P2 | LOW | 📋 Registered — awaits Q1-Q4 + planning |
| 2 | "The details button in marketing>history is not working" | **BUG-009** | Bug | P2 | LOW | 🔴 OPEN — code-reality confirmed, awaits owner Q1 spec |
| 3 | "In filter, need an option to filter tags/labels also" | **CR-043** | Feature (CR) | P2 | LOW | 📋 Registered — awaits owner Q1 (which page's filter) |
| 4 | "There is now customer tag field in the excel which is exported from customer dashboard, how does it work" | *(no CR — question answered)* | Question | — | — | ✅ Answered inline in §Item-4 below; flags **CR-035 dashboard drift** |
| 5 | "media / header not working in whats app template" (with screenshot arrow pointing at Marketing > History row) | **Duplicate of CR-036** | Bug (already registered as CR) | (inherits CR-036 = P2) | LOW | Notes-only; screenshot logged. CR-036 already awaits owner Q1-Q3. |

---

## Item 1 — CR-042 · Download message report per campaign / event

### Classification
- **Type**: Feature / Change Request
- **Severity**: P2 (important — owner needs it for reconciliation and stakeholder reporting; workaround = manual copy from Message Status table)
- **Risk**: LOW (read-only export; no changes to send / write logic)
- **Blast radius**: SMALL — MessageStatusPage + one new backend export endpoint

### Duplicate check
- **CR-035** (Customer Export/Import) — DIFFERENT scope (exports customers, not message logs). No overlap on entity but export libs (openpyxl / io) already installed. Can reuse export-format decision (both CSV + xlsx).
- No existing "message export" endpoint. `grep -i "export\|download\|xlsx" MessageStatusPage.jsx CampaignHistoryPage.jsx CampaignsPage.jsx` → only JS `export` keywords, no user-facing download.

### Code reality
- **NONE** — no export button anywhere on Message Status or Campaign History. No backend endpoint like `/api/whatsapp/message-logs/export`.

### Evidence
- Owner verbal request.
- Confirmed absent in code (`grep` scans).

### Owner questions before planning
1. **Q1 — Where is the download entry-point?**
   - a. Button on Message Status dashboard (respects current filters — campaign, event, date range, status)
   - b. Button on Campaign History rows (per-campaign-run scope)
   - c. Both
2. **Q2 — File format?**
   - a. CSV only
   - b. Excel (.xlsx) only
   - c. Both (dropdown chooser — matches CR-035 pattern)
3. **Q3 — Fields to include** (default proposal):
   `sent_at, customer_phone, customer_name, event_type / campaign_name, template_name, status (pending/delivered/read/rejected/failed), delivered_at, read_at, rejected_at, error_reason, message_id, is_test`
   - Confirm / add / remove?
4. **Q4 — Row limit?**
   - a. Match CR-035 (5000 rows/export)
   - b. Higher (message logs grow faster than customers — Jeh's Nest already has 565 logs)
   - c. No limit (stream response — larger blast radius)

### Estimated effort
~3-5 hrs (backend endpoint using existing `openpyxl` + `io`; frontend button + dropdown mirroring CR-035 UX)

### Registered
- New CR-042 row added to `CR_STATUS_DASHBOARD.md`.

---

## Item 2 — BUG-009 · "Details" button on Marketing > History does nothing

### Classification
- **Type**: Bug (code defect)
- **Severity**: P2 (dead UX element; feature discoverability broken — but there's no data-loss / financial impact)
- **Risk**: LOW
- **Blast radius**: SMALL — 1 file, `CampaignHistoryPage.jsx`

### Duplicate check
- Not in `BUG_REGISTRY_CAMPAIGNS.md` (BUG-001 through BUG-008 all closed; no overlap).
- Related but distinct from CR-026 (View Messages deep-link) — CR-026 button lives on **CampaignsPage** and IS working. The button in question is on **CampaignHistoryPage** (a different page — `/marketing/history`).

### Code reality — CONFIRMED BUG
`/app/frontend/src/pages/CampaignHistoryPage.jsx` line 164-166:
```jsx
<Button variant="outline" size="sm" className="text-xs rounded-full" data-testid="history-details-btn">
    Details
</Button>
```
- **No `onClick` handler.** No `navigate()` call. No dialog. Pure dead button.
- Test-id `history-details-btn` exists but has zero behaviour.
- Sibling "Resend" button (line 168-184) IS wired correctly — visual precedent for how Details should be wired.

### Evidence
- Direct code inspection (line-numbered above).
- Reproducible on any tenant with campaign history rows (Jeh's Nest has 8+ completed campaigns).

### Owner questions before fix
1. **Q1 — What should "Details" show?** Options:
   - a. Navigate to Message Status pre-filtered by this specific run — `/messages?campaign_id=<campaign_id>&run_id=<run_id>` (extends CR-026's URL param scheme)
   - b. Open an inline modal with run stats (total sent / delivered / read / rejected / failed, started_at, completed_at, error breakdown)
   - c. Both — modal by default with a "View Messages →" link inside it
   - d. Navigate to a dedicated `CampaignRunDetailPage`

### Proposed default (pending owner Q1)
Option **a** — cheapest, reuses CR-026 plumbing, ~15 min fix.

### Estimated effort
~15-30 min (depends on Q1 answer)

### Registered
- BUG-009 row added to `BUG_REGISTRY_CAMPAIGNS.md`.
- BUG-009 row added to `CR_STATUS_DASHBOARD.md` "Recent transitions".

---

## Item 3 — CR-043 · Filter option for tags / labels

### Classification
- **Type**: Feature enhancement (CR)
- **Severity**: P2 (existing feature partially exists — CR-034 added tags to AudiencesPage filter only; owner wants it in other filter surfaces too)
- **Risk**: LOW
- **Blast radius**: MEDIUM — depends on WHERE (see Q1)

### Duplicate check
- **CR-034** (Customer Tag System — 🟢 CLOSED) already added tag filter to **AudiencesPage** (Section 5, ANY/ALL toggle, `available_tags` catalog).
- Owner statement "In filter, need an option to filter tags/labels also" — the word "also" strongly suggests they want it in **another** filter surface where it's currently missing.
- Candidate surfaces WITHOUT a tag filter today:
  - **CustomersPage** (`/customers`) — has segment_tags[], not free-form tag filter
  - **MessageStatusPage** (`/messages`) — has status/event/campaign/date filters, no tag filter
  - **Coupons / Feedback / Analytics** — unlikely but possible
- Not a duplicate of CR-034; treat as CR-034 follow-up filter expansion.

### Code reality
- **CustomersPage**: has `Tag` icon import and per-row tag chips (CR-034), but **no filter dropdown** for tags. `grep tag frontend/src/pages/CustomersPage.jsx` shows tag manipulation code but no top-of-page filter control for tags.
- **MessageStatusPage**: filter block is populated by `/api/whatsapp/message-filters` (events, campaigns, dates, status). No tag axis. `whatsapp_message_logs` collection doesn't index customer tags — would need an aggregation join with `customers` at query time or a denormalized `customer_tags[]` on the log document.

### Evidence
- Owner verbal request.
- Confirmed absent on CustomersPage and MessageStatusPage.

### Owner questions before planning
1. **Q1 — Which filter is missing the tag axis?** (blocking — cannot plan without this)
   - a. Customers page (`/customers`)
   - b. Message Status page (`/messages`)
   - c. Both
   - d. Other page (name it)
2. **Q2 — If MessageStatusPage: match by CUSTOMER's current tags (dynamic — reflects re-tagging) OR by tags snapshot at send-time (static — reflects state when the message went out)?**
   - a. Dynamic (query-time join to `customers`)
   - b. Snapshot (add `customer_tags[]` to `whatsapp_message_logs` on write)
3. **Q3 — Multi-select behaviour?**
   - a. ANY (matches CR-034 default on AudiencesPage — customer has ≥ 1 of selected tags)
   - b. ALL (customer has all selected tags)
   - c. ANY-with-ALL-toggle (matches AudiencesPage exactly)

### Estimated effort
- If Q1 = a. CustomersPage only: ~2 hrs (frontend filter + backend `tags` filter param on `/customers` list already exists via `build_customer_query`; wire the UI)
- If Q1 = b. MessageStatusPage: ~4-6 hrs (backend join or denorm + frontend)
- If Q1 = c. Both: ~5-7 hrs

### Registered
- New CR-043 row added to `CR_STATUS_DASHBOARD.md`.

---

## Item 4 — Answered inline · How the "tags" column in the customer Excel export works

### Answer to owner

The **Tags** column in the exported Excel/CSV file (Customers → **Export** button dropdown → CSV/XLSX) shows the **free-form tags you have attached to each customer**, joined with commas.

**Where it comes from:**
- Column definition: `/app/backend/routers/customers.py` line 50 — `("Tags", "tags")` in `EXPORT_HEADERS`.
- Data source: `Customer.tags` array (the tag chips visible on the Customer Detail page and each row on the Customers page).
- Serialization: line 1185 — `if key == "tags" and isinstance(v, list): v = ", ".join(v)` — array joined with `", "`.
- Endpoint: `GET /api/customers/export?format=csv|xlsx` — implemented by CR-035.

**How to populate the column:**
- Add tags via CustomersPage inline popover (`+` icon next to each customer's tag chips) or via bulk-tag from the AudiencesPage.
- The `available_tags` catalog on the user document lists all tags the tenant has ever created.
- Currently, ~2 customers have tags in this tenant (VIP backfill from CR-034 migration script).

**Import round-trip:**
- The same column is accepted on import (`POST /api/customers/import`) — line 1245: `IMPORT_HEADERS = ["name", "phone", "email", "dob", "city", "address", "tags"]`.
- Import behaviour: **additive** — merges with existing tags on the customer (line 1397: `merged_tags = list(set(existing_tags + incoming_tags))`). Never removes tags.

### Action registered
- **⚠️ CR_STATUS_DASHBOARD drift discovered**: Dashboard row for CR-035 shows `🔵 Discovery complete — ALL Q1–Q10 locked. Impact Analysis next` — but the code (`/customers/export`, `/customers/import`, `/customers/tags`, IMPORT_HEADERS, EXPORT_HEADERS, `_parse_import_file`) IS FULLY IMPLEMENTED in `routers/customers.py` (lines 27–1420). The frontend (CustomersPage.jsx lines 213-395) also has full UI: `showExportDropdown`, `handleExport`, `handleDownloadTemplate`, etc.
- **Recommendation**: Next agent (PLANNING or CLOSURE role) should either:
  - (a) Update CR-035 status to `🟢 IMPLEMENTED` with a retroactive impl report, OR
  - (b) Run QA against it and flip to 🟢 CLOSED if QA passes.
- Not a bug, but a registry hygiene issue per §10 R1 (code-vs-registry drift).

---

## Item 5 — Duplicate of CR-036 · Media / header not working in WhatsApp template

### Screenshot analysis
Owner attached a blurred crop of the Campaign History row (I recognised the columns: template name `premium_lunch_menu_new1`, recipient count `2`, delivery donuts, `0.0%` delivery rate, `Jul 2, 07:01 PM` timestamp, "Details" text truncated). The red arrow points at the "Details" area — this actually reinforces **Item 2** (BUG-009), NOT Item 5. Owner may have attached the same screenshot for two items; the visible pixels show a campaign row, not a template media header.

### Duplicate check
- **CR-036** (Media Header Upload for Template Builder) — already registered 2026-07-01. Discovery complete. Awaits owner Q1-Q3 (media types, max file size, permanent vs pass-through storage).
- Discovery doc: `discovery/CR_036_MEDIA_HEADER_UPLOAD_DISCOVERY.md`.
- Root cause per INV-004 (2026-07-01): templates with image/video headers are REJECTED by Meta because CRM sends raw URL as `header_handle`. Meta v17+ requires a pre-uploaded media handle from `POST /v21.0/{WABA_ID}/uploads`.

### Action
- No new CR/BUG.
- Owner report added as **REFRESHED** evidence on CR-036 → item still awaits Q1-Q3 answers to unblock planning.
- If owner meant something DIFFERENT by "media / header not working" (e.g. header text placeholder not resolving, or header preview not rendering, or a runtime error different from template rejection), please clarify and I will open a separate CR.

---

## Summary — INTAKE outputs (per role playbook)

### CR-042
```text
Intake complete: CR-042
Classification: FEATURE
Severity: P2
Risk: LOW
Duplicate check: DISTINCT (related to CR-035 by pattern only)
Evidence: owner report + grep confirmed absent
Blast radius: SMALL
Docs updated: CR_STATUS_DASHBOARD.md, SESSION_2026_07_03_BATCH_INTAKE.md
Next: Owner Q1-Q4 → Planning
```

### BUG-009
```text
Intake complete: BUG-009
Classification: BUG
Severity: P2
Risk: LOW
Duplicate check: DISTINCT (not in BUG_REGISTRY_CAMPAIGNS; related to but different from CR-026)
Evidence: CampaignHistoryPage.jsx:164-166 (dead onClick)
Blast radius: SMALL (1 file, ~5-15 LOC)
Docs updated: BUG_REGISTRY_CAMPAIGNS.md, CR_STATUS_DASHBOARD.md, SESSION_2026_07_03_BATCH_INTAKE.md
Next: Owner Q1 → Bug Fix role
```

### CR-043
```text
Intake complete: CR-043
Classification: FEATURE (extension of CR-034)
Severity: P2
Risk: LOW
Duplicate check: DISTINCT (CR-034 covered AudiencesPage only)
Evidence: owner report + code grep on CustomersPage/MessageStatusPage
Blast radius: MEDIUM (depends on Q1 answer)
Docs updated: CR_STATUS_DASHBOARD.md, SESSION_2026_07_03_BATCH_INTAKE.md
Next: Owner Q1 (BLOCKING) → Planning
```

### Item 4 — Question
```text
Answered inline. See §Item-4 above.
Drift found: CR-035 status in dashboard says "Discovery complete" but code shows implementation done.
Registry hygiene: Recommend CR-035 status refresh in next PLANNING or CLOSURE role.
```

### Item 5 — Duplicate of CR-036
```text
No new registration.
CR-036 still awaits owner Q1-Q3 (media types, max file size, permanent vs pass-through storage).
```

---

*End of batch intake — 2026-07-03. No code changes. Handing back to owner for questions on CR-042, BUG-009, CR-043, and (still-open) CR-036.*

---

## Addendum — 2026-07-03 (later same session): Owner answers received

Owner's verbatim response:
> **CR-042** — Q1 both, Q2 both, Q3 show proposed field, Q4 5000
> **BUG-009** — "suggest, why it was planned"
> **CR-043** — Q1 customer. we might need to re do this pop up (attached screenshot). rest in future CR register
> **CR-036** — as per meta standard we have been following that in template builder
> **Directive**: dont start impact until i call planning agent

Attached screenshot: showed the Marketing > History row with "Details" button highlighted (same context as BUG-009). Did NOT show a customer tag popup — noted as flag; visual spec for CR-043 popup UX rework is TBD from owner at Planning time.

### CR-042 · answers locked

- **Q1 (entry-point)**: BOTH — button on **MessageStatusPage** (uses current filter state → campaign, event, date range, status) AND button on **CampaignHistoryPage** (per-run scope, one download per row).
- **Q2 (format)**: BOTH — CSV and Excel (`.xlsx`). Follow the CR-035 dropdown pattern (`Export ▼` → CSV / XLSX).
- **Q3 (fields)**: Owner said "show proposed field" → intake-proposed field list is accepted:
  ```
  sent_at, customer_phone, customer_name, event_type_or_campaign_name,
  template_name, status, delivered_at, read_at, rejected_at,
  error_reason, message_id, is_test
  ```
- **Q4 (row limit)**: **5000** (matches CR-035).

**Status transition**: 📋 Registered → 📋 **Intake complete · ALL Q answered · ready for Planning agent**
**Effort estimate remains**: ~3-5 hrs (2 backend endpoints — one filtered, one per-run — + 2 frontend buttons + dropdown, reusing openpyxl + io from CR-035)

### BUG-009 · owner asked for my recommendation + rationale

Owner asked: *"suggest, why it was planned"*. Interpreting as: recommend what the button should do, and explain the design intent behind the button being there in the first place.

**Original intent (design archaeology)**:
The Details button lives on a per-campaign-run row in Marketing > History. Each row already summarizes the run at glance (recipient count, delivered / read / rejected donuts, delivery rate %, timestamp). A "Details" affordance is the standard CRM pattern for *"give me the row-level drill-down that the summary aggregates over"* — in this case, the individual message log entries produced by that specific run.

The button was almost certainly planned so an owner viewing a run's aggregate stats can immediately jump to the per-recipient log (who got it, who didn't, why it failed, when it delivered). The plumbing to do this already exists: CR-026 shipped a URL-param filter on the Message Status page (`?campaign_id=X&run_id=Y`). "Resend" on the same row uses the same underlying campaign identity to trigger a re-send. Only "Details" was left unwired.

**My recommendation (proposed default, awaiting Planning confirmation)**:

**Option (a) — Deep-link to Messages page pre-filtered by run**
- Cheapest fix: ~15 LOC in `CampaignHistoryPage.jsx`
- `onClick={() => navigate(`/messages?campaign_id=${row.campaign_id}&run_id=${row.run_id}`)}`
- Requires MessageStatusPage to accept and respect `run_id` param (verify at Planning; may need +1 hr of backend filter work if `run_id` isn't already a filter dimension on `whatsapp_message_logs`).
- Consistent with existing CR-026 UX pattern.
- No new modal / route to design or maintain.

**Why not (b) inline modal**: Modal would duplicate summary already visible in the row; only added value is a small error breakdown, and that's better served on the full Messages page which owner can already filter and export (CR-042). Modal = more code, more design, more maintenance, less benefit.

**Why not (d) dedicated CampaignRunDetailPage**: Overkill — no unique data lives at that URL that isn't already served by pre-filtered Messages page.

**Recommendation summary**: **Go with (a)** unless Planning agent finds a specific reason for (b) or (c).

**Status transition**: 🔴 OPEN · awaits Q1 → 🔴 OPEN · **recommendation on file (option a), awaits Planning to confirm and dispatch to Bug Fix role**

### CR-043 · scope narrowed + parked follow-ups

- **Q1**: Customers page only in this CR.
- **Additional owner ask**: The existing tag add/edit popover on the Customers page needs a UX rework ("we might need to redo this popup"). Attached screenshot did NOT show that popup — it showed the Marketing > History row (BUG-009 context). **Flag**: visual spec for the popover rework is TBD; Planning agent should request a fresh screenshot / description at planning time.
- **Deferred to future CR** (per owner's "rest in future CR register"):
  - Tag filter on **MessageStatusPage** (will register as new CR when owner raises it)
  - Any tag filter on other surfaces (Coupons, Feedback, Analytics)
  - These are NOT registered now — INTAKE captures the deferral only.

**Scope of CR-043 as of now**:
1. Add a **Tags filter dimension** to the CustomersPage filter block (dropdown or multi-select using tenant's `available_tags` catalog).
2. Rework the **inline tag popover** on the CustomersPage (UX spec TBD at Planning).

**Status transition**: 📋 Registered · awaits Q1 → 📋 **Intake complete · scope locked (Customers page only) · UX spec for popover pending at Planning**
**Effort estimate revision**: ~3-5 hrs (filter is trivial since backend already filters by `tags`; popover rework depends on new UX spec)

### CR-036 · owner answer interpretation

Owner said: *"as per meta standard we have been following that in template builder"*.

**My interpretation**: resolve open Q1-Q3 by matching Meta WhatsApp Cloud API's official media-header spec. Locking these as **defaults pending Planning confirmation**:

- **Q1 (media types supported)**: image, video, document, audio (Meta v21 supports all four for header media).
- **Q2 (max file size per Meta caps)**:
  - Image: 5 MB (JPEG, PNG)
  - Video: 16 MB (MP4, 3GPP)
  - Document: 100 MB (PDF)
  - Audio: 16 MB (AAC, M4A, AMR, MP3, OGG opus)
- **Q3 (storage strategy)**: **Meta pass-through pattern** — for each template that has a media header, upload the asset via `POST /v21.0/{WABA_ID}/uploads` to obtain a media `handle`, then pass that handle in the template's `header_handle`. No permanent CRM-side hosting required; Meta handles storage.
  - Note: media handles from `/uploads` are valid for ~30 days for template creation, then Meta persists the media associated with the approved template.

**If owner meant something different** (e.g., "our template builder already follows Meta spec — why is this in the discovery backlog?"): note that INV-004 (2026-07-01) code-audit found we currently send raw URLs as `header_handle`, which Meta rejects. So implementation gap remains regardless of stated intent. Planning agent will confirm.

**Status transition**: 📋 Registered · awaits Q1-Q3 → 📋 **Intake complete · defaults locked per Meta spec · ready for Planning to validate + implementation**

### CR-035 · dashboard drift flag (unchanged)

Recommendation stands: CR-035 dashboard row shows "Discovery complete" but code is fully shipped. Not touching in this INTAKE (out of scope). Planning / Closure agent should refresh.

### Owner directive respected

- No impact analysis performed.
- No planning performed.
- No code changes.
- Awaits owner invoking Planning agent to proceed.

---

*Addendum end. INTAKE role formally closes for this session unless owner reports new items.*

