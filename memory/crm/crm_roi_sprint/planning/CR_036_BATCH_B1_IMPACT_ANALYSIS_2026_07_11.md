# CR-036 · Batch B.1 · Impact Analysis (delta over 2026-07-03 impl plan)
**Date**: 2026-07-11
**Author**: Investigation → Planning role handoff
**Status**: 🟢 CLOSED — all owner decisions locked (Q15-Q19). Ready for Implementation gate.
**Supersedes**: N/A (delta over `CR_036_MEDIA_TEMPLATE_APPROVAL_AND_DELIVERY_IMPL_PLAN.md` + `CR_036_SCOPE_AMENDMENT_2026_07_04.md`)
**Companion decisions**: `DECISIONS_LOG.md § 2026-07-11 [CR-036] §q14-revert` and `§q15-through-q19`

---

## 1 · Purpose

Batch A / A.1 / B.0 / B.0.1 of CR-036 are shipped and verified. What remains — Batches **B.1 – B.4** — was scoped in the 2026-07-03 impl plan and 2026-07-04 amendment, but two events since have altered its shape:

1. **Q14 revert (2026-07-11)** — Meta APP_ID model reverted from per-tenant back to shared-env with optional override. Validated live against Meta with 3 tenant tokens.
2. **New gaps surfaced by scenario-matrix analysis** — the owner asked whether Batch B.1 truly covers "all cases" (imported-from-AuthKey templates, direct-Meta-creation templates, edits on approved templates, test-send behavior, dynamic headers). Analysis surfaced 5 previously-uncatalogued gaps requiring owner decision (Q15-Q19).

This document formalizes the delta so Planning has a clean gate to open Implementation against.

---

## 2 · Scenario matrix — template origin × send path

| # | Origination path | `send_media_url` post-arrival | `header_handle` | Campaign send | Event send | Test send | Batch B.1 status |
|---|---|---|---|---|---|---|---|
| A | CRM Template Builder (post-B.1) — user picks file, CRM uploads to Meta `/uploads` + S3 | ✅ S3 URL | ✅ Meta handle | ✅ works | ✅ works (via Gap-L addendum) | ✅ works | ✅ **Primary supported path** |
| B | Direct Meta Business Manager creation → surfaced via AuthKey sync | ❌ NULL | ❌ NULL | ⛔ G5 fail-loud (`status_note=media_missing`) | ⛔ same | ⛔ same | ⚠️ **Q15-(a) accepted** — user re-uploads via Q15-(c) inline button |
| C | AuthKey `getAllTemplate.php` sync (`POST /whatsapp/authkey/sync-templates`) | ❌ NULL (sync only back-fills `authkey_wid`) | ❌ NULL | ⛔ G5 fail-loud | ⛔ same | ⛔ same | ⚠️ **Same as B — Q15-(a)+(c)** |
| D | AuthKey-only (no local `custom_templates` row) | N/A | N/A | ⛔ Cannot be sent (campaign needs local row) | ⛔ same | ⛔ same | 🚫 **Pre-existing gap — out of scope for CR-036** |
| E | Legacy CRM-built pre-B.1 with old `media_url` text | ❌ NULL | ❌ NULL | ⛔ G5 fail-loud (was silent-drop) | ⛔ same | ⛔ same | 🟡 **G5-locked** (behavior improvement — surfaces silent failure) |

---

## 3 · Gap register (13 gaps identified, resolutions locked)

| Gap | Description | Owner decision | Implementation impact |
|---|---|---|---|
| A | Templates from Path B/C arrive without `send_media_url` → send fails | **Q15-(a)+(c)** — accept re-upload UX + add inline "Re-upload media" button on TemplatesPage row | +50 LOC frontend (button + modal + upload handler); no backend change beyond existing `POST /whatsapp/upload-media-header` |
| B | Path D — AuthKey-only templates never enter `custom_templates` | Out of scope for CR-036 | No change |
| C | Legacy CRM-built templates silent-drop → G5 loud-fail | G5-locked (2026-07-04) | Migration one-shot flags them |
| D | Media-edit on APPROVED template — currently allowed silently | **Q16-(a)** — block with 400 "Cannot edit media on approved template; clone instead" | +10 LOC in `PUT /custom-templates/{id}` |
| E | Test-send with media template — what URL to use? | **Q17-(a)** — auto-inject stored `send_media_url`; frontend drops media picker (shows preview only) | +5 LOC backend `POST /whatsapp/test-template` + ~20 LOC frontend modal |
| F | Dynamic `{{1}}` header URL variable | **Q18-(a)** — OUT OF SCOPE. Reject `{{n}}` in header_content for media header types with 400 | +5 LOC validator |
| G | Audio removal from Template Builder (Q13 lock) | Confirmed still-in-scope for B.1 | ~5 LOC frontend header_type dropdown filter |
| H | AuthKey `sendBulkSMS.php` `headerValues.headerData` acceptance | INV-005 confirmed S3 HTTPS URL accepted | No change |
| I | S3 unreachable at send time | Not our failure (AuthKey/Meta fetch) | Log-only |
| J | Meta handle expiry mid-approval (30-day) | G2-locked auto-retry | Already in plan |
| K | Cross-tenant clone with media (S3 copy) | G10-locked | Already in plan |
| L | Event-triggered send (`send_event_message`) needs template-media fallback | **Q19 APPROVED** — 5 LOC additive edit to `core/whatsapp.py::send_event_message` | +5 LOC |
| M | Resolver contract post-Q14-revert | Env-first with optional per-tenant override | Locked in `core/meta_media.py` design |

---

## 4 · Locked resolver contract (Q14-revert)

```python
# backend/core/meta_media.py
import os
from fastapi import HTTPException

def resolve_meta_app_id(user: dict) -> str:
    """
    Env-first Meta APP_ID resolver.
    Per DECISIONS_LOG § 2026-07-11 [CR-036] §q14-revert.

    Order:
      1. user['meta_app_id']   → per-tenant override (dormant for all 6 current tenants;
                                  future-proofing for direct-Meta clients or AuthkeyP outlier
                                  if AuthKey re-architects)
      2. os.environ['META_APP_ID']   → AuthKey's shared Meta Business App id (default path)
      3. neither present       → HTTPException(503, "Meta App ID not configured...")
    """
    override = (user.get('meta_app_id') or '').strip()
    if override:
        return override
    env_val = (os.environ.get('META_APP_ID') or '').strip()
    if env_val:
        return env_val
    raise HTTPException(
        status_code=503,
        detail="Meta App ID not configured. Contact admin or set an override in Settings → WhatsApp Configuration.",
    )
```

Validated against live Meta responses on 3 tenants (2026-07-11 probe log in `DECISIONS_LOG.md § q14-revert PROBE OUTCOME`).

---

## 5 · Files-will-change lock

| File | Type | Change summary | ~LOC | Hotspot? |
|---|---|---|---|---|
| `backend/core/s3.py` | **NEW** | boto3 wrapper, `S3_CONFIGURED` flag, `upload_bytes()`, `get_public_url()`, `copy_object_across_prefix()` for clone | ~120 | N/A |
| `backend/core/meta_media.py` | **NEW** | Q14-revert resolver + `upload_file_to_meta_uploads(user, file_bytes, mime)` 2-step Meta `/uploads` helper | ~90 | N/A |
| `backend/routers/whatsapp.py` | EDIT | + `POST /whatsapp/upload-media-header` endpoint (~90 LOC) · patch `build_meta_template_payload` L490-495 to send `header_handle` array not raw URL · patch `sync-templates` to log `send_media_url` absence for imported templates (Gap A) · patch `PUT /custom-templates/{id}` (Q16-a 400) · reject `{{n}}` in media-header content (Q18-a) · audio removal validator (Gap G) · patch `POST /whatsapp/test-template` (Q17-a auto-inject) | +140 / -12 | ✅ Q8 (2026-07-03) |
| `backend/routers/campaigns.py` | EDIT | Wire `media_url=template.send_media_url` into all 3 `WhatsAppMessage()` sites (L274, L512, L796) · pre-send G5 gate (skip + log `status_note=media_missing` when media header AND `send_media_url` empty) | +45 | ✅ Q8 (2026-07-03) |
| `backend/core/whatsapp.py` | EDIT | +5 LOC in `send_event_message` — fallback `media_url = event_map.media_url or template.send_media_url` | +5 | ✅ Q19 |
| `backend/models/schemas.py` | EDIT | + `Optional[str] status_note = None` on `MessageLog` (G6) · + `send_media_url`, `header_handle`, `needs_media_reupload` on `CustomTemplate` | +15 | Additive |
| `backend/migrations/cr036_flag_legacy_media_templates.py` | **NEW** | One-shot: `custom_templates.update_many({header_type: {$in: [IMAGE, VIDEO, DOCUMENT]}, send_media_url: {$in: [null, ""]}}, {$set: {needs_media_reupload: true}})` | ~15 | N/A |
| `backend/tests/test_cr036_batch_b1.py` | **NEW** | ~16 pytest cases (see §7 V-matrix) | ~260 | N/A |
| `frontend/src/pages/TemplateBuilderPage.jsx` | EDIT | Replace URL Input with FileInput (drag+drop) · size cap 5MB image / 16MB video / 100MB doc · preview thumb · block-early banner if Meta creds missing · remove audio option (Q13/Gap G) · client-side `{{n}}` block for media headers (Q18-a) | +120 / -20 | N/A |
| `frontend/src/pages/TemplatesPage.jsx` | EDIT | Add "N templates need media re-upload" summary banner + per-row **Re-upload** button (Q15-c) opening lightweight file-picker modal → `POST /whatsapp/upload-media-header` → refetch list | +55 | N/A |

**WILL NOT touch**:
- `core/whatsapp.py::send_bulk_messages` — core AuthKey payload construction unchanged
- `core/coupon.py`, `core/loyalty.py`, `routers/pos.py`
- Auth/login/SSO flows
- `whatsapp_message_logs` existing fields (BUG-006 lock) — only additive `status_note`
- Existing `sync-templates` back-fill logic for `authkey_wid` / `status`
- Batch B.0.1 backend endpoints `GET/PUT /whatsapp/api-key` — only frontend Settings label change ("Meta App ID (optional override)")

---

## 6 · Downstream consumer analysis

| Consumer | Impact | Action |
|---|---|---|
| Campaigns page (frontend) | Currently unaware of media template state. Post-B.1, `custom_templates` row includes `needs_media_reupload`. Campaign send-config wizard should surface a warning if selected template needs re-upload. | Small tooltip addition — ~5 LOC |
| WhatsApp Reports page | New `status_note` field appears on failed message logs. Add filter chip "Failed: media_missing" for triage. | ~10 LOC |
| POS webhook handlers (`routers/pos.py`) | Trigger event sends via `send_event_message`. Q19 addendum ensures media falls back to template. No handler change. | Zero LOC |
| MyGenie SSO / auth | Untouched | Zero LOC |
| Object storage (`core/object_storage.py` if present) | S3 wrapper is new — check no duplicate boto3 client | Confirm at Impl gate |
| Test infrastructure | pytest suite grows; new tests use mocked `httpx` calls to Meta + moto for S3 (or a real dev bucket per S3_CONFIGURED). | Ensure boto3-stubs+moto in requirements-dev |

---

## 7 · Verification matrix (V1-V26 consolidated)

| # | Verification | Method |
|---|---|---|
| V1-V10 | Original Batch A/A.1/B.0 checks (template create/approve/logo render) | Already ✅ (2026-07-04) |
| V11-V14 | INV-005 send-time defect checks | Await Impl |
| V15 | Resolver env-fallback (empty override) | Unit — `resolve_meta_app_id({'meta_app_id':''}) == env['META_APP_ID']` |
| V16 | Resolver override (populated field) | Unit — `resolve_meta_app_id({'meta_app_id':'999'}) == '999'` |
| V17 | Resolver 503 (both empty) | Unit — raises `HTTPException(503)` |
| V18 | Path B/C send-time fail-loud | Integration — insert template row w/o `send_media_url`, header_type=IMAGE; run campaign; assert log has `status='failed', status_note='media_missing'` |
| V19 | TemplatesPage banner + Re-upload button visible for Path B/C templates | Playwright — login, seed template w/o media, load page, assert `[data-testid=media-reupload-banner]` and `[data-testid=media-reupload-btn-{id}]` |
| V20 | AuthKey sync does NOT populate `send_media_url` | Integration — POST `/whatsapp/authkey/sync-templates`; assert DB rows have `authkey_wid` set but `send_media_url` NULL |
| V21 | PUT media on approved template → 400 (Q16-a) | curl — PUT with status=approved + new header_content; expect 400 with locked message |
| V22 | Test-send auto-injects stored `send_media_url` (Q17-a) | Integration — POST `/whatsapp/test-template` on media template; capture AuthKey outbound payload; assert `headerValues.headerData == template.send_media_url` |
| V23 | Audio removed from Template Builder | Playwright — assert header_type dropdown options are exactly [none, text, image, video, document] |
| V24 | 3 campaign send paths propagate media_url | Static — grep confirms `WhatsAppMessage(..., media_url=...` at each site |
| V25 | Event send falls back to template.send_media_url (Q19) | Integration — trigger event where mapping has empty `media_url`; assert AuthKey payload has `headerData` = template's send_media_url |
| V26 | Clone across tenants — S3 copy + fresh Meta handle | Integration — clone template as tenant B; assert new S3 key under `media-headers/{tenant_b.id}/...` and new `header_handle` from fresh `/uploads` |

---

## 8 · Open blockers post-analysis

**None.** All previously-blocking questions are resolved:

| Historic blocker | Status |
|---|---|
| Per-tenant Meta APP_IDs | ✅ **Eliminated** (Q14-revert + probe validated) |
| AWS S3 credentials | ✅ **Provided** — `.env` shows real values (not placeholder as previously believed) |
| Q15-Q19 gap decisions | ✅ **Locked** (2026-07-11) |
| Hotspot approvals for whatsapp.py + campaigns.py | ✅ Q8 (2026-07-03) |
| Hotspot approval for core/whatsapp.py::send_event_message | ✅ Q19 |

---

## 9 · Estimated implementation time

| Batch | Scope | Effort |
|---|---|---|
| B.1 backend | `core/s3.py` + `core/meta_media.py` + `POST /upload-media-header` + resolver | 3 hrs |
| B.1 code integrations | `whatsapp.py` template payload + `sync-templates` logging + `PUT` block + test-send + audio + validators | 2 hrs |
| B.1 campaigns wiring | 3 send paths + G5 gate | 1 hr |
| B.1 event send fallback (Gap L) | `core/whatsapp.py` +5 LOC | 15 min |
| B.1 schema + migration | Model updates + one-shot flag script | 30 min |
| B.1 frontend | TemplateBuilder file picker + TemplatesPage banner + Re-upload modal + Settings label | 3 hrs |
| B.1 tests | pytest V15-V26 + Playwright V19/V23 | 3 hrs |
| Verification / manual E2E | jehsnest tenant real send with real image | 30 min |
| **Total** | | **~13 hrs** (single-session shippable) |

---

## 10 · Implementation gate opens

Once owner says **"start B.1"**, Planning hands off to Implementation with:

- This impact analysis (§5 file-lock, §7 V-matrix, §4 resolver contract)
- Original 800-line impl plan (`CR_036_MEDIA_TEMPLATE_APPROVAL_AND_DELIVERY_IMPL_PLAN.md`) — 95% valid, resolver section supersedes original per §4
- DECISIONS_LOG entries: §q14-revert + §q15-through-q19
- Test tenant `owner@jehsnest.com / Qplazm@10` for E2E

No further planning artifacts needed.

---

*End of Impact Analysis · CR-036 Batch B.1 · 2026-07-11*
