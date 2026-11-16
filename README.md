# ClientForge

A working local studio for showcasing freelance work, generating social drafts with Antigravity CLI, preparing recurring content, scheduling approved posts through Postiz, and managing client enquiries.

## Open the installed system

- Dashboard: http://127.0.0.1:4310
- Portfolio / enquiry preview: http://127.0.0.1:4310/portfolio
- Self-hosted Postiz: http://localhost:4007
- Local workflow diagnostics: http://localhost:8080

From this folder, start the built app with `./start.ps1`. It uses the locally installed portable Node runtime when present. Development: `npm run dev`. Rebuild after editing: `npm run build`. The app listens only on 127.0.0.1. Node 24.11+ is required for built-in SQLite. Dependencies are locked in package-lock.json; use `npm ci` on a fresh checkout.

On this machine npm can be used from `.tools/node-v24.11.1-win-x64/npm.cmd`; the start script adds that directory to PATH for its process. Docker Desktop was installed from the official winget package and runs the Postiz stack. No system-wide Node replacement was made.

## What works

- Four service groups: websites/UI/UX, mobile apps, Excel/data, and AI video/ComfyUI services.
- Persistent project evidence, showcase permission, demonstration labels and local PNG/JPEG/WebP/MP4 uploads (50 MB maximum).
- Real Antigravity generation through a background queue, validated structured responses and explicit failures. No simulated AI fallback.
- Manual drafting, editing, version-specific approval and text export for any registered channel.
- Recurring draft batches on selected weekdays and local times, project rotation, permission checks and restart deduplication. Runs more than 24 hours late are skipped. Ambiguous/nonexistent DST times are skipped by recurring rules.
- Local publishing queue, time-zone conversion, cancellation, live account checks and Postiz submission/reconciliation.
- Automatic adapter enabled for LinkedIn profiles/pages, Instagram variants, Facebook Pages, Threads, Bluesky, Mastodon and Telegram. Up to one attachment per automatic post. Media remains subject to provider/platform requirements.
- X, YouTube, Pinterest, DEV, Reddit and Quora are manual export in this release. The underlying Postiz supports additional networks, but those adapters have not been enabled or tested here.
- Enquiry form preview, manual lead entry, sources/campaigns, pipeline stages, project values with currencies, and next-action notes.
- UTM link builder in the draft editor. The portfolio form records URL campaign/source values when no self-reported source is supplied.
- Audit history, workspace export and consistent SQLite/media backup script.

The workspace includes one explicitly labelled ClientForge development demo and one real Antigravity-generated LinkedIn draft. There are no fabricated clients, testimonials or acquisition metrics. No live social posts have been sent.

## Connect accounts when your details are ready

1. Open the local Postiz URL. Create your own owner login; do not share the password in chat.
2. Configure the platform developer applications required by the channels you choose. The official self-hosting documentation explains API keys, redirect URIs and account eligibility: https://docs.postiz.com/self-host/providers/overview
3. Connect accounts inside Postiz. Some providers require a publicly reachable HTTPS callback; a localhost installation alone does not complete every OAuth flow.
4. Generate a Postiz API key in its settings. Copy `.env.example` to `.env` and set POSTIZ_API_KEY locally. Do not commit it. The default local base URL is `http://localhost:4007/api/public/v1`; hosted Postiz uses `https://api.postiz.com/public/v1`.
5. Restart ClientForge and click **Channels → Sync from Postiz**.
6. Add real profile details and permission-cleared projects. Generate and review content.
7. After reviewing the first real post, set PUBLISHING_ENABLED=true in .env, restart, approve the exact version, schedule it and resume the queue. Both the environment switch and dashboard pause must permit publication.
8. Check remote status using **Check provider**. `submitted` means accepted by Postiz, not confirmed published. Manage already-submitted posts in Postiz; the local pause cannot retract them.

## Regular operation

Use **Content cadence** to define recurring draft preparation. It spends the authenticated Antigravity account's usage allowance only when enabled. New rules default to disabled. Review the resulting drafts and schedule approved content. The publishing pause controls local publication, not content generation; disable a cadence rule to stop its generation jobs.

The computer and ClientForge process must remain on for local recurring generation and publication. Docker Desktop must run for self-hosted Postiz. The installation is not a Windows background service and does not start at sign-in automatically. Run `./postiz.ps1 status`, `./postiz.ps1 start` or `./postiz.ps1 stop` to manage only this Postiz installation. Stopping preserves volumes. Do not run `down -v` unless intentionally destroying all Postiz data.

Antigravity authentication uses the user's existing local CLI account. It has been tested with installed CLI 1.5.9. Session-scoped permissions deny file access, commands, URL access and MCP tools; generation receives evidence via stdin and runs in an isolated empty working directory. Publishing credentials are excluded from its environment. This is a drafting integration, not a general agent command execution endpoint.

## Reliability and data

Data lives under ignored `data/`: SQLite with WAL, uploads, the agent workspace and the generated Postiz compose configuration. The compose generator creates unique passwords/JWT secret and binds exposed services to loopback. Never publish or commit that configuration. Docker data is in persistent named volumes under project `clientforge-postiz`.

Approvals include a content-version hash. Editing evidence invalidates dependent approvals; editing posts cancels pending local schedules. Duplicate version/account submissions are blocked, even if a different scheduled time is chosen. In-flight jobs become `unknown` after restart and are not retried. Network/server ambiguity requires provider reconciliation. Confirmed failures also have no automatic retry in this release; inspect them before creating a new reviewed version.

`node scripts/backup.mjs` makes a consistent database snapshot and copies its referenced media. Restore with ClientForge stopped: preserve a backup of current data, replace clientforge.sqlite and uploads with the chosen snapshot, and remove stale SQLite WAL/SHM sidecars only after verifying the process is stopped. The JSON export is for portability/review and has no import UI. Back up Postiz's PostgreSQL/config/uploads volumes separately using standard Docker/Postgres backup procedures. Keep .env separately and protect backups as private client data.

## Development and extension

```text
src/                 React dashboard and local portfolio preview
shared/model.ts      Schemas, service catalogue and channel registry
shared/time.ts       IANA timezone scheduling and DST handling
server/app.ts        Validated HTTP API and local session protection
server/domain.ts     Approval and queue invariants
server/worker.ts     Durable generation, recurring rules and submission worker
server/antigravity.ts CLI adapter, prompt constraints and response validation
server/postiz.ts     Official Postiz API contract adapter
server/store.ts      Transactional SQLite storage
tests/system.test.ts Integration, state transition and boundary tests
scripts/             Installation configuration and backup utilities
```

To add a channel, extend the registry, implement and verify its required provider settings/media constraints, then enable automatic mode. Manual export is the fallback until verified. Do not remove review requirements for communities. Keep platform account capabilities separate from the service catalogue. Implement another publishing provider behind the accounts/upload/publish/reconcile interface rather than embedding platform logic in UI components.

Verification: `npm test` and `npm run build`. Tests exercise approval invalidation, duplicate prevention, revoked permission, community restrictions, restart recovery, nested rollback, DST conversion, recurring-job deduplication/backlog handling, generation failures, pause races, ambiguous submission, provider payloads, local API authentication/origin/host protection, invalid media and enquiry attribution.

## Current limits and next deployment milestone

This is a single-owner local application, not a publicly deployed or multi-tenant SaaS. Its local session protects against cross-site browser calls, but is not a substitute for internet-facing identity/access control. Do not expose port 4310 through a tunnel or reverse proxy. The portfolio is currently a preview; outside clients cannot visit localhost.

Before public launch, deploy a separate public portfolio/enquiry endpoint with HTTPS, owner authentication and tenant isolation for the private dashboard, a supported public ingest path to the lead store, privacy/retention settings and abuse controls. For multiple workers or high volume, migrate record storage to PostgreSQL with indexed queue queries and atomic worker leases. Add account capability-specific media validation, automatic confirmed-publication polling, provider-specific analytics and observability. Add CI and operational restore tests before external production use.

No email/DM sending, automated marketplace proposals, mass community promotion, paid subscriptions, generated videos or ComfyUI execution are enabled. Those are optional later integrations, not prerequisites for showcasing those freelance services. Client acquisition depends on portfolio quality, offer and conversations; the software does not guarantee clients. Current reporting covers workspace activity and lead sources, not cross-network impressions or verified click-to-sale causality.

## Reused software

Postiz is run unmodified as a separate service using its official deployment repository: https://github.com/gitroomhq/postiz-docker-compose (checkout `dd4969e5e694cd009619a0d53cff14c21104580b`). The application source is https://github.com/gitroomhq/postiz-app and its current licence is AGPL-3.0. Keep its notices and review applicable licence obligations before distributing modified versions. The custom studio integrates through the documented public API: https://docs.postiz.com/public-api/introduction

Antigravity reference: https://antigravity.google/docs/cli/headless/
