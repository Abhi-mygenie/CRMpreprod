# CRM Preprod Application - PRD

## Original Problem Statement
1. Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git
2. Use remote MongoDB: mongodb://mygenie_admin:***@52.66.232.149:27017/mygenie
3. Add Item Analytics Dashboard to track item performance and customer repeat behavior

## Architecture
- **Frontend**: React 19 with Tailwind CSS, Radix UI components
- **Backend**: FastAPI with Motor (async MongoDB driver)
- **Database**: Remote MongoDB (52.66.232.149:27017/mygenie)

## What's Been Implemented

### Session 1 (2026-03-10)
- ✅ Cloned repository from GitHub
- ✅ Configured remote MongoDB connection
- ✅ Installed all dependencies
- ✅ Services running via supervisor

### Session 2 (2026-03-10) - Item Analytics Dashboard
- ✅ Created `/app/backend/routers/analytics.py` with item-performance endpoint
- ✅ Created `/app/frontend/src/pages/ItemAnalyticsPage.jsx`
- ✅ Added route `/item-analytics` to App.js
- ✅ Added "Item Analytics" to sidebar navigation

#### Item Analytics Features:
- Summary cards: Total Items, Avg Repeat Rate, High Performers, Categories
- Filters: Time Period (7d/30d/90d/all), Category, Search
- Sortable table columns: Item, Total Orders, Repeat Orders, Repeat Rate (%), Unique Customers, Return Visits
- Color-coded repeat rate badges (green ≥50%, blue ≥40%, yellow ≥30%)
- Export to CSV functionality
- Mobile responsive card view

## Core Features (from codebase)
- Customer Management
- Segments/Customer Segmentation
- **Item Analytics** (NEW)
- Templates Management
- QR Code Generation
- Feedback System
- Coupons Management
- Loyalty Program Settings
- WhatsApp Automation
- Message Status Tracking
- POS Integration

## User Personas
- Restaurant Owners (manage loyalty programs, analyze item performance)
- Restaurant Staff (process transactions)
- Customers (via registration pages)

## Prioritized Backlog
- P0: Application running with Item Analytics ✅
- P1: Additional analytics (see Analytics Roadmap below)
- P2: AI-powered recommendations based on item performance

---

## Analytics Roadmap (Planned Features)

### Customer Analytics
| # | Feature | Description | Priority | Status |
|---|---------|-------------|----------|--------|
| 1 | Customer Lifecycle Dashboard | New vs Returning vs Churned customers over time | P1 | Planned |
| 2 | Cohort Analysis | Retention rates by signup month | P1 | Planned |
| 3 | RFM Segmentation | Recency, Frequency, Monetary scoring (VIPs, At-Risk, Lost) | P1 | Planned |
| 4 | Churn Prediction | Customers likely to churn based on declining visit frequency | P2 | Planned |

### Revenue Analytics
| # | Feature | Description | Priority | Status |
|---|---------|-------------|----------|--------|
| 5 | Revenue by Customer Segment | Which tier (Bronze/Silver/Gold/Platinum) drives most revenue | P1 | Planned |
| 6 | Average Order Value Trends | AOV over time, by day of week, by customer type | P1 | Planned |
| 7 | Basket Analysis | Items frequently bought together (cross-sell opportunities) | P2 | Planned |

### Loyalty & Engagement Analytics
| # | Feature | Description | Priority | Status |
|---|---------|-------------|----------|--------|
| 8 | Points Economy Dashboard | Points issued vs redeemed, liability, redemption rate | P1 | Planned |
| 9 | Coupon Performance | Which coupons drive conversions, ROI per coupon | P1 | Planned |
| 10 | Feedback Sentiment Analysis | Rating trends, common complaint keywords | P2 | Planned |

### Operational Analytics
| # | Feature | Description | Priority | Status |
|---|---------|-------------|----------|--------|
| 11 | Peak Hours Heatmap | Orders by hour/day to optimize staffing | P1 | Planned |
| 12 | Channel Performance | Dine-in vs Takeaway vs Delivery revenue split | P1 | Planned |
| 13 | Lead Source ROI | Which acquisition channels bring highest LTV customers | P2 | Planned |

### Predictive/AI Analytics
| # | Feature | Description | Priority | Status |
|---|---------|-------------|----------|--------|
| 14 | Next Best Offer | Personalized recommendations per customer | P3 | Planned |
| 15 | Demand Forecasting | Predict item demand for inventory planning | P3 | Planned |

---

## Next Tasks
- Test category filtering
- Add drill-down to see which customers ordered specific items
- Trend sparklines for items over time
- Pick next analytics feature from roadmap
