# Credential Rotation Checklist — CR-2026-07-03-007 F-07
# CR-2026-07-03-007 F-07 · 2026-09-13
# Owner replaces placeholder team names and ticks boxes after each rotation.

## How to use
1. When a credential is rotated, tick the box and record the date.
2. Update the corresponding .env file on the deployed pod.
3. Restart the backend: `sudo supervisorctl restart backend`
4. Smoke test: `curl localhost:8001/api/healthz` → {"ok":true,"mongo":"up"}

## Credentials to rotate

| Credential | Key name | Team responsible | Last rotated | Status |
|---|---|---|---|---|
| MongoDB password | `MONGO_URL` (password field) | DBA / Database team | [date TBD] | ❌ Pending (May 2026 leak — see D-007-1a) |
| POS service-account password | `MYGENIE_POS_LOGIN_PASSWORD` | Security / Ops team | [date TBD] | ❌ Pending (D-007-1b) |
| JWT signing secret | `JWT_SECRET` | Backend team | [date TBD] | ❌ Pending (D-007-1c) |
| Google Maps API key | `REACT_APP_GOOGLE_MAPS_API_KEY` | Ops / DevOps team | [date TBD] | ❌ Pending (D-007-1d); also restrict by HTTP referrer in GCP console |

## After rotation
- Update `.env` files on all deployed pods.
- Do NOT commit real values to git — `.env` is gitignored.
- Verify `.env.example` reflects any new key names (but not values).
