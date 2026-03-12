# MyGenie CRM - Product Requirements Document

## Original Problem Statement
1. Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git
2. Use MongoDB: `mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie`

## Project Overview
MyGenie CRM is a customer relationship management application with loyalty program features.

## Tech Stack
- **Frontend**: React 19, TailwindCSS, Radix UI components
- **Backend**: FastAPI (Python)
- **Database**: MongoDB (external: 52.66.232.149)

## What's Been Implemented (March 12, 2026)
- ✅ Cloned repository from GitHub
- ✅ Updated MongoDB connection to external database
- ✅ Installed backend dependencies (Python)
- ✅ Installed frontend dependencies (yarn)
- ✅ Services running and healthy

## Architecture
```
/app/
├── backend/           # FastAPI backend
│   ├── core/          # Auth, database, scheduler, helpers
│   ├── models/        # Pydantic schemas
│   ├── routers/       # API routes (auth, customers, analytics, etc.)
│   └── services/      # Business logic
├── frontend/          # React frontend
│   └── src/
│       ├── components/
│       ├── contexts/
│       ├── pages/
│       └── hooks/
```

## Key Features
- User authentication
- Customer management
- Loyalty points system
- Coupons/Wallet management
- Analytics dashboard
- WhatsApp integration
- POS integration
- Feedback system

## Access URLs
- **Frontend**: https://crm-staging-6.preview.emergentagent.com
- **Backend API**: https://crm-staging-6.preview.emergentagent.com/api

## Status: RUNNING ✅
