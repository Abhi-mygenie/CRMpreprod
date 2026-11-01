# CRM → Scan & Order (Customer App) — CR-124: International Phone Number Support — LIVE on preview

**To:** Scan & Order team (Customer App agent)
**From:** CRM team
**Date:** 2026-10-30
**Re:** CR-124 — CRM now accepts international phone numbers on all `/scan/*` endpoints
**Status:** LIVE on CRM preview. **Owner sends; agents never send.**
**Breaking changes:** NONE. All existing payloads work identically.

---

## 1. Summary

CRM now accepts and correctly stores customer phone numbers with **any valid country code**, not just `+91`. International hotel guests can now log in, be looked up, and submit feedback using their real phone numbers.

**This is 100% additive.** Your app does not need to change anything. Existing `+91` payloads produce identical results. The new capabilities activate only when you start sending non-`+91` country codes.

---

## 2. What changed on Scan & Order-facing routes

| Route | Before CR-124 | After CR-124 | Breaking? |
|---|---|---|---|
| `POST /scan/auth/skip-otp` | `country_code: "+44"` + valid UK phone → `400 "Enter a valid mobile number"` | **Accepted.** UK diner logs in, gets token. | **NO** — was error, now success |
| `POST /scan/auth/lookup` | Same — non-India phone → `400 "Invalid phone or country_code"` | **Accepted.** International diner found if exists. | **NO** |
| `POST /scan/feedback` | Non-India phone → `400 "Enter a valid mobile number"` | **Accepted.** Feedback linked to international customer if exists. | **NO** |
| `GET /scan/auth/me` | `country_code` in response was always `"+91"` or null | Now correctly reflects stored value (`"+44"`, `"+1"`, etc.) | **NO** |
| All other `/scan/*` | No phone handling | No change | **NO** |

---

## 3. Updated phone validation rules

| Country code | Phone digits | Validation | Status |
|---|---|---|---|
| `+91` (India) | Exactly 10 digits, starts with 6/7/8/9 | **Unchanged** | Same as CR-085 |
| Any other (`+44`, `+1`, `+971`, etc.) | 6-15 digits | **NEW** | Accepted |
| Missing `country_code` | Defaults to `+91` | **Unchanged** | Same as CR-102 |
| Invalid `country_code` format (e.g. `"91"` without `+`) | → `400` | **Unchanged** | Same as CR-085 |

---

## 4. Updated contract — endpoint examples

### 4.1 `POST /scan/auth/skip-otp` — international diner login

**Indian (unchanged):**
```json
{
    "phone": "9876543210",
    "restaurant_id": "689"
}
```
→ `200 "Login successful"` ✅ (same as before)

**International (NEW):**
```json
{
    "phone": "7911123456",
    "country_code": "+44",
    "restaurant_id": "689"
}
```
→ `200 "Login successful"`, `data.token` = customer JWT, `data.phone` = `"7911123456"` ✅

**Invalid Indian (unchanged):**
```json
{
    "phone": "1234567890",
    "restaurant_id": "689"
}
```
→ `400 "Enter a valid mobile number"` ✅ (same as before — starts with `1`, not 6-9)

### 4.2 `POST /scan/auth/lookup` — international diner lookup

**Indian (unchanged):**
```json
{
    "phone": "9876543210",
    "country_code": "+91",
    "restaurant_id": "689"
}
```
→ `{ "exists": true, "name": "Priya Sharma" }` ✅

**International (NEW):**
```json
{
    "phone": "7911123456",
    "country_code": "+44",
    "restaurant_id": "689"
}
```
→ `{ "exists": true, "name": "John Smith" }` ✅ (if UK guest exists)
→ `{ "exists": false, "name": null }` (if not)

### 4.3 `POST /scan/feedback` — international diner feedback

**No-token path with international phone (NEW):**
```json
{
    "phone": "7911123456",
    "country_code": "+44",
    "restaurant_id": "689",
    "rating": 5,
    "message": "Great food!"
}
```
→ `200 "Feedback submitted"`, `data.linked: true` (if UK guest exists) ✅

### 4.4 `GET /scan/auth/me` — profile shows correct cc

Response now includes the actual stored `country_code`:
```json
{
    "success": true,
    "data": {
        "id": "<uuid>",
        "name": "John Smith",
        "phone": "7911123456",
        "country_code": "+44",
        "tier": "Bronze",
        ...
    }
}
```

---

## 5. What you DON'T need to change

| Item | Why |
|---|---|
| Default `country_code` handling | Still defaults to `"+91"` when omitted — same as CR-102 |
| Rate limits | Unchanged: skip-otp 5/5min/phone, lookup 10/min/IP, feedback 3/10min/phone |
| Token format | Same JWT, same 24h lifetime, same claims |
| Response shapes | Identical — `country_code` field was already present |
| Error codes | Same 400/401/429/422 patterns |

---

## 6. Validation on preview (optional)

| # | Action | Expected |
|---|---|---|
| S1 | `POST /scan/auth/skip-otp` with `phone: "7911123456", cc: "+44", rid: "644"` | `200 "Login successful"`, token present |
| S2 | `POST /scan/auth/lookup` with same phone+cc+rid | `200`, `exists: true` (if S1 created the customer) |
| S3 | `POST /scan/feedback` with same phone+cc+rid + `rating: 5` | `200 "Feedback submitted"`, `linked: true` |
| S4 | `POST /scan/auth/skip-otp` with `phone: "9876543210", rid: "644"` (no cc) | **Unchanged** — `200`, defaults to `+91` |
| S5 | `POST /scan/auth/skip-otp` with `phone: "0000000000", rid: "644"` | **Unchanged** — `400 "Enter a valid mobile number"` |

---

## 7. When you're ready to support international diners

To enable international phone input in the Customer App:
1. Add a country code selector to the phone input (CRM QR registration page already has one as reference)
2. Send `country_code` on `skip-otp`, `lookup`, and `feedback` — CRM handles the rest
3. Display `country_code` from `/scan/auth/me` response alongside the phone number

**No CRM changes needed when you do this — CRM is already ready.**

---

## 8. Related CRs
- **CR-085** (canonical phone, 2026-10-09) — foundation
- **CR-102** (skip-otp accepts `country_code`, 2026-10-09) — already shipped
- **CR-124** (international phone support, 2026-10-30) — this change
- **CR-125** (extended known-prefix set, 2026-10-30) — 22 country codes auto-detected
- **BUG-044 / BUG-045** (2026-11-01) — POS-only fixes; Scan & Order had no equivalent gap
