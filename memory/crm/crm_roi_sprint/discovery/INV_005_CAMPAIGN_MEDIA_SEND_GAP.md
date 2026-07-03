# INV-005 — Campaign Sends Never Provide `media_url` to AuthKey

> **Type**: Investigation report
> **Role**: INVESTIGATION (Role 6)
> **Date**: 2026-07-03
> **Trigger**: Owner asked during CR-036 planning: "but exported templates are failing coz header is not going — is that case investigated?"
> **Related**: CR-036, CR-004, BUG-006, INV-004
> **Status**: 🔴 Confirmed — Meta-approved templates with media headers fail (or deliver header-less) when sent via CRM campaigns

---

## 1 · Hypothesis

Owner report: templates that were approved by Meta (created directly on Meta, or created in CRM and approved) fail to deliver the header image / video / document when sent by CRM campaigns.

Hypothesis: at SEND time, the CRM does not pass the header media to AuthKey. The AuthKey `sendBulkSMS.php` API requires the media URL to be provided in the request payload for each individual send, even for templates that already carry a Meta-approved sample. Meta's approval only stores the SAMPLE for compliance review; the ACTUAL media delivered to each customer must be supplied per-send.

---

## 2 · Evidence — code trace

### 2.1 · AuthKey send API expects `headerValues.headerData` per-send

`core/whatsapp.py:60-74` (`send_single_message`):

```python
payload = {
    "country_code": message.country_code.replace("+", ""),
    "mobile": message.phone.replace(" ", "").replace("-", ""),
    "wid": message.template_id,
    "type": "media" if message.media_url else "text",
    "bodyValues": message.body_values or {}
}

# Add media headers if present
if message.media_url:
    payload["headerValues"] = {
        "headerFileName": message.media_filename or "file",
        "headerData": message.media_url
    }
```

**Reading**: AuthKey's `sendBulkSMS.php` accepts `headerValues.headerData` = URL of the media asset. This is per-send state. Without it, the payload is `type: "text"` — even if the template on Meta's side has a MEDIA header format.

### 2.2 · Campaign send paths NEVER pass `media_url`

**Path 1 — normal send** (`routers/campaigns.py:274-280`):

```python
msg = WhatsAppMessage(
    phone=phone,
    country_code=country_code,
    template_id=template_id,
    body_values=body_values,
    customer_id=cust.get("id"),
)   # NOTE: no media_url, no media_filename
```

**Path 2 — test send** (`routers/campaigns.py:512-518`):

```python
msg = WhatsAppMessage(
    phone=phone,
    country_code=country_code,
    template_id=template_id,
    body_values=body_values,
    customer_id="test-recipient",
)   # NOTE: no media_url, no media_filename
```

**Path 3 — resend-failed** (`routers/campaigns.py:796-800`):

```python
messages.append(WhatsAppMessage(
    phone=phone, country_code=country_code,
    template_id=template_id, body_values=body_values,
    customer_id=cust.get("id"),
))  # NOTE: no media_url, no media_filename
```

**Confirmed by grep**: `grep -rn "media_url\|media_filename" backend/routers/campaigns.py backend/core/campaign_jobs.py` returns **zero hits**. Campaign code is completely media-blind.

### 2.3 · Event-triggered sends DO pass media_url (partial coverage)

`core/whatsapp.py:833-835` (`send_event_message` — used for order-triggered events like `send_bill`, `welcome_message`, `tier_upgrade`):

```python
result = await send_single_message(api_key, message)
...
media_url=ed.get("media_url"),
media_filename=ed.get("media_filename"),
```

Where `ed` = event data from the event → template mapping. So an event mapping CAN carry media_url. This is a separate code path from campaigns.

### 2.4 · Where the media_url IS stored (template records)

`routers/whatsapp.py:179` and `:218` — `custom_templates` documents store `media_url` per template:

```python
"media_url": payload.get("media_url", "")
```

So the DATA to fix this exists on the template record. It just isn't looked up and passed at campaign-send time.

### 2.5 · Empirical evidence — the screenshot

Owner-attached screenshot (Marketing > History):

```
bf Breakfast · premium_lunch_menu_new1 · Sent 2 · Delivered 0 · Read 0 · Failed 0 · 0.0% · Jul 2, 07:01 PM
```

Template name `premium_lunch_menu_new1` — a template that had a media header (inferred from name — user pattern shows `_new1` suffix on rebuilt-with-media versions). 2 sends, 0 delivered, 0 failed, 0.0% delivery rate.

The absence of "failed" alongside "0 delivered" is the tell: AuthKey returned success (message accepted for delivery) but Meta / WhatsApp dropped it at the outbound step because the template requires a media header that the payload didn't include. From CRM's point of view: sent OK. From customer's phone: nothing arrives.

---

## 3 · Root Cause

Two separate but linked gaps, each independently required for approved templates with media headers to work end-to-end:

### G5 (send-time) — Campaign sends don't attach media

The `WhatsAppMessage()` objects built in `routers/campaigns.py` (all 3 paths) don't populate `media_url` or `media_filename`. So AuthKey's `headerValues` block is never sent for campaign messages. Templates with media headers appear on Meta as "message accepted" but Meta's fulfilment step drops them.

### G6 (data-model gap) — No lookup from template → media at send time

Even if we tried to fix G5 by "just pass the template's media_url at send time", the template's stored `media_url` is:
- The URL the tenant pasted at template creation (broken today per INV-004 for Meta approval, but usable as a delivery-time asset URL IF it's publicly accessible),
- OR — after CR-036 ships — the Meta media handle string, which is NOT a valid `headerData` URL for the send API,
- OR — for templates imported from Meta via AuthKey sync — completely missing (line 711-733 of `whatsapp.py` back-fills `authkey_wid` and `status` only; never the media URL).

**Reality**: AuthKey's `headerData` field wants a public URL for each send (that's what the AuthKey docs describe as `headerData`). Meta's `header_handle` is a different field for a different purpose (template approval only). They are NOT interchangeable.

So the send-time media flow needs its own persistence:
- Template record needs a stable, publicly-accessible URL to send to customers (independent of the Meta approval handle).
- CR-036 solves approval. This gap (INV-005) solves delivery.

---

## 4 · Impact — who is affected?

| Template origin | Header type | Send via campaign | Send via event | Impact |
|---|---|---|---|---|
| Created in CRM · text-only header | text / none | ✅ works | ✅ works | None |
| Created in CRM · media header · REJECTED by Meta | image / video / doc | 🔴 template not approved — won't send at all | 🔴 same | Blocked by CR-036 approval |
| Created in CRM · media header · APPROVED (rare/legacy) | image / video / doc | 🔴 no media in payload — customer sees nothing | ⚠️ works IF event mapping supplies media_url | **INV-005** |
| Imported from Meta (created outside CRM) · media header · APPROVED | image / video / doc | 🔴 no media in payload — customer sees nothing | ⚠️ same as above | **INV-005** |
| Imported from Meta · text-only header | text / none | ✅ works | ✅ works | None |

**Owner's exact case is row 4** — imported/approved templates with media headers fail silently in campaigns.

---

## 5 · Corrections to earlier Planning claims

**CR-036 impact analysis** (`crm_roi_sprint/planning/BATCH_2026_07_03_IMPACT.md`) contained an incorrect assertion:

> "Scenario 1 · SENDING a message using an already-approved template ✅ NO IMPACT"

**This is wrong.** Sending an approved template with a media header via a campaign DOES fail (or delivers header-less), because `media_url` is never passed to AuthKey. The correct statement is:

> Sending an approved TEXT-ONLY template ✅ works today.
> Sending an approved MEDIA template ⚠️ silently drops the media unless the send path attaches a `headerData` URL (currently only event-triggered sends do this, and only if the event mapping carries it).

I will annotate the Impact doc with a correction reference to INV-005.

---

## 6 · Recommendation — scope split for CR-036

Split what was CR-036 into two parts. Ship them together (they're inseparable for the user story "media templates work end-to-end"):

### CR-036 Part 1 — **Template APPROVAL fix** (original CR-036 scope)

- New `POST /whatsapp/upload-media-header` endpoint (proxies to Meta `/uploads`)
- File picker replaces URL input in Template Builder
- Send `header_handle` (opaque Meta handle) in template submission
- Store the handle alongside `media_url` on `custom_templates`
- Meta approval works → template shows APPROVED status

### CR-036 Part 2 — **Send-time media DELIVERY fix** (new — INV-005 finding)

- On template record, store a **publicly accessible asset URL** (`send_media_url`) in addition to the Meta handle.
- Options for `send_media_url`:
  - **a. Reuse the file the user uploaded for Meta approval** — persist it to CRM object storage (S3-compatible), get a public URL, store as `send_media_url`. Media is served from CRM.
  - **b. Ask the user to also paste a public URL alongside the file upload** — dual-input UX (file for Meta + URL for delivery). Ugly.
  - **c. Use Meta's media-download endpoint** — Meta lets you fetch the media of an approved template. Requires per-tenant Meta creds at send time. Latency risk (extra API call per send).
- **Recommendation**: option (a) — CRM object storage. One upload → serves both approval sample and delivery asset. Storage cost minimal (media headers cap at ~5-100 MB per template; a tenant has tens to hundreds of templates).
- Campaign send code (`routers/campaigns.py` all 3 paths) — lookup template's `send_media_url` and pass to `WhatsAppMessage(media_url=..., media_filename=...)`.
- Event-triggered send path already has plumbing — just needs the event mapping to also inherit media from template if event doesn't override.
- **For legacy imported templates without a `send_media_url`**: display a "media re-upload required for delivery" banner on the Templates page → tenant uploads once → media persists.

### Effort revision

| Piece | Original CR-036 | With INV-005 |
|---|---|---|
| Upload endpoint | ~2 hr | Same |
| Template Builder UX | ~2.5 hr | Same |
| Payload wiring | ~0.5 hr | Same |
| Object storage integration (or Meta fetch) | 0 | +2-3 hr |
| Campaign send-time media resolution | 0 | +1-2 hr |
| Event-triggered send-time media resolution | 0 | +0.5 hr (small tweak) |
| Migration + banner for legacy templates | 0 | +1 hr |
| **Total** | **~5.5 hr** | **~10-12 hr** |

### Risk revision

- Original CR-036 : MEDIUM (touches HIGH-risk `routers/whatsapp.py` template creation section)
- CR-036 + INV-005: **MEDIUM–HIGH** (touches HIGH-risk `routers/whatsapp.py` template creation + HIGH-risk `routers/campaigns.py` send paths + possibly `core/whatsapp.py`'s event send path)

**Sensitive area**: `routers/campaigns.py` send paths are protected under §14 CRITICAL rules ("Do NOT change WhatsApp send/resend logic without testing"). This part specifically needs owner explicit approval.

**Mitigation**:
- Change is **additive** — passes an extra field to an existing constructor. Text-only templates behave identically. Only media templates get the new field.
- Fallback behaviour: if `send_media_url` is missing on a template record, log a warning and send text-only (not silently — surface in Message Status logs as "media_missing").
- Manual QA on Jeh's Nest tenant with a real approved media template before rolling out.

---

## 7 · Options for object storage

If we go with option (a) — CRM object storage:

| Option | Notes |
|---|---|
| **Emergent-managed object storage** | Playbook available via `integration_playbook_expert_v2`. Public URLs, auto-cleanup, no infrastructure cost to owner. Recommended default. |
| **AWS S3 direct** | `boto3` already in requirements.txt (unused per §15 Q8). Needs AWS credentials. More complex. |
| **Cloudflare R2** | Cheaper S3-compatible; needs setup. |
| **Meta media download at send time** | No CRM storage. Requires Meta API roundtrip per send. Latency + rate-limit risk. Not recommended for bulk campaigns. |

**Planning recommendation**: Emergent-managed object storage. Uses `integration_playbook_expert_v2` when we get to Implementation.

---

## 8 · Verification matrix additions (post-INV-005)

For CR-036 Part 2:

| # | Verification | How |
|---|---|---|
| V11 | Campaign send with approved media template delivers image | Manual QA on Jeh's Nest — send to owner's phone → confirm image received |
| V12 | Campaign send with approved TEXT template still works | Regression — no code path changes for text-only |
| V13 | Event-triggered send with media template delivers image | Manual test — trigger `send_bill` event → confirm image received |
| V14 | Template without `send_media_url` fallback path | Send with a legacy template lacking `send_media_url` → message logs show `status=media_missing` (or similar), no crash |
| V15 | Legacy templates banner shown on Templates page | Load Templates page as Jeh's Nest → banner visible on templates that lack `send_media_url` |
| V16 | Media URL persistence across sends | Upload once → 3 different campaigns using the same template each deliver the same media |
| V17 | Multi-tenant isolation | Tenant A's media file not accessible via Tenant B's URL |

---

## 9 · Next steps

1. Update `CR_STATUS_DASHBOARD.md` — CR-036 status refreshed with INV-005 scope expansion.
2. Amend `BATCH_2026_07_03_IMPACT.md` with a correction note pointing to INV-005.
3. Await owner decision:
   - **Q6 (new)** — object storage choice (Emergent-managed vs S3 vs Meta-download).
   - **Q7 (new)** — fallback for templates missing `send_media_url` (silent-degrade to text? block-and-warn? send-and-log?).
   - **Q8 (new)** — explicit hotspot approval for `routers/campaigns.py` send paths (per §CRM-SPECIFIC OWNER APPROVAL).
   - Reconfirm CR-036 Q1-Q5 from earlier round.

---

## 10 · Recommendation to owner

**Investigation Report: Confirmed — you are correct.**

Approved templates with media headers do NOT deliver the media when sent via CRM campaigns today. This is a separate defect from the CR-036 approval issue, though both feed into the same user-visible symptom ("media templates don't work"). Fixing only CR-036 would let owners CREATE approved media templates but they'd still fail to deliver via campaigns.

Recommend expanding CR-036 to include the send-time media delivery fix (Part 2 above). Effort roughly doubles (~5.5 hr → ~10-12 hr) and risk goes up one notch (MEDIUM → MEDIUM–HIGH) because we touch the campaign send path. But this is what "media templates working" actually means for the end user.

Awaiting your call on scope + object storage choice + hotspot approval for `routers/campaigns.py`.

---

*End of INV-005. No code changes. Read-only investigation.*
