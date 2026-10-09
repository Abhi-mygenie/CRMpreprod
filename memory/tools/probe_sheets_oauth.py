#!/usr/bin/env python3
"""Gate-0 connectivity probe for CR-2026-10-04-006 — NOT a CR deliverable.

Proves the OAuth desktop client, the spreadsheet sharing and the spreadsheets
scope all work, before any of registry_sync.py / index.yml / CHANGELOG.md is
written. Deletable with no trace: see IMPLEMENTATION_PLAN.md §11.

Google deprecated the out-of-band copy-paste flow on 2023-01-31, so this uses
the loopback redirect. The pod has no browser, so the loopback never actually
serves: the owner opens the URL, lets the redirect fail, and pastes the failed
address back.

  python probe_sheets_oauth.py authurl
  python probe_sheets_oauth.py exchange '<the http://localhost:8080/?code=... URL>'
  python probe_sheets_oauth.py verify
"""
import json
import os
import pathlib
import stat
import sys
import urllib.parse
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

ENV_PATH = "/app/backend/.env"
TOKEN_PATH = "/app/secrets/sheets_token.json"
SCOPE = "https://www.googleapis.com/auth/spreadsheets"
REDIRECT_URI = "http://localhost:8080"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"
PROBE_TAB = "_probe"


def cfg():
    load_dotenv(ENV_PATH)
    client_id = os.environ["GOOGLE_OAUTH_CLIENT_ID"]
    client_secret = os.environ["GOOGLE_OAUTH_CLIENT_SECRET"]
    sheet_id = os.environ["GOOGLE_SHEET_ID"]
    if "/" in sheet_id or "?" in sheet_id:
        sys.exit(
            "GOOGLE_SHEET_ID looks like a URL fragment, not an ID.\n"
            "Expected just the part between /d/ and /edit, e.g.\n"
            "  GOOGLE_SHEET_ID=18s3u2iJPFRFzZFxxkHD7EiWvVtpKMvTpYDLsqcBzkdY"
        )
    return client_id, client_secret, sheet_id


def authurl():
    client_id, _, sheet_id = cfg()
    params = {
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    }
    print("Spreadsheet under test:", sheet_id)
    print("\nOpen this in your browser, approve, then copy the FAILED")
    print("localhost address out of the address bar and paste it back:\n")
    print(f"{AUTH_URL}?{urllib.parse.urlencode(params)}\n")


def _extract_code(arg):
    if arg.startswith("http"):
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(arg).query)
        if "error" in qs:
            sys.exit(f"Google returned an error: {qs['error'][0]}")
        if "code" not in qs:
            sys.exit("No 'code' parameter in that URL.")
        return qs["code"][0]
    return arg.strip()


def _save(refresh_token):
    pathlib.Path("/app/secrets").mkdir(mode=0o700, exist_ok=True)
    with open(TOKEN_PATH, "w") as fh:
        json.dump(
            {
                "refresh_token": refresh_token,
                "scope": SCOPE,
                "obtained": datetime.now(timezone.utc).isoformat(),
            },
            fh,
        )
    os.chmod(TOKEN_PATH, stat.S_IRUSR | stat.S_IWUSR)
    print(f"Refresh token stored at {TOKEN_PATH} (mode 600).")


def exchange(arg):
    client_id, client_secret, sheet_id = cfg()
    resp = requests.post(
        TOKEN_URL,
        data={
            "code": _extract_code(arg),
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    if resp.status_code != 200:
        sys.exit(f"Token exchange failed [{resp.status_code}]: {resp.text}")
    payload = resp.json()
    granted = payload.get("scope", "")
    if SCOPE not in granted.split():
        sys.exit(f"Required scope not granted. Google returned: {granted}")
    print(f"Token exchange OK. Granted scopes: {granted}")
    if "refresh_token" not in payload:
        sys.exit("No refresh_token returned — re-run authurl (prompt=consent is required).")
    _save(payload["refresh_token"])
    _probe(payload["access_token"], sheet_id)


def _access_token():
    client_id, client_secret, sheet_id = cfg()
    if not os.path.exists(TOKEN_PATH):
        sys.exit(f"No stored token at {TOKEN_PATH}. Run authurl + exchange first.")
    with open(TOKEN_PATH) as fh:
        refresh_token = json.load(fh)["refresh_token"]
    resp = requests.post(
        TOKEN_URL,
        data={
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    if resp.status_code != 200:
        sys.exit(f"Refresh failed [{resp.status_code}]: {resp.text}")
    return resp.json()["access_token"], sheet_id


def _probe(access_token, sheet_id, allow_write=False):
    headers = {"Authorization": f"Bearer {access_token}"}

    resp = requests.get(
        f"{SHEETS_API}/{sheet_id}",
        headers=headers,
        params={"fields": "properties.title,sheets.properties.title"},
        timeout=30,
    )
    if resp.status_code == 403:
        sys.exit(
            f"403 on read. Either the Sheets API is not enabled on the project, "
            f"or this Google account cannot open the spreadsheet.\n{resp.text}"
        )
    if resp.status_code == 404:
        sys.exit(f"404 — no spreadsheet with id {sheet_id}.\n{resp.text}")
    if resp.status_code != 200:
        sys.exit(f"Read failed [{resp.status_code}]: {resp.text}")
    meta = resp.json()
    tabs = [s["properties"]["title"] for s in meta.get("sheets", [])]
    print(f"READ OK  — title: {meta['properties']['title']!r}")
    print(f"           tabs : {tabs}")

    if not allow_write:
        print("\nRead-only probe (owner instruction: do not touch any sheet).")
        print("Creds, sharing and read scope verified. Write capability NOT exercised.")
        return

    if PROBE_TAB not in tabs:
        add = requests.post(
            f"{SHEETS_API}/{sheet_id}:batchUpdate",
            headers=headers,
            json={"requests": [{"addSheet": {"properties": {"title": PROBE_TAB}}}]},
            timeout=30,
        )
        if add.status_code != 200:
            sys.exit(f"Could not create '{PROBE_TAB}' tab [{add.status_code}]: {add.text}")
        print(f"           created scratch tab '{PROBE_TAB}'")

    stamp = datetime.now(timezone.utc).isoformat()
    put = requests.put(
        f"{SHEETS_API}/{sheet_id}/values/{PROBE_TAB}!A1",
        headers=headers,
        params={"valueInputOption": "RAW"},
        json={"values": [[f"CR-2026-10-04-006 auth probe {stamp}"]]},
        timeout=30,
    )
    if put.status_code != 200:
        sys.exit(f"WRITE failed [{put.status_code}]: {put.text}")
    print(f"WRITE OK — {PROBE_TAB}!A1 updated at {stamp}")
    print("\nPhase P3 pass condition met: creds, sharing and scope all verified.")


def verify():
    token, sheet_id = _access_token()
    print("Non-interactive refresh OK.")
    _probe(token, sheet_id)


def settitle(title):
    """Rename the target spreadsheet. Doubles as the P3 write-scope proof."""
    token, sheet_id = _access_token()
    resp = requests.post(
        f"{SHEETS_API}/{sheet_id}:batchUpdate",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "requests": [
                {
                    "updateSpreadsheetProperties": {
                        "properties": {"title": title},
                        "fields": "title",
                    }
                }
            ]
        },
        timeout=30,
    )
    if resp.status_code == 403:
        sys.exit(
            "403 on write. The consenting account has READ-ONLY access to this "
            f"spreadsheet. Grant it Editor.\n{resp.text}"
        )
    if resp.status_code != 200:
        sys.exit(f"Rename failed [{resp.status_code}]: {resp.text}")
    print(f"WRITE OK — spreadsheet title set to {title!r}")
    print("Phase P3 fully complete: read AND write scope both proven.")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "authurl":
        authurl()
    elif cmd == "exchange":
        if len(sys.argv) < 3:
            sys.exit("Usage: probe_sheets_oauth.py exchange '<redirected URL or code>'")
        exchange(sys.argv[2])
    elif cmd == "verify":
        verify()
    elif cmd == "settitle":
        if len(sys.argv) < 3:
            sys.exit("Usage: probe_sheets_oauth.py settitle '<title>'")
        settitle(sys.argv[2])
    else:
        sys.exit(__doc__)
