# INTAKE DOC — CR-2026-10-09-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-09-001 |
| **Title** | Customer App side of CRM **CR-095** — confirm zero callers of the 4 orphan `/scan/config` + `/scan/menu/dietary-tags` routes, rule on the sequencing gate, verify after CRM removes them, countersign ownership-map §4d |
| **Classification** | **CR** — cross-team dependency / contract item (no Customer App code change expected) |
| **Date Registered** | 2026-10-09 |
| **Reported By** | CRM reply 2026-10-09 (bounce-backs **CA-2** "cutover date" + **CA-8** "steps 2–3 date") — both are the same question: *when can CRM run step 4 (CR-095)?* Origin: INV-2026-09-15-002 / -003 (Sept), CRM INV-022 round-2 sequencing (2026-09-28), contract §4d signed by CRM 2026-10-03 |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Priority** | **P2** — no diner or admin impact either way; value is closing a back door into our data and freezing the ownership map. Becomes P1 only if it blocks contract countersign (CA-1) |
| **Risk** | **LOW** for Customer App (zero code paths touched). **HIGH** for CRM (API-contract deletion) — tracked on their side |
| **Status** | 📝 REGISTERED (Role 1 done) — needs Planning |
| **Blast radius** | SMALL — two collections we own (`customer_app_config`, `dietary_tags_mapping`); no runtime path in our app changes |

## 1. In one sentence

CRM will delete four routes that read/write **our** two config collections; nothing of ours has ever called them, so our job is to say so formally, decide whether to release CRM from the 4-step gate, verify nothing moved after deletion, and countersign the ownership map.

## 2. Evidence — from source and data this session (read-only)

| Where | What |
|---|---|
| `grep -rn "scan/config\|scan/menu/dietary" frontend/src backend/ backend/tests` | **0 results** — no caller, no contract test, no fixture |
| `RestaurantConfigContext.jsx:14, :164` | config is read via **our** `GET /api/config/<rid>` |
| `useMenuData.js:425, :437` | dietary tags via **our** `GET /api/dietary-tags/available` and `/api/dietary-tags/<rid>` |
| `server.py:936-941` `get_app_config` · `:1440-1446` `get_dietary_tags` | our backend reads the collections directly — correct, we own them |
| UAT `customer_app_config` | 13 docs, all short-form `restaurant_id` (`'364' … '69'`) — **no CRM-shaped stray docs** (B3 "normalisation on PUT" concern is moot) |
| UAT `dietary_tags_mapping` | 0 docs |
| CRM board JSON (`INV_022_CRM_OWNERSHIP_BOARD_REPLY.md:16-17`) | CRM's only touches = `scan.py:717,750,759,763` (config) and `:776,791,796,801` (dietary) — *"ALL via orphan GET/PUT … removed by CR-095. After CR-095 CRM touches = none."* |
| `CONTRACT_v1.0_CRM_SIGNOFF.md:21` | **§4d (CR-095 removal) — ✅ CRM agrees, 4 routes confirmed orphan** (2026-10-03) |
| `INV_022_CRM_REPLY_TO_CUSTOMER_APP_ROUND2.md:20-25` | Agreed order: 1 CRM ships lookup+loyalty-rules → 2 we wire + delete pre-login/dead routes → 3 we move admin login to POS → **4 CRM removes the 4 routes (CR-095) and both sides sign the map** |
| `REPLY_TO_CRM_ROUND2_AND_FREEZE.md:18` | We told CRM 2026-09-28: *"stricter than necessary — we have no caller on any of the 4 routes"* |
| `OWNERSHIP_MAP.md:4` | **DRAFT — NOT signed**; freeze also waits on POS reply + owner F3 (separate blockers, not CR-095) |

## 3. Where the 4-step sequence actually stands (2026-10-09)

| Step | Owner | Status |
|---|---|---|
| 1 | CRM | CR-093 `lookup` ✅ shipped · CR-094 `loyalty-rules` ⏳ 404, w/c 13 Oct |
| 2 | Us | Part A done (CR-2026-10-03-004). Open: Parts B+C (blocked on CR-094), `customer-lookup` retirement, 13 dead routes (CR-2026-10-03-001, INTAKE) |
| 3 | Us | CR-2026-09-15-004 admin login → POS — **INTAKE, unscheduled** |
| 4 | CRM | **CR-095** — waiting on 2+3 by CRM's own choice |

Holding step 4 behind steps 2–3 protects nothing: step 4 touches routes we never call. The dependency is procedural, not technical.

## 4. Scope (for Planning)

**In:**
- A. Formal written confirmation to CRM: zero callers (evidence table above) — answers CA-2.
- B. Owner ruling on the gate (D1) and the resulting CA-8 answer.
- C. Post-removal verification once CRM confirms CR-095 shipped: our `GET /api/config/<rid>` + `GET /api/dietary-tags/<rid>` unchanged (contract snapshots `test_public_config.py`, `test_dietary.py` still green); UAT doc count for the two collections unchanged; CRM routes return 404.
- D. Countersign ownership-map **§4d** row (our half) — *not* the whole map; map freeze stays blocked on POS + F3.

**Out:** any Customer App code change · steps 2 and 3 themselves (own CRs) · full OWNERSHIP_MAP freeze · CA-1 contract countersign (owner, separate) · CRM's implementation of CR-095.

## 5. Acceptance (draft)

1. CRM has in writing from us: "no Customer App caller on the 4 routes; cutover gate ruling = D1".
2. After CRM ships CR-095: `GET {CRM}/scan/config/478` and `GET {CRM}/scan/menu/dietary-tags/478` → **404**.
3. `pytest backend/tests/contracts/test_public_config.py backend/tests/contracts/test_dietary.py` → PASS, snapshots unchanged.
4. UAT `customer_app_config` count still 13 (or whatever the pre-removal count is on the day), `dietary_tags_mapping` unchanged.
5. `OWNERSHIP_MAP.md` §4d row marked "Customer App ✅ / CRM ✅" with date; map status otherwise unchanged (still DRAFT pending POS + F3).

## 6. Owner decisions at Planning

- **D1 — sequencing gate:** (i) release CRM to ship CR-095 now, independent of steps 2–3 *(rec — gate protects nothing, closes a data back door weeks earlier)*; or (ii) hold the 4-step order and give CRM target dates for steps 2–3.
- **D2 — verification depth after removal:** (a) contract tests + 404 probe + doc count *(rec)*; or (b) also a one-off smoke of admin config save + customer landing at one restaurant.
- **D3 — §4d countersign authority:** owner signs, or owner authorises E1 to mark the row on owner's behalf (as CRM's owner did for their side).

```text
Intake complete: CR-2026-10-09-001
Classification: CR · P2 · LOW (ours) / HIGH (CRM side)
Duplicate check: DISTINCT — related: CR-2026-10-03-004 · CR-2026-10-03-001 · CR-2026-09-15-004 · INV-2026-09-15-002 · INV-2026-09-15-003 · CRM CR-095
Evidence: captured (code grep, UAT read-only probe, CRM board JSON, contract §4d)
Blast radius: SMALL
Docs updated: memory/change_requests/CR-2026-10-09-001-crm-cr-095-readiness-and-ownership-signoff/INTAKE_DOC.md · memory/change_requests/index.yml
Next: Planning (Role 2) — owner to say "Planning for CR-2026-10-09-001"
```
