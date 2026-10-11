# OUTBOUND DRAFT — CRM → Scan & Order + POS agents — CR-085-A canonical phone LIVE on preview, please validate — 2026-10-09
**Owner sends; agents never send.** Base: `https://preprod-crm-app-1.preview.emergentagent.com`

## What changed
CRM now normalises every customer phone it receives and matches on **restaurant + digits + country code**. `"98387 77712"`, `"+91 98387 77712"`, `"09838777712"` and `"9838777712"` are the **same diner** on every channel.

## For Scan & Order (Customer App)
| Route | Change |
|---|---|
| `POST /api/scan/auth/skip-otp` | phone normalised before find-or-create → no more duplicate records from formatting. **New: invalid phone → `400 {"detail":"Enter a valid mobile number"}`** (e.g. `0000000000`, 9 digits). |
| `POST /api/scan/auth/lookup` | same helper; malformed `country_code` (e.g. `"91"`) → 400. Flagged-invalid records never returned. |
Validate: spaced/`+91` variants of one phone → same token subject; junk → 400; your 400 handling shows a friendly message.

## For POS
**Nothing is rejected on any POS route.** Request/response shapes unchanged. Stored `phone` is now digits-only with `country_code`; `phone_raw` kept when we cleaned it; junk phones stored with `phone_invalid:true` and excluded from WhatsApp/loyalty jobs.
⚠️ Pending CRM-owner decision: bills with junk phones currently still credit a *flagged* customer; `customer-lookup` still returns such records. We'll confirm the final behaviour.
Validate: `POST /api/pos/customers` with `"+91 90000 00123"` → stored `9000000123`; `customer-lookup` with `"90000-00123"` → found; a bill via `/api/pos/orders` with a spaced phone links to the existing customer.

Reply with evidence; CRM closure of CR-085-A waits for both teams.
