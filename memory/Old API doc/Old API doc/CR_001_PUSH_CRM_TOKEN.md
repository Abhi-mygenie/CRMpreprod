# CR: Push CRM Token to MyGenie on First-Time Login

## Change Request ID: CR-001
## Date: April 24, 2026
## Status: PLANNED (Not Implemented)
## Priority: P0

---

## Summary

On first-time CRM login (new restaurant user creation), push the generated CRM API key (`crm_token`) to MyGenie POS via their endpoint. This allows MyGenie POS to automatically call CRM webhook endpoints without manual key copy.

---

## Current Behavior

1. User logs into CRM → CRM authenticates with MyGenie → creates user + API key
2. API key is returned in login response as `pos_config.api_key`
3. **POS has no way to know the CRM key** unless it reads the login response or user manually copies from Settings

---

## Desired Behavior

1. User logs into CRM → CRM authenticates with MyGenie → creates user + API key
2. **CRM pushes API key to MyGenie** via `POST /api/v1/auth/restaurant-crm-token`
3. MyGenie stores the key against `restaurant_id`
4. POS can now call CRM webhooks using this key (e.g., `/pos/orders`, `/pos/events`)

---

## Technical Specification

### File to Modify
`/app/backend/routers/auth.py` — `mygenie_login()` function

### Where to Add (Line ~363, after `await db.users.insert_one(user_doc)`)

```python
# Push CRM token to MyGenie POS (first-time only)
try:
    await client.post(
        f"{mygenie_api_url}/api/v1/auth/restaurant-crm-token",
        json={
            "restaurant_id": restaurant_id,
            "crm_token": api_key
        },
        headers={"Content-Type": "application/json"},
        timeout=10.0
    )
except Exception:
    pass  # Fire-and-forget — login should not fail if POS push fails
```

### Placement in Flow

```
Step 1: CRM → MyGenie login (get mygenie_token)
Step 2: CRM → MyGenie profile (get restaurant_id)
Step 3: CRM creates user + generates api_key
Step 4: CRM → MyGenie push crm_token  ← THIS CHANGE
Step 5: CRM creates loyalty_settings, whatsapp_templates
Step 6: CRM returns response to frontend
```

### Conditions
- **Only on FIRST TIME login** (inside the `if not existing_user:` block, after `insert_one`)
- **NOT on subsequent logins** (existing user path only updates token/password)
- **Fire-and-forget** — if MyGenie API fails, CRM login still succeeds
- **No auth header needed** — MyGenie endpoint is public

### MyGenie Endpoint
```
POST https://preprod.mygenie.online/api/v1/auth/restaurant-crm-token
Content-Type: application/json
Body: {
  "restaurant_id": "478",
  "crm_token": "dp_live_RYi2kErcTBe_rx52lFmL8_Ahp59B927F8YHqU04tSEU"
}
Response: { "message": "CRM token updated successfully" }
```

---

## Validation Steps

1. **Delete a test user** from `users` collection (e.g., a dev restaurant)
2. **Login with that user's credentials** → should trigger first-time flow
3. **Check MyGenie** — verify `crm_token` was stored for that `restaurant_id`
4. **Login again** with same user → should NOT call the push endpoint
5. **Test POS webhook** — use the pushed key to call `/pos/orders` and confirm it works

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| MyGenie API down during login | None — fire-and-forget | `try/except pass` |
| Wrong restaurant_id pushed | POS can't call CRM | Use same `restaurant_id` from profile response |
| Key regenerated later | POS has stale key | Separate CR: push on key regeneration too |

---

## Future Consideration

If API key is **regenerated** from CRM Settings page (`POST /pos/api-key/regenerate`), the new key should also be pushed to MyGenie. This is a separate CR and lower priority since key regeneration is rare.

---

## Dependencies
- MyGenie endpoint `POST /api/v1/auth/restaurant-crm-token` must be live (confirmed working)
- No CRM frontend changes needed
- No database schema changes needed

---

## Estimated Effort
- **Code change**: ~5 lines in `auth.py`
- **Testing**: 15 minutes (create new user, verify push, verify subsequent login skips)
