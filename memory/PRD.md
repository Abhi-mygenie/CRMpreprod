# CRM Preprod - PRD

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git from 25-may branch, use external MongoDB (mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie), build as-is without running testing agent.

## Architecture
- **Frontend**: React (CRA + Craco) with Tailwind CSS, Radix UI, Recharts
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: External MongoDB at 52.66.232.149:27017, database: `mygenie`
- **Branch**: 25-may

## Tech Stack
- React 19, react-router-dom 7, Sonner toasts, Radix UI components
- FastAPI, Motor, APScheduler, bcrypt, PyJWT, python-jose
- MongoDB (external)

## Core Modules
- Auth (login/register/demo login)
- Customers management with segments
- Loyalty points & redemption
- Coupons (V1, V2 item-category, V3A time-window, V3B BOGO/BXGY, V3C every-nth)
- Feedback collection & analytics
- WhatsApp automation
- QR code generation
- Wallet
- Migration tools
- Item analytics
- Customer lifecycle tracking
- POS integration routers

## What's Been Implemented (2026-05-25)
- Cloned repo from 25-may branch
- Configured external MongoDB connection
- Installed all backend (pip) and frontend (yarn) dependencies
- Both services running and healthy
- Frontend renders login page correctly
- Backend API responds at /api/health

## Backlog / Next Tasks
- None specified by user — built as-is per request
