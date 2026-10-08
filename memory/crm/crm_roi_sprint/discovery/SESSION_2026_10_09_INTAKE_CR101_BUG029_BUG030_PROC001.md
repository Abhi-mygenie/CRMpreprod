# Batch Intake — gaps surfaced during BUG-025/026 planning (2026-10-09)
**Role**: Intake Agent (Role 1) · **Source**: `planning/BUG_025_BUG_026_IMPACT_AND_IMPL_PLAN.md`, `planning/CR_100_IMPACT_ANALYSIS.md`, owner rulings 2026-10-09 (Q1–Q4 + production-DB rule), read-only probes · **No code changed.**

| ID | Class | Severity | Risk | Dup check | Evidence | Blast | Status |
|---|---|---|---|---|---|---|---|
| **CR-100** | CR — identity rule (§14) | P2 | MEDIUM | DISTINCT (CR-085 IA G2 noted the gap; no fix item existed) | captured | SMALL (53 docs, 2 tenants) | 🟡 PLANNING (IA done; plan gate closed by owner) — *already registered earlier today, confirmed* |
| **CR-101** | CR — data hygiene (the "D-3 hygiene CR" referenced since 2026-10-08 but never registered) | P3 | MEDIUM (prod data write) | DISTINCT | captured | SMALL | 📋 REGISTERED — **end of batch**, under PROC-001 |
| **BUG-029** | BUG — limiter consistency (CR-093 lookup) | P3 | LOW | RELATED to BUG-025 | captured | SMALL | 📋 REGISTERED |
| **BUG-030** | BUG — tenant-id mapping for the only non-standard tenant | P3 | LOW | DISTINCT | captured | SMALL (test tenant r69) | 📋 REGISTERED |
| **PROC-001** | PROCESS rule (owner) | — | — | DISTINCT | owner ruling | programme-wide | 📋 REGISTERED — mandatory closure step |
| **CR-085-B scope amendment** | scope note (no new ID) | — | — | — | probes | — | ✅ recorded |

---
## CR-100 — Tolerant identity match for legacy `country_code:null` customers (`+91` only)
Already registered + IA written today. Facts re-confirmed: 53 docs (r635 49 · r689 4), 0 active 90 d, 0 points/visits, 13 have a `+91` twin, 12 `phone_match()` call sites + 1 inline (`scan.py:295`). Owner hold on Implementation Plan. Nothing new to register.

## CR-101 — Data hygiene (D-3): dead password hashes · orphan-tenant customers · legacy OTP collection
**Where / what** (all read-only confirmed 2026-10-09):
| Item | Count | Detail |
|---|---|---|
| customers with dead `password_hash` | 2 | both under `pos_0001_restaurant_test_restaurant` (`1234567890` "Security Researcher", `8888888888` "TestUser"); unreachable by design (invalid phones, skip-otp only path) — owner Q3 |
| customers under tenants with **no `users` doc** | 3 | `pos_0001_restaurant_test_restaurant` ×2 (same as above) · `pos_0001_restaurant_69` ×1 (`9035133228`, created 2026-09-08 via skip-otp — see BUG-030) |
| `customer_otps` collection | 5 docs | no writer since CR-084; drop collection |
| orders under those orphan tenants | 0 | safe to delete customers |
**Fix sketch**: one idempotent script, dry-run → owner sign-off → write: `$unset password_hash` (2), delete 3 orphan-tenant customers, `drop customer_otps`. Baseline becomes 7697.
**Constraints**: owner rule "all data ops after the batch" → runs with/after CR-085-B; **PROC-001** applies (full validation on production DB afterwards).
**Severity** P3 · **Risk** MEDIUM (prod data write, tiny) · **Blast** SMALL. **Owner Q**: confirm the 3 orphan-tenant deletions (test data) — yes/no.

## BUG-029 — `/scan/auth/lookup` normalises + 400s **before** its IP bucket (invalid-phone probes are free)
**Where**: `routers/scan.py:283-293` — `normalize_phone` → 400 → then `ip:` and `ph:` buckets.
**Symptom**: unlimited invalid-phone requests to lookup never touch either limiter (no DB write, cheap) — a probe/noise vector. Mirror image of BUG-025 Q1: owner chose **A** (IP bucket first) for skip-otp; lookup is still order **B**.
**Fix sketch**: move the `ip:` bucket check above `normalize_phone` (3 lines) so invalid phones consume IP quota; `ph:` bucket stays after normalisation (already canonical). +1 test.
**Severity** P3 · **Risk** LOW · **Blast** SMALL (lookup only). Not §14. **Owner Q**: none — approve Planning (can ride with BUG-025 implementation, same file/same pattern, if owner agrees — Q-A).

## BUG-030 — `_normalize_restaurant_id("69")` maps to a tenant that does not exist
**Where**: `routers/scan.py:31-35` — short id → `pos_0001_restaurant_{id}`. The owner test tenant r69 is the **only** user whose id is non-standard (`pos_owner_69_bdd4513c`, `restaurant_id:"69"`).
**Symptom**: Customer App skip-otp with `restaurant_id:"69"` creates/reads customers under `pos_0001_restaurant_69` (orphan; 1 doc created 2026-09-08) — never visible to the r69 owner in CRM, never matched by POS (POS uses `pos_owner_69_bdd4513c`). Any other short id is fine (all 100+ real tenants are standard).
**Fix options**: (a) resolve via `users.find_one({"restaurant_id": short})` → `id` (1 query, future-proof; apply to `_normalize_restaurant_id` and the 4c `/scan/*` consumers); (b) leave — test tenant only. Deleting the 1 orphan doc belongs to CR-101.
**Severity** P3 · **Risk** LOW (a touches every `/scan/*` tenant resolution → needs lookup/skip-otp regression) · **Blast** SMALL. **Owner Q**: (a) or (b).

## PROC-001 — Complete validation test on the **production DB** after all data changes (owner rule 2026-10-09)
**Rule**: after CR-085-B cleanup, CR-087 backfill/merge, CR-101 hygiene (and any CR-100 side-effects), CRM runs a full validation suite against the **production** database before closure. Dry-run reports precede every write; validation report is a closure artefact.
**Registered as** a mandatory step in the closure checklist of 085-B / 087 / 101. Owner Q: none.

## CR-085-B scope amendment (recorded, no new ID)
The per-restaurant correction report must include, in addition to the 390 junk-phone docs and 44 duplicate groups:
- the **53 `country_code:null` docs** and their **13 `+91` twins** (merge candidates) — from CR-100 probe;
- the legacy **`Customer ` with `phone:""`** (id `388c4f46…`, r69, 34 visits) — from 085-A2 implementation;
- any duplicates created by the BUG-027 test leak that QA may have missed (search `9876543210` r689 docs without `country_code` — currently 1 legacy + 0 extra).

---
## Recommended sequence
BUG-025/026/027 implementation (approved) → **BUG-029 may ride along** (owner Q-A) → CR-100 plan gate (owner) → BUG-030 decision (a/b) → … → end of batch: CR-085-B report → CR-101 + 085-B + 087 writes → **PROC-001** production-DB validation → closure.

```
Intake complete: CR-101 · BUG-029 · BUG-030 · PROC-001 (+ CR-100 confirmed · 085-B scope amended)
Classification: CR ×1 (+1 confirmed) · BUG ×2 · PROCESS ×1
Severity: P2 ×1 (CR-100) · P3 ×3
Risk: MEDIUM ×2 (CR-100 §14, CR-101 data write) · LOW ×2
Duplicate check: DISTINCT ×4 · RELATED ×1 (029↔025)
Evidence: captured (probes 2026-10-09)
Blast radius: SMALL (all)
Docs updated: discovery/SESSION_2026_10_09_INTAKE_CR101_BUG029_BUG030_PROC001.md · BUG_REGISTRY_CAMPAIGNS.md · 00_register/ROI_MEASUREMENT_CR_REGISTER.md · CR_STATUS_DASHBOARD.md · PRD.md
Owner Qs: CR-101 confirm 3 orphan deletions · BUG-029 Q-A ride with BUG-025? · BUG-030 (a)/(b)
Next: owner answers → "choose implementation role for BUG-025 + BUG-026 (+029?)"
```
