# CR-085 — Impact Analysis
## Canonical phone + country_code at every CRM write/lookup point

**Date**: 2026-10-09 · **Role**: Planning Agent (Impact Analysis; no code)
**Status**: ✅ **IMPACT ANALYSIS GATE CLOSED 2026-10-09 — all owner decisions FINAL (§7). Implementation Plan for 085-A not yet opened.**
**Risk**: **CRITICAL** — touches `routers/pos.py` customer create/lookup (`_find_or_create_customer`) and the order webhook, both on the addendum §14 "do NOT change without owner approval" list; changes identity-matching on every channel; data backfill implied.
**Owner rulings carried in**: POS shape is already correct (phone + country_code sent separately on sync/create) → the gap is **CRM-side** (2026-10-08). Import bugs to be registered "later" → they are fixed by this CR. Intake Q3 ("ask POS to normalise too") → **moot/optional**.
**Source**: INV-018 GAP-14 (CRITICAL for Customer App) · P-8 · intake `discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md` §2 · `CR_093_IMPACT_ANALYSIS.md` §9–§10a (G1–G4)

---

## 1. Code reality — PARTIAL (one normaliser exists, in one place)
The **only** phone normaliser in CRM is the CSV importer's inline rule (`customers.py:110-116`): strip spaces/`-`/`+`, drop leading `91` if 12 digits, require 10 digits. Every other channel stores and matches the **raw string**.

### 1.1 Write / match points (14) — all exact-string today
| # | Channel | File:line | Match key today | Writes `country_code`? |
|---|---|---|---|---|
| W1 | POS realtime order → `_find_or_create_customer` | `pos.py:661-712` | `pos_customer_id` → else `{user_id, phone: cust_mobile}` | hardcode `+91` |
| W2 | POS payment/order webhook | `pos.py:1737-1757` | `{user_id, phone: customer_phone}`; **creates on blank** | hardcode `+91` |
| W3 | `POST /pos/customers` create | `pos.py:224-247` | `{user_id, phone}` | as sent (default `+91`) |
| W4 | `PUT /pos/customers/{id}` phone change | `pos.py:398-406` | `{user_id, phone}` uniqueness | — |
| W5 | `POST /pos/customer-lookup` | `pos.py:2051` | `{user_id, phone}` | — (read) |
| W6 | `POST /pos/customer-addresses` | `pos.py:2780` | `{phone}` | — (read) |
| W7 | POS event (`/pos/events`) recipient | `pos.py:2429-2443` | `{user_id, phone: customer_phone}` | — |
| W8 | MyGenie customer sync | `customers.py:373, 453-460` | `pos_customer_id` → else `{user_id, phone, country_code}` (F11) | from POS, `+91` if null |
| W9 | CRM "Add Customer" | `customers.py:799-870` | `{user_id, phone}` | as sent |
| W10 | CRM customer update | `customers.py:1807` | `{user_id, phone}` | — |
| W11 | CSV import | `customers.py:1600-1663` | in-memory set (built once) | **not written** (G2) |
| W12 | Public `/register-customer/{rid}` page | `customers.py:1911-1932` | `{user_id, phone}` | as sent |
| W13 | `skip-otp` | `scan.py:207-218` | `{user_id, phone}` raw | hardcode `+91` |
| W14 | `lookup` (CR-093) | `scan.py:277` | `{user_id, phone(digits), country_code}` | — (read) — **the only normalised matcher** |
| W15 | Migration (historical orders) | `migration.py:220` | `{phone: cust_mobile}` (read; GAP-13 never creates) | — |
Also read-only users of `phone`: WhatsApp send (`core/whatsapp.py`, concat `country_code + phone`), loyalty jobs, search regex (`customers.py:1127`, `pos.py:2554`, `helpers.py:318`), customer intelligence.

### 1.2 Live probe (read-only, 2026-10-09) — not repeated for POS routes
`skip-otp` 422 on `{}`; `lookup` 400 on bad phone; POS routes require `X-API-Key` — existence confirmed from code + prior QA (`iteration_1` V12 `customer-lookup` 200). No POST with a real phone issued (would write).

## 2. Data reality (preprod, read-only, 2026-10-09)
| Fact | Value |
|---|---|
| Customers | 7,737 · non-standard phone (`^[6-9]\d{9}$` fails) **390 (5.0%)** |
| Of the 390 → **fixable by normaliser** | 8 strip spaces · 39 drop `+91`/`91` · 6 drop leading `0` = **53** |
| → **genuine international** (`+61`, `+44`, `+34`, `+33`, `+49`, `+975`) | **14** (r541 mostly) |
| → **unfixable junk** | 26 placeholders (`0000000000`…) · 78 too short · 102 11+ digits (not `91`-prefixed) · 84 other (`1111111112`, `2233211222`) · 33 blank = **323** |
| `country_code` | `+91` 7,674 · **missing 53** (CSV imports) · `""` 10 |
| Duplicate groups today (exact string, non-blank) | **14** |
| Duplicate groups **after** normalisation (digits, drop 91/0) | **44** → normalising *reveals* 30 more pairs that are the same diner stored two ways |
| Orders | 67,385 · `cust_mobile` non-standard non-empty **2,992** · empty **47,497** (DATA-A: POS sends no phone on most) · `customer_id` null **48,200** |
Preview = **copy of production data** → these numbers are what production looks like.

## 3. Design (for the Implementation Plan; nothing built)
**One helper** `core/phone.py::normalize_phone(raw: str, country_code: str|None) -> (phone, country_code, status)`:
1. keep digits only; if raw starts with `+<cc>` (not `+91`) → that `cc` wins
2. `+91`/`91` prefix on 12 digits → drop; leading `0` on 11 digits → drop
3. India (`+91`): valid = 10 digits starting 6-9; non-India: valid = 6–15 digits
4. status ∈ `ok | fixed | invalid`
**Apply at W1–W13 + W15** before match and before write; **match key everywhere = `{user_id, phone, country_code}`** (the F11/lookup key). Store raw as `phone_raw` only when `status == fixed` (audit).
**Invalid handling** → owner Q2. **Backfill** of the 390 + 53 missing `country_code` + 44 dup groups → owner Q4 (separate dry-run, overlaps CR-087).

## 4. Blast radius — LARGE
| Area | Why | Regression check |
|---|---|---|
| POS realtime orders (W1, W2) | identity match on every order → wrong match = points to wrong diner; no match = orphan | full POS order webhook flow on 3 restaurants; orphan count must not rise |
| WhatsApp | sends `country_code + phone`; normalised value must still dial | one approved template send to test number (D-test) |
| Customer App | `skip-otp` must find the same diner `lookup` found; a diner whose stored phone was `"+91 98…"` now matches `98…` → **history unified**, token unchanged | lookup→skip-otp→me on fixed records |
| CRM UI | Add/Update customer gets 400 on invalid (Q2) → UX message needed | screenshot |
| Search | regex search on `phone` still works on canonical digits | — |
| Addendum §14 | `pos.py` create/lookup and order webhook edited → **explicit owner approval + full QA suite** | gate |

## 5. Risk
| Dimension | Rating |
|---|---|
| Identity / money | **CRITICAL** — points & wallet follow the matched customer |
| Data | HIGH if backfill included; LOW if normaliser-only (forward-fixing) |
| Rollback | normaliser: revert code. Backfill: needs `phone_raw` + dry-run report; merges are hard to undo → CR-087 territory |
**Recommendation: split delivery** — **085-A** normaliser + unified match key on all writes (forward-fix, no data change); **085-B** data backfill (53 fixable + 53 country_code + 44 dup merges) as dry-run → owner sign-off → apply, coordinated with CR-087.

## 6. Owner decisions (plain-English options)
| # | Question | Options | Recommendation |
|---|---|---|---|
| **Q1** | Non-Indian numbers | (a) India-only: strip to 10 digits, reject the rest · (b) International: keep national digits + real `country_code` from the `+cc` | **(b)** — 14 real foreign diners exist; POS already has the field; lookup already matches this way |
| **Q2** | Values still invalid after normalising (323 today: placeholders, 9-digit, junk) | (a) reject the create/update with a clear error (POS/CRM/app see 400) · (b) accept, store as-is with `phone_invalid: true`, exclude from WhatsApp & lookup | **(b) for POS order paths** (never block a sale), **(a) for CRM Add/Update and `/register-customer`** (humans can fix the typo) |
| **Q3** | Ask POS to normalise too | moot — owner 2026-10-08: POS shape correct, gap is ours | optional note only |
| **Q4** | Backfill existing data | (a) forward-only now (085-A), backfill later with CR-087 · (b) include backfill in this CR | **(a)** — ship the stop-the-bleeding fix first; merges need their own dry-run |
| **Q5** | Default when `country_code` absent **and** number is 10-digit Indian | `+91` | **`+91`** (status quo) |

```text
Planning complete: CR-085
Stage: Impact Analysis
Code reality: PARTIAL (normaliser exists only in CSV import; 14 write/match points store raw)
Risk: CRITICAL (addendum §14 files; identity matching; optional backfill)
Files WILL change (085-A): core/phone.py (new), routers/pos.py (W1–W7), routers/customers.py (W8–W12), routers/scan.py (W13), routers/migration.py (W15)
Files WILL NOT touch: core/loyalty.py, core/coupon.py, core/whatsapp.py send logic, token logic, frontend (except error toast text if Q2a)
Owner decisions: Q1 intl · Q2 invalid handling · Q4 backfill split · Q5 default cc (Q3 moot)
Docs: planning/CR_085_IMPACT_ANALYSIS.md
Next: owner rulings → Implementation Plan (085-A), separate plan for 085-B
```

## 7. Owner rulings — FINAL 2026-10-09
| Q | Ruling | Plain English |
|---|---|---|
| **Q1** | **(a) International** | keep national digits + real `country_code` taken from a leading `+cc`; India = 10 digits starting 6–9; other countries 6–15 digits |
| **Q2** | **Option A — "take the sale, don't invent a person"** | POS paths (order, webhook, sync) **never block**: invalid/blank phone → order saved as **guest** (`customer_id: null`) unless `pos_customer_id` matches; sync-delivered customer with invalid phone stored with **`phone_invalid: true`**, excluded from WhatsApp, lookup, loyalty messaging. **Human paths** (CRM Add/Update, `/register-customer`) → **reject with clear error**. Existing 390 ghosts (4,658 orders, 41,002 pts) untouched until 085-B. |
| Q3 | moot | POS shape is correct; optional note only |
| **Q4** | **(a) 085-A forward-only now** | **ALL data operations (085-B cleanup/merge, CR-087 backfill) deferred until every CR in this batch is complete** — owner rule |
| **Q5** | **(a) default `+91`** | when no `country_code` and number is a valid 10-digit Indian mobile |

### Evidence that drove Q2
Preview (= prod copy): 390 junk-phone customers carry **4,658 orders** and **41,002 points**; 145 have >1 visit. Examples: r71 `"Atul "` / `0000000000` 13 visits; r68 `"Guest"` / `0000000000` ₹2,483; r47 `"Kriele "` / `1234567890` 5 visits. Every cashier typing the same placeholder lands on the same ghost; points pool where nobody can redeem; WhatsApp would target non-numbers.

### Behaviour change to make explicit to POS (informational, with the consolidated contract)
A bill with phone `0000000000` (or any invalid number) and no `pos_customer_id` becomes a **guest order** in CRM instead of a visit on the placeholder customer. If a restaurant wants a shared walk-in bucket, POS should send its `pos_customer_id` — CRM honours that first.

### Live reproduction of G4/W13 (QA, 2026-10-09, during CR-089 QA)
`POST /scan/auth/skip-otp {"phone":"98387 77712","restaurant_id":"689"}` where `9838777712` already exists → **new customer created** with `phone:"98387 77712"` (count 7737→7738; QA deleted doc `730a2719…`). Confirms W13 stores/matches raw string. Fix belongs to **085-A** (normalise before find-or-create at W13). Not patched under CR-089 (identity logic; owner plan gate).
