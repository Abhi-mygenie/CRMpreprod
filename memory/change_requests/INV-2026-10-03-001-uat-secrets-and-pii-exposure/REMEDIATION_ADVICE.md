# REMEDIATION ADVICE — INV-2026-10-03-001

| Field | Value |
|---|---|
| **Item** | INV-2026-10-03-001 — Production-grade secrets and real customer PII in UAT / preprod |
| **Root cause (owner-confirmed 2026-10-06)** | UAT / preprod MongoDB was **seeded from a production dump** with no anonymisation step |
| **Owning team** | DevOps / Ops, with CRM and POS. **Not a Customer App code item** |
| **Date** | 2026-10-07 · E1 (Role 6-lite advisory; no code, no DB writes) |
| **Companion** | `BRIEF_FOR_DEVOPS_UAT_DATA_HYGIENE.md` (questions Q1–Q9) — this file is the *answer* side once Q4 = "production dump" is confirmed |

---

## 1. What the root cause changes

The brief asked nine questions because the cause was unknown. The owner has since confirmed **Q4 = production dump**, which collapses the problem into two concrete exposures with known fixes:

| Exposure | Caused by dump? | Fix class |
|---|---|---|
| **E1** — real PII in UAT (`customers`, `orders`, `users.password_hash`, **114 `customer_documents`**, `feedback`, `points_transactions`, `wallet_transactions`) | Yes — copied verbatim | Purge or re-seed |
| **E2** — `dp_live_` CRM key issued by preprod | Yes — `users.api_key` was copied with the row, so preprod hands out the **production** key | Rotate on prod, replace in UAT |

A dump that copies `users` copies every secret in it. **Finding 1 and Finding 2 are the same event.** This also answers Q1 as **(b)**: preprod genuinely returns a production credential — treat it as exposed.

---

## 2. Recommended solution — three phases

### Phase 1 — Contain (hours, CRM + DevOps)

| # | Action | Owner | Why first |
|---|---|---|---|
| 1.1 | **Rotate every `dp_live_` key** that exists in prod `users` (not only the one observed — the whole table was copied) | CRM | The copied value has been returned over HTTP from preprod to anyone with test credentials |
| 1.2 | Rotate any other secret present in the dumped `users` rows: `authkey_api_key`, `mygenie_token`; **force password reset or invalidate `password_hash`** for admin users whose hashes are now in UAT | CRM / POS | Same exposure, same table |
| 1.3 | Confirm whether `JWT_SECRET` / DB credentials are shared between preprod and prod (brief Q9 / contract O-7) using the hash-compare method — `printenv VAR \| sha256sum` on each host | DevOps | If shared, a preprod compromise is a prod compromise |
| 1.4 | Restrict network access to the UAT host (`52.66.232.149`) to known IPs while Phase 2 runs; enable access logging | DevOps | 114 identity documents are reachable today |

### Phase 2 — Purge (days, DevOps)

Two acceptable options; **A is recommended**.

**Option A — Re-seed from a scrubbed fixture (recommended)**
1. Drop the UAT `mygenie` database.
2. Restore **config-only** collections from prod (`customer_app_config`, `restaurants`, menus, tables, dietary tags, custom pages) — these contain no PII.
3. Generate synthetic `customers`, `orders`, `feedback`, `points_transactions`, `wallet_transactions` (Faker-style; Indian-format phone numbers that cannot be real, e.g. `9000000xxx`).
4. Re-create `users` with **fresh `dp_test_`-class keys** and freshly hashed test passwords. Never import `api_key`, `authkey_api_key`, `mygenie_token`, `password_hash` from prod.
5. **Do not restore `customer_documents` at all.** Point the S3 references at a test bucket with placeholder files. Identity documents have no legitimate UAT use.

**Option B — In-place scrub (if a full re-seed is not feasible)**
1. `customer_documents`: **delete all 114** + the S3 objects they point to (verify the bucket is not shared with prod before deleting objects).
2. `customers`: overwrite `name`, `phone`, `email` with deterministic fakes (hash-based so FK joins still work); zero loyalty balances or keep — balances alone are not PII.
3. `orders`: replace customer name/phone/address fields the same way; keep amounts and timestamps.
4. `users`: null out `api_key`, `authkey_api_key`, `mygenie_token`; set new test keys; reset `password_hash` to known test hashes; replace emails.
5. `feedback`, `points_transactions`, `wallet_transactions`: scrub `customer_name`, `customer_phone`.
6. Verify: a read-only query for any real phone number known to the owner returns **zero** rows.

Either option: run **after** Phase 1 rotation, otherwise a scrubbed UAT still holds a live key until CRM rotates.

### Phase 3 — Prevent recurrence (policy, DevOps)

| # | Rule |
|---|---|
| 3.1 | **Non-production is never seeded from production without an anonymisation step.** Written policy (brief Q8), owned by DevOps |
| 3.2 | The seeding job is a **versioned script in a repo**, with a deny-list of collections (`customer_documents`, `users` secrets) and a scrub map for PII fields. Dumps by hand are not allowed |
| 3.3 | Key naming is enforced: `dp_live_` may **only** be minted by prod; UAT mints `dp_test_`. Add a startup assertion on preprod hosts that refuses to serve a `dp_live_` key |
| 3.4 | Periodic check (monthly or on every re-seed): count of `customer_documents` in UAT must be 0; sample 20 `customers.phone` against prod — zero matches |
| 3.5 | Answer Q9 and contract O-7 together and record the result — secrets must differ per environment |

---

## 3. What the Customer App does (already in flight) and does not do

| Item | Status | Relationship |
|---|---|---|
| `CR-2026-10-03-002` — project CRM secrets out of our `users` read | Registered P0 | Reduces *our* blast radius; necessary regardless of this INV |
| `CR-2026-09-15-004` — admin login via POS, stop reading CRM `users` | Registered | Removes the dependency entirely |
| `JWT_SECRET` env-only, no fallback | Verified 2026-10-03 | Our side of 3.5 |
| **Any app code change for this INV** | **None** | If DevOps/CRM conclude we must change something (e.g. refuse a `dp_live_` token on a preprod host), it becomes a **new CR** |

**We must not run the purge ourselves.** The DB is shared and CRM-owned for these collections (addendum §2, `LEARNINGS_SHARED_DB_BOUNDARY_2026-09-15.md`). We supply the plan; DevOps executes.

---

## 4. Registry recommendation (for Role 1 / Registrar)

```yaml
status: INTAKE            # unchanged — nothing closes until DevOps acts
blocked_on: [INFRA, CRM]  # set
owner_action: send BRIEF + REMEDIATION_ADVICE to DevOps/CRM; confirm Phase 1 rotation done
artefacts: INTAKE, BRIEF, REMEDIATION_ADVICE
```

---

## 5. Order of operations (one line)

**Rotate (CRM) → restrict access (DevOps) → re-seed scrubbed / delete `customer_documents` (DevOps) → policy + enforce `dp_test_` on preprod → verify zero real PII → close INV.**

```text
Advisory complete: INV-2026-10-03-001
Root cause: production dump into shared UAT (owner-confirmed) — Finding 1 and Finding 2 are one event
Classification: DATA / CONFIG (environment practice) — no Customer App code
Recommendation: Phase 1 rotate dp_live_ + users secrets (CRM) · Phase 2 re-seed from scrubbed fixture, never restore customer_documents (DevOps) · Phase 3 written seeding policy + dp_test_ enforcement on preprod
Blocked on: INFRA, CRM
Next: owner forwards brief + this advice; Registrar sets blocked_on
```
