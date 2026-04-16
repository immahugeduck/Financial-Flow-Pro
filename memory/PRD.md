# Product Requirements Document (PRD)

## Original Problem Statement
Build a fully functional money management system where I can connect my banks and accounts like Venmo Cash App chime PayPal OnePay Stripe and more. The goal is to track every transaction and organize it to manage cash. The best part will be the reports it creates on demand that can give you a pdf of customization prompts to report your financials.

## User Choices Captured
- Real bank/account connections in v1
- MVP providers first: Venmo, Cash App, Chime, PayPal
- Reports: cash flow + tax-style + monthly/quarterly (all)
- Report customization: both AI prompts and standard filters
- Authentication: email/password + Google login
- Integrations selected: Plaid + Gemini (user-owned API key), Google OAuth

## Architecture Decisions
- Frontend: React with route-based pages (`/dashboard`, `/connections`, `/transactions`, `/reports`)
- Backend: FastAPI with JWT auth and modular API endpoints under `/api`
- Database: MongoDB (Motor async driver) with string IDs to avoid ObjectId serialization leaks
- Integrations:
  - Plaid flow implemented (link token, public token exchange, sync endpoints)
  - Google OAuth start/callback flow implemented (credential-gated)
  - Gemini AI insights path implemented (credential-gated)
- Reporting: On-demand report generation + PDF export endpoint using ReportLab

## User Personas
1. Owner/Operator managing multi-account cash movement daily
2. Freelancer/Small business user who needs categorized transaction records
3. Finance-focused user who wants quick, exportable PDF financial snapshots

## Core Requirements (Static)
- Secure authentication (email/password + Google OAuth option)
- Connect and manage account providers (manual + Plaid-based real linking)
- Track all transactions with categorization and filtering
- Dashboard for balances, cash flow trends, and recent activity
- Generate customizable reports and export as PDF on demand
- UX must remain simple for non-technical users

## What’s Implemented (with Dates)
### 2026-04-10
- Built complete auth system: register/login/logout + protected routes + Google OAuth endpoints
- Implemented connections hub with provider status, manual account linking, Plaid link/sync APIs
- Implemented transaction management: manual transaction creation, filtering, and ledger table
- Implemented dashboard metrics and monthly cashflow chart
- Implemented report builder with standard filters + AI prompt input + report history
- Implemented PDF export endpoint and frontend download flow
- Added seed demo credentials and documented them in `/app/memory/test_credentials.md`
- Added comprehensive `data-testid` coverage across interactive and critical UI elements
- Activated user-provided Gemini API key and validated AI-powered custom insights in generated reports
- Added user-provided Plaid credentials, validated live link-token generation, and verified public-token exchange/account sync flow

### 2026-04-16
- Implemented Firebase Google popup authentication flow and connected it to backend session creation (`/api/auth/google-login`)
- Rebranded UI and report defaults from Aura Finance to Financial Flow (header, auth copy, report defaults, demo label)
- Enhanced Plaid management UX with config status badge, linked institutions list, per-item sync, and unlink controls
- Added Plaid sync resilience metadata (`transactions_pending`, `pending_reason`) and sync-item endpoint for targeted retries
- Added automatic frontend polling retries when institution transactions are still preparing
- Added dashboard AI Weekly Financial Health Score card with custom focus prompt, why-changed insights, and 3 action steps
- Added advisor backend APIs for weekly score analysis (`/api/advisor/weekly-review`) and on-demand PDF export (`/api/advisor/weekly-review/pdf`)
- Stabilized frontend runtime by removing duplicate Plaid SDK embedding conditions and chart sizing warnings during first render

## Prioritized Backlog
### P0 (Critical to complete fully live integrations)
- Add real `PLAID_CLIENT_ID` + `PLAID_SECRET` and validate live account linking end-to-end
- Add real `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` and validate full Google OAuth login
- Add real `GEMINI_API_KEY` + `GEMINI_MODEL` and validate AI insights generation in reports

### P1 (High-value improvements)
- Replace blocking external `requests` calls in async endpoints with async HTTP client
- Add advanced categorization rules and recurring transaction detection
- Add quarterly/tax-specific report templates and CSV export

### P2 (Future expansion)
- Add OnePay/Stripe adapters in provider layer
- Add collaboration roles (accountant/shared access)
- Add anomaly/spike alerts and budgeting goals

## Next Tasks List
1. Receive user-provided Gemini key/model and wire live AI response verification
2. Receive Plaid credentials and run live link + sync validation
3. Receive Google OAuth credentials and complete social login validation
4. Run post-credentials retest for all third-party flows and finalize production hardening
