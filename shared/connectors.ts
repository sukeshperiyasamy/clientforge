export const connectionStatuses = [
  "Not Connected",
  "Login Required",
  "Connected",
  "Expired",
  "Verification Required",
  "API Not Available",
  "Manual Only",
  "Error",
] as const;
export type ConnectionStatus = (typeof connectionStatuses)[number];
export type ConnectorClass =
  | "Official API publishing"
  | "OAuth account connection"
  | "Webhook integration"
  | "Browser-assisted workflow"
  | "Manual publishing only"
  | "Discovery or read-only integration";
export type Connector = {
  id: string;
  name: string;
  category: string;
  url: string;
  icon: string;
  color: string;
  classification: ConnectorClass;
  auth: "oauth" | "postiz" | "api_key" | "manual";
  adapter: "github" | "youtube" | "buffer" | "postiz" | "manual";
  providerIds: string[];
  actions: string[];
  limitations: string;
  nextAction: string;
  docs: string;
  verifiedOn: string | null;
  requiredEnv: string[];
  dailyLimit: number;
};
const manualNote =
  "Browser sign-in is for your manual use. Automated posting, scraping, messages and bids are disabled. No credential or cookie-based login verification is assumed.";
function entry(
  id: string,
  name: string,
  category: string,
  url: string,
  docs: string,
  options: Partial<Connector> = {},
): Connector {
  return {
    id,
    name,
    category,
    url,
    docs,
    icon: name === "LinkedIn" ? "in" : name.slice(0, 2).toUpperCase(),
    color: "#7c8ba3",
    classification: "Browser-assisted workflow",
    auth: "manual",
    adapter: "manual",
    providerIds: [],
    actions: ["Open website", "Prepare manual content"],
    limitations: manualNote,
    nextAction:
      "Open the project browser and sign in yourself. Publishing remains manual until an approved API adapter is configured.",
    verifiedOn: null,
    requiredEnv: [],
    dailyLimit: 0,
    ...options,
  };
}
const postiz = (
  providerIds: string[],
  automatic = true,
): Partial<Connector> => ({
  classification: "Official API publishing",
  auth: "postiz",
  adapter: "postiz",
  providerIds,
  actions: [
    "Open website",
    "Connect through Postiz OAuth",
    "Verify provider account",
    ...(automatic
      ? ["Publish reviewed content through existing adapter"]
      : ["Prepare manual content"]),
  ],
  limitations:
    "Postiz owns the platform OAuth tokens. Provider API authentication and enabled channel membership can be checked here; this is not verification of your website browser session. Platform/API eligibility and scopes still apply." +
    (automatic
      ? ""
      : " Automatic publishing for this channel is not enabled in this app."),
  nextAction:
    "Create/sign in to your Postiz account at localhost:4007. Configure its platform developer app, connect the channel, then supply POSTIZ_API_KEY in local .env and restart. Test Connection checks the official provider API.",
  docs: "https://docs.postiz.com/self-host/providers/overview",
  requiredEnv: ["POSTIZ_API_KEY"],
  verifiedOn: "2026-11-16",
  dailyLimit: 5,
});
export const connectors: Connector[] = [
  entry(
    "linkedin",
    "LinkedIn",
    "Social media",
    "https://www.linkedin.com/",
    "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/",
    { ...postiz(["linkedin", "linkedin-page"]), color: "#0a78b5" },
  ),
  entry(
    "facebook",
    "Facebook Pages",
    "Social media",
    "https://www.facebook.com/",
    "https://developers.facebook.com/docs/pages/",
    { ...postiz(["facebook"]), color: "#5684e9" },
  ),
  entry(
    "instagram",
    "Instagram",
    "Social media",
    "https://www.instagram.com/",
    "https://developers.facebook.com/docs/instagram-platform/",
    { ...postiz(["instagram", "instagram-standalone"]), color: "#c76f9d" },
  ),
  entry(
    "threads",
    "Threads",
    "Social media",
    "https://www.threads.net/",
    "https://developers.facebook.com/docs/threads/",
    postiz(["threads"]),
  ),
  entry(
    "x",
    "X / Twitter",
    "Social media",
    "https://x.com/",
    "https://docs.x.com/",
    postiz(["x"], false),
  ),
  entry(
    "bluesky",
    "Bluesky",
    "Social media",
    "https://bsky.app/",
    "https://docs.bsky.app/",
    postiz(["bluesky"]),
  ),
  entry(
    "mastodon",
    "Mastodon",
    "Social media",
    "https://mastodon.social/",
    "https://docs.joinmastodon.org/client/intro/",
    {
      ...postiz(["mastodon"]),
      limitations:
        "Instance rules and URL apply. Configure the instance in Postiz; the generic OAuth shortcut is unavailable for URL-based providers. Only its API connection is verified here.",
    },
  ),
  entry(
    "youtube",
    "YouTube",
    "Social media",
    "https://www.youtube.com/",
    "https://developers.google.com/youtube/v3/guides/authentication",
    {
      adapter: "youtube",
      auth: "oauth",
      classification: "OAuth account connection",
      color: "#d16d64",
      actions: ["Open website", "OAuth with PKCE", "Verify channel identity"],
      verifiedOn: "2026-11-16",
      requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      dailyLimit: 0,
      nextAction:
        "Enable YouTube Data API v3 in Google Cloud. Create a Web application OAuth client, configure test users/consent, and register http://localhost:3000/auth/youtube/callback. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env. This connection requests youtube.readonly only.",
      limitations:
        "Channel identity verification only. Uploads require additional reviewed scopes and an implemented upload adapter. Google may require app verification; never bypass an unsupported-browser warning.",
    },
  ),
  entry(
    "tiktok",
    "TikTok",
    "Social media",
    "https://www.tiktok.com/",
    "https://developers.tiktok.com/doc/content-posting-api-get-started/",
    postiz(["tiktok"], false),
  ),
  entry(
    "pinterest",
    "Pinterest",
    "Social media",
    "https://www.pinterest.com/",
    "https://developers.pinterest.com/",
    postiz(["pinterest"], false),
  ),
  entry(
    "telegram",
    "Telegram",
    "Social media",
    "https://web.telegram.org/",
    "https://core.telegram.org/bots/api",
    postiz(["telegram"]),
  ),
  entry(
    "discord",
    "Discord",
    "Social media",
    "https://discord.com/app",
    "https://discord.com/developers/docs/resources/webhook",
    {
      classification: "Webhook integration",
      limitations:
        "Incoming webhooks work only in authorized channels. Webhook posting is not implemented here; no user-account automation or bulk messaging.",
    },
  ),
  ...[
    [
      "upwork",
      "Upwork",
      "https://www.upwork.com/",
      "https://www.upwork.com/developer/documentation/graphql/api/docs/index.html",
    ],
    [
      "fiverr",
      "Fiverr",
      "https://www.fiverr.com/",
      "https://www.fiverr.com/legal/terms-of-service",
    ],
    [
      "freelancer",
      "Freelancer.com",
      "https://www.freelancer.com/",
      "https://developers.freelancer.com/",
    ],
    [
      "peopleperhour",
      "PeoplePerHour",
      "https://www.peopleperhour.com/",
      "https://www.peopleperhour.com/static/terms",
    ],
    [
      "guru",
      "Guru",
      "https://www.guru.com/",
      "https://www.guru.com/terms-of-service/",
    ],
    ["contra", "Contra", "https://contra.com/", "https://contra.com/policies"],
    [
      "toptal",
      "Toptal",
      "https://www.toptal.com/",
      "https://www.toptal.com/legal/terms",
    ],
  ].map(([id, name, url, docs]) =>
    entry(id, name, "Freelance marketplaces", url, docs, {
      classification: "Manual publishing only",
      limitations:
        "Account creation, opportunity searches, proposals and client messages are manual. No automated scraping or bidding is enabled. Any future API access requires separate policy and permission verification.",
    }),
  ),
  entry(
    "github",
    "GitHub",
    "Developer & portfolio",
    "https://github.com/",
    "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps",
    {
      adapter: "github",
      auth: "oauth",
      classification: "Discovery or read-only integration",
      actions: [
        "Open website",
        "OAuth with PKCE",
        "Verify public user identity",
      ],
      verifiedOn: "2026-11-16",
      requiredEnv: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
      nextAction:
        "Create an OAuth App in GitHub Developer settings. Use homepage http://localhost:3000 and callback http://localhost:3000/auth/github/callback. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in local .env. No repository, email or write scopes are requested.",
      limitations:
        "Read-only identity verification. No repository publishing, issue creation or messages are enabled.",
    },
  ),
  ...[
    ["gitlab", "GitLab", "https://gitlab.com/", "https://docs.gitlab.com/api/"],
    ["devto", "Dev.to", "https://dev.to/", "https://developers.forem.com/api"],
    [
      "hashnode",
      "Hashnode",
      "https://hashnode.com/",
      "https://apidocs.hashnode.com/",
    ],
    ["medium", "Medium", "https://medium.com/", "https://help.medium.com/"],
    [
      "behance",
      "Behance",
      "https://www.behance.net/",
      "https://help.behance.net/",
    ],
    [
      "dribbble",
      "Dribbble",
      "https://dribbble.com/",
      "https://developer.dribbble.com/",
    ],
    [
      "codepen",
      "CodePen",
      "https://codepen.io/",
      "https://blog.codepen.io/documentation/",
    ],
    [
      "huggingface",
      "Hugging Face",
      "https://huggingface.co/",
      "https://huggingface.co/docs/hub/index",
    ],
  ].map(([id, name, url, docs]) =>
    entry(id, name, "Developer & portfolio", url, docs),
  ),
  ...[
    [
      "reddit",
      "Reddit",
      "https://www.reddit.com/",
      "https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam",
    ],
    ["quora", "Quora", "https://www.quora.com/", "https://help.quora.com/"],
    [
      "indiehackers",
      "Indie Hackers",
      "https://www.indiehackers.com/",
      "https://www.indiehackers.com/",
    ],
    [
      "hackernews",
      "Hacker News",
      "https://news.ycombinator.com/",
      "https://news.ycombinator.com/newsguidelines.html",
    ],
    [
      "producthunt",
      "Product Hunt",
      "https://www.producthunt.com/",
      "https://api.producthunt.com/v2/docs",
    ],
    [
      "stackoverflow",
      "Stack Overflow",
      "https://stackoverflow.com/",
      "https://api.stackexchange.com/docs",
    ],
  ].map(([id, name, url, docs]) =>
    entry(id, name, "Communities", url, docs, {
      classification: "Manual publishing only",
      limitations:
        "Human-written or reviewed participation only. Prepare a useful draft, inspect community rules and submit it yourself. Automated mass promotion, answers, votes and comments are disabled.",
    }),
  ),
  entry(
    "buffer",
    "Buffer",
    "Publishing & marketing",
    "https://publish.buffer.com/",
    "https://developers.buffer.com/guides/getting-started.html",
    {
      adapter: "buffer",
      auth: "api_key",
      classification: "Official API publishing",
      actions: ["Open website", "Verify own Buffer workspace"],
      verifiedOn: "2026-11-16",
      requiredEnv: [],
      nextAction:
        "Sign in to Buffer, open its API settings and create an API key for your own account. Save it in the encrypted local connection form. This adapter verifies account/organization access; use the existing Postiz adapter for automatic publication in this release.",
      limitations:
        "Buffer uses an API key for this integration, not a fabricated OAuth flow. No Buffer publishing adapter is enabled yet. Its write-capable key is protected locally and used only for the documented account query.",
    },
  ),
  ...[
    [
      "wordpress",
      "WordPress",
      "https://wordpress.com/",
      "https://developer.wordpress.org/rest-api/",
    ],
    [
      "substack",
      "Substack",
      "https://substack.com/",
      "https://support.substack.com/",
    ],
    [
      "ghost",
      "Ghost",
      "https://ghost.org/",
      "https://docs.ghost.org/admin-api/",
    ],
    [
      "googlebusiness",
      "Google Business Profile",
      "https://business.google.com/",
      "https://developers.google.com/my-business/",
    ],
  ].map(([id, name, url, docs]) =>
    entry(id, name, "Publishing & marketing", url, docs),
  ),
  ...[
    [
      "gmail",
      "Gmail",
      "https://mail.google.com/",
      "https://developers.google.com/workspace/gmail/api/guides",
    ],
    [
      "outlook",
      "Outlook",
      "https://outlook.live.com/",
      "https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview",
    ],
    [
      "hubspot",
      "HubSpot",
      "https://app.hubspot.com/",
      "https://developers.hubspot.com/docs/api/overview",
    ],
    [
      "googlesheets",
      "Google Sheets",
      "https://sheets.google.com/",
      "https://developers.google.com/workspace/sheets/api/guides/concepts",
    ],
  ].map(([id, name, url, docs]) =>
    entry(id, name, "Email & CRM", url, docs, {
      classification: "Discovery or read-only integration",
      limitations:
        "Website shortcuts only. Reading email, sending messages, CRM writes and spreadsheet access are not enabled without a separately reviewed integration and scopes.",
    }),
  ),
];
export const getConnector = (id: string) => connectors.find((c) => c.id === id);
export type ConnectionRecord = {
  id: string;
  platform?: string;
  label?: string;
  identity?: string;
  status: ConnectionStatus;
  authMethod: string;
  lastAuth: string | null;
  lastCheck: string | null;
  lastPublished: string | null;
  accountName: string | null;
  lastError: string | null;
  nextAction: string;
  mode: "automatic" | "approval" | "manual";
  disabled: boolean;
  remoteIds: string[];
  checkedVia: string | null;
  revision?: number;
};
export type ConnectionView = Connector & {
  connection: ConnectionRecord;
  configured: boolean;
};
export type Notification = {
  id: string;
  type: "auth" | "publishing" | "browser" | "system";
  title: string;
  detail: string;
  entityId: string;
  createdAt: string;
  read: boolean;
};
export type BrowserState = {
  running: boolean;
  profileName: string;
  homepage: string;
  profilePath: string;
  tabs: { id: string; title: string; url: string }[];
  takeover: boolean;
  lastError?: string;
};
