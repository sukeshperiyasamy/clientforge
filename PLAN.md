# Freelance client acquisition system

Status: original implementation blueprint. A working local first version now exists; see README.md for the implemented architecture, startup instructions and remaining deployment work. Antigravity generation has been tested. No social accounts are connected and live publishing remains disabled.

## Objective

Help an India-based freelancer attract international clients by publishing credible work examples regularly and tracking enquiries, calls, proposals and paid projects. Start as a single-owner tool. Revenue and qualified enquiries are the success measures; followers are secondary. Posting cannot guarantee clients.

## Service catalogue

Keep separate offers and landing-page destinations so each post speaks to one buyer:

| Offer | Buyer | Evidence to collect | Call to action |
| --- | --- | --- | --- |
| Websites, web apps and UI/UX | Founders, agencies, small businesses | Working demos, screen recordings, design comparisons | Request a project estimate |
| iOS and Android apps | Founders and businesses | App walkthroughs, screenshots, delivery scope | Discuss an app idea |
| Excel and data services | Operations, finance and business teams | Anonymized spreadsheet transformations, dashboards, plots and analysis | Describe your spreadsheet problem |
| AI creative and local workflows | Creators, studios and agencies | AI video examples, ComfyUI workflow demos and setup examples | Request a workflow consultation |

Describe outcomes and deliverables. Avoid presenting every service in every post. Label personal/demo projects clearly; never invent clients, testimonials, savings or revenue results. Remove private client data and confirm permission before showcasing client work.

## Acquisition workflow

1. Add a project: service, buyer problem, what was delivered, evidence, screenshots/video, verified results, destination URL and showcase permission.
2. Choose an offer and audience for the campaign.
3. Antigravity produces platform-specific drafts from this evidence, including hooks, captions, carousel outlines and short video scripts.
4. Validate facts, media availability, platform constraints, links and similarity to previous posts.
5. Review and edit a weekly batch. Store approval against the exact content version; edits invalidate approval.
6. Schedule approved versions for connected, eligible accounts. Unsupported channels receive an export/manual publishing task.
7. Use campaign links on posts. Each service page includes a project enquiry form and an optional booking link.
8. Review qualified leads, calls, proposals, won projects and recorded project value by campaign each week.

## Channels and starting experiment

These are proposed starting cadences, not platform limits or promised results.

| Channel | Initial use | Cadence | Publication path |
| --- | --- | --- | --- |
| LinkedIn | Business case studies, Excel improvements, development demos | 3 posts/week | Supported publishing provider after connection and capability checks |
| Instagram | UI/UX comparisons, app demos, AI video examples | 2 posts/week | Supported provider for eligible account and media types |
| Portfolio/service pages | Detailed work examples and enquiry conversion | 1 case study/week | Owned content |
| YouTube Shorts | Demonstrations that benefit from motion | 1/week when footage exists | Manual initially; adapter later |
| Relevant communities | Helpful answers and work examples where appropriate | Only when relevant | Draft and manual participation |

Behance, Dribbble, developer articles and marketplace profiles are later experiments. Do not depend on automated marketplace proposals or unsolicited direct messages. No mass community posting or automatic replies. No email or DM sending in the MVP.

Use clear English and explain remote delivery, project scope, available meeting windows and handover. Test audiences in North America, UK/Europe and Australia separately. Store IANA time zones and schedule in recipient-local time with daylight-saving conversion; do not assume one universal best posting hour.

## First weekly content batch

- Monday: a real web/app case study explaining the buyer problem, implementation and evidence; invite a project enquiry.
- Tuesday: an anonymized Excel before/after example showing formulas, cleanup, reporting or plotting.
- Wednesday: a UI/UX walkthrough explaining decisions and the intended user task.
- Thursday: a short app or ComfyUI demonstration with clear deliverables.
- Friday: a practical lesson from completed work, linked to its detailed case study.

Repurpose selectively across the chosen channels. Never fabricate a fresh project to fill an empty calendar; reuse a new angle from approved evidence or skip the slot.

## MVP modules

1. Owner login and settings: service catalogue, voice, audience, availability and contact details.
2. Project library: evidence, assets, public/private flags and showcase permissions.
3. Campaign studio: generate drafts, compare variants, edit and approve exact versions.
4. Calendar and publishing queue: account capabilities, scheduling, status, retries and manual tasks.
5. Leads: enquiry form, source attribution and pipeline (new, qualified, call, proposal, won, lost).
6. Dashboard: published posts, failures, clicks, enquiries, qualified leads and won value.

Collect enquiry name, contact, service needed, project description, budget range, timeline and country/time zone. Include a privacy notice, spam protection and owner-only lead access. A visitor can supply their source when tracking is unavailable.

## Architecture

Use Next.js and TypeScript for the dashboard/application, PostgreSQL with Prisma for durable data, and one background worker. Start with a database-backed due-job queue to reduce services; add Redis/BullMQ when concurrency or throughput warrants it. Store media in S3-compatible storage. Use FFmpeg for deterministic clipping/transcoding. Integrate ComfyUI later through its own optional adapter.

Use a publishing-provider adapter first, with Buffer as a candidate whose connected-channel features and plan must be checked before implementation. Keep the interface provider-neutral: capabilities, validate, publish/schedule and reconcile. Do not implement every platform independently in version one. Supported posting does not imply access to analytics or comments.

Antigravity runs on the owner's machine or a dedicated authenticated worker. The web process submits generation jobs; it does not expose a public endpoint for arbitrary CLI commands. Invoke the CLI with a fixed executable and argument array, never shell-concatenated visitor input. Use structured output where supported by the installed version, then validate it against an application schema. Set a job timeout, bounded concurrency, usage limits and clear failed-job states. Confirm the account's unattended-use entitlement and limits before production operation.

The agent generates content only. The application owns credentials, approvals, scheduling, publishing and lead writes. Treat web content and project descriptions as untrusted data, not executable instructions. Keep publishing tokens out of prompts and logs. Use a provider interface so generation can later move to an API without redesigning the app.

Suggested records: Owner, Service, Project, Asset, Campaign, ContentVersion, Approval, ChannelAccount, PublicationJob, PublicationAttempt, TrackingLink, Enquiry and LeadEvent.

Publication lifecycle: draft -> pending_review -> approved -> scheduled -> publishing -> published / failed / unknown. Approval references the immutable version and channel. Use an idempotency key per version/account/scheduled slot. For network timeouts after a publish request, reconcile the provider status before retrying to avoid duplicate posts. Recheck eligibility and approval at execution time. Include a global publishing pause and audit log.

## Attribution

Attach utm_source, utm_medium, utm_campaign and utm_content to destination links. Preserve first and latest attributable campaign on the enquiry where available. Record self-reported source as a separate field. Clicks do not prove causality; cross-device, blocked tracking and private sharing create gaps. Show unknown sources rather than invent attribution. Keep provider engagement metrics optional; do not promise views or impressions for every network.

## Delivery sequence and acceptance

### Milestone 1: usable local content studio

Owner settings, service/project library, asset storage, Antigravity adapter, validated draft generation, editing and approval. Deliverable: generate a factual weekly batch from one supplied project and export it. No pretend AI results if the CLI fails.

### Milestone 2: scheduler and one real channel

Connect one supported account, inspect capabilities, publish one approved test post, record the remote ID, then enable scheduling. Verify duplicate prevention, timezone conversion, expired credentials and unknown-outcome handling. Requires the owner's account connection and provider access.

### Milestone 3: enquiries and attribution

Connect service pages/forms, campaign links and lead pipeline. Verify a test visitor can submit an enquiry and its available source reaches the owner dashboard.

### Milestone 4: expansion based on evidence

Add a second channel, optional video/ComfyUI production and richer reporting. Review a four-week experiment by offer and channel; continue what produces qualified conversations. Build multi-user SaaS features only if a later requirement justifies them.

## Inputs needed for real launch

Public professional name, contact destination, portfolio/domain if any, three showcase projects or clearly labelled demos, permission-cleared assets, priority service, target buyer, meeting availability and the initial social accounts. Credentials belong in local secrets or deployment settings, not this document or chat. Prices, testimonials and business claims require owner-supplied facts.

## Verified starting context and sources

- Workspace was empty when inspected on 16 November 2026.
- `agy.exe` is discoverable at `C:\Users\LOKIKENDE\AppData\Local\agy\bin\agy.exe`; authentication and generation have not been tested.
- Antigravity headless documentation: https://antigravity.google/docs/cli/headless/
- Buffer API quick start: https://developers.buffer.com/guides/getting-started.html
- Buffer API capabilities and analytics caveats: https://support.buffer.com/articles/what-is-buffers-api-GtIYIQilz5

This file preserves the original plan. README.md describes the implemented application and its current limits; real social publication remains inactive until accounts are connected and reviewed content is scheduled.
