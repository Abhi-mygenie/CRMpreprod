# MyGenie CRM API Documentation (Sample)

**Base URL:** `https://your-domain.com/api`  
**Version:** v1.0  
**Last Updated:** 2026-03-17

---

## Authentication

### POST `/auth/login`

**Description:**  
Authenticates user via MyGenie POS system and returns access token for subsequent API calls.

**Authentication Required:** No

---

#### Request

**Headers:**
| Header | Value | Required |
|--------|-------|----------|
| Content-Type | application/json | Yes |

**Body Parameters:**
| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| email | string | Yes | User's registered email address | Valid email format |
| password | string | Yes | User's password | Min 6 characters |

**Example Request:**
```bash
curl -X POST "https://your-domain.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@restaurant.com",
    "password": "securepass123"
  }'
```

---

#### Response

**Success Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "pos_0001_restaurant_709",
    "email": "owner@restaurant.com",
    "restaurant_name": "Young Monk Cafe",
    "phone": "9876543210",
    "pos_id": "0001",
    "pos_name": "MyGenie",
    "created_at": "2026-03-06T10:33:11.321718+00:00"
  },
  "is_demo": false
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| access_token | string | JWT token for authenticating subsequent requests |
| token_type | string | Always "bearer" |
| user | object | User profile information |
| user.id | string | Unique user identifier (format: `pos_{pos_id}_restaurant_{restaurant_id}`) |
| user.email | string | User's email address |
| user.restaurant_name | string | Name of the restaurant |
| user.phone | string | Contact phone number |
| user.pos_id | string | POS system identifier |
| user.pos_name | string | POS system name |
| user.created_at | string | Account creation timestamp (ISO 8601) |
| is_demo | boolean | True if demo account, false for real accounts |

---

#### Error Responses

| Status Code | Error | Description |
|-------------|-------|-------------|
| 401 | Invalid credentials | Email or password is incorrect |
| 422 | Validation error | Missing or invalid request body |
| 503 | MyGenie API error | External POS authentication service unavailable |
| 504 | MyGenie API timeout | External POS authentication timed out |

**Error Response Example (401):**
```json
{
  "detail": "Invalid credentials"
}
```

**Error Response Example (422):**
```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

---

#### Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│  CRM API    │────▶│ MyGenie POS │
│             │     │  /auth/login│     │    API      │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           │◀──────────────────┤
                           │   Token + Profile │
                           │                   │
                    ┌──────▼──────┐            
                    │  MongoDB    │            
                    │ Create/Update│            
                    │    User     │            
                    └─────────────┘            
```

---

#### Notes

1. **Token Expiry:** Access tokens expire after 24 hours
2. **First Login:** Creates user record with default loyalty settings and WhatsApp templates
3. **Subsequent Logins:** Updates `mygenie_token` and `last_login` timestamp
4. **Token Usage:** Include in Authorization header as `Bearer {access_token}`

---

#### Related Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/me` | GET | Get current user profile |
| `/auth/demo-login` | POST | Demo mode login (no credentials) |
| `/auth/reset-password` | PUT | Change password (authenticated) |
| `/auth/forgot-password/request-otp` | POST | Request password reset OTP |
