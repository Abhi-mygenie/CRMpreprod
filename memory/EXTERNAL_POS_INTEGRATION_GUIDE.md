# External POS Integration Guide

> **Version:** 1.0
> **Last Updated:** April 14, 2026
> **Audience:** External POS vendors (Petpooja, Ezzo, Torqus, UrbanPiper, etc.)

---

## Overview

MyGenie CRM provides a POS Gateway API that allows any POS system to integrate with the CRM for customer loyalty, order tracking, address management, coupon validation, and WhatsApp notifications.

This guide covers how external POS systems connect to the CRM, the available integration approaches, and the roadmap for deeper integration.

---

## Current Approach: API Key (Available Now)

### How It Works

```
┌──────────────────┐          ┌──────────────────┐
│  Restaurant Owner │          │  Restaurant Owner │
│  (CRM Dashboard)  │          │  (POS Dashboard)  │
└────────┬─────────┘          └────────┬─────────┘
         │                             │
    1. Login to CRM              4. Paste API key
    2. Settings → POS             in POS webhook
    3. Copy API key                config
         │                             │
         ▼                             ▼
┌──────────────────┐          ┌──────────────────┐
│   MyGenie CRM    │◄─────────│   POS System     │
│   /api/pos/*     │  API Key │  (Petpooja etc.) │
└──────────────────┘  Header  └──────────────────┘
```

### Setup Steps

**For the Restaurant Owner:**

1. Log into CRM Dashboard → Settings → POS Integration
2. Copy the API key shown (format: `dp_live_xxxxxxxxxx`)
3. Log into your POS system (Petpooja, Ezzo, etc.)
4. Go to Integrations / Webhooks / CRM settings
5. Enter:
   - **Webhook URL / API Base URL:** `https://{crm-domain}/api/pos`
   - **API Key:** paste the key from step 2
6. Save and test

**For the POS Developer:**

All API calls must include the API key in the `X-API-Key` header:

```
X-API-Key: dp_live_xxxxxxxxxxxxxxxxxx
```

Refer to **POS_API.md** for the complete endpoint reference (23 endpoints).

### Key Management

| Action | Endpoint | Auth |
|--------|----------|------|
| Get current key | `GET /api/pos/api-key` | CRM Staff JWT |
| Regenerate key | `POST /api/pos/api-key/regenerate` | CRM Staff JWT |

**Important:** When a key is regenerated, all POS systems using the old key will stop working immediately. The restaurant owner must update the key in each POS system.

### Limitations

- One API key per restaurant (shared across all POS systems)
- Static key — doesn't expire until regenerated
- No per-POS access control (all POS systems get the same permissions)
- Manual setup — restaurant owner copies the key

---

## Phase 2: OAuth2 Client Credentials (Planned)

### Why

When multiple POS systems integrate with the same restaurant's CRM, a single shared API key becomes a problem:

- Can't revoke one POS without affecting others
- Can't track which POS made which call
- Can't limit scopes per POS (Petpooja gets order access, but maybe not coupon management)
- Key rotation requires updating all POS systems simultaneously

### How It Will Work

```
┌──────────────────┐     ┌──────────────────┐
│  Restaurant Owner │     │   CRM Backend    │
│  (CRM Dashboard)  │     │                  │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
    1. Settings → POS        2. Generates
       → "Add POS"              client_id +
       → Select "Petpooja"      client_secret
         │                        │
         ▼                        ▼
    3. Copy client_id +      Stores in
       client_secret          pos_clients
         │                   collection
         │
    4. Configure in Petpooja
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│   POS System     │────►│   CRM Backend    │
│  (Petpooja)      │     │                  │
└──────────────────┘     └──────────────────┘

Runtime:
  POST /api/pos/oauth/token
  { client_id, client_secret, grant_type: "client_credentials" }
  → { access_token: "...", expires_in: 3600, token_type: "Bearer" }
  
  GET /api/pos/customers?search=raj
  Authorization: Bearer {access_token}
```

### New Endpoints (Planned)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/pos/clients` | CRM Staff JWT | Create POS client (generates client_id + secret) |
| GET | `/api/pos/clients` | CRM Staff JWT | List connected POS clients |
| DELETE | `/api/pos/clients/{id}` | CRM Staff JWT | Revoke a POS connection |
| POST | `/api/pos/oauth/token` | Public (client credentials) | Exchange credentials for access token |
| POST | `/api/pos/oauth/revoke` | Public (access token) | Revoke an access token |

### New Data Model

```
pos_clients collection:
{
  "id": "uuid",
  "client_id": "crm_pos_xxxxxxxx",
  "client_secret_hash": "$2b$12$...",    // bcrypt hashed
  "pos_name": "Petpooja",               // Display name
  "pos_vendor": "petpooja",             // Vendor identifier
  "restaurant_id": "pos_0001_restaurant_509",
  "user_id": "pos_0001_restaurant_509",
  "scopes": ["customers:read", "customers:write", "orders:write", "loyalty:read"],
  "is_active": true,
  "last_used_at": "2026-04-14T...",
  "last_ip": "52.66.232.149",
  "created_at": "2026-04-14T...",
  "created_by": "owner@restaurant.com"
}
```

### Scopes

| Scope | Allows |
|-------|--------|
| `customers:read` | Search, lookup, get customer details |
| `customers:write` | Create, update, deactivate customers |
| `addresses:read` | List addresses, cross-restaurant lookup |
| `addresses:write` | Add, update, delete addresses |
| `orders:write` | Submit orders via webhook |
| `orders:read` | Get customer order history |
| `loyalty:read` | Get loyalty summary, max redeemable |
| `loyalty:write` | (Reserved — points are auto-calculated on orders) |
| `coupons:read` | Validate coupons |
| `coupons:write` | Apply coupons |
| `events:write` | Trigger WhatsApp events |
| `notes:read` | Get customer item/order notes |

### Auth Dependency Update

The existing `verify_pos_auth` will support three auth methods:

```python
async def verify_pos_auth(request):
    # Priority 1: OAuth Bearer token (from /pos/oauth/token)
    # Priority 2: API Key (X-API-Key header) — backward compatible
    # Priority 3: CRM Staff JWT (Authorization: Bearer) — MyGenie flow
```

All three resolve to the same restaurant user. Existing integrations using API Key continue to work unchanged.

### Token Specification

| Property | Value |
|----------|-------|
| Format | JWT |
| Algorithm | HS256 |
| Expiry | 1 hour |
| Claims | `{ client_id, restaurant_id, scopes, type: "pos_oauth", exp }` |
| Refresh | Re-exchange client credentials (no refresh token) |

---

## Phase 3: POS Marketplace (Future)

### Concept

A self-service integration marketplace where POS vendors register once, and restaurant owners connect with a click.

```
POS Vendor (one-time):
  1. Register at CRM Partner Portal
  2. Get partner_id + partner_secret
  3. Build integration, submit for review
  4. Listed in CRM Marketplace

Restaurant Owner:
  1. CRM → Marketplace → "Petpooja" → "Connect"
  2. Redirected to Petpooja consent screen
  3. Petpooja confirms → CRM auto-provisions credentials
  4. Done — no manual key copy
```

### Prerequisites
- 5+ POS integrations in production
- Partner portal for POS vendor onboarding
- OAuth2 authorization code flow (not just client credentials)
- Integration review/approval process
- CRM Dashboard → Marketplace UI

### Not planned for immediate implementation.

---

## Integration Comparison

| | API Key (Now) | OAuth2 (Phase 2) | Marketplace (Phase 3) |
|---|---|---|---|
| **Setup effort** | 2 min (copy-paste) | 5 min (generate client) | 30 sec (one-click) |
| **Per-POS credentials** | No (shared key) | Yes | Yes |
| **Per-POS scopes** | No | Yes | Yes |
| **Per-POS revocation** | No (revokes all) | Yes | Yes |
| **Token expiry** | Never (until regenerated) | 1 hour | 1 hour |
| **Audit trail** | API key only | Per-client tracking | Full audit |
| **POS vendor effort** | Add header | Implement token exchange | OAuth consent flow |
| **Development effort** | Zero (done) | Medium (1-2 weeks) | Large (1-2 months) |
| **Best for** | 1-2 POS | 3-5 POS | 5+ POS |

---

## POS Vendor Quick Start

### Step 1: Get Credentials

Contact the restaurant owner to obtain:
- **API Base URL:** `https://{restaurant-crm-domain}/api/pos`
- **API Key:** from CRM Dashboard → Settings → POS Integration

### Step 2: Test Connection

```bash
curl -X POST https://{domain}/api/pos/customer-lookup \
  -H "X-API-Key: dp_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210"}'
```

### Step 3: Implement Core Flows

**Minimum viable integration:**

| Priority | Flow | Endpoints |
|----------|------|-----------|
| P0 | Customer sync | `POST /pos/customers`, `POST /pos/customer-lookup` |
| P0 | Order sync | `POST /pos/orders` |
| P1 | Loyalty display | `GET /pos/customers/{id}/loyalty`, `POST /pos/max-redeemable` |
| P1 | Delivery addresses | `GET /pos/customers/{id}/addresses` |
| P2 | Coupon integration | `POST /pos/coupons/validate`, `POST /pos/coupons/apply` |
| P2 | WhatsApp events | `POST /pos/events` |
| P3 | Customer notes | `GET /pos/customers/{id}/notes/items` |

### Step 4: Refer to POS_API.md

Full endpoint documentation with request/response examples is in **POS_API.md** (23 endpoints).

---

## Webhook vs Polling

**Recommended: Webhook (push)**

POS sends data to CRM as events happen:
- Customer created/updated → `POST /pos/customers`
- Order placed → `POST /pos/orders`
- Order event → `POST /pos/events`

**Alternative: Polling (pull)**

CRM doesn't currently expose "what changed since X" endpoints. If your POS architecture requires polling, contact us to discuss adding:
- `GET /pos/customers/changes?since=2026-04-14T00:00:00`
- `GET /pos/orders/changes?since=2026-04-14T00:00:00`

These are not yet implemented but can be added based on demand.

---

## Support

For integration support:
- **API Documentation:** `POS_API.md`
- **OpenAPI Spec:** `https://{domain}/api/docs` (Swagger UI)
- **Technical Contact:** (to be configured per restaurant)
