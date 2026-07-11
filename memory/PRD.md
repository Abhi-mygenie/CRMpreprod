# MyGenie CRM — Project Documentation

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git (main branch) into /app. Preserve all platform files. Stack: React + Python (FastAPI) + MongoDB. Build as-is. Then implement CR-036 Batch B.1 (WhatsApp media header upload, approval, delivery).

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI + Craco (path aliases @/)
- **Backend**: FastAPI with modular routers (auth, customers, points, wallet, coupons, feedback, whatsapp, pos, migration, analytics, scan, menu, suggestions, invoices, campaigns)
- **Database**: MongoDB via Motor (async driver) — remote at `52.66.232.149:27017/mygenie`
- **Scheduler**: APScheduler for loyalty jobs and campaign processing
- **Storage**: AWS S3 (`mygenie-prod` bucket, `ap-south-1`) for media headers, bill logos, invoices

## User Personas
- **Restaurant Owner/Staff**: Login via MyGenie SSO, manage customers, loyalty, coupons, campaigns, WhatsApp templates
- **POS System**: API-key authenticated, sends orders/customer data to CRM
- **Customer**: QR scan registration, receives WhatsApp messages

## Core Requirements (static)
- CRM for restaurant loyalty, coupons, WhatsApp marketing, POS integration
- WhatsApp template builder with Meta approval flow
- Campaign engine for bulk WhatsApp sends
- Invoice generation (food + hotel folio)
- Customer lifecycle analytics

## What's Been Implemented

### 2026-07-11 — Session 1
- Pulled all code from CRMpreprod repo (main branch)
- Set up environment with real credentials (MongoDB, JWT, MyGenie API, AuthKey, AWS S3, Meta APP_ID)
- **CR-036 Batch B.1 — Full Implementation**:
  - `core/meta_media.py` — Meta APP_ID resolver + 2-step resumable upload
  - `POST /whatsapp/upload-media-header` — dual upload to Meta + S3
  - `build_meta_template_payload` fixed — sends opaque handle not URL
  - Template create/update persists `header_handle`, `send_media_url`, `needs_media_reupload`
  - Q16: Approved template edit block (with media re-upload bypass)
  - Q17: Test-send auto-injects `send_media_url`
  - Q18: `{{n}}` blocked in media headers
  - G5: Campaign sends fail-loud with `status_note=media_missing` for templates without S3 URL
  - Q19: Event send fallback to `template.send_media_url`
  - Frontend: MediaHeaderUpload component (file picker + preview + creds guard)
  - Frontend: TemplatesPage re-upload banner + per-row button
  - Frontend: CampaignWizard stale-media warning tooltip
  - `/auth/me` returns Meta credential fields for frontend checks
  - Migration script ran (0 flagged)
- Bug fixes: UserResponse missing Meta fields, duplicate JSX, URL input not replaced, Q16 over-blocking

## Prioritized Backlog

### P0 — Owner verification pending
- [ ] E2E test: upload image → submit template → campaign send → image arrives on WhatsApp
- [ ] Verify `sampletestlogo` re-upload flow works on approved template

### P1 — CR-036 Batches B.2-B.4 (planned, not implemented)
- [ ] B.2: Message Status `media_missing` filter chip + campaign-create upfront block (~2 hrs)
- [ ] B.3: Chunked upload progress bar + re-upload modal on TemplatesPage (~3-4 hrs)
- [ ] B.4: pytest V15-V26 + Playwright V19/V23 (~3 hrs)

### P2 — Other pending items
- [ ] Enable `CAMPAIGN_SCHEDULER_ENABLED=true` when ready for campaign automation
- [ ] V26: Template clone across tenants with S3 copy + fresh Meta handle

## Key Decisions (CR-036)
- Q6: S3 for delivery URLs (not GridFS, not local disk)
- Q7/G5: Legacy templates fail-loud with `status_note=media_missing`
- Q13: Audio dropped from header types (Meta constraint)
- Q14-revert: Shared `META_APP_ID` env var + optional per-tenant override
- Q16: Approved templates immutable except media re-upload
- Q17: Test-send auto-injects stored `send_media_url`
- Q18: Dynamic `{{n}}` in media headers rejected
- Q19: Event send falls back to `template.send_media_url`
