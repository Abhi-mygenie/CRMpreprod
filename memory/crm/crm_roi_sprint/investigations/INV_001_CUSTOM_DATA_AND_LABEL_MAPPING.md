# INV-001 — `custom_data` payload freedom, template mapping, and "Set Labels" vs normal variable mapping

> **Type**: Investigation Report (read-only, no code changes)
> **Date**: 2026-07-01
> **Requested by**: Owner
> **Role**: Investigation Agent (per `MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` §PART A · Role 6)
> **Related**: CR-030 (Freshmarketer Webhook), CR-DIRECT-SEND (`/pos/send`)
> **Step budget used**: 8 / 10
> **Confidence**: HIGH (evidence from source code + live DB samples)

---

## Questions Investigated

1. In the payload, can I send anything inside the `custom_data` block?
2. How will these data get mapped into the WhatsApp template?
3. What is "Set Labels" and how is it different from the normal template variable mapping?

---

## Q1 — Can I send anything in `custom_data`?

### Answer: **YES — any key/value is accepted.**

Only three fields are formally declared by the Pydantic model; everything else falls through into `model_extra` and is used as variable input.

**Evidence** — `/app/backend/routers/pos.py` lines 2941-2950:

```python
class FreshmarketerCustomData(BaseModel):
    model_config = ConfigDict(extra='allow')   # ← key line

    mobile: Optional[Union[int, str]] = None
    country_code: Optional[Union[int, str]] = None
    template_id: Optional[str] = None
```

Because of `extra='allow'`, any additional field arriving in `custom_data` (e.g. `name`, `meeting_link`, `discount_code`, `foobar`) is preserved on the parsed object and later accessed via `custom.model_extra` (line 3297).

### Reserved keys inside `custom_data`
| Key | Role | Coerced to |
|---|---|---|
| `mobile` | Recipient phone (also falls back to `data.contact.mobile` / `data.contact.phone`) | `str` |
| `country_code` | Country dialing prefix (default `"91"`) | `str` (strips `+`) |
| `template_id` | CRM template UUID from `custom_templates.id` | `str` (required) |

### Everything else = variable input
All other keys are captured verbatim (`model_extra`) and become candidate values for the template's variable slots. There is **no whitelist** and **no schema validation** against a registry.

**Practical consequences:**
- Sending an unknown key (e.g. `favourite_colour`) does **not** cause a validation error — it will just be ignored unless the template's `variable_labels` references that exact label.
- Missing a key that IS in `variable_labels` yields an **empty string** in that slot (not an error). A `missing_labels` warning is added to the API response.
- Keys are matched **by exact string** (case-sensitive). `Name` ≠ `name`.

---

## Q2 — How does `custom_data` get mapped into the template?

### Answer: **By label-name lookup against the template's per-template `variable_labels` dict.**

Each Meta template has variable slots `{{1}}, {{2}}, ...`. On the CRM side, each `custom_templates` document can carry a `variable_labels` dict that translates slot-numbers → human-friendly label names:

```
custom_templates.variable_labels = { "1": "name",
                                     "2": "meeting_link",
                                     "3": "schedule_time" }
```

At send-time (in both `/api/pos/webhook` and `/api/pos/send`), the endpoint loops the labels dict and pulls the value from the payload by that label's name.

**Evidence** — `/app/backend/routers/pos.py` lines 3294-3316:

```python
variable_labels = template.get("variable_labels") or {}
extra_fields: Dict[str, Any] = custom.model_extra or {}

# Special fallback only for "name" — pulls from contact.first_name + last_name
if "name" not in extra_fields and contact:
    fname = contact.first_name or ""
    lname = contact.last_name or ""
    full_name = f"{fname} {lname}".strip()
    if full_name:
        extra_fields["name"] = full_name

body_values: Dict[str, str] = {}
missing_labels: List[str] = []
if variable_labels:
    for idx, label in variable_labels.items():
        val = extra_fields.get(label)
        if val is not None:
            body_values[str(idx)] = str(val)
        else:
            missing_labels.append(label)
            body_values[str(idx)] = ""     # send empty rather than block
```

### Resulting `bodyValues` payload to AuthKey
```
body_values = { "1": "<value for label 'name'>",
                "2": "<value for label 'meeting_link'>",
                "3": "<value for label 'schedule_time'>" }
```

### Rules & edge cases
| Situation | Behaviour |
|---|---|
| Template has `variable_labels` but caller omits a label | Slot filled with `""`. `missing_labels` returned in response `data.warning`. |
| Template has NO `variable_labels` (empty dict) | For `/pos/send`: all slots default to `""`. For `/pos/webhook`: **no `body_values` built at all** — see "Findings & risks" below. |
| Caller sends extra keys not in `variable_labels` | Silently ignored (not sent to WhatsApp). |
| `name` is not supplied in `custom_data` but is in `variable_labels` | Auto-composed from `contact.first_name + contact.last_name`. This fallback is **hard-coded to the key `name` only** — no other key gets this treatment. |
| Values that arrive as int / bool | Coerced with `str(val)`. |

### Live DB evidence (real templates with labels)

Sampled 3 real `custom_templates` from remote MongoDB (`mygenie` DB):

| template_name | status | authkey_wid | variables | variable_labels |
|---|---|---|---|---|
| `e_bill2` | draft | None | `{{1}}..{{5}}` | `{'1':'TestLabel1','2':'TestLabel2','3':'TestLabel3','4':'TestLabel4','5':'TestLabel5'}` |
| `demo_confirmation_1` | approved | 38814 | `{{1}}..{{5}}` | `{'1':'field_1','2':'field_2','3':'field_3','4':'field_4','5':'field_5'}` |
| `test_26_05` | approved | 38811 | `{{1}}` | `{'1':'name'}` |

For `test_26_05`, a caller must send `custom_data: { name: "…" }` — anything else in the label position will be blank.

---

## Q3 — What is "Set Labels" and how is it different from the "normal" template variable mapping?

Two independent mapping systems live in the codebase. They target **different callers and different data sources**.

### A. "Set Labels" mapping — for EXTERNAL push (DirectSend + Freshmarketer)

| Dimension | Value |
|---|---|
| Where stored | `custom_templates.variable_labels` (embedded field on each template doc) |
| Endpoint that writes it | `PATCH /api/whatsapp/custom-templates/{template_id}/labels` |
| UI trigger | "Set Labels" / "Edit Labels" button on `TemplatesPage.jsx` next to each CRM template row |
| What the label is | **Free-form string** chosen by the user (e.g. `meeting_link`, `TestLabel1`, `field_1`) |
| Where the VALUE comes from at send-time | The **external caller** supplies it in the request payload — either as a top-level key in `POST /pos/send`, or inside `custom_data` in `POST /pos/webhook` |
| Registry check | **None** — any string is allowed |
| Modes | Only one — direct key lookup |
| Missing value handling | Empty string + `missing_labels` warning in response |
| Consumed by | `/api/pos/send` (line 3086) and `/api/pos/webhook` (line 3309) |

**Storage shape:**
```
{ "1": "meeting_link", "2": "schedule_time", "3": "name" }
```
Keys = positional slot numbers. Values = arbitrary label names.

### B. "Normal" template variable mapping — for INTERNAL events

| Dimension | Value |
|---|---|
| Where stored | Separate collection `whatsapp_template_variable_map`, one doc per `(user_id, template_id)` |
| Endpoint that writes it | `PUT /api/whatsapp/template-variable-map/{template_id}` |
| UI trigger | Template variable-mapping modal on `TemplatesPage.jsx` (mapping picker with VariablePicker component) |
| What the mapped value is | A **registry key** from `WHATSAPP_VARIABLES` — one of 41 predefined keys (`customer_name`, `points_balance`, `restaurant_name`, `amount`, `coupon_code`, `einvoice_link`, …) |
| Where the VALUE comes from at send-time | Resolved from **internal CRM data** by `core/whatsapp.py resolve_variable()` — walks the `sources` list defined in the registry entry (`{"from":"customer","field":"name"}`, `{"from":"event","field":"points_balance"}`, `{"from":"brand","field":"restaurant_name"}`, etc.) |
| Registry check | **STRICT** — `whatsapp.py` line 907: `if clean_key not in VARIABLES_BY_KEY: raise HTTPException(422, "Unknown variable")` |
| Modes | `map` (registry lookup) · `text` (literal string) · `coupon_pick` (`coupon:<id>:<field>` — code/title/discount/expiry) · `menu_pick` (`menu_item:<id>:<field>` or `menu_category:<id>:<field>`) |
| Missing value handling | Resolver returns empty string; event log flags mismatch |
| Consumed by | Event triggers (`send_bill`, `points_earned`, `birthday`, `anniversary`, `welcome_message`, campaign broadcasts, etc.) via `core/whatsapp.py send_bulk_messages()` |

**Storage shape:**
```
mappings = { "{{1}}": "customer_name",
             "{{2}}": "amount",
             "{{3}}": "your order",       ← text mode (literal)
             "{{4}}": "counter",          ← text mode
             "{{5}}": "restaurant_name" }
modes    = { "{{1}}": "map", "{{2}}": "map", "{{3}}": "text",
             "{{4}}": "text", "{{5}}": "map" }
```
Keys = full `{{N}}` slot form. Values = registry keys OR literal strings depending on the mode.

### Head-to-head comparison

| Aspect | Set Labels (`variable_labels`) | Normal Mapping (`whatsapp_template_variable_map`) |
|---|---|---|
| **Purpose** | External systems **push VALUES** through the CRM | Internal events **resolve VALUES** from CRM data |
| **Who supplies the value** | Caller (Freshmarketer / any DirectSend integrator) | The CRM itself (from customer/order/loyalty data) |
| **Registry constraint** | None — free-form | Strict — registry-key or valid mode |
| **Number of modes** | 1 | 4 (`map` / `text` / `coupon_pick` / `menu_pick`) |
| **Trigger** | `POST /api/pos/send` or `POST /api/pos/webhook` | Order/event webhook, campaign scheduler, cron loyalty jobs |
| **Storage** | Embedded on template doc | Separate collection |
| **Failure mode when unset** | Slot blank + warning | Slot blank + resolver log line |
| **Key form** | Position number `"1"` | Full placeholder `"{{1}}"` |

### One-sentence mental model

> **"Set Labels" = an API contract for external callers** — "here's the vocabulary the outside world must speak to fill this template."
>
> **"Normal mapping" = a data-binding rule for internal events** — "when this event fires, here's where to pull each variable from inside the CRM."

The two systems can co-exist on the same template: a template that is used both by internal events (send_bill) *and* by an external Freshmarketer webhook would have entries in both places, but each endpoint only consults its own mapping.

---

## Findings & Risks Observed (Investigation-only — not fixes)

| # | Finding | Severity | Where |
|---|---|---|---|
| F1 | Labels are matched **case-sensitively**. If a caller sends `Name` but the label is `name`, the slot is blank silently. | LOW UX | `pos.py` line 3311 `extra_fields.get(label)` |
| F2 | Empty-string fill on missing labels: the WhatsApp message will still send, but with blank slots. Meta may reject some templates for blanks. | MEDIUM | `pos.py` lines 3315-3316 |
| F3 | `/pos/webhook` has **no "no-labels-but-has-variables" fallback**. `/pos/send` at least zero-fills each `{{N}}` (lines 3095-3098). If a webhook hits a template with `variable_labels = {}` but `variables = [{{1}}, {{2}}]`, `body_values` stays empty and AuthKey will likely reject. | MEDIUM | Compare `pos.py` 3086-3098 vs 3309-3316 |
| F4 | Only `name` gets the `contact.first_name + last_name` fallback. If a template's label is `full_name` (or `customer_name`), the fallback does **not** apply — payload must supply it. | LOW | `pos.py` lines 3300-3305 |
| F5 | The `variable_labels` UI has no validation preventing the same label being reused across multiple slots (e.g. `{"1":"name","2":"name"}`), which would map both `{{1}}` and `{{2}}` to the same payload value. | LOW | No enforcement in `save_template_labels` (whatsapp.py 280-297) |
| F6 | The label value is free-form. It is possible to accidentally set a label equal to a reserved key (`mobile`, `country_code`, `template_id`). Because these are declared fields on the Pydantic model, `custom.model_extra` would **not** contain them — a caller-supplied `mobile: "9876543210"` in `custom_data` will fill the routing mobile but **not** any `{{N}}` labelled `mobile`. Silent data mismatch. | LOW-MEDIUM | `pos.py` line 3229 vs 3297 |
| F7 | No cross-check between `variable_labels` and the actual `{{N}}` placeholders present in the template body/header/footer. A label configured for slot `"5"` on a template that only uses `{{1}}..{{3}}` would be sent to AuthKey and rejected. | LOW | No validation in `save_template_labels` |

None of the above blocks CR-030; they are ambient behaviours worth capturing if / when a follow-up hardening CR is opened.

---

## Files Consulted (evidence sources)

| File | Lines | Purpose |
|---|---|---|
| `/app/backend/routers/pos.py` | 2920-3024 | DirectSend model, Freshmarketer models, `list_direct_send_templates` |
| `/app/backend/routers/pos.py` | 3027-3155 | `POST /pos/send` mapping logic |
| `/app/backend/routers/pos.py` | 3161-3325 | `POST /pos/webhook` (CR-030) mapping logic |
| `/app/backend/routers/whatsapp.py` | 280-297 | `PATCH /custom-templates/{id}/labels` — "Set Labels" writer |
| `/app/backend/routers/whatsapp.py` | 830-932 | `PUT /template-variable-map/{id}` — normal mapping writer + 4-mode validation |
| `/app/backend/core/whatsapp_variables.py` | 25-90+ | `WHATSAPP_VARIABLES` registry (41 keys, sources, formatters) |
| `/app/backend/core/whatsapp.py` | 520-547 | `resolve_variable()` — normal-mapping resolver against registry |
| `/app/frontend/src/pages/TemplatesPage.jsx` | 340-377, 540-545 | "Set Labels" / "Edit Labels" UI |
| Live DB `mygenie.custom_templates` | 3 sample docs | Real-world `variable_labels` values |
| Live DB `mygenie.whatsapp_template_variable_map` | 2 sample docs | Real-world normal-mapping shape |

---

## Recommendation (next role)

Per Role 6 output format:

```text
Investigation complete: INV-001
Root cause: N/A (this was a clarification / architecture investigation, not a bug)
Classification: CONFIG (mapping design)
Confidence: HIGH
Steps used: 8 / 10
Evidence: this file + inline live-DB samples
Recommendation:
  A) No further action — questions answered.
  B) OPTIONAL — open a Bug/Hardening CR to address F2, F3, F5, F7 (missing-slot
     Meta compatibility, missing-labels-with-variables webhook path, label
     duplication guard, label-vs-placeholder cross-check).
  C) OPTIONAL — extend the /pos/webhook contact fallback to more keys
     (customer_name, phone_number) since only `name` is fallback-enabled today.
Report: memory/crm/crm_roi_sprint/investigations/INV_001_CUSTOM_DATA_AND_LABEL_MAPPING.md
```

Owner decides which (if any) of B/C to promote to a formal CR.

---

*End of INV-001.*
