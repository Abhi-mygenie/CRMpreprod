# CR-015 — Phase 1.5 Live Ground-Truth Probe

**Run at**: 2026-05-28T17:30:18.969064+00:00
**DB**: `mygenie` @ remote `52.66.232.149:27017`
**Target tenant**: R689 = `pos_0001_restaurant_689`
**Mode**: READ-ONLY — no writes performed.

---

## Probe 1 — R689 `whatsapp_event_template_map` rows (Bug #1 verification)

| event_key | template_id value | template_id TYPE | is_enabled | template_name |
|---|---|---|---|---|
| send_bill_manual | `26508` | **`str`** | True | send_bill_to_customer |
| send_bill_auto | `26508` | **`str`** | True | send_bill_to_customer |
| send_bill | `25140` | **`int`** | True | loyality_points_collect_bill |

**Bug #1 verdict**:
- ✅ Mixed-type confirmed: 1 int row(s), 2 str row(s) → Bug #1 IS still active.

## Probe 2 — R689 `whatsapp_template_variable_map` for template 25140 (Bug #2 verification)

**Template 25140 mapping doc**:
```json
{
  "template_id": "25140",
  "template_id_type": "str",
  "template_name": "loyality_points_collect_bill",
  "mappings": {
    "{{1}}": "customer_name",
    "{{2}}": "amount",
    "{{3}}": "order_id",
    "{{4}}": "payment method missing ",
    "{{5}}": "order dare missing ",
    "{{6}}": "points_earned",
    "{{7}}": "points_earned"
  },
  "modes": {
    "{{4}}": "text",
    "{{5}}": "text"
  },
  "updated_at": "2026-05-28T14:25:25.048990+00:00"
}
```

**Per-slot diagnosis**:

| Slot | Value | Mode | Diagnosis |
|---|---|---|---|
| `{{1}}` | `customer_name` | `map` | ✅ valid registry key |
| `{{2}}` | `amount` | `map` | ✅ valid registry key |
| `{{3}}` | `order_id` | `map` | ✅ valid registry key |
| `{{4}}` | `payment method missing ` | `text` | 🟥 **GARBAGE in text mode** — will be sent literally to customer |
| `{{5}}` | `order dare missing ` | `text` | 🟥 **GARBAGE in text mode** — will be sent literally to customer |
| `{{6}}` | `points_earned` | `map` | ✅ valid registry key |
| `{{7}}` | `points_earned` | `map` | ✅ valid registry key |

## Probe 3 — R689 user doc (AuthKey + brand fields presence)

| Field | Present? | Notes |
|---|---|---|
| `authkey_api_key` | ✅ yes | required for send |
| `restaurant_name` | ✅ yes | `Kunafa Mahal` |
| `einvoice_link` | ⚠️ empty | brand var |
| `instagram_link` | ⚠️ empty | brand var |
| `google_review_link` | ⚠️ empty | brand var |
| `feedback_link` | ⚠️ empty | brand var |
| `phone` | ✅ yes | `7307097771` |

## Probe 4 — Last 5 `whatsapp_message_logs` for R689 + `send_bill` (live behaviour)

| created_at | event_type | template_id | template_id type | bodyValues non-empty slots | status | message_id (truncated) |
|---|---|---|---|---|---|---|
| 2026-05-28T14:48:19 | send_bill | `25140` | `int` | 0/0 | read | 3fef11e9b577b665... |
| 2026-05-28T14:47:46 | send_bill | `25140` | `int` | 0/0 | read | 6c46b57241be319b... |
| 2026-05-28T13:57:57 | send_bill | `26508` | `str` | 5/5 | pending | ... |
| 2026-05-28T13:50:51 | send_bill | `26508` | `str` | 5/5 | pending | ... |
| 2026-05-28T08:49:02 | send_bill | `26508` | `str` | 5/5 | pending | cb9a06bb327bbfe1... |

**Latest log row — full `body_values`**:
```json
{}
```

## Probe 5 — Cross-tenant `whatsapp_event_template_map.template_id` type distribution (T2 sizing)

**Total rows scanned**: 4

| template_id type | count |
|---|---|
| `int` | 2 |
| `str` | 2 |

**Tenant breakdown**: 1 tenants total · 1 have ≥1 int row · 1 have ≥1 str row · **1 have BOTH types (mixed)**.

**Sample int rows (up to 10)**:
```json
[
  {
    "user_id": "pos_0001_restaurant_689",
    "event_key": "new_order_customer",
    "template_id": 28311
  },
  {
    "user_id": "pos_0001_restaurant_689",
    "event_key": "send_bill",
    "template_id": 25140
  }
]
```

**Sanity — `whatsapp_template_variable_map.template_id` types**:

Total variable_map rows: 3

| template_id type | count |
|---|---|
| `str` | 3 |

## Probe 6 — Unknown var_keys across all tenants (T7 sizing — bug #2 prevalence)

**Scanned**: 3 variable_map rows across 1 affected tenants.
- Rows with ≥1 unknown var_key in map mode: **0**
- Rows with ≥1 text-mode suspicious value: **1**


**Tenants with text-mode garbage** (top 20):

| tenant | garbage count | sample |
|---|---|---|
| `pos_0001_restaurant_689` | 2 | template `25140` slot `{{4}}` = `payment method missing ` |

---

## Summary — Does v1.1 plan still hold?

- **Bug #1 active**: confirmed via Probes 1, 4, 5. T1 + T2 still needed.
- **Bug #2 (R689 25140 garbage)**: see Probe 2 — current state of slots {4}/{5}/{7}.
- **T2 scope size**: Probe 5 — int rows total = 2, across 1 tenants (1 mixed).
- **T7 broader cleanup scope**: Probe 6 — 0 rows with unknown var_keys + 1 rows with text-mode garbage.

**Next step**: owner reviews this report → confirms (or amends) §13 sign-off boxes → Day 1 starts.

---
**End of Phase 1.5 probe.**