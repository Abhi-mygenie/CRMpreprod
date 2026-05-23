# MyGenie CRM - PRD & Project Status

## Original Problem Statement
- Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git from `23-may` branch
- Use external MongoDB: `mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie`
- Build as-is without modifications

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Radix UI + shadcn/ui (via Craco/CRA)
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: External MongoDB at `52.66.232.149:27017/mygenie`
- **Auth**: JWT-based authentication with MyGenie API integration

## What's Been Implemented (2026-05-23)
- Cloned full codebase from `23-may` branch
- Configured backend `.env` with external MongoDB connection
- Installed all backend Python dependencies
- Installed all frontend Node.js dependencies via yarn
- Both services running successfully via supervisor
- Backend API health check passing
- Frontend login page rendering correctly

## Core Features (from codebase)
- User authentication (login, register, demo login, forgot password)
- Customer management (list, detail, segments, QR codes)
- Loyalty points system
- Wallet functionality
- Coupons management
- Feedback collection & analytics
- WhatsApp automation & templates
- POS integration
- Data migration tools
- Item analytics & customer lifecycle tracking
- Message status tracking

## Backlog / Next Tasks
- No modifications requested — built as-is per user instructions
- Potential: Add more env vars for WhatsApp/SMS integrations if needed
- Potential: Set up MYGENIE_API_URL if connecting to different environments
