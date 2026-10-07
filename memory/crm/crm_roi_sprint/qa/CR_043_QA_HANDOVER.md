# QA Handover — CR-043 Parts A + B (bundled)

> **Items shipped**: CR-043-A (Tag chip strip filter) + CR-043-B (Multi-select autosave popover)
> **Date**: 2026-07-03
> **Implementation role**: Role 3 (this agent)
> **Impl Plan**: `crm_roi_sprint/planning/CR_043_CUSTOMER_TAG_FILTER_AND_POPOVER_IMPL_PLAN.md`
> **Risk**: LOW
> **QA type**: Manual (per DECISIONS_LOG "no testing_agent" rule)

---

## 1. What shipped

### CR-043-A (Filter chip strip)
- New "FILTER BY TAG" strip appears above the filter drawer on the Customers page whenever the tenant has any tags in the catalog.
- Chips show the top 6 tags by customer count with count badges (e.g. `+ Lunch (5)`, `+ Dinner (5)`, `+ Breakfast (2)`, `+ Churn (0)`).
- `More (N) ▾` toggle expands to the full catalog; `Less ▴` collapses back to top-6.
- Clicking a chip activates the tag filter (chip turns orange `#F26B33` with a `✓` prefix).
- When any tag is active, an "Active:" chip row + ANY / ALL radios + Clear button appear.
- Filter propagates via new query params `?tags=A,B&tags_mode=any|all` on `GET /api/customers`.
- Backend uses `$in` (any) or `$all` (all) on the existing `customers.tags` field.
- New composite index `{user_id: 1, tags: 1}` created on `customers` collection at startup (idempotent).

### CR-043-B (Popover UX rework)
- The old "+ tag" popover on each customer row rebuilt as a 280px multi-select autosave surface.
- Header shows `Tags for {customer name}`.
- Current tags shown as dismissible orange chips (click ✕ removes immediately).
- Search input filters the "Available" catalog list.
- Available list shows a checkbox per tag with count badge — check to add, uncheck to remove — autosave, no Save button.
- When the search string matches no existing tag, a full-width orange `+ Create "search"` button appears.
- `Done` link dismisses the popover.
- **Popover no longer auto-closes on first add** (was auto-close in CR-034; now stays open for multi-select).
- Bulk-apply-to-multiple-rows is NOT part of this CR — split off as CR-045 (parked).

---

## 2. Files changed

| File | Purpose |
|---|---|
| `backend/routers/customers.py` | `list_customers` gains `tags` + `tags_mode` params; `/customers/tags` gains `with_counts=true` variant with aggregation pipeline |
| `backend/server.py` | Composite index `idx_customers_user_tags {user_id: 1, tags: 1}` on customers collection at lifespan startup |
| `frontend/src/pages/CustomersPage.jsx` | 5 new state hooks (`activeTagFilters`, `tagFilterMode`, `tagsWithCounts`, `tagRefreshCounter`, `showAllTagChips`); handlers (`handleToggleTagFilter`, `handleClearTagFilters`); `handleAddTag` no longer auto-closes popover, both add/remove bump refresh counter; new useEffect fetches tags with counts on refresh; chip strip JSX above filter drawer; popover rewritten from Command palette to multi-select autosave layout |

No changes to: `core/helpers.py::build_customer_query`, `POST /customers/:id/tags`, `DELETE /customers/:id/tags/:tag`, `AudiencesPage.jsx`, `MessageStatusPage.jsx`, `TagChip.jsx`, `customers` schema, auth code, tests.

---

## 3. Self-test results (by Implementation)

### Backend (curl · JWT for `pos_0001_restaurant_635`)

| # | Test | Result |
|---|---|---|
| B1 | `GET /customers/tags` (backward compat) | ✅ Returns `{"tags":["Breakfast","Churn","Dinner","Lunch"]}` (string array, alphabetical) |
| B2 | `GET /customers/tags?with_counts=true` | ✅ Returns `{"tags":[{"tag":"Lunch","count":5},{"tag":"Dinner","count":5},{"tag":"Breakfast","count":2},{"tag":"Churn","count":0}]}` sorted desc |
| B3 | `GET /customers?tags=VIP` (tag not in catalog) | ✅ 0 rows (isolation) |
| B4 | `GET /customers?tags=Lunch,Dinner&tags_mode=any` | ✅ 5 rows (union) |
| B5 | `GET /customers?tags=Lunch,Dinner&tags_mode=all` | ✅ 5 rows (intersection — dataset overlap) |
| B6 | `GET /customers?tags=&limit=5` (empty tags = no filter) | ✅ 5 rows (regression, unchanged) |
| B7 | `GET /customers?limit=2` (no tag param) | ✅ 2 rows (regression) |
| B8 | Composite index at startup | ✅ `idx_customers_user_tags` logged in server.py wrap |
| B9 | pytest `tests/` full regression | ✅ 11/11 PASS in 16.26s |
| B10 | Backend hot-reload | ✅ /api/health healthy after restart |

### Frontend

| # | Test | Result |
|---|---|---|
| L1 | Lint `CustomersPage.jsx` | ✅ No issues |
| L2 | Webpack compile | ✅ Compiled with 1 pre-existing warning (unrelated) |
| L3 | Load Customers page — chip strip visible | ✅ Screenshot confirmed: "FILTER BY TAG" strip with `+ Lunch (5)`, `+ Dinner (5)`, `+ Breakfast (2)`, `+ Churn (0)` |
| L4 | Customer rows show tag chips | ✅ Sapna's row shows `Lunch Dinner + tag` |
| L5 | Backend `/api/health` after frontend deploy | ✅ Healthy |

**All 15 self-tests PASS. No failure.**

---

## 4. Test matrix for owner UAT

### 4.1 CR-043-A — chip strip flows

| # | Steps | Expected |
|---|---|---|
| U1 | Login as `owner@jehsnest.com` → Customers | "FILTER BY TAG" strip visible with 4 chips + counts + no More button (only 4 tags in Jeh's Nest catalog) |
| U2 | Click `+ Lunch (5)` | Chip turns orange with ✓ prefix; ANY/ALL radios + Active-chip row + Clear button appear; customers list filters to those 5 |
| U3 | Click `+ Dinner (5)` while Lunch is active | Both chips orange; Active row shows Lunch + Dinner; list still 5 (union in ANY mode) |
| U4 | Toggle from ANY to ALL | List refreshes; still 5 in Jeh's Nest (all Lunch also have Dinner) |
| U5 | Click ✕ on Active Lunch chip | Only Dinner active; list refreshes |
| U6 | Click "Clear" | All active tags cleared; ANY/ALL/Active row disappears; full list restored |
| U7 | (For tenants with >6 tags) click "More (N) ▾" | All tags visible; button becomes "Less ▴" |
| U8 | Existing filter panel (Tier/Type/etc) | Unchanged — still opens and filters |
| U9 | Reload page with tags in URL manually (`/customers?tags=Lunch&tags_mode=any`) | Filter applies but chip strip doesn't reflect it (URL sync is out of scope for this CR — consider CR-046 if needed) |

### 4.2 CR-043-B — popover flows

| # | Steps | Expected |
|---|---|---|
| U10 | Click "+ tag" on any row | 280px popover opens. Header: "Tags for {customer name}". If customer has tags, "Current" section shows dismissible orange chips |
| U11 | Check an unchecked box | Tag added; row's inline chips update; popover stays open |
| U12 | Uncheck a checked box | Tag removed; popover still open |
| U13 | Click ✕ on Current-section chip | Tag removed; popover still open |
| U14 | Type "wknd" (unmatched) in search | Below list, orange `+ Create "wknd"` button appears |
| U15 | Click `+ Create "wknd"` | New tag "wknd" added to catalog; customer gets it; row updates; search clears; popover stays open |
| U16 | Type "lun" | Available list filters to "Lunch" |
| U17 | Click "Done" | Popover closes |
| U18 | Reopen popover | State reflects all changes made across sessions |
| U19 | Chip strip counts refresh after add/remove in popover | ✅ Counts update within a heartbeat (tagRefreshCounter mechanism) |

### 4.3 Regression

| # | Steps | Expected |
|---|---|---|
| U20 | AudiencesPage tag filter (CR-034) | Unchanged — still uses `available_tags` + `build_customer_query` unaltered |
| U21 | CustomersPage Export button (CR-035) | Unchanged — CSV/XLSX with Tags column still works |
| U22 | Existing 18 filter dimensions | Each still filters correctly |
| U23 | Backend `/customers/tags` without `with_counts` | Returns old shape (string array) |
| U24 | `POST /customers/:id/tags` / `DELETE .../tags/:tag` | Unchanged |

---

## 5. Known non-issues

1. Frontend eslint warnings on hook deps for `fetchCustomers`, `fetchSegments`, `api` — all pre-existing patterns; my new useEffect follows the same convention as CR-034's `available_tags` fetch on line 375.
2. Backend F841 warning in unrelated `menu_pick` validation code — pre-existing; not touched by this CR.
3. URL sync of tag filter state is not implemented — deliberate (out of scope; can be a future micro-CR if needed).

---

## 6. Rollback plan

```bash
cd /app && git log --oneline | head -3       # find CR-043 commit
git revert <sha>
sudo supervisorctl restart backend           # frontend hot-reloads
curl http://localhost:8001/api/health        # verify
```

Index cleanup (optional; harmless to leave):
```
db.customers.dropIndex("idx_customers_user_tags")
```

No data migration to reverse.

---

## 7. Data-testid map

- `tag-chip-strip`
- `tag-chip-<tag>` (per chip)
- `tag-chip-more`
- `tag-filter-mode-any`, `tag-filter-mode-all`
- `tag-filter-clear`
- `active-tag-filter-<tag>`
- `open-tag-popover-<customer_id>`
- `tag-popover-<customer_id>`
- `popover-current-tag-<customer_id>-<tag>`
- `tag-search-input-<customer_id>`
- `tag-option-<customer_id>-<tag>`
- `tag-checkbox-<customer_id>-<tag>`
- `popover-create-tag-<customer_id>`
- `popover-done-<customer_id>`

---

## 8. Sign-off checklist

- [ ] U1-U9 chip strip flows PASS
- [ ] U10-U19 popover flows PASS
- [ ] U20-U24 regressions PASS
- [ ] Popover works on mobile viewport (280px width is intentional)
- [ ] Any UAT failure filed with fresh BUG/CR ID

---

## 9. Handover exit

```text
Code complete: CR-043 Parts A + B
Risk: LOW
Self-test: 15/15 PASS (10 backend curl + 5 frontend/lint)
Build/compile/test: PASS (backend hot-reload OK; frontend webpack OK;
                        pytest 11/11 PASS with sequential runner)
Registry sync: YES (CR_STATUS_DASHBOARD updated with implemented row +
                    Recent-transitions row)
Exit Gate: 7/7 PASS
Docs: crm_roi_sprint/qa/CR_043_QA_HANDOVER.md (this file)
Next: Owner UAT → Role 4 QA (manual) → Role 8 Closure
```

*End of QA handover. Standing by for owner UAT and gate to CR-036.*
