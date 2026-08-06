# INV-2026-07-03-04 — Campaign Sends Get Duplicate LogIDs → Wrong Row Updated by Webhook

> **Type**: Investigation report (live-test with real production DB)
> **Date**: 2026-07-03
> **Role**: Investigation Agent (read-only, no code changes)
> **Source**: Owner-triggered live campaign send from Jeh's Nest (restaurant 635) after AuthKey webhook URL was corrected
> **Status**: 📋 Reported — routed to CR-039
> **Confidence**: HIGH (reproduced live with production DB observation)
> **Steps used**: 10 / 10

---

## Question Investigated

> Owner reproduced the "dashboard status not updating" issue via a real 3-recipient campaign
> after fixing the AuthKey webhook URL. Automation-triggered single-send worked correctly.
> Campaign multi-recipient send did NOT. Why?

---

## Live-Test Timeline (all times UTC)

| Time | Event | Observed |
|---|---|---|
| 08:37:37 | Automation single-send to 7505242126 (event_type=`test`) | row created, unique `message_id` |
| 08:39:39 | AuthKey webhook for that logid, `status=failed` | verdict `applied`, row → rejected ✅ |
| 08:44:33 | Campaign test-send to 7505242126 (event_type=`campaign_test`) | row created, unique `message_id` |
| 08:46:42 | AuthKey webhook, `status=failed` | verdict `applied`, row → rejected ✅ |
| **08:47:59** | **Campaign send to 3 recipients (event_type=`campaign_send`)** | **3 rows created, all sharing same `message_id`** ⚠️ |
| 08:48:17 | Webhook 1 arrives for mobile 919811657657, status=delivered | mismatch: row 1's phone is 7505242126 |
| 08:50:33 | Webhook 2 arrives for mobile 919035133228, status=delivered | mismatch: same row 1 returned |

---

## Evidence

### The 3-row LogID collision

Query on `whatsapp_message_logs` (live prod DB):

| id (last 4) | phone | created_at | status now | message_id | authkey_raw_response |
|---|---|---|---|---|---|
| ...a27b | 7505242126 | 08:47:59.402873 | **delivered** | `d1cbdc206ce89f7f794575bbd862a27b` | `{'status':'Success','LogID':'d1cbdc206ce89f7f794575bbd862a27b',...}` |
| ...c22c | 9035133228 | 08:47:59.407153 | **pending** ❌ | `d1cbdc206ce89f7f794575bbd862a27b` | (identical) |
| ...cd82 | 9811657657 | 08:47:59.408642 | **pending** ❌ | `d1cbdc206ce89f7f794575bbd862a27b` | (identical) |

3 recipients, 3 rows, **1 shared `message_id`**. `authkey_raw_response` bytes are identical across rows.

### Backend log evidence

```
2026-07-03 08:48:17,295 WARNING - webhook mobile mismatch: payload='919811657657' row='917505242126' logid=d1cbdc206ce89f7f794575bbd862a27b
2026-07-03 08:50:33,398 WARNING - webhook mobile mismatch: payload='919035133228' row='917505242126' logid=d1cbdc206ce89f7f794575bbd862a27b
```

### Callback-log evidence

Two separate `whatsapp_callback_logs` rows, verdict `applied` on both, but pointing at the same `logid` with different `parsed.mobile` values. Both applied to row 1 (7505242126) because `find_one({"message_id": logid})` is deterministic.

---

## Root Cause — Two Overlapping Defects

### Defect D1 (CRM) — Non-unique webhook lookup key

`routers/whatsapp.py:1399`:
```python
row = await db.whatsapp_message_logs.find_one({"message_id": logid}, {"_id": 0})
```

When multiple rows share a `message_id` (as they do when AuthKey returns duplicate LogIDs),
`find_one` returns the first inserted row for every webhook. Rows 2..N never get updated.

### Defect D2 (CRM) — Mismatch handler advisory only

`routers/whatsapp.py:1426-1430`:
```python
if mobile_mismatch:
    set_fields["mobile_mismatch"] = True
    logger.warning(...)
```

Detects the mismatch, flags it, but **still applies the update to the wrong row**.
Design assumption was `message_id` is unique per send; that assumption is now falsified.

### Contributing external factor — AuthKey returns duplicate LogID

`core/whatsapp.py:60-131` shows each `send_single_message` posts a distinct single-mobile
payload to `AUTHKEY_API_URL=https://console.authkey.io/restapi/requestjson.php` and reads
its own response. Yet all 3 concurrent responses returned the same `LogID`. Likely
AuthKey-side dedup/caching of near-simultaneous requests (within 5 ms) from the same API
key, or LogID represents the request batch even for single-recipient payloads.

**Classification**: `CODE (defect)` — the CRM must not rely on AuthKey returning unique
LogIDs. Fix must be on the CRM side.
**Confidence**: HIGH — reproduced live, DB rows and logs match hypothesis exactly.

---

## Impact

Every multi-recipient campaign send is affected. For an N-recipient campaign:
- Row 1 gets the correct final status
- Rows 2..N stay `pending` forever
- Dashboard reports **1/N delivery rate** even when all N were delivered on WhatsApp

Historic impact estimate (from earlier scan of `whatsapp_callback_logs` verdict
distribution — 84% `no_matching_row`): a fraction of those may also be duplicate-LogID
cases where none of the CRM rows matched (if the batch's first row was for another
tenant). Cannot separate cleanly without a targeted script.

---

## Recommendation

**Route to CR-039 for immediate P1 fix**. Composite `(message_id, mobile)` lookup with
fallback to `message_id`-only for legacy rows. Skip-on-ambiguous instead of
apply-on-mismatch. See:
- `discovery/CR_039_WEBHOOK_ROW_DISAMBIGUATION_DISCOVERY.md`
- `planning/CR_039_WEBHOOK_ROW_DISAMBIGUATION_PLAN.md`

Also register a separate owner-facing ticket:
- **CR-040** — Escalate to AuthKey support asking why `requestjson.php` returns
  identical LogIDs for concurrent single-mobile sends.

---

## Output (per system prompt Role 6)

```text
Investigation complete: INV-2026-07-03-04
Root cause: CRM defect — webhook row lookup uses only `message_id`, which is not unique when AuthKey returns duplicate LogIDs for concurrent sends. Mismatch handler flags but does not skip the wrong-row update.
Classification: CODE (defect, P1)
Confidence: HIGH — reproduced live on production DB with backend log corroboration
Steps used: 10 / 10
Evidence:
  - Live DB rows: 3 whatsapp_message_logs rows sharing message_id d1cbdc206ce89f7f794575bbd862a27b
  - Backend logs: two "webhook mobile mismatch" warnings for that logid at 08:48:17 and 08:50:33
  - Code: /app/backend/routers/whatsapp.py:1399 (find_one by message_id only), 1426-1430 (mismatch flag only)
Recommendation: Route to CR-039 for composite-key lookup + ambiguous-row skip. Register CR-040 to escalate duplicate LogID with AuthKey.
```

---

## Related

- Preceding investigation: `INV-2026-07-03-03_WEBHOOK_STATUS_NOT_UPDATING.md`
- Downstream CR: `discovery/CR_039_WEBHOOK_ROW_DISAMBIGUATION_DISCOVERY.md`
- Downstream CR planning: `planning/CR_039_WEBHOOK_ROW_DISAMBIGUATION_PLAN.md`
