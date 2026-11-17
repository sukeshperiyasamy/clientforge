# Phase 2 implementation record

Updated 17 November 2026. This increment completes the audit and adds per-account Postiz controls. Stage 2.2 is **partial**: independent native OAuth accounts and multiple publishing workspaces remain to implement. Phase 3 acquisition features are not claimed complete.

## Completed functionality

- Independent local policy for each existing Postiz account ID, including workspace label, timezone, enabled state, publication permission, approval/manual mode, daily limit and default selection.
- Connections page section lists synced accounts, tests provider availability and edits account settings.
- Existing scheduling dialog respects default account selection and excludes locally disabled/manual accounts.
- Account disable cancels only its scheduled local jobs, retaining submitted records for provider reconciliation. A provider resync cannot overwrite local policy.
- Scheduling and worker execution enforce policy, including a final check after asynchronous preparation. Existing platform limits, approval hashes and emergency stop remain active.
- Account views expose provider verification timestamp, health, limited capability metadata, unknown provider-managed token expiry and local activity records. They contain no credentials.

Workspace is currently an organizational label, not a tenant authorization boundary. Timezone is stored for account preferences; the existing scheduling dialog still supplies the job timestamp. Actual provider scopes and token expiry are not guessed.

## Modified and new files

- `server/account-policies.ts`: validation, policy storage, sync, views and guards.
- `server/store.ts`: additive account-policy migration.
- `server/app.ts`: account APIs and effective account state.
- `server/domain.ts`: scheduling guard.
- `server/worker.ts`: per-account limit and final permission checks.
- `shared/model.ts`: optional default-account metadata.
- `src/AccountConnections.tsx`: independent account controls.
- `src/ConnectionsPage.tsx`: account section integration.
- `src/main.tsx`: scheduling default selection.
- `tests/account-policies.test.ts`, `tests/system.test.ts`: isolation, restart, API authorization and network-race coverage.
- `docs/phase2-audit.md`: baseline architecture and migration plan.

## New API routes

All routes require existing owner session and CSRF handling:

- `GET /api/account-connections`: account policy, provider health and local activity.
- `PUT /api/account-connections/:id`: validated full policy replacement; invalid defaults rejected atomically.
- `POST /api/account-connections/:id/test`: refresh provider accounts and return the selected account status.

Existing `POST /api/accounts/sync` retains its response contract. Existing jobs still use accountId; no job or token IDs are rewritten.

## Database migration

On Store initialization, `migrations/account-policies-v1` is applied once transactionally. Existing accounts receive policy records under `account_policies`; subsequent accounts use validated defaults until edited. Existing records, encrypted tokens, dedup keys and schema version remain intact. SQLite tables are unchanged. The marker tracks this additive record migration separately from physical schema version 1. No destructive migration is performed. The running owner process was not restarted or its active database rewritten manually in this increment; migration runs on its next normal initialization.

## Verified results

- Baseline `npm test`: 35 passed, zero failed.
- Latest `npm test`: 39 passed, zero failed.
- `npm run build`: passed TypeScript and Vite production build. Vite emitted dependency annotation warnings only.
- Real-browser regression: owner login, 43 connector cards, platform search, setup dialogs and mobile layout pass.
- New tests: separate-account cancellation; preservation of submitted jobs; policies survive provider sync and database reopen; unique defaults; invalid timezone/limit/default rejection; missing provider accounts blocked; owner/CSRF enforcement; account disable during network preparation prevents submission.
- Provider responses in new integration tests are mocked. Authenticated publication is **not tested**. Multi-account UI interaction testing with populated synthetic accounts remains to add.

## Owner setup

Use existing Postiz setup from `browser-connections.md`: configure POSTIZ_URL/POSTIZ_API_KEY locally, connect eligible channels inside Postiz, then use Connections -> Independent publishing accounts -> Sync accounts from Postiz. No additional external scopes are requested by this increment. Keep publishing disabled until a separately approved live test. Review each account workspace, timezone, default and local publishing permission. Disabling here does not revoke Postiz authorization or retract submitted posts; manage those in Postiz.

GitHub and YouTube still require their existing developer application credentials. Buffer remains account verification only. Never enter website passwords or tokens into AI prompts.

## Remaining priorities

1. Independent connection IDs and encrypted token namespaces for multiple GitHub, YouTube and Buffer accounts; OAuth callback binding to the exact slot; account-specific reconnect/remove and periodic verification.
2. Multiple provider workspaces, workspace-scoped provider clients and reconciliation; migrate legacy IDs safely with collision tests.
3. Campaign-to-account assignment, richer calendar controls and publishing windows.
4. Verify current official API contracts before expanding publishing; owner-approved authenticated tests remain required.
5. Public portfolio deployment preparation without public exposure; expanded inquiry capture and CRM association.
6. Permitted opportunity import/discovery, explained scoring and reviewed proposal revisions.
7. Business email, unified inbox and booking with explicit approval boundaries.
8. Restricted agent tools, activity control center and collected conversion analytics.

Public deployment, client messages, bids, spending, external permission changes and destructive operations remain gated by owner approval. This work has not sent messages, bids or posts or exposed local services.
