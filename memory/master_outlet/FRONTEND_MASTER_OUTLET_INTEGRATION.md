# Master Outlet Frontend Integration

This document explains how the frontend should use the master outlet group APIs.

## User Flow

1. Customer opens the master outlet website.
2. Frontend asks customer to enter or detect address.
3. Frontend sends pincode and/or latitude/longitude to backend.
4. Backend returns restaurants in the master group that deliver to that location.
5. Frontend shows restaurant cards.
6. Customer selects one restaurant.
7. Frontend redirects customer to the restaurant `redirect_url`.
8. Existing restaurant ordering flow continues unchanged.

## Base URL

For preprod:

```text
https://preprod.mygenie.online
```

## Public APIs

These APIs are used by the customer-facing master outlet website.

### Get Master Outlet Group

Use this API when the master outlet page loads.

```http
GET /api/v1/master-outlet/{identifier}
```

`identifier` can be:

```text
478
sample-master-outlet-478
master-outlet-478.local
```

Example:

```http
GET https://preprod.mygenie.online/api/v1/master-outlet/478
```

Expected response:

```json
{
  "id": 1,
  "name": "18march Group",
  "slug": "sample-master-outlet-478",
  "domain": "master-outlet-478.local",
  "logo": "2025-12-01-692d6b75d92cd.png",
  "status": 1,
  "master_restaurant_id": 478,
  "restaurants_count": 3
}
```

Frontend use:

- Show group name/logo.
- Store group/master identifier for location verification.
- Do not show restaurant list from this API; use verify-location API for deliverable restaurants.

### Verify Customer Location

Use this API after customer enters pincode or map location.

```http
POST /api/v1/master-outlet/{identifier}/verify-location
```

Example:

```http
POST https://preprod.mygenie.online/api/v1/master-outlet/478/verify-location
```

Headers:

```http
Accept: application/json
Content-Type: application/json
```

Request by pincode:

```json
{
  "pincode": "110001",
  "limit": 20,
  "offset": 1
}
```

Request by pincode and map location:

```json
{
  "pincode": "110001",
  "latitude": 28.6139,
  "longitude": 77.209,
  "address": "Connaught Place, New Delhi",
  "limit": 20,
  "offset": 1
}
```

Request by latitude/longitude only:

```json
{
  "latitude": 28.6139,
  "longitude": 77.209,
  "address": "Connaught Place, New Delhi",
  "limit": 20,
  "offset": 1
}
```

Success response:

```json
{
  "service_available": true,
  "group": {
    "id": 1,
    "name": "18march Group",
    "slug": "sample-master-outlet-478",
    "master_restaurant_id": 478
  },
  "searched_location": {
    "pincode": "110001",
    "latitude": 28.6139,
    "longitude": 77.209,
    "address": "Connaught Place, New Delhi"
  },
  "total_size": 2,
  "limit": 20,
  "offset": 1,
  "restaurants": [
    {
      "id": 510,
      "name": "Mygenie Dev",
      "phone": "9714176033",
      "logo": null,
      "logo_url": null,
      "address": "Surat",
      "latitude": "15.045063224804405",
      "longitude": "73.99365083749831",
      "minimum_order": 0,
      "delivery": true,
      "take_away": true,
      "open": false,
      "distance": 1544.61,
      "distance_unit": "km",
      "web_url": "https://18march.mygenie.online/510",
      "redirect_url": "https://18march.mygenie.online/510",
      "delivery_available": true,
      "delivery_match": {
        "type": "pincode",
        "pincode": "110001",
        "radius_km": 6
      },
      "cuisine": []
    }
  ],
  "message": "Restaurants found for this location"
}
```

No service response:

```json
{
  "service_available": false,
  "total_size": 0,
  "restaurants": [],
  "message": "No outlet delivers to this location"
}
```

## Matching Rules

If `pincode` is sent:

- Backend matches restaurants by pincode.
- Pincode has priority.
- Radius matching is not used when pincode is provided.

If only `latitude` and `longitude` are sent:

- Backend matches restaurants using configured delivery radius.

If both pincode and latitude/longitude are sent:

- Backend matches by pincode.
- Distance is still returned for display/sorting.

## Frontend Screens

### 1. Location Entry

Fields:

- Pincode input
- Use current location button
- Address text from map/autocomplete, optional

Validation:

- Require pincode OR latitude and longitude.
- Show error if user submits empty location.

### 2. Restaurant Selection

Show only restaurants returned from `restaurants`.

Recommended card fields:

- Logo
- Restaurant name
- Address
- Open/closed status
- Distance if available
- Minimum order
- Cuisine tags if available
- Select button

Select button behavior:

```js
window.location.href = restaurant.redirect_url;
```

Do not build redirect URL manually. Always use `redirect_url`.

### 3. No Service State

If `service_available` is `false`:

- Show message: `No outlet delivers to this location`
- Allow customer to change pincode/location

## Example JavaScript

```js
const BASE_URL = "https://preprod.mygenie.online";
const MASTER_RESTAURANT_ID = 478;

async function verifyLocation({ pincode, latitude, longitude, address }) {
  const response = await fetch(
    `${BASE_URL}/api/v1/master-outlet/${MASTER_RESTAURANT_ID}/verify-location`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pincode,
        latitude,
        longitude,
        address,
        limit: 20,
        offset: 1
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw data;
  }

  return data;
}

function redirectToRestaurant(restaurant) {
  if (!restaurant.redirect_url) {
    return;
  }

  window.location.href = restaurant.redirect_url;
}
```

## Management APIs

These APIs are for admin/vendor frontend, not customer website.

All management APIs require a valid vendor employee Bearer token for the master restaurant.

Headers:

```http
Accept: application/json
Content-Type: application/json
Authorization: Bearer <token>
```

### Create Group

```http
POST /api/v1/master-outlet/group
```

```json
{
  "master_restaurant_id": 478,
  "name": "18march Group",
  "slug": "18march-group",
  "domain": "18march.mygenie.online",
  "logo": null,
  "status": 1
}
```

### Update Group

```http
PATCH /api/v1/master-outlet/group/{group_id}
```

```json
{
  "name": "18march Group",
  "domain": "18march.mygenie.online",
  "status": 1
}
```

### Set Group Restaurants

```http
POST /api/v1/master-outlet/group/{group_id}/restaurants
```

```json
{
  "replace": true,
  "restaurants": [
    {
      "restaurant_id": 478,
      "is_master": 1,
      "sort_order": 0,
      "status": 1
    },
    {
      "restaurant_id": 510,
      "is_master": 0,
      "sort_order": 1,
      "status": 1
    },
    {
      "restaurant_id": 675,
      "is_master": 0,
      "sort_order": 2,
      "status": 1
    }
  ]
}
```

### Remove Restaurant From Group

```http
DELETE /api/v1/master-outlet/group/{group_id}/restaurants/{restaurant_id}
```

The master restaurant cannot be removed from its own group.

### Set Delivery Areas

```http
POST /api/v1/master-outlet/restaurant/{restaurant_id}/delivery-areas
```

```json
{
  "replace": true,
  "areas": [
    {
      "pincode": "110001",
      "latitude": 28.6304,
      "longitude": 77.2177,
      "radius_km": 6,
      "status": 1
    },
    {
      "pincode": "110002",
      "latitude": 28.6421,
      "longitude": 77.2436,
      "radius_km": 5,
      "status": 1
    }
  ]
}
```

Use `replace: true` when saving the full delivery area list from a settings screen.

Use `replace: false` or omit it when adding/updating one pincode without deleting old rows.

## Important Frontend Notes

- Customer website does not need login token for public location verification.
- Admin/vendor settings screen needs Bearer token.
- Always redirect with `restaurant.redirect_url`.
- Do not assume every restaurant is open; use `open` field.
- Do not show unavailable restaurants. Backend already filters them out.
- If `logo_url` is null, show default restaurant placeholder image.
- Use `total_size` for pagination/display count.
- Use `service_available` for deciding between restaurant list and no-service message.

## Postman Collection

Import this file into Postman:

```text
D:\xampp\htdocs\mygenie\mygenie_backend\postman_master_outlet_collection.json
```

Set collection variables:

```text
base_url = https://preprod.mygenie.online
token = your vendor employee token
master_restaurant_id = 478
group_id = 1
branch_restaurant_id = 510
```
