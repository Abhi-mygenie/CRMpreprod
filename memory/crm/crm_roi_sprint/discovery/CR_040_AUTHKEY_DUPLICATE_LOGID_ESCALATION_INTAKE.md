# CR-040 — Escalate AuthKey Duplicate LogID (Upstream Root Cause)

> **Role**: INTAKE
> **Registered**: 2026-07-03 (retrospective — issue known since CR-039 investigation)
> **Reporter**: Prior agent (CR-039 investigation) + owner (handover directive)
> **Type**: Support / operational escalation (external vendor)
> **Severity**: P2 (data-integrity concern; CRM has mitigations, but root fix belongs at vendor)
> **Risk**: LOW (no code change on our side)
> **Status**: 📋 Registered · awaits owner-initiated escalation to AuthKey vendor

---

## 1 · One-line summary

AuthKey's `sendBulkSMS.php` / webhook plane reuses the same `LogID` across two logically distinct sends, causing CRM's `whatsapp_message_logs.reference_id` disambiguation to be non-deterministic. CR-039 shipped a defensive tie-breaker on our side; the root cause remains at AuthKey.

## 2 · Discovery / evidence

- CR-039 investigation (`discovery/CR_039_WEBHOOK_ROW_DISAMBIGUATION_DISCOVERY.md`) traced 3 ambiguous webhook rows on Jeh's Nest where two sends shared the same `LogID` returned by AuthKey.
- Symptom: our previous logic picked whichever row was inserted last → status updates could land on the wrong row.
- Verified via Mongo query: 3 `whatsapp_message_logs` rows with duplicate LogID across different `customer_phone` values.

## 3 · What CRM already did (defensive mitigation)

- CR-039 shipped a 3-way tie-breaker in `routers/whatsapp.py::_resolve_log_for_webhook` — matches by `message_id + customer_phone + status_transition` before falling back.
- 11 pytest tests cover the disambiguation. All PASS.
- No customer-visible defect today; each webhook lands on the correct row.

## 4 · Why still register a CR

- CR-039 is a WORKAROUND, not a root-cause fix.
- If AuthKey ships new templates / flows, the reused-LogID pattern may hit new edge cases our tie-breaker doesn't cover.
- Escalation to vendor creates a formal paper trail so the fix isn't quietly lost.

## 5 · Actions required (owner-side)

1. Open a ticket with AuthKey support quoting:
   - Tenant: `pos_0001_restaurant_635`
   - Affected LogIDs (3 examples — pull from Mongo: `db.whatsapp_message_logs.aggregate([{$group:{_id:"$message_id",n:{$sum:1}}},{$match:{n:{$gt:1}}}])`)
   - Ask: "Under what conditions can `sendBulkSMS.php` return the same LogID for two different sends? Please make LogIDs globally unique per send."
2. Log the vendor's response in `/app/memory/AUTHKEY_ESCALATION_LOG.md` (new file, or append to `DECISIONS_LOG.md`).
3. If vendor confirms fix → mark CR-040 CLOSED. If vendor punts → keep CR-040 OPEN + monitor with a periodic Mongo audit query.

## 6 · What CRM will NOT do

- No code changes. This CR is 100% external.
- No workaround extension unless CR-039's tie-breaker proves insufficient.

## 7 · Owner questions

- **Q1**: Do you want CRM to add a periodic audit query (nightly cron) that alerts if new duplicate LogIDs appear? If yes, that's a small future micro-CR (~15 LOC scheduled job). Not required by this CR.

## 8 · Registered

- New CR-040 row added to `CR_STATUS_DASHBOARD.md`.
- No planning / implementation phase — this is a pure escalation CR.

---

## INTAKE output

```text
Intake complete: CR-040
Classification: Support / operational escalation
Severity: P2
Risk: LOW (zero CRM code touched)
Duplicate check: Related to CR-039 (workaround shipped) — CR-040 is the upstream escalation of the same underlying issue
Evidence: 3 duplicate-LogID rows on Jeh's Nest (validated during CR-039)
Blast radius: None on our side — vendor-side change requested
Docs updated: CR_STATUS_DASHBOARD.md, this intake doc
Next: Owner escalates to AuthKey vendor
```

*End of intake — CR-040. No code. Doc-only.*
