# INVESTIGATION — INV-2026-10-03-001
# Production-grade secrets and real customer PII present in UAT / preprod

| Field | Value |
|-------|-------|
| **ID** | INV-2026-10-03-001 |
| **Title** | UAT/preprod issues `dp_live_`-prefixed CRM credentials, and the shared UAT database carries real customer PII — non-production environments are holding production-grade secrets and personal data |
| **Classification** | **SECURITY INVESTIGATION** (not a code CR — the defect is in data-handling and environment practice) |
| **Date Raised** | 2026-10-03 |
| **Raised By** | Owner, on the O-16 finding: *"flag as security issue, this will be separate investigation... while UAT data dump for customer related info, tokens etc should not be dumped, we can file brief to devops team"* |
| **Severity** | **P1 — SECURITY.** No exploit observed; the exposure is structural and ongoing |
| **Risk** | **CRITICAL by class** — credential exposure + personal-data exposure across environment boundaries. Blast radius is **organisational, not code**: Customer App, CRM, POS and anyone with preprod access |
| **Status** | 🔍 **OPEN — brief ready for DevOps/Ops** (`BRIEF_FOR_DEVOPS_UAT_DATA_HYGIENE.md`) |
| **Owning team** | **DevOps / Ops**, with CRM and POS input. **Not a Customer App code item** |
| **Duplicate check** | **DISTINCT.** Related, not duplicate: **CR-2026-10-03-002** (projects CRM's secrets out of *our* process — reduces our blast radius, does nothing about preprod issuing the key) · **contract O-7 / GAP-11** (same class — environment secret hygiene; this investigation's **Q9** should be answered with it) · **CR-2026-07-03-012** (leaked-credential scrub — docs/CI hygiene in our repo, not environment data). No existing item covers UAT data provenance or PII |
| **Code change in this repo** | **NONE expected.** See §6 |

---

## 1. What was observed

### Finding 1 — a `dp_live_` credential issued by a preprod host
Logging in to **`https://preprod.mygenie.online/api/v1`** via
`POST /auth/vendoremployee/login` **and** `/auth/vendoremployee/common-login` returns:

```
crm_token: dp_live_<redacted>
```

| Property | Observation | Why it matters |
|---|---|---|
| Prefix | **`dp_live_`** | Conventionally denotes a **live/production** credential. Issued here by a **preprod** host |
| Stability | **Identical across two separate logins, on both endpoints** | Not a session token — a **stored, long-lived API key** |
| Likely origin | the `api_key` field on CRM's `users` row | the same secret class that `CR-2026-10-03-002` exists to stop loading into our process memory |
| Who can obtain it | **anyone with preprod POS login credentials** | preprod credentials are shared far more freely than production ones |

**Two possibilities, and we cannot tell which from outside:**
- **(a)** the prefix is **misleading** — it is a preprod key badly named `live`. Low impact, but it
  makes every future secret review unreliable; or
- **(b)** preprod genuinely **hands out a production CRM credential.** In that case the production
  CRM API is reachable by anyone holding a preprod POS account.

**(b) must be disproved, not assumed away.**

### Finding 2 — the shared UAT database holds real customer PII
Observed incidentally while probing the shared `mygenie` database at `52.66.232.149` during this
investigation (read-only, no writes):

| Collection | Rows seen in UAT | Content class |
|---|---|---|
| `customers` | present, incl. 17 for one restaurant alone | **names, phone numbers**, loyalty balances |
| `orders` | 24 for one restaurant, dated to 2026-09-18 | order history tied to customers |
| `users` | present | admin emails, **`password_hash`**, and CRM's `api_key`, `authkey_api_key`, `mygenie_token` |
| `customer_documents` | **114** | **hotel guest identity documents** (S3-backed, per CRM's CR-071/072/075) |
| `feedback`, `points_transactions`, `wallet_transactions` | present | customer-linked behavioural data |

The owner's framing is the right one: **a UAT data dump should not carry customer-identifying
information or live tokens.** What is there today looks like production data copied down, or
production-grade data accumulated in place.

`customer_documents` is the sharpest row: **114 identity documents** in a non-production
environment is a different category of problem from a stale phone number.

## 2. Why this is an investigation and not a CR

Nothing in the Customer App repository causes either finding, and no change here fixes them:

- We do not issue `crm_token` — POS does.
- We do not populate UAT — whoever seeds/dumps it does.
- We hold **no** copy of the `dp_live_` value, and never store it (`refresh_pos_token` returns only
  POS's own `token`; the CRM key is ignored).

The defect lives in **environment and data-handling practice**, which is DevOps/Ops territory with
CRM and POS input. Hence: investigation + brief, not a code CR. Filing it as a CR against this repo
would put it in a queue where nobody who can fix it would ever read it.

## 3. Immediate containment (owner decision, outside this repo)

| # | Action | Owner |
|---|---|---|
| 1 | Ask POS/CRM whether `dp_live_*` on preprod is a **production** credential or a misnamed preprod one | owner → POS/CRM |
| 2 | **If production: rotate it.** It has been pasted into a chat transcript and returned in two test HTTP responses during this session — treat as **exposed** regardless of the answer to (1) | CRM |
| 3 | Decide whether preprod should be issuing any `live`-prefixed credential at all | CRM + Ops |
| 4 | Scope how UAT is populated — production dump, synthetic data, or accreted real traffic | DevOps |
| 5 | Treat the **114 `customer_documents`** in UAT as the highest-priority row of the data question | DevOps + CRM |

## 4. Questions this investigation must answer

| # | Question | Who |
|---|---|---|
| Q1 | Is the preprod `crm_token` a production credential? | CRM |
| Q2 | Why is a credential with a `live` prefix minted by a preprod host? | CRM/POS |
| Q3 | Is it static per restaurant, and what is its lifetime / rotation policy? | CRM |
| Q4 | How is the UAT `mygenie` database populated — dump from production, synthetic, or organic? | DevOps |
| Q5 | If dumped: is **any** anonymisation applied to `customers`, `users`, `customer_documents`? | DevOps |
| Q6 | Who has network and credential access to the UAT DB host, and is that access logged? | DevOps |
| Q7 | Are the **114 UAT `customer_documents`** real guest identity documents? | CRM/DevOps |
| Q8 | Is there a documented policy for what may be copied into non-production? | DevOps |
| Q9 | Do preprod and production share **any** secret (JWT, API keys, DB credentials)? This is the same class as contract **O-7**, which is already open on the owner | DevOps |

## 5. What we have deliberately NOT done
- **Not recorded the `dp_live_` value** in any memory document. Referenced only as `dp_live_<redacted>`.
- **Deleted** the raw HTTP response files from `/tmp` after inspection.
- **Not probed production.** We have no access and did not attempt any.
- **Not written** to the shared database at any point in this investigation.
- **Not enumerated or opened** any `customer_documents` content — only counted rows.

## 6. Scope boundary for the Customer App

**No code change is expected in this repository.** Two existing items are adjacent and already
registered — neither is a substitute for this investigation:

| Item | Relationship |
|---|---|
| **CR-2026-10-03-002** (P0 `users` field projection) | Stops **our process** loading CRM's `api_key`/`authkey_api_key`/`mygenie_token`. Reduces *our* blast radius; does nothing about preprod issuing the key. **This finding is direct evidence the projection targets a real secret, not a theoretical one** |
| **Contract O-7** (GAP-11 live-host JWT check) | Same class of question — environment secret hygiene — already open with the owner. **Q9 should be answered together with O-7** |

If the investigation concludes the Customer App must change something (for example: stop forwarding
`crm_token` anywhere, or pin preprod to a non-live key), **that becomes a new CR at that point** —
not retrofitted into this document.

```text
Intake complete: INV-2026-10-03-001
Classification: SECURITY INVESTIGATION (data-handling / environment practice)
Severity: P1 SECURITY · Risk: CRITICAL by class · Blast radius: organisational
Owning team: DevOps/Ops (+ CRM, POS). NOT a Customer App code item
Duplicate check: DISTINCT (related: CR-2026-10-03-002, contract O-7/GAP-11, CR-2026-07-03-012)
Evidence: captured (two live login calls to preprod returning an identical dp_live_ crm_token; read-only row counts on the shared UAT DB)
Findings: (1) dp_live_-prefixed static CRM credential issued by preprod; (2) real customer PII in the shared UAT DB, incl. 114 customer_documents
Secret value: NOT recorded anywhere · /tmp responses deleted · no production access attempted · no DB writes
Deliverable: BRIEF_FOR_DEVOPS_UAT_DATA_HYGIENE.md (ready to send)
Next: owner sends brief → Q1/Q2 to CRM for the credential · Q4-Q8 to DevOps for the data dump · Q9 with contract O-7
```
