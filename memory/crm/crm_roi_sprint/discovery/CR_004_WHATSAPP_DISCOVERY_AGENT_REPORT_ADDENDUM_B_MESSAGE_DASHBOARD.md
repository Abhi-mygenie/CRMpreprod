# CR-004 — WhatsApp Module · Discovery Gate Report — ADDENDUM B (Message Dashboard)

**Companion to:** `CR_004_WHATSAPP_DISCOVERY_AGENT_REPORT.md`
**Phase:** P0.B — Message Dashboard Discovery (READ-ONLY)
**Date:** 2026-05-27
**Status:** `cr004_phase_0_b_message_dashboard_discovery_complete`

> Owner asked: "what about message dashboard? that's not included in discovery — also I believe all message stats come there." Closing the gap here.

---

## 1. What the Dashboard Is Today

| Layer | File | LOC |
|---|---|---|
| Frontend page | `frontend/src/pages/MessageStatusPage.jsx` (also embeddable as `MessageStatusContent`) | 536 |
| 4 backend endpoints | `routers/whatsapp.py` lines 904-1054, 1057-1114, 1121-1209 | ~310 |
| Status webhook | `POST /whatsapp/status-callback` (public, no auth) | — |
| Backing collection | `whatsapp_message_logs` | — |

The dashboard has 3 visible surfaces:
- **5 stat cards** (Total / Delivered / Read / Pending / Failed)
- **Filter bar** (5 dropdowns + search)
- **Logs table** (4 columns) + per-row Resend button + bulk Resend bar + pagination

---

## 2. Data Flow Map

```
                       ┌────────────────────────────────────────┐
                       │   whatsapp_message_logs (Mongo)        │
                       │   id, user_id, customer_id, …,         │
                       │   status, message_id, error,           │
                       │   body_values, resend_count,           │
                       │   status_history[], created_at         │
                       └────────────────┬───────────────────────┘
                                        │
        ┌───────────────┬───────────────┼───────────────┬─────────────────┐
        ▼               ▼               ▼               ▼                 ▼
  /message-stats   /message-logs   /message-filters   /resend       /status-callback
  group by         filter +        statuses +         pending +     (public webhook,
  status           paginate        events + templates  rejected     AuthKey calls in)
                                   + segments         only
        │               │               │               │                 │
        ▼               ▼               ▼               ▼                 ▼
       5 cards        Table          Dropdowns     Per-row + bulk    DB write only
       (frontend)     (frontend)     (frontend)     (frontend)       (no UI surface)
```

---

## 3. Per-Endpoint Audit

### 3.1 `GET /whatsapp/message-stats`

| Aspect | State |
|---|---|
| Aggregation | `{$match: user_id} → {$group: status} → {$sum: 1}` |
| Returns | `{total, delivered, read, pending, rejected}` |
| Date range params | ✅ Backend accepts `date_from`, `date_to` |
| Date range usage | 🔴 Frontend never passes them — UI has no date picker |
| Filter scope | 🔴 Stats are **global per user** — they do NOT respect the filter bar shown above. Owner filters logs to "rejected" → stats cards still show all-time totals. Confusing. |
| Test-send pollution | 🔴 Includes `is_test=true` rows from `/test-template` in the totals — skews real stats |

### 3.2 `GET /whatsapp/message-logs`

| Aspect | State |
|---|---|
| Filters accepted | `status, event_type, campaign_id, template_name, search, date_from, date_to, skip, limit` |
| Filters exposed in UI | `status, event_type, campaign_id, template_name, search` — **`date_from` / `date_to` not exposed** |
| Search semantics | 🟡 Regex on `customer_phone` only. Owner sees a **Name column** but searching by name doesn't work. |
| Page size | Hard-coded 50, max 200 server-side; UI has no page-size picker |
| Sort | Always `created_at DESC` — owner can't sort by status or resend_count |
| Returned per row | full document (good) — but UI displays only 4 fields |

### 3.3 `GET /whatsapp/message-filters`

| Aspect | State |
|---|---|
| Returns | `statuses, event_types, template_names, campaigns` |
| `event_types` source | `AUTOMATION_EVENTS` master list (18 keys) — 🔴 mismatch with events actually present in `whatsapp_message_logs.event_type` (which contain `send_bill`, `first_visit`, `coupon_earned`, `wallet_credit`, etc. — see main report §4) |
| `template_names` source | (a) AuthKey live fetch via **wrong URL** `https://api.authkey.io/request?type=getAllTemplate&authkey=...` → likely returns nothing silently, (b) `custom_templates.name` field — but `custom_templates` stores `template_name` (with underscore), **not** `name`, so this collection contributes 0 too, (c) `whatsapp_event_template_map.template_name` — this one does work |
| `campaigns` source | All `segments` documents (id + name) — 🟡 includes segments not configured for WhatsApp + does NOT include AdHoc broadcasts (because there's no broadcast collection yet) |

🔴 **Template filter is effectively broken** — only mapped templates show up; AuthKey live templates + custom_templates are silently absent.

### 3.4 `POST /whatsapp/resend`

| Aspect | State |
|---|---|
| Eligible statuses | `pending`, `rejected` (good — UI mirrors this) |
| Per-call max | Bounded by request size only (no server-side cap) |
| Bug | 🔴 Line 1154 constructs `WhatsAppMessage(template_name=msg.get("template_name"), ...)` but the `WhatsAppMessage` dataclass at `core/whatsapp.py:17-26` has **no `template_name` field**. Will raise `TypeError: __init__() got an unexpected keyword argument 'template_name'` at runtime. **Resend has never worked.** |
| Idempotency | 🔴 None — owner clicks "Resend" twice in a row → 2 AuthKey API calls → 2 message log status_history entries. No "resend already in progress" guard. |
| Audit trail | ✅ Appends `{status, timestamp, action:"resend", success, error}` to `status_history` and bumps `resend_count` |
| Body values reuse | ✅ Re-uses `body_values` stored on the original log row |

### 3.5 `POST /whatsapp/status-callback` (AuthKey webhook → us)

| Aspect | State |
|---|---|
| Auth | 🔴 **Public, no token, no signature check.** Anyone with the URL can flip any message's status. |
| Lookup key | `message_id` from payload → matches `whatsapp_message_logs.message_id` |
| Status mapping | sent→pending, delivered→delivered, read→read, failed/rejected/undelivered→rejected |
| Effect | `$set: {status, updated_at}` + `$push: {status_history: {...raw_payload}}` |
| Failure mode | 🟡 If `message_id` is null (AuthKey didn't return one — common on rejected-from-start sends), callback silently no-ops. Owner sees the message stuck on `pending` forever. |
| AuthKey config | Unknown — no record in code that the webhook URL has been registered with AuthKey. May or may not be active in the live AuthKey account. |

### 3.6 `whatsapp_message_logs` document — fields actually stored vs shown in UI

| Stored field | In UI table? | Comments |
|---|---|---|
| `id` | ✅ (as row key + checkbox) | |
| `user_id` | n/a | |
| `customer_id` | 🔴 not shown — no deep link to customer profile from a log row |
| `customer_name` | ✅ Name column | shown if present |
| `customer_phone` | ✅ Phone column | |
| `country_code` | 🔴 not shown — `+91 9876…` rendered as just `9876…` |
| `event_type` | 🔴 not shown as column (only as filter) — for a `rejected` row, owner can't see *what* failed without expanding |
| `template_id` | 🔴 not shown |
| `template_name` | 🔴 not shown as column (only as filter) |
| `campaign_id` | 🔴 not shown — broadcasts are invisible as broadcasts |
| `status` | ✅ Status column |
| `message_id` | 🔴 not shown |
| `error` | 🔴 **not shown** — for a `rejected` row, owner cannot see the AuthKey error reason from the dashboard. Has to inspect Mongo. **Biggest UX gap.** |
| `body_values` | 🔴 not shown — no preview of what content was actually sent |
| `resend_count` | 🔴 not shown — no indication a message has been retried 3 times |
| `status_history[]` | 🔴 not shown — no drill-down timeline |
| `created_at` | ✅ as "Time" (relative) |
| `updated_at` | 🔴 not shown |

**Net:** 7 of 17 useful fields surfaced. The dashboard is essentially "Name + Phone + Status + Time". Error, template, event, resend count, history are all hidden despite being stored.

---

## 4. Bug & Gap Summary

### 🔴 Critical bugs

1. **Resend `TypeError`** — `WhatsAppMessage(template_name=...)` is invalid → resend is broken right now
2. **Stats include test sends** → owner's "Delivered" count is inflated
3. **Stats ignore filters** → cards say 1,200 messages, table shows 3 — confusing
4. **Template filter near-empty** — wrong AuthKey URL + wrong field name on `custom_templates`
5. **`status-callback` is unauthenticated** — anyone can spoof status flips
6. **Error reason hidden in UI** — owner can't tell why a message failed

### 🟡 Functional gaps

7. **No date range filter in UI** even though backend supports it
8. **Name search broken** — backend regex is on `customer_phone`, UI label suggests Name search works
9. **No drill-down** for a single message (status_history timeline, body_values, error message)
10. **No CSV / PDF export** of logs (CR-003 already established export patterns — could reuse)
11. **No deep link to customer** from a log row
12. **No auto-refresh / poll** — owner must click Refresh manually
13. **No idempotency on resend** — double-click sends twice
14. **No bulk action besides resend** — can't bulk-export, can't mark-as-handled
15. **No page-size picker** — fixed 50

### 🟦 Architectural shortcomings (forward-looking for P4 channel abstraction)

16. **No `channel` column** — schema implicitly assumes WhatsApp. Adding SMS later requires renaming/migrating collection.
17. **No `fallback_of` field** — when SMS fallback lands, we won't be able to visually link "this SMS was sent because that WA send rejected."
18. **No campaign / broadcast visibility** — `campaign_id` field exists but isn't populated by anything yet (no broadcast sender) and isn't shown when it is.
19. **No utility-vs-marketing tag** on log rows — needed for compliance / opt-in audit
20. **No `cost`/`segments` field per message** — WA & SMS billing differ; future analytics will need this

---

## 5. What Can Be Tested Now (read-only)

| # | Test | Pass | Fail (current) |
|---|---|---|---|
| MD-1 | Send a test message via `/test-template` → confirm a `is_test:true` row lands in logs | ✅ | — |
| MD-2 | Check whether the test row is counted in `/message-stats.total` | — | 🔴 Yes (pollutes) |
| MD-3 | Apply status filter "Failed" → check if stats cards update | — | 🔴 No (stats are global) |
| MD-4 | Search a customer name | — | 🔴 Returns nothing — search is phone-only |
| MD-5 | Force a rejected send (bad number) → view its error reason in UI | — | 🔴 Hidden — visible only in DB |
| MD-6 | Click Resend on any rejected row | — | 🔴 Will throw TypeError → backend 500 |
| MD-7 | Open AuthKey console → manually POST to `/status-callback` with random message_id | — | 🔴 Accepts unauthenticated → spoofable |
| MD-8 | Try to filter logs by date | — | 🔴 No UI control |
| MD-9 | Try to filter by a `custom_templates` template just created | — | 🔴 Likely absent from dropdown |

---

## 6. P7 Scope Locked In (Message Dashboard Hardening — broader)

This is what P7 in the revised plan should deliver, ordered by impact:

**P7-A · Correctness (high impact, low effort)**
- Fix Resend TypeError
- Exclude `is_test=true` from stats (or add toggle "include test sends")
- Add `date_from`/`date_to` date range filter — wire UI to existing backend params
- Apply current filters to `/message-stats` so cards reflect filter scope
- Broaden search to `customer_name`, `customer_phone`, `customer_id`
- Fix `/message-filters` AuthKey URL + `custom_templates` field name

**P7-B · Visibility (medium effort)**
- Add columns: Event, Template, Channel (after P4), Resend Count, Error (truncated)
- Row click → drill-down side panel showing: full body_values, status_history timeline, error full text, deep link to customer, message_id, AuthKey raw response
- Per-row badge for broadcasts: "Campaign: <segment name>"

**P7-C · Operations**
- Idempotency on resend (server-side lock by message id + 30s)
- CSV export of filtered logs (reuse CR-003 export pattern)
- Bulk select → bulk export
- Auto-refresh toggle (polling every 30s)

**P7-D · Security**
- Sign / token the status-callback URL (AuthKey supports a shared secret) OR put behind an obscure path + rate-limit

**P7-E · Architectural prep (consumed by P4 channel abstraction)**
- Add `channel` column to log schema (default `whatsapp`), `fallback_of` reference, `category` (`utility`/`marketing`)
- Backfill existing logs with `channel='whatsapp'`, `category=null`
- Add `cost` / `segments` placeholder fields

---

## 7. Net-Net for the Plan

The dashboard isn't "broken-broken" — owners can see the 5 cards and the recent-50 table — but **everything past the first 30 seconds of looking at a row is hidden or buggy**:
- Why did it fail? Hidden.
- Resend? Crashes.
- Was it a broadcast? Hidden.
- Filter date range? Doesn't exist in UI.
- Are these test sends? Mixed in.

So the dashboard needs **its own dedicated P7 phase** post-P4, not a polish-pass tucked into P8.

**Status:** `cr004_phase_0_b_message_dashboard_discovery_complete`

End of Addendum B.
