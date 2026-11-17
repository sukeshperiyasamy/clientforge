# Phase 2 repository audit

Reviewed 17 November 2026. Baseline: `npm test` passed 35 tests, zero failures, including real Chromium persistence and responsive owner UI. External API checks use mocks; no authenticated publication was performed.

## Existing implementation

React 19 and Express 5 use TypeScript and Zod. SQLite WAL stores JSON records in `records(kind,id,body)` with a composite primary key, a `dedup(key,job_id)` table and schema version 1. There is no separate SQL migration directory. Store transactions support nested savepoints.

Projects, media, factual Antigravity drafts, version-bound approval, cadence, scheduled jobs, provider reconciliation, lead CRM and local portfolio inquiry capture work locally. Antigravity runs with a minimal environment and denied command, file, URL and MCP tools. The independent Chromium broker owns an exclusive persistent profile; Windows launchers and startup task preserve the local security boundary.

Postiz uses `/integrations`, media upload, publication and reconciliation APIs. Its account IDs already support selecting different destinations in the scheduling dialog. Seven platform families have enabled publishing adapters; single-attachment and format restrictions remain. Submitted and confirmed publication are distinct. Unknown submission outcomes are never blindly resent.

The 43-entry connector registry has 30 manual entries. GitHub verifies identity only; YouTube verifies channels using read-only OAuth; Buffer verifies its workspace using a key. Existing connections and token keys are indexed by platform, so independent GitHub/YouTube/Buffer authorizations need an additional migration. Postiz credentials currently describe one publishing workspace.

## Routes

Existing routes are defined in `server/app.ts` and `server/connection-routes.ts`:

- Authentication: status, setup, login, logout, session; GitHub/YouTube OAuth start and callback.
- Studio: state, settings, projects CRUD and example, asset upload/read, generation, cadence rule create/update, post create/edit/approve/validate.
- Publishing: job scheduling/cancel/reconcile, account sync.
- Leads: create/update, export, public profile and public inquiry.
- Connections: list, connect, open, test, prepare, mode, disconnect, Buffer key.
- Browser: open/close/takeover, tab focus/close/screenshot and screenshot download.
- Operations: notification read, emergency stop and reset.

## Missing and partial functionality

Platform cards aggregate multiple provider accounts. Local disabling can be overwritten by account sync. Worker checks provider availability but needs per-account local permission rechecks after network awaits. Independent OAuth account slots, multiple publishing workspaces, campaign account assignments, production public hosting, opportunity discovery, proposal revisions, email, booking, unified inbox, agent permissions UI and conversion reporting remain incomplete or absent.

## Credentials and security boundaries

Configuration loads `.env` without printing secrets. Required placeholders are POSTIZ_URL and POSTIZ_API_KEY, GITHUB_CLIENT_ID/SECRET, GOOGLE_CLIENT_ID/SECRET and local authenticated Antigravity. Publishing requires PUBLISHING_ENABLED plus owner unpause and approved content. Gmail/Outlook/calendar credentials are not configured by this stage. Real account consent and external permission changes require owner action.

Owner sessions, CSRF, loopback/host/origin checks, DPAPI-backed AES-GCM tokens, redaction, exclusive browser ownership and emergency controls must be preserved. Cloud deployment needs separate public and private routes; simply exposing this loopback app is inappropriate. Windows DPAPI keys are not portable cloud secrets. Browser profile and provider volume backups require separate protection. No security-critical runtime setting will be changed by this stage.

## Incremental migration plan

Retain SQLite and the existing single worker. Add versioned account-policy records keyed by existing provider account IDs, with local disabled state, timezone, workspace, default selection, permissions and health timestamps. Keep legacy connections and encrypted tokens intact. Existing jobs retain accountId. Cancel only scheduled local jobs when an account is disabled and guard execution again immediately before publication. Keep submitted jobs for reconciliation. Add isolated tests for sync, restart, account-specific cancellation and in-flight disable races.

Independent OAuth account slots and multiple Postiz workspaces require a later connection-ID/token namespace migration with callback binding and workspace-specific reconciliation; do not claim these capabilities from the first policy migration. Research current official API documentation before enabling new external actions.
