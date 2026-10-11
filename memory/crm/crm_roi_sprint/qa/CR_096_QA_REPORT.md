# QA Report — CR-096 `POST /api/scan/feedback` hybrid intake
**QA Agent**: T1 · **Date**: iteration_9 (2026-02) · **Verdict**: ✅ PASS — no blockers

## Self-Test Matrix (F-A through F-ZZ) — 15/15 PASS
| # | Check | Result |
|---|---|---|
| F-A | token path: linked=true, feedback_count +1 | ✅ PASS |
| F-B | garbage/expired token → 401 | ✅ PASS |
| F-C | no token + known phone → linked=true, customer count unchanged | ✅ PASS |
| F-D | no token + unknown phone → linked=false, phone stored, no customer created | ✅ PASS |
| F-E | anonymous (no phone) → linked=false, identity_source="none" | ✅ PASS |
| F-F | invalid phone `0000000000` → 400, nothing stored | ✅ PASS |
| F-G | blocked customer → stored unlinked | ✅ PASS |
| F-H | unknown order_id → order_id:null, order_id_raw kept | ✅ PASS |
| F-I | no restaurant_id (no token) → 422 | ✅ PASS |
| F-J | unknown restaurant_id → 404 | ✅ PASS |
| F-K | 11th IP request/min → 429 + Retry-After | ✅ PASS |
| F-K2 | 4th phone request/10min → 429 | ✅ PASS |
| F-L | rating=0 → 400/422, rating=6 → 400/422 | ✅ PASS |
| F-M | staff GET /api/feedback with anonymous row → 200 (E4 fix) | ✅ PASS |
| F-ZZ | cleanup: all test docs deleted, customers count unchanged | ✅ PASS |

## Ad-hoc Checks
| Check | Result |
|---|---|
| message > 500 chars → stored doc has exactly 500 chars | ✅ PASS |
| staff GET /api/feedback with scan-sourced null customer_name rows → 200 | ✅ PASS |
| identity_source field present on every doc type (token/phone/none) | ✅ PASS (none=anonymous, phone=phone path, token=token path) |
| `linked` field present in every 200 response | ✅ PASS (all 3 cases: anon/unknown-phone/known-phone) |

## Pre-existing Bug Fix Verified
- **E4**: `GET /api/feedback` was 500-crashing when `customer_name=None`. Fix: `Optional[str] = None` in Feedback schema. Verified via F-M test — 200 returned with anonymous row present.

## Notes
- Rate-limit buckets `fb-ip:` and `fb-ph:` write to `scan_lookup_attempts` collection. No pollution of existing `so-ip:`, `so-ph:`, `ip:`, `ph:` buckets (confirmed via Phase C regression).
- customers count stable at 7705 before/after full run.
- All cleanup done by F-ZZ; no orphan test docs remain in feedback collection.

## Verdict
**APPROVED** — 15/15 structured tests + 4/4 ad-hoc checks PASS. No blockers or majors.
