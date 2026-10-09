# Brief for DevOps / Ops — non-production environments are holding production-grade secrets and real customer data
## From: MyGenie Customer App · Ref: INV-2026-10-03-001 · Date: 2026-10-03
## Status: **DRAFT — awaiting owner sign-off before sending** · Copy to: CRM team, POS team

---

## Summary in one paragraph

While validating a POS login endpoint we noticed that **preprod issues a CRM credential prefixed
`dp_live_`**, and that the **shared UAT database holds real customer-identifying data** — including
**114 hotel guest identity documents**. Neither is caused by application code, and neither is
something any single product team can fix. We are not reporting an exploit; we are reporting that
the environment boundary between production and non-production appears to be **porous for both
secrets and personal data**. We would like to know how UAT is populated and whether any
preprod-issued credential reaches production systems.

---

## Finding 1 — preprod issues a `dp_live_`-prefixed CRM credential

**Where:** `https://preprod.mygenie.online/api/v1`, endpoints
`POST /auth/vendoremployee/login` and `POST /auth/vendoremployee/common-login`.

**What comes back:** a field `crm_token` whose value begins **`dp_live_`**.

| Property | Observed |
|---|---|
| Prefix | `dp_live_` — conventionally a **live/production** marker |
| Issued by | a **preprod** host |
| Stability | **identical across two separate logins and both endpoints** → a stored, long-lived API key, not a session token |
| Obtainable by | **anyone holding preprod POS login credentials** |

**Why we are raising it rather than ignoring it:** preprod credentials are, by their nature, shared
widely — pasted into tickets, chats and docs, handed to contractors, used in test scripts. If a
`live` credential is reachable from a preprod login, then the effective security of a production
credential is the security of your least-guarded test account.

**Two possibilities:**
- **(a)** the prefix is **misleading** — it is a preprod key named `live`. Low direct impact, but it
  makes every future secret audit untrustworthy, because `live` would no longer mean live; or
- **(b)** preprod genuinely returns a **production** CRM credential. In that case the production
  CRM API is reachable from a preprod account.

We cannot distinguish these from outside. **We would like (b) ruled out explicitly.**

**Please also note:** this value has been pasted into a chat transcript and returned in two test
HTTP responses during our validation. **If it is a production credential, please treat it as
exposed and rotate it**, independently of the naming question. We have not recorded the value in
any of our documents and have deleted the raw responses.

## Finding 2 — the shared UAT database holds real customer data

Observed read-only in the shared `mygenie` database at `52.66.232.149` while auditing collection
ownership (we made no writes at any point):

| Collection | Present in UAT | Content class |
|---|---|---|
| `customers` | yes | **names, phone numbers**, loyalty balances |
| `orders` | yes — real order history with dates | customer-linked transactions |
| `users` | yes | admin **emails**, **`password_hash`**, plus CRM's `api_key`, `authkey_api_key`, `mygenie_token` |
| **`customer_documents`** | **114 rows** | **hotel guest identity documents** (S3-backed) |
| `feedback`, `points_transactions`, `wallet_transactions` | yes | customer-linked behavioural data |

This is either production data copied down, or production-grade data accumulated in place. Either
way, the position we would expect — *no customer-identifying information and no live tokens in a
non-production environment* — does not hold today.

**`customer_documents` is the row we would look at first.** 114 identity documents outside
production is a materially different exposure from a stale phone number, and likely carries
regulatory weight that the other rows do not.

## What we are asking

| # | Question | For |
|---|---|---|
| **Q1** | Is the preprod `crm_token` a **production** credential, or a misnamed preprod one? | **CRM** |
| **Q2** | Why does a preprod host mint a credential with a `live` prefix? | **CRM / POS** |
| **Q3** | Is it static per restaurant? What is its lifetime and rotation policy? | **CRM** |
| **Q4** | How is the UAT `mygenie` database populated — production dump, synthetic data, or organic test traffic? | **DevOps** |
| **Q5** | If it is a dump: is **any** anonymisation or masking applied to `customers`, `users` or `customer_documents`? | **DevOps** |
| **Q6** | Who has network and credential access to the UAT database host, and is that access logged? | **DevOps** |
| **Q7** | Are the **114 `customer_documents`** in UAT real guest identity documents? | **CRM / DevOps** |
| **Q8** | Is there a written policy for what may be copied into non-production? If yes, we would like to read it; if no, this is our request that one be written | **DevOps** |
| **Q9** | Do preprod and production share **any** secret — JWT signing keys, API keys, database credentials? | **DevOps** |

**Q9 overlaps work already in flight.** The Customer App and CRM have a signed contract with an
open item (**O-7**) asking whether CRM's live host sets `JWT_SECRET` with no hardcoded fallback. We
suggest answering Q9 and O-7 together, since both are "do non-production and production share a
secret?".

A safe way to answer the shared-secret part **without exchanging any secret**: on each host run
`printenv <VAR> | sha256sum` and compare only the hashes. Different hashes settle it; identical
hashes mean rotation.

## What we are not asking for

- No change to application code — nothing in the Customer App, CRM or POS codebase causes either finding.
- No emergency. We have observed **no exploit and no evidence of misuse**.
- No access for us to production. We have never had it and are not requesting it.

## What we have already done on our side

| Action | Detail |
|---|---|
| Field projection on CRM secrets | **CR-2026-10-03-002** (registered, P0) restricts our read of CRM's `users` row to the six fields we need, so `api_key`, `authkey_api_key` and `mygenie_token` stop being loaded into our process memory and cannot reach our logs or stack traces. **Finding 1 is why this is P0 and not housekeeping** |
| Removing the dependency entirely | **CR-2026-09-15-004** moves our admin login to POS, after which we stop reading CRM's `users` table at all |
| Our own secret hygiene | `JWT_SECRET` is environment-only with **no fallback**; the service refuses to start without it. Algorithm pinned. Verified 2026-10-03 |
| Handling of the value in Finding 1 | not stored, not logged, not written to any document; raw HTTP responses deleted after inspection |

## Suggested next step

A short three-way call — DevOps, CRM, POS — covering Q1, Q4 and Q7. Those three determine whether
this is a naming problem (an afternoon) or a data-handling problem (a workstream). We are happy to
attend but have no action of our own pending the answers.
