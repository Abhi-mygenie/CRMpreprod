# Questions for CRM — Shared DB Contract Clarification
## From: MyGenie Customer App team
## Ref: CRM_BRIEF_2026-09-15 + CRM Gap Response 2026-09-15
## Date: 2026-09-15

This document collects all outstanding questions we have for the CRM team before the shared
OWNERSHIP_MAP.md can be finalised. Some questions were in our original brief (Q2/Q4/Q4b/Q5),
some are new based on the gaps CRM highlighted in their response.

Please answer every question. Where the answer is yes/no, yes/no is sufficient.
Where a code reference helps, please include the file and line number.

---

## Section A — Original Questions (from CRM_BRIEF_2026-09-15, still unanswered)

### A1 — `customer_app_config` write lock (original Q2)

Does your admin UI or any CRM automated workflow actively call
`PUT /api/scan/config/{restaurant_id}` today?

- If **yes**: (a) Which keys does it write? (b) Can this path be made read-only or disabled,
  given that the owner has assigned config writes to the Customer App admin UI (OD-7)?
  Or do you prefer a key partition — CRM writes a defined subset, Customer App writes the rest?
- If **no**: Can you formally disable or tombstone this endpoint?

This is our highest-priority question. If both admin UIs write to the same 106-key config doc
without coordination, one team's save silently overwrites the other's.

---

### A2 — `dietary_tags_mapping` write lock (original Q4)

Does your admin UI or any CRM workflow actively call
`PUT /api/scan/menu/dietary-tags/{restaurant_id}` today, and does this write
to the `dietary_tags_mapping` collection in the shared `mygenie` DB?

- If **yes**: Who should own the write going forward? We defer to CRM if you are the active writer.
- If **no**: Can you confirm you do not write to this collection?

---

### A3 — `feedback` same collection? (original Q4b)

Does `POST /api/scan/feedback` write to the same `feedback` collection our backend writes to?
If different, what is the exact collection name your endpoint uses?

Low priority — append-only, no overwrite risk. We just need the map to be complete.

---

### A4 — JWT signing secret (original Q5) ⚠️ Security — please prioritise

Is the HS256 signing secret your CRM uses to issue customer tokens
(`/scan/auth/skip-otp`, `/scan/auth/login`, etc.) **different** from the `JWT_SECRET`
used by the Customer App backend?

- **Answer yes or no only.** Do not share the actual value.
- If **same**: both teams must rotate to distinct secrets before the next release.
  We can coordinate timing.
- Why it matters: if the same secret is used, a CRM-issued customer token can be validated
  by our admin routes, which is an unintended security boundary crossing.

---

## Section B — New Questions Based on CRM's Gap Response

### B1 — Missing collections not in our live UAT DB

The following collections appeared in CRM's gap response but do **not** exist in our
shared UAT `mygenie` DB (we enumerated all 33 collections via a live probe):

| Collection | Status in our UAT DB |
|---|---|
| `pos_event_logs` | NOT FOUND |
| `otp_tokens` | NOT FOUND |
| `segment_whatsapp_config` | NOT FOUND |
| `message_logs` | NOT FOUND |

Questions:
- Do these collections exist in your **production** DB?
- Are they expected to be created on UAT as well, or are they production-only?
- For `message_logs` specifically: CRM's response noted this is a legacy collection
  (pre-CR-004). Is it still active with live data in production, or has it been replaced?
- For `otp_tokens`: is this distinct from `customer_otps` (which does exist in our UAT DB
  with 5 docs)? What is the difference in purpose?

We will add all four to our Group D (CRM-exclusive) once you confirm they exist and are CRM-owned.

---

### B2 — Four collections in our Group D not in CRM's addendum

The following four collections **do exist** in our live UAT DB (confirmed by probe)
but CRM's response says they are not in CRM's own addendum:

| Collection | Docs in UAT DB |
|---|---|
| `coupon_distributions` | 2 |
| `customer_documents` | 114 |
| `import_logs` | 44 |
| `webhook_logs` | 10 |

We have zero code touching any of them. We listed them as CRM-owned by elimination.

Questions:
- Do you own `coupon_distributions` and `customer_documents`?
  (We believe these are from later CRM feature CRs not yet in your addendum.)
- We are separately asking the POS team about `import_logs` and `webhook_logs`
  as these may be written by POS. Can you confirm whether CRM writes to either?
- If any of these are owned by a third party (POS or another system), please say so.
  We will not assign ownership in our map until confirmed.

---

### B3 — `restaurant_id` format on config writes (Gap 6)

CRM's response noted that your `_normalize_restaurant_id()` function converts
`"689"` → `"pos_0001_restaurant_689"` (full format), but your `PUT /scan/config/{rid}`
stores "whatever ID was passed at creation time — no normalisation on write."

Our findings from the live DB:
- All 13 existing `customer_app_config` docs use **short format** (e.g., `"689"`, `"478"`)
- No `pos_0001_restaurant_...` format exists in this collection today
- Our backend always derives `config_key` from `users.restaurant_id`
  which is stored in short format (confirmed: `users.restaurant_id = '689'`)

Question:
- Does your `PUT /scan/config/{restaurant_id}` normalise the incoming ID to short format
  before the `update_one`? If yes — no risk. If no — there is a latent duplicate-doc
  risk if your endpoint is ever called with a full-format ID.
- Has CRM's PUT ever written a new `customer_app_config` doc in production?
  If yes, what `restaurant_id` format was stored?

---

### B4 — `users` collection stable interface contract (Gap 7)

Our admin login reads the `users` collection with a direct `find_one`.
The exact fields we depend on are:

| Field | How we use it |
|---|---|
| `email` / `phone` | Lookup key for login |
| `password_hash` | bcrypt verify |
| `restaurant_id` | Stored in JWT + used as config_key for all config writes |
| `pos_id` | Used to construct `user_id` = `pos_{pos_id}_restaurant_{restaurant_id}` |
| `id` | Stored in JWT as the user identifier |

If any of these six fields are renamed, our admin login breaks silently.

Request:
- Will CRM treat these six fields as a **stable interface** for Customer App
  and notify us before any rename, removal, or type change?
- If CRM plans to change the `users` schema in an upcoming CR, please flag it to us first.

---

## Summary — Questions by Priority

| # | Question | Priority | Section |
|---|---|---|---|
| 1 | JWT secret same or different? | P0 Security | A4 |
| 2 | `customer_app_config` — does CRM actively write today? | P1 | A1 |
| 3 | `dietary_tags_mapping` — does CRM actively write today? | P1 | A2 |
| 4 | `restaurant_id` format on CRM config PUT (normalised?) | P1 | B3 |
| 5 | `users` stable interface commitment | P1 | B4 |
| 6 | Missing collections (pos_event_logs etc.) — exist in prod? | P2 | B1 |
| 7 | Four unowned collections — who owns them? | P2 | B2 |
| 8 | `feedback` — same collection? | P3 | A3 |

---

*Awaiting answers before finalising OWNERSHIP_MAP.md and sharing it back for sign-off.*
*POS team and owner are receiving separate briefs in parallel.*
