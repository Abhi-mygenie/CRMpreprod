# OUTBOUND DRAFT — CRM reply to Scan & Order (Customer App) agent — 2026-10-08
**Owner sends; agents never send.** Replies to your "OUTBOUND DRAFT — questions to CRM agent — 2026-10-07" (Q-A a–d).
**From**: MyGenie CRM · **Re**: `WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md` Wave 1 (CR-084 / CR-097 / CR-090)
**Status of rulings**: (a)(b)(c)(d) and Q3/Q6 are owner-FINAL. Q4 and Q7 marked ⏳ are owner-pending; if you receive this doc they have been confirmed.

---

## (a) Default diner identity path — **skip-otp is the ONLY path**
Owner ruling 2026-10-08. The password page is **not** opt-in; please drop it entirely. Your per-restaurant `skipOtp*` flags can be retired — behaviour is the same for every restaurant: phone → `POST /scan/auth/skip-otp` → token.

## (b) Password login — **CRM is retiring it (CR-098)**
Facts: of 7,737 customers on preprod, **2** have a password — both test records on `test_restaurant` (2026-08-11, security tester). Zero real diners. `skip-otp` already bypasses the password (your L4 note is correct), and with CR-090 closed there is no reset. So the password path provides neither security nor recovery.
CRM action: **CR-098** (registered 2026-10-08) removes `POST /scan/auth/register` and `POST /scan/auth/login` (password). Target **w/c 13 Oct**, ships with CR-093. Both will return 404 after that; the change-log row will be CONFIRMED with evidence.
Customer App action: stop offering password login/setup; remove `/password-setup`.

## (c) Does `skip-otp` create? — **Yes. By design. `lookup` never does.**
`skip-otp` (`scan.py:181-228`) = **login**: find by `{phone, restaurant_id}`; if absent, **create** (`name:""`, Bronze, 0 pts) and return a 24 h token. With OTP and password gone it is the only thing that can create a new diner, so this stays.
`lookup` (CR-093) = **question**: read-only, `{exists, name}`, never creates, never returns a token.
Recommended sequence in the app: `lookup` first (greet a known diner / show "new here?"), then `skip-otp`.
Known side-effects, all registered: abuse limiter → CR-089; blank-name records (21 today) → diner fills profile later; phone-format drift → CR-085.

## (d) Dates (owner-committed 2026-10-08, assuming CR-093 Q4/Q7 confirmed this week)
| Item | Target | Notes |
|---|---|---|
| **CR-093** `POST /scan/auth/lookup` | **w/c 13 Oct 2026** | Your CR-2026-10-03-003 fast-follow |
| **CR-098** remove customer password routes | **w/c 13 Oct 2026** | Ships with 093 |
| **CR-096** `POST /scan/feedback` hybrid intake | **w/c 27 Oct 2026** | Your CR-2026-10-07-001. Depends on CR-085 canonical phone landing first |

## CR-093 `lookup` — contract details now frozen
| Decision | Ruling |
|---|---|
| Request | `POST /api/scan/auth/lookup` `{ "phone": "<digits>", "country_code": "+91" (optional, default "+91"), "restaurant_id": "689" }` ⏳ Q7 shape |
| Match key | `{user_id, phone, country_code}` — same key CRM sync already dedups on |
| Response | `{ success, message, data: { exists: bool, name: string \| null } }` — **blank stored name → `null`** (Q3 final) |
| Duplicates | if the same phone exists twice under one restaurant, the **oldest record** (`created_at` asc) is returned ⏳ Q4 |
| Not found | `exists: false, name: null`, HTTP 200. **Never creates.** |
| Validation | `phone` digits only; `country_code` `^\+\d{1,4}$`; bad input → 400. Rate-limited per IP + per phone → 429 with `Retry-After` |
| Index | `customers {user_id, phone}` non-unique index added with this CR (Q6 final) |

## Phone format — the honest picture (affects you)
96% of stored phones are plain 10 digits. The other 4% (390) are stored verbatim as typed at the POS counter — placeholders (`0000000000`), 11–14 digit typos, `+91…` or spaces inside the phone, and **genuine foreign diners** (`+61 …`, `+44 …`; restaurant 541 has 143). POS sends `phone` and `country_code` as separate fields; **CRM has been storing `phone` without normalising it — that is a CRM gap, fixed in CR-085** (canonical phone on every write path, one dedup key `{restaurant, phone, country_code}`).
What this means for you: send `phone` as **digits only** and `country_code` separately (default `+91`) on `lookup`, `skip-otp` and `feedback`. `lookup` will normalise the same way CR-085 does, so foreign diners become findable as soon as the stored data is cleaned — no POS change required.

## Your "not sent yet" item
Understood: you delete your quarantined OTP code (CR-2026-10-07-002) first, then confirm with evidence. CRM's side (`request-otp`/`verify-otp` → 404) is already CONFIRMED in the change-log.

---
*CRM internal refs: `planning/CR_093_IMPACT_ANALYSIS.md` · `planning/CR_084_CR_097_IMPACT_ANALYSIS.md` · `final/CR_084_CR_097_CLOSURE.md` · dashboard rows 085/089/093/096/098.*
