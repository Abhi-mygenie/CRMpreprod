# CR-110 (amendment) — Impact Analysis: token-refresh script selector (fixes BUG-035)
**Date**: 2026-10-10 · **Role**: Planning Agent · **Intake**: `discovery/SESSION_2026_10_10_BATCH_INTAKE_DQ1_CR111_CR117_BUG035_BUG037.md` §1 (BUG-035) · original: `planning/CR_110_IMPACT_ANALYSIS_AND_IMPL_PLAN.md` · **Group**: Wave A / Group 4 (CR-110 amend + BUG-035) · **Status**: 🟡 IA complete — 2 owner questions · **No code changed. Script NOT run.**

---

## 1. Code reality (confirmed 2026-10-10) — `scripts/push_and_refresh_tokens.py` (87 lines)

```python
14| env = dotenv_values("/app/backend/.env")           # ← targets whichever DB backend/.env points at (now preprod again)
20| PASSWORD = argv["--password"] if "--password" in argv else "Qplazm@10"   # ⚠️ shared owner password hard-coded as default
25| stale = list(db.users.find({}, {...}))             # ALL users
29| stale = [u for u in stale
30|          if not (u.get("mygenie_token","") or "").startswith("dp_live_")    # ⚠️ BUG-035
31|          and u.get("api_key") and u.get("restaurant_id")]
47| r1 = login(email, PASSWORD)                        # Step 1 — logs in AS the tenant on MyGenie
59| r2 = push crm_token                                # Step 2 — POST api_key to POS
73| r3 = login again → crm_token                       # Step 3
81| db.users.update_one({"id": rid}, {"$set": {"mygenie_token": crm_token}})   # Step 4 — overwrites tenant token
```

Findings:

| # | Finding | Severity |
|---|---|---|
| F1 | **BUG-035 confirmed.** `dp_live_` is the CRM `api_key` prefix (`core/auth.py:46`), never a MyGenie session token format → predicate is true for **every** user → selector = all 89 prod tenants with `api_key` + `restaurant_id`. | P2 / MEDIUM-if-run |
| F2 | Step 4 **overwrites `mygenie_token`** for each selected tenant with the `crm_token` from the login response. For the 11 tenants whose current token works, this replaces a working token with… the `crm_token` field — which is the **CRM api_key echoed back by POS**, not a MyGenie session token. Whether POS accepts that value as a Bearer for `/customer-migration` is **unverified** (CR-110 preprod run reported "OK" per handover, but no sync was executed with the new token). → **Q1**. | HIGH if assumption wrong |
| F3 | Shared password default in source (`"Qplazm@10"`). Violates R11/secret hygiene; also means a bare `python3 scripts/push_and_refresh_tokens.py` on a prod-pointed `.env` would re-login 89 tenants with it. | security |
| F4 | No dry-run, no `--restaurant`, no confirmation prompt, no per-run log. Prints token prefix (`crm_token[:20]`) to stdout — partial secret leak in logs. | hygiene |
| F5 | Reads `MONGO_URL` from `backend/.env` — a prod run requires a **write-capable** prod user (read-only user cannot `update_one`). Today the prod user in `.env` (commented) is read-only → script would fail at Step 4 after already pushing tokens to POS (Steps 2–3 succeed) → **partial side effect on POS with no CRM record**. | operational |
| F6 | Depends on CR-115-A for the `mygenie_token_invalid` selector; the `migration_sync_logs.error ~ /401/` and `last_login` selectors work today. | dependency |

**Code reality: FULL (script exists, works mechanically) — selector WRONG, safety rails ABSENT.**

---

## 2. Proposed amendment (script only)

```text
python3 scripts/push_and_refresh_tokens.py
    [--restaurant <user_id|email> ...]     # explicit targets; default = selector below
    [--since-days 60]                      # last_login threshold
    [--apply]                              # default is DRY-RUN: print the selected list and exit
    [--password-env MYGENIE_SHARED_PASSWORD]  # password read from env var; NO default in code
    [--yes]                                # skip interactive confirmation when --apply
```

Selector (OR of):
1. `users.mygenie_token_invalid == true`  (CR-115-A)
2. latest `migration_sync_logs` row for the tenant has `status:"failed"` and `error` matching `/\b401\b/`
3. `last_login < now − since_days` (default 60 d)

Always AND: `api_key` present · `restaurant_id` present · `email` present.

Safety rails:
- Dry-run prints `email · restaurant_id · reason(s) · last_login · last sync error` with tokens **masked**; `--apply` refused unless the same selection was dry-run in this invocation (print → prompt `type APPLY to continue`, or `--yes`).
- Verify DB target before any write: print `DB host` (masked user) and refuse `--apply` if the connected user lacks write (`db.command("connectionStatus")` roles check) — prevents F5 partial side effects.
- Per-run row in a new `token_refresh_runs` collection **or** a JSON file under `memory/crm/crm_roi_sprint/implementation/` (prod read-only case): `{run_id, ts, selector, targets[], results[]}` with tokens masked.
- Step 4 writes `mygenie_token`, **clears `mygenie_token_invalid`**, sets `mygenie_token_refreshed_at`.
- Never print token material; `OK <email>` only.

---

## 3. Owner questions

| # | Question | Recommendation |
|---|---|---|
| **Q1** | **Is `crm_token` from the MyGenie login response actually accepted as a Bearer token by `/customer-migration` and `/customer-order-migration`?** CR-110's preprod run stored it but no sync was triggered with it afterwards. If it is the api_key echo, the "refresh" never fixed anything and the real fix is only "tenant logs in to CRM" (or POS P-8 server-to-server credential). | **Verify on preprod first** (Planning cannot; Implementation self-test: pick one `mygenie_token_invalid` test tenant, run script with `--restaurant`, then trigger customer sync and expect 200). If it fails → CR-110 amendment becomes "dry-run report only" and P-8 is escalated. |
| **Q2** | Where should the shared password come from on prod — env var on the pod (`MYGENIE_SHARED_PASSWORD`), or interactive prompt each run? | Interactive prompt (`getpass`) — never lands in `.env` or shell history |

---

## 4. Risk

| Item | Label | Why |
|---|---|---|
| Script edit | **LOW** (code) | Script only; no app code. |
| Running on prod | **MEDIUM → CRITICAL if Q1 is "no"** | Writes `users.mygenie_token` (auth-adjacent, production data); logs in as tenants on POS; pushes api_key to POS. Owner approval + password confirmation mandatory per addendum ("production/preprod database connection or destructive DB scripts"). |
| Running as-is today | **MEDIUM** | 89-tenant blast (BUG-035). Must not happen — rule already in handover. |

---

## 5. Blast radius

- **Files WILL change**: `scripts/push_and_refresh_tokens.py` (rewrite of selector + rails, ~120 lines) · `tests/test_cr110_selector.py` (+3: selector picks flag / 401 / stale-login; excludes healthy) — selector factored into a pure function for testability.
- **Files WILL NOT touch**: `routers/auth.py` · `core/auth.py` · `backend/.env` · any router · `scripts/refresh_mygenie_tokens.py` (older script — Q: retire? not in scope).

---

## 6. Conflict check

| With | Overlap | Resolution |
|---|---|---|
| **CR-115-A** | selector field `mygenie_token_invalid`; clearing it on refresh | Implement Group 4 **after** 115-A; before that, selectors 2+3 only |
| CR-113 | none (reads `migration_sync_logs.error`, unchanged) | — |
| POS P-8 (server-to-server credential) | would make this script obsolete | note in POS brief |
| CR-110 original closure | amended, not re-opened: register row status 🟢 implemented (preprod) → 🟡 amended | dashboard |

---

## 7. Verification matrix

| # | Case | Expected |
|---|---|---|
| V1 | preprod fixture users: A flag true · B latest sync 401 · C last_login 90 d · D healthy | dry-run lists A, B, C with reasons; D excluded; exit 0; no writes |
| V2 | `--restaurant D` dry-run | lists D only |
| V3 | `--apply` without prior prompt confirmation | refused |
| V4 | `--apply --yes --restaurant A` on preprod with correct password | A `mygenie_token` changed, `mygenie_token_invalid:false`, run record written, stdout has no token characters |
| V5 | **Q1 proof**: after V4 trigger `POST /customers/sync-mygenie` for A | 200 and sync completes (if 401 → stop, escalate P-8) |
| V6 | `.env` pointed at read-only user, `--apply` | refused at pre-flight before any POS call |

---

```text
Planning complete: CR-110 amendment (+BUG-035)
Stage: Impact Analysis
Code reality: FULL — script exists; selector wrong (dp_live_ = api_key format → selects all 89 tenants); no dry-run/targeting; shared password hard-coded; prod read-only user would fail after POS side effects
Risk: LOW (edit) · MEDIUM–CRITICAL (prod run; CRITICAL if crm_token is not a valid sync Bearer — Q1 unverified)
Files WILL change: scripts/push_and_refresh_tokens.py · tests/test_cr110_selector.py (new)
Files WILL NOT touch: routers/auth.py · core/auth.py · backend/.env · routers/* · scripts/refresh_mygenie_tokens.py
Owner decisions: Q1 verify crm_token works as sync Bearer on preprod before any prod run · Q2 password via getpass prompt
Docs: planning/CR_110_AMEND_BUG_035_IMPACT_ANALYSIS.md
Next: Implementation Plan gate for Group 4 — after CR-115-A is implemented; prod run only with owner password confirmation
```
