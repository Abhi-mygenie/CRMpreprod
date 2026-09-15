# CR-073 — Implementation Plan

**CR ID**: CR-073  
**Role**: Planning Agent  
**Date**: 2026-08-04  
**Stage**: Implementation Plan  
**Prerequisite**: Impact Analysis ✅ (`planning/CR_073_IMPACT_ANALYSIS.md`)  
**Risk**: MEDIUM — `routers/whatsapp.py`, additive only  
**Estimated effort**: ~30 min, 1 file, 1 edit

---

## Implementation Order

Single edit — no dependencies.

```
Edit A: routers/whatsapp.py
  → Inside sync_authkey_templates(), after existing back-fill loop
  → Add import block + update return value
```

---

## EDIT A — `routers/whatsapp.py`: Add import block inside `sync_authkey_templates()`

**File**: `routers/whatsapp.py`  
**Location**: After line 1126 (`wid_updates += 1`), before line 1127 (`except Exception as wid_err:`)  
**Risk**: MEDIUM (additive — no existing lines modified)

### Before (lines 1126–1134)

```python
                    wid_updates += 1
        except Exception as wid_err:
            logging.warning(f"CR-DIRECT-SEND: could not back-fill authkey_wid after sync: {wid_err}")

        return {
            "message": "Templates synced to AuthKey successfully",
            "response": response_data,
            "wid_updates": wid_updates,
        }
```

### After

```python
                    wid_updates += 1

            # CR-073: Import externally-created AuthKey templates into custom_templates.
            # Only runs when tenant has Meta WABA configured (Q2=b).
            imported_count = 0
            user_meta = await db.users.find_one(
                {"id": user["id"]},
                {"_id": 0, "meta_waba_id": 1, "meta_access_token": 1}
            )
            meta_waba_id     = (user_meta or {}).get("meta_waba_id")
            meta_access_token = (user_meta or {}).get("meta_access_token")

            if meta_waba_id and meta_access_token:
                # Build sets of already-known wids and names to avoid duplicates
                local_wids  = {str(c.get("authkey_wid", "")) for c in local_templates if c.get("authkey_wid")}
                local_names = {(ct.get("template_name") or "").strip().lower() for ct in local_templates}
                now = datetime.now(timezone.utc).isoformat()
                meta_api_url = os.environ.get("META_GRAPH_API_URL", "https://graph.facebook.com/v18.0")

                for at in authkey_templates:
                    wid_str  = str(at.get("wid", ""))
                    tpl_name = (at.get("temp_name") or "").strip()

                    # Skip if already in custom_templates (idempotent guard)
                    if wid_str in local_wids or tpl_name.lower() in local_names:
                        continue

                    try:
                        # Fetch button data from Meta
                        buttons = []
                        async with httpx.AsyncClient(timeout=10) as meta_client:
                            meta_resp = await meta_client.get(
                                f"{meta_api_url}/{meta_waba_id}/message_templates",
                                params={
                                    "name": tpl_name,
                                    "fields": "name,status,components",
                                    "access_token": meta_access_token,
                                }
                            )
                        meta_tpls = meta_resp.json().get("data", [])

                        for meta_tpl in meta_tpls:
                            for comp in meta_tpl.get("components", []):
                                if comp.get("type") != "BUTTONS":
                                    continue
                                for btn in comp.get("buttons", []):
                                    btn_type = btn.get("type", "")
                                    btn_obj  = {"type": btn_type, "text": btn.get("text", "")}
                                    if btn_type == "URL":
                                        url = btn.get("url", "")
                                        btn_obj["url"] = url
                                        if "{{1}}" in url:
                                            btn_obj["url_type"] = "dynamic"
                                            url_base = url.split("{{")[0]
                                            btn_obj["url_base"] = url_base
                                            # Q1=a: use Meta's example value; strip base if full URL returned
                                            example_arr = btn.get("example") or []
                                            raw_ex = example_arr[0] if example_arr else ""
                                            if raw_ex.startswith(url_base):
                                                btn_obj["url_example"] = raw_ex[len(url_base):]
                                            else:
                                                btn_obj["url_example"] = raw_ex
                                        else:
                                            btn_obj["url_type"] = "static"
                                    elif btn_type == "PHONE_NUMBER":
                                        btn_obj["phone_number"] = btn.get("phone_number", "")
                                    buttons.append(btn_obj)

                        # Extract body variables
                        body_text = at.get("temp_body", "")
                        variables = sorted(
                            set(re.findall(r'\{\{\d+\}\}', body_text)),
                            key=lambda v: int(v.strip("{}") or 0)
                        )

                        # Insert new custom_templates document
                        doc = {
                            "id": str(uuid.uuid4()),
                            "user_id": user["id"],
                            "template_name": tpl_name,
                            "category": (at.get("temp_category") or "utility").lower(),
                            "language": at.get("temp_language") or "en",
                            "header_type": "none",
                            "header_content": "",
                            "body": body_text,
                            "footer": "",
                            "buttons": buttons,
                            "variables": variables,
                            "body_examples": [],
                            "header_examples": [],
                            "media_url": "",
                            "header_handle": None,
                            "send_media_url": None,
                            "send_media_filename": None,
                            "header_media_mime": None,
                            "needs_media_reupload": False,
                            "meta_template_id": None,
                            "authkey_wid": wid_str,
                            "status": "approved" if at.get("temp_status") == 1 else "pending",
                            "created_at": now,
                            "updated_at": now,
                        }
                        await db.custom_templates.insert_one(doc)
                        imported_count += 1
                        logging.info(f"CR-073: imported '{tpl_name}' wid={wid_str} user={user['id']}")

                    except Exception as import_err:
                        logging.warning(f"CR-073: skipped '{tpl_name}' wid={wid_str}: {import_err}")
                        continue

        except Exception as wid_err:
            logging.warning(f"CR-DIRECT-SEND: could not back-fill authkey_wid after sync: {wid_err}")

        return {
            "message": "Templates synced to AuthKey successfully",
            "response": response_data,
            "wid_updates": wid_updates,
            "imported_count": imported_count if 'imported_count' in dir() else 0,
        }
```

**Lines added**: ~75 lines (import block + variable init + return update)  
**Lines modified**: 1 (return dict adds `imported_count`)  
**Existing lines changed**: 0

---

## Self-test

```bash
API_URL=https://crm-stack-preview.preview.emergentagent.com

TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@kunafamahal.com","password":"Qplazm@10"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -X POST "$API_URL/api/whatsapp/authkey/sync-templates" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method": "migrate", "brand_number": "BRAND_NUMBER"}'
```

Expected: `{"wid_updates": N, "imported_count": 9}`

Then verify:
```bash
curl -s "$API_URL/api/whatsapp/authkey-templates" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
ts = json.load(sys.stdin)['templates']
bt = [t for t in ts if t.get('temp_name') == 'button1']
print('button1 buttons:', bt[0].get('buttons') if bt else 'NOT FOUND')
"
```

Expected: `button1 buttons: [{'type': 'URL', 'text': 'BILL', 'url_type': 'dynamic', ...}]`

---

## Verification Matrix

| V# | Test | Expected |
|---|---|---|
| V1 | Sync call returns | `imported_count = 9` |
| V2 | `button1` in `custom_templates` | Entry with `authkey_wid=43586`, `buttons=[{BILL}]` |
| V3 | `kmfinalbill` in `custom_templates` | Entry with `authkey_wid=43550`, `buttons=[{BILL},{REVIEW}]` |
| V4 | `button1` `url_example` | `"sampleurl"` (from Meta example, Q1=a) |
| V5 | `kmfinalbill` `url_example` | `"123456"` (stripped from Meta full URL example) |
| V6 | `GET /authkey-templates` → button1 | `buttons` array present in response |
| V7 | CRM Templates page → button1 | BILL button chip visible |
| V8 | Second sync call | `imported_count = 0` (idempotent) |
| V9 | Existing `testbill2` unchanged | `buttons` unchanged after sync |
| V10 | Tenant without WABA | `imported_count = 0` (skipped) |

---

## Regression Checklist

| # | Check |
|---|---|
| R1 | Existing back-fill loop (`wid_updates`) — unchanged |
| R2 | CR-037 rejected-status guard — unchanged |
| R3 | Single template failure → logged + skipped, others continue |
| R4 | AuthKey fetch failure → caught by outer `except wid_err` |

---

```
Planning complete: CR-073
Stage: Implementation Plan
Code reality: FULL (exact insertion after line 1126, before except clause)
Risk: MEDIUM — additive only
Files WILL change: routers/whatsapp.py (1 edit, +~75 lines)
Files WILL NOT touch: all other files
Owner decisions: ALL LOCKED
Docs: planning/CR_073_IMPLEMENTATION_PLAN.md
Next: Owner says "go" → Implementation Agent executes Edit A
```
