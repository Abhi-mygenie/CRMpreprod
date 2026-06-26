# CR-024: Segments & Marketing Campaigns — Production Readiness

> **Status**: `cr024_discovery_phase_0_complete`
> **Date**: 2026-06-06
> **Owner**: Abhi
> **Tenant**: R689 Kunafa Mahal (primary test)

---

## 1. Problem Statement

Segments section was built as MVP. Owner wants to make it the actual marketing campaign product. Need to analyze what works, what doesn't, and what needs improvement — across the full stack: UI, backend, and execution engine.

---

## 2. Current State — Full Audit

### 2.1 What EXISTS today (code is deployed)

| Component | Status | Evidence |
|---|---|---|
| **Create Segment** (filters + name) | ✅ Works | `POST /segments` + 16 filter fields (tier, city, visits, spend, diet, gender, etc.) |
| **List Segments** | ✅ Works | `GET /segments` + "All Customers" default segment |
| **Preview Count** | ✅ Works | `POST /segments/preview-count` — shows matching customers before saving |
| **View Customers** in segment | ✅ Works | `GET /segments/{id}/customers` — modal shows names, phones, tiers |
| **Edit Segment name** | ✅ Works | `PUT /segments/{id}` |
| **Delete Segment** | ✅ Works | `DELETE /segments/{id}` + cascades WhatsApp config |
| **WhatsApp Config Save** | ✅ Works | `POST /segments/{id}/whatsapp-config` — saves template + schedule to DB |
| **Pause/Resume Config** | ✅ Works | `PATCH /segments/{id}/whatsapp-config/toggle` |
| **Delete Config** | ✅ Works | `DELETE /segments/{id}/whatsapp-config` |
| **Filter Tabs** (All / Active / Not Configured) | ✅ Works | Frontend filter on `whatsappConfigs` map |
| **Schedule UI** (Now / Scheduled / Recurring) | ✅ UI exists | Radio buttons + date/time pickers + recurring options (daily/weekly/monthly) |
| **Template Selection** | ✅ Works | Fetches AuthKey templates, shows only fully-mapped ones |
| **Message Preview** | ✅ Works | WhatsApp-style bubble with resolved variable values |
| **Bulk Send Function** | ✅ Exists | `send_bulk_messages()` in `core/whatsapp.py` — batched async sending |

### 2.2 What does NOT work / is MISSING (the gaps)

| # | Gap | Severity | Detail |
|---|---|---|---|
| **G1** | **"Send Now" does NOT actually send messages** | 🔴 CRITICAL | The "Send Now" button calls `saveWhatsappConfig()` which only SAVES config to DB. There is **zero execution code** — no endpoint calls `send_bulk_messages()`, no scheduler picks up configs, no messages are sent. The button says "Send Now" but it's a lie — it's really "Save Config". |
| **G2** | **No campaign execution engine** | 🔴 CRITICAL | No scheduler job, no cron route, no background task picks up `segment_whatsapp_config` docs and sends messages. The `send_bulk_messages()` function exists but is **never called** from any segment/campaign flow. |
| **G3** | **No scheduled send execution** | 🔴 CRITICAL | "Schedule for Later" saves `scheduled_date` + `scheduled_time` to DB but nothing reads it. No APScheduler job, no cron endpoint, no timer. Messages will never be sent at the scheduled time. |
| **G4** | **No recurring execution** | 🔴 CRITICAL | "Recurring" saves `recurring_frequency`/`recurring_days`/etc. to DB but nothing reads it. Same as G3 — config is saved, execution is zero. |
| **G5** | **No campaign history / audit trail** | 🟡 HIGH | No collection tracks which messages were sent, when, to whom, success/fail counts. No way to see "Campaign X sent 500 messages, 480 delivered, 450 read". The `whatsapp_message_logs` collection tracks individual messages but has no `campaign_id` linking them to a segment send. |
| **G6** | **No campaign naming** | 🟡 HIGH | Screenshot shows hardcoded sample campaigns (`campaigns` array, line 67-74) but these are never used. No campaign CRUD. Segments have configs but no campaign identity/name/tracking. |
| **G7** | **Segment filters not editable after creation** | 🟡 MEDIUM | `update_segment` only updates `name`. Cannot change filters of an existing segment. Owner must delete + recreate to change filter criteria. |
| **G8** | **Customer count stale** | 🟡 MEDIUM | `list_segments` recalculates count on every API call (line 1374) which is correct but slow for large customer bases. Count in segment cards can be stale between page loads. |
| **G9** | **No send confirmation / dry-run** | 🟡 MEDIUM | "Send Now" has no confirmation dialog ("You're about to send 4980 WhatsApp messages. Are you sure?"). One mis-click → messages to everyone. |
| **G10** | **No opt-out / rate limit protection** | 🟡 MEDIUM | No check for WhatsApp opt-in status before sending. No daily/hourly rate limit per tenant. Could exhaust AuthKey balance instantly. |
| **G11** | **"All Customers" segment has no ID in DB** | 🟠 LOW | Uses synthetic `id: "all-customers"` in frontend. Backend WhatsApp config save fails silently because `segment_id: "all-customers"` doesn't match any real segment. |
| **G12** | **Campaigns dropdown is hardcoded mockup** | 🟠 LOW | Line 67-74: `campaigns` array with fake IDs ("new_year", "weekend_special"). Not connected to any API. |
| **G13** | **No variable mapping editing in Segments flow** | 🟠 LOW | Template picker only shows "fully mapped" templates. If a template is partially mapped, user can't fix it from Segments page — must go to Templates page. |

### 2.3 UI / UX Assessment

| Area | Current | Issue |
|---|---|---|
| **Segment cards** | Cards with WhatsApp icon, config status, filter tags | ✅ Clean, functional |
| **Configure modal** | Template picker + schedule options in a single dialog | ⚠️ Overloaded — mixing "choose what to send" with "when to send" with "campaign identity" |
| **Send button label** | "Send Now" / "Schedule Message" / "Set Recurring" | 🔴 Misleading — nothing actually sends |
| **No campaign dashboard** | No way to see past sends, delivery rates, ROI | 🔴 Missing entirely |
| **No cost estimate** | No "This will send N messages, estimated cost: ₹X" | ⚠️ Risk of unexpected spend |
| **Segment creation** | 16 filter fields in a modal | ✅ Comprehensive filters |
| **Preview count** | Shows matching customer count before save | ✅ Good UX |

---

## 3. Architecture Gap Diagram

```
CURRENT (broken):
  User → Configure → Save Config to DB → ??? → Messages never sent

NEEDED:
  User → Configure → Save Config → 
    "Send Now"  → Execute immediately (call send_bulk_messages, log campaign)
    "Scheduled" → APScheduler job → fires at date/time → execute → log
    "Recurring" → APScheduler recurring job → fires daily/weekly/monthly → execute → log
                                                         ↓
                                              campaign_history collection
                                              (campaign_id, segment_id, sent/delivered/failed, timestamp)
```

---

## 4. Proposed Phased Plan

### Phase 1: Make "Send Now" actually send (P0 — closes G1, G5, G9, G10)
- Backend: `POST /segments/{id}/send` endpoint
  - Fetches segment customers
  - Fetches WhatsApp config (template, mappings)
  - Resolves variables per customer
  - Calls `send_bulk_messages()` in batches
  - Creates `campaign_runs` collection entry with stats
  - Links each message_log to campaign_id
- Frontend: Confirmation dialog before send ("Send to N customers?")
- Frontend: Progress indicator during send
- Backend: Opt-out check + rate limit guard

### Phase 2: Campaign identity + history dashboard (P1 — closes G6, G12)
- Campaign naming on each send
- `campaign_runs` collection: id, segment_id, campaign_name, template, sent_at, total/sent/delivered/read/failed
- Campaign history list in UI with delivery stats
- Link to Message Status page filtered by campaign_id

### Phase 3: Scheduled & Recurring execution (P1 — closes G3, G4)
- APScheduler jobs for scheduled sends (one-time)
- APScheduler jobs for recurring sends (daily/weekly/monthly with end conditions)
- `scheduled_campaigns` collection for tracking upcoming sends
- UI: Upcoming sends calendar / list

### Phase 4: Polish (P2 — closes G7, G8, G11, G13)
- Editable segment filters
- Async customer count refresh
- Fix "All Customers" config save
- In-flow template variable mapping

---

## 5. Effort Estimate

| Phase | Effort | Risk |
|---|---|---|
| Phase 1 | ~1-2 days | Medium — touches send pipeline, needs careful rate limiting |
| Phase 2 | ~1 day | Low — additive collection + UI |
| Phase 3 | ~1-2 days | Medium — scheduler reliability, timezone handling |
| Phase 4 | ~0.5 day | Low — minor fixes |

---

## 6. Out of Scope
- A/B testing (different templates to sub-segments)
- AI-powered send-time optimization
- Multi-channel (SMS, email) — WhatsApp only
- Audience lookalike / expansion
- Cost billing integration

---

## 7. Owner Questions — ANSWERED (2026-06-06)

**Q1**: Phase 1 first (make Send Now work), or skip to scheduled/recurring?
- **Answer: Phase 1 first** 

**Q2**: Rate limit — max messages per send? Per hour? Per day?
- **Answer: 1000/day** (per tenant)

**Q3**: Opt-out check — skip customers with `whatsapp_opt_in: false`?
- **Answer: Yes**, always skip

**Q4**: Campaign naming — required or optional?
- **Answer: Required** (no auto-default)

**Q5**: Send to "All Customers" — should this require extra confirmation since it affects everyone?
- **Answer: Yes**, double confirm for segments > 500

---

## 8. Architecture Decisions — LOCKED (2026-06-06)

| # | Decision | Choice |
|---|---|---|
| A1 | Page structure | **3 pages**: Campaigns, Audiences, History |
| A2 | Campaign creation UX | **Multi-step wizard** (step-by-step) |
| A3 | Builder layout | **Full-page** (like Template Builder) |
| A4 | Sidebar rename | "Segments" → **"Marketing"** with 3 sub-items |

**Sidebar structure:**
```
WhatsApp
  ├── Settings
  ├── Templates
  ├── Automation
  └── Marketing
        ├── Campaigns
        ├── Audiences
        └── History
```

---

## 9. Resume Signal

All questions answered. Next: Phase 1 planning doc → owner approval → implementation.
