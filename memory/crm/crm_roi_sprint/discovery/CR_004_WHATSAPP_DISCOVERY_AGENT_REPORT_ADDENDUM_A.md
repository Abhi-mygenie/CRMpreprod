# CR-004 — WhatsApp Module · Discovery Gate Report — ADDENDUM A

**Companion to:** `CR_004_WHATSAPP_DISCOVERY_AGENT_REPORT.md`
**Date:** 2026-05-27
**Mode:** READ-ONLY (no code change)
**Triggered by owner questions:**
1. Variable map (map / text modes) — where do variables come from, is it complete?
2. `whatsapp_templates` (legacy) — is it used? What's the difference between the two?
3. "4 CRM event triggers wired" — what does *wired* actually mean? What can be tested manually?

---

## Q1 · Variable Map — `map` vs `text` modes

### 1.1 What the modes mean (exact behaviour from code)

Stored per template in `whatsapp_template_variable_map`:
```
{
  user_id, template_id, template_name,
  mappings: { "{{1}}": "customer_name", "{{2}}": "points_balance", "{{3}}": "Welcome to MyGenie" },
  modes:    { "{{1}}": "map",           "{{2}}": "map",            "{{3}}": "text" }
}
```

| Mode | Behaviour at send time (`core/whatsapp.py:build_body_values`) |
|---|---|
| `map` (default) | The string in `mappings["{{1}}"]` is treated as a **field key** (e.g. `customer_name`). At send time it is resolved from `customer_data ⊕ event_data` via `field_aliases`. If the key resolves empty → empty string is sent. |
| `text` | The string in `mappings["{{1}}"]` is used **as a literal**. No lookup. (Confirmed in the frontend preview path `resolvePreviewWithSampleData()` line 340–343 — but **note §1.4** below.) |

### 1.2 Where the "available variables" list comes from

Hard-coded in **two** places in the frontend — NOT from the database, NOT from the backend:

| Location | Count | List |
|---|---|---|
| `TemplatesPage.jsx` line 54 | 10 | customer_name, points_balance, points_earned, points_redeemed, wallet_balance, amount, tier, restaurant_name, coupon_code, expiry_date |
| `WhatsAppAutomationContent.jsx` line 307 | 10 | same 10 (independent duplicate) |

Both are static literals. There is no schema endpoint like `GET /whatsapp/variables` that returns the canonical list.

### 1.3 Sample preview data — `GET /api/customers/sample-data`

This endpoint (`routers/customers.py:723`) returns the **first customer** of the logged-in user with this exact shape:

```
{
  "customer_name", "phone", "points_balance", "points_earned",
  "points_redeemed", "wallet_balance", "amount", "tier",
  "coupon_code" (""), "expiry_date" (""), "order_id" (""),
  "visit_count"
},
"restaurant_name"
```

12 keys returned. `coupon_code`, `expiry_date`, `order_id` are always empty strings.

### 1.4 Backend resolver — what actually substitutes the value at send time

`core/whatsapp.py:204 build_body_values()` walks the variable list, looks up each mapped field in a combined `{...customer_data, ...event_data}` dict via this **alias table** (lines 230–237):

```python
field_aliases = {
    "customer_name":   ["name", "customer_name"],
    "phone":           ["phone", "mobile"],
    "points_balance":  ["total_points", "points_balance", "points"],
    "wallet_balance":  ["wallet_balance", "wallet"],
    "tier":            ["tier", "membership_tier"],
    "visit_count":     ["total_visits", "visit_count"],
}
```

🔴 **`text` mode is NOT honoured in `build_body_values`.** It always treats the mapped string as a *field key* and does `get_value()` lookup. The `text` mode is only respected on the **frontend preview** (and in the `TestTemplateModal` for the test-send button), never in the **production trigger path**. This means:

- If owner picks mode=`text` and types `"Welcome to MyGenie"` for `{{1}}`, the **preview will look fine**, the **manual test-template send will work** (the test modal pre-fills `body_values` from text mode — see `WhatsAppAutomationContent.jsx:42-44`), but the **automated event trigger will send an empty `{{1}}`** because `get_value("Welcome to MyGenie")` returns `""`.

This is a real bug, not just a discovery observation.

### 1.5 Coverage map — declared variables vs available data

| Variable (declared in UI list) | Present in `sample-data`? | Resolvable at runtime (alias)? | Set by any event_data? | Verdict |
|---|---|---|---|---|
| `customer_name` | ✅ | ✅ (`name`/`customer_name`) | n/a | ✅ Complete |
| `points_balance` | ✅ | ✅ (`total_points`/`points_balance`/`points`) | ✅ (all triggers pass `points_balance`) | ✅ Complete |
| `points_earned` | ✅ (from `total_points_earned`) | 🔴 No alias, but set by `points_earned`/`bonus_points`/`points_earned_event` (`event_data["points_earned"]`) | ✅ | 🟡 Works only via event_data; alias missing |
| `points_redeemed` | ✅ (from `total_points_redeemed`) | 🔴 No alias | 🔴 No emitter passes `points_redeemed` in event_data (grep) | 🔴 Will be blank |
| `wallet_balance` | ✅ | ✅ (`wallet_balance`/`wallet`) | ✅ (wallet_credit/debit) | ✅ Complete |
| `amount` | ✅ (from `total_spent`) | 🔴 No alias | ✅ (`event_data["amount"]` in wallet, `order_amount` in pos.py NOT named `amount`) | 🟡 Inconsistent — pos passes `order_amount`, not `amount` |
| `tier` | ✅ | ✅ (`tier`/`membership_tier`) | ✅ (`tier_upgrade` passes `new_tier` but variable is `tier`) | 🟡 `tier_upgrade` writes `new_tier` not `tier`, so `{{tier}}` may not fill on upgrade event |
| `restaurant_name` | ✅ (top-level, NOT inside `sample`) | 🔴 No alias and **not passed to `customer_data` or `event_data`** by any trigger | 🔴 Never | 🔴 Always blank in real sends |
| `coupon_code` | ✅ (empty) | 🔴 No alias | ✅ (only by `coupon_earned` in `routers/coupons.py:189`) | 🟡 Only when coupon_earned fires |
| `expiry_date` | ✅ (empty) | 🔴 No alias | ✅ (by `points_expiring` job) | 🟡 Only on expiry reminder |
| `visit_count` | ✅ | ✅ (`total_visits`/`visit_count`) | n/a | ✅ Complete |
| `phone` | ✅ | ✅ (`phone`/`mobile`) | n/a | ✅ Complete |

Not listed in the UI but emitted by event_data (would be useless because owner cannot select them):
- `order_id`, `pos_order_id`, `order_amount`, `bonus_points`, `birthday_bonus`, `anniversary_bonus`, `first_visit_bonus`, `discount`, `discount_type`, `discount_value`, `new_tier`, `old_tier`, `wallet_used`, `feedback_message`, `feedback_id`, `rating`, `source`, `expiring_points`

**Verdict on completeness:**
🟡 **Incomplete and inconsistent.** Of 10 UI variables: 4 work cleanly, 6 have either missing aliases, naming mismatches with what event code passes, or are simply never populated at runtime. There is no end-to-end checklist guaranteeing "if the owner picks variable X, it will fill in event Y."

### 1.6 Where variables come from — concise picture

```
┌──────────────────────────────────────┐
│ UI "Available Variables" list (10)   │   ← hard-coded duplicate in two .jsx files
└──────────────┬───────────────────────┘
               │ owner picks one per {{n}}
               ▼
┌──────────────────────────────────────┐
│ whatsapp_template_variable_map       │   ← DB store
│   mappings: { "{{n}}": "field_key" } │
│   modes:    { "{{n}}": "map"|"text"} │
└──────────────┬───────────────────────┘
               │
   ┌───────────┴───────────┐
   │ preview/test path     │ production trigger path
   ▼                       ▼
sample-data API +     build_body_values()
mode honoured        on customer + event_data
(map AND text)       via field_aliases (6 entries)
                     **mode IGNORED** ← bug
```

---

## Q2 · `whatsapp_templates` (legacy) — Used or Dead?

### 2.1 Two collections, two purposes

| Collection | Purpose by design | Schema |
|---|---|---|
| **`whatsapp_templates`** (legacy) | In-CRM "freeform" templates that store the full plaintext body with `{customer_name}`-style placeholders. Created by `setup-defaults` / `create_default_whatsapp_templates`. 10 seeded per new user at register time. | `id, user_id, name, message, media_type, media_url, variables[], is_active` |
| **`custom_templates`** | Owner-authored Meta-managed templates with `{{1}}, {{2}}` numeric placeholders, structured (header / body / footer / buttons), with `status: draft → pending → approved` and a `meta_template_id` link. | `id, user_id, template_name, category, language, header_type, header_content, body, footer, buttons, variables[], body_examples, header_examples, meta_template_id, status` |

### 2.2 Who reads `whatsapp_templates` at runtime?

Comprehensive grep result on backend:

```
routers/whatsapp.py        — only CRUD endpoints + automation_rules CRUD (POST/GET/PUT/DELETE on /templates and /automation)
routers/auth.py            — only seeds them on register
core/helpers.py            — only generates the seed payload
core/whatsapp.py           — ❌ does NOT reference whatsapp_templates
core/loyalty.py            — ❌ does NOT reference whatsapp_templates
core/loyalty_jobs.py       — ❌ does NOT reference whatsapp_templates
routers/pos.py / coupons.py / wallet.py / points.py / feedback_service.py — ❌ none reference whatsapp_templates
```

`trigger_whatsapp_event()` reads `whatsapp_event_template_map` only (line 286 of `core/whatsapp.py`), where `template_id` is the **AuthKey `wid`**, NOT a `whatsapp_templates.id`.

### 2.3 What about `automation_rules`?

Same answer: **only the WhatsApp router itself touches it.** No trigger code reads `automation_rules` to decide whether to send. Where it appears:
- Seeded at register and `setup-defaults`
- CRUD endpoints (`/whatsapp/automation`, `/whatsapp/automation/{id}`, toggle, `automation-with-templates`)
- Frontend (`WhatsAppAutomationContent.jsx` lines 787–826) reads/writes them

…but nothing at send time consults them.

### 2.4 Side-by-side comparison

| Aspect | `whatsapp_templates` + `automation_rules` (legacy) | `custom_templates` + `whatsapp_event_template_map` + `whatsapp_template_variable_map` (current) |
|---|---|---|
| Created when? | Auto-seeded on user register (10 templates + 10 rules) | Owner authors manually via Templates page |
| Placeholder syntax | `{customer_name}` (curly + name) | `{{1}}`, `{{2}}` (Meta-style numeric) |
| Provider awareness | None — provider-agnostic | Tied to Meta + AuthKey (`meta_template_id`, AuthKey `wid`) |
| Used at send time? | 🔴 **No** | ✅ **Yes** |
| UI surface present? | ✅ Old Templates tab + Automation tab inside `WhatsAppAutomationContent.jsx` lines 745–826 still call `/whatsapp/templates` and `/whatsapp/automation` | ✅ Templates page + Automation event rows |
| Visible to end-user? | Depends on which tab/view they land on — both surfaces co-exist in code |  |
| Risk | Owner edits a legacy template → expects message to change → nothing changes at runtime → confusion / "WhatsApp not working" tickets | — |

### 2.5 Verdict

🔴 **`whatsapp_templates` and `automation_rules` are dead at runtime** but **alive in the UI and DB.** They are an artefact of an earlier design where CRM owned templates entirely (before Meta-managed templates were mandated). They:
- Get created on every new signup → unnecessary DB rows
- Have full CRUD UIs → owner can edit them and reasonably expect changes to take effect
- Are ignored by every emitter

**Recommendation for Planning Gate (not executed here):** delete the legacy CRUD routes, remove the seed call on register, drop the two collections on a controlled migration. Keep only the current 3-collection model.

---

## Q3 · "4 CRM event triggers wired" — What does *wired* mean?

### 3.1 Definition of "wired" in this report

An event is **wired** when **all four** conditions are true:

1. **Emit site exists** — some code path calls `trigger_whatsapp_event(db, user_id, "<event>", customer, event_data)` (or the helper `trigger_points_earned_event`).
2. **Event key matches** `whatsapp_event_template_map`'s lookup key (i.e., it is a value the owner can map a template against — either listed in `AUTOMATION_EVENTS` master or at least settable via the API even if hidden in the UI).
3. **At least one runtime path can reach it without an external POS call.**
4. **A WhatsApp message can be observed** when the path is exercised, given (a) an AuthKey key on the user and (b) a mapping exists for that event_key.

### 3.2 The 4 confirmed wired CRM events

| Event | Emit site | What triggers it (end-user action) | Event data fields passed |
|---|---|---|---|
| `points_earned` | `routers/coupons.py:196`, `routers/wallet.py:60,70`, `routers/points.py:137` (via `trigger_points_earned_event`) | Coupon redeemed, wallet credit/debit transaction, manual bonus points award | `points_earned`, `points`, `source`, `points_balance`, `balance_after` |
| `birthday` | `core/loyalty_jobs.py:105` inside `run_birthday_bonus` | Daily cron at 00:00 UTC OR manual `POST /api/cron/trigger` — fires for any customer whose DOB matches today and birthday_bonus is enabled | `birthday_bonus`, `points_balance` |
| `anniversary` | `core/loyalty_jobs.py:205` inside `run_anniversary_bonus` | Same scheduler; matches today against customer's `customer_anniversary_date` | `anniversary_bonus`, `points_balance` |
| `points_expiring` | `core/loyalty_jobs.py:288` inside `run_expiry_reminders` | Same scheduler; fires N days before any customer's earliest expiring earn-transaction reaches expiry | `expiring_points`, `expiry_date`, `points_balance` |

### 3.3 Why other observed `trigger_whatsapp_event(...)` calls do NOT count as "wired"

| Event called by code | Why not wired |
|---|---|
| `send_bill`, `first_visit`, `tier_upgrade`, `coupon_earned`, `wallet_credit`, `wallet_debit`, `bonus_points`, `feedback_received` | Not present in `AUTOMATION_EVENTS` master list → UI never exposes them in the event picker → no owner can save a mapping → `get_event_template_config()` returns `None` → send silently skipped. The emit code runs but the send is a no-op. |
| 11 declared POS events + `welcome_message` + `feedback_request` + `reset_password` | Not emitted by any CRM code path. Only reachable via external POS → `POST /api/pos/event`, which translates an external event name into an internal one (`pos.py:2174`). No CRM-only user action fires them. |

### 3.4 Manual verification — exact steps per wired event

> Prerequisites for every test: (1) Owner has saved a valid AuthKey API key under Settings, (2) Owner has saved a `whatsapp_event_template_map` row for that event_key pointing at an AuthKey `wid`, (3) Test customer has a valid phone + country_code.

#### T-W1 · `points_earned`

```bash
# Setup
curl -X PUT  "$API/api/whatsapp/event-template-map" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"mappings":[{"event_key":"points_earned","template_id":"<authkey_wid>","template_name":"Points Earned","is_enabled":true}]}'

# Fire (option A — manual bonus)
curl -X POST "$API/api/points/transactions" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"customer_id":"<id>","points":50,"transaction_type":"bonus","reason":"manual test"}'
```
**Expected:** A new row in `whatsapp_message_logs` with `event_type=points_earned`, `status=pending` (or `delivered` after webhook). The customer receives the message on WhatsApp.

**Observability:** `GET /api/whatsapp/message-logs?event_type=points_earned&limit=5` shows the row.

#### T-W2 · `birthday`

```bash
# Setup: pick a customer whose date_of_birth.month/day == today
curl -X PUT  "$API/api/whatsapp/event-template-map" -H "..." \
  -d '{"mappings":[{"event_key":"birthday","template_id":"<wid>","template_name":"Birthday","is_enabled":true}]}'

# Fire (manually trigger today's cron without waiting until midnight UTC)
curl -X POST "$API/api/cron/trigger" -H "Authorization: Bearer $TOKEN"
```
**Expected:** Response contains `birthday_bonus.customers_awarded > 0`. A `whatsapp_message_logs` row appears with `event_type=birthday`.

**Catch:** Customer must have `date_of_birth` set AND not have already received this year's birthday bonus AND user's `loyalty_settings.birthday_bonus_enabled` must be true (and `birthday_bonus_points > 0`).

#### T-W3 · `anniversary`

Same shape as T-W2 — use `customer_anniversary_date` matching today.
```bash
curl -X POST "$API/api/cron/trigger" -H "Authorization: Bearer $TOKEN"
```
**Expected:** `anniversary_bonus.customers_awarded > 0` + matching message log row.

**Catch:** `loyalty_settings.anniversary_bonus_enabled` must be true.

#### T-W4 · `points_expiring`

```bash
# Setup: ensure loyalty_settings.points_expiry_months > 0 AND a customer has an
# earn/bonus points_transaction whose age is between
# (expiry_months*30 - reminder_days) and (expiry_months*30) days
curl -X POST "$API/api/cron/trigger" -H "Authorization: Bearer $TOKEN"
```
**Expected:** Response `expiry_reminders.customers_to_remind > 0` + a message log row with `event_type=points_expiring`. `last_expiry_reminder` is stamped on the customer to prevent re-fire same month.

### 3.5 Negative tests (prove the unwired ones don't fire)

| Event | How to attempt | Expected (proves unwired) |
|---|---|---|
| `wallet_credit` | `POST /api/wallet/transactions` with `transaction_type=credit` | Backend log line `No template configured for event wallet_credit, skipping`. No row in `whatsapp_message_logs` for `wallet_credit`. Confirms event drift. |
| `send_bill` | `POST /api/pos/orders` (creates order) | Same — backend log says no config for `send_bill`. UI provides no way to add one. |
| `tier_upgrade` | Award enough points to cross tier boundary | Same — silently skipped. |

### 3.6 What "wired" does NOT mean

- It does **not** mean variable substitution is correct — see Q1 §1.5
- It does **not** mean opt-in / opt-out is enforced — none exists
- It does **not** mean the message is necessarily *delivered* — AuthKey can reject (e.g., insufficient balance, template-not-approved). Delivery is observable only via the status webhook → `whatsapp_message_logs.status`.

---

## Net-Net (Owner's Decision Points)

| Decision needed | Options |
|---|---|
| **D1.** Honour `text` mode in `build_body_values`? | (a) Yes — fix the resolver to short-circuit when `modes[key]=="text"` (small change), (b) No — drop `text` mode from UI to remove the lie. |
| **D2.** Variables list — single source of truth | (a) Move to backend (`GET /api/whatsapp/variables`) and have UI consume it, (b) Keep two static lists but reconcile by hand. |
| **D3.** Legacy `whatsapp_templates` + `automation_rules` | (a) Delete (recommended), (b) Back-fill so they actually work, (c) Leave dead (risky). |
| **D4.** Event-list reconciliation | Rename either code or master (e.g., `first_visit` ↔ `welcome_message`, `feedback_received` ↔ `feedback_request`, `send_bill` ↔ `send_bill_auto`); add the missing 7 to the master. |
| **D5.** What "WhatsApp is working" means to you | The 4 wired CRM events (Q3) work in the verification harness above. Marketing/segment broadcasts are NOT working. POS events depend on external POS calling `/api/pos/event`. |

**Status:** `cr004_phase_0_discovery_addendum_A_complete`

End of Addendum A.
