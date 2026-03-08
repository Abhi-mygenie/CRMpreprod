# CRM V1 Project - PRD

## Original Problem Statement
Pull https://github.com/Abhi-mygenie/CRMV1.git and build this project, import DB data, list users.

## Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend**: React with Tailwind CSS on port 3000
- **Database**: MongoDB (local instance)

## What's Been Implemented
- [x] Cloned CRM repository from GitHub
- [x] Set up environment files (.env for backend and frontend)
- [x] Installed all dependencies (Python + Node.js)
- [x] Imported 15 database collections (4,406 documents)
- [x] Demo Login for testing (demo@mygenie.com / demo123)
- [x] Dashboard with comprehensive metrics grid
- [x] Customer management with filters, segments, add/edit
- [x] Data sync with transaction histories (points, wallet, coupons)
- [x] Filter drawer redesigned as compact slide-up modal
- [x] Filter drawer with Basic & Advanced sections
- [x] Revert customer validation (block if orders exist)
- [x] Dashboard refresh after migration
- [x] Compact filter chips with "Most Loyal" + "Inactive 30d"
- [x] Filter drawer scroll fix
- [x] "Feedback Given" filter
- [x] "+ Add" button on Segments page
- [x] Segment customer count fix with filter tags
- [x] View/Edit/Delete buttons next to segment name
- [x] Delete segment with confirmation dialog
- [x] "Save Segment" button + redirect to Segments tab

## Refactoring (Mar 7, 2026)

### Backend - feedback.py → services/
**Before**: 469 lines monolithic file with analytics + feedback
**After**: Clean separation into services:
- `/services/analytics_service.py` - Dashboard statistics (11 functions)
- `/services/feedback_service.py` - Feedback CRUD operations (3 functions)
- `/routers/feedback.py` - Thin route handlers (~140 lines)

### Frontend - CustomersPage.jsx → components/customers/
**Before**: 2312 lines monolithic component
**After**: Extracted reusable components:
- `FilterDrawer.jsx` - Slide-down filter modal
- `CustomerCard.jsx` - Individual customer display
- `SortChips.jsx` - Quick filter/sort chips
- `SegmentStatsBar.jsx` - Tier breakdown display

## Core Features
- User authentication (JWT + Demo Login)
- Customer management with QR codes
- Points/loyalty system
- Digital wallet
- Coupons management
- Feedback system
- WhatsApp integration
- POS integration

## Database Collections
- users (3), customers (85), orders (794), order_items (2,560)
- points_transactions (826), wallet_transactions (61)
- automation_rules (22), whatsapp_templates (23)
- segments (4), loyalty_settings (3), coupons (3), feedback (20)

## Key API Endpoints
- POST /api/auth/demo-login
- GET /api/analytics/dashboard
- GET /api/customers
- POST /api/segments
- POST /api/mygenie/sync-customers
- POST /api/mygenie/sync-orders

## Backlog (Completed)
- ~~P1: Add `+ Add` button to Segments page/tab header~~ ✅
- ~~Refactor CustomersPage.jsx into smaller components~~ ✅
- ~~Refactor feedback.py into smaller service modules~~ ✅

## Future Enhancements
- Import new components into CustomersPage.jsx (optional optimization)
- Add unit tests for service modules
- Performance optimization with async parallel queries
