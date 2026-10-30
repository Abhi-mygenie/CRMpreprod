# CR-036 Batch B.2 — Impact Analysis + Implementation Plan

> **Session**: 2026-07-11 · PLANNING role
> **Scope source**: `CR_036_BATCH_B1_IMPL_PLAN_FINAL_2026_07_11.md` §9 — "B.2: WhatsApp Reports `media_missing` filter chip + campaign wizard stale-template-block"
> **Owner delegation**: UX decisions delegated to agent ("user experience is priority", 2026-07-11)
> **Governing decisions**: DECISIONS_LOG §CR-036 — G5 fail-loud (`status="failed"`, `status_note="media_missing"`, no AuthKey call), `status_note` field contract (optional, non-indexed)
> **Status**: ✅ OWNER-APPROVED 2026-07-11 ("1 A" — mockups approved). Implementation gate OPEN — next implementation session executes E-B2-1…15 as written. No code has been changed yet.

---

## 1 · Impact Analysis

### 1.1 Code reality (verified 2026-07-11 against current /app)

| Surface | File · Line | Reality |
|---|---|---|
| G5 gate (immediate send) | `routers/campaigns.py:289-302` | Inserts `whatsapp_message_logs` row `status="failed"`, `status_note="media_missing"`, skips AuthKey call ✅ |
| G5 gate (resend path) | `routers/campaigns.py:844-857` | Same pattern ✅ |
| Test send | `routers/campaigns.py:556-557` | 400 fail-loud before send ✅ |
| Message stats | `routers/whatsapp.py:1232-1278` | Buckets: total/delivered/read/pending/rejected. **`failed` rows count in total only — invisible in every bucket** |
| Log query builder | `routers/whatsapp.py:1285-1345` (`_build_message_log_query`) | Filters: status, event_type, campaign_id ($or BUG-006), run_id ($or), template_name, search ($and-wrapped), dates, include_test. **No `status_note` dimension** |
| `/message-logs` + `/export` | `routers/whatsapp.py:1348, 1443` | Both share the query builder (CR-042 contract — byte-identical semantics must be preserved) |
| `MESSAGE_STATUSES` | `routers/whatsapp.py:33` | `["pending","delivered","read","rejected"]` — no `failed` |
| Status filter UI | `MessageStatusPage.jsx:481-492` | Hardcoded items; `rejected` is labeled "Failed". **Literal `failed` status not selectable** |
| StatusBadge | `MessageStatusPage.jsx:25-41` | No `failed` config → **falls back to yellow "Pending" badge — actively misleading** |
| Wizard template source | `CampaignWizardPage.jsx:119-134` | `GET /whatsapp/authkey-templates` → formatted to `{id, name, message, variables}` only |
| `/authkey-templates` | `routers/whatsapp.py:144-160` | Raw AuthKey passthrough — **no enrichment from `custom_templates`** |
| B.1 wizard warning | `CampaignWizardPage.jsx:428-432` | Checks `currentTemplate.needs_media_reupload` — **field never present → warning is DEAD CODE, never renders** |
| Resend eligibility | `routers/whatsapp.py:1883-1887` | `status ∈ {pending, rejected}` only — `failed` rows not resendable |

### 1.2 Gaps this batch must close

| ID | Gap | Severity |
|---|---|---|
| GAP-B2-1 | Wizard media warning (B.1 E-item) is dead code — `needs_media_reupload` never reaches the wizard because `/authkey-templates` is not enriched. The "upfront block" has no data to act on. | MAJOR |
| GAP-B2-2 | `media_missing` failures are invisible: not in stats buckets, not filterable, badge renders as "Pending". Owner cannot triage G5 skips at all. | MAJOR |
| GAP-B2-3 | G5-inserted log rows lack `id`, `customer_name`, `template_name` → React keys undefined (row expand/checkbox broken on those rows), Name/Template columns render "-". | MINOR (bug, adjacent) |

### 1.3 UX decisions (taken under delegated authority — owner may veto at approval)

| ID | Decision | Rationale |
|---|---|---|
| D-B2-1 | **Dedicated "Media Missing (N)" chip** in the Message Status filter row, amber, rendered **only when N > 0** (no clutter at zero). Click toggles a `status_note=media_missing` filter; active state shown on the chip itself. Status dropdown unchanged. | Instant triage without adding a 6th stats card (grid is 5-col) or overloading the status dropdown with a second "failed" concept. |
| D-B2-2 | **Soft block in wizard**: template stays visible in dropdown with "• media required" suffix; on selection a **red** banner explains + CTA "Go to Templates to re-upload"; **Next (step 2→3) disabled** via `canStep2`. | Hiding templates causes "where did my template go?" confusion. Visible-but-blocked with a fix-it path is the clearest UX; backend G5 remains the authoritative last line. |
| D-B2-3 | `failed` StatusBadge: amber, XCircle, label **"Not Sent"**; row shows reason text "Media missing — re-upload template header" (mirrors existing `failure_reason` pattern). | Distinguishes pre-send G5 skips ("Not Sent") from provider rejections ("Failed"/rejected). |
| D-B2-4 | Resend of `failed` rows stays **OUT of B.2** (needs media re-check plumbing). Re-upload + fresh campaign send is the recovery path. Candidate for B.3. | Keeps B.2 at ~2 hrs; avoids touching resend send-path logic (hotspot). |

### 1.4 Files WILL change

| File | Risk | Change type |
|---|---|---|
| `backend/routers/whatsapp.py` | HIGH (hotspot, Q8-class) | Additive: stats keys, query-builder param, `/authkey-templates` enrichment, `MESSAGE_STATUSES` +`failed` |
| `backend/routers/campaigns.py` | HIGH (hotspot) | **G5 insert dicts only** (2 sites) — add `id`/`customer_name`/`template_name`. No send-path logic touched |
| `frontend/src/pages/MessageStatusPage.jsx` | MEDIUM | Badge config, chip, `status_note` filter wiring (logs + export), row reason text |
| `frontend/src/pages/CampaignWizardPage.jsx` | MEDIUM | Carry enrichment fields, dropdown suffix, red block banner, `canStep2` gate |

### 1.5 Files WILL NOT change

`core/whatsapp.py` (send_bulk_messages untouched — DO-NOT rule) · `core/campaign_jobs.py` · `core/coupon.py` · `core/loyalty.py` · `routers/pos.py` · `models/schemas.py` · `TemplatesPage.jsx` · `TemplateBuilderPage.jsx` · `MediaHeaderUpload.jsx` · resend endpoint logic · `.env`

### 1.6 Blast radius

- `/message-logs` + `/export` share `_build_message_log_query` — new param is optional-default-None ⇒ existing calls byte-identical (CR-042 contract preserved).
- `/authkey-templates` consumers: `CampaignWizardPage` (targeted), `TemplatesPage`, automation content — enrichment is **additive keys on existing dicts**; no key renamed/removed ⇒ safe.
- `MESSAGE_STATUSES` consumed only by `/message-filters` response; frontend dropdown is hardcoded ⇒ adding `failed` is inert until UI uses it.
- G5 insert extra fields: `whatsapp_message_logs` is schemaless reads; `id` addition matches every other writer (`log_message_attempt` writes `id`) ⇒ consistency fix, not divergence.

---

## 2 · Implementation Plan (edit-by-edit)

### Backend

**E-B2-1 · `routers/whatsapp.py:33`** — `MESSAGE_STATUSES = ["pending", "delivered", "read", "rejected", "failed"]`

**E-B2-2 · `routers/whatsapp.py` `get_message_stats`** — add `"failed": 0` to the stats dict (aggregation already groups it; key just needs to exist) and append a `media_missing` count:
```python
stats["media_missing"] = await db.whatsapp_message_logs.count_documents(
    {**query, "status_note": "media_missing"}
)
```
(`query` here is the same match dict used by the pipeline — honours include_test + date range.)

**E-B2-3 · `routers/whatsapp.py` `_build_message_log_query`** — new kwarg `status_note: Optional[str] = None`; when set and != "all": `query["status_note"] = status_note`. Wire the param through `GET /message-logs` and `GET /message-logs/export` signatures and their builder calls (both, to keep CR-042 parity).

**E-B2-4 · `routers/whatsapp.py` `get_authkey_templates`** — after fetching AuthKey data, enrich:
```python
customs = await db.custom_templates.find(
    {"user_id": user["id"]},
    {"_id": 0, "authkey_wid": 1, "header_type": 1, "send_media_url": 1, "needs_media_reupload": 1},
).to_list(200)
by_wid = {str(c["authkey_wid"]): c for c in customs if c.get("authkey_wid")}
for t in templates:
    c = by_wid.get(str(t.get("wid", "")))
    if c:
        t["header_type"] = c.get("header_type")
        t["has_send_media"] = bool(c.get("send_media_url"))
        t["needs_media_reupload"] = bool(c.get("needs_media_reupload"))
```
Key match is `str()` on both sides (AuthKey `wid` may be int; `custom_templates.authkey_wid` stored as str — mirrors `_get_template_send_media` lookup).

**E-B2-5 · `routers/campaigns.py:291` and `:846` (G5 insert dicts)** — add to both:
```python
"id": str(uuid.uuid4()),
"customer_name": cust.get("name"),        # resend site: cust_by_phone lookup, fallback ""
"template_name": campaign.get("template_name"),
```
(uuid already imported. Resend site: resolve `cust = cust_by_phone.get(phone, {})` **before** the G5 check so name is available — move the existing lookup one line up; no other reordering.)

### Frontend — MessageStatusPage.jsx

**E-B2-6 · StatusBadge config** — add:
`failed: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300", icon: XCircle, label: "Not Sent" }`

**E-B2-7 · State** — `filters.status_note: "all"`; `stats` default gains `failed: 0, media_missing: 0`.

**E-B2-8 · Param wiring** — in `fetchLogs` and `handleExport`: `if (filters.status_note !== "all") params.append("status_note", filters.status_note);`

**E-B2-9 · Chip** — in the filter row (after the Status select), render only when `stats.media_missing > 0`:
```jsx
<button
  data-testid="media-missing-chip"
  onClick={() => handleFilterChange("status_note",
      filters.status_note === "media_missing" ? "all" : "media_missing")}
  className={`h-9 px-3 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
      filters.status_note === "media_missing"
        ? "bg-amber-500 border-amber-500 text-white"
        : "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"}`}
>
  <XCircle className="w-3.5 h-3.5" />
  Media Missing ({stats.media_missing.toLocaleString()})
</button>
```

**E-B2-10 · Row reason text** — desktop template cell + mobile card: when `log.status_note === "media_missing"`, render amber text "Media missing — re-upload template header" (`data-testid={`media-missing-reason-${log.id}`}`), same pattern as the existing rejected `failure_reason` block.

### Frontend — CampaignWizardPage.jsx

**E-B2-11 · `loadTemplates` formatted map** — carry `header_type: t.header_type`, `has_send_media: !!t.has_send_media`, `needs_media_reupload: !!t.needs_media_reupload`.

**E-B2-12 · Block predicate** — `const isMediaBlocked = (tpl) => tpl && ["image","video","document"].includes(tpl.header_type) && !tpl.has_send_media;`

**E-B2-13 · Dropdown suffix** — SelectItem label appends `" • media required"` when `isMediaBlocked(t)`.

**E-B2-14 · Replace the dead amber warning (line 428-432)** with a red block banner when `isMediaBlocked(currentTemplate)`:
```jsx
<div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800" data-testid="campaign-media-block">
  ⛔ This template has a media header but no uploaded file — messages cannot send.{" "}
  <span className="underline cursor-pointer font-semibold" onClick={() => navigate("/templates")}>
    Go to Templates to re-upload
  </span>, then return here.
</div>
```

**E-B2-15 · Gate** — `const canStep2 = templateId && isFullyMapped(currentTemplate) && !isMediaBlocked(currentTemplate);`

---

## 3 · Verification matrix

| V | Case | Method |
|---|---|---|
| V-B2-1 | `GET /message-stats` returns `failed` + `media_missing` keys; counts match seeded rows; honours include_test/date range | pytest / curl |
| V-B2-2 | `GET /message-logs?status_note=media_missing` returns only G5 rows; without param behaviour byte-identical to pre-B.2 | pytest / curl |
| V-B2-3 | `GET /message-logs/export?status_note=media_missing` CSV row count matches list endpoint | curl |
| V-B2-4 | `/authkey-templates` items for templates with custom_templates rows carry `header_type/has_send_media/needs_media_reupload`; items without rows are unchanged | curl |
| V-B2-5 | Chip hidden at `media_missing=0`; visible with count when >0; click filters list; second click clears | Playwright (`media-missing-chip`) |
| V-B2-6 | `failed` row renders amber "Not Sent" badge + reason text (not yellow "Pending") | Playwright (`media-missing-reason-*`) |
| V-B2-7 | Wizard: media-blocked template shows "• media required" suffix, red banner, disabled Next | Playwright (`campaign-media-block`, `next-step2-btn` disabled) |
| V-B2-8 | Wizard: template WITH media (e.g. `sampletestlogo` post re-upload) shows no banner, Next enabled | Manual (Jeh's Nest tenant) |
| V-B2-9 | Regression: existing filters (status/campaign/run/search/dates/export) unchanged | Manual spot-check |
| V-B2-10 | G5 rows now written with `id`/`customer_name`/`template_name`; row expand + checkbox work | pytest insert-shape assert + manual |

Automation of V-B2-* lands in **B.4** alongside V15–V26.

---

## 4 · Effort & sequencing

| Step | Effort |
|---|---|
| Backend E-B2-1…5 | ~45 min |
| MessageStatusPage E-B2-6…10 | ~35 min |
| CampaignWizard E-B2-11…15 | ~25 min |
| Self-test (curl + screenshots) | ~20 min |
| **Total** | **~2 hrs** (matches B.1 §9 estimate) |

## 5 · DO NOT (this batch)

- Do NOT touch `send_bulk_messages` or any AuthKey payload construction
- Do NOT make `failed` rows resendable (D-B2-4 — deferred)
- Do NOT add a 6th stats card or alter the 5-card grid
- Do NOT change `_build_message_log_query` existing param semantics (CR-042 export parity)
- Do NOT send live WhatsApp messages during self-test

---

*End of CR-036 Batch B.2 plan — awaiting owner approval to open the Implementation gate.*
