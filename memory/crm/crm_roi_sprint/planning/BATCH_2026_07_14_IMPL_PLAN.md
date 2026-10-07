# BATCH 2026-07-14 — IMPLEMENTATION PLAN (edit-by-edit)
## Items: BUG-013 + BUG-014 (combined) · CR-063 · CR-065

**Status:** ALL DECISIONS LOCKED (2026-07-14, `DECISIONS_LOG.md § QA-QF` + § Q-C): Q-A=(c) reject in-file duplicate phones w/ 400 + row list · Q-B=(a) both headers · Q-C=(a) template gains `whatsapp_opt_in` 8th column · Q-D=(b) no preview column · Q-E=(b) toggle + status badge · Q-F=(a) report gains resend columns. Conditional edits E-A6 (Q-C) ✅ IN SCOPE, E-B4 (Q-D) ❌ OUT, E-C3 (Q-E) ✅ IN, E-D3 (Q-F) ✅ IN. **⛔ IMPLEMENTATION GATE NOT OPEN** — awaiting owner's explicit "start".
**Rule:** implementation only after owner approval; no scope expansion; code markers `BUG-013` / `BUG-014` / `CR-063` / `CR-065` on every edit.

---

## §A+B — BUG-013 + BUG-014 (single edit set, `routers/customers.py`)

### E-A1 · Imports (top of file)
Add `from pymongo import UpdateOne, InsertOne` (pymongo ships with Motor — no dependency change).

### E-B1 · `_validate_and_classify_row` — parse opt-in (D1)
After tags parsing (~L110):
```python
# BUG-014 (D1): parse whatsapp opt-in; None = leave unchanged
raw_opt = (row.get("whatsapp opt-in") or row.get("whatsapp_opt_in") or "").strip().lower()   # header set per Q-B
opt_in = True if raw_opt in ("yes", "true", "1") else False if raw_opt in ("no", "false", "0") else None
```
Return dict gains `"whatsapp_opt_in": opt_in`.

### E-A2 · Loop refactor — collect ops instead of awaiting per row
Replace the `if result["status"] == "update": await update_one … else: await insert_one` block:
```python
ops = []            # BUG-013: single bulk_write instead of per-row awaits
...
if result["status"] == "update":
    ...build update_payload exactly as today (blank-filter L1439 unchanged)...
    if result.get("whatsapp_opt_in") is not None:          # BUG-014 (D1)
        update_payload["whatsapp_opt_in"] = result["whatsapp_opt_in"]
    ops.append(UpdateOne({"user_id": user["id"], "phone": result["phone"]}, {"$set": update_payload}))
    updated_count += 1
else:
    new_doc = { ...exactly as today... }
    new_doc["whatsapp_opt_in"] = result["whatsapp_opt_in"] if result.get("whatsapp_opt_in") is not None else True   # BUG-014 (D2) — replaces hardcoded False
    ops.append(InsertOne(new_doc))
    imported_count += 1
```

### E-A3 · Execute after loop
```python
if ops:
    await db.customers.bulk_write(ops, ordered=False)   # BUG-013
```
Tag-catalog `$addToSet`, `import_logs` insert, and response body: UNCHANGED.

### E-A4 · In-file duplicate phones — per Q-A lock
- If Q-A=(a): maintain `seen_phones: set`; a repeated phone after a "new" row is reclassified as update targeting the same phone (its UpdateOne merges onto the pending insert via a second pass: convert to post-insert UpdateOne — concretely: append phone to `phone_to_doc`-shadow so `_validate_and_classify_row` returns "update", and its UpdateOne filter matches the just-inserted doc; `ordered=False` → must switch to `ordered=True` **only if** Q-A=(a) so the InsertOne lands before its UpdateOnes).
- If Q-A=(b): no change (documented known limitation).
- If Q-A=(c): pre-scan for duplicate phones → HTTP 400 with row list (mirrors 5,000-row guard style).

### E-A5 · Preview parity (only if Q-A=(a) or (c))
`preview_import` classification must mirror the same duplicate handling so preview counts match commit counts.

### E-A6 · Conditional (Q-C=a) — sample template
`IMPORT_HEADERS` (L1285) += `"whatsapp_opt_in"`; SAMPLE_ROWS gain `"Yes"` / `""`.

### E-B4 · Conditional (Q-D=a) — preview shows opt-in
`ImportPreviewRow` (schemas.py) + preview construction + FE preview table column. Skipped if Q-D=b.

### E-B5 · Docs/markers
Code markers `# BUG-013` / `# BUG-014 (D1/D2)`; registry + dashboard status flips at exit gate.

---

## §C — CR-063 (`CustomerDetailPage.jsx`)

### E-C1 · Import + state
Add `import { Switch } from "@/components/ui/switch";` (L~10). `openEditModal` (L202): add `whatsapp_opt_in: customer.whatsapp_opt_in !== false,`.

### E-C2 · Toggle block
Insert after the Phone field block (~L1010), cloned from `CustomersPage.jsx` L2457-2467:
```jsx
{/* CR-063: WhatsApp opt-in toggle (parity with list edit modal) */}
<div className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5">
  <div>
    <Label className="form-label mb-0">WhatsApp Opt-In</Label>
    <p className="text-[11px] text-gray-500">Off = customer is excluded from all WhatsApp campaigns</p>
  </div>
  <Switch checked={editData.whatsapp_opt_in !== false}
          onCheckedChange={(v) => setEditData({...editData, whatsapp_opt_in: v})}
          data-testid="detail-edit-whatsapp-opt-in" />
</div>
```
`handleUpdateCustomer` untouched (false passes cleanData filter — verified).

### E-C3 · Conditional (Q-E=b) — status badge on page view
Small badge near customer header showing "WhatsApp: Opted in/out". Skipped if Q-E=a.

---

## §D — CR-065 (`MessageStatusPage.jsx`, D6=a locked)

### E-D1 · Desktop time cell (L719-721)
```jsx
{/* CR-065 (D6=a): resent time takes over the time cell */}
<td className="px-3 py-3 text-gray-500 text-xs">
  {log.resend_count > 0 ? (
    <span data-testid={`resent-time-${log.id}`}>
      Resent {formatRelativeTime(log.last_resend_at)}
      <span className="ml-1 text-[10px] text-amber-600 font-medium" data-testid={`resent-badge-${log.id}`}>×{log.resend_count}</span>
    </span>
  ) : formatRelativeTime(log.created_at)}
</td>
```

### E-D2 · Mobile card time (L874)
Same conditional on the `span`.

### E-D3 · Conditional (Q-F=a) — report download columns
`_EXPORT_HEADERS` (whatsapp.py L1621) += ("Resend Count","resend_count"), ("Last Resend At","last_resend_at"). Skipped if Q-F=b.

Backend: NO change (fields already returned by `/message-logs`).

---

## Self-test & QA plan (no live WhatsApp sends; synthetic data on test tenant `owner@jehsnest.com`, cleaned in finally-blocks)

1. **pytest** `backend/tests/test_bug013_014_import.py`: V1-V8 (timing assert <10 s for 350 rows, counters, idempotency, Q-A behaviour, opt-in token matrix Yes/No/blank/junk, D2 default).
2. **UI/e2e (testing_agent)**: V9 (detail-page toggle round-trip), V10-V11 (resent badge desktop+mobile via synthetic `resend_count>0` log row seeded and removed), V12 regressions (import modal step 3 reached, export shape, BUG-012 deep-link filter).
3. Exit gate: registry+dashboard+markers synced, QA handover written.

## Effort
BUG-013+014 ~3-4 h (incl. tests) · CR-063 ~1 h · CR-065 ~1-2 h.

```text
Planning complete: BUG-013, BUG-014, CR-063, CR-065
Stage: Implementation Plan (DRAFT — conditional edits pending Q-A…Q-F)
Files WILL change: routers/customers.py · CustomerDetailPage.jsx · MessageStatusPage.jsx · tests/test_bug013_014_import.py (new) (+conditionals)
Files WILL NOT touch: pos.py, coupon.py, loyalty.py, core/whatsapp.py, whatsapp.py (unless Q-F=a), schemas.py (unless Q-D=a), CustomersPage.jsx, .env
Owner decisions: Q-A…Q-F
Next: owner locks Q-A…Q-F + approves Implementation gate
```
