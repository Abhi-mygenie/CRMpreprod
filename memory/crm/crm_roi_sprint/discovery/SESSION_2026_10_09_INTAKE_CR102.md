# Intake — CR-102: `skip-otp` must accept `country_code` (+ CR-100 scope amendment: empty-string cc)
**Date**: 2026-10-09 · **Role**: Intake Agent (Role 1) · **Source**: Scan & Order reply §5 (2026-10-09) validated in `handoff/VALIDATION_OF_SCAN_ORDER_REPLY_2026_10_09.md`; read-only probe · **No code changed.**

| ID | Class | Severity | Risk | Dup check | Evidence | Blast | Status |
|---|---|---|---|---|---|---|---|
| **CR-102** | CR — contract gap (identity input) | P2 | LOW | DISTINCT (CR-085-A W13 normalised skip-otp but kept the 2-field schema; CR-093 added cc to lookup only) | captured | SMALL | 📋 REGISTERED |
| **CR-100 scope amendment** | scope note | — | — | — | probe | — | ✅ recorded (10 docs with `country_code:""`) |

## CR-102 — `POST /scan/auth/skip-otp` ignores `country_code`
**Where**: `routers/scan.py:192-194` `SkipOTPRequest{phone, restaurant_id}`; `scan.py:219` `normalize_phone(req.phone)` (no cc argument → defaults `+91`). Compare `LookupRequest` (`scan.py:197-200`) which has `country_code: Optional[str] = "+91"` and passes it (`scan.py:283`).
**Symptom**: Customer App now sends `country_code:"+91"` on every skip-otp call (their 2026-10-09 patch). Pydantic drops the unknown field silently → works today only because every diner is `+91`. For a non-+91 diner: `lookup` says `exists:true` under `+61…`, `skip-otp` creates/matches under `+91` → **two identities for one diner**, and the token carries the wrong phone context.
**Also**: `FeedbackSubmit` (`scan.py:95-98`) has no phone/cc — fine while token-only; **CR-096** (no-token hybrid) must include `country_code` in its request schema from day one.
**Live impact today**: none (0 non-+91 diners; 10 docs with `country_code:""` are a data anomaly, see amendment). Contract-level gap, cheap to close before any international tenant.
**Fix sketch** (Planning): add `country_code: Optional[str] = "+91"` to `SkipOTPRequest`; `normalize_phone(req.phone, req.country_code)`; everything downstream already uses `cc`. +2 tests (`+61` phone stored with `+61`; omitted cc → `+91`). Backwards compatible. Same file/section as BUG-025 → **may ride with the BUG-025 implementation** (owner Q-B).
**Severity** P2 (contract correctness on the only identity path) · **Risk** LOW · **Blast** SMALL (skip-otp only; Customer App already sends the field). **Owner Q-B**: ride with BUG-025/026 (+029) implementation? Recommendation **yes**.

## CR-100 scope amendment — `country_code: ""` (empty string), 10 docs
Probe: besides the 53 `null` docs, **10 customers have `country_code: ""`** (also unmatched by `phone_match(…, "+91")` → same silent-duplicate behaviour). CR-100's tolerant match must treat `""` like `null` (`$in: [cc, None, ""]`), and CR-085-B's report must list these 10 too. Recorded in `planning/CR_100_IMPACT_ANALYSIS.md` (addendum) and 085-B scope.

```
Intake complete: CR-102 (+ CR-100 / 085-B scope amendment)
Classification: CR ×1 · scope note ×1
Severity: P2 · Risk: LOW · Blast radius: SMALL
Duplicate check: DISTINCT
Evidence: captured (Scan & Order §5; scan.py:192-194, 219; probe 10× cc "")
Docs updated: discovery/SESSION_2026_10_09_INTAKE_CR102.md · 00_register/ROI_MEASUREMENT_CR_REGISTER.md · CR_STATUS_DASHBOARD.md · planning/CR_100_IMPACT_ANALYSIS.md · PRD.md
Owner Q-B: ride CR-102 with BUG-025/026 implementation?
Next: owner answers Q-A (BUG-029), Q-B (CR-102) → "choose implementation role for BUG-025 + BUG-026 (+029, +102)"
```
