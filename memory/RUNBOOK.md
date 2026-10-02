# Runbook — Operational Procedures

> Step-by-step procedures for routine operations. Copy-pasteable. Verified during 2026-05-28 session unless noted.

---

## Index

1. [Service health check](#1-service-health-check)
2. [Restart backend / frontend](#2-restart-backend--frontend)
3. [Verify MongoDB connectivity](#3-verify-mongodb-connectivity)
4. [Register AuthKey webhook URL](#4-register-authkey-webhook-url)
5. [Fire a synthetic POS order (E2E test)](#5-fire-a-synthetic-pos-order-e2e-test)
6. [Trace a WhatsApp message end-to-end](#6-trace-a-whatsapp-message-end-to-end)
7. [Replay captured AuthKey callbacks](#7-replay-captured-authkey-callbacks)
8. [Read backend / frontend logs](#8-read-backend--frontend-logs)
9. [Add a Python package safely](#9-add-a-python-package-safely)
10. [Add a frontend package safely](#10-add-a-frontend-package-safely)
11. [Rotate the preview URL after a pod refresh](#11-rotate-the-preview-url-after-a-pod-refresh)
12. [Inspect a tenant's WhatsApp config](#12-inspect-a-tenants-whatsapp-config)

---

## 1. Service health check

```bash
sudo supervisorctl status
curl -s http://localhost:8001/api/health
curl -s -o /dev/null -w "Frontend HTTP: %{http_code}\n" http://localhost:3000/
```

Expected: backend + frontend both `RUNNING` in supervisor; `/api/health` returns `{"status":"healthy",...}`; frontend returns 200.

---

## 2. Restart backend / frontend

```bash
sudo supervisorctl restart backend frontend
sleep 5
sudo supervisorctl status
```

When to use: after `.env` change or dependency install. **Not needed** for normal code edits — hot reload handles them.

---

## 3. Verify MongoDB connectivity

```bash
cd /app/backend && python3 -c "
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv; load_dotenv('.env')
async def t():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=5000)
    cols = await c[os.environ['DB_NAME']].list_collection_names()
    print(f'OK — {len(cols)} collections')
asyncio.run(t())
"
```

Expected: `OK — 19 collections` (or similar count).

---

## 4. Register AuthKey webhook URL

Done in **AuthKey console** by owner, per WABA account.

| Field | Value |
|---|---|
| URL | `https://<current-preview-host>/api/whatsapp/status-callback` (or prod URL if pushed) |
| Method | POST |
| Content-Type | `application/x-www-form-urlencoded` (AuthKey default) |
| Auth | None (endpoint is intentionally public) |

After registration, verify by sending one real WhatsApp and checking `whatsapp_callback_logs` for an arriving row within 30 seconds.

---

## 5. Fire a synthetic POS order (E2E test)

```bash
TS=$(date +%s)
ORDER_ID="E2E${TS}"
PREVIEW_URL="https://<current-preview-host>"  # from frontend/.env

curl -sS -X POST "${PREVIEW_URL}/api/pos/orders" \
  -H "X-API-Key: dp_live_<R689-pos-api-key>" \
  -H "Content-Type: application/json" \
  -d "{
    \"pos_id\": \"0001\",
    \"restaurant_id\": \"689\",
    \"restaurant_name\": \"Kunafa Mahal\",
    \"order_id\": \"${ORDER_ID}\",
    \"restaurant_order_id\": \"E2E_TEST\",
    \"cust_mobile\": \"7505242126\",
    \"cust_name\": \"abhishek jain\",
    \"order_amount\": 555.0,
    \"order_sub_total_amount\": 500.0,
    \"tax_amount\": 55.0,
    \"gst_tax\": 55.0,
    \"payment_method\": \"cash\",
    \"payment_status\": \"paid\",
    \"payment_type\": \"prepaid\",
    \"order_type\": \"dinein\",
    \"order_status\": \"completed\",
    \"items\": [{\"item_name\": \"E2E Test Kunafa\", \"item_qty\": 1, \"item_price\": 500.0, \"gst_amount\": 55.0, \"is_veg\": true}]
  }"
echo "$ORDER_ID" > /tmp/e2e_order_id.txt
```

Then sleep 35 seconds and run procedure #6 to trace.

**Caution**: sends a real WhatsApp to abhi (`7505242126`) and inserts a real row in shared `orders`. Use only for designated test scenarios.

---

## 6. Trace a WhatsApp message end-to-end

After firing an order, locate the matching `whatsapp_message_logs` row and trace through 5 stages: order persistence → message_log row → AuthKey response → callbacks → final dashboard state.

Sample script (substitute the order_id):

```python
# Save as /tmp/trace.py and run: cd /app/backend && python3 /tmp/trace.py
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv('.env')

ORDER_ID = "<your-order-id>"
UID = "pos_0001_restaurant_689"

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]

    print("STAGE 1 — ORDER")
    o = await db.orders.find_one({"user_id": UID, "pos_order_id": ORDER_ID})
    print(f"  pos_order_id={o.get('pos_order_id')}  total={o.get('order_amount')}")

    print("\nSTAGE 2 — MESSAGE LOG")
    row = await db.whatsapp_message_logs.find_one(
        {"user_id": UID, "reference_id": o.get("id")},
        sort=[("created_at", -1)]
    )
    print(f"  message_id={row.get('message_id')}  status={row.get('status')}")
    print(f"  idempotency_key={row.get('idempotency_key')}")

    logid = row.get("message_id")
    print(f"\nSTAGE 3 — CALLBACKS (logid={logid})")
    async for cb in db.whatsapp_callback_logs.find({"logid": logid}).sort("received_at", 1):
        print(f"  {cb.get('received_at')}  verdict={cb.get('verdict')}  status={cb.get('parsed',{}).get('status')}")

    print("\nSTAGE 4 — FINAL")
    final = await db.whatsapp_message_logs.find_one({"message_id": logid})
    print(f"  status={final.get('status')}  delivered_at={final.get('delivered_at')}  read_at={final.get('read_at')}")
    print(f"  status_history len={len(final.get('status_history', []))}")

asyncio.run(main())
```

Expected for a healthy flow: row inserted with logid, two callbacks (`delivered`, `read`) both `verdict=applied`, final status `read`, `status_history` 3 entries.

---

## 7. Replay captured AuthKey callbacks

When a webhook bug is found, replay captured payloads against the patched endpoint:

```python
import asyncio, os, httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv('.env')

WEBHOOK = "http://localhost:8001/api/whatsapp/status-callback"

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]

    # Pull recent captured payloads
    payloads = []
    async for cb in db.whatsapp_callback_logs.find({}).sort("received_at", -1).limit(3):
        if cb.get("raw_body"):
            payloads.append(cb["raw_body"])

    async with httpx.AsyncClient(timeout=10) as client:
        for body in payloads:
            r = await client.post(
                WEBHOOK,
                content=body,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            print(f"HTTP {r.status_code} → {r.text}")

asyncio.run(main())
```

---

## 8. Read backend / frontend logs

```bash
tail -n 200 /var/log/supervisor/backend.err.log
tail -n 100 /var/log/supervisor/backend.out.log
tail -n 100 /var/log/supervisor/frontend.err.log
tail -n 100 /var/log/supervisor/frontend.out.log
```

For live tailing during an active test:
```bash
tail -f /var/log/supervisor/backend.err.log
```

---

## 9. Add a Python package safely

```bash
cd /app/backend
pip install <package>
pip freeze > requirements.txt
sudo supervisorctl restart backend
```

**Never** hand-edit `requirements.txt` — pin drift will break the env.

---

## 10. Add a frontend package safely

```bash
cd /app/frontend
yarn add <package>
sudo supervisorctl restart frontend
```

**Never** use `npm install` — yarn lockfile + npm causes breakage.

---

## 11. Rotate the preview URL after a pod refresh

If pod ID changes (rare):

1. Get new pod URL from `/etc/supervisor/conf.d/*.conf` or platform env vars.
2. Update `/app/frontend/.env::REACT_APP_BACKEND_URL`.
3. Update README §7, CR_STATUS_DASHBOARD.md, and any open discovery docs referencing the URL.
4. Re-register the AuthKey webhook URL via procedure #4.
5. Restart frontend.

---

## 12. Inspect a tenant's WhatsApp config

```python
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv('.env')

UID = "pos_0001_restaurant_689"  # change as needed

async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]

    u = await db.users.find_one({"id": UID}, {"_id": 0, "authkey_api_key": 1, "brand_number": 1, "meta_waba_id": 1, "restaurant_name": 1, "phone": 1, "email": 1, "address": 1})
    print("USER doc:")
    for k, v in u.items():
        if "key" in k.lower():
            print(f"  {k}: ...{(v or '')[-4:]}")
        else:
            print(f"  {k}: {v}")

    print("\nEVENT → TEMPLATE mappings:")
    async for em in db.whatsapp_event_template_map.find({"user_id": UID}):
        print(f"  {em.get('event_key')} → template {em.get('template_id')} ({em.get('template_name')})  enabled={em.get('is_enabled')}")

    print("\nTEMPLATE variable mappings:")
    async for vm in db.whatsapp_template_variable_map.find({"user_id": UID}):
        print(f"  template {vm.get('template_id')} ({vm.get('template_name')})")
        for slot, var in (vm.get("mappings") or {}).items():
            print(f"     {slot} → {var!r}")

asyncio.run(main())
```

---

**End of runbook.**
