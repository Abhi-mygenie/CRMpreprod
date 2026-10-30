# MyGenie CRM - Preprod Deployment

## Original Problem Statement
Deploy the existing React frontend repo (https://github.com/Abhi-mygenie/CRMpreprod.git, main branch) directly into `/app` and run it as-is, with no code edits.

## Architecture
- **Frontend**: React 19 + CRACO + Tailwind + Shadcn/UI (port 3000)
- **Backend**: FastAPI with Motor (MongoDB async driver), APScheduler (port 8001)
- **Database**: MongoDB (external at 52.66.232.149 — requires real MONGO_URL secret)
- **External APIs**: MyGenie preprod API, AuthKey.io, Meta Graph API, AWS S3

## What's Been Implemented (2026-10-30)
- Cloned CRMpreprod repo (main branch) into /app
- Deployed frontend and backend from repo as-is (no code edits)
- Installed all frontend (yarn) and backend (pip) dependencies
- Set up .env files with non-secret values; secret placeholders set for MONGO_URL, JWT_SECRET, AWS keys
- Memory directory synced from repo (all handover docs, architecture docs, PRDs)
- Data directory synced from repo

## Pending / Secrets to Add
- **MONGO_URL**: Real connection string with password for external MongoDB
- **JWT_SECRET**: Real JWT signing secret
- **AWS_ACCESS_KEY_ID**: Real AWS access key
- **AWS_SECRET_ACCESS_KEY**: Real AWS secret key
- **AUTHKEY_WEBHOOK_SECRET**: If needed

## Backlog
- P0: Add real secrets to make backend fully functional with external DB
- P1: Verify full login flow end-to-end after secrets are configured
- P2: Production deployment with real domain (crm.mygenie.online)
