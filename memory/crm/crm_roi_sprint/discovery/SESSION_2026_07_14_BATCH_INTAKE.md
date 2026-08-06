# SESSION 2026-07-14 — BATCH INTAKE (from INV-007)

**Role:** INTAKE (registration only — zero code changes)
**Source:** Owner reports 2026-07-14 + investigation `investigations/INV_007_OPTIN_EDIT_TAGS_EXPORT_IMPORT_502_2026_07_14.md`
**Tenant evidence:** `owner@jehsnest.com` (348 customers)

All root causes were already confirmed by INV-007, so each item enters the register with evidence attached. Two reported items were closed as NOT-A-BUG (see §6).

---

## 1. BUG-013 — Customer bulk import times out at proxy (Cloudflare 5xx) while silently completing server-side

- **Classification:** BUG · **Severity: P1** · **Risk: MEDIUM** (import write path only; no hotspot files)
- **Symptom:** Import of ~345 rows shows Cloudflare "origin returned invalid or incomplete response"; owner retried → duplicate import runs (import_logs: same file 06:46 AND 06:48).
- **Root cause (CONFIRMED, INV-007 §3):** `routers/customers.py::import_customers` (L1386-1490) awaits one `update_one`/`insert_one` per row sequentially; remote Mongo RTT ≈ 242 ms → 345 rows ≈ 83-167 s > ~100 s proxy timeout. Import completes in background after browser error.
- **Fix direction (for Planning):** single `bulk_write()` (UpdateOne/InsertOne ops) → <2 s; optional FE friendly 5xx message.
- **Duplicate check:** DISTINCT — related to CR-035 (import feature, shipped) and CR-060 (import modal UX, gate open); neither covers the timeout.
- **Blast radius:** SMALL (one endpoint), but duplicate-run side effect touches customer data.
- **Evidence:** import_logs entries 03:41 / 06:39 / 06:46 / 06:48 (345 upd each) · measured RTT · owner screenshot.

## 2. BUG-014 — Import silently discards "WhatsApp Opt-in" column; NEW imported customers hardcoded opt-in=False

- **Classification:** BUG · **Severity: P1** · **Risk: HIGH** (`whatsapp_opt_in` gates ALL campaign sends — wrong handling could mass-opt-out/in)
- **Symptom:** Owner edits "WhatsApp Opt-in" in exported Excel, re-uploads → values never applied.
- **Root cause (CONFIRMED, INV-007 §4B):** `_validate_and_classify_row` (L89-123) extracts only name/phone/email/dob/city/address/tags — opt-in column parsed then discarded. Additionally L1456 hardcodes `whatsapp_opt_in: False` for NEW imported customers (contradicts Add-form/schema default True → imported customers excluded from all campaigns).
- **Owner decisions required before Planning:** D1 (honour column for existing? blank = unchanged) · D2 (new-customer default True vs False).
- **Duplicate check:** DISTINCT — CR-035 scope gap (export 22 cols vs import 7 cols asymmetry).
- **Blast radius:** MEDIUM (campaign audience correctness).

## 3. CR-063 — WhatsApp Opt-in toggle on Customer DETAIL page edit modal

- **Classification:** CR (feature-parity gap) · **Severity: P2** · **Risk: LOW** (FE-only)
- **What:** Customers-LIST edit modal has a working opt-in toggle (code-marker "BUG-011" in CustomersPage — NOTE: collides with registry BUG-011 Campaign counters; see §7 drift note); `CustomerDetailPage.jsx::openEditModal` (L201-219) omits `whatsapp_opt_in` — detail-page edit has no toggle and the page never displays opt-in status.
- **Verified:** backend PUT persists both true/false correctly (live round-trip, INV-007 §1).
- **Fix direction:** add same Switch to detail-page edit modal (+ optionally display opt-in status on the page).
- **Duplicate check:** DISTINCT.

## 4. CR-064 — Customer Delete option in Customers section (missing feature)

- **Classification:** CR (missing feature) · **Severity: P2** · **Risk: CRITICAL** (irreversible customer-data action → addendum §14 full gate + owner approval)
- **What:** No delete button anywhere in FE (list, detail, card) — never built (git-verified). Backend `DELETE /api/customers/{id}` exists (L1671) but cascades ONLY `points_transactions`; leaves `orders`, `whatsapp_message_logs`, `coupon_usage`, `feedback`, `wallet_transactions`.
- **Owner decision required (D5):** (a) hard delete + type-to-confirm · (b) soft delete/anonymize preserving orders & financial history (recommended) · (c) park.
- **Duplicate check:** DISTINCT.

## 5. CR-065 — Show resend time on Message Status rows

- **Classification:** CR (display enhancement) · **Severity: P2** · **Risk: LOW** (FE-only)
- **What:** Resent messages still show original `created_at` on the row (`MessageStatusPage.jsx` L720/L874). Backend already stores `last_resend_at` + `resend_count` + status_history "resend" entries (`routers/whatsapp.py` L2207-2232); resend time visible only in expanded history.
- **Fix direction:** when `resend_count > 0`, show "Resent <relative time>" + "Resent ×N" badge on the row; original time stays in history.
- **Owner decision:** D6 (approve display format) — proposed (a) locked by default unless owner objects.
- **Duplicate check:** DISTINCT — related CR-004 (message status page), BUG-012 (same page, filter race — sequencing note for implementation).

## 6. Closed at intake — NOT A BUG (no registration)

| Reported | Outcome |
|---|---|
| "Tags not in exported Excel" | Tags present at rows 241-349 (Mongo insertion order); owner shown filter/scroll steps. INV-007 §2. |
| "Opt-in not reflecting in Excel download" | 344 Yes / 4 No — matches DB exactly; "No" rows at 326-349. INV-007 §4A. |
| Optional follow-up | D4: register export-sort CR (created_at desc) only if owner wants it. |

## 7. Registry drift note

- Code marker `BUG-011` in `CustomersPage.jsx` (opt-in toggle) collides with registry BUG-011 (Campaign History counters). Flagged for next CLOSURE/AUDIT session — recommend re-marking the code comment to its true origin item.

---

## Intake summary block

```text
Intake complete: BUG-013, BUG-014, CR-063, CR-064, CR-065
Classification: 2 BUG / 3 CR (+2 reports closed NOT-A-BUG)
Severity: BUG-013 P1 · BUG-014 P1 · CR-063 P2 · CR-064 P2 · CR-065 P2
Risk: MEDIUM · HIGH · LOW · CRITICAL · LOW
Duplicate check: ALL DISTINCT (relations noted per item)
Evidence: captured (INV-007 + import_logs + live probes)
Blast radius: BUG-013 SMALL · BUG-014 MEDIUM · CR-063 SMALL · CR-064 LARGE · CR-065 SMALL
Docs updated: BUG_REGISTRY_CAMPAIGNS.md, CR_STATUS_DASHBOARD.md, this intake doc
Decisions (2026-07-14, post-intake): D1 YES (Yes/No honoured, BLANK=unchanged for ANY field) · D2 new-import default TRUE · D5 (c) CR-064 PARKED · D6 (a) locked · D4 skipped — see DECISIONS_LOG.md § 2026-07-14
Next: Owner confirms priority order + says "start" → PLANNING for BUG-013, BUG-014, CR-063, CR-065
```
