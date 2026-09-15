# CR-026 — Impact Analysis + Implementation Plan: Campaign "View Messages" Deep-link

> **Type**: UX Feature (navigation enhancement)
> **Date**: 2026-07-01
> **Risk**: VERY LOW
> **Files changed**: 2 (frontend only)
> **Backend changes**: ZERO

---

## What It Does

Adds a **"View Messages"** action on campaign cards in `CampaignsPage.jsx`.
Clicking it navigates to `/message-status?campaign_id=<campaign_id>`, which pre-fills
the campaign filter on the Message Status page — showing only messages sent by that campaign.

---

## Current State

| Layer | Current behaviour |
|---|---|
| `CampaignsPage.jsx` — campaign card dropdown | Has: View, Clone, Pause, Resume, Re-run, Delete. **No "View Messages"** |
| `CampaignsPage.jsx` — action button | Shows "Edit" (draft/scheduled) or "View" (others). No messages link |
| `MessageStatusPage.jsx` — filters state | `campaign_id: "all"` — works, but **never seeded from URL params** |
| `MessageStatusPage.jsx` — URL handling | **No `useSearchParams` or `useLocation`** — URL query strings ignored |
| Backend `/api/whatsapp/message-logs` | Already supports `?campaign_id=<id>` query param ✅ |
| Backend `/api/whatsapp/message-filters` | Already returns `campaigns` array with `{id, name}` pairs ✅ |

---

## Impact Analysis

### Backend — 0 files
Zero backend changes needed. The `campaign_id` filter already exists in:
- `GET /api/whatsapp/message-logs?campaign_id=<id>` — line 135 in MessageStatusPage already builds this
- `GET /api/whatsapp/message-filters` — already returns campaign list

---

### Frontend — 2 files

#### 1. `pages/CampaignsPage.jsx`

**Change 1 — Import `MessageSquare` from lucide-react** (already imported in other files, just add to this file's import line)

**Change 2 — Add "View Messages" in DropdownMenu** (line 322 area):
- Show only for campaigns that have sent messages (`total_sent > 0` OR status is `completed` / `active`)
- Navigate to `/message-status?campaign_id=${campaign.id}`

```jsx
// Add after the existing "View" DropdownMenuItem:
{(ds === "completed" || ds === "active" || (campaign.total_sent > 0)) && (
    <DropdownMenuItem
        onClick={() => navigate(`/message-status?campaign_id=${campaign.id}`)}
        data-testid="campaign-view-messages"
    >
        <MessageSquare className="w-4 h-4 mr-2" /> View Messages
    </DropdownMenuItem>
)}
```

**Change 3 — Add inline "View Messages" button next to existing "Edit"/"View" button** (line 305 area):
- Show inline button for completed campaigns alongside existing action button
- Small, secondary styled, links to `/message-status?campaign_id=<id>`

```jsx
{(ds === "completed" || (campaign.total_sent > 0)) && (
    <Button
        variant="outline"
        size="sm"
        className="text-xs rounded-full text-blue-600 border-blue-200 hover:bg-blue-50"
        onClick={() => navigate(`/message-status?campaign_id=${campaign.id}`)}
        data-testid="campaign-view-messages-btn"
    >
        <MessageSquare className="w-3 h-3 mr-1" /> Messages
    </Button>
)}
```

**Risk**: VERY LOW — purely additive. No existing logic removed or changed.

---

#### 2. `pages/MessageStatusPage.jsx`

**Change 1 — Add `useSearchParams` import** from `react-router-dom` (line 2)

**Change 2 — Read `campaign_id` from URL on mount** (inside `MessageStatusContent`):
```jsx
const [searchParams] = useSearchParams();

useEffect(() => {
    const campaignId = searchParams.get("campaign_id");
    if (campaignId) {
        setFilters(prev => ({ ...prev, campaign_id: campaignId }));
    }
}, []); // run once on mount only
```

**Change 3 — Show a "Filtered by campaign" banner** when `campaign_id` is pre-set from URL:
```jsx
{filters.campaign_id !== "all" && searchParams.get("campaign_id") && (
    <div className="flex items-center gap-2 mb-3 p-2 bg-blue-50 rounded-lg text-sm text-blue-700">
        <Filter className="w-3.5 h-3.5" />
        Filtered by campaign
        <button onClick={() => setFilters(prev => ({...prev, campaign_id: "all"}))} className="ml-auto text-xs underline">Clear</button>
    </div>
)}
```

**Risk**: VERY LOW — `useSearchParams` is read-only. Existing filter state, API calls, pagination all unchanged.

---

## Files Summary

| File | Type of change | Lines affected (est.) |
|---|---|---|
| `frontend/pages/CampaignsPage.jsx` | Add import + 2 UI additions (dropdown item + inline btn) | +18 lines |
| `frontend/pages/MessageStatusPage.jsx` | Add useSearchParams + 1 useEffect + banner | +20 lines |

**Total: ~38 lines across 2 files. Zero backend changes. Zero hotspot files.**

---

## User Journey (after fix)

```
1. Owner opens Campaigns page
2. Sees a completed campaign — e.g. "Diwali Offer"
3. Clicks "Messages" button (inline) OR opens dropdown → "View Messages"
4. Lands on /message-status?campaign_id=abc123
5. Message Status page auto-filters to show only messages from "Diwali Offer"
6. Blue banner: "Filtered by campaign [Clear]"
7. Owner can drill into individual message delivery statuses
```

---

## Edge Cases

| Case | Handling |
|---|---|
| Campaign has 0 messages sent (draft/scheduled) | "View Messages" button/item NOT shown (gated by `total_sent > 0`) |
| Invalid `campaign_id` in URL | API returns empty list — no crash, shows empty state |
| User navigates to `/message-status` directly (no query param) | No effect — filters stay at defaults |
| `campaigns` list in filterOptions doesn't include the campaign_id | Campaign filter Select shows raw ID — cosmetic only, filter still works |

---

## Verification Matrix

| # | Check | How to verify |
|---|---|---|
| V1 | "View Messages" appears in dropdown for completed campaign | CampaignsPage → completed campaign → dropdown ✅ |
| V2 | "Messages" inline button appears for completed campaign | CampaignsPage → completed campaign row ✅ |
| V3 | Draft/scheduled campaigns have no "View Messages" button | Check draft row — button absent ✅ |
| V4 | Click navigates to /message-status?campaign_id=xxx | Check URL after click ✅ |
| V5 | Message Status page auto-filters on load | campaign_id filter = campaign's id ✅ |
| V6 | Blue "Filtered by campaign" banner shows | Banner visible with Clear link ✅ |
| V7 | Clear button resets filter to "all" | Click Clear → banner gone, all messages shown ✅ |
| V8 | Direct /message-status URL unaffected | No query param → no pre-filter → normal ✅ |

---

## Planning Output

```
Planning complete: CR-026
Stage: Impact Analysis + Implementation Plan
Risk: VERY LOW
Files WILL change: 2 frontend files only
Files WILL NOT touch: backend, hotspot files, all other pages
DB migration: NONE
Owner decisions needed: NONE
Estimated effort: ~3 hrs
Next: IMPLEMENTATION on owner approval
```

---

*End of CR-026 Impact Analysis + Plan*
