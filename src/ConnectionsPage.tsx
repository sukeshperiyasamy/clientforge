import { useState, useEffect } from "react";
import { AccountConnections } from "./AccountConnections";
import { IntegrationAccounts } from "./IntegrationAccounts";
import {
  Globe2,
  ExternalLink,
  RefreshCw,
  Link2,
  Unlink,
  ShieldCheck,
  Monitor,
  Plus,
  Check,
  Search,
  Info,
  LogIn,
  Clock3,
  Camera,
  MousePointer2,
  X,
  Bell,
  LoaderCircle,
  Settings2,
} from "lucide-react";
import { api, screenshotFile, download } from "./api";
import type { Post } from "../shared/model";
import "./connection-extra.css";
import {
  type BrowserState,
  type ConnectionView,
  type Notification,
} from "../shared/connectors";
type Data = {
  connectors: ConnectionView[];
  browser: BrowserState;
  notifications: Notification[];
  emergency: boolean;
};
const stamp = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(v))
    : "Not yet";
const statusClass = (s: string) =>
  s === "Connected"
    ? "green"
    : ["Error", "Expired", "Verification Required"].includes(s)
      ? "red"
      : s === "Login Required"
        ? "orange"
        : "neutral";
export function ConnectionsPage({ posts = [] }: { posts?: Post[] }) {
  const [preparedPost, setPreparedPost] = useState("");
  const [data, setData] = useState<Data>();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All platforms");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<ConnectionView | null>(null);
  const [key, setKey] = useState("");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    text: string;
    action: () => Promise<unknown>;
  } | null>(null);
  const refresh = async () => setData(await api("/connections"));
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => void refresh().catch(() => {}), 8000);
    return () => clearInterval(timer);
  }, []);
  async function action(id: string, fn: () => Promise<any>, success = "") {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      const result = await fn();
      await refresh();
      setMessage(result?.nextAction || result?.message || success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (!data)
    return (
      <div className="loading" style={{ minHeight: 350 }}>
        <LoaderCircle className="spin" />
        {error || "Loading your connections…"}
      </div>
    );
  const groups = [
    "All platforms",
    ...new Set(data.connectors.map((c) => c.category)),
  ];
  const visible = data.connectors.filter(
    (c) =>
      (group === "All platforms" || c.category === group) &&
      `${c.name} ${c.category}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "connected"
          ? c.connection.status === "Connected"
          : filter === "attention"
            ? [
                "Expired",
                "Verification Required",
                "Error",
                "Login Required",
              ].includes(c.connection.status)
            : c.adapter === "manual")),
  );
  const unread = data.notifications.filter((n) => !n.read);
  return (
    <>
      <AccountConnections />
      <IntegrationAccounts />
      <div className="connection-safety">
        <span>
          <ShieldCheck size={15} />
          {data.emergency
            ? "Emergency stop active · automated work is blocked"
            : "Review gates and publishing limits are enforced"}
        </span>
        {data.emergency ? (
          <button
            className="text-button"
            onClick={() =>
              setConfirmation({
                title: "Reset emergency stop?",
                text: "This clears the emergency flag. Publishing will remain paused and recurring rules disabled until you explicitly enable them.",
                action: () => api("/emergency-resume", { confirm: true }),
              })
            }
          >
            Reset stop
          </button>
        ) : (
          <button
            className="text-button danger"
            disabled={Boolean(busy)}
            onClick={() =>
              void action("stop", () => api("/emergency-stop", {}))
            }
          >
            Emergency stop
          </button>
        )}
      </div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            ONE WORKSPACE. YOUR ACCOUNTS. YOUR CONTROL.
          </div>
          <h1>
            Account connections<span className="orange">.</span>
          </h1>
          <p>
            Keep your freelance presence together. Connect supported APIs and
            manage manual sessions separately.
          </p>
        </div>
        <button
          className="primary"
          disabled={Boolean(busy)}
          onClick={() =>
            void action(
              "browser",
              () => api("/browser/open", {}),
              "Dedicated project browser opened.",
            )
          }
        >
          <Monitor size={17} />
          {busy === "browser" ? "Opening…" : "Open Project Browser"}
        </button>
      </div>
      <section className="browser-panel panel">
        <div className="browser-heading">
          <span className="browser-orb">
            <Globe2 size={28} />
          </span>
          <div>
            <div className="row">
              <h2>FreelanceGrowth Browser</h2>
              <span
                className={
                  "badge " + (data.browser.running ? "green" : "neutral")
                }
              >
                {data.browser.running
                  ? "Open · manual control"
                  : "Closed · profile retained"}
              </span>
            </div>
            <p>
              A dedicated, persistent profile. You handle sign-in, verification
              and two-factor authentication.
            </p>
          </div>
          <ShieldCheck size={23} className="browser-shield" />
        </div>
        <div className="browser-facts">
          <span>
            <ShieldCheck size={14} />
            Isolated from personal Chrome
          </span>
          <span>
            <Clock3 size={14} />
            Sessions persist where supported
          </span>
          <span>
            <MousePointer2 size={14} />
            You stay in control
          </span>
        </div>
        {data.browser.running && (
          <div className="browser-tabs">
            <div className="row between">
              <strong>
                Project browser tabs{" "}
                <span className="muted">({data.browser.tabs.length})</span>
              </strong>
              <div className="row">
                <button
                  className="text-button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void action(
                      "takeover",
                      () => api("/browser/takeover", {}),
                      "Manual control confirmed.",
                    )
                  }
                >
                  <MousePointer2 size={14} />
                  Manual takeover
                </button>
                <button
                  className="text-button danger"
                  onClick={() =>
                    setConfirmation({
                      title: "Close project browser?",
                      text: "All project tabs will close. Unsaved forms can be lost. Cookies and browser storage will be retained.",
                      action: () => api("/browser/close", { confirm: true }),
                    })
                  }
                >
                  Close browser
                </button>
              </div>
            </div>
            {data.browser.tabs.map((tab) => (
              <div className="browser-tab" key={tab.id}>
                <Globe2 size={15} />
                <div>
                  <strong>{tab.title || "Project browser tab"}</strong>
                  <small>{tab.url}</small>
                </div>
                <button
                  className="icon-button"
                  title="Focus tab"
                  aria-label={`Focus ${tab.title}`}
                  onClick={() =>
                    void action(tab.id, () =>
                      api(`/browser/tabs/${tab.id}/focus`, {}),
                    )
                  }
                >
                  <ExternalLink size={16} />
                </button>
                <button
                  className="icon-button"
                  title="Save a local screenshot"
                  aria-label={`Screenshot ${tab.title}`}
                  onClick={() =>
                    setConfirmation({
                      title: "Save a local screenshot?",
                      text: "Visible page content may include private information. The screenshot stays in the protected project folder and is never sent to AI. Authentication screens cannot be captured.",
                      action: async () => {
                        const shot = await api(
                          `/browser/tabs/${tab.id}/screenshot`,
                          { confirm: true },
                        );
                        await screenshotFile(shot.file);
                      },
                    })
                  }
                >
                  <Camera size={16} />
                </button>
                <button
                  className="icon-button"
                  title="Close tab"
                  aria-label={`Close ${tab.title}`}
                  onClick={() =>
                    setConfirmation({
                      title: "Close this browser tab?",
                      text: "Unsaved work in this tab could be lost. The browser profile and other tabs will remain.",
                      action: () =>
                        api(`/browser/tabs/${tab.id}/close`, { confirm: true }),
                    })
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="connection-stats">
        <div>
          <strong>{data.connectors.length}</strong>
          <span>Platform entries</span>
        </div>
        <div>
          <strong>
            {
              data.connectors.filter((c) => c.connection.status === "Connected")
                .length
            }
          </strong>
          <span>Verified API connections</span>
        </div>
        <div>
          <strong>
            {data.connectors.filter((c) => c.adapter === "manual").length}
          </strong>
          <span>Manual / assisted</span>
        </div>
        <div>
          <strong>
            {
              data.connectors.filter((c) =>
                [
                  "Expired",
                  "Verification Required",
                  "Error",
                  "Login Required",
                ].includes(c.connection.status),
              ).length
            }
          </strong>
          <span>Need your attention</span>
        </div>
      </div>
      {error && (
        <div className="connection-alert error" role="alert">
          <Info size={18} />
          {error}
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {message && (
        <div className="connection-alert" role="status">
          <Check size={18} />
          {message}
          <button
            className="icon-button"
            onClick={() => setMessage("")}
            aria-label="Dismiss status"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {unread.length > 0 && (
        <details className="panel notification-list">
          <summary>
            <Bell size={16} />
            {unread.length} notification{unread.length === 1 ? "" : "s"} need
            attention
          </summary>
          {unread.slice(0, 10).map((n) => (
            <div key={n.id}>
              <div>
                <strong>{n.title}</strong>
                <p>{n.detail}</p>
                <small>{stamp(n.createdAt)}</small>
              </div>
              <button
                className="text-button"
                onClick={() =>
                  void action(n.id, () =>
                    api(`/notifications/${n.id}/read`, {}),
                  )
                }
              >
                Mark read
              </button>
            </div>
          ))}
        </details>
      )}
      <div className="connections-toolbar">
        <div className="connection-search">
          <Search size={16} />
          <input
            aria-label="Search platforms"
            placeholder="Search platforms or services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter connection status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All connection states</option>
          <option value="connected">Verified connections</option>
          <option value="attention">Needs attention</option>
          <option value="manual">Manual / assisted</option>
        </select>
        <button
          className="secondary"
          disabled={Boolean(busy)}
          onClick={() =>
            void action("refresh", refresh, "Connection metadata refreshed.")
          }
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
      <div
        className="connection-categories"
        role="group"
        aria-label="Platform categories"
      >
        {groups.map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={group === g ? "selected" : ""}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="connections-grid">
        {visible.map((c) => (
          <article className="panel connection-card" key={c.id}>
            <div className="connection-card-header">
              <span
                className="connection-logo"
                style={{ background: c.color + "12", color: c.color }}
              >
                {c.icon}
              </span>
              <div>
                <h2>{c.name}</h2>
                <span>{c.category}</span>
              </div>
              <span className={"badge " + statusClass(c.connection.status)}>
                {c.connection.status}
              </span>
            </div>
            <button
              className="connection-url"
              title="Open in the project browser"
              disabled={Boolean(busy)}
              onClick={() =>
                void action(
                  c.id,
                  () => api(`/connections/${c.id}/open`, {}),
                  "Website opened in your project browser.",
                )
              }
            >
              {new URL(c.url).hostname}
              <ExternalLink size={11} />
            </button>
            <div className="connection-method">
              <span>{c.classification}</span>
              <small>
                {c.auth === "oauth"
                  ? "Official OAuth · PKCE"
                  : c.auth === "postiz"
                    ? "OAuth via Postiz"
                    : c.auth === "api_key"
                      ? "Encrypted API key"
                      : "Manual website sign-in"}
              </small>
            </div>
            <div className="connection-dates">
              <div>
                <span>Authenticated</span>
                <strong>{stamp(c.connection.lastAuth)}</strong>
              </div>
              <div>
                <span>Last checked</span>
                <strong>{stamp(c.connection.lastCheck)}</strong>
              </div>
              <div>
                <span>Last published</span>
                <strong>{stamp(c.connection.lastPublished)}</strong>
              </div>
            </div>
            {c.connection.accountName && (
              <div className="verified-account">
                <Check size={13} />
                {c.connection.accountName}
              </div>
            )}
            <div className="connection-actions-supported">
              {c.actions.map((a) => (
                <span key={a}>{a}</span>
              ))}
            </div>
            <p className="connection-next">
              <Info size={13} />
              <span>{c.connection.nextAction}</span>
            </p>
            <div className="connection-card-actions">
              <button
                className="secondary small"
                disabled={Boolean(busy)}
                onClick={() =>
                  void action(
                    c.id,
                    () => api(`/connections/${c.id}/open`, {}),
                    "Website opened in your project browser.",
                  )
                }
              >
                <ExternalLink size={13} />
                Open Website
              </button>
              <button
                className="primary small"
                disabled={Boolean(busy)}
                onClick={() => {
                  if (c.adapter === "buffer") {
                    setDetail(c);
                    return;
                  }
                  void action(c.id, () =>
                    api(`/connections/${c.id}/connect`, {}),
                  );
                }}
              >
                <Link2 size={13} />
                {c.connection.status === "Connected"
                  ? "Reconnect"
                  : "Connect Account"}
              </button>
              <button
                className="text-button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void action(
                    c.id,
                    () => api(`/connections/${c.id}/test`, {}),
                    "Connection checked.",
                  )
                }
              >
                <RefreshCw size={13} />
                Test Connection
              </button>
              <button className="text-button" onClick={() => setDetail(c)}>
                <Settings2 size={13} />
                Setup & limits
              </button>
            </div>
            <div className="connection-bottom">
              <button
                className="text-button"
                disabled={Boolean(busy)}
                onClick={() =>
                  setConfirmation({
                    title: `Disconnect ${c.name}?`,
                    text: "This removes local API authorization and cancels pending local jobs for this connection. Supported direct OAuth tokens will be revoked where possible. Website sessions remain until you sign out manually; already-submitted Postiz posts must be managed in Postiz.",
                    action: () =>
                      api(`/connections/${c.id}/disconnect`, { confirm: true }),
                  })
                }
              >
                <Unlink size={12} />
                Disconnect Account
              </button>
              {[
                "Expired",
                "Error",
                "Verification Required",
                "Login Required",
              ].includes(c.connection.status) && (
                <button
                  className="text-button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void action(c.id, () =>
                      api(`/connections/${c.id}/connect`, {}),
                    )
                  }
                >
                  Reconnect
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="empty">
          <Search size={28} />
          <h3>No matching connections</h3>
          <p>Change your search or filters to see more platforms.</p>
        </div>
      )}
      <div className="info-banner" style={{ marginTop: 24 }}>
        <ShieldCheck size={20} />
        <span>
          A website shortcut is not a working API integration. “Connected”
          requires a successful authenticated API check. Manual website logins
          stay unverified unless an approved verifier is implemented.
        </span>
      </div>
      {detail && (
        <div className="overlay">
          <section
            className="modal connection-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${detail.name} setup`}
          >
            <div className="modal-header">
              <h2>{detail.name}: setup & permissions</h2>
              <button
                className="icon-button"
                aria-label="Close setup"
                onClick={() => {
                  setDetail(null);
                  setKey("");
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="connection-dialog-body">
              <span
                className={"badge " + statusClass(detail.connection.status)}
              >
                {detail.connection.status}
              </span>
              <h3>Next action</h3>
              <p>{detail.nextAction}</p>
              {detail.requiredEnv.length > 0 && (
                <>
                  <h3>Local configuration placeholders</h3>
                  <pre>
                    {detail.requiredEnv
                      .map((v) => `${v}=<set locally in .env>`)
                      .join("\n")}
                  </pre>
                  <small>
                    Never paste these secrets into an AI prompt. Restart after
                    editing environment configuration.
                  </small>
                </>
              )}
              <h3>Supported actions</h3>
              <label className="field">
                <span>Prepare a manual submission from approved content</span>
                <select
                  value={preparedPost}
                  onChange={(e) => setPreparedPost(e.target.value)}
                >
                  <option value="">Select an approved post</option>
                  {posts
                    .filter((p) => p.status === "approved")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} · {p.platform}
                      </option>
                    ))}
                </select>
                <small>
                  Review suitability for this site. This exports content and
                  opens the website; it does not fill or submit a form.
                </small>
              </label>
              <button
                className="secondary"
                disabled={!preparedPost || Boolean(busy)}
                onClick={() =>
                  void action("prepare", async () => {
                    const result = await api(
                      `/connections/${detail.id}/prepare`,
                      { postId: preparedPost },
                    );
                    download(
                      `${detail.id}-${preparedPost}.txt`,
                      result.content,
                    );
                    return result;
                  })
                }
              >
                Prepare content & open website
              </button>
              <ul>
                {detail.actions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <h3>Permission limits</h3>
              <p>{detail.limitations}</p>
              <h3>Operating mode</h3>
              <label className="field">
                <span>Connection operating mode</span>
                <select
                  value={detail.connection.mode}
                  disabled={Boolean(busy)}
                  onChange={(e) => {
                    const mode = e.target.value as
                      | "automatic"
                      | "approval"
                      | "manual";
                    setDetail({
                      ...detail,
                      connection: { ...detail.connection, mode },
                    });
                    void action(
                      "mode",
                      () =>
                        api(`/connections/${detail.id}/mode`, { mode }, "PUT"),
                      "Operating mode updated.",
                    );
                  }}
                >
                  <option value="manual">Mode C · Manual</option>
                  <option
                    value="approval"
                    disabled={detail.adapter === "manual"}
                  >
                    Mode B · Approval required
                  </option>
                  <option
                    value="automatic"
                    disabled={
                      detail.connection.status !== "Connected" ||
                      !detail.actions.includes(
                        "Publish reviewed content through existing adapter",
                      )
                    }
                  >
                    Mode A · API automatic, approved content only
                  </option>
                </select>
                <small>
                  Mode A does not approve new drafts or enable additional API
                  permissions. Content review, global pause and per-platform
                  limits remain enforced.
                </small>
              </label>
              <p className="muted">
                {detail.verifiedOn
                  ? `Adapter documentation checked ${detail.verifiedOn}. Account eligibility is checked when you connect.`
                  : "Registry entry only. Automated actions remain disabled until current documentation and policies are verified."}
              </p>
              <a
                className="text-button"
                href={detail.docs}
                rel="noreferrer"
                target="_blank"
              >
                Official setup / policy reference <ExternalLink size={14} />
              </a>
              {detail.connection.checkedVia && (
                <>
                  <h3>Last check method</h3>
                  <p>{detail.connection.checkedVia}</p>
                </>
              )}
              {detail.adapter === "buffer" && (
                <form
                  className="buffer-key"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const secret = key;
                    setKey("");
                    void action(
                      "buffer-key",
                      () => api("/connections/buffer/key", { key: secret }),
                      "Buffer API key verified.",
                    );
                    setDetail(null);
                  }}
                >
                  <label className="field">
                    <span>Buffer API key · encrypted locally</span>
                    <input
                      type="password"
                      autoComplete="off"
                      required
                      minLength={10}
                      maxLength={4096}
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                    />
                  </label>
                  <button className="primary" disabled={Boolean(busy)}>
                    <ShieldCheck size={15} />
                    Save encrypted key & test
                  </button>
                </form>
              )}
            </div>
          </section>
        </div>
      )}
      {confirmation && (
        <div className="overlay">
          <section
            className="modal connection-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={confirmation.title}
          >
            <div className="modal-header">
              <h2>{confirmation.title}</h2>
              <button
                className="icon-button"
                aria-label="Cancel action"
                onClick={() => setConfirmation(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="connection-dialog-body">
              <p>{confirmation.text}</p>
              <div className="form-actions">
                <button
                  className="secondary"
                  onClick={() => setConfirmation(null)}
                >
                  Cancel
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    const task = confirmation.action;
                    setConfirmation(null);
                    void action("confirmed", task, "Action completed.");
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
