# Scan-and-Order / Customer App — Data & Implied Endpoints (OTHER App)

> **This app does NOT live in this codebase.** It connects to the same MongoDB (`52.66.232.149:27017/mygenie`) from a different service.
> The endpoints below are **inferred from data patterns** found in the shared database — collections, fields, and document structures that have zero corresponding code in the CRM backend.

---

## How We Know This Is a Separate App

1. **MongoDB connection audit:** 3 distinct client IPs connect to this DB — `52.66.232.149` (the other app, running on the DB server itself), `104.198.214.223` (this CRM pod), and `127.0.0.1` (local)
2. **Zero code:** No Python file in this codebase references `addresses`, `customer_otps`, `customer_app_config`, or `dietary_tags_mapping`
3. **Pydantic blocks it:** The CRM's `Customer` model uses `ConfigDict(extra="ignore")` — even if the `addresses[]` array exists on a MongoDB doc, the CRM API silently drops it from all responses
4. **Active writes:** Addresses were written as recently as today (2026-04-14 08:53 UTC) — by a client IP that is NOT this CRM pod

---

## 1. Customer Address Management

### Data Found: `customers.addresses[]` array

**Schema per address object:**
```json
{
  "id": "addr_1f3280a94ab4",
  "pos_address_id": null,
  "is_default": true,
  "address_type": "Home | Office | Other",
  "address": "123 Test Street, Sector 5",
  "house": "A-101",
  "floor": "1st",
  "road": "Main Road",
  "city": "Shimla",
  "state": "HP",
  "pincode": "171001",
  "country": "India",
  "latitude": "31.1048",
  "longitude": "77.1734",
  "contact_person_name": "Test User",
  "contact_person_number": "9579504871",
  "dial_code": null,
  "zone_id": null,
  "delivery_instructions": "Ring bell",
  "created_at": "2026-04-13T19:45:55+00:00",
  "updated_at": "2026-04-13T19:45:55+00:00"
}
```

**Stats:** 20 customers have `addresses[]`. Counts range from 0 to 132 per customer (no dedup — many near-duplicate entries).

### Implied Endpoints

| Method | Implied Route | Evidence |
|--------|---------------|----------|
| GET | `/customers/{id}/addresses` | Array exists with `id` per address — implies list/read |
| POST | `/customers/{id}/addresses` | New addresses appended with `created_at` timestamps |
| PUT | `/customers/{id}/addresses/{addr_id}` | Each address has `id` + `updated_at` — implies edit |
| DELETE | `/customers/{id}/addresses/{addr_id}` | Unique `id` per address implies addressable delete |
| PUT | `/customers/{id}/addresses/{addr_id}/default` | `is_default: true` field implies a set-default action |

### Observations
- **No dedup:** Same address string appears multiple times (e.g., "Unnamed Road, Entally, Kolkata" repeated 10+ times for one customer)
- **No cap:** One customer has 132 addresses
- **`pos_address_id`** field exists (always null in data) — suggests planned sync with POS address system
- **`zone_id`** field exists — implies delivery zone mapping capability
- **`contact_person_name/number`** — supports delivery to someone other than the customer

---

## 2. Customer OTP Authentication

### Data Found: `customer_otps` collection (14 docs)

**Schema:**
```json
{
  "id": "9d41c83f-...",
  "phone": "1234567890",
  "user_id": "pos_0001_restaurant_509",
  "otp": "490781",
  "customer_id": "6298d975-...",
  "expires_at": "2026-04-13T16:49:25+00:00",
  "verified": true,
  "created_at": "2026-04-13T16:39:25+00:00"
}
```

**Note:** This is DIFFERENT from the CRM's `otp_tokens` collection (used for forgot-password). This is for **customer login via OTP** in the scan-and-order app.

### Implied Endpoints

| Method | Implied Route | Evidence |
|--------|---------------|----------|
| POST | `/customer/auth/request-otp` | OTP generated with phone + restaurant context (`user_id`) |
| POST | `/customer/auth/verify-otp` | `verified: true` field — confirms OTP verification flow |
| GET | `/customer/auth/me` or `/customer/profile` | After OTP login, customer needs to fetch their profile |

### Observations
- OTPs include `user_id` (restaurant context) — customer authenticates per-restaurant
- `customer_id` links to the `customers` collection
- 10-minute expiry window (`expires_at` - `created_at`)
- Some early OTPs lack `user_id` — schema evolved over time

---

## 3. Customer App Configuration

### Data Found: `customer_app_config` collection (28 docs)

**Schema (key fields):**
```json
{
  "restaurant_id": "pos_0001_restaurant_478",
  "primaryColor": "#E63946",
  "secondaryColor": "#1D3557",
  "backgroundColor": "#F1FAEE",
  "buttonTextColor": "#FFFFFF",
  "fontHeading": "Playfair Display",
  "fontBody": "Poppins",
  "logoUrl": "https://...",
  "tagline": "Fine Dining Experience",
  "welcomeMessage": "Welcome to 18march!",
  "banners": [{"id": "banner-1", "bannerImage": "...", "bannerTitle": "...", ...}],
  "showAboutUs": true,
  "showCallWaiter": true,
  "showCategories": true,
  "showPayBill": true,
  "showPriceBreakdown": true,
  "showPromotionsOnMenu": true,
  "showTableInfo": true,
  "feedbackEnabled": true,
  "feedbackIntroText": "We love hearing from you!",
  "aboutUsContent": "<h1>...</h1>",
  "aboutUsImage": "https://...",
  "openingHours": "<p>Open 24/7</p>",
  "address": "123 Food Street, Gourmet City",
  "contactEmail": "test@example.com",
  "phone": "+91 9998887776",
  "instagramUrl": "...",
  "facebookUrl": "...",
  "twitterUrl": "...",
  "whatsappNumber": "...",
  "youtubeUrl": "...",
  "navMenuOrder": [{"id": "home", "label": "Home", ...}],
  "customPages": [],
  "footerLinks": [{"label": "Contact", "url": "/contact"}],
  "footerText": "...",
  "mapEmbedUrl": "https://google.com/maps/embed?...",
  "showHamburgerMenu": true,
  "borderRadius": "very-rounded",
  "created_at": "...",
  "updated_at": "..."
}
```

### Implied Endpoints

| Method | Implied Route | Evidence |
|--------|---------------|----------|
| GET | `/customer-app/config/{restaurant_id}` | 28 configs for different restaurants — customer app fetches on load |
| PUT | `/customer-app/config/{restaurant_id}` | `updated_at` field — CRM admin updates branding/settings |
| GET | `/customer-app/menu/{restaurant_id}` | `showCategories`, `showPriceBreakdown` — implies menu display |
| POST | `/customer-app/call-waiter` | `showCallWaiter: true` — implies waiter call endpoint |
| POST | `/customer-app/pay-bill` | `showPayBill: true` — implies bill payment flow |
| POST | `/customer-app/feedback` | `feedbackEnabled: true` — customer submits feedback |

### Observations
- 28 restaurants have app configs
- `restaurant_id` format varies: some use `pos_0001_restaurant_XXX`, others use just `XXX` — dual format
- Full white-label support: colors, fonts, logos, banners, custom pages, nav order
- Restaurant info: address, phone, social links, map embed, opening hours

---

## 4. Dietary Tags Mapping

### Data Found: `dietary_tags_mapping` collection (5 docs)

**Schema:**
```json
{
  "restaurant_id": "689",
  "mappings": {
    "168400": ["jain"],
    "168409": ["jain"],
    "160550": ["lactose-free", "gluten-free"],
    "160632": ["vegan"]
  },
  "updated_at": "2026-03-14T06:27:44+00:00",
  "updated_by": null
}
```

### Implied Endpoints

| Method | Implied Route | Evidence |
|--------|---------------|----------|
| GET | `/menu/dietary-tags/{restaurant_id}` | Customer app needs to display dietary labels on menu items |
| PUT | `/menu/dietary-tags/{restaurant_id}` | `updated_at` + `updated_by` — admin maps tags to food items |

### Observations
- Keys in `mappings` are food IDs (from MyGenie POS menu)
- Values are dietary tag arrays: `jain`, `vegan`, `gluten-free`, `lactose-free`, `high-protein`
- 5 restaurants have dietary mappings

---

## 5. Customer Password Hash

### Data Found: `customers.password_hash` field (8 customers)

This field exists on 8 customer documents — NOT on user (restaurant owner) documents. This implies the scan-and-order app supports **password-based customer login** in addition to OTP.

### Implied Endpoints

| Method | Implied Route | Evidence |
|--------|---------------|----------|
| POST | `/customer/auth/register` | Customer creates account with password |
| POST | `/customer/auth/login` | Login with phone + password |
| PUT | `/customer/auth/change-password` | Password can be updated |

---

## Summary: What the Other App Manages

| Domain | Collection / Field | Docs | This CRM Can Read? | This CRM Can Write? |
|--------|-------------------|------|---------------------|---------------------|
| Customer Addresses | `customers.addresses[]` | 20 customers | **NO** (Pydantic drops it) | **NO** (no code) |
| Customer OTP Auth | `customer_otps` | 14 | **NO** (no code) | **NO** (no code) |
| Customer App Config | `customer_app_config` | 28 | **NO** (no code) | **NO** (no code) |
| Dietary Tags | `dietary_tags_mapping` | 5 | **NO** (no code) | **NO** (no code) |
| Customer Password | `customers.password_hash` | 8 customers | **NO** (not in model) | **NO** (no code) |
| Test Data | `test` | 1 | **NO** | **NO** |

### Cross-App Data Flow (Shared `customers` Collection)

```
┌─────────────────────┐          ┌─────────────────────┐
│   CRM Backend       │          │  Scan & Order App   │
│   (this codebase)   │          │  (other codebase)   │
│                     │          │                     │
│  Writes:            │          │  Writes:            │
│  - name, phone      │          │  - addresses[]      │
│  - tier, points     │  shared  │  - password_hash    │
│  - visits, spent    │◄────────►│                     │
│  - loyalty fields   │ MongoDB  │  Reads:             │
│  - flat address     │          │  - name, phone      │
│                     │          │  - tier, points     │
│  Cannot see:        │          │  - menu items       │
│  - addresses[]      │          │  - loyalty details  │
│  - password_hash    │          │                     │
└─────────────────────┘          └─────────────────────┘
         │                                │
         │        52.66.232.149           │
         └────────► MongoDB ◄─────────────┘
                   (mygenie DB)
```
