# AUTH AMENDMENT — CR-2026-10-04-006 (Google Sheet registry mirror)

**Role:** 2 — PLANNING AGENT · **Amends:** `IMPLEMENTATION_PLAN.md` §3, §4, §7 · **Gate 3 still open**
**Trigger:** Owner supplied OAuth client credentials in `backend/.env`, not a service-account key.
**Date:** 2026-10-05

---

## 1. Why this amendment exists

`IMPLEMENTATION_PLAN.md` §3 rejected the integration playbook's OAuth flow in favour of a service
account, and §3 closed with: *"If the owner prefers it, this plan is void and the CR must be
re-planned with `backend/server.py` back in scope."*

The owner chose **option (a): OAuth desktop client**, explicitly *without* adding FastAPI routes.
So the plan is **not void** — but §3 and §4 are superseded. §2's scope lock is unchanged:
`backend/server.py` is **not** touched, no Mongo token collection exists, no new route is added.

## 2. Auth pattern as built (supersedes §3, §4)

| | Plan §3/§4 (service account) | **As agreed and proven** |
|---|---|---|
| Credential | SA JSON key file | OAuth **Desktop** client id + secret |
| Env keys | `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_SHEET_ID` |
| Sheet access granted by | sharing with `…iam.gserviceaccount.com` | the consenting Google account's own access |
| Interactive step | never | **once**, already completed |
| Stored artefact | none | refresh token at `/app/secrets/sheets_token.json`, mode `600` |
| New FastAPI routes | none | **none** — unchanged |

**Loopback, not copy-paste.** Google fully deprecated the out-of-band (`urn:ietf:wg:oauth:2.0:oob`)
flow on **2023-01-31** for all client types, desktop included. The replacement is the loopback
redirect. The pod has no browser and the owner's browser cannot reach the pod's `localhost`, so the
flow used is: print the consent URL → owner approves → the redirect to `http://localhost:8080`
fails to load → owner pastes the failed address back → the script extracts `code` from the query
string. This is Google's documented headless procedure.

**No new dependency.** `google-auth-oauthlib` is *not* installed and was *not* added.
The token exchange and refresh are plain `requests` POSTs to `https://oauth2.googleapis.com/token`.
§2's "`requirements.txt` — no new deps" holds.

## 3. Phase P3 — RESULT: PASS

Executed `2026-10-05` via `memory/tools/probe_sheets_oauth.py`.

| Check | Result |
|---|---|
| Token exchange | **OK** |
| Granted scope | `https://www.googleapis.com/auth/spreadsheets` — required scope present (subset check per playbook, not equality) |
| Refresh token issued and stored | **OK** — `/app/secrets/sheets_token.json`, mode `600` |
| **Non-interactive refresh** (`verify`) | **OK** — proves every later run needs no browser |
| Spreadsheet read | **OK** — title `REGISTRY_EXPORT_2026_09_27` |
| Secret committed to git? | **No** — `.gitignore:35` `*token.json*` matches, confirmed via `git check-ignore` |
| Write probe | **NOT RUN** — owner instruction: *"do not touch any sheet"* |

**V21 (fails fast on missing env): PASS** — incidentally proven. Mid-session `GOOGLE_SHEET_ID`
vanished from `.env` and the script aborted with `KeyError: 'GOOGLE_SHEET_ID'`. No silent default.

### Residual risk — write scope is unproven

Read access does not prove write access. A read-only collaborator on the spreadsheet reads 200 and
writes 403. Phase P5 (`push`) is therefore **not de-risked**, which was the whole purpose of
putting P3 third. A one-cell write to a throwaway spreadsheet is still required before P4/P5 is
worth building. Recorded as open.

### Second-order risk — token longevity

The OAuth client's consent screen is presumably in **Testing** publishing status. Google expires
refresh tokens issued by a Testing-status client after **7 days**, which would mean repeating the
browser consent weekly — a standing manual chore the service-account pattern did not have. Needs
an owner check of the Cloud Console publishing status; if Testing, either publish the app or
reconsider the service account for this tool.

## 4. Findings on the target spreadsheet — NEW, needs owner ruling

`GOOGLE_SHEET_ID` was supplied as `18s3u2iJPFRFzZFxxkHD7EiWvVtpKMvTpYDLsqcBzkdY/edit?gid=967495728`
— the whole URL tail rather than the bare ID. Every API call would have 404'd. Corrected to the
bare ID by targeted `search_replace`, the single `.env` edit §2 permits.

The spreadsheet **is not empty**. It is titled **`REGISTRY_EXPORT_2026_09_27`** and already carries
nine tabs:

```
All Items · Summary · Intake · Planning · Implementation · Closed · QA'd · Smoke Test · Blockers
```

This appears to be a pre-existing manual export dated 2026-09-27. Two consequences:

**4.1 Tab names do not match plan §6.** Plan §6 routes to: `Intake`, `Planning`, `Implemented`,
`QA`, `Smoke`, `Closed`, `Blockers`, `Summary`. The live sheet uses `Implementation`, `QA'd`,
`Smoke Test`, and adds `All Items`. Three renames and one extra tab. Unresolved: adopt the live
names, or rename the live tabs to the plan's. `QA'd` also contains an apostrophe, which must be
escaped in every A1 range reference (`'QA''d'!A1`) — a real source of bugs.

**4.2 A one-way generator will overwrite whatever is in there now.** D-G1 fixes the Sheet as an
output only. If the 2026-09-27 export holds hand-entered content that exists nowhere else, the
first `sync` destroys it. **Nothing has been read from the tabs' contents** — only tab names.

## 5. Still outstanding before Role 3 can open

Unchanged from §13 of the plan except item 1, now partly satisfied:

1. ~~Credentials~~ — **DONE for read.** Write access still unproven (§3 above).
2. **Auth pattern** — owner chose OAuth desktop; recorded here. Needs the publishing-status check.
3. **Money-path ratification** — 7 items, still unratified. Owner deferred: *"first check connection"*.
4. **ROLE 13 ruling** — still open.
5. **`Role 3 approved for CR-2026-10-04-006`** — **NOT GIVEN.** Owner replied *"Skipped, assuming
   defaults for now"*. No CR deliverable has been written.
6. **NEW: tab-name reconciliation** (§4.1) and **NEW: ruling on overwriting the existing export** (§4.2).

## 6. What exists on disk after this probe

| Path | Status |
|---|---|
| `memory/tools/probe_sheets_oauth.py` | **new** — Gate-0 probe, not a CR deliverable |
| `/app/secrets/sheets_token.json` | **new** — mode 600, git-ignored |
| `backend/.env` | `GOOGLE_SHEET_ID` corrected to bare ID, by targeted edit |
| `memory/change_requests/index.yml` | **does not exist** |
| `memory/tools/registry_sync.py` | **does not exist** |
| `memory/change_requests/CHANGELOG.md` | **does not exist** |
| `memory/change_requests/README.md` | **untouched** |
| `backend/server.py`, `frontend/**`, `requirements.txt` | **untouched** |

Rollback: `rm memory/tools/probe_sheets_oauth.py /app/secrets/sheets_token.json`, revoke the
consent at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), and remove
the three OAuth keys from `.env`. No application code, no data change.

---

## 7. UPDATE 2026-10-05 (b) — target sheet replaced · P3 now FULLY complete

**Owner redirected the target.** `REGISTRY_EXPORT_2026_09_27` is **not** the mirror. The owner
created a new spreadsheet in Drive folder `1fWp4BahzJ0YqENdhvVG6iyLfyKMyWL_J` and swapped
`GOOGLE_SHEET_ID` in `.env` to `1-dS9OsFt4FQ68ufgP924jgfP7L8RNEKlVYCe39scqx0`. Verified reachable;
it arrived as `Untitled spreadsheet` with a single `Sheet1`. Renamed to **`Scan and Order issue
tracker`** per instruction.

**The Drive-scope blocker is void.** §4 of the ask assumed Planning would have to *create* the file
inside a named folder, which is a Drive API operation needing `drive` or `drive.file`; a probe
confirmed the held token returns `403 ACCESS_TOKEN_SCOPE_INSUFFICIENT` against Drive. Because the
owner created the file themselves, no Drive call is ever needed: `updateSpreadsheetProperties` and
`addSheet` are both **Sheets** operations, satisfied by the `…/auth/spreadsheets` scope already
granted. **No second consent, no scope widening, no `drive` access.** Option (c) of the scope
question is what effectively happened.

### Phase P3 — now complete on both halves

| Check | Result |
|---|---|
| Read (`spreadsheets.get`) | **OK** |
| **Write (`batchUpdate` → `updateSpreadsheetProperties.title`)** | **OK** — `'Scan and Order issue tracker'`, confirmed by re-read |
| Consenting account is Editor, not read-only | **Proven** — a viewer would have 403'd on the rename |
| Non-interactive refresh | **OK** |

P3's pass condition in plan §9 — *"returns 200; proves creds, sharing and scope before any view code
is built"* — is **met in full**. Phase P5 (`push`) is now genuinely de-risked, which is what P3 was
sequenced third to achieve.

### Blockers resolved by the new target

| Was | Now |
|---|---|
| §4.2 one-way sync would destroy the 2026-09-27 export | **VOID** — fresh, empty sheet; nothing of the owner's can be overwritten |
| §4.1 tab names contradict plan §6 (`Implementation`/`QA'd`/`Smoke Test`) | **VOID** — tabs will be created to plan §6's own names |
| `QA'd` apostrophe needing A1-range escaping | **VOID** — tab will be named `QA` |
| Write scope unproven | **RESOLVED** above |
| Drive scope / second consent required | **VOID** — never needed |

### Still outstanding

1. **`Role 3 approved for CR-2026-10-04-006` — NOT GIVEN.** No CR deliverable written.
2. **OAuth consent publishing status** — unanswered. If *Testing*, Google expires the refresh token
   every 7 days and the browser consent must be repeated weekly, forever. This is the one unresolved
   risk that could make the tool impractical regardless of code quality.
3. **Money-path ratification** — 7 items, deferred by the owner.
4. **ROLE 13 ruling** — open.
5. `Sheet1` is still present and will need deleting once the 8 named tabs exist (a spreadsheet
   cannot have zero sheets, so it must be removed *after*, not before).

### Disk state (unchanged except the probe)

`memory/tools/probe_sheets_oauth.py` (probe, + `settitle` command) · `/app/secrets/sheets_token.json`
(mode 600, git-ignored) · `backend/.env` (`GOOGLE_SHEET_ID` owner-set).
`index.yml`, `registry_sync.py`, `CHANGELOG.md` **do not exist**. `README.md`, `backend/server.py`,
`frontend/**`, `requirements.txt` **untouched**.
