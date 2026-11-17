# Account integrations and first acquisition pipeline

Updated 17 November 2026. This increment extends the existing application and preserves its database, browser profile, approvals, local security and single-worker architecture.

## Verification status

Baseline: 39 tests passed before changes. The latest completed full run passed 48 tests with zero failures. TypeScript and Vite production build passed. Dependency annotation warnings are informational. Tests include actual Chromium UI and portfolio rendering, while external publishing, OAuth providers and proposal AI responses use synthetic fixtures. No authenticated public post, real client message, bid, deployment or DNS change occurred.

The complete acquisition path is verified locally with mocked publication and AI: project evidence -> generated content -> approval -> selected account -> scheduled job -> provider submission -> confirmed URL -> service landing page -> attributed inquiry -> CRM lead -> proposal -> editable revision -> owner review -> follow-up record. A real external account and owner approval are still required for live publication.

## Stage 1 independent native account slots

Implemented stable connection IDs for GitHub, YouTube and Buffer. Add slots under Connections -> Independent API connections. New slots use UUIDs; encrypted credentials use `tokens:<connection-id>` with the existing AES-GCM additional authenticated data binding. Original platform IDs and token ciphertext remain valid and unchanged.

OAuth retains the existing platform callback URLs. State records point to the exact connection slot, with session, browser binding, PKCE, revision and expiry checks. Only one active flow per platform is allowed to avoid shared callback-cookie interference. Wrong-provider callbacks, replay, revoked sessions and disconnect races cannot authorize another slot. Reconnecting a verified identity rejects a different provider account; add a slot instead. GitHub remains identity-only; YouTube remains read-only channel access. Buffer verifies organizations and does not publish directly.

Migration `native-connection-slots-v1` adds platform metadata to existing stored native connection records when the service initializes. Original encrypted records are retained without re-encryption or token-ID rewriting. A missing/invalid vault key remains an error. Independent disconnect is local for all native slots, including legacy IDs; provider-side revocation is left to the owner to avoid invalidating shared provider grants used by another slot. It does not erase browser cookies. Disabled slots remain as history rather than deleting records. No scopes are broadened.

## Stage 2 publishing workspaces

Connections -> Publishing workspaces accepts a name, Postiz API base URL and key. The key is encrypted as `workspace:<id>` and excluded from listing responses. New workspace accounts have IDs `<workspace-uuid>:<base64url-provider-id>`. Sync affects only that workspace. Sync rejects ID collisions with another workspace and retains local account policies.

New jobs snapshot workspaceId alongside accountId. Upload, publication and reconciliation use that workspace's client. Reconciliation checks both remote post ID and integration ID. Legacy accounts, policies, deduplication records and submitted/unknown jobs retain their existing IDs and use the original environment-configured client. Nothing is resubmitted during migration. The original environment workspace is not silently copied into a new workspace, which would risk duplicating account identities.

Local workspace disable cancels scheduled jobs for that workspace while retaining submitted history. Reconciliation for a disabled workspace requires re-enabling it; the application does not resend posts. Credential rotation UI and workspace deletion are not implemented. Enable and disable controls are available in the workspace UI; keys can be provisioned through the setup form. Multiple workspaces at the same upstream provider must represent authorizations you are entitled to use.

## Stage 3 campaign assignments

The `/acquisition` dashboard saves campaigns with service, audience, countries, account selection, project, frequency preference, timezone, destination, UTM identifier and mandatory review mode. A tracked-draft action copies a project post, appends the account-specific campaign link and resets approval. Review/edit/approve that version in Content studio, then schedule it from the campaign section. Account/project/platform checks remain enforced by the backend.

Different tracked drafts can be edited for each account. Existing duplicate prevention and approval invalidation remain active. Country selection describes the target audience; it does not perform paid geographic targeting. Frequency is a stored planning preference. The campaign form interprets publication time in the campaign timezone and rejects nonexistent or ambiguous daylight saving times. Existing Content cadence supports recurring draft generation; campaigns do not independently auto-publish recurring content or choose a global best time.

## Stage 4 separate public portfolio

`npm run start:public` starts a separate loopback HTTP server on port 3001 using the existing database. Open `http://localhost:3001`. It has a homepage, services overview, six service pages, portfolio, permission-filtered case studies, contact/quote form, privacy page, sitemap and robots file. It renders HTML on the server with escaped evidence and no third-party scripts. It has no admin, connector, OAuth, asset-vault or credential API routes.

Inquiries validate name/email/service/description and capture company, country, timezone, budget, deadline and UTM data. They create CRM leads and in-app owner notifications. Legacy CRM service categories remain unchanged; requestedService preserves the six-service distinction. Honeypot, body-size limits, per-client submission limits and same-origin checks are included. A one-hour HttpOnly attribution cookie preserves campaign parameters through browsing. Attribution is visitor-supplied marketing metadata, not verified identity or proof of a conversion source.

`PUBLIC_ORIGIN` must exactly match the visitor-facing origin, including port in development. Defaults are loopback-only. `PUBLIC_TRUST_PROXY` is unset by default; configure only behind a known proxy. The provided Docker/Caddy example trusts private proxy addresses because the portfolio port is not host-published. Do not publish that port directly with proxy trust enabled. Review privacy/contact/retention text and business claims before launch. Attachments, distributed spam limiting and malware scanning are not included.

Deployment preparation: `deployment/Dockerfile.public`, `deployment/compose.public.yml`, and `deployment/Caddyfile` prepare a non-root public service and HTTPS reverse proxy. They have not been started or live-tested. A VPS deployment uses a new persistent volume; it does not copy Windows credentials, browser data or local private records. Provision approved portfolio records and plan private owner access to that deployment's CRM before launch. In local development both processes use the same SQLite database. Cross-machine CRM synchronization is not implemented. Windows DPAPI keys must never be copied as a Linux credential solution. Do not upload `.env` or the entire local data directory to public hosting.

## Stage 5 proposal assistant

The Acquisition dashboard selects an inquiry or opportunity and permitted portfolio projects. Antigravity receives a minimal requirement summary and project evidence, not mailbox contents, credentials or the lead's email. The structured drafting helper reuses the existing restricted CLI process. It returns short/detailed text, scope, deliverables, pricing assumptions, questions and a follow-up draft. No send or bid action exists.

Proposal edits create immutable version records and reset approval. Approval checks current portfolio permission/evidence. Evidence changes during generation or emergency stop discard the result. Proposals remain linked to the original CRM lead or opportunity. AI text and estimates require owner review; grounding inputs does not guarantee the model never makes an unsupported statement. The automated test uses deterministic synthetic output, not a live CLI generation. A configured, authenticated Antigravity CLI is required for the real button.

## Stage 6 permitted opportunity ingestion

Implemented a typed source-adapter interface, manual URL/description import and owner-authorized pasted RSS/Atom export import. No arbitrary URL is fetched. Imports normalize URLs and strip common campaign parameters for duplicate detection, retain source attribution and create a review queue with save/reject controls. Feed imports are bounded to 100 entries/150 KB, reject DTD/entity declarations and roll back atomically on invalid entries. The XML parser is an explicit locked dependency.

The initial score is a provisional heuristic: unknown dimensions are neutral; matching permitted portfolio work and a detailed description increase relevance. Reasons expose uncertainty, including unknown budget and eligibility. It does not verify source legitimacy, geographic eligibility or opportunity freshness. Automated remote feed polling, approved marketplace API credentials and mailbox ingestion remain future adapters. No marketplace scraping, automatic bidding or community posting is implemented.

## Follow-up operation

Lead-linked reminders persist in SQLite. The existing worker raises an in-app notification when due and marks a reminder notified. Emergency stop blocks worker processing. No email or message is sent. Closing the dashboard does not stop the worker; the computer and required services must still be running.

## Routes added

All `/api` routes retain the owner-session and CSRF boundary:

- `POST /api/connection-slots`, `POST /api/connection-slots/:id/key`.
- Existing `/api/connections/:id/connect`, `/test`, `/disconnect`, `/open` now accept independent native slot IDs for supported actions.
- `GET/POST /api/publishing-workspaces`, `PUT /api/publishing-workspaces/:id`, `POST /api/publishing-workspaces/:id/sync`.
- `GET /api/acquisition`, `POST /api/opportunities`, `POST /api/opportunities/import-rss`, `PUT /api/opportunities/:id/status`.
- `POST /api/campaigns`, `POST /api/campaigns/:id/posts`, `POST /api/campaigns/:id/schedule`.
- `POST /api/proposals`, `PUT /api/proposals/:id`, `POST /api/proposals/:id/approve`, `GET /api/proposals/:id/versions`.
- `POST /api/reminders`.

Separate public server only: `/`, `/services`, `/services/:id`, `/portfolio`, `/case-studies/:id`, `/contact`, `POST /inquiries`, `/privacy`, `/sitemap.xml`, `/robots.txt`.

## Files and records

New modules: `server/workspaces.ts`, `server/acquisition.ts`, `server/acquisition-routes.ts`, `server/opportunity-sources.ts`, `server/public-site.ts`, `server/public-index.ts`, `shared/acquisition.ts`, `src/IntegrationAccounts.tsx`, `src/AcquisitionPage.tsx`, plus deployment files and acquisition/workspace tests.

Updated: connections, connection routes, provider, application, domain, worker, startup wiring, account-policy sync, shared models, Antigravity helper, main/Connections UI, package manifests, existing tests and README. SQLite tables are unchanged. New JSON record kinds are `publishing_workspaces`, `campaigns`, `opportunities`, `proposals`, `proposal_versions`, `reminders`; encrypted workspace keys use the existing vault. New account/job workspace fields are optional for backward compatibility. No destructive migration or deletion occurs.

## Manual setup and next live checks

1. Restart the local backend normally after installing locked dependencies and building. Run `npm run start:public` separately for the new portfolio; keep the administration server on loopback.
2. Configure existing GitHub/Google OAuth developer credentials with the unchanged callbacks documented in `browser-connections.md`. Add a slot and manually complete consent. Finish one platform flow before starting another.
3. Supply Buffer keys or Postiz workspace keys only through the local encrypted form. Sync and verify accounts before campaign scheduling. Do not reconnect the original environment workspace as a new workspace just to migrate it.
4. Add real permitted portfolio evidence. Use Acquisition for imports, campaigns, proposal review and reminders. Use Content studio for factual post generation and version approval.
5. Request owner approval for an exact test post/account/time before any authenticated public publication. Verify its URL and a campaign-tagged inquiry after an approved deployment. No live test is claimed yet.

Remaining blockers for production: account credentials/consent; approved live post; approved hosting/domain; launch privacy and retention review; deployed CRM access/backup plan; distributed abuse controls at higher traffic. Optional email/calendar providers, marketplace APIs and automatic remote discovery remain unimplemented. No claim of guaranteed clients or revenue is made.

## Official references checked

- Postiz create/list integrations: https://docs.postiz.com/public-api/posts/create and https://docs.postiz.com/public-api/integrations/list
- GitHub OAuth and PKCE: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- Buffer own-account API: https://developers.buffer.com/guides/getting-started.html
- XML parser: https://github.com/NaturalIntelligence/fast-xml-parser

Local runtime verification: database/media backup created before restart; no in-flight jobs observed. The private backend was restarted and the separate public preview started on loopback. HTTP checks returned 200 for /acquisition on port 3000 and /services/web on port 3001; /api/state on the public server returned 404. Both listeners remain bound to 127.0.0.1. No internet exposure was enabled.

Deployment validation: docker compose -f deployment/compose.public.yml config --no-interpolate passed. No containers were built or started by that validation. The image and HTTPS issuance have not been deployment-tested.
