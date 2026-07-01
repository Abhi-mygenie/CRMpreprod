# CR-033 + CR-034 — Frozen Implementation Spec

> **Role**: PLANNING AGENT (Role 2)
> **Date**: 2026-07-01
> **Stage**: Detailed Implementation Plan (frozen — all decisions locked)
> **Supersedes**: `CR_033_CR_034_IMPACT_ANALYSIS.md` Part 6 (high-level only)
> **Gate**: IMPLEMENTATION OPEN — no further owner approval needed

---

## 0. PRECONDITIONS (verify before first edit)

```
[ ] Backend server running: sudo supervisorctl status backend → RUNNING
[ ] DB reachable: GET /api/health → {"status":"healthy"}
[ ] No uncommitted edits on tracked files
[ ] Working branch: 1-july
```

---

## 1. FILE EDIT MAP (complete — zero surprises)

| # | File | Type | Why |
|---|---|---|---|
| BE-1 | `backend/core/helpers.py` | EDIT | Make `build_customer_query` async; add 20 filter blocks (P0+P1+P2+tags) |
| BE-2 | `backend/models/schemas.py` | EDIT | Add `tags: List[str] = []` to CustomerBase (line 319), CustomerUpdate (line 424), Customer (line 547) |
| BE-3 | `backend/routers/customers.py` | EDIT | Await `build_customer_query` (2 call sites); add 5 tag endpoints before line 1060; add BulkTagRequest model |
| BE-4 | `backend/routers/campaigns.py` | EDIT | Await `build_customer_query` (1 call site at line 54) |
| BE-5 | `backend/migrations/cr034_vip_flag_to_tag.py` | NEW | One-time backfill: 46 vip_flag=True customers → tags=["VIP"] |
| FE-1 | `frontend/src/pages/AudiencesPage.jsx` | EDIT | Expand DEFAULT_FILTERS; rebuild filter dialog with accordion + active chips |
| FE-2 | `frontend/src/pages/CustomersPage.jsx` | EDIT | Add tag chips per row + bulk-tag action toolbar |
| FE-3 | `frontend/src/components/TagChip.jsx` | NEW | Reusable tag pill component |

**Files NOT touched:** `core/coupon.py`, `routers/pos.py`, `core/whatsapp.py`, `core/loyalty.py`,
`core/campaign_jobs.py`, `services/invoice_generator.py`, `services/analytics_service.py`, `routers/auth.py`

---

## 2. BE-1 — `backend/core/helpers.py` (FULL REPLACEMENT of `build_customer_query`)

### 2.1 Add import at top of file (after existing imports)
**Insert after the existing `from datetime import datetime, timezone, timedelta` line:**
```python
from core.database import db as _db
```

### 2.2 Replace `build_customer_query` (lines 220–316) with async version

Replace the entire function (lines 220–316) with:

```python
async def build_customer_query(user_id: str, filters: dict) -> dict:
    """Build MongoDB query from filter dictionary.
    CR-033: extended to 20 filter dimensions (P0 bug-A fixes + P1 + cheap P2).
    CR-034: added tags filter block.
    Made async for P2 cross-collection lookups.
    """
    query = {"user_id": user_id}

    # ── EXISTING 14 DIMENSIONS (unchanged) ─────────────────────────────
    # Tier filter
    if filters.get("tier") and filters["tier"] != "all":
        query["tier"] = {"$in": filters["tier"]} if isinstance(filters["tier"], list) else filters["tier"]

    # City filter
    if filters.get("city") and filters["city"] != "all":
        query["city"] = {"$in": filters["city"]} if isinstance(filters["city"], list) else filters["city"]

    # Customer type filter
    if filters.get("customer_type") and filters["customer_type"] != "all":
        query["customer_type"] = filters["customer_type"]

    # Last visit days (inactive filter)
    if filters.get("last_visit_days") and filters["last_visit_days"] != "all":
        try:
            days = int(filters["last_visit_days"])
            cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
            query["last_visit"] = {"$lt": cutoff_date}
        except (ValueError, TypeError):
            pass

    # Points range
    if filters.get("points_min") is not None:
        query["total_points"] = query.get("total_points", {})
        query["total_points"]["$gte"] = filters["points_min"]
    if filters.get("points_max") is not None:
        query["total_points"] = query.get("total_points", {})
        query["total_points"]["$lte"] = filters["points_max"]

    # Visits range (numeric)
    if filters.get("visits_min") is not None:
        query["total_visits"] = query.get("total_visits", {})
        query["total_visits"]["$gte"] = filters["visits_min"]
    if filters.get("visits_max") is not None:
        query["total_visits"] = query.get("total_visits", {})
        query["total_visits"]["$lte"] = filters["visits_max"]

    # Visits filter (string-based bucket)
    total_visits = filters.get("total_visits")
    if total_visits and total_visits != "all":
        if total_visits == "0":
            query["total_visits"] = 0
        elif total_visits == "1-5":
            query["total_visits"] = {"$gte": 1, "$lte": 5}
        elif total_visits == "6-10":
            query["total_visits"] = {"$gte": 6, "$lte": 10}
        elif total_visits == "10+":
            query["total_visits"] = {"$gt": 10}

    # Total spent filter (string-based bucket)
    total_spent_filter = filters.get("total_spent")
    if total_spent_filter and total_spent_filter != "all":
        if total_spent_filter == "0-500":
            query["total_spent"] = {"$lt": 500}
        elif total_spent_filter == "500-2000":
            query["total_spent"] = {"$gte": 500, "$lte": 2000}
        elif total_spent_filter == "2000-5000":
            query["total_spent"] = {"$gte": 2000, "$lte": 5000}
        elif total_spent_filter == "5000-10000":
            query["total_spent"] = {"$gte": 5000, "$lte": 10000}
        elif total_spent_filter == "10000+":
            query["total_spent"] = {"$gte": 10000}

    # Spent range (numeric)
    if filters.get("spent_min") is not None:
        query["total_spent"] = query.get("total_spent", {})
        query["total_spent"]["$gte"] = filters["spent_min"]
    if filters.get("spent_max") is not None:
        query["total_spent"] = query.get("total_spent", {})
        query["total_spent"]["$lte"] = filters["spent_max"]

    # Dietary preference
    if filters.get("dietary"):
        query["dietary"] = {"$in": filters["dietary"]} if isinstance(filters["dietary"], list) else filters["dietary"]

    # Allergies
    if filters.get("allergies"):
        query["allergies"] = {"$in": filters["allergies"]} if isinstance(filters["allergies"], list) else filters["allergies"]

    # Favorite food
    if filters.get("favorite_food"):
        query["favorite_food"] = {"$regex": filters["favorite_food"], "$options": "i"}

    # Search by name or phone
    if filters.get("search"):
        search_regex = {"$regex": filters["search"], "$options": "i"}
        query["$or"] = [
            {"name": search_regex},
            {"phone": search_regex},
            {"email": search_regex}
        ]

    # ── CR-033 P0: BUG-A FIXES (6 filters) ─────────────────────────────
    # vip_flag
    if filters.get("vip_flag") and filters["vip_flag"] != "all":
        query["vip_flag"] = filters["vip_flag"] == "true" or filters["vip_flag"] is True

    # whatsapp_opt_in
    if filters.get("whatsapp_opt_in") and filters["whatsapp_opt_in"] != "all":
        query["whatsapp_opt_in"] = filters["whatsapp_opt_in"] == "true" or filters["whatsapp_opt_in"] is True

    # has_birthday_this_month
    if filters.get("has_birthday_this_month"):
        current_month = datetime.now(timezone.utc).month
        month_str = f"-{current_month:02d}-"
        query["dob"] = {"$regex": month_str}

    # is_blocked
    if filters.get("is_blocked") and filters["is_blocked"] != "all":
        query["is_blocked"] = filters["is_blocked"] == "true" or filters["is_blocked"] is True

    # blacklist_flag
    if filters.get("blacklist_flag") and filters["blacklist_flag"] != "all":
        query["blacklist_flag"] = filters["blacklist_flag"] == "true" or filters["blacklist_flag"] is True

    # complaint_flag
    if filters.get("complaint_flag") and filters["complaint_flag"] != "all":
        query["complaint_flag"] = filters["complaint_flag"] == "true" or filters["complaint_flag"] is True

    # ── CR-033 P1: NEW FILTERS (11 filters) ─────────────────────────────
    # has_anniversary_this_month
    if filters.get("has_anniversary_this_month"):
        current_month = datetime.now(timezone.utc).month
        month_str = f"-{current_month:02d}-"
        query["anniversary"] = {"$regex": month_str}

    # birthday_month (specific month 1-12)
    if filters.get("birthday_month") and filters["birthday_month"] != "all":
        try:
            m = int(filters["birthday_month"])
            query["dob"] = {"$regex": f"-{m:02d}-"}
        except (ValueError, TypeError):
            pass

    # age_bracket (derived from dob)
    if filters.get("age_bracket") and filters["age_bracket"] != "all":
        today = datetime.now(timezone.utc)
        bracket = filters["age_bracket"]
        if bracket == "18-25":
            start_year, end_year = today.year - 25, today.year - 18
        elif bracket == "26-35":
            start_year, end_year = today.year - 35, today.year - 26
        elif bracket == "36-50":
            start_year, end_year = today.year - 50, today.year - 36
        elif bracket == "50+":
            start_year, end_year = today.year - 120, today.year - 50
        else:
            start_year, end_year = None, None
        if start_year and end_year:
            query["dob"] = {"$gte": str(start_year), "$lte": str(end_year + 1)}

    # gender
    if filters.get("gender") and filters["gender"] != "all":
        query["gender"] = filters["gender"]

    # created_at_days (signed up in last N days)
    if filters.get("created_at_days") and filters["created_at_days"] != "all":
        try:
            days = int(filters["created_at_days"])
            cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
            query["created_at"] = {"$gte": cutoff}
        except (ValueError, TypeError):
            pass

    # lead_source (single or multi-select)
    if filters.get("lead_source") and filters["lead_source"] != "all":
        val = filters["lead_source"]
        query["lead_source"] = {"$in": val} if isinstance(val, list) else val

    # has_gst
    if filters.get("has_gst") is not None and filters["has_gst"] != "all":
        if filters["has_gst"] is True or filters["has_gst"] == "true":
            query["gst_number"] = {"$exists": True, "$nin": [None, ""]}
        else:
            query["$or"] = query.get("$or", []) + [
                {"gst_number": {"$exists": False}},
                {"gst_number": None},
                {"gst_number": ""}
            ]

    # has_notes
    if filters.get("has_notes") is not None and filters["has_notes"] != "all":
        if filters["has_notes"] is True or filters["has_notes"] == "true":
            query["notes"] = {"$exists": True, "$nin": [None, ""]}
        else:
            query["$or"] = query.get("$or", []) + [
                {"notes": {"$exists": False}},
                {"notes": None},
                {"notes": ""}
            ]

    # wallet_balance_range (bucket: "zero", "low", "mid", "high")
    if filters.get("wallet_balance") and filters["wallet_balance"] != "all":
        wb = filters["wallet_balance"]
        if wb == "zero":
            query["wallet_balance"] = {"$lte": 0}
        elif wb == "low":
            query["wallet_balance"] = {"$gt": 0, "$lte": 500}
        elif wb == "mid":
            query["wallet_balance"] = {"$gt": 500, "$lte": 2000}
        elif wb == "high":
            query["wallet_balance"] = {"$gt": 2000}

    # total_coupon_used (bucket: "0", "1-5", "6+")
    if filters.get("total_coupon_used") and filters["total_coupon_used"] != "all":
        tcu = filters["total_coupon_used"]
        if tcu == "0":
            query["total_coupon_used"] = 0
        elif tcu == "1-5":
            query["total_coupon_used"] = {"$gte": 1, "$lte": 5}
        elif tcu == "6+":
            query["total_coupon_used"] = {"$gt": 5}

    # total_points_earned (bucket: "low", "mid", "high", "very_high")
    if filters.get("total_points_earned") and filters["total_points_earned"] != "all":
        tpe = filters["total_points_earned"]
        if tpe == "low":
            query["total_points_earned"] = {"$lte": 100}
        elif tpe == "mid":
            query["total_points_earned"] = {"$gt": 100, "$lte": 500}
        elif tpe == "high":
            query["total_points_earned"] = {"$gt": 500, "$lte": 2000}
        elif tpe == "very_high":
            query["total_points_earned"] = {"$gt": 2000}

    # ── CR-033 P2: CROSS-COLLECTION JOINS (3 filters) ────────────────────
    # received_campaign_id: customers who received a specific campaign
    if filters.get("received_campaign_id") and filters["received_campaign_id"] != "all":
        cid = filters["received_campaign_id"]
        logs = await _db.whatsapp_message_logs.distinct(
            "customer_id",
            {"user_id": user_id, "$or": [{"campaign_id": cid}, {"reference_id": cid}]}
        )
        query["id"] = {"$in": logs}

    # whatsapp_status_failed: customers whose last WA message failed
    if filters.get("whatsapp_status_failed"):
        failed_ids = await _db.whatsapp_message_logs.distinct(
            "customer_id",
            {"user_id": user_id, "status": {"$in": ["failed", "rejected"]}}
        )
        query["id"] = {"$in": failed_ids}

    # never_messaged: customers who have never received a WA message
    if filters.get("never_messaged"):
        messaged_ids = await _db.whatsapp_message_logs.distinct(
            "customer_id", {"user_id": user_id}
        )
        query["id"] = {"$nin": messaged_ids}

    # ── CR-034: USER-DEFINED TAGS FILTER ────────────────────────────────
    # tags: list of tag strings; mode "any" (OR/$in) or "all" (AND/$all)
    if filters.get("tags") and isinstance(filters["tags"], list) and len(filters["tags"]) > 0:
        mode = filters.get("tags_mode", "any")
        if mode == "all":
            query["tags"] = {"$all": filters["tags"]}
        else:
            query["tags"] = {"$in": filters["tags"]}

    return query
```

### 2.3 Update `resolve_audience()` (line ~335) to await

Change:
```python
query = build_customer_query(user_id, segment.get("filters", {}))
```
To:
```python
query = await build_customer_query(user_id, segment.get("filters", {}))
```

---

## 3. BE-2 — `backend/models/schemas.py` (3 targeted edits)

### Edit A — CustomerBase (after line 319, after `notes: Optional[str] = None`)
**Append after line 319:**
```python
    # CR-034: user-defined free-form tags
    tags: List[str] = []
```

### Edit B — CustomerUpdate (after line 424, after `notes: Optional[str] = None`)
**Append after line 424:**
```python
    # CR-034: user-defined free-form tags
    tags: Optional[List[str]] = None
```

### Edit C — Customer (after line 547, after `notes: Optional[str] = None`)
**Append after line 547:**
```python
    # CR-034: user-defined free-form tags
    tags: List[str] = []
```

---

## 4. BE-3 — `backend/routers/customers.py`

### 4.1 Add BulkTagRequest model (after existing imports, before first @router)

Add after the `from models.schemas import (...)` block:
```python
# CR-034: tag request models
from pydantic import BaseModel as _BaseModel
class _BulkTagRequest(_BaseModel):
    customer_ids: List[str]
    tag: str
```

### 4.2 Add 5 tag endpoints (insert before line 1060 — the `@router.get("/{customer_id}")` line)

Insert the following block **immediately before** `@router.get("/{customer_id}", response_model=Customer)`:

```python
# ── CR-034: Customer Tag Endpoints ──────────────────────────────────────────

@router.get("/tags")
async def list_available_tags(user: dict = Depends(get_current_user)):
    """CR-034: Return the tenant's tag catalog (available_tags) sorted alphabetically."""
    user_doc = await db.users.find_one({"id": user["id"]}, {"available_tags": 1, "_id": 0})
    tags = sorted(user_doc.get("available_tags", []) if user_doc else [])
    return {"tags": tags}


@router.post("/{customer_id}/tags")
async def add_tags_to_customer(customer_id: str, data: dict, user: dict = Depends(get_current_user)):
    """CR-034: Add one or more tags to a customer. Idempotent ($addToSet). Updates tenant catalog."""
    new_tags = data.get("tags", [])
    if not new_tags or not isinstance(new_tags, list):
        raise HTTPException(status_code=400, detail="tags must be a non-empty list of strings")
    # Validate tag names: max 30 chars, alphanumeric + space + - _
    import re
    for t in new_tags:
        if not isinstance(t, str) or not t.strip():
            raise HTTPException(status_code=400, detail=f"Invalid tag: {t!r}")
        if len(t) > 30:
            raise HTTPException(status_code=400, detail=f"Tag '{t}' exceeds 30 characters")
        if not re.match(r'^[\w\s\-]+$', t):
            raise HTTPException(status_code=400, detail=f"Tag '{t}' contains invalid characters")
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    await db.customers.update_one(
        {"id": customer_id, "user_id": user["id"]},
        {"$addToSet": {"tags": {"$each": new_tags}}}
    )
    await db.users.update_one(
        {"id": user["id"]},
        {"$addToSet": {"available_tags": {"$each": new_tags}}}
    )
    updated = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"tags": 1, "_id": 0})
    return {"customer_id": customer_id, "tags": updated.get("tags", [])}


@router.delete("/{customer_id}/tags/{tag}")
async def remove_tag_from_customer(customer_id: str, tag: str, user: dict = Depends(get_current_user)):
    """CR-034: Remove one tag from a customer. Catalog entry kept (Q3 decision)."""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    await db.customers.update_one(
        {"id": customer_id, "user_id": user["id"]},
        {"$pull": {"tags": tag}}
    )
    updated = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"tags": 1, "_id": 0})
    return {"customer_id": customer_id, "tags": updated.get("tags", [])}


@router.post("/bulk-tag")
async def bulk_tag_customers(data: dict, user: dict = Depends(get_current_user)):
    """CR-034: Apply a tag to multiple customers in one call."""
    customer_ids = data.get("customer_ids", [])
    tag = data.get("tag", "").strip()
    if not customer_ids or not isinstance(customer_ids, list):
        raise HTTPException(status_code=400, detail="customer_ids must be a non-empty list")
    if not tag:
        raise HTTPException(status_code=400, detail="tag must be a non-empty string")
    if len(tag) > 30:
        raise HTTPException(status_code=400, detail="Tag exceeds 30 characters")
    result = await db.customers.update_many(
        {"id": {"$in": customer_ids}, "user_id": user["id"]},
        {"$addToSet": {"tags": tag}}
    )
    await db.users.update_one(
        {"id": user["id"]},
        {"$addToSet": {"available_tags": tag}}
    )
    return {"matched": result.matched_count, "modified": result.modified_count, "tag": tag}


@router.post("/bulk-untag")
async def bulk_untag_customers(data: dict, user: dict = Depends(get_current_user)):
    """CR-034: Remove a tag from multiple customers in one call."""
    customer_ids = data.get("customer_ids", [])
    tag = data.get("tag", "").strip()
    if not customer_ids or not isinstance(customer_ids, list):
        raise HTTPException(status_code=400, detail="customer_ids must be a non-empty list")
    if not tag:
        raise HTTPException(status_code=400, detail="tag must be a non-empty string")
    result = await db.customers.update_many(
        {"id": {"$in": customer_ids}, "user_id": user["id"]},
        {"$pull": {"tags": tag}}
    )
    return {"matched": result.matched_count, "modified": result.modified_count, "tag": tag}
```

### 4.3 Await `build_customer_query` at 2 call sites

**Call site 1 — `count_customers_by_filters` (line 1342):**
```python
# BEFORE:
query = build_customer_query(user_id, filters)
# AFTER:
query = await build_customer_query(user_id, filters)
```

**Call site 2 — verify `resolve_audience` in helpers.py is already updated (BE-1 §2.3)**

---

## 5. BE-4 — `backend/routers/campaigns.py`

### 5.1 Await `build_customer_query` (line 54)

```python
# BEFORE (line 54):
query = build_customer_query(user_id, segment.get("filters", {}))
# AFTER:
query = await build_customer_query(user_id, segment.get("filters", {}))
```

---

## 6. BE-5 — `backend/migrations/cr034_vip_flag_to_tag.py` (NEW FILE)

```python
"""
CR-034 — One-time backfill migration
Auto-add "VIP" tag to all customers with vip_flag=True.
Also updates each affected user's available_tags catalog.
Idempotent — safe to re-run ($addToSet never duplicates).
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

async def run():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # Step 1: tag all vip_flag=True customers
    result = await db.customers.update_many(
        {"vip_flag": True},
        {"$addToSet": {"tags": "VIP"}}
    )
    print(f"Tagged {result.modified_count} customers with 'VIP'")

    # Step 2: collect distinct user_ids of affected customers
    affected = await db.customers.distinct("user_id", {"vip_flag": True})
    print(f"Updating available_tags for {len(affected)} tenants")

    # Step 3: update each tenant's catalog
    for uid in affected:
        await db.users.update_one(
            {"id": uid},
            {"$addToSet": {"available_tags": "VIP"}}
        )

    print("Backfill complete.")
    client.close()

if __name__ == "__main__":
    asyncio.run(run())
```

Run after deploy:
```bash
cd /app/backend && python migrations/cr034_vip_flag_to_tag.py
```

---

## 7. FE-3 — `frontend/src/components/TagChip.jsx` (NEW FILE, ~60 lines)

```jsx
import { X } from "lucide-react";

/**
 * CR-034: Reusable tag chip pill.
 * Props:
 *   tag        (string)    — tag label
 *   onRemove   (fn|null)   — called with tag string; if null, no × shown
 *   onClick    (fn|null)   — called on chip click (for filter selection)
 *   selected   (bool)      — highlight when used as filter option
 *   className  (string)    — extra classes
 */
const TAG_COLORS = [
    { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-600" },
    { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700"  },
    { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
    { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700"   },
    { bg: "bg-pink-50",   border: "border-pink-200",   text: "text-pink-700"   },
];

function getTagColor(tag) {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

const TagChip = ({ tag, onRemove = null, onClick = null, selected = false, className = "" }) => {
    const color = getTagColor(tag);
    return (
        <span
            onClick={onClick ? () => onClick(tag) : undefined}
            className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border
                ${color.bg} ${color.border} ${color.text}
                ${onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}
                ${selected ? "ring-2 ring-offset-1 ring-current" : ""}
                ${className}
            `}
        >
            {tag}
            {onRemove && (
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(tag); }}
                    className="ml-0.5 hover:opacity-70 transition-opacity rounded-full"
                    aria-label={`Remove tag ${tag}`}
                >
                    <X className="w-2.5 h-2.5" />
                </button>
            )}
        </span>
    );
};

export default TagChip;
```

---

## 8. FE-1 — `frontend/src/pages/AudiencesPage.jsx` (FULL EDIT SPEC)

### 8.1 New imports to add at top
```jsx
import { ChevronDown, ChevronUp, X as XIcon } from "lucide-react";
import TagChip from "@/components/TagChip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
```

### 8.2 New DEFAULT_FILTERS (replace line 30)
```jsx
const DEFAULT_FILTERS = {
    // Section 1: Loyalty & Tier
    tier: "all", total_visits: "all", total_spent: "all",
    total_points_earned: "all", wallet_balance: "all", total_coupon_used: "all",
    // Section 2: Dates & Occasions
    last_visit_days: "all", has_birthday_this_month: false,
    has_anniversary_this_month: false, birthday_month: "all",
    age_bracket: "all", created_at_days: "all",
    // Section 3: WhatsApp & Engagement
    whatsapp_opt_in: "all", received_campaign_id: "all",
    whatsapp_status_failed: false, never_messaged: false,
    // Section 4: Customer Flags
    vip_flag: "all", is_blocked: "all", blacklist_flag: "all",
    complaint_flag: "all", lead_source: "all", has_gst: "all", gender: "all",
    // Section 5: Tags (CR-034)
    tags: [], tags_mode: "any",
};
```

### 8.3 New state variables (add after existing useState declarations)
```jsx
const [openSections, setOpenSections] = useState({ loyalty: true, dates: true, engagement: false, flags: false, tags: false });
const [availableTags, setAvailableTags] = useState([]);
const [campaigns, setCampaigns] = useState([]);  // already exists — keep

// Fetch tag catalog for filter autocomplete
useEffect(() => {
    if (showCreate) {
        api.get("/customers/tags").then(r => setAvailableTags(r.data?.tags || [])).catch(() => {});
    }
}, [showCreate]);
```

### 8.4 Updated `getFilterTags()` function (replace lines 78–89)
```jsx
const getFilterTags = (filters) => {
    if (!filters) return [];
    const tags = [];
    if (filters.tier && filters.tier !== "all") tags.push(`Tier: ${Array.isArray(filters.tier) ? filters.tier.join(", ") : filters.tier}`);
    if (filters.last_visit_days && filters.last_visit_days !== "all") tags.push(`Inactive: ${filters.last_visit_days}+ days`);
    if (filters.total_spent && filters.total_spent !== "all") tags.push(`Spent: ₹${filters.total_spent}`);
    if (filters.total_visits && filters.total_visits !== "all") tags.push(`Visits: ${filters.total_visits}`);
    if (filters.has_birthday_this_month) tags.push("Birthday: This Month");
    if (filters.has_anniversary_this_month) tags.push("Anniversary: This Month");
    if (filters.birthday_month && filters.birthday_month !== "all") tags.push(`Birthday: Month ${filters.birthday_month}`);
    if (filters.vip_flag && filters.vip_flag !== "all") tags.push("VIP: Yes");
    if (filters.whatsapp_opt_in && filters.whatsapp_opt_in !== "all") tags.push("WA Opted-In");
    if (filters.is_blocked && filters.is_blocked !== "all") tags.push("Blocked");
    if (filters.blacklist_flag && filters.blacklist_flag !== "all") tags.push("Blacklisted");
    if (filters.complaint_flag && filters.complaint_flag !== "all") tags.push("Has Complaint");
    if (filters.gender && filters.gender !== "all") tags.push(`Gender: ${filters.gender}`);
    if (filters.lead_source && filters.lead_source !== "all") tags.push(`Source: ${filters.lead_source}`);
    if (filters.has_gst && filters.has_gst !== "all") tags.push("Has GST");
    if (filters.whatsapp_status_failed) tags.push("WA Failed");
    if (filters.never_messaged) tags.push("Never WA'd");
    if (filters.wallet_balance && filters.wallet_balance !== "all") tags.push(`Wallet: ${filters.wallet_balance}`);
    if (filters.total_coupon_used && filters.total_coupon_used !== "all") tags.push(`Coupons: ${filters.total_coupon_used}`);
    if (filters.total_points_earned && filters.total_points_earned !== "all") tags.push(`Points: ${filters.total_points_earned}`);
    if (filters.tags && filters.tags.length > 0) tags.push(`Tags: ${filters.tags.join(", ")}`);
    return tags;
};
```

### 8.5 Dialog content replacement (replace lines 313–400 — the Dialog inner JSX)

Replace the entire `<Dialog open={showCreate} ...>` inner content with:

```jsx
<Dialog open={showCreate} onOpenChange={(o) => { if (!o) closeCreateDialog(); else setShowCreate(true); }}>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="audience-dialog">
        <DialogHeader>
            <DialogTitle>{editingSeg ? `Edit Audience: ${editingSeg.name}` : "Create New Audience"}</DialogTitle>
            <p className="text-xs text-gray-400 mt-1">Filters combine with AND · Multi-select within a filter = OR</p>
        </DialogHeader>

        {editingSeg && getCampaignCount(editingSeg.id) > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                ⚠ Used in {getCampaignCount(editingSeg.id)} campaign(s). Updates apply on next scheduled run.
            </div>
        )}

        {/* Audience Name */}
        <div>
            <Label className="text-xs font-semibold uppercase">Audience Name</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., Gold Regulars — Birthday This Month" className="mt-1" data-testid="new-audience-name" />
        </div>

        {/* Active filter chips */}
        {getFilterTags(newFilters).length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-lg">
                {getFilterTags(newFilters).map((t, i) => (
                    <span key={i} className="px-2 py-0.5 bg-white border border-gray-200 rounded-full text-[11px] text-gray-600">{t}</span>
                ))}
            </div>
        )}

        {/* ── Section 1: Loyalty & Tier ── */}
        <Collapsible open={openSections.loyalty} onOpenChange={v => setOpenSections(p => ({...p, loyalty: v}))}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 bg-orange-50 border border-orange-100 rounded-lg text-xs font-bold uppercase text-orange-600 hover:bg-orange-100 transition-colors">
                <span>Loyalty & Tier</span>
                <div className="flex items-center gap-2">
                    {[newFilters.tier, newFilters.total_visits, newFilters.total_spent, newFilters.total_points_earned, newFilters.wallet_balance, newFilters.total_coupon_used].filter(v => v && v !== "all").length > 0 && (
                        <span className="bg-[#F26B33] text-white rounded-full text-[10px] px-1.5 py-0.5 font-bold">
                            {[newFilters.tier, newFilters.total_visits, newFilters.total_spent, newFilters.total_points_earned, newFilters.wallet_balance, newFilters.total_coupon_used].filter(v => v && v !== "all").length}
                        </span>
                    )}
                    {openSections.loyalty ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="border border-t-0 border-orange-100 rounded-b-lg p-3 grid grid-cols-2 gap-3">
                    <div>
                        <Label className="text-xs font-semibold uppercase">Tier</Label>
                        <Select value={newFilters.tier} onValueChange={v => setNewFilters(p => ({...p, tier: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Tiers</SelectItem>
                                <SelectItem value="Bronze">Bronze</SelectItem>
                                <SelectItem value="Silver">Silver</SelectItem>
                                <SelectItem value="Gold">Gold</SelectItem>
                                <SelectItem value="Platinum">Platinum</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs font-semibold uppercase">Total Visits</Label>
                        <Select value={newFilters.total_visits} onValueChange={v => setNewFilters(p => ({...p, total_visits: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any</SelectItem>
                                <SelectItem value="0">0 visits</SelectItem>
                                <SelectItem value="1-5">1–5</SelectItem>
                                <SelectItem value="6-10">6–10</SelectItem>
                                <SelectItem value="10+">10+</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs font-semibold uppercase">Total Spent</Label>
                        <Select value={newFilters.total_spent} onValueChange={v => setNewFilters(p => ({...p, total_spent: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any amount</SelectItem>
                                <SelectItem value="0-500">Under ₹500</SelectItem>
                                <SelectItem value="500-2000">₹500–2,000</SelectItem>
                                <SelectItem value="2000-5000">₹2,000–5,000</SelectItem>
                                <SelectItem value="5000-10000">₹5,000–10,000</SelectItem>
                                <SelectItem value="10000+">₹10,000+</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs font-semibold uppercase">Points Earned</Label>
                        <Select value={newFilters.total_points_earned} onValueChange={v => setNewFilters(p => ({...p, total_points_earned: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any</SelectItem>
                                <SelectItem value="low">Low (0–100)</SelectItem>
                                <SelectItem value="mid">Mid (101–500)</SelectItem>
                                <SelectItem value="high">High (501–2000)</SelectItem>
                                <SelectItem value="very_high">Very High (2000+)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs font-semibold uppercase">Wallet Balance</Label>
                        <Select value={newFilters.wallet_balance} onValueChange={v => setNewFilters(p => ({...p, wallet_balance: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any</SelectItem>
                                <SelectItem value="zero">Zero (₹0)</SelectItem>
                                <SelectItem value="low">Low (₹1–500)</SelectItem>
                                <SelectItem value="mid">Mid (₹501–2000)</SelectItem>
                                <SelectItem value="high">High (₹2000+)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs font-semibold uppercase">Coupons Used</Label>
                        <Select value={newFilters.total_coupon_used} onValueChange={v => setNewFilters(p => ({...p, total_coupon_used: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any</SelectItem>
                                <SelectItem value="0">None</SelectItem>
                                <SelectItem value="1-5">1–5</SelectItem>
                                <SelectItem value="6+">6+</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>

        {/* ── Section 2: Dates & Occasions ── */}
        <Collapsible open={openSections.dates} onOpenChange={v => setOpenSections(p => ({...p, dates: v}))}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs font-bold uppercase text-blue-600 hover:bg-blue-100 transition-colors">
                <span>Dates & Occasions</span>
                <div className="flex items-center gap-2">
                    {[newFilters.last_visit_days, newFilters.birthday_month, newFilters.age_bracket, newFilters.created_at_days].filter(v => v && v !== "all").length + [newFilters.has_birthday_this_month, newFilters.has_anniversary_this_month].filter(Boolean).length > 0 && (
                        <span className="bg-blue-600 text-white rounded-full text-[10px] px-1.5 py-0.5 font-bold">
                            {[newFilters.last_visit_days, newFilters.birthday_month, newFilters.age_bracket, newFilters.created_at_days].filter(v => v && v !== "all").length + [newFilters.has_birthday_this_month, newFilters.has_anniversary_this_month].filter(Boolean).length}
                        </span>
                    )}
                    {openSections.dates ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="border border-t-0 border-blue-100 rounded-b-lg p-3 grid grid-cols-2 gap-3">
                    <div>
                        <Label className="text-xs font-semibold uppercase">Last Visit</Label>
                        <Select value={newFilters.last_visit_days} onValueChange={v => setNewFilters(p => ({...p, last_visit_days: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any time</SelectItem>
                                <SelectItem value="7">7+ days ago</SelectItem>
                                <SelectItem value="14">14+ days ago</SelectItem>
                                <SelectItem value="30">30+ days ago</SelectItem>
                                <SelectItem value="60">60+ days ago</SelectItem>
                                <SelectItem value="90">90+ days ago</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs font-semibold uppercase">Signed Up</Label>
                        <Select value={newFilters.created_at_days} onValueChange={v => setNewFilters(p => ({...p, created_at_days: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any time</SelectItem>
                                <SelectItem value="7">Last 7 days</SelectItem>
                                <SelectItem value="30">Last 30 days</SelectItem>
                                <SelectItem value="90">Last 90 days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs font-semibold uppercase">Birthday Month</Label>
                        <Select value={newFilters.birthday_month} onValueChange={v => setNewFilters(p => ({...p, birthday_month: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any month</SelectItem>
                                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                                    <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs font-semibold uppercase">Age Bracket</Label>
                        <Select value={newFilters.age_bracket} onValueChange={v => setNewFilters(p => ({...p, age_bracket: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any age</SelectItem>
                                <SelectItem value="18-25">18–25</SelectItem>
                                <SelectItem value="26-35">26–35</SelectItem>
                                <SelectItem value="36-50">36–50</SelectItem>
                                <SelectItem value="50+">50+</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2 col-span-1">
                        <Checkbox checked={newFilters.has_birthday_this_month} onCheckedChange={v => setNewFilters(p => ({...p, has_birthday_this_month: v}))} />
                        <Label className="text-xs">Birthday this month</Label>
                    </div>
                    <div className="flex items-center gap-2 col-span-1">
                        <Checkbox checked={newFilters.has_anniversary_this_month} onCheckedChange={v => setNewFilters(p => ({...p, has_anniversary_this_month: v}))} />
                        <Label className="text-xs">Anniversary this month</Label>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>

        {/* ── Section 3: WhatsApp & Engagement ── */}
        <Collapsible open={openSections.engagement} onOpenChange={v => setOpenSections(p => ({...p, engagement: v}))}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 bg-green-50 border border-green-100 rounded-lg text-xs font-bold uppercase text-green-700 hover:bg-green-100 transition-colors">
                <span>WhatsApp & Engagement</span>
                <div className="flex items-center gap-2">
                    {[newFilters.whatsapp_opt_in, newFilters.received_campaign_id].filter(v => v && v !== "all").length + [newFilters.whatsapp_status_failed, newFilters.never_messaged].filter(Boolean).length > 0 && (
                        <span className="bg-green-600 text-white rounded-full text-[10px] px-1.5 py-0.5 font-bold">
                            {[newFilters.whatsapp_opt_in, newFilters.received_campaign_id].filter(v => v && v !== "all").length + [newFilters.whatsapp_status_failed, newFilters.never_messaged].filter(Boolean).length}
                        </span>
                    )}
                    {openSections.engagement ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="border border-t-0 border-green-100 rounded-b-lg p-3 grid grid-cols-2 gap-3">
                    <div>
                        <Label className="text-xs font-semibold uppercase">WhatsApp Opted-In</Label>
                        <Select value={newFilters.whatsapp_opt_in} onValueChange={v => setNewFilters(p => ({...p, whatsapp_opt_in: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="true">Opted In</SelectItem>
                                <SelectItem value="false">Not Opted In</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs font-semibold uppercase">Received Campaign</Label>
                        <Select value={newFilters.received_campaign_id} onValueChange={v => setNewFilters(p => ({...p, received_campaign_id: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any / All</SelectItem>
                                {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox checked={newFilters.whatsapp_status_failed} onCheckedChange={v => setNewFilters(p => ({...p, whatsapp_status_failed: v}))} />
                        <Label className="text-xs">WA message failed recently</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox checked={newFilters.never_messaged} onCheckedChange={v => setNewFilters(p => ({...p, never_messaged: v}))} />
                        <Label className="text-xs">Never messaged on WhatsApp</Label>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>

        {/* ── Section 4: Customer Flags ── */}
        <Collapsible open={openSections.flags} onOpenChange={v => setOpenSections(p => ({...p, flags: v}))}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 bg-purple-50 border border-purple-100 rounded-lg text-xs font-bold uppercase text-purple-700 hover:bg-purple-100 transition-colors">
                <span>Customer Flags & Profile</span>
                <div className="flex items-center gap-2">
                    {[newFilters.vip_flag, newFilters.is_blocked, newFilters.blacklist_flag, newFilters.complaint_flag, newFilters.lead_source, newFilters.has_gst, newFilters.gender].filter(v => v && v !== "all").length > 0 && (
                        <span className="bg-purple-600 text-white rounded-full text-[10px] px-1.5 py-0.5 font-bold">
                            {[newFilters.vip_flag, newFilters.is_blocked, newFilters.blacklist_flag, newFilters.complaint_flag, newFilters.lead_source, newFilters.has_gst, newFilters.gender].filter(v => v && v !== "all").length}
                        </span>
                    )}
                    {openSections.flags ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="border border-t-0 border-purple-100 rounded-b-lg p-3 grid grid-cols-2 gap-3">
                    <div>
                        <Label className="text-xs font-semibold uppercase">VIP Status</Label>
                        <Select value={newFilters.vip_flag} onValueChange={v => setNewFilters(p => ({...p, vip_flag: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="true">VIP Only</SelectItem>
                                <SelectItem value="false">Non-VIP</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs font-semibold uppercase">Gender</Label>
                        <Select value={newFilters.gender} onValueChange={v => setNewFilters(p => ({...p, gender: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="male">Male</SelectItem>
                                <SelectItem value="female">Female</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs font-semibold uppercase">Lead Source</Label>
                        <Select value={newFilters.lead_source} onValueChange={v => setNewFilters(p => ({...p, lead_source: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Sources</SelectItem>
                                {["Walk-in","Swiggy","Zomato","Instagram","Facebook","Google","Referral","Airbnb","WhatsApp","Phone Call"].map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs font-semibold uppercase">Has GST</Label>
                        <Select value={newFilters.has_gst} onValueChange={v => setNewFilters(p => ({...p, has_gst: v}))}>
                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="true">Has GST</SelectItem>
                                <SelectItem value="false">No GST</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox checked={newFilters.is_blocked === "true" || newFilters.is_blocked === true} onCheckedChange={v => setNewFilters(p => ({...p, is_blocked: v ? "true" : "all"}))} />
                        <Label className="text-xs">Blocked</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox checked={newFilters.blacklist_flag === "true" || newFilters.blacklist_flag === true} onCheckedChange={v => setNewFilters(p => ({...p, blacklist_flag: v ? "true" : "all"}))} />
                        <Label className="text-xs">Blacklisted</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox checked={newFilters.complaint_flag === "true" || newFilters.complaint_flag === true} onCheckedChange={v => setNewFilters(p => ({...p, complaint_flag: v ? "true" : "all"}))} />
                        <Label className="text-xs">Has Complaint</Label>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>

        {/* ── Section 5: Tags (CR-034) ── */}
        <Collapsible open={openSections.tags} onOpenChange={v => setOpenSections(p => ({...p, tags: v}))}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 bg-orange-50 border border-orange-200 rounded-lg text-xs font-bold uppercase text-[#F26B33] hover:bg-orange-100 transition-colors">
                <span>Tags</span>
                <div className="flex items-center gap-2">
                    {newFilters.tags.length > 0 && (
                        <span className="bg-[#F26B33] text-white rounded-full text-[10px] px-1.5 py-0.5 font-bold">{newFilters.tags.length}</span>
                    )}
                    {openSections.tags ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="border border-t-0 border-orange-200 rounded-b-lg p-3 space-y-2">
                    <Label className="text-xs text-gray-500">Include customers with these tags:</Label>
                    <div className="flex flex-wrap gap-1.5">
                        {newFilters.tags.map(t => (
                            <TagChip key={t} tag={t} onRemove={tag => setNewFilters(p => ({...p, tags: p.tags.filter(x => x !== tag)}))} />
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {availableTags.filter(t => !newFilters.tags.includes(t)).map(t => (
                            <TagChip key={t} tag={t} onClick={tag => setNewFilters(p => ({...p, tags: [...p.tags, tag]}))} className="opacity-60 hover:opacity-100" />
                        ))}
                    </div>
                    {newFilters.tags.length > 1 && (
                        <div className="flex items-center gap-2 pt-1">
                            <span className="text-xs text-gray-500">Match:</span>
                            <div className="flex border border-gray-200 rounded-md overflow-hidden text-[11px]">
                                <button onClick={() => setNewFilters(p => ({...p, tags_mode: "any"}))} className={`px-3 py-1 font-semibold ${newFilters.tags_mode === "any" ? "bg-[#F26B33] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>ANY (OR)</button>
                                <button onClick={() => setNewFilters(p => ({...p, tags_mode: "all"}))} className={`px-3 py-1 font-semibold ${newFilters.tags_mode === "all" ? "bg-[#F26B33] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>ALL (AND)</button>
                            </div>
                        </div>
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>

        {/* Preview count bar */}
        <div className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-3 py-2.5">
            <div>
                {previewCount !== null ? (
                    <span className="text-[#F26B33] font-extrabold text-lg">{previewCount.toLocaleString()}</span>
                ) : (
                    <span className="text-gray-400 text-sm">— customers</span>
                )}
                <span className="text-xs text-gray-500 ml-2">match these filters</span>
            </div>
            <Button variant="outline" onClick={handlePreviewCount} className="rounded-full h-8 text-xs" data-testid="preview-count-btn">
                Preview Count
            </Button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={closeCreateDialog} className="rounded-full">Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-[#F26B33] hover:bg-[#D85A2A] text-white rounded-full" data-testid="save-audience-btn">
                {saving ? (editingSeg ? "Updating..." : "Creating...") : (editingSeg ? "Update Audience" : "Create Audience")}
            </Button>
        </div>
    </DialogContent>
</Dialog>
```

---

## 9. FE-2 — `frontend/src/pages/CustomersPage.jsx` (tag chip edits)

### 9.1 New imports (add to existing import block)
```jsx
import TagChip from "@/components/TagChip";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
```

### 9.2 New state variables (add near top of component)
```jsx
const [availableTags, setAvailableTags] = useState([]);
const [tagPopoverOpen, setTagPopoverOpen] = useState({});  // { [customerId]: bool }
const [bulkTagPopoverOpen, setBulkTagPopoverOpen] = useState(false);
const [bulkTagInput, setBulkTagInput] = useState("");

// Fetch tag catalog once on mount
useEffect(() => {
    api.get("/customers/tags").then(r => setAvailableTags(r.data?.tags || [])).catch(() => {});
}, [api]);
```

### 9.3 Tag action helpers (add near other handler functions)
```jsx
const handleAddTag = async (customerId, tag) => {
    try {
        await api.post(`/customers/${customerId}/tags`, { tags: [tag] });
        // Refresh customer in local list
        setCustomers(prev => prev.map(c => c.id === customerId
            ? { ...c, tags: [...(c.tags || []), tag].filter((v, i, a) => a.indexOf(v) === i) }
            : c
        ));
        if (!availableTags.includes(tag)) setAvailableTags(prev => [...prev, tag].sort());
        setTagPopoverOpen(p => ({ ...p, [customerId]: false }));
    } catch (e) {
        toast.error("Failed to add tag");
    }
};

const handleRemoveTag = async (customerId, tag) => {
    try {
        await api.delete(`/customers/${customerId}/tags/${encodeURIComponent(tag)}`);
        setCustomers(prev => prev.map(c => c.id === customerId
            ? { ...c, tags: (c.tags || []).filter(t => t !== tag) }
            : c
        ));
    } catch (e) {
        toast.error("Failed to remove tag");
    }
};

const handleBulkTag = async (tag) => {
    if (!tag.trim() || selectedCustomers.length === 0) return;
    try {
        await api.post("/customers/bulk-tag", { customer_ids: selectedCustomers, tag: tag.trim() });
        toast.success(`Tagged ${selectedCustomers.length} customers with "${tag.trim()}"`);
        setBulkTagPopoverOpen(false);
        setBulkTagInput("");
        // Refresh local state
        setCustomers(prev => prev.map(c =>
            selectedCustomers.includes(c.id)
                ? { ...c, tags: [...(c.tags || []), tag.trim()].filter((v, i, a) => a.indexOf(v) === i) }
                : c
        ));
        if (!availableTags.includes(tag.trim())) setAvailableTags(prev => [...prev, tag.trim()].sort());
    } catch (e) {
        toast.error(e.response?.data?.detail || "Failed to bulk tag");
    }
};
```

### 9.4 Add tag chips to each customer row card

Find the customer row rendering JSX (the part that shows tier badge, VIP badge, etc.) and add the tag chip section after the existing badges row. Exact location: after where `vip_flag` and `complaint_flag` badges are rendered, before the row action buttons.

```jsx
{/* CR-034: Tag chips */}
<div className="flex flex-wrap gap-1 mt-1.5 items-center">
    {(customer.tags || []).map(tag => (
        <TagChip
            key={tag}
            tag={tag}
            onRemove={() => handleRemoveTag(customer.id, tag)}
        />
    ))}
    <Popover open={!!tagPopoverOpen[customer.id]} onOpenChange={v => setTagPopoverOpen(p => ({ ...p, [customer.id]: v }))}>
        <PopoverTrigger asChild>
            <button className="px-2 py-0.5 border border-dashed border-gray-300 rounded-full text-[10px] text-gray-400 hover:border-[#F26B33] hover:text-[#F26B33] transition-colors">
                + tag
            </button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-1" align="start">
            <Command>
                <CommandInput placeholder="Search or create tag..." className="text-xs h-7" />
                <CommandList>
                    <CommandEmpty>
                        <button
                            className="w-full text-left px-2 py-1.5 text-xs text-[#F26B33] font-semibold hover:bg-orange-50 rounded"
                            onClick={() => {
                                const input = document.querySelector('[placeholder="Search or create tag..."]');
                                if (input?.value?.trim()) handleAddTag(customer.id, input.value.trim());
                            }}
                        >
                            + Create new tag
                        </button>
                    </CommandEmpty>
                    {availableTags.filter(t => !(customer.tags || []).includes(t)).map(t => (
                        <CommandItem key={t} onSelect={() => handleAddTag(customer.id, t)} className="text-xs cursor-pointer">
                            <TagChip tag={t} className="pointer-events-none" />
                        </CommandItem>
                    ))}
                </CommandList>
            </Command>
        </PopoverContent>
    </Popover>
</div>
```

### 9.5 Bulk-tag action in selection toolbar

Find the existing bulk-action toolbar (where "Delete Selected" or similar bulk action buttons appear) and add:

```jsx
{selectedCustomers.length > 0 && (
    <Popover open={bulkTagPopoverOpen} onOpenChange={setBulkTagPopoverOpen}>
        <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full text-xs h-7">
                Tag {selectedCustomers.length} selected...
            </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-3" align="start">
            <div className="text-xs font-semibold mb-2">Apply tag to {selectedCustomers.length} customers</div>
            <div className="flex flex-wrap gap-1 mb-2">
                {availableTags.map(t => (
                    <TagChip key={t} tag={t} onClick={() => handleBulkTag(t)} className="cursor-pointer" />
                ))}
            </div>
            <div className="flex gap-2 mt-2">
                <input
                    value={bulkTagInput}
                    onChange={e => setBulkTagInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleBulkTag(bulkTagInput)}
                    placeholder="Or type new tag..."
                    className="flex-1 border rounded px-2 py-1 text-xs outline-none focus:border-[#F26B33]"
                />
                <button onClick={() => handleBulkTag(bulkTagInput)} className="px-2 py-1 bg-[#F26B33] text-white rounded text-xs font-semibold">
                    Apply
                </button>
            </div>
        </PopoverContent>
    </Popover>
)}
```

---

## 10. VERIFICATION MATRIX (run after implementation)

| # | Check | How to verify | AC from CR-034 |
|---|---|---|---|
| V1 | BUG-A: birthday segment count is now 205, not 5907 | Create segment `{has_birthday_this_month: true}` → preview count | - |
| V2 | BUG-A: vip_flag segment works | Create segment `{vip_flag:"true"}` → preview → should be 46 | - |
| V3 | BUG-A: whatsapp_opt_in filter works | Create segment `{whatsapp_opt_in:"true"}` → preview → should be ~62 | - |
| V4 | All 14 existing filter dimensions still work | Create Gold tier segment → count matches live | R1 |
| V5 | Campaign audience resolution unchanged | Send test campaign to Gold tier segment | R2 |
| V6 | `GET /api/customers/tags` returns [] for new tenant | Auth as any user, call endpoint | AC4, AC7 |
| V7 | `POST /customers/{id}/tags` adds tag idempotently | Add "VIP" twice → only one entry in tags array | AC1 |
| V8 | `DELETE /customers/{id}/tags/VIP` removes only VIP | Add VIP + Regular → delete VIP → Regular stays | AC2 |
| V9 | `POST /customers/bulk-tag` with 3 IDs → 3 modified | Use 3 known customer IDs | AC3 |
| V10 | Tag filter in audience: `{tags:["VIP"]}` returns ~46 | Preview count after backfill | AC5 |
| V11 | Tag filter OR: `{tags:["VIP","Regular"]}` returns union | Preview count | AC5 |
| V12 | Tag filter AND: `{tags:["VIP","Regular"], tags_mode:"all"}` → smaller set | Preview count | AC5 |
| V13 | Segment count uses correct filter after backfill | Refresh count on any segment | AC6 |
| V14 | Tenant isolation: Tenant A tags not visible to Tenant B | Check with two test accounts | AC7 |
| V15 | Tag chip visible on CustomersPage rows | Open CustomersPage → see chips on tagged customers | AC9 |
| V16 | "+ tag" popover opens → type tag → adds inline | Click + tag on any customer row | AC9 |
| V17 | Bulk-tag action applies tag to selected customers | Select 3 → "Tag 3 selected..." → apply | AC3 |
| V18 | Backfill: 46 vip_flag=True customers have tags=["VIP"] | After running migration script, check count | V2 above |
| V19 | Accordion sections open/close correctly | Open dialog → click section headers | - |
| V20 | Active filter chips display above accordion | Set 2+ filters → see chips row | - |

---

## 11. IMPLEMENTATION ORDER (single session recommended)

```
Step 1  BE-2  schemas.py — add tags field to 3 models              (3 edits, 5 min)
Step 2  BE-1  helpers.py — replace build_customer_query async       (1 edit, 20 min)
Step 3  BE-4  campaigns.py — await build_customer_query             (1 edit, 2 min)
Step 4  BE-3  customers.py — await call site + 5 tag endpoints      (2 edits, 20 min)
Step 5  BE-5  migration script — new file                           (new file, 5 min)
              → restart backend → verify /api/health
              → run migration script
Step 6  FE-3  TagChip.jsx — new component                           (new file, 10 min)
Step 7  FE-1  AudiencesPage.jsx — new dialog + accordion            (1 large edit, 30 min)
Step 8  FE-2  CustomersPage.jsx — tag chips + bulk action           (3 targeted edits, 25 min)
              → verify frontend compiles
Step 9        Run V1-V20 verification matrix
Step 10       Update CR_STATUS_DASHBOARD.md → CR-033 + CR-034 → 🟡 In flight
```

**Estimated total: ~2 hours**

---

## 12. PLANNING OUTPUT BLOCK

```
Planning complete: CR-033 + CR-034
Stage: Detailed Frozen Implementation Spec
Code reality confirmed: PARTIAL/NONE (both CRs — no existing tag code, P0 filters only in list_customers)
Risk: LOW (all items)
Key architectural note: build_customer_query must become async (P2 cross-joins need DB); all 7 callers are already async — only 2 need await keyword update (customers.py + campaigns.py; helpers.py resolve_audience already updated in spec)
Files WILL change: 8 files (5 backend edits/new + 3 frontend edits/new)
Files WILL NOT touch: all hotspot files (coupon, pos, whatsapp, loyalty, invoice, analytics, auth)
Owner decisions: ALL 12 LOCKED
Doc: memory/crm/crm_roi_sprint/planning/CR_033_CR_034_IMPL_PLAN.md
Next: IMPLEMENTATION
```

---

*End of CR-033 + CR-034 Frozen Implementation Spec*
