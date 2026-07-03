# CR-043 — Implementation Plan: Tag Filter (Part A) + Popover Rework (Part B)

> **CR**: CR-043 (both parts, bundled — same file `CustomersPage.jsx`)
> **Priority**: P2
> **Type**: Feature enhancement (extension of CR-034 tag system)
> **Owner approval status**: ✅ Owner-locked (2026-07-03) — Option C hybrid + Option C multi-select
> **Effort**: ~4-5 hr (Part A ~2.5 hr + Part B ~1.5 hr + verification ~1 hr)
> **Files touched**: 2 (`routers/customers.py`, `frontend/src/pages/CustomersPage.jsx`)
> **Migration required**: No
> **Schema changes**: No
> **New dependencies**: No
> **Impact analysis**: `crm_roi_sprint/planning/BATCH_2026_07_03_IMPACT.md` §3
> **Decisions**: `DECISIONS_LOG.md § 2026-07-03 [CR-043-A], [CR-043-B]`
> **Split-off**: Bulk-apply popover → parked as CR-045

---

## 1. Objective

### Part A — Tag Filter (Option C hybrid)
Add a compact tag chip strip above the existing CustomersPage filter block. Top-6 tags by customer count shown as clickable chips + `More ▾` to expand the full tenant catalog. Include ANY/ALL toggle mirroring AudiencesPage (CR-034).

### Part B — Popover Rework (Option C multi-select)
Rework the existing inline "+tag" popover (`CustomersPage.jsx:1469-1504`) to a 280px multi-select popover with autosave per checkbox toggle, count badges, inline "Create new tag", and a single "Done" dismiss.

---

## 2. Scope

### 2.1 In-scope
- Backend: extend `GET /api/customers` with `tags` (comma-sep) + `tags_mode` (`any`|`all`) query params.
- Backend: extend `GET /api/customers/tags` with optional `with_counts=true` query param → return `[{tag, count}]` sorted by count desc.
- Frontend Part A: new tag chip strip component above filter block.
- Frontend Part B: replace existing popover contents with multi-select layout.

### 2.2 Out-of-scope
- Tag filter on MessageStatusPage / AudiencesPage / any other page (future CRs).
- Bulk-apply popover (belongs to CR-045).
- Any change to `POST /customers/:id/tags` and `DELETE /customers/:id/tags/:tag` endpoints (they work; keep untouched).
- Any change to `core/helpers.py::build_customer_query` (proven code; do NOT refactor).
- Tag catalog admin panel (out of scope; different feature).
- Tag color picker (owner didn't request).

### 2.3 Non-goals
- Row-selection column on CustomersPage (CR-045 territory).
- Real-time counts (counts refresh only when the popover / chip strip is opened; no websocket / polling).

---

## 3. Design

### 3.1 Backend edit 1 — extend `GET /customers` with `tags` + `tags_mode`

**File**: `backend/routers/customers.py`
**Location**: `list_customers` function signature (~line 895) and query construction inside the function (~line 940-970).

**Signature change**:
```python
@router.get("")
async def list_customers(
    # ... existing 20+ params ...
    tags: Optional[str] = None,        # CR-043-A: comma-separated tag list
    tags_mode: Optional[str] = "any",  # CR-043-A: 'any' or 'all'
    user: dict = Depends(get_current_user),
):
```

**Query builder addition** (inside the function, after existing filter blocks):
```python
# CR-043-A: filter by customer tags (any/all)
if tags:
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    if tag_list:
        if tags_mode == "all":
            query["tags"] = {"$all": tag_list}
        else:
            query["tags"] = {"$in": tag_list}
```

**Placement**: place inside the existing `list_customers` filter chain, immediately after the last existing filter block (typically after WhatsApp opt-in / lead source / VIP / blacklisted checks). Do NOT wrap inside `$and`; a single `query["tags"]` assignment is idiomatic here since Mongo merges root-level keys.

**Guard**: if `tags` is empty or all-whitespace after split, do NOT add the filter (fall-through means "no tag filter").

**Edge case — `tags_mode` other than `all`/`any`**: silently default to `any` (per Postel's law + no validation elsewhere in the endpoint).

### 3.2 Backend edit 2 — `GET /customers/tags` with counts

**File**: `backend/routers/customers.py`
**Location**: existing `/customers/tags` endpoint (~line 1159-1164).

**Signature change**:
```python
@router.get("/tags")
async def get_customer_tags(
    with_counts: bool = False,      # CR-043-A: return usage counts
    user: dict = Depends(get_current_user),
):
    tenant_id = user["id"]
    if not with_counts:
        # Existing behavior — return the available_tags catalog untouched
        user_doc = await db.users.find_one({"id": tenant_id}, {"available_tags": 1})
        return {"tags": user_doc.get("available_tags", []) if user_doc else []}

    # CR-043-A: aggregate customer counts per tag
    pipeline = [
        {"$match": {"user_id": tenant_id, "tags": {"$exists": True, "$ne": []}}},
        {"$unwind": "$tags"},
        {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    counts = await db.customers.aggregate(pipeline).to_list(length=1000)
    counts_map = {c["_id"]: c["count"] for c in counts}

    # Ensure tags in the catalog but with zero customers still appear (count=0)
    user_doc = await db.users.find_one({"id": tenant_id}, {"available_tags": 1})
    all_tags = user_doc.get("available_tags", []) if user_doc else []
    merged = [{"tag": t, "count": counts_map.get(t, 0)} for t in all_tags]
    # Include tags that exist on customers but not in catalog (shouldn't happen; safety net)
    for tag, count in counts_map.items():
        if tag not in all_tags:
            merged.append({"tag": tag, "count": count})
    merged.sort(key=lambda x: x["count"], reverse=True)
    return {"tags": merged}
```

**Backward compat**: default `with_counts=False` returns the old shape (`{"tags": ["VIP", "Regular", ...]}`). New callers pass `with_counts=true` → new shape (`{"tags": [{"tag": "VIP", "count": 156}, ...]}`). AudiencesPage keeps working unchanged.

### 3.3 Frontend edit 1 — new Tag Chip Strip component (Part A)

**File**: `frontend/src/pages/CustomersPage.jsx`
**Location**: Inline component defined near the top of the module, above `CustomersContent` (~line 100).

**Component**:
```jsx
// CR-043-A: Tag chip strip — top-6 by count + More ▾ + active chips + ANY/ALL toggle
const TagChipStrip = ({
    availableTagsWithCounts,   // [{tag, count}] sorted desc
    activeTags,                // Set<string>
    tagsMode,                  // "any" | "all"
    onToggleTag,
    onSetTagsMode,
    onClearTags,
}) => {
    const [showAll, setShowAll] = useState(false);
    const topN = 6;
    const visible = showAll ? availableTagsWithCounts : availableTagsWithCounts.slice(0, topN);

    return (
        <div
            className="mb-4 rounded-lg border border-slate-200 bg-white p-3"
            data-testid="tag-chip-strip"
        >
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Filter by tag
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {visible.map(({ tag, count }) => {
                    const isActive = activeTags.has(tag);
                    return (
                        <button
                            key={tag}
                            data-testid={`tag-chip-${tag}`}
                            onClick={() => onToggleTag(tag)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                isActive
                                    ? "bg-[#F26B33] text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                        >
                            {isActive ? "✓ " : "+ "}
                            {tag}
                            <span className="ml-1 opacity-70">({count})</span>
                        </button>
                    );
                })}
                {availableTagsWithCounts.length > topN && (
                    <button
                        data-testid="tag-chip-more"
                        onClick={() => setShowAll((s) => !s)}
                        className="text-xs text-slate-600 underline"
                    >
                        {showAll ? "Less ▴" : "More ▾"}
                    </button>
                )}
            </div>

            {activeTags.size > 0 && (
                <>
                    <div className="my-3 h-px bg-slate-100" />
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500">Active:</span>
                        {[...activeTags].map((tag) => (
                            <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full bg-[#F26B33]/10 px-2 py-0.5 text-xs text-[#F26B33]"
                                data-testid={`active-tag-${tag}`}
                            >
                                {tag}
                                <button
                                    onClick={() => onToggleTag(tag)}
                                    className="hover:opacity-70"
                                    aria-label={`Remove ${tag}`}
                                >
                                    ✕
                                </button>
                            </span>
                        ))}
                        <div className="ml-auto flex items-center gap-3 text-xs">
                            <label className="flex items-center gap-1">
                                <input
                                    type="radio"
                                    name="tags-mode"
                                    checked={tagsMode === "any"}
                                    onChange={() => onSetTagsMode("any")}
                                    data-testid="tags-mode-any"
                                />
                                Any
                            </label>
                            <label className="flex items-center gap-1">
                                <input
                                    type="radio"
                                    name="tags-mode"
                                    checked={tagsMode === "all"}
                                    onChange={() => onSetTagsMode("all")}
                                    data-testid="tags-mode-all"
                                />
                                All
                            </label>
                            <button
                                onClick={onClearTags}
                                data-testid="clear-tags-btn"
                                className="text-slate-500 underline"
                            >
                                Clear tags
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
```

### 3.4 Frontend edit 2 — wire strip into CustomersContent (Part A)

**File**: `frontend/src/pages/CustomersPage.jsx`
**Location**: Inside `CustomersContent` component, above the existing filter block (~line 900).

**State additions** (~line 116, alongside existing filter state):
```jsx
const [activeTags, setActiveTags] = useState(new Set());     // CR-043-A
const [tagsMode, setTagsMode] = useState("any");             // CR-043-A
const [tagsWithCounts, setTagsWithCounts] = useState([]);    // CR-043-A
```

**Fetch counts on mount / when tag changes might affect catalog**:
```jsx
useEffect(() => {
    api.get("/customers/tags?with_counts=true")
        .then((r) => setTagsWithCounts(r.data.tags || []))
        .catch(() => setTagsWithCounts([]));
}, [refreshCounter]);  // refreshCounter bumped after any tag add/remove
```

**Handlers**:
```jsx
const handleToggleTag = (tag) => {
    setActiveTags((prev) => {
        const next = new Set(prev);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        return next;
    });
};
const handleSetTagsMode = (mode) => setTagsMode(mode);
const handleClearTags = () => setActiveTags(new Set());
```

**Include in `fetchCustomers` params** (~line 227+):
```jsx
if (activeTags.size > 0) {
    params.append("tags", [...activeTags].join(","));
    params.append("tags_mode", tagsMode);
}
```

**Render** (in JSX, above filter panel):
```jsx
<TagChipStrip
    availableTagsWithCounts={tagsWithCounts}
    activeTags={activeTags}
    tagsMode={tagsMode}
    onToggleTag={handleToggleTag}
    onSetTagsMode={handleSetTagsMode}
    onClearTags={handleClearTags}
/>
```

### 3.5 Frontend edit 3 — Rework popover (Part B)

**File**: `frontend/src/pages/CustomersPage.jsx`
**Location**: Existing popover JSX (~line 1469-1504).

**Before** (minimal Command palette):
```jsx
<PopoverContent className="w-52 p-1" ...>
    <Command>
        <CommandInput placeholder="Search or type..." />
        <CommandList>
            {availableTags.filter(...).map(tag => (
                <CommandItem onSelect={() => handleAddTag(customer.id, tag)}>{tag}</CommandItem>
            ))}
            ... "Create new" affordance
        </CommandList>
    </Command>
</PopoverContent>
```

**After** (multi-select autosave):
```jsx
<PopoverContent
    className="w-[280px] p-3"
    data-testid={`tag-popover-${customer.id}`}
>
    {/* CR-043-B: Multi-select popover with autosave */}
    <div className="mb-2 text-sm font-semibold">
        Tags for {customer.name}
    </div>
    <div className="my-2 h-px bg-slate-100" />

    {/* Current tags */}
    {(customer.tags || []).length > 0 && (
        <>
            <div className="mb-1 text-xs text-slate-500">Current</div>
            <div className="mb-3 flex flex-wrap gap-1">
                {customer.tags.map((tag) => (
                    <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-[#F26B33]/10 px-2 py-0.5 text-xs text-[#F26B33]"
                        data-testid={`current-tag-${customer.id}-${tag}`}
                    >
                        {tag}
                        <button
                            onClick={() => handleRemoveTag(customer.id, tag)}
                            aria-label={`Remove ${tag}`}
                        >
                            ✕
                        </button>
                    </span>
                ))}
            </div>
        </>
    )}

    {/* Search input */}
    <Input
        placeholder="Search or type a new tag…"
        value={tagSearchInput}
        onChange={(e) => setTagSearchInput(e.target.value)}
        className="mb-2 text-sm"
        data-testid={`tag-search-${customer.id}`}
    />

    {/* Available list with checkboxes + counts */}
    <div className="mb-2 max-h-48 overflow-y-auto">
        <div className="mb-1 text-xs text-slate-500">Available</div>
        {filteredAvailableTags.map((tagObj) => {
            const tag = typeof tagObj === "string" ? tagObj : tagObj.tag;
            const count = typeof tagObj === "string" ? null : tagObj.count;
            const isApplied = (customer.tags || []).includes(tag);
            return (
                <label
                    key={tag}
                    className="flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-slate-50"
                    data-testid={`tag-option-${customer.id}-${tag}`}
                >
                    <span className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={isApplied}
                            onChange={() => {
                                if (isApplied) handleRemoveTag(customer.id, tag);
                                else handleAddTag(customer.id, tag);
                            }}
                        />
                        {tag}
                    </span>
                    {count !== null && (
                        <span className="text-xs text-slate-400">({count})</span>
                    )}
                </label>
            );
        })}
    </div>

    {/* Create new — only when search input has an unmatched value */}
    {tagSearchInput.trim() &&
     !filteredAvailableTags.some(t => (typeof t === "string" ? t : t.tag) === tagSearchInput.trim()) && (
        <button
            className="mb-2 w-full rounded-md bg-[#F26B33] px-3 py-2 text-sm text-white"
            onClick={() => {
                handleAddTag(customer.id, tagSearchInput.trim());
                setTagSearchInput("");
            }}
            data-testid={`create-tag-${customer.id}`}
        >
            + Create "{tagSearchInput.trim()}"
        </button>
    )}

    {/* Done button */}
    <div className="flex justify-end">
        <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenTagPopover(null)}
            data-testid={`tag-popover-done-${customer.id}`}
        >
            Done
        </Button>
    </div>
</PopoverContent>
```

**Notes**:
- `handleAddTag` and `handleRemoveTag` (existing functions) are called on each checkbox toggle → **autosave**.
- After each add/remove, bump `refreshCounter` so the chip strip counts refresh.
- `filteredAvailableTags` = existing state; ensure it also renders count objects if `tagsWithCounts` is available (fallback to string list otherwise for backward compat).

### 3.6 Frontend edit 4 — refresh counter integration

**File**: `frontend/src/pages/CustomersPage.jsx`
**Location**: existing `handleAddTag` and `handleRemoveTag` (~line 1178-1210).

**Add** at end of each handler:
```jsx
setRefreshCounter((c) => c + 1);   // CR-043-A: trigger tag count refresh
```

**State declaration** (~line 116):
```jsx
const [refreshCounter, setRefreshCounter] = useState(0);   // CR-043-A
```

---

## 4. Files touched

| File | Change type | ~LOC |
|---|---|---|
| `backend/routers/customers.py` | (a) `tags` + `tags_mode` params on `list_customers` + query builder addition (~15 LOC), (b) `with_counts=true` variant on `/customers/tags` with aggregation pipeline (~30 LOC) | +45 |
| `frontend/src/pages/CustomersPage.jsx` | (a) `TagChipStrip` component (~90 LOC), (b) 3 state hooks + fetch useEffect + 3 handlers + fetchCustomers param inclusion (~30 LOC), (c) render TagChipStrip above filter block (~10 LOC), (d) popover rework (~90 LOC replacing existing ~35 LOC), (e) refreshCounter wiring (~5 LOC) | +170 net |

**Total: ~215 net-new LOC across 2 files.**

## 5. Files NOT touched

- `core/helpers.py::build_customer_query` — CRITICAL, do NOT refactor. AudiencesPage relies on it.
- `POST /customers/:id/tags` / `DELETE /customers/:id/tags/:tag` — working, keep untouched.
- `customers` collection schema.
- `AudiencesPage.jsx` — different filter surface; deferred to future CR.
- `MessageStatusPage.jsx` — different filter surface; deferred to future CR.
- `TagChip.jsx` component — reused, not modified.
- `models/schemas.py`.
- Any auth / integration code.

---

## 6. Code markers

- `// CR-043-A:` for Part A (filter) additions
- `// CR-043-B:` for Part B (popover) additions

---

## 7. Migrations / config / .env

**None.** No new env vars, no new secrets, no new dependencies, no DB migration. Uses existing `customers.tags` field.

---

## 8. Verification matrix

### 8.1 Backend (curl)

| # | Item | Command | Expected |
|---|---|---|---|
| B1 | Part A | `GET /customers?tags=VIP&tags_mode=any` | Returns customers with VIP tag; row count matches Mongo `db.customers.count({user_id:X, tags:"VIP"})` |
| B2 | Part A | `GET /customers?tags=VIP,Regular&tags_mode=all` | Returns customers with BOTH tags (intersection); count ≤ B1 result |
| B3 | Part A | `GET /customers` (no tags param) | Same as pre-change (regression) |
| B4 | Part A | `GET /customers?tags=&tags_mode=any` | Same as B3 (empty tags = no filter) |
| B5 | Part A | `GET /customers/tags` (no query param) | Returns old shape `{"tags": ["VIP", ...]}` (backward compat) |
| B6 | Part A | `GET /customers/tags?with_counts=true` | Returns new shape `{"tags": [{"tag":"VIP","count":156}, ...]}` sorted by count desc |
| B7 | Part A | User A with User B's tag in `?tags=` | 0 rows (tenant isolation) |
| B8 | Part A | `?tags=Nonexistent` | 0 rows |
| B9 | Part A | Existing 18 filter dimensions still work | curl each existing filter → unchanged (regression) |
| B10 | Part A | Aggregation on tenant with 0 tagged customers | Returns available_tags with count=0 for each |

### 8.2 Frontend (manual browser flows)

| # | Item | Steps | Expected |
|---|---|---|---|
| F1 | Part A | Login → Customers | Tag chip strip visible above filter block |
| F2 | Part A | Chip strip shows top-6 tags sorted by count | Verify against Mongo aggregation counts |
| F3 | Part A | Click a tag chip | Chip turns orange (✓), "Active: [Tag ✕]" appears, customer list refreshes to filtered |
| F4 | Part A | Click "More ▾" | All catalog tags visible; button changes to "Less ▴" |
| F5 | Part A | Click "All" radio, activate 2 tags | Only customers with BOTH tags shown |
| F6 | Part A | Click active-tag ✕ | Tag deactivated; list refreshes |
| F7 | Part A | Click "Clear tags" | All tags deactivated; strip returns to default |
| F8 | Part A | Regression — Tier / VIP / other filters still work | Unchanged behaviour |
| F9 | Part B | Click "+" popover on any customer row | New popover shown (280px, header, current chips, search, checkbox list, Done button) |
| F10 | Part B | Check an unchecked box in popover | Tag chip appears in "Current" section immediately (autosave) — no reload |
| F11 | Part B | Uncheck a checked box | Chip removed from Current instantly |
| F12 | Part B | Search "wknd" (unmatched) | "+ Create Wknd" button visible |
| F13 | Part B | Click Create | New tag applied; input cleared; catalog refreshed on next open |
| F14 | Part B | Click ✕ on a Current tag inside popover | Tag removed; count in strip decrements |
| F15 | Part B | Click Done | Popover closes; row's inline chips updated |
| F16 | Part A + Part B | After Part B adds/removes tags → strip counts refresh | Confirmed |
| F17 | Regression | Existing tag-add flow (before rework) semantics preserved | `handleAddTag` / `handleRemoveTag` semantics unchanged; segment filters unaffected |

---

## 9. Rollout / rollback

### Rollout
1. Merge 2 files together (backend + frontend). Single supervisor reload.
2. `curl $API/api/health` → healthy.
3. Run B1-B10 curl checks.
4. Open Customers page, run F1-F17 manual flows.

### Rollback
1. Git revert commit → both files restored.
2. `sudo supervisorctl restart backend frontend`.
3. No DB change to roll back.

---

## 10. Owner approval status

| Ask | Status |
|---|---|
| Part A design (Option C hybrid) | ✅ 2026-07-03 "1 C" |
| Part B design (Option C multi-select autosave) | ✅ 2026-07-03 "2 ok" |
| Bulk-apply exclusion | ✅ Documented as CR-045 (parked) |
| Scope limited to CustomersPage | ✅ 2026-07-03 intake |

**All owner-side answers received. No blockers. Ready for Implementation on gate.**

---

## 11. Estimated calendar time

| Phase | Time |
|---|---|
| Backend implementation | ~45 min |
| Frontend Part A (TagChipStrip + wiring) | ~2 hr |
| Frontend Part B (popover rework) | ~1.5 hr |
| Manual verification | ~45 min |
| **Total** | **~5 hr** |

---

*End of Implementation Plan for CR-043. No code changes yet. Awaits owner gate to open Role 3.*
