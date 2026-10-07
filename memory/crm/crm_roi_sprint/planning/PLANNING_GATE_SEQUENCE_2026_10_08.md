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
