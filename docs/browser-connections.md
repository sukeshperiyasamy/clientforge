# FreelanceGrowth Browser & Connections

This extends the existing ClientForge application. The project, content, approval, scheduling and lead data remain intact. No live website accounts have been created or connected on your behalf, and no posts have been published.

## Open the system

1. Double-click **FreelanceGrowth Browser** on your Windows desktop. It starts the local dashboard if necessary and opens the dedicated browser homepage.
2. Open **http://localhost:3000/connections**. On first use, create your own dashboard password of at least 12 characters. This password is separate from all website account passwords. It is hashed locally with scrypt and is never sent to Antigravity.
3. Use **Open Website** for normal manual sign-in inside the dedicated profile. Complete passwords, account registration, email verification, CAPTCHA and 2FA yourself.
4. Use **Connect Account** for an implemented official OAuth/provider flow. If developer credentials are missing, the card's **Setup & limits** panel gives the next action and exact environment names. Missing credentials never produce a fabricated connection.
5. Use **Test Connection** after consent. A website can be signed in while its API remains unconnected; the UI intentionally distinguishes these cases.

The main server is on port 3000 with port 4310 kept as a compatibility alias. Postiz remains a separate service at http://localhost:4007. The local portfolio remains a preview, not an internet-hosted client site.

## Dedicated profile and launcher

Configuration is tracked at `browser/browser-config.json`: profile name, homepage, supported Chromium/Chrome channel, broker port and download limit. The default name is **FreelanceGrowth**, and the homepage is the Connections page. Runtime directories are created under:

```text
%LOCALAPPDATA%/FreelanceGrowth/Browser/<project-id>/
  profile/       # Dedicated Chromium user-data directory
  downloads/     # Completed downloads; files are never executed automatically
  screenshots/   # Explicitly requested local screenshots
  logs/          # Redacted action log and broker diagnostics
  runtime/       # Browser ownership leases and temporary downloads
  .control-key   # Local broker credential, protected by Windows ACLs
```

The project identifier is derived from the checkout's absolute path, so separate checkouts get separate profiles. On this installation the profile is `C:\Users\LOKIKENDE\AppData\Local\FreelanceGrowth\Browser\4076cd2f81fc\profile`. Runtime data lives in AppData because the existing workspace browser directory cannot have its ACL tightened by this user; no administrator workaround was used.

Only the browser broker owns a writable profile. Concurrent launch calls converge on that broker; a second live profile manager is rejected by an exclusive ownership lease. Chrome's own locks are never forcibly deleted. Closing the browser preserves its profile. The broker is separate from the backend, so a backend restart does not require another writer or clearing sessions.

The desktop shortcut uses `launch-browser.vbs` and the project's installed Node runtime. Reinstall with `cscript //nologo scripts/install-shortcut.vbs`. This does not change PowerShell execution policy, Windows security settings or your default browser. The optional PowerShell scripts remain available where local policy permits them, but the installed shortcut does not depend on them.

The project browser supports normal tabs, uploads through the browser's file picker, downloads and manual navigation. Dashboard controls can focus/close tabs, request a local screenshot and close/reopen the browser. Closing tabs/browser requires confirmation. Screenshot requests warn about sensitive content; authentication/verification screens are rejected. No screenshot, cookie, local-storage export or browser credential is passed to the AI model.

Persistent sessions are best-effort: websites can expire sessions, require new consent, block automation-controlled browser sign-in or require verification. Complete supported flows manually. Do not bypass an unsupported-browser warning or authentication challenge.

## Connection registry and supported adapters

All **43 requested platforms** are represented, across social networks, marketplaces, portfolios, communities, publishing and CRM. Each includes its URL, icon, classification, authentication method, actions, status, check timestamps and setup limitations. Thirty entries currently use manual/assisted operation. Classification describes the intended integration approach; it does not mean all of a platform's API features are implemented.

Only these adapters have active authenticated checks:

| Adapter | Actual implemented behavior | Required setup |
| --- | --- | --- |
| GitHub | OAuth authorization-code flow with PKCE; read-only `GET /user` identity check | GitHub OAuth App client ID/secret |
| YouTube | Google OAuth with PKCE, token refresh, `channels.list` identity check using `youtube.readonly` | Google Cloud OAuth client, consent screen/test users, YouTube Data API enabled |
| Buffer | Encrypted API key; documented GraphQL account/organization query | Own Buffer API key entered in the local dashboard |
| LinkedIn and supported social channels through Postiz | Provider OAuth handoff, authenticated provider account listing, enabled-channel check and reuse of existing publishing adapters | Postiz API key, developer applications/scopes and linked channels configured in Postiz |

GitHub and YouTube connections currently verify identity; they do not grant repository writes or video uploads. Buffer verifies its workspace; direct Buffer publication is not enabled. The current automatic Postiz adapters remain LinkedIn profiles/pages, Facebook Pages, Instagram variants, Threads, Bluesky, Mastodon and Telegram, subject to the existing one-attachment limitation and platform media rules. X, YouTube, TikTok and Pinterest are not silently promoted to automatic publishing.

For Postiz, **Connected** specifically means the official provider API accepted the application's key and returned an enabled matching linked account. It is not a claim that the browser website session was verified or that the social network will accept a particular future post. Platform permissions are checked again by the publishing provider. Upstream disabled/expired channels and provider credential failures require reconnection.

For manual connectors, absence of a login page or password box is not proof of authentication. Checks may identify Login Required or Verification Required from local authentication-screen signals, but otherwise remain Manual Only. No passwords or cookies are read to make this decision. Registry-only entries keep automated actions disabled until the actual adapter and current official permissions/policies have been verified.

## Exact credential setup

Put developer client secrets in local `.env`, never chat, prompts, screenshots or source control:

```ini
PORT=3000
GITHUB_CLIENT_ID=<your-github-oauth-app-client-id>
GITHUB_CLIENT_SECRET=<your-github-oauth-app-client-secret>
GOOGLE_CLIENT_ID=<your-google-web-oauth-client-id>
GOOGLE_CLIENT_SECRET=<your-google-web-oauth-client-secret>
POSTIZ_URL=http://localhost:4007/api/public/v1
POSTIZ_API_KEY=<your-postiz-workspace-key>
PUBLISHING_ENABLED=false
```

### GitHub

In GitHub Settings → Developer settings → OAuth Apps, create an app with homepage `http://localhost:3000` and callback **`http://localhost:3000/auth/github/callback`**. Copy its client ID/secret into `.env` and restart the backend. No repository, email or write scopes are requested. Connect in the dashboard and finish GitHub's official consent screen manually.

### YouTube

In Google Cloud, enable YouTube Data API v3. Configure the OAuth consent screen and add your account as a test user while the app is in testing. Create a Web application OAuth client with callback **`http://localhost:3000/auth/youtube/callback`**. Set the client ID/secret in `.env`, restart and connect. Only `youtube.readonly` is requested. Google app verification, test-mode refresh-token expiry and channel eligibility still apply. There is no service-account workaround for a personal YouTube channel.

The OAuth callback origin follows the hostname/port of the dashboard where Connect was clicked. Use the canonical localhost:3000 URL so it matches the registered callbacks. If deliberately using a different local host/port, register its exact callback as well.

### Buffer

Sign in to Buffer manually, open its API settings and generate a key for your own workspace. In Connections → Buffer → Setup & limits, enter the key in the local password field and choose **Save encrypted key & test**. It is sent only to Buffer's documented API for verification and stored encrypted locally. This is an API-key connection; no unsupported OAuth flow is fabricated.

### LinkedIn / Postiz

Create your own owner account in Postiz. Configure each platform's developer app, account type and least-privilege scopes using Postiz's official provider guide. Some OAuth providers require a publicly reachable HTTPS callback, which localhost alone cannot supply. Do not expose the private dashboard to obtain one; deploy a supported provider callback separately or use a supported hosted provider. Connect your social account in Postiz, set POSTIZ_API_KEY locally, restart, then connect/test its card here.

Mastodon instance selection and Telegram bot credentials are configured inside Postiz rather than through a fabricated generic OAuth URL. Do not enter ordinary website passwords into the application database.

## OAuth and token security

Tokens stored by this application use AES-256-GCM with connector-bound additional authenticated data. The random encryption key is protected with Windows DPAPI CurrentUser and owner/SYSTEM-only file ACLs. Tokens never appear in connection JSON or workspace exports. Owner password hashes and login sessions are also excluded from JSON exports.

OAuth uses cryptographic state, PKCE, a ten-minute one-time handoff ticket and an HttpOnly browser-binding cookie. The initiating authenticated owner session must still be valid. This allows starting from one dashboard browser and finishing in the dedicated browser without copying either browser's sessions. Invalid, replayed, cancelled or expired consent cannot mark a connection successful. Refresh/reconnect and disconnect races are checked against connection revisions.

Browser profile encryption/credentials remain Chromium's and the operating system's responsibility, with a separate protected directory. Postiz owns any platform tokens it obtains; its at-rest storage and key rotation must be configured in Postiz before production use. The application's vault does not magically encrypt another service's database.

Disconnect disables local use immediately, removes the local token, cancels pending local jobs for associated provider accounts and attempts supported direct OAuth revocation. It does not erase browser cookies. Provider-managed channel revocation and already-submitted posts must be handled in Postiz. If remote revocation cannot be confirmed, the UI explicitly instructs you to revoke it at the provider.

## Operating modes, assistance and publishing

- **Mode A — API automatic:** Available only for verified supported publishing connections. Execution of already-approved content can proceed without another click. It does not auto-approve new claims/drafts, broaden scopes or enable an unimplemented API adapter.
- **Mode B — Approval required:** The normal default for API-capable connections. Existing immutable approval/version checks remain in force.
- **Mode C — Manual:** No automated publication. Open the website and complete the action yourself.

Setup & limits can export an approved content snapshot and open the target website as an assisted workflow. It never fills/submits proposals, comments, bids or client messages. Adapt the text to the specific conversation and site rules before submitting. Marketplaces, communities and unsupported sites remain human-managed.

Daily and weekly cadence rules prepare drafts; manual triggers remain supported. The default local safety cap is five publishing submissions per supported platform per rolling 24 hours. HTTP 429 and known-safe preparation failures may retry at most three times with backoff and Retry-After handling. A timeout or server failure after possible submission becomes Unknown and is never blindly retried. Confirmed provider status is polled conservatively, separate from submission acceptance; published URLs and confirmation timestamps are recorded when returned.

The emergency control stops new worker actions, pauses publication and disables recurring rules. An already-running generation may finish its external request, but its result is discarded after the stop. No application can retract a request already accepted by a remote provider; manage that in the provider UI. Resetting emergency stop leaves publication paused and rules disabled until deliberately enabled again.

## Background operation and notifications

The installed **FreelanceGrowth Local Dashboard** Windows task runs at this user's logon, with LeastPrivilege/InteractiveToken, no Windows password storage and no administrator escalation. Its process remains active when the dashboard tab is closed; the browser need not be open for API work. The scheduled task supervises the hidden Node backend through `start-background.vbs` and retries process failure up to three times.

Reinstall/update it with `node scripts/install-startup.mjs`. Inspect it with `schtasks /Query /TN "FreelanceGrowth Local Dashboard" /V /FO LIST`. The desktop browser shortcut can also start the backend when absent. Logs are in `data/logs/server.log`; the browser has its own protected broker/action logs. Windows must be signed in, the computer awake and any required Postiz Docker services running. This is not a cloud service that operates while the computer is off.

Previously authorized API connections are rechecked periodically, one at a time. Expiration, access/verification failures and publishing outcomes create persistent in-app notifications in Connections. There is no unrequested email, DM or external notification transmission. The notifications remain available after the dashboard is reopened.

## Recovery and tests

`npm run build` then `npm test` covers the existing content system plus real Chromium persistence, rejection of a concurrent profile writer, downloads, screenshot protection, encrypted-vault reload/tamper rejection, owner-session recovery, mocked official API checks, OAuth handoff/replay/browser binding, safe retries, emergency stop and real-browser UI behavior. Authentication/API tests use synthetic credentials and test doubles, not fabricated live account connections. Browser tests use disposable temporary profiles, never personal Chrome data. UI proof images show the actual registry with no verified accounts; the test owner exists only in a disposable test database.

For backend restart, preserve the database and DPAPI key; the dedicated browser broker is independent. For a full computer restart, reopen the shortcut and re-test each connection as necessary. Never delete Chrome's locks to force two writers. A stale application ownership lease may be recovered only when its recorded owner process is no longer alive.

Use `node scripts/backup.mjs` for a consistent database/media snapshot. Preserve the DPAPI key in `%LOCALAPPDATA%/FreelanceGrowth/Security/<data-directory-id>/vault-key.dpapi` in a protected backup on Windows; DPAPI recovery requires the same Windows user protection context. A legacy `data/security` key is copied once into protected per-user storage, verified against existing ciphertext and retained at its original location. Existing ciphertext is not re-keyed. If encrypted records exist without an available key, the app stops rather than generating a replacement. Losing the key requires restoring it or reconnecting accounts. Profile backups, if desired, must be made with the dedicated browser fully closed and kept private. Do not export profiles or tokens to an AI model. Postiz Docker volumes need separate backups.

## Phase status and remaining work

| Phase | Current state |
| --- | --- |
| Browser foundation | Implemented: isolated persistent Chromium, desktop shortcut, Connections route, manual site opening, tab/download/screenshot controls |
| Connector foundation | Implemented: all 43 entries, honest states/actions, protected token vault, local owner authentication, OAuth framework |
| First integrations | Implemented identity/provider adapters; real account consent and live checks require your developer credentials/accounts |
| Publishing | Existing review/scheduler preserved and extended with limits, bounded safe retries, manual assistance, notifications and confirmed history |
| Expansion | Registry entries are ready; new APIs, marketplace discovery/proposals and richer analytics require separately verified adapters |
| Distributed infrastructure | The working SQLite/single-worker implementation and existing Postiz Docker/PostgreSQL/Redis/Temporal stack are preserved. A custom PostgreSQL/BullMQ/n8n migration is not implemented or claimed here. |

This is a functional local foundation, not a claim that 43 networks can auto-publish or that all later phases are complete. No unsupported account workflow, CAPTCHA bypass, stealth fingerprinting, session hijacking, rate-limit evasion, purchases, mass messaging or automated marketplace bids are implemented.

## Official references checked for implemented adapters

- Playwright persistent contexts: https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context
- GitHub OAuth: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- Google server-side OAuth: https://developers.google.com/identity/protocols/oauth2/web-server
- YouTube authorization: https://developers.google.com/youtube/v3/guides/authentication
- Buffer account API: https://developers.buffer.com/guides/getting-started.html
- Postiz connection handoff: https://docs.postiz.com/public-api/integrations/connect

Other entries link to their official documentation/policy references in the registry, with disabled automated actions until implementation and verification.
