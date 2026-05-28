# Decisions Log — `crm_roi_sprint`

> **Append-only.** Every owner-locked decision gets a row. Never edit historical rows; if a decision is reversed, add a NEW row referencing the old one.
> Source quote should be a verbatim paraphrase or direct quote from the chat.

---

## Format
```
### YYYY-MM-DD [CR-XXX] §<section> — <short title>
**Decision**: <what was decided>
**Source**: <verbatim quote or close paraphrase from owner>
**Rationale**: <why, if explained>
**Reverses**: <prior decision ID if applicable>
**Locks**: <what field/section/file this constrains>
```

---

## 2026-05-28 — Session decisions

### 2026-05-28 [project] — Repo bootstrap
**Decision**: Wipe `/app` (including hidden folders) and clone `Abhi-mygenie/CRMpreprod` branch `28-may` fresh.
**Source**: "Yes, wipe everything including hidden folders" (response to bootstrap prompt).
**Rationale**: Clean state for branch-specific work.
**Locks**: `/app` contents.

### 2026-05-28 [project] — MongoDB only remote
**Decision**: Use remote MongoDB at `52.66.232.149:27017/mygenie`. No local DB.
**Source**: "yes remote".
**Rationale**: Prod and preview share data; preview is operating on live data.
**Locks**: `/app/backend/.env::MONGO_URL`, `DB_NAME=mygenie`.

### 2026-05-28 [project] — Testing agent OFF
**Decision**: Do NOT call `testing_agent_v3` for this sprint.
**Source**: Repeated across initial brief: "Do not run a testing agent" + "no testing agent".
**Locks**: All testing must use curl / `python -c` / screenshots / live trace scripts.

---

### 2026-05-28 [CR-004 P3.5] — Form-urlencoded webhook hotfix authorized
**Decision**: Patch `routers/whatsapp.py::message_status_callback` to handle `application/x-www-form-urlencoded` in addition to JSON.
**Source**: "A only" in response to options (A fix parser / B docs only / C both).
**Rationale**: Real AuthKey delivery callbacks arrive as form-encoded, not JSON as originally documented.
**Locks**: Parser content-type detection branch in webhook handler.

### 2026-05-28 [CR-004 P3.5] — Option A live test path
**Decision**: Fire synthetic POS order at preview's `/api/pos/orders` (not push to prod).
**Source**: "CR-004 P3.5 we need to test an order with option A ready".
**Rationale**: Validates send-side end-to-end without requiring prod push.
**Locks**: Live-test artifact at `qa/CR_004_PHASE_3_5_LIVE_TEST_REPORT.md`.

### 2026-05-28 [CR-004 P3.5] — CLOSED
**Decision**: CR-004 P3.5 status moves to `cr_004_p3_5_closed_live_test_passed` (17/17 ACs).
**Source**: Live test of synthetic order `E2E1779979662` — full `pending → delivered → read` in 71 sec.
**Locks**: No further code changes needed for P3.5. Prod push remains optional.

---

### 2026-05-28 [CR-014] §2 Q1 — Invoice modes
**Decision**: 3-mode renderer — GST Tax Invoice (Mode A) / Simple Receipt (Mode B) / Hotel Folio (Mode C). Auto-detect per order.
**Source**: "Both — render GST fields if available in POS payload, else fall back to simple receipt; also consider rooms".
**Locks**: Mode-detection logic + 3 Jinja2 partials.

### 2026-05-28 [CR-014] §2 Q3 — Customer-facing format
**Decision**: Mobile-friendly HTML web page + "Download PDF" button. Not pure PDF.
**Source**: Owner selected option b.
**Locks**: Renderer outputs HTML primarily; PDF via reportlab (or weasyprint) secondary.

### 2026-05-28 [CR-014] §2 Q4 — Access control
**Decision**: Public token URL. No auth, no expiry by default.
**Source**: "Anyone with link".
**Locks**: URL pattern `/api/invoices/{32-char-token}`; no auth middleware on this route.

### 2026-05-28 [CR-014] §2 Q5 — Branding storage
**Decision**: Add missing fields to Profile page (extends `users` collection). Logo is already stored elsewhere — skipping logo in this CR.
**Source**: "we need to add missing feilds in profile page... including logo is already stored".
**Locks**: ~9 new fields on `users` doc (see CR-014 §15); `/api/auth/profile` whitelist expansion.

---

### 2026-05-28 [CR-015] (registered) — Variable mapping scope
**Decision**: CR scope is the **WhatsApp template variable mapping system as a whole**, not just `send_bill`.
**Source**: "no make make clean Another CR... scope it variable mapping" (re CR-015).
**Locks**: 7-track plan in CR-015 covers resolver + DB normalization + event-data forwarding + registry expansion + admin UI hardening + cleanup.

---

### 2026-05-28 [CR-016] §4 — Reuse existing Automation page for events UI
**Decision**: Do NOT create a new "Events" sidebar page. Extend `frontend/src/components/shared/WhatsAppAutomationContent.jsx` (already 1831 LoC, already has the events list + template-mapping UX).
**Source**: "all have event page we can use page page, for new event creation modal can be used".
**Locks**: CR-016 §4.1; modal pattern reuses existing Dialog component.

### 2026-05-28 [CR-016] §3 — NO cooldown mechanism
**Decision**: Remove cooldown design from CR-016 entirely. Frequency is controlled by source-signal cadence + conditions. Events are inherently event-driven.
**Source**: "Cooldown no these not have any re trigger these are events based message".
**Rationale**: Each system signal (POS order received, customer registered, daily birthday match, etc.) has natural single-shot semantics. If finer control needed, use conditions like `customer.total_visits == 5`.
**Reverses**: Earlier CR-016 §3.4 cooldown design proposal.
**Locks**: No `cooldown_seconds` field on `events` collection; no cooldown UI tab; dispatcher has no cooldown lookup.

### 2026-05-28 [CR-016] §3 — Reduced owner questions 10 → 8
**Decision**: Drop former Q5 (cooldown scope) and Q6 (cooldown max) from CR-016 owner-question list. Remaining 8 questions for owner.
**Source**: Downstream of cooldown removal.
**Locks**: CR-016 §7 question list.

---

## How to add a new decision

1. Append a new `### YYYY-MM-DD [CR-XXX] §<section> — <title>` block at the bottom of the appropriate session group.
2. If creating a new session group, add it as a `## YYYY-MM-DD — Session decisions` heading.
3. Include verbatim source quote (or close paraphrase) — this is the audit trail.
4. If the decision reverses an earlier one, add a `**Reverses**:` line linking to the older decision title.

---

**End of decisions log.**
