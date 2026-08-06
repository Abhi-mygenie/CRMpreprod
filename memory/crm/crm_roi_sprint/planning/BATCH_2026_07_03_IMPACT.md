# Impact Analysis · Batch — 2026-07-03

> **Role**: PLANNING (Role 2)
> **Owner**: Abhishek
> **Session**: 2026-07-03 (continuation from batch intake)
> **Scope**: 4 items — CR-042, BUG-009, CR-043, CR-036
> **Companion doc**: `discovery/SESSION_2026_07_03_BATCH_INTAKE.md`
> **Owner directive respected**: NO code changes in this doc. Impact analysis only.
> **Testing note**: Per DECISIONS_LOG rule "Do NOT run testing_agent_v3 for this sprint", verification will be manual + curl-based when implementation happens (not now).

---

## 0 · Index

| ID | Title | Risk | Effort | Blocking |
|---|---|---|---|---|
| CR-042 | Message Report Download (2 entry-points, CSV+XLSX, 5000 cap) | LOW | ~3-5 hr | None — ready to plan |
| BUG-009 | "Details" button on Marketing > History dead | LOW | ~30-45 min | None — ready to plan |
| CR-043 | Tag filter on Customers page + popover UX rework | LOW (filter) / TBD (popover) | ~2 hr filter + TBD popover | **BLOCKED** — popover UX spec missing |
| CR-036 | Media Header Upload via Meta `/uploads` handle | MEDIUM | ~5.5-6 hr | None — Meta-spec defaults locked; Planning validates |

---

## 1 · CR-042 — Message Report Download

### 1.1 Verified registration
- Row in `CR_STATUS_DASHBOARD.md` → status `📋 Intake complete · ALL Q1-Q4 answered`.
- Owner answers locked in `SESSION_2026_07_03_BATCH_INTAKE.md` §Addendum.

### 1.2 Code reality — NONE
- No export/download route on `whatsapp` router. Grep of `MessageStatusPage.jsx`, `CampaignHistoryPage.jsx`, `CampaignsPage.jsx` returns zero user-facing download button. `openpyxl` + `io` + `StreamingResponse` + `csv` already imported in `routers/customers.py` (CR-035); no new dependencies needed.

### 1.3 Data flow trace
```
User (MessageStatusPage) applies filters → clicks "Export ▼ → CSV / XLSX"
        ↓
GET /api/whatsapp/message-logs/export?<same filter params>&format=csv|xlsx
        ↓
router.whatsapp.export_message_logs()
   • Reuses SAME filter builder as GET /message-logs
   • DROPS pagination (skip/limit); adds row-cap 5000
   • Streams CSV or XLSX via StreamingResponse (CR-035 pattern)
        ↓
Browser downloads file
```

```
User (CampaignHistoryPage row) clicks "Export ▼ → CSV / XLSX"
        ↓
GET /api/whatsapp/message-logs/export?run_id=<row.id>&format=csv|xlsx
        ↓
Same handler — run_id branch resolves to filter { $or: [{campaign_id: run_id}, {reference_id: run_id}] }
   • The BUG-006 comment in code (whatsapp.py:1156-1162) confirms this dual-field semantic for old vs new logs
```

### 1.4 Conflicts
- **None**. Non-mutating GET. No overlap with:
  - CR-041 (webhook timestamp) — different code path
  - CR-035 (customer export) — different collection
  - BUG-006 (campaign_id / reference_id semantics) — this CR RESPECTS the existing $or pattern; does not modify it
- File-ownership check: `routers/whatsapp.py` last touched by CR-041 (line 1155-1162 has BUG-006 fix comment). Non-conflicting insertion point is after line 1196 (end of `get_message_logs`).

### 1.5 Risk classification — **LOW**
- No hotspot files touched (per §5 CRITICAL/HIGH-risk list: not in `core/coupon`, `core/loyalty`, `core/whatsapp` send path, `pos.py`, `auth.py`, `analytics_service`, `invoice_generator`, `models/schemas`).
- Read-only aggregation of logs — no mutation, no live sends, no schema change.
- Row cap 5000 protects backend from unbounded memory blow-up.

### 1.6 Affected files
**WILL change** (2 backend, 2 frontend):

| File | Change | ~LOC |
|---|---|---|
| `backend/routers/whatsapp.py` | +1 new endpoint `GET /message-logs/export` (accepts all existing filter params + `format` + `run_id`) | ~90 |
| `backend/routers/whatsapp.py` | +1 new query builder helper `_build_message_log_query()` refactor (extract from `get_message_logs`) to be reused by both handlers | ~40 (net-neutral — extract + reuse) |
| `frontend/src/pages/MessageStatusPage.jsx` | +Export dropdown (CSV/XLSX) in filter bar; on-click builds current filter params + navigates to blob download | ~40 |
| `frontend/src/pages/CampaignHistoryPage.jsx` | +Export dropdown per row (next to Details + Resend); on-click builds `run_id` + `format` params | ~35 |

**WILL NOT touch**:
- `core/whatsapp.py` (send path — CRITICAL, no reason to touch)
- `core/campaign_jobs.py` (scheduler — no reason)
- `routers/campaigns.py` (Details deep-link is BUG-009's problem)
- `whatsapp_message_logs` collection schema (read-only)
- Any authentication code
- Any Meta/AuthKey integration code
- `models/schemas.py`

### 1.7 Downstream consumers
- **None**. The new endpoint is user-triggered from browser only. Not called by scheduler, POS, AuthKey callback, campaign_jobs, or any other backend module.

### 1.8 Owner decisions surfaced
- **None NEW**. All 4 answers (both entry-points, both formats, proposed 12 fields, 5000 cap) are locked. Ready to implement.
- Minor recommendation (Planning's own): fields should use the **display-friendly** column headers (e.g. "Sent At" not `sent_at`) — matching CR-035 export style. Confirming at Implementation step.

### 1.9 Verification matrix

| # | Verification | How |
|---|---|---|
| V1 | Endpoint returns 200 with valid CSV byte stream | `curl -H "Authorization: Bearer $TOK" "$API/api/whatsapp/message-logs/export?format=csv&status=delivered" -o out.csv` — inspect header + row count |
| V2 | Endpoint returns 200 with valid XLSX byte stream | Same as V1 with `format=xlsx` — open in Excel |
| V3 | Filter parity with `/message-logs` | Same filter params → export row count matches list total count (minus 5000-cap edge) |
| V4 | `run_id` param filters correctly | Export with `run_id=<known_run>` → row count == campaign_run.total_sent (or +delta for reruns) |
| V5 | 5000-row cap enforced | Export against a >5000-log tenant → response has 5000 rows + `X-Row-Cap-Reached: true` header (optional) OR toast warning |
| V6 | Auth required | Same endpoint without JWT → 401 |
| V7 | UI: MessageStatusPage dropdown honours current filters | Set filter status=delivered, click Export CSV → downloaded rows all have delivered |
| V8 | UI: CampaignHistoryPage dropdown honours row.run_id | Click Export XLSX on a run row → rows all have `reference_id==run.id` (verifiable by opening file) |
| V9 | Empty export | Filter that produces 0 rows → CSV with header row only, no error |
| V10 | Tenant isolation | User A cannot export User B's logs even with User B's `campaign_id` → confirmed by `user_id` query filter |

### 1.10 CR-042 Planning output block
```text
Planning complete: CR-042
Stage: Impact Analysis
Code reality: NONE (new endpoint + UI)
Risk: LOW
Files WILL change:
  - backend/routers/whatsapp.py (~130 LOC net add)
  - frontend/src/pages/MessageStatusPage.jsx (~40 LOC)
  - frontend/src/pages/CampaignHistoryPage.jsx (~35 LOC)
Files WILL NOT touch:
  - core/whatsapp.py, core/campaign_jobs.py, routers/campaigns.py,
    routers/customers.py, routers/pos.py, models/schemas.py,
    any auth/integration code, DB schema
Owner decisions: NONE (all locked at intake)
Docs: crm_roi_sprint/planning/BATCH_2026_07_03_IMPACT.md
Next: Owner gate approval → Implementation Plan (Role 2, second pass) OR
      direct Implementation (Role 3) if owner accepts LOW-risk fast-lane track
```

---

## 2 · BUG-009 — "Details" button dead on Marketing > History

### 2.1 Verified registration
- Row in `BUG_REGISTRY_CAMPAIGNS.md` § BUG-009 + `CR_STATUS_DASHBOARD.md` row.
- Recommendation (option a — deep-link) on file from INTAKE addendum.

### 2.2 Code reality — CONFIRMED BUG + PARTIAL PLUMBING
- **The dead button**: `CampaignHistoryPage.jsx:164-166` — `<Button ... data-testid="history-details-btn">Details</Button>` — zero handlers.
- **Sibling reference**: `CampaignHistoryPage.jsx:168-186` — Resend button IS wired via `api.post(\`/campaigns/${run.campaign_id}/runs/${run.id}/resend-failed\`)`. So both `run.campaign_id` and `run.id` are present in scope on each row.
- **URL param already handled on MessageStatusPage**: `MessageStatusPage.jsx:106-113` — CR-026 already reads `searchParams.get("campaign_id")` and pre-filters on mount. **BUT** it does NOT read `run_id`. Needs one-line extension.
- **Backend `/message-logs` filter dimensions today** (`routers/whatsapp.py:1125-1196`): status, event_type, `campaign_id` (with $or campaign_id/reference_id), template_name, search, date_from, date_to, include_test. **NO `run_id` param.**
- **Where run_id LIVES on the log document** (`routers/campaigns.py:302-316` — new sends): `campaign_id=<campaign.id>`, `reference_id=<run_id>`. So filtering by run_id = matching log's `reference_id` field.
- **BUG-006 legacy semantics** (`routers/campaigns.py:707` — resend-failed path): resend runs write `campaign_id=<parent run_id>`, `reference_id=<new run_id>`. So a run-scoped filter must $or both fields to capture historical + resend rows.

### 2.3 Data flow trace (option a — deep-link, recommended)
```
User clicks Details → navigate(`/messages?campaign_id=<run.campaign_id>&run_id=<run.id>`)
        ↓
MessageStatusPage mounts → reads searchParams
        ↓
setFilters({..., campaign_id, run_id})
        ↓
fetchLogs() builds query: params.append("campaign_id", ...); params.append("run_id", ...);
        ↓
GET /api/whatsapp/message-logs?campaign_id=X&run_id=Y
        ↓
Backend query: {user_id, is_test:{$ne:true}, $and:[{$or:[{campaign_id:X},{reference_id:X}]}, {$or:[{campaign_id:Y},{reference_id:Y}]}]}
   • Note: When run_id is passed alongside campaign_id, this narrows to
     exactly the messages of THAT specific run of THAT specific campaign.
        ↓
Returns filtered logs → user sees per-run message table + can click into rows
```

### 2.4 Conflicts
- **None**. Additive change on backend (+1 param), additive change on frontend (2 files).
- File-ownership: MessageStatusPage.jsx was last touched by CR-026 (URL param scheme). This extends that pattern; does not conflict.
- Overlap with CR-042: BOTH need `run_id` filter on `/message-logs`. **Coordination benefit** — implement the run_id filter param ONCE, both features consume it. Explicit dependency: BUG-009 depends on the same `run_id` filter that CR-042 needs. Recommend implementing CR-042's `_build_message_log_query()` helper FIRST, then BUG-009 just needs the frontend wire (5 LOC on CampaignHistoryPage + 5 LOC on MessageStatusPage).

### 2.5 Risk classification — **LOW**
- No hotspot files touched.
- Additive filter; no change to send / write paths.
- Fix is a straight wire — no logic change.

### 2.6 Affected files
**WILL change** (1 backend, 2 frontend):

| File | Change | ~LOC |
|---|---|---|
| `backend/routers/whatsapp.py` | Add `run_id: Optional[str] = None` param to `get_message_logs`; add branch to build `$and $or campaign_id/reference_id` on run_id (mirrors campaign_id block) | ~10 |
| `frontend/src/pages/CampaignHistoryPage.jsx` | Wire `onClick` on Details button → `navigate(\`/messages?campaign_id=\${run.campaign_id}&run_id=\${run.id}\`)`. Import `useNavigate` from `react-router-dom` (or `Link` wrap) | ~5 |
| `frontend/src/pages/MessageStatusPage.jsx` | Extend URL param reader (line 107-113) to also read `run_id`; add `run_id` to filters state (line 82-91); append `run_id` to `fetchLogs` params (line 145-156) | ~8 |

**WILL NOT touch**:
- `whatsapp_message_logs` schema
- Send path (`core/whatsapp.py`)
- Campaign send / resend logic (`routers/campaigns.py`)
- CR-026 URL scheme (extends only, doesn't rewrite)
- Any auth / integration code

### 2.7 Downstream consumers
- **CR-042 depends on this** (see §2.4). BUG-009's `run_id` filter is the atomic unit; CR-042 export just reuses it.
- Nothing else consumes `/message-logs` filter parity.

### 2.8 Owner decisions surfaced
- **None**. Recommendation option a is the file-of-record path. Owner did NOT explicitly say "a" — they said "suggest, why it was planned". PLANNING recommends option a. **If owner overrides to b (modal) or d (dedicated page) at gate approval**, plan is void and needs redraft.
- **Recommendation stands**: option a.

### 2.9 Verification matrix

| # | Verification | How |
|---|---|---|
| V1 | Click Details → URL contains `campaign_id` + `run_id` | Browser inspect after click |
| V2 | Landing on MessageStatusPage → filter state has both params | React DevTools state inspection |
| V3 | `/message-logs?campaign_id=X&run_id=Y` returns only that run's rows | curl with known campaign_id+run_id → count == run.total_sent |
| V4 | Legacy resend runs still filterable | curl `?run_id=<resend_run_id>` → returns resend rows via reference_id match |
| V5 | Existing `?campaign_id=X` (without run_id) still works | Regression: CR-026 flow untouched |
| V6 | Filter clear resets both | Click "Clear filters" on MessageStatusPage → both dropped |

### 2.10 BUG-009 Planning output block
```text
Planning complete: BUG-009
Stage: Impact Analysis
Code reality: FULL (defect confirmed; plumbing 80% present via CR-026)
Risk: LOW
Files WILL change:
  - backend/routers/whatsapp.py (~10 LOC — coordinated with CR-042)
  - frontend/src/pages/CampaignHistoryPage.jsx (~5 LOC)
  - frontend/src/pages/MessageStatusPage.jsx (~8 LOC)
Files WILL NOT touch:
  - routers/campaigns.py, core/whatsapp.py, core/campaign_jobs.py,
    whatsapp_message_logs schema, CR-026 param scheme
Owner decisions: None NEW; option (a) is planning recommendation on file.
                 Owner must accept at gate.
Docs: crm_roi_sprint/planning/BATCH_2026_07_03_IMPACT.md
Next: Owner gate approval → Bug Fix (Role 5) — bundle with CR-042 backend
      change to avoid touching whatsapp.py twice
```

---

## 3 · CR-043 — Tag filter on CustomersPage + popover UX rework

### 3.1 Verified registration
- Row in `CR_STATUS_DASHBOARD.md` with scope-locked-to-Customers-page state.

### 3.2 Code reality — PARTIAL
- **Backend support already present**:
  - `core/helpers.py:480-486` — `build_customer_query` already handles `tags` array with ANY/ALL mode. Used by AudiencesPage via `/segments`.
  - `routers/customers.py:1159-1164` — `GET /customers/tags` returns tenant's `available_tags` catalog.
  - `routers/customers.py:1462+` — `POST /customers/:id/tags` and `DELETE /customers/:id/tags/:tag` implemented.
- **Backend GAP**:
  - `routers/customers.py:895-929` — `list_customers` endpoint has 20+ query params BUT no `tags` / `tags_mode` param. So the Customers page can't filter by tags via URL/query today.
- **Frontend GAP**:
  - `CustomersPage.jsx:210-273` — tag popover state + handlers (`handleAddTag`, `handleRemoveTag`, `tagPopoverOpen`, `tagSearchInput`, `availableTags`) all present.
  - `CustomersPage.jsx:923-1097` — filter block has 18+ Select/Input controls, but **NO tag control**.
  - `CustomersPage.jsx:1469-1504` — existing popover is a minimal Command palette (search box + list of available tags + "create new" affordance). Owner wants this REDONE, no spec provided.

### 3.3 Data flow trace
**Part A — Tag filter (has spec, ready to plan):**
```
User selects tag(s) in new CustomersPage filter block
        ↓
setFilters({..., tags: ["VIP", "Regular"], tags_mode: "any"})
        ↓
fetchCustomers() appends: params.append("tags", "VIP,Regular"); params.append("tags_mode", "any")
        ↓
GET /api/customers?tags=VIP,Regular&tags_mode=any&<other filters>
        ↓
Backend list_customers reads new params, injects into query:
   if mode=any: query["tags"] = {"$in": tag_list}
   if mode=all: query["tags"] = {"$all": tag_list}
   (mirrors build_customer_query pattern)
        ↓
Filtered customer list rendered
```

**Part B — Popover UX rework (NO spec, cannot plan):**
```
[BLOCKED — awaiting owner's UX intent]
```

### 3.4 Conflicts
- **None on Part A**. Additive query param + additive UI control.
- File-ownership: `routers/customers.py` last touched by CR-035 (export/import — lines 1169-1420). Non-conflicting insertion at line 897 (function signature) and inside filter builder.
- **CR-034 dependency**: filter reuses `available_tags` catalog (already exposed via `/customers/tags`). No refactor required.
- **Part B blocked**: without an owner UX spec, PLANNING cannot declare files-will-change or estimate LOC. Splitting.

### 3.5 Risk classification — **LOW** (Part A) / **TBD** (Part B)
- No hotspot files touched.
- Filter is a Mongo `$in` / `$all` on an indexed-adjacent field (customers.tags).
- Popover rework — depending on owner's ask (e.g., "modal with tag color chooser + tenant tag CRUD" vs "just fix the visual polish"), risk could go from LOW to MEDIUM.

### 3.6 Affected files
**Part A — WILL change** (1 backend, 1 frontend):

| File | Change | ~LOC |
|---|---|---|
| `backend/routers/customers.py` | Add `tags: Optional[str] = None` (comma-separated) + `tags_mode: Optional[str] = "any"` params to `list_customers`; parse + inject into `query["tags"]` with `$in`/`$all` per mode | ~15 |
| `frontend/src/pages/CustomersPage.jsx` | Add a multi-select tag control to filter block (uses `availableTags` state — already fetched at line 338); wire `filters.tags[]` + `filters.tags_mode`; append to `fetchCustomers` params | ~40 |

**Part B — WILL change (SPEC PENDING)**:

| File | Change (approximate) | ~LOC |
|---|---|---|
| `frontend/src/pages/CustomersPage.jsx` | Redesign lines 1469-1504 popover per owner UX spec | TBD |
| `frontend/src/components/TagChip.jsx` | Possibly restyle | TBD |
| (new?) `frontend/src/components/TagPopover.jsx` | Extract popover into own component if rework is large | TBD |

**WILL NOT touch (both parts):**
- `core/helpers.py` `build_customer_query` (proven code; do NOT refactor)
- `customers` collection schema
- `POST /customers/:id/tags` / DELETE endpoints (tag CRUD works)
- `AudiencesPage` (out of scope; deferred to future CR)
- `MessageStatusPage` (out of scope; deferred to future CR)
- Any auth / integration code

### 3.7 Downstream consumers
- **None for Part A**. The tag filter is a Customers-page-only UI concern.
- Part B may indirectly affect: `TagChip` component consumers (checked at Planning time when spec arrives).

### 3.8 Owner decisions surfaced (BLOCKING)
1. **Popover UX spec — mandatory to unblock Part B**. Please provide either:
   - a. A screenshot / wireframe of the desired popover layout
   - b. A verbal description of what's wrong with the current popover + what should be added / removed / restyled
   - c. A "just polish it — colors, spacing, larger click targets, mobile friendly" instruction and let Planning propose
2. **Filter multi-select behaviour** — recommended: match AudiencesPage exactly (multi-select with ANY/ALL toggle). Confirm at gate.

### 3.9 Verification matrix (Part A only)

| # | Verification | How |
|---|---|---|
| V1 | `GET /api/customers?tags=VIP&tags_mode=any` returns customers with VIP tag | curl → inspect first 5 rows |
| V2 | `tags_mode=all` returns intersection | curl `?tags=VIP,Regular&tags_mode=all` → returns rows where both tags present |
| V3 | Empty `tags=` → no filter applied (fall-through) | curl without tags param behaves identically to today |
| V4 | UI multi-select drives fetch correctly | Select 2 tags → network tab shows `tags=A,B` |
| V5 | Tag chips in filter bar reflect active tag filter | Applied → visible chip, click X → removed |
| V6 | Existing filter regression | All 18 existing filter dimensions still work |
| V7 | Tenant isolation | Selecting a tag from User A's catalog cannot leak User B's customers |

### 3.10 CR-043 Planning output block
```text
Planning complete: CR-043 (Part A — Filter)
Stage: Impact Analysis (partial — Part B blocked)
Code reality: PARTIAL (backend query builder exists in core/helpers.py;
                       list_customers endpoint missing tags param;
                       frontend filter block missing tag control;
                       popover exists but rework spec absent)
Risk: LOW (Part A) / TBD (Part B — spec-dependent)
Files WILL change (Part A):
  - backend/routers/customers.py (~15 LOC)
  - frontend/src/pages/CustomersPage.jsx (~40 LOC)
Files WILL change (Part B): PENDING owner UX spec
Files WILL NOT touch:
  - core/helpers.py, customers schema, auth, tag CRUD endpoints,
    AudiencesPage, MessageStatusPage
Owner decisions: 1 BLOCKING (popover UX spec) + 1 confirmation (ANY/ALL default)
Docs: crm_roi_sprint/planning/BATCH_2026_07_03_IMPACT.md
Next: Owner provides popover UX spec + gate approval
      → Part A can proceed to Implementation immediately upon gate.
      → Part B requires second Planning pass once spec is provided.
Recommended split: ship Part A as CR-043-A; register CR-043-B as a follow-up
                    once popover UX spec is provided.
```

---

## 4 · CR-036 — Media Header Upload via Meta `/uploads` handle

### 4.1 Verified registration
- Discovery doc `CR_036_MEDIA_HEADER_UPLOAD_DISCOVERY.md` complete since 2026-07-01.
- Owner answer 2026-07-03: "as per meta standard" — interpreted as Meta v21 spec defaults locked.

### 4.2 Code reality — CONFIRMED BROKEN
- **The broken send**: `routers/whatsapp.py:483-488` puts `media_url` (raw URL) into `header_handle`. Meta v17+ rejects.
- **User credentials plumbing exists**: `users.meta_waba_id` + `users.meta_access_token` are already stored per-tenant (routers/whatsapp.py:104-125).
- **Meta base URL env**: `META_GRAPH_API_URL` already used (routers/whatsapp.py:382). No new env vars needed.
- **Frontend today** (`TemplateBuilderPage.jsx:476-479`): text `<Input>` for `media_url` — asks user for a public https URL.
- **Frontend validation** (`TemplateBuilderPage.jsx:81-82`): only checks it's a valid https URL — no file upload path exists.
- **Preview code** (`TemplateBuilderPage.jsx:642-644`): renders `[image: filename.jpg]` — a placeholder text, not a real preview.

### 4.3 Data flow trace (target state)
```
User (TemplateBuilder) picks media type: image | video | document | audio
        ↓
User clicks file picker → selects local file
        ↓
Frontend validates size against Meta caps (5/16/100/16 MB per type)
        ↓
POST /api/whatsapp/upload-media-header  (multipart/form-data)
        ↓
Backend endpoint:
  1. Read user's meta_waba_id + meta_access_token (existing pattern)
  2. Stream file to Meta: POST https://graph.facebook.com/v21.0/{WABA_ID}/uploads
     Content-Type: multipart/form-data
     Headers: Authorization: OAuth {access_token}
  3. Parse response {"h": "4:abc123..."}
  4. Return {"handle": "4:abc123..."}
        ↓
Frontend stores handle in tpl.header_handle (new field, replaces media_url for media types)
Preview shows uploaded image thumbnail (from data URL created before upload)
        ↓
User clicks "Submit to Meta"
        ↓
POST /api/whatsapp/submit-template
        ↓
Backend build_meta_template_payload sends:
  {"type":"HEADER", "format":"IMAGE", "example":{"header_handle":["<handle>"]}}
        ↓
Meta accepts → template goes into APPROVAL_PENDING
```

### 4.4 Conflicts
- **HIGH-RISK file `routers/whatsapp.py`** per §5 CRM Override Summary. Requires owner approval before touching (§CRM-SPECIFIC OWNER APPROVAL — "WhatsApp send/resend logic"). **However**, this change is on TEMPLATE CREATION, not send/resend. Interpretation: send path stays untouched; only template payload construction (lines 460-540) plus new upload endpoint. Confirming with owner at gate.
- No overlap with CR-042, BUG-009, CR-043.
- No overlap with CR-041 (webhook fix touched only status transition code).

> **⚠️ CORRECTION 2026-07-03 (INV-005)**: This planning section previously
> asserted "Scenario 1 · SENDING already-approved template → NO IMPACT".
> **That assertion is wrong**. See `discovery/INV_005_CAMPAIGN_MEDIA_SEND_GAP.md`.
> Approved templates with media headers DO fail (silently drop the media)
> when sent via campaigns because `routers/campaigns.py` never passes
> `media_url` to `WhatsAppMessage()`. CR-036 is re-scoped to include a
> Part 2 (send-time media delivery). All numbers below (~5.5 hr, MEDIUM risk,
> LOC estimates, files-will-change list) are the ORIGINAL Part 1 scope
> only. Updated scope = Part 1 + Part 2 covered in INV-005 §6.

### 4.5 Risk classification — **MEDIUM**
- Touches `routers/whatsapp.py` — HIGH-risk file.
- Involves live Meta API call (network side effects).
- File-size caps enforced client-side + server-side (defense in depth).
- No DB schema change on `whatsapp_message_logs` or send path.
- Failure mode: Meta rejects upload → new endpoint returns 4xx to frontend → user sees error toast. No cascading failure.
- **Real customer messages**: NOT affected until template is submitted-approved-mapped-sent. Owner explicit-approval already covers this per §14 "Do NOT change WhatsApp send/resend logic".

### 4.6 Affected files
**WILL change** (2 backend, 1 frontend):

| File | Change | ~LOC |
|---|---|---|
| `backend/routers/whatsapp.py` | (a) **NEW** `POST /whatsapp/upload-media-header` endpoint — multipart in, Meta `/uploads` proxy, returns handle. (b) **MODIFY** `build_meta_template_payload` lines 483-488 — switch from `payload.get("media_url")` to `payload.get("header_handle")` for the `example.header_handle` array. Add "audio" to the tuple at line 483. | ~90 new + ~10 modified |
| `backend/models/schemas.py` | Optional: add `MediaUploadResponse` Pydantic model if we want typed response. | ~10 (optional) |
| `frontend/src/pages/TemplateBuilderPage.jsx` | (a) Replace URL `<Input>` (lines 476-479) with a `<FileInput>` + upload button. (b) Add state for `header_handle`, `header_preview_url`, `uploading`. (c) On file select → POST to `/whatsapp/upload-media-header` → store handle. (d) Preview thumbnail (`<img src={header_preview_url}>` for images; filename+type for others). (e) On submit → pass `header_handle` (not `media_url`). (f) Add "audio" to header_type options if not present. (g) File-size validation per Meta caps. | ~120 |

**WILL NOT touch**:
- `core/whatsapp.py` send path — CRITICAL, do NOT touch.
- `whatsapp_message_logs` schema — CRITICAL for BUG-006 semantics, do NOT touch.
- Send / resend endpoints (`send_bulk_messages` in core/whatsapp.py, `/whatsapp/resend`).
- AuthKey integration — this CR is a Meta-only concern.
- `custom_templates` collection schema — the stored draft already has `media_url`; we can add `header_handle` alongside (backward-compatible) without a migration.
- Auth / login / session code.
- `models/schemas.py` — unless we opt in to the typed response model.

### 4.7 Downstream consumers
- `build_meta_template_payload` is the only consumer of `payload.header_handle` (or currently `media_url`). One direct caller: `/whatsapp/submit-template` endpoint.
- `custom_templates` documents saved as drafts will need a migration OR forward compatibility (Planning recommendation: forward-compat only — old drafts with `media_url` fail submit gracefully, prompting user to re-upload; no migration script needed since all existing media-header drafts are already broken anyway per INV-004).

### 4.8 Owner decisions surfaced

1. **Q1 (CR-036 hotspot approval)** — `routers/whatsapp.py` is a HIGH-risk file per §5. Confirm owner authorises modifying `build_meta_template_payload` (template creation only; send path untouched). Recommend YES since the fix is required for templates to work.
2. **Q2 (audio header support)** — Current UI only offers image/video/document. Meta v21 supports audio too. Include audio in this CR or defer to a follow-up? Recommended: **include audio** (cost is 1 additional entry in the header-type tuple + one MIME-type mapping).
3. **Q3 (draft handling)** — Existing draft `custom_templates` with `media_url` (broken today) — do we (a) silently drop them, (b) show a "re-upload required" warning next to affected drafts, or (c) auto-fetch the URL server-side, re-upload it to Meta, get a handle, backfill? Recommended: **(b)** — non-destructive, user-driven.
4. **Q4 (permanent CRM storage)** — Owner's answer "Meta pass-through" was locked in intake. Confirm at gate: NO permanent CRM/S3 storage. If confirmed, Meta's `/uploads` handle (~30d validity) is the only persistence.
5. **Q5 (per-tenant Meta credential)** — If `users.meta_waba_id` or `users.meta_access_token` is missing / expired for a tenant, the upload endpoint fails. Confirm error UX: (a) inline toast "Meta credentials missing — go to Settings > WhatsApp > Meta API", or (b) block the file picker with a "Configure Meta API first" banner. Recommended: **(b) block early**.

### 4.9 Verification matrix

| # | Verification | How |
|---|---|---|
| V1 | Upload endpoint returns valid handle | curl -F "file=@test.jpg" $API/api/whatsapp/upload-media-header → JSON `{"handle": "4:..."}` |
| V2 | Meta credential missing → 4xx | Same as V1 for a user without meta_access_token → 400 with clear message |
| V3 | Oversize file → 413 | Upload 6MB image → 413 with "Max 5MB for image" message |
| V4 | Wrong MIME type → 4xx | Upload .txt as image → 400 |
| V5 | Template submission with handle succeeds | Full flow: upload → submit-template → Meta returns id (or PENDING_REVIEW) |
| V6 | Old draft with `media_url` on submit → clear error | Load an old draft → click Submit → error "Re-upload required" (per Q3-b) |
| V7 | Send path untouched | Run existing pytest suite `tests/test_campaign_jobs.py` and any whatsapp send tests — all pass |
| V8 | Preview renders | Upload image → thumbnail visible in Template Builder preview panel |
| V9 | Multi-type support | Repeat V1 with video (.mp4), document (.pdf), audio (.mp3) if Q2 accepted |
| V10 | Handle validity (visual QA) | Meta template appears in `getAllTemplate.php` list after upload+submit — verify template `header` component renders correctly on Meta side |

### 4.10 CR-036 Planning output block
```text
Planning complete: CR-036
Stage: Impact Analysis
Code reality: FULL (bug confirmed; credentials plumbing 100% present;
                    only the payload field + a new upload endpoint missing)
Risk: MEDIUM (routers/whatsapp.py is a HIGH-risk file per §5)
Files WILL change:
  - backend/routers/whatsapp.py (~100 LOC — new endpoint + payload fix)
  - frontend/src/pages/TemplateBuilderPage.jsx (~120 LOC — file picker replaces URL)
  - (optional) backend/models/schemas.py (~10 LOC — typed response model)
Files WILL NOT touch:
  - core/whatsapp.py (send path — CRITICAL)
  - whatsapp_message_logs schema, send/resend endpoints
  - AuthKey integration, auth/login, custom_templates schema
Owner decisions: 5 (Q1-Q5 above) — 4 have Planning recommendations
Docs: crm_roi_sprint/planning/BATCH_2026_07_03_IMPACT.md
Next: Owner answers Q1-Q5 + gate approval →
      Implementation (Role 3, MEDIUM risk — needs owner explicit approval
      per §CRM-SPECIFIC OWNER APPROVAL for anything under WhatsApp)
```

---

## 5 · Cross-item Coordination Notes

### 5.1 Suggested implementation order & bundling

| Order | Item | Why this position | Coordination |
|---|---|---|---|
| 1 | **BUG-009 + CR-042 backend** (touch whatsapp.py once) | Both need `run_id` filter on `/message-logs`; do it once | Ship as a **coordinated pair** — one PR / one supervisor restart |
| 2 | **CR-042 frontend** (2 files) | Depends on step-1 backend endpoint | Sequential |
| 3 | **CR-043 Part A** (tag filter) | Independent, LOW risk | Parallel with steps 1-2 if a second window opens |
| 4 | **CR-036** | MEDIUM risk; touches HIGH-risk file | Requires owner explicit approval; do LAST when other LOW risk work is stable |
| 5 | **CR-043 Part B** (popover) | Blocked on owner UX spec | Register CR-043-B when spec arrives |

### 5.2 Shared file impact map

| File | CR-042 | BUG-009 | CR-043 | CR-036 |
|---|---|---|---|---|
| `routers/whatsapp.py` | +130 LOC | +10 LOC | — | +100 LOC |
| `routers/customers.py` | — | — | +15 LOC | — |
| `MessageStatusPage.jsx` | +40 LOC | +8 LOC | — | — |
| `CampaignHistoryPage.jsx` | +35 LOC | +5 LOC | — | — |
| `CustomersPage.jsx` | — | — | +40 LOC + Part B | — |
| `TemplateBuilderPage.jsx` | — | — | — | +120 LOC |

- **`routers/whatsapp.py`** touched by 3 items → coordinate 1 commit / avoid conflicts.
- **`MessageStatusPage.jsx`** touched by 2 items → sequential.
- **`CampaignHistoryPage.jsx`** touched by 2 items → sequential.

### 5.3 Testing note (per DECISIONS_LOG override)
- `testing_agent_v3` is **NOT** to be invoked for this sprint.
- Verification will be manual: **curl for backend endpoints**, **pytest for existing suites** (regression), and **live browser click-through / screenshots** for frontend flows.
- Verification matrices above reflect this manual approach.

### 5.4 Risk aggregation
- LOW: CR-042, BUG-009, CR-043 Part A → NORMAL gate flow (owner approval → implement → QA sign-off)
- MEDIUM: CR-036 → OWNER EXPLICIT APPROVAL required per §CRM-SPECIFIC OWNER APPROVAL rules (touches WhatsApp integration)
- TBD: CR-043 Part B → cannot classify without UX spec

### 5.5 No fast-lane candidates
- Per §5 CRITICAL/HIGH-risk file list + §14 Do-Not rules, none of these items qualify for the Fast Lane (§6).
- All must go through the full INTAKE → PLANNING → IMPLEMENTATION → QA gate flow.
- BUG-009 comes closest (5-13 LOC across 3 files, no hotspot) — but even it depends on the whatsapp.py backend change (which coordinates with CR-042), so it goes through normal flow.

---

## 6 · Aggregate output block (per §12 R12)

```text
Planning complete: BATCH — CR-042, BUG-009, CR-043-A, CR-036
Stage: Impact Analysis (all 4)
Code reality:
  - CR-042: NONE (greenfield endpoint + UI)
  - BUG-009: FULL (defect confirmed; 80% plumbing exists via CR-026)
  - CR-043-A: PARTIAL (backend helper exists; endpoint + UI missing)
  - CR-043-B: BLOCKED (owner UX spec required)
  - CR-036: FULL (bug confirmed; credentials + envs 100% present)
Risk:
  - LOW: CR-042, BUG-009, CR-043-A
  - MEDIUM: CR-036
  - TBD: CR-043-B
Files WILL change (net across all 4):
  - backend/routers/whatsapp.py (~240 LOC across 3 items — coordinate!)
  - backend/routers/customers.py (~15 LOC — CR-043-A)
  - frontend/src/pages/MessageStatusPage.jsx (~48 LOC across 2 items)
  - frontend/src/pages/CampaignHistoryPage.jsx (~40 LOC across 2 items)
  - frontend/src/pages/CustomersPage.jsx (~40 LOC — Part A only)
  - frontend/src/pages/TemplateBuilderPage.jsx (~120 LOC — CR-036)
  - (optional) backend/models/schemas.py (~10 LOC — CR-036)
Files WILL NOT touch:
  - core/coupon.py, core/loyalty.py, core/whatsapp.py send path,
    core/campaign_jobs.py, routers/pos.py, routers/auth.py,
    services/analytics_service.py, services/invoice_generator.py,
    models/schemas.py (except optional +10 for CR-036),
    whatsapp_message_logs schema, custom_templates schema,
    AuthKey callback code, MyGenie SSO code, CR-026 URL scheme (only extended)
Owner decisions (blocking): 
  - CR-043 popover UX spec (see §3.8)
  - CR-036 Q1-Q5 (see §4.8)
  - Owner approval for CR-036 medium risk work (touches HIGH-risk file)
  - Confirm option (a) for BUG-009 (recommendation on file)
Docs:
  - /app/memory/crm/crm_roi_sprint/planning/BATCH_2026_07_03_IMPACT.md
  - /app/memory/crm/crm_roi_sprint/discovery/SESSION_2026_07_03_BATCH_INTAKE.md
Next: Owner reviews impact, answers CR-036 Q1-Q5, provides CR-043 popover
      UX spec, confirms BUG-009 option (a), gates open →
      Role 3 (Implementation) — starting with coordinated
      CR-042-backend + BUG-009-backend to touch routers/whatsapp.py once.
```

---

*End of Impact Analysis. No code changes made. No implementation started. Awaits owner gate approval.*
