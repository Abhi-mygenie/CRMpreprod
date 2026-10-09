# Reconciliation — CRM's filled Ownership Board vs ours
## Ref: INV-2026-09-15-002 · Source: `crm_reply/INV_022_CRM_OWNERSHIP_BOARD_REPLY.md` (received 2026-10-03)
## Machine-readable copy for board import: `crm_reply/crm_board_reply.json`
## Verdict: **36 of 39 rows agree. 3 contested. 1 contradiction with CRM's own earlier answer.**

CRM derived every value from a read-only scan of their codebase with read/write op counts and
file:line evidence. That is stronger evidence than our side had (we worked by elimination for 8
rows). Their owner split: **CRM 32 · Customer App 4 · Shared (POS-origin) 2 · POS 1**.

---

## 1. Agreed — 36 rows, no action

| Group | Collections | Agreed owner |
|---|---|---|
| **Ours** | `customer_app_config`, `dietary_tags_mapping`, `non_qr_blocks`, `status_checks` | **Customer App** — CRM confirms `crm:""` on the last two ("never referenced anywhere in CRM code") and that its only touch on the first two is the 4 orphan routes being deleted in **CR-095**, after which CRM = none. **O1 and O2 are now closed with CRM's written agreement.** |
| **Core CRM customer data** | `customers` (R132/W65), `users` (R45/W28), `feedback`, `points_transactions`, `wallet_transactions`, `coupons`, `loyalty_settings` | **CRM** — matches our position exactly |
| **Previously "unclaimed by elimination" (our B2)** | `import_logs` (CR-035), `webhook_logs` (CR-030, Freshmarketer idempotency), `coupon_distributions`, `customer_documents` (hotel guest ID docs, S3, CR-071/072/075) | **CRM** — now claimed with code evidence instead of by elimination. **Our B2 question is answered by the JSON itself.** |
| **CRM internals** (campaigns, WhatsApp, coupons audit, invoices, cron, migration, segments, logs) | `campaigns`, `campaign_runs`, `campaign_test_sends`, `coupon_transactions`, `coupon_usage`, `cron_job_logs`, `custom_templates`, `customer_otps`, `invoices`, `loyalty_mismatch_logs`, `migration_sync_logs`, `pos_request_logs`, `segments`, `segment_whatsapp_config`, `message_logs`, `whatsapp_callback_logs`, `whatsapp_event_template_map`, `whatsapp_message_logs`, `whatsapp_template_variable_map` | **CRM** — we have zero code on any of them; uncontested |
| **New row** | `templates` | **CRM** — not on our board. Read-only fallback at `whatsapp.py:2383` (R1/W0), likely a dead alias of `custom_templates`; CRM proposes retiring the fallback in a cleanup CR. Accept as CRM-owned. **Closes contract item O-3.** |

**Our B1 is also resolved.** The four collections absent from our UAT probe
(`pos_event_logs`, `otp_tokens`, `segment_whatsapp_config`, `message_logs`) all exist in CRM's
**code** — they simply have not been written to on UAT yet, so Mongo never created them. Not a gap:
each will materialise on first write. (Note CRM's own guess at our B2 list was wrong — they
guessed `non_qr_blocks`/`status_checks`/`message_logs`/`templates` — but the JSON makes the guess
moot, since all four of our actual names are claimed in it anyway.)

---

## 2. Contested — **RULED BY OWNER 2026-10-03**

> **D-1 → owner = CRM** (recommendation accepted). **D-2 → owner = CRM, annotated "originates in
> POS via webhook"** (recommendation accepted; "Shared" rejected). **D-3 → still with CRM** for a
> one-line clarification. **O-4 (Call Waiter / Pay Bill direction) and the Pay-Bill definition →
> referred to POS** by the owner, raised as POS **P6** and **P7**. Recorded in contract
> §2d (v1.0-RC3). The analysis below is retained as the basis for those rulings.

### Original analysis — 3 rows, owner decision needed

### D-1 · `pos_event_logs` — CRM proposes owner = **POS**, but CRM is the only writer

| Side | Position |
|---|---|
| CRM | `crm:"W"` — write-only, 3 writes (`scan.py:859` call-waiter, `scan.py:877` request-bill, `pos.py:2484`), **0 reads**. Proposed owner = **POS**, because POS is the intended consumer. "If POS does not read it, it is dead." |
| Us | We never touch it and never will (Q-CA-2). We had no owner position. |

**The problem is definitional, not factual.** Our contract defines *owner* as **"the only team
allowed to write"** (§2). By that rule the owner is **CRM** — it is the sole writer. CRM has
instead assigned ownership to the **consumer**. Both readings are defensible but they cannot both
be in the same document.

**Recommendation:** keep the contract's rule and record
**owner = CRM (sole writer) · consumer = POS (required) · Customer App = never**, with a note that
the collection is **inert until POS consumes it**. That keeps "owner = writer" coherent across all
39 rows and still captures CRM's real point. Needs the **owner's** ruling, and it is bundled with
the Q-CA-6 direction question (contract **O-4**) and POS **P1**.

### D-2 · `orders` and `order_items` — CRM proposes **"Shared (POS-origin)"**

| Side | Position |
|---|---|
| CRM | Writes both (`orders` R34/W6; `order_items` R16/W6/IDX4) via the POS webhook (`pos.py`) and `migration.py`, and reads them for loyalty/analytics/scan. But the data **originates in POS**, so they marked owner = *Shared (POS-origin)* and asked the owner to confirm POS vs Shared. |
| Us | Contract §2 currently says **CRM**. We have zero code on either (the one read at `server.py:820` is dead and dies with CR-2026-10-03-001). |

**Note there is no actual rule violation here.** Ground rule **G3** says POS never writes the
shared DB directly — and it doesn't: POS fires a webhook into *CRM's* `pos.py`, and CRM performs
the write. "POS-origin" describes where the data comes from, not who writes it.

**Recommendation:** **owner = CRM**, annotated *"data originates in POS via webhook"*. Avoid the
label "Shared" — on a shared database, "Shared" is precisely the status that caused this whole
investigation, and it gives neither team a veto on schema change. Owner to confirm.

### D-3 · `otp_tokens` — CRM now contradicts its own earlier answer

| When | CRM said |
|---|---|
| Round 1, **E3** | "`customer_otps` is the OTP store — **`otp_tokens` does not exist**." On that basis we **deleted the row** from the board and from contract §2. |
| Board reply (now) | `otp_tokens`: `crm:"RW"`, R2/W4, **"STAFF password-reset OTP, `routers/auth.py:608-751`. Distinct from customer scan OTP (`customer_otps`)."** |

Both can be true — E3 was answered in the context of *customer* OTP, and `otp_tokens` is a
*staff* password-reset store that our UAT probe found absent only because the feature has never
been exercised there. But the two statements conflict as written, and we acted on the first one.

**Action:** **restore the `otp_tokens` row** as CRM-owned (staff password reset) and ask CRM to
confirm in one line that E3 was scoped to customer OTP only. Zero impact on us either way — we
touch neither collection — but the board must not carry a row we deleted on a now-contradicted
basis.

---

## 3. One new risk this reply surfaces

CRM **withdrew B4** (the six-field stable-interface promise on `users`) because we withdrew the
ask, and offers to publish a stable read contract *after* the POS switch.

But the POS switch is **step 3** of the sequence and is gated on F3 + POS P5 — so between now and
then **we still read `users` on every admin request** (`server.py:367`, `:587`) with no stability
commitment from its owner. If CRM renames or drops any of
`id, email, phone, password_hash, restaurant_id, pos_id` in that window, **admin login breaks with
no warning**. This is exactly the class of failure change-control clause **C2** exists to prevent.

**Ask to add to the reply:** a one-line commitment — *CRM will give notice before changing those
six field names until the Customer App confirms step 3 is complete.* Not a frozen contract, just
notice. Cheap for them, removes an unmonitored break risk for us.

---

## 4. Effect on the contract and the map

| Item | Before | After |
|---|---|---|
| Contract **O-1** (board JSON missing) | blocking | ✅ **CLOSED** |
| Contract **O-2** (B1/B2 reconciliation) | blocking | ✅ **CLOSED** — resolved by the JSON; our names still go back for the record |
| Contract **O-3** (`templates`) | blocking | ✅ **CLOSED** — CRM-owned, dead fallback, retire in a cleanup CR |
| Contract §2 | 16 rows, 4 provisional | **39 rows, 36 agreed** |
| New items | — | **D-1, D-2, D-3** + the B4-notice ask |
| `OWNERSHIP_MAP.md` | unsigned, waiting on CRM JSON **and** POS | **still unsigned** — CRM half is in; **POS P1/P4/P5 still outstanding**, and D-1/D-2 need the owner. Per the standing rule, the map is **not** being edited yet. |

**Bottom line: the CRM side of the ownership board is complete and agrees with us almost entirely.
What now blocks the freeze is POS, plus three owner rulings — not CRM.**

```text
Reconciliation complete: CRM ownership board reply
Rows: 39 · agreed 36 · contested 3 (pos_event_logs owner semantics · orders/order_items "Shared" label · otp_tokens existence contradiction)
Closes: contract O-1, O-2, O-3
Opens: D-1, D-2, D-3 + B4 change-notice ask
OWNERSHIP_MAP.md: NOT edited — still gated on POS P1/P4/P5 + owner rulings on D-1/D-2
Next: contract v1.0-RC2 (§2 completed) → owner rulings → send reply → chase POS
```
