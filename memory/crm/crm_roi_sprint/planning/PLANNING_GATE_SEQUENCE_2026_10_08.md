# Planning Gate — What's on it and recommended sequence
**Date**: 2026-10-08 · **Role**: Planning Agent · **No code.**

## A. CRs currently AT the planning gate (impact analysis done or in progress)

| CR | What it is | Where it stands | What's needed to move |
|---|---|---|---|
| **084** | Delete customer OTP routes in `scan.py` | Impact Analysis **CLOSED** | Owner opens Implementation Plan gate |
| **097** | Delete staff forgot-password / change-password / register + WA `reset_password` event | Impact Analysis **CLOSED** | Owner opens Implementation Plan gate |
| **093** | New `POST /scan/auth/lookup` (does this phone exist? → name) | Impact Analysis written 2026-10-07; Q1/Q2/Q5 answered, **Q3/Q4/Q6/Q7 still open** | Owner answers 4 questions → analysis closes |

## B. CRs REGISTERED and waiting to enter planning

| CR | What it is | Priority / Risk | Open owner questions |
|---|---|---|---|
| **095** | Remove 4 orphan routes that write to Customer App's collections cross-tenant | P1 / CRITICAL | Q1–Q2; GET removal gated on Customer App cutover |
| **085** | One canonical 10-digit phone format at every entry point | P1 / CRITICAL | Q1–Q3 |
| **086** | POS customers missing in CRM (sync failures, `customer_id:null`) | P1 / HIGH | Q1–Q2; depends on 085 |
| **087** | Backfill orphan orders + merge duplicate customers (dry-run first) | P1 / CRITICAL | Q1–Q3; conflicts with "no backfill" sprint rule |
| **094** | Public `GET /scan/loyalty-rules/{rid}` ("you'll earn N points") | P2 / MEDIUM | Q1 |
| **096** | `POST /scan/feedback` hybrid intake | P2 / MEDIUM | none — design frozen in Contract v1.0; depends on 085 |
| **088** | `/scan/*` list hygiene (pagination, totals) | P2 / LOW–MED | none |
| **089** | `skip-otp` rate-limit guard rails | P2 / MEDIUM | Q1–Q2 (risk decision) |
| **090** | Customer OTP delivery provider | 🔴 BLOCKED | **Recommend CLOSE as OBSOLETE** — CR-084 removes the flow it would serve |
| 076 / 077 | Lifecycle re-engage / thresholds (unrelated to Customer App) | P2 | Q1–Q5 each |

## C. Recommended sequence

**Wave 1 — Security cleanup (deletions only, no owner questions left)**
1. **CR-084 + CR-097** → Implementation Plan → Implement → QA → Close. ~1.5 h total. Zero dependencies. Closes two plaintext-OTP leaks. Do first.
2. **CR-090** → Close as OBSOLETE (bookkeeping, 2 min).

**Wave 2 — Customer App unblockers (new read-only endpoints)**
3. **CR-093** → answer Q3/Q4/Q6/Q7 → close analysis → Implementation Plan → Implement. Customer App's #1 ask. Reuses `skip-otp` building blocks; the `request-otp` rate-limit pattern it was going to copy disappears in Wave 1, so plan 093 *after* 084 lands.
4. **CR-094** → one owner question → plan → implement. Small, read-only.

**Wave 3 — Customer identity foundation (CRITICAL, data-touching — needs the most owner time)**
5. **CR-085** phone normalisation — decide first; 086, 087, 096 all depend on it.
6. **CR-086** sync fix — after 085 rule is set.
7. **CR-087** backfill/merge — dry-run only until owner lifts the no-backfill rule.
8. **CR-096** feedback intake — safe only once 085 matching is in.

**Wave 4 — Other-team cleanup + hardening**
9. **CR-095** remove orphan routes — PUTs can go anytime (they're a cross-tenant write hole); GETs wait for Customer App cutover date.
10. **CR-089** skip-otp guard rails — becomes more important once 093 exists (lookup + skip-otp are the two public identity routes).
11. **CR-088** list hygiene — anytime, low risk.

**Why this order**: Wave 1 is pure deletion with every decision already made — fastest security win. Wave 2 is what the Customer App team is actually blocked on. Wave 3 is the hardest and needs owner rulings on production data; starting it before 1–2 would stall the Customer App for weeks. Wave 4 is important but not blocking anyone today.

## D. What the owner needs to decide next (in order)
1. Open Implementation Plan gate for CR-084 + CR-097? (yes/no)
2. Close CR-090 as obsolete? (yes/no)
3. CR-093 Q3 (`name: null` for blank names), Q4 (oldest record wins on duplicate phone), Q6 (`{user_id, phone}` index), Q7 (strict 10-digit only)

---
## E. Revised sequence — 2026-10-08 evening (after Wave 1 closed, CR-098 registered, all CR-093 rulings FINAL, dates committed)

| Order | CR | Why here | Gate state | Owner input still needed |
|---|---|---|---|---|
| 1 | **CR-093** lookup + **CR-098** retire password routes (one plan, one ship) | Promised w/c 13 Oct. All decisions FINAL. No POS dependency. Unblocks Customer App's #1 ask. | IA complete → **open Impl Plan** | none |
| 2 | **CR-089** skip-otp guard rails (rate-limit + Retry-After) | skip-otp is now the ONLY identity path and it creates records — a public, unlimited create endpoint. Small (~1.5 h). Can ship inside the same week as 093. | 📋 → IA | Q1 accept-risk vs implement · Q2 limiter only (password-holder handling is moot after CR-098) |
| 3 | **CR-085** canonical phone + country_code at every write path (incl. the 4 live duplicate gaps G1–G4) | Foundation for 086/087/096 and for lookup finding foreign diners. Entirely CRM-side. Biggest owner-time item. | 📋 → IA | Q1–Q3 from intake (canonical rule, migration of 390 non-standard, country_code default) |
| 4 | **CR-096** feedback hybrid intake | Promised w/c 27 Oct; safe only after 085 matching exists. Design already frozen in Contract v1.0. | 📋 → IA | none |
| 5 | **CR-094** loyalty-rules endpoint | Read-only, ~1 h, no dependency. Slot it anywhere there's a gap; Customer App "nice to have". | 📋 → IA | Q1 per-tier redemption values |
| 6 | **CR-086** POS customers missing in CRM (sync fix) | Needs 085's rule to decide what "same customer" means. | 📋 | Q1–Q2 |
| 7 | **CR-087** backfill orphan orders + merge duplicate groups (dry-run first) | Needs 085 + 086 landed; production data write; owner must lift no-backfill rule. | 📋 | Q1–Q3 |
| 8 | **CR-095** remove 4 orphan cross-tenant routes | PUTs can go anytime (write hole); GETs wait for Customer App cutover. Not blocking anyone this week. | 📋 | Q1–Q2 + cutover date from Customer App |
| 9 | **CR-088** /scan list hygiene | Low risk, anytime. | 📋 | none |
| — | Import bugs (G1 double-insert, G2 missing country_code) | Owner: register **later**; naturally fixed inside CR-085. | not registered | — |
| — | CR-076 / CR-077 lifecycle items | Unrelated to Customer App stream; schedule after the above or in parallel if a second agent session is available. | 📋 | Q1–Q5 each |

**Suggested calendar**
- w/c 13 Oct: 1 (093+098) → 2 (089)
- w/c 20 Oct: 3 (085) planning + implementation
- w/c 27 Oct: 4 (096) → 5 (094)
- Nov: 6 → 7 → 8 → 9
