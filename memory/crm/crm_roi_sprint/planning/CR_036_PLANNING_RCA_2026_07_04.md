# CR-036 Planning RCA & Replan — 2026-07-04

> **Role**: PLANNING (retrospective + forward-looking gap analysis)
> **Trigger**: Owner asked "recheck how it's missed in planning and replan" after CR-036 scope ballooned 3x during execution (5.5 hr → 16-20 hr).
> **Method**: Read original discovery doc (2026-07-01) → compare to what INV-005 + INV-006 later revealed → identify root causes → re-audit Batch B plan for still-unknown gaps.
> **Scope**: Retro on Parts 1+2 planning + Batch A gap that shipped + Batch B replan.

---

## 1 · Timeline of scope expansion

| Date | Event | Effort estimate |
|---|---|---|
| 2026-07-01 | CR-036 discovery written from INV-004 Issue 3. Scope: media header approval fix only. | **5.5 hrs** |
| 2026-07-03 | INV-005 found send-time gap: `campaigns.py` never passes `media_url` to `WhatsAppMessage()`. Part 2 added. | 10-12 hrs |
| 2026-07-04 | Owner asked for full upload-surface audit → INV-006 found bill logo + invoice HTML/PDF using same pattern. Parts 3+4 added. | **16-20 hrs** |
| 2026-07-04 | Batch A shipped (core/s3.py + Part 3 + Part 4). | Batch A ~5 hrs done · Batch B ~11-15 hrs pending |

**Actual scope**: **3.6x the original estimate**. Root-cause analysis below.

---

## 2 · Root causes (why the original plan under-scoped)

### RC1 · Symptom-scoped discovery, not pattern-scoped
The 2026-07-01 discovery was framed around the **reported bug** ("Meta rejects templates with URL header") rather than the **underlying pattern** ("this codebase has multiple upload surfaces relying on ephemeral local storage"). The 3 Q's at the bottom of the discovery doc (`Q1 media types? Q2 max size? Q3 permanent storage vs pass-through?`) only interrogated the reported symptom, never asked *"what else does this codebase do with files?"*

**Fix for future planning**: every CR whose scope touches file storage MUST include a codebase-wide grep audit at discovery time (like INV-006 did retroactively). Search terms: `UploadFile`, `write_bytes`, `write_text`, `open(.*'w`, `FileResponse`, `StaticFiles`, `/app/data`, `/uploads`.

### RC2 · Q3 asked the wrong question
Discovery Q3: *"Should CRM store the uploaded file permanently, or just pass-through to Meta?"* Owner answered **pass-through**. That answer was correct for template approval flow BUT was NOT the right question — the right questions were 3 separate ones:
- Q3a · Do we need Meta handle for approval? (Yes)
- Q3b · Do we need a permanent public URL for AuthKey send-time delivery? **(Never asked. Answer: YES. Missing this caused INV-005.)**
- Q3c · Where should the permanent URL live? (Never asked. Later answered: S3.)

**Fix for future planning**: any CR involving 3rd-party integrations MUST enumerate every downstream consumer of the artifact, not just the immediate producer. In CR-036, the artifact is the media URL; consumers are Meta (approval) AND AuthKey (send-time). Both must be surfaced during discovery.

### RC3 · "Hotspot files touched: 0" was factually wrong
Line 121 of the discovery doc: `Hotspot files touched: 0`. But even Part 1 (approval endpoint) touches `routers/whatsapp.py`, which IS on the hotspot list. This was only surfaced during BATCH_2026_07_03_IMPACT analysis, requiring a fresh Q8 owner-approval gate on 2026-07-03.

**Fix for future planning**: discovery MUST cross-check against the hotspot registry (`HOTSPOT_FILES.md` if it exists — need to create if it doesn't). If any changed file is a hotspot, discovery must flag it AND include the pre-computed owner-approval question as one of the discovery Q's.

### RC4 · No parallel-integration-audit before estimating effort
Original 5.5 hrs assumed a simple 2-endpoint change. Reality required integrations with:
- Meta Graph API `/uploads` (resumable upload flow, NOT a simple POST — discovered later)
- AuthKey `sendBulkSMS.php` with `headerValues` block (INV-005 finding)
- AWS S3 (from Q6 answer 2026-07-03)
Each integration adds ~1-2 hrs (client + error handling + retry) that discovery didn't budget for.

**Fix for future planning**: whenever discovery mentions a 3rd party, effort estimate MUST include 2 hrs per integration for playbook lookup + error paths + retry logic. And `integration_playbook_expert_v2` MUST be called at discovery time, not implementation time, so its detailed steps become part of the plan.

### RC5 · Effort estimation didn't account for frontend UX complexity
Original discovery said "Frontend file picker + preview in Template Builder: ~2 hours". Reality — with Meta-creds check per Q5, upload progress bar, error handling, silent-degrade banner for legacy templates, per Q1 support for image AND video AND document AND audio (4 file pickers per template) — is closer to ~6-8 hrs.

**Fix for future planning**: for any frontend change involving file upload, use the multiplier `estimate × 3` unless the discovery explicitly enumerated all UI states (idle, uploading, progress, error, uploaded, re-upload, legacy-warning).

### RC6 · No consideration of the "legacy fleet" problem at discovery time
When the pattern is refactored (URL text → S3 handle), the discovery didn't ask: *"what happens to templates already approved with the OLD URL format?"* Q7 (silent-degrade) was added on 2026-07-03 only because INV-005 forced the question.

**Fix for future planning**: for any refactor of a data field's format, discovery MUST include a "legacy fleet" question: how many rows currently have the old format, what happens to them, do they need re-upload, is there a migration script or accept-lose-them?

---

## 3 · Batch A GAP FOUND — invoice PDF + legacy logo URL

While doing this RCA I discovered a **real gap in what I just shipped in Batch A**.

### 3.1 · The gap
- Batch A / Part 4: `_generate_pdf` uses `base_url = "https://<bucket>.s3.<region>.amazonaws.com/invoices/{token}/"` when S3 is configured (Q11).
- Invoice templates (`templates/invoice_food.html:101`, `invoice_hotel_folio.html:96`, `invoice_hotel_room.html:100`) all render `<img src="{{ logo_url }}">`.
- `logo_url` comes from `bs.get("bill_logo_url", "")` inside `invoice_generator.py:196` + `:461`.
- For **legacy tenants** whose `bill_logo_url = "/api/auth/profile/logo/{user_id}"` (they haven't re-uploaded since CR-036 shipped), WeasyPrint will treat the leading-slash path as absolute-to-host relative to the S3 base_url → resolve to `https://<bucket>.s3.<region>.amazonaws.com/api/auth/profile/logo/{user_id}` → **404 from S3** → PDF renders WITH NO LOGO for legacy tenants.

### 3.2 · Severity
- **Impact**: Legacy tenants (any tenant who uploaded a bill logo BEFORE CR-036 shipped) will have their invoice PDFs render without the logo. HTML view via `/api/invoices/{token}` unaffected (still served by backend, browser resolves `/api/...` correctly to same-origin).
- **Blast radius**: Every existing tenant with a bill logo. Precise count needs a DB query. Preview pod today shows 0 tenants have a `bill_logo_url` set for the primary test tenant (we unset it after Batch A smoke test), so preview escapes this. **Production tenants will be affected the moment CR-036 ships if any have set a logo.**
- **Detection**: Tenants may not notice for hours/days (invoices generated but visually degraded).

### 3.3 · Fix (Batch A patch, low risk, ~10 LOC)
In `services/invoice_generator.py`, pre-resolve `bill_logo_url` to a full absolute HTTPS URL before passing to Jinja:

```python
def _resolve_logo_url(bill_logo_url: str) -> str:
    if not bill_logo_url:
        return ""
    if bill_logo_url.startswith("http://") or bill_logo_url.startswith("https://"):
        return bill_logo_url  # already absolute (S3 URL or external)
    # Legacy relative path — prepend backend base URL for absolute resolution
    backend_url = os.environ.get("PUBLIC_BACKEND_URL", "").rstrip("/")
    if not backend_url:
        return bill_logo_url  # fallback (may 404 in PDF but at least HTML works)
    return f"{backend_url}{bill_logo_url}"
```

Then in both callsites (line 196 + line 461):
```python
logo_url = _resolve_logo_url(bs.get("bill_logo_url", ""))
```

**Missing env var** `PUBLIC_BACKEND_URL`: current `.env` doesn't have this. I'd add it as a placeholder alongside AWS keys. It should equal the preview URL in preview and the prod URL in prod.

**Verification**: (i) legacy tenant with `bill_logo_url = "/api/auth/profile/logo/xxx"` → PDF generated with S3 base_url → `<img src="https://<preview-url>/api/auth/profile/logo/xxx">` → WeasyPrint fetches over HTTPS → logo renders ✅. (ii) new tenant with S3 logo URL → unchanged, still absolute HTTPS → renders ✅.

### 3.4 · Recommendation
Patch this BEFORE Batch B ships. Ship as a mini "Batch A.1" — 1 file (`invoice_generator.py`) + 1 env var. ~15 min.

---

## 4 · Batch B replan — 12 gaps I've now identified in the current plan

The existing `CR_036_MEDIA_TEMPLATE_APPROVAL_AND_DELIVERY_IMPL_PLAN.md` is 800 lines and covers a LOT, but the following gaps are either implicit, ambiguous, or unstated. Owner needs to answer these before Batch B implementation begins.

### 4.1 · Meta API gaps

**G1 · Meta `/uploads` is a resumable upload API, not a simple POST**
The original discovery Step 1 (line 55) shows a simple `POST {WABA_ID}/uploads` returning `{"h": "4:abc"}`. That's an oversimplification. Real Meta docs specify:
- Step A: `POST /{app_id}/uploads` to create an upload session (returns session ID)
- Step B: `POST /{session_id}` with `file_offset: 0` header + binary body → returns handle `h`
- Some Meta docs mention `POST /{waba_id}/media` for direct media upload (returns `id`, NOT `h`)

**Which endpoint should we use?** Impl plan doesn't specify. **Action**: call `integration_playbook_expert_v2` with query "Meta WhatsApp Cloud API — media upload for template header handle 2026" BEFORE writing Part 1 code.

**G2 · Meta handle expiry**
Meta handles for `header_handle` example expire after **30 days**. If a template sits in Meta review beyond 30 days, resubmission requires a fresh upload. Impl plan doesn't cover re-approval flow. **Q for owner**: if a template goes stale in review, is that a rare edge case (accept 400 from Meta) OR do we auto-retry with fresh upload?

**G3 · Meta credentials pre-check (Q5 block-early UX)**
Impl plan says "block early if Meta creds missing" but doesn't specify HOW frontend knows. Options:
- (a) New endpoint `GET /api/whatsapp/meta-status` → `{configured: bool}`
- (b) Frontend reads `pos_config` from `/auth/login` response (already returned)
- (c) 400 on first upload attempt with error banner

Recommend (a) or (b). Doc doesn't lock this down.

### 4.2 · Send-flow gaps (Part 2)

**G4 · AuthKey routing for media messages may differ from text**
`core/whatsapp.py` builds `headerValues` when `media_url` is set. But does AuthKey's `sendBulkSMS.php` handle text and media in the same endpoint? Some WhatsApp aggregators route to different endpoints (`/text` vs `/media`). **Action**: grep `core/whatsapp.py` for AuthKey URL logic + verify.

**G5 · Silent-degrade behaviour for legacy templates**
Q7 says silent-degrade + `status_note="media_missing"`. But WHAT is silent-degrade exactly?
- Option A: Don't send at all (row marked failed, no cost)
- Option B: Send text-only (drop the header), row marked delivered, low customer confusion
- Option C: Send with old URL-as-header (may or may not work with AuthKey)

Impl plan says silent-degrade but doesn't say WHICH of A/B/C. **Q for owner**: A, B, or C?

**G6 · `status_note` field on `whatsapp_message_logs`**
Does this column exist today? If not, this is a schema addition. **Action**: grep for `status_note` in existing code — if absent, add to write-plan.

### 4.3 · Frontend gaps (Part 1)

**G7 · Multi-media-type file picker**
Q1 answer: Image + Video + Document + Audio. Current Template Builder has ONE header type selector + ONE URL input. Amended UI needs:
- If header_type == IMAGE → file picker with `accept="image/jpeg,image/png"`
- If header_type == VIDEO → file picker with `accept="video/mp4"`
- If header_type == DOCUMENT → file picker with `accept="application/pdf"`
- If header_type == AUDIO → file picker with `accept="audio/mpeg,audio/ogg"`
- Preview widget per type (thumbnail for image, video controls for video, PDF icon for document, audio player for audio)

Effort under-estimated in original plan.

**G8 · Upload progress UX**
For large files (up to 100 MB for video), the upload can take 10-60 seconds. Impl plan doesn't specify progress indicator. Recommend: show progress bar during S3 upload AND separate progress during Meta upload (two-step). ~1 hr.

**G9 · "Re-upload required" banner on Templates page**
Q7 legacy-template UX: how does the tenant learn their old templates need re-upload? Impl plan mentions banner but doesn't spec placement or copy. Recommend: yellow warning card on TemplatesPage top when any template has `send_media_url IS NULL AND header_type IN (IMAGE,VIDEO,DOCUMENT,AUDIO)`.

### 4.4 · Data-model gaps

**G10 · Template cloning behaviour**
Users can clone templates from a Message Central catalog per handoff summary. If Tenant A owns a template with S3 key `media-headers/tenant_a/xyz.jpg`, and Tenant B clones it → should Tenant B:
- Reference the same S3 URL (cross-tenant read)? → simpler but violates prefix-per-tenant isolation
- Re-upload the media to their own S3 prefix? → duplicate storage but clean isolation

**Q for owner**: shared reference OR duplicate upload on clone?

**G11 · Template deletion cleanup**
When a template is deleted, do we also delete the S3 object? Impl plan doesn't say. Recommend: delete S3 object on template deletion (calls `_s3.delete_object`). ~5 LOC. Cheaper storage.

**G12 · Meta credentials check on delivery**
If `custom_templates.send_media_url` is set but the tenant's Meta creds have been revoked/rotated since template approval — what happens? The `headerValues` is passed to AuthKey which fetches the S3 URL server-side (no Meta creds involved at send time), so this SHOULD work — but plan doesn't confirm.

---

## 5 · Recommended Batch B execution order (updated)

Given the gaps, I recommend Batch B be sub-phased:

**Batch B.0 · Prep (30 min, owner-input needed)**
- Owner answers G2, G5, G10 (which choice?)
- Call `integration_playbook_expert_v2` for Meta `/uploads` playbook (G1)
- Confirm G4 (AuthKey routing for media messages) via code inspection
- Confirm G6 (does `status_note` exist on `whatsapp_message_logs`?)

**Batch B.1 · Backend — Part 1 approval flow (3-4 hrs)**
- `core/meta_media.py` — new module for Meta `/uploads` resumable upload (isolated, testable, playbook-driven)
- `POST /api/whatsapp/upload-media-header` — chains S3 upload + Meta upload, returns `{s3_url, header_handle}`
- Update template creation to persist `send_media_url` + `header_handle` on `custom_templates`
- Meta creds status endpoint (G3)

**Batch B.2 · Backend — Part 2 send delivery (2 hrs)**
- 3 send paths in `campaigns.py` fetch `send_media_url` + `header_type` from `custom_templates`
- Silent-degrade branch per G5 owner choice
- `status_note` column added if missing (G6)
- Template deletion cleanup (G11) — small add

**Batch B.3 · Frontend — Template Builder (5-6 hrs)**
- Multi-type file picker (G7)
- Upload progress UX (G8)
- Re-upload banner on TemplatesPage (G9)
- Meta creds pre-check block-early (G3)

**Batch B.4 · Testing (2 hrs)**
- pytest for Meta upload + S3 upload + send-flow
- Playwright for file picker + progress + banner
- Live test: real WhatsApp send with real media (owner approval required per rules)

**Revised Batch B total**: 12-14 hrs (was implicitly ~11-15 in prior estimate).

---

## 6 · Corrective actions applied to future planning

I'm adding these to my mental checklist for every future CR:

1. **Discovery checklist**: file-storage grep, hotspot cross-check, downstream-consumer enumeration, "legacy fleet" question, integration playbook call at discovery time.
2. **Effort multiplier**: 3x on frontend upload UX, +2 hrs per 3rd-party integration for playbook + error paths.
3. **Q hygiene**: NEVER ask a compound question ("A or B?") without listing implications of each choice.
4. **Scope-drift log**: whenever a CR grows more than 1.5x, write a doc explaining WHY (like this one).
5. **Batch review**: before shipping any batch, self-review for cross-cutting concerns (legacy tenants, dual-mode fallbacks, retro-compat with existing data).

---

## 7 · Immediate action items (in priority order)

- [ ] **A · Owner review** of this doc — confirm root causes + patch plan (5 min read)
- [ ] **B · Batch A.1 patch** — fix invoice PDF logo resolution for legacy tenants (15 min, 1 file)
- [ ] **C · Batch B.0 prep** — owner answers G2, G5, G10 + I call Meta playbook (30 min)
- [ ] **D · Batch B.1 → B.4** — execution per §5 (~12-14 hrs)
- [ ] **E · Retro** — update discovery template with checklist from §6 so future CRs don't repeat these mistakes

---

*End of RCA. All observations here are honest self-critique. No production impact from Batch A (preview only, no legacy logos in test tenant). Fix for Batch A.1 is small + surgical.*
