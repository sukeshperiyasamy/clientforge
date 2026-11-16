import React, { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  CirclePause,
  CirclePlay,
  Clock3,
  Code2,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe2,
  Layers3,
  Link2,
  LoaderCircle,
  Menu,
  MessageSquare,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { api, session, upload, download, exportData } from "./api";
import {
  services,
  platforms,
  type State,
  type Project,
  type Post,
  type Lead,
  type Settings,
  type Platform,
  type Job,
  type Rule,
} from "../shared/model";
import { zonedToIso } from "../shared/time";
import "./style.css";
import { ConnectionsPage } from './ConnectionsPage';
import { AuthGate } from './AuthGate';

const nav = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "projects", label: "Project library", icon: FolderOpen },
  { id: "studio", label: "Content studio", icon: WandSparkles },
  { id: "cadence", label: "Content cadence", icon: Clock3 },
  { id: "calendar", label: "Publishing calendar", icon: CalendarDays },
  { id: "leads", label: "Client pipeline", icon: Users },
  { id: "connections", label: "Connections", icon: Link2 },
  { id: "channels", label: "Channels", icon: Globe2 },
  { id: "settings", label: "Workspace settings", icon: Settings2 },
];
const iconByService = {
  web: Code2,
  mobile: Layers3,
  data: Database,
  ai: Video,
};
const names = Object.fromEntries(platforms.map((p) => [p.id, p.name]));
const date = (value: string, timezone = "Asia/Kolkata") =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Empty({
  icon: Icon = FolderOpen,
  title,
  description,
  action,
}: {
  icon?: typeof FolderOpen;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={28} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".modal button,.modal input,.modal textarea,.modal select,.modal a[href]",
          ),
        ).filter((e) => !e.hasAttribute("disabled"));
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    document
      .querySelector<HTMLElement>(".modal input,.modal textarea,.modal button")
      ?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
type Run = (task: () => Promise<unknown>, message?: string) => Promise<void>;
function App() {
  const [state, setState] = useState<State>();
  const [page, setPage] = useState(location.pathname==='/connections'?'connections':'overview');
  const [notice, setNotice] = useState<{ message: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState("");
  const [menu, setMenu] = useState(false);
  const [project, setProject] = useState<Project | "new" | null>(null);
  const [post, setPost] = useState<Post | "new" | null>(null);
  const [lead, setLead] = useState<Lead | "new" | null>(null);
  const [scheduled, setScheduled] = useState<Post | null>(null);
  const [rule, setRule] = useState<Rule | "new" | null>(null);
  const refresh = async () => setState(await api<State>("/state"));
  useEffect(() => {
    let stopped = false;
    session()
      .then(refresh)
      .catch((e) => setFatal(e.message));
    const interval = setInterval(() => {
      if (!stopped) void refresh().catch(() => {});
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(undefined), 8000);
    return () => clearTimeout(t);
  }, [notice]);
  const run: Run = async (task, message) => {
    setBusy(true);
    try {
      await task();
      await refresh();
      if (message) setNotice({ message, error: false });
    } catch (e) {
      setNotice({
        message: e instanceof Error ? e.message : "Operation failed",
        error: true,
      });
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const doRun = (task: () => Promise<unknown>, message?: string) =>
    void run(task, message).catch(() => {});
  if (fatal)
    return (
      <div className="loading">
        <h2>Could not open ClientForge</h2>
        <p>{fatal}</p>
        <button onClick={() => location.reload()}>Retry</button>
      </div>
    );
  if (!state)
    return (
      <div className="loading">
        <LoaderCircle className="spin" />
        <p>Opening your growth workspace…</p>
      </div>
    );
  const changePage = (id: string) => {
    setPage(id);
    history.replaceState(null,'',id==='connections'?'/connections':'/');
    setMenu(false);
  };
  const approved = state.posts.filter((p) => p.status === "approved").length;
  const activeJobs = state.jobs.filter((j) => j.status === "scheduled").length;
  const nextAction = () => {
    if (!state.projects.length) {
      setProject("new");
      return;
    }
    setPage("studio");
  };
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <a className="brand" href="/" aria-label="ClientForge home">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          <span>
            client<span className="brand-light">forge</span>
            <small>YOUR FREELANCE GROWTH STUDIO</small>
          </span>
        </a>
        <div className="workspace">
          <span className="avatar">
            {state.settings.name.slice(0, 1).toUpperCase() || "Y"}
          </span>
          <div>
            <strong>{state.settings.name || "Your workspace"}</strong>
            <small>Personal workspace</small>
          </div>
          <Badge>LOCAL</Badge>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => changePage(item.id)}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === "studio" && state.posts.length > 0 && (
                <span className="nav-count">{state.posts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="agent-card">
            <div>
              <span
                className={
                  "status-dot " + (state.health.antigravity ? "green" : "")
                }
              />
              <strong>Antigravity CLI</strong>
            </div>
            <small>
              {state.health.antigravity
                ? "Installed · ready for generation"
                : "CLI not detected"}
            </small>
            <span>Evidence in. Better content out.</span>
          </div>
          <a href="/portfolio" target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> Preview portfolio
          </a>
          <div className="sidebar-foot">
            <ShieldCheck size={15} /> Private, local workspace <span>v0.1</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="timezone">
              <Globe2 size={14} />
              {state.settings.timezone}
            </span>
            <button
              className={
                "publish-toggle " + (!state.settings.paused ? "running" : "")
              }
              onClick={() =>
                doRun(
                  () =>
                    api(
                      "/settings",
                      { ...state.settings, paused: !state.settings.paused },
                      "PUT",
                    ),
                  state.settings.paused
                    ? "Local publishing queue resumed."
                    : "Local publishing queue paused.",
                )
              }
              title="Controls local queued jobs; submitted posts are managed in Postiz"
            >
              {state.settings.paused ? (
                <CirclePause size={15} />
              ) : (
                <CirclePlay size={15} />
              )}
              Publishing {state.settings.paused ? "paused" : "resumed"}
            </button>
            <span className="top-avatar">
              {state.settings.name.slice(0, 1).toUpperCase() || "Y"}
            </span>
          </div>
        </header>
        <div className="page-content">
          {page === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">BUILD. SHOWCASE. CONNECT.</div>
                  <h1>
                    Your work deserves to be seen
                    <span className="orange">.</span>
                  </h1>
                  <p>
                    Turn the projects you build into conversations with your
                    next clients.
                  </p>
                </div>
                <button className="primary" onClick={nextAction}>
                  <Plus size={17} />
                  Create content
                </button>
              </div>
              {(!state.settings.name ||
                !state.accounts.some((a) => !a.disabled)) && (
                <div className="setup-banner">
                  <div className="setup-icon">
                    <Rocket size={22} />
                  </div>
                  <div>
                    <strong>Let’s set up your client acquisition engine</strong>
                    <p>
                      Your workspace is ready. Add your profile, showcase a
                      project, then connect a channel.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setPage("settings")}
                  >
                    Complete setup <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <div className="stats-grid">
                {[
                  {
                    label: "Portfolio projects",
                    value: state.projects.length,
                    icon: BriefcaseBusiness,
                    sub: "Real work, ready to showcase",
                    tone: "purple",
                  },
                  {
                    label: "Content drafts",
                    value: state.posts.length,
                    icon: FileText,
                    sub: `${approved} approved for publishing`,
                    tone: "blue",
                  },
                  {
                    label: "Scheduled posts",
                    value: activeJobs,
                    icon: CalendarDays,
                    sub: state.settings.paused
                      ? "Queue is currently paused"
                      : "Waiting for their scheduled time",
                    tone: "orange",
                  },
                  {
                    label: "Client enquiries",
                    value: state.leads.length,
                    icon: MessageSquare,
                    sub: `${state.leads.filter((l) => l.status === "qualified").length} qualified opportunities`,
                    tone: "green",
                  },
                ].map((s) => (
                  <section className="stat-card" key={s.label}>
                    <div className="stat-top">
                      <span>{s.label}</span>
                      <span className={"stat-icon " + s.tone}>
                        <s.icon size={18} />
                      </span>
                    </div>
                    <strong>{s.value.toString().padStart(2, "0")}</strong>
                    <small>{s.sub}</small>
                  </section>
                ))}
              </div>
              <div className="overview-grid">
                <section className="panel workflow-panel">
                  <div className="panel-title">
                    <div>
                      <h2>A repeatable path to your next client</h2>
                      <p>
                        Your portfolio is the starting point. Make every step
                        count.
                      </p>
                    </div>
                    <Badge tone="orange">YOUR WORKFLOW</Badge>
                  </div>
                  <div className="workflow">
                    {[
                      {
                        n: "01",
                        icon: FolderOpen,
                        title: "Add your work",
                        text: "A project, a problem solved, proof of what you delivered.",
                        done: state.projects.length > 0,
                        action: () => setProject("new"),
                      },
                      {
                        n: "02",
                        icon: Sparkles,
                        title: "Create with Antigravity",
                        text: "Platform-specific drafts, grounded in your project evidence.",
                        done: state.posts.length > 0,
                        action: () => setPage("studio"),
                      },
                      {
                        n: "03",
                        icon: CheckCheck,
                        title: "Review & schedule",
                        text: "Approve the exact version. Publish through connected accounts.",
                        done: state.jobs.length > 0,
                        action: () => setPage("calendar"),
                      },
                      {
                        n: "04",
                        icon: Users,
                        title: "Turn interest into clients",
                        text: "Track enquiries, proposals and the projects you win.",
                        done: state.leads.length > 0,
                        action: () => setPage("leads"),
                      },
                    ].map((w) => (
                      <button
                        key={w.n}
                        onClick={w.action}
                        className="workflow-step"
                      >
                        <span className={"step-icon " + (w.done ? "done" : "")}>
                          <w.icon size={20} />
                        </span>
                        <div>
                          <small>STEP {w.n}</small>
                          <strong>{w.title}</strong>
                          <p>{w.text}</p>
                        </div>
                        {w.done ? (
                          <Check size={17} className="green-text" />
                        ) : (
                          <ChevronRight size={17} />
                        )}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel activity-panel">
                  <div className="panel-title">
                    <h2>Workspace activity</h2>
                    <Activity size={17} />
                  </div>
                  {state.audit.length ? (
                    <div className="activity-list">
                      {state.audit.slice(0, 5).map((a) => (
                        <div key={a.id} className="activity-item">
                          <span className="activity-dot" />
                          <div>
                            <strong>
                              {a.event
                                .replaceAll(".", " ")
                                .replaceAll("_", " ")}
                            </strong>
                            <small>
                              {date(a.createdAt, state.settings.timezone)}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="activity-empty">
                      <div className="orbit">
                        <Activity size={25} />
                      </div>
                      <strong>Your story starts here</strong>
                      <p>
                        Add your first project to start building a consistent
                        online presence.
                      </p>
                      <button
                        className="secondary"
                        onClick={() => setProject("new")}
                      >
                        Add first project <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                  <div className="panel-bottom">
                    <ShieldCheck size={15} />
                    <span>Real activity. No simulated growth metrics.</span>
                  </div>
                </section>
              </div>
              <div className="section-heading">
                <div>
                  <h2>Four ways you help businesses</h2>
                  <p>Focused offers for the right buyers, wherever they are.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setPage("projects")}
                >
                  View project library <ArrowRight size={16} />
                </button>
              </div>
              <div className="service-grid">
                {services.map((s) => {
                  const Icon = iconByService[s.id];
                  return (
                    <button
                      key={s.id}
                      className="service-card"
                      onClick={() => setProject("new")}
                    >
                      <span
                        className="service-icon"
                        style={{ color: s.color, background: s.color + "16" }}
                      >
                        <Icon size={23} />
                      </span>
                      <h3>{s.name}</h3>
                      <p>{s.description}</p>
                      <div>
                        <span>
                          {
                            state.projects.filter((p) => p.service === s.id)
                              .length
                          }{" "}
                          projects
                        </span>
                        <ArrowRight size={16} />
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="bottom-note">
                <Globe2 size={17} />
                <p>
                  Built for your global freelance practice. Start with a few
                  channels. Expand with evidence.
                </p>
                <span>QUALITY OVER VOLUME</span>
              </div>
            </>
          )}
          {page === "projects" && (
            <>
              <PageHeading
                eyebrow="YOUR WORK IS YOUR PROOF"
                title="Project library"
                text="Give every post a real project, a clear outcome, and something worth showing."
                action={
                  <button className="primary" onClick={() => setProject("new")}>
                    <Plus size={17} />
                    Add project
                  </button>
                }
              />
              {state.projects.length ? (
                <div className="project-grid">
                  {state.projects.map((p) => (
                    <article className="panel project-card" key={p.id}>
                      <div className={"project-art " + p.service}>
                        {React.createElement(iconByService[p.service], {
                          size: 38,
                        })}
                        <span>
                          {services.find((s) => s.id === p.service)?.name}
                        </span>
                      </div>
                      <div className="project-body">
                        <div className="row">
                          <Badge tone={p.demo ? "orange" : "green"}>
                            {p.demo ? "DEMO PROJECT" : "CLIENT WORK"}
                          </Badge>
                          <Badge>
                            {p.permission
                              ? "Showcase allowed"
                              : "Permission needed"}
                          </Badge>
                        </div>
                        <h2>{p.title}</h2>
                        <p className="clamp">{p.problem}</p>
                        <div className="project-meta">
                          <span>
                            <FileText size={14} />
                            {
                              state.posts.filter(
                                (post) => post.projectId === p.id,
                              ).length
                            }{" "}
                            posts
                          </span>
                          <span>
                            <Layers3 size={14} />
                            {p.assetIds.length} assets
                          </span>
                        </div>
                        <div className="row">
                          <button
                            className="secondary"
                            onClick={() => setProject(p)}
                          >
                            Edit project
                          </button>
                          <button
                            className="text-button"
                            onClick={() => setPage("studio")}
                          >
                            Create content <ArrowRight size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <section className="panel">
                  <Empty
                    title="Start with something you built"
                    description="Add a client project you can share, or a clearly labelled demonstration. Antigravity will use this evidence to write your content."
                    action={
                      <div className="row centered">
                        <button
                          className="primary"
                          onClick={() => setProject("new")}
                        >
                          <Plus size={16} />
                          Add project
                        </button>
                        <button
                          className="secondary"
                          onClick={() =>
                            doRun(
                              () => api("/projects/example", {}),
                              "Development demo added.",
                            )
                          }
                        >
                          Use development demo
                        </button>
                      </div>
                    }
                  />
                </section>
              )}
            </>
          )}
          {page === "studio" && (
            <>
              <PageHeading
                eyebrow="EVIDENCE → CONTENT"
                title="Content studio"
                text="Create useful, distinct posts from your work. Every draft stays yours to review."
                action={
                  <button
                    className="secondary"
                    disabled={!state.projects.length}
                    onClick={() => setPost("new")}
                  >
                    <Plus size={17} />
                    Write a post
                  </button>
                }
              />
              <GenerationPanel state={state} run={run} />
              <div className="section-heading">
                <div>
                  <h2>
                    Your content desk{" "}
                    <span className="count">{state.posts.length}</span>
                  </h2>
                  <p>
                    Editing a post resets approval and cancels its pending local
                    schedules.
                  </p>
                </div>
              </div>
              {state.posts.length ? (
                <div className="post-grid">
                  {state.posts.map((p) => (
                    <article className="panel post-card" key={p.id}>
                      <div className="row between">
                        <div className="platform-name">
                          <span className={"platform-icon " + p.platform}>
                            {p.platform === "linkedin"
                              ? "in"
                              : p.platform.slice(0, 2).toUpperCase()}
                          </span>
                          <strong>{names[p.platform]}</strong>
                        </div>
                        <Badge
                          tone={p.status === "approved" ? "green" : "orange"}
                        >
                          {p.status}
                        </Badge>
                      </div>
                      <small className="post-project">
                        {
                          state.projects.find((x) => x.id === p.projectId)
                            ?.title
                        }{" "}
                        · v{p.version}
                      </small>
                      <h3>{p.title}</h3>
                      <p className="post-content">{p.content}</p>
                      <div className="post-foot">
                        <span>
                          {[...p.content].length} /{" "}
                          {platforms.find((x) => x.id === p.platform)?.limit}{" "}
                          characters
                        </span>
                        <span>{p.assetIds.length} attachments</span>
                      </div>
                      <div className="post-actions">
                        <button
                          className="secondary small"
                          onClick={() => setPost(p)}
                        >
                          Review & edit
                        </button>
                        {p.status === "draft" ? (
                          <button
                            className="text-button"
                            onClick={() =>
                              doRun(
                                () => api(`/posts/${p.id}/approve`, {}),
                                "Current version approved.",
                              )
                            }
                          >
                            <Check size={15} />
                            Approve
                          </button>
                        ) : (
                          <button
                            className="text-button"
                            onClick={() => setScheduled(p)}
                          >
                            <CalendarDays size={15} />
                            Schedule
                          </button>
                        )}
                        <button
                          className="icon-button"
                          aria-label="Export post"
                          title="Export for manual posting"
                          onClick={() =>
                            download(
                              `${p.platform}-post.txt`,
                              `${p.title}\n\n${p.content}`,
                            )
                          }
                        >
                          <ArrowDownToLine size={17} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <section className="panel">
                  <Empty
                    icon={WandSparkles}
                    title="Your next post starts with your work"
                    description="Choose a project above and ask Antigravity for platform-specific drafts, or write one yourself."
                  />
                </section>
              )}
            </>
          )}
          {page === "cadence" && (
            <>
              <PageHeading
                eyebrow="A ROUTINE THAT KEEPS YOU VISIBLE"
                title="Content cadence"
                text="Automatically prepare fresh draft batches on selected weekdays. Review and approve before scheduling."
                action={
                  <button
                    className="primary"
                    disabled={!state.projects.length}
                    onClick={() => setRule("new")}
                  >
                    <Plus size={17} />
                    Add recurring batch
                  </button>
                }
              />
              <div className="info-banner">
                <Clock3 size={19} />
                <span>
                  Runs locally while the app is open. Projects rotate between
                  batches. Missed runs over a day old are skipped; nothing is
                  published without approval.
                </span>
              </div>
              {state.rules?.length ? (
                <div className="project-grid">
                  {state.rules.map((r) => (
                    <article key={r.id} className="panel settings-panel">
                      <div className="row between">
                        <h2>{r.name}</h2>
                        <Badge tone={r.enabled ? "green" : "neutral"}>
                          {r.enabled ? "Enabled" : "Paused"}
                        </Badge>
                      </div>
                      <p>
                        {r.weekdays
                          .map(
                            (d) =>
                              ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                                d
                              ],
                          )
                          .join(", ")}{" "}
                        · {r.localTime} · {r.timezone}
                        <br />
                        {r.platforms.map((p) => names[p]).join(", ")}
                      </p>
                      <p>{r.focus}</p>
                      <small className="muted">
                        Next batch: {date(r.nextRunAt, r.timezone)} ·{" "}
                        {r.projectIds.length} source projects
                      </small>
                      <div className="form-actions">
                        <button
                          className="secondary"
                          onClick={() => setRule(r)}
                        >
                          Edit cadence
                        </button>
                        <button
                          className="text-button"
                          onClick={() =>
                            doRun(
                              () =>
                                api(
                                  `/rules/${r.id}`,
                                  { ...r, enabled: !r.enabled },
                                  "PUT",
                                ),
                              "Content cadence updated.",
                            )
                          }
                        >
                          {r.enabled ? "Pause" : "Enable"} batches
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <section className="panel">
                  <Empty
                    icon={Clock3}
                    title="Build a sustainable posting routine"
                    description="Choose your work, platforms and weekdays. Antigravity prepares recurring drafts while you keep control of approval and publication."
                    action={
                      <button
                        className="primary"
                        disabled={!state.projects.length}
                        onClick={() => setRule("new")}
                      >
                        Create a recurring draft batch
                      </button>
                    }
                  />
                </section>
              )}
            </>
          )}
          {page === "calendar" && (
            <>
              <PageHeading
                eyebrow="CONSISTENCY, WITH CONTROL"
                title="Publishing calendar"
                text={`Scheduled times are shown in ${state.settings.timezone}. Your computer must stay on for local jobs.`}
              />
              <div className="info-banner">
                <ShieldCheck size={19} />
                <span>
                  {state.health.publishingEnabled
                    ? "Publishing is enabled in the environment."
                    : "Live publishing is disabled in the environment."}{" "}
                  {state.settings.paused
                    ? "Your local queue is paused."
                    : "Your local queue is resumed."}{" "}
                  A provider submission is tracked separately from confirmed
                  publication.
                </span>
              </div>
              {state.jobs.length ? (
                <div className="panel table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Content</th>
                        <th>Channel</th>
                        <th>Scheduled time</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...state.jobs]
                        .sort((a, b) =>
                          a.scheduledAt.localeCompare(b.scheduledAt),
                        )
                        .map((j) => (
                          <tr key={j.id}>
                            <td>
                              <strong>{j.snapshot.title}</strong>
                              {j.error && (
                                <small className="error-text">{j.error}</small>
                              )}
                              {j.remoteId && (
                                <small>Remote ID: {j.remoteId}</small>
                              )}
                            </td>
                            <td>{names[j.snapshot.platform]}</td>
                            <td>
                              {date(j.scheduledAt, state.settings.timezone)}
                            </td>
                            <td>
                              <Badge
                                tone={
                                  j.status === "published"
                                    ? "green"
                                    : j.status === "unknown" ||
                                        j.status === "failed"
                                      ? "red"
                                      : "neutral"
                                }
                              >
                                {j.status}
                              </Badge>
                            </td>
                            <td>
                              {j.status === "scheduled" && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    doRun(
                                      () => api(`/jobs/${j.id}/cancel`, {}),
                                      "Schedule cancelled.",
                                    )
                                  }
                                >
                                  Cancel
                                </button>
                              )}
                              {["unknown", "submitted"].includes(j.status) && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    doRun(
                                      () => api(`/jobs/${j.id}/reconcile`, {}),
                                      "Remote status checked.",
                                    )
                                  }
                                >
                                  <RefreshCw size={14} />
                                  Check provider
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <section className="panel">
                  <Empty
                    icon={CalendarDays}
                    title="Make room for your next project"
                    description="Approve a post in Content studio, then choose a connected account and a publishing time."
                    action={
                      <button
                        className="primary"
                        onClick={() => setPage("studio")}
                      >
                        Open content studio <ArrowRight size={16} />
                      </button>
                    }
                  />
                </section>
              )}
            </>
          )}
          {page === "leads" && (
            <>
              <PageHeading
                eyebrow="CONVERSATIONS → CLIENTS"
                title="Client pipeline"
                text="Track the opportunities your work creates, from the first enquiry to a paid project."
                action={
                  <button className="primary" onClick={() => setLead("new")}>
                    <Plus size={17} />
                    Add enquiry
                  </button>
                }
              />
              <div className="pipeline-summary">
                {["new", "qualified", "call", "proposal", "won", "lost"].map(
                  (status) => (
                    <div key={status}>
                      <strong>
                        {state.leads.filter((l) => l.status === status).length}
                      </strong>
                      <span>{status}</span>
                    </div>
                  ),
                )}
              </div>
              {state.leads.length ? (
                <div className="panel table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Service</th>
                        <th>Source</th>
                        <th>Stage</th>
                        <th>Project value</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {state.leads.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <strong>{l.name}</strong>
                            <small>{l.email}</small>
                          </td>
                          <td>
                            {services.find((s) => s.id === l.service)?.name}
                          </td>
                          <td>{l.source || "Unknown"}</td>
                          <td>
                            <Badge
                              tone={l.status === "won" ? "green" : "neutral"}
                            >
                              {l.status}
                            </Badge>
                          </td>
                          <td>
                            {l.value
                              ? new Intl.NumberFormat("en", {
                                  style: "currency",
                                  currency: l.currency,
                                }).format(l.value)
                              : "—"}
                          </td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => setLead(l)}
                            >
                              Manage <ArrowRight size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <section className="panel">
                  <Empty
                    icon={Users}
                    title="A place for your next client"
                    description="Record inbound enquiries and their sources here. The portfolio preview includes an enquiry form for testing the complete flow."
                    action={
                      <a
                        className="secondary"
                        href="/portfolio"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Preview enquiry page <ExternalLink size={15} />
                      </a>
                    }
                  />
                </section>
              )}
            </>
          )}
          {page === 'connections' && <ConnectionsPage/>}
          {page === "channels" && (
            <>
              <PageHeading
                eyebrow="CONNECT ONCE. DISTRIBUTE REGULARLY."
                title="Your channels"
                text="Reuse Postiz for account connections and publishing. Expand one verified channel at a time."
                action={
                  <button
                    className="primary"
                    disabled={busy || !state.health.postiz}
                    onClick={() =>
                      doRun(
                        () => api("/accounts/sync", {}),
                        "Channel connections refreshed.",
                      )
                    }
                  >
                    <RefreshCw size={16} />
                    Sync from Postiz
                  </button>
                }
              />
              <div className="info-banner">
                <Link2 size={19} />
                <span>
                  {state.health.postiz
                    ? "Postiz credentials are configured. Sync to discover connected accounts."
                    : "Configure POSTIZ_URL and POSTIZ_API_KEY in your local .env, then restart. Connect your social accounts in Postiz first."}
                </span>
              </div>
              <div className="channel-grid">
                {platforms.map((p) => {
                  const accounts = state.accounts.filter(
                    (a) => a.platform === p.id && !a.disabled,
                  );
                  return (
                    <article className="panel channel-card" key={p.id}>
                      <div className="row between">
                        <span className={"platform-icon large " + p.id}>
                          {p.id === "linkedin"
                            ? "in"
                            : p.id.slice(0, 2).toUpperCase()}
                        </span>
                        <Badge tone={accounts.length ? "green" : "neutral"}>
                          {accounts.length ? "Connected" : "Not connected"}
                        </Badge>
                      </div>
                      <h3>{p.name}</h3>
                      <p>
                        {p.mode === "auto"
                          ? "Publishing adapter available through Postiz."
                          : "Manual export in this release."}
                      </p>
                      <small>
                        {accounts.map((a) => a.name).join(", ") ||
                          (p.media === "required" || p.media === "video"
                            ? "Media required"
                            : "Text and supported media")}
                      </small>
                    </article>
                  );
                })}
              </div>
              <p className="muted footnote">
                Platform permissions, API access, media requirements and
                provider subscriptions still apply. Community posts stay manual.
                More adapters can be added without changing your project or lead
                data.
              </p>
            </>
          )}
          {page === "settings" && (
            <>
              <PageHeading
                eyebrow="MAKE IT YOURS"
                title="Workspace settings"
                text="Your profile shapes the content. Add real details whenever you’re ready."
              />
              <SettingsForm state={state} run={run} />
              <section className="panel settings-panel">
                <h2>Data & infrastructure</h2>
                <p>
                  Your projects and client data are stored locally. Exports omit
                  credentials and media file bytes.
                </p>
                <div className="infra-grid">
                  <div>
                    <Database size={20} />
                    <strong>SQLite · WAL</strong>
                    <small>Persistent local storage</small>
                  </div>
                  <div>
                    <Sparkles size={20} />
                    <strong>
                      Antigravity{" "}
                      {state.health.antigravity ? "installed" : "unavailable"}
                    </strong>
                    <small>Authentication checked on generation</small>
                  </div>
                  <div>
                    <Globe2 size={20} />
                    <strong>
                      Postiz{" "}
                      {state.health.postiz ? "configured" : "not configured"}
                    </strong>
                    <small>Self-hosted or hosted API</small>
                  </div>
                </div>
                <button
                  className="secondary"
                  onClick={() =>
                    doRun(exportData, "Workspace export downloaded.")
                  }
                >
                  <ArrowDownToLine size={16} />
                  Export workspace JSON
                </button>
                <p className="muted footnote">
                  This is a local owner application. Public hosting requires
                  authentication, managed storage and deployment hardening. No
                  email or direct messages are sent automatically.
                </p>
              </section>
            </>
          )}
        </div>
        <footer className="main-footer">
          <span>
            ClientForge <span className="muted">/</span> Freelance growth,
            grounded in your work.
          </span>
          <span>
            <span className="status-dot green" />
            Local workspace
          </span>
        </footer>
      </main>
      {notice && (
        <div
          role={notice.error ? "alert" : "status"}
          className={"toast " + (notice.error ? "error" : "")}
        >
          <span>
            {notice.error ? <CircleHelp size={19} /> : <Check size={19} />}
          </span>
          {notice.message}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(undefined)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy-pill" role="status">
          <LoaderCircle size={15} className="spin" />
          Saving changes…
        </div>
      )}
      {project && (
        <ProjectForm
          project={project}
          state={state}
          run={run}
          close={() => setProject(null)}
        />
      )}
      {post && (
        <PostForm
          post={post}
          state={state}
          run={run}
          close={() => setPost(null)}
        />
      )}
      {lead && <LeadForm lead={lead} run={run} close={() => setLead(null)} />}
      {scheduled && (
        <ScheduleForm
          post={scheduled}
          state={state}
          run={run}
          close={() => setScheduled(null)}
        />
      )}
      {rule && (
        <RuleForm
          rule={rule}
          state={state}
          run={run}
          close={() => setRule(null)}
        />
      )}
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow: string;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span className="orange">.</span>
        </h1>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}
function GenerationPanel({ state, run }: { state: State; run: Run }) {
  const [projectId, setProjectId] = useState(state.projects[0]?.id || "");
  const [selected, setSelected] = useState<Platform[]>(["linkedin", "threads"]);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!projectId && state.projects.length) setProjectId(state.projects[0].id);
  }, [state.projects]);
  return (
    <section className="panel generation-panel">
      <div className="generation-intro">
        <span className="ai-symbol">
          <Sparkles size={25} />
        </span>
        <div>
          <h2>One project. Different conversations.</h2>
          <p>Antigravity creates the drafts. You decide what goes live.</p>
        </div>
        <Badge tone="purple">POWERED BY YOUR CLI</Badge>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSending(true);
          try {
            await run(
              () => api("/generations", { projectId, platforms: selected }),
              "Generation queued. Drafts will appear below when ready.",
            );
          } catch {
          } finally {
            setSending(false);
          }
        }}
      >
        <Field label="Choose source project">
          <select
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="" disabled>
              Select a project from your library
            </option>
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {!p.permission ? " · permission needed" : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <span>Create for</span>
          <div className="platform-options">
            {platforms
              .filter((p) =>
                [
                  "linkedin",
                  "instagram",
                  "threads",
                  "bluesky",
                  "facebook",
                  "reddit",
                  "youtube",
                  "devto",
                ].includes(p.id),
              )
              .map((p) => (
                <label
                  className={
                    "platform-option " +
                    (selected.includes(p.id) ? "selected" : "")
                  }
                  key={p.id}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, p.id]
                          : selected.filter((x) => x !== p.id),
                      )
                    }
                  />
                  {p.name}
                  {selected.includes(p.id) && <Check size={13} />}
                </label>
              ))}
          </div>
        </div>
        <div className="generation-bottom">
          <small>
            <ShieldCheck size={15} />
            No publishing during generation. Every result is a draft.
          </small>
          <button
            className="primary"
            disabled={
              !projectId ||
              !selected.length ||
              sending ||
              !state.health.antigravity
            }
          >
            <Sparkles size={16} />
            {sending ? "Queuing…" : "Generate drafts"}
          </button>
        </div>
      </form>
      {state.generations.length > 0 && (
        <div className="generation-jobs">
          {state.generations.slice(0, 3).map((g) => (
            <div key={g.id}>
              <Badge
                tone={
                  g.status === "failed"
                    ? "red"
                    : g.status === "complete"
                      ? "green"
                      : "purple"
                }
              >
                {["running", "queued"].includes(g.status) && (
                  <LoaderCircle size={12} className="spin" />
                )}
                {g.status}
              </Badge>
              <span>
                {state.projects.find((p) => p.id === g.projectId)?.title}
              </span>
              <small>{g.error || `${g.platforms.length} platforms`}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const blankProject = {
  title: "",
  service: "web",
  problem: "",
  solution: "",
  results: "",
  url: "",
  audience: "",
  demo: true,
  permission: false,
  assetIds: [],
} as const;
function ProjectForm({
  project,
  state,
  run,
  close,
}: {
  project: Project | "new";
  state: State;
  run: Run;
  close: () => void;
}) {
  const [value, setValue] = useState<any>(
    project === "new" ? { ...blankProject, assetIds: [] } : project,
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assets, setAssets] = useState(state.assets);
  const [error, setError] = useState("");
  const set = (key: string, v: any) => setValue({ ...value, [key]: v });
  return (
    <Modal
      title={project === "new" ? "Add a project" : "Edit project evidence"}
      onClose={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await run(
              () =>
                api(
                  project === "new" ? "/projects" : `/projects/${project.id}`,
                  value,
                  project === "new" ? "POST" : "PUT",
                ),
              "Project saved.",
            );
            close();
          } catch {
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Project title">
            <input
              required
              minLength={3}
              maxLength={160}
              value={value.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Sales reporting dashboard"
            />
          </Field>
          <Field label="Service">
            <select
              value={value.service}
              onChange={(e) => set("service", e.target.value)}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="The buyer’s problem">
          <textarea
            required
            minLength={10}
            maxLength={4000}
            value={value.problem}
            onChange={(e) => set("problem", e.target.value)}
            placeholder="What problem needed solving?"
            rows={3}
          />
        </Field>
        <Field label="What you delivered">
          <textarea
            required
            minLength={10}
            maxLength={6000}
            value={value.solution}
            onChange={(e) => set("solution", e.target.value)}
            placeholder="Explain the work, decisions and deliverables."
            rows={4}
          />
        </Field>
        <Field
          label="Verified results (optional)"
          hint="Use measured facts only. Leave blank if results are not yet available."
        >
          <textarea
            maxLength={2000}
            value={value.results}
            onChange={(e) => set("results", e.target.value)}
            rows={2}
          />
        </Field>
        <div className="form-grid">
          <Field label="Project or case-study URL">
            <input
              type="url"
              value={value.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="Target buyer">
            <input
              maxLength={300}
              value={value.audience}
              onChange={(e) => set("audience", e.target.value)}
              placeholder="e.g. Operations teams at small businesses"
            />
          </Field>
        </div>
        <Field
          label="Project media"
          hint="PNG, JPEG, WebP or MP4 · up to 50 MB each. Keep private client information out of uploads."
        >
          <input
            type="file"
            disabled={uploading}
            accept="image/png,image/jpeg,image/webp,video/mp4"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 50 * 1024 * 1024) {
                setError("File exceeds 50 MB.");
                return;
              }
              setUploading(true);
              setError("");
              try {
                const asset = await upload(file);
                setAssets([...assets, asset]);
                setValue((v: any) => ({
                  ...v,
                  assetIds: [...v.assetIds, asset.id],
                }));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setUploading(false);
              }
            }}
          />
        </Field>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="asset-options">
          {assets.map((a) => (
            <label key={a.id}>
              <input
                type="checkbox"
                checked={value.assetIds.includes(a.id)}
                onChange={(e) =>
                  set(
                    "assetIds",
                    e.target.checked
                      ? [...value.assetIds, a.id]
                      : value.assetIds.filter((id: string) => id !== a.id),
                  )
                }
              />
              <span>{a.name}</span>
              <small>{(a.size / 1024).toFixed(0)} KB</small>
            </label>
          ))}
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={value.demo}
            onChange={(e) => set("demo", e.target.checked)}
          />
          <span>
            This is a personal or demonstration project, not a client
            engagement.
          </span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={value.permission}
            onChange={(e) => set("permission", e.target.checked)}
          />
          <span>
            I have permission to showcase the evidence and attached media.
          </span>
        </label>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={saving || uploading}>
            <Save size={16} />
            {saving ? "Saving…" : "Save project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PostForm({
  post,
  state,
  run,
  close,
}: {
  post: Post | "new";
  state: State;
  run: Run;
  close: () => void;
}) {
  const [value, setValue] = useState(
    post === "new"
      ? {
          projectId: state.projects[0]?.id || "",
          platform: "linkedin" as Platform,
          title: "",
          content: "",
          assetIds: [] as string[],
        }
      : post,
  );
  const [saving, setSaving] = useState(false);
  const platform = platforms.find((p) => p.id === value.platform)!;
  function link() {
    const project = state.projects.find((p) => p.id === value.projectId);
    const base = project?.url || state.settings.website;
    if (!base) return;
    const url = new URL(base);
    url.searchParams.set("utm_source", value.platform);
    url.searchParams.set("utm_medium", "social");
    url.searchParams.set("utm_campaign", project?.id || "portfolio");
    url.searchParams.set("utm_content", post === "new" ? "manual" : post.id);
    setValue({ ...value, content: value.content + "\n\n" + url.toString() });
  }
  return (
    <Modal
      title={
        post === "new" ? "Write a post" : `Review ${names[post.platform]} draft`
      }
      onClose={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await run(
              () =>
                api(
                  post === "new" ? "/posts" : `/posts/${post.id}`,
                  value,
                  post === "new" ? "POST" : "PUT",
                ),
              "Draft saved. Review and approve this version.",
            );
            close();
          } catch {
          } finally {
            setSaving(false);
          }
        }}
      >
        {post === "new" && (
          <div className="form-grid">
            <Field label="Source project">
              <select
                value={value.projectId}
                onChange={(e) =>
                  setValue({ ...value, projectId: e.target.value })
                }
              >
                {state.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Platform">
              <select
                value={value.platform}
                onChange={(e) =>
                  setValue({ ...value, platform: e.target.value as Platform })
                }
              >
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label="Internal post title">
          <input
            required
            maxLength={200}
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
        </Field>
        <Field label="Post content">
          <textarea
            required
            rows={12}
            value={value.content}
            onChange={(e) => setValue({ ...value, content: e.target.value })}
          />
        </Field>
        <div className="row between">
          <small
            className={
              [...value.content].length > platform.limit
                ? "error-text"
                : "muted"
            }
          >
            {[...value.content].length} / {platform.limit} application character
            limit
          </small>
          <button
            type="button"
            className="text-button"
            disabled={
              !state.projects.find((p) => p.id === value.projectId)?.url &&
              !state.settings.website
            }
            onClick={link}
          >
            <Link2 size={14} />
            Append tracked URL
          </button>
        </div>
        <div className="field">
          <span>Attachments</span>
          <div className="asset-options">
            {state.assets.length ? (
              state.assets.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={value.assetIds.includes(a.id)}
                    onChange={(e) =>
                      setValue({
                        ...value,
                        assetIds: e.target.checked
                          ? [...value.assetIds, a.id]
                          : value.assetIds.filter((id) => id !== a.id),
                      })
                    }
                  />
                  {a.name}
                </label>
              ))
            ) : (
              <small>Upload media through the source project.</small>
            )}
          </div>
        </div>
        <div className="info-banner compact">
          <ShieldCheck size={17} />
          <span>
            Saving creates a new draft version and resets approval. Community
            channels are manual export.
          </span>
        </div>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={saving}>
            <Save size={16} />
            Save draft
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ScheduleForm({
  post,
  state,
  run,
  close,
}: {
  post: Post;
  state: State;
  run: Run;
  close: () => void;
}) {
  const accounts = state.accounts.filter(
    (a) => a.platform === post.platform && !a.disabled,
  );
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const p = platforms.find((p) => p.id === post.platform)!;
  return (
    <Modal title="Schedule approved content" onClose={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            const scheduledAt = zonedToIso(time, state.settings.timezone);
            await run(
              () => api("/jobs", { postId: post.id, accountId, scheduledAt }),
              "Post scheduled in your local queue.",
            );
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <h3>{post.title}</h3>
        {p.mode === "manual" ? (
          <div className="info-banner">
            This channel is export-only. Download the draft and publish it
            manually.
          </div>
        ) : (
          <>
            <Field label="Connected account">
              <select
                required
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="" disabled>
                  No connected account selected
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={`Publish time · ${state.settings.timezone}`}
              hint="Times are converted to UTC. Ambiguous daylight-saving times are rejected."
            >
              <input
                type="datetime-local"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
            <div className="info-banner compact">
              Your computer must remain on.{" "}
              {state.settings.paused ? "The queue is paused. " : ""}
              {!state.health.publishingEnabled
                ? "Live publishing is disabled in .env."
                : ""}
            </div>
          </>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => download(`${post.platform}-post.txt`, post.content)}
          >
            Export draft
          </button>
          <button
            className="primary"
            disabled={p.mode === "manual" || !accountId || saving}
          >
            <CalendarDays size={16} />
            Schedule post
          </button>
        </div>
      </form>
    </Modal>
  );
}
function LeadForm({
  lead,
  run,
  close,
}: {
  lead: Lead | "new";
  run: Run;
  close: () => void;
}) {
  const [v, set] = useState<Omit<Lead, "id" | "createdAt" | "updatedAt">>(
    lead === "new"
      ? {
          name: "",
          email: "",
          service: "web",
          description: "",
          country: "",
          budget: "",
          source: "",
          status: "new",
          value: 0,
          currency: "USD",
          notes: "",
        }
      : lead,
  );
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      title={lead === "new" ? "Add a client enquiry" : "Manage opportunity"}
      onClose={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await run(
              () =>
                api(
                  lead === "new" ? "/leads" : `/leads/${lead.id}`,
                  v,
                  lead === "new" ? "POST" : "PUT",
                ),
              "Client pipeline updated.",
            );
            close();
          } catch {
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Client name">
            <input
              required
              maxLength={100}
              value={v.name}
              onChange={(e) => set({ ...v, name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              value={v.email}
              onChange={(e) => set({ ...v, email: e.target.value })}
            />
          </Field>
          <Field label="Service">
            <select
              value={v.service}
              onChange={(e) =>
                set({ ...v, service: e.target.value as Lead["service"] })
              }
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Stage">
            <select
              value={v.status}
              onChange={(e) =>
                set({ ...v, status: e.target.value as Lead["status"] })
              }
            >
              {["new", "qualified", "call", "proposal", "won", "lost"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </Field>
        </div>
        <Field label="Project requirements">
          <textarea
            required
            minLength={5}
            rows={3}
            maxLength={4000}
            value={v.description}
            onChange={(e) => set({ ...v, description: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="Country / time zone">
            <input
              maxLength={100}
              value={v.country}
              onChange={(e) => set({ ...v, country: e.target.value })}
            />
          </Field>
          <Field label="Source / campaign">
            <input
              maxLength={200}
              value={v.source}
              onChange={(e) => set({ ...v, source: e.target.value })}
              placeholder="LinkedIn, referral, or campaign ID"
            />
          </Field>
          <Field label="Client budget">
            <input
              maxLength={100}
              value={v.budget}
              onChange={(e) => set({ ...v, budget: e.target.value })}
            />
          </Field>
          <Field label="Recorded project value">
            <div className="value-input">
              <select
                value={v.currency}
                onChange={(e) =>
                  set({ ...v, currency: e.target.value as Lead["currency"] })
                }
              >
                {["USD", "EUR", "GBP", "AUD", "INR"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={1e9}
                step="0.01"
                value={v.value}
                onChange={(e) => set({ ...v, value: Number(e.target.value) })}
              />
            </div>
          </Field>
        </div>
        <Field label="Notes and next action">
          <textarea
            rows={3}
            maxLength={4000}
            value={v.notes}
            onChange={(e) => set({ ...v, notes: e.target.value })}
          />
        </Field>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={saving}>
            <Save size={16} />
            Save opportunity
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RuleForm({
  rule,
  state,
  run,
  close,
}: {
  rule: Rule | "new";
  state: State;
  run: Run;
  close: () => void;
}) {
  const [v, set] = useState<Omit<Rule, "id" | "createdAt" | "nextRunAt">>(
    rule === "new"
      ? {
          name: "Weekly portfolio stories",
          projectIds: state.projects.slice(0, 1).map((p) => p.id),
          platforms: ["linkedin"],
          weekdays: [1, 3, 5],
          localTime: "09:00",
          timezone: state.settings.timezone,
          focus:
            "Explain one useful lesson from this project. Choose a different angle each time; never invent results.",
          enabled: false,
        }
      : rule,
  );
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      title={
        rule === "new"
          ? "Create a recurring draft batch"
          : "Edit content cadence"
      }
      onClose={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await run(
              () =>
                api(
                  rule === "new" ? "/rules" : `/rules/${rule.id}`,
                  v,
                  rule === "new" ? "POST" : "PUT",
                ),
              "Recurring draft batch saved.",
            );
            close();
          } catch {
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="Batch name">
          <input
            required
            minLength={2}
            maxLength={100}
            value={v.name}
            onChange={(e) => set({ ...v, name: e.target.value })}
          />
        </Field>
        <div className="field">
          <span>Source projects · rotate between runs</span>
          <div className="asset-options">
            {state.projects.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={v.projectIds.includes(p.id)}
                  onChange={(e) =>
                    set({
                      ...v,
                      projectIds: e.target.checked
                        ? [...v.projectIds, p.id]
                        : v.projectIds.filter((id) => id !== p.id),
                    })
                  }
                />
                {p.title}
                {!p.permission && <small>Permission needed</small>}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Platforms · up to 8</span>
          <div className="platform-options">
            {platforms.map((p) => (
              <label
                key={p.id}
                className={
                  "platform-option " +
                  (v.platforms.includes(p.id) ? "selected" : "")
                }
              >
                <input
                  type="checkbox"
                  checked={v.platforms.includes(p.id)}
                  onChange={(e) =>
                    set({
                      ...v,
                      platforms: e.target.checked
                        ? [...v.platforms, p.id]
                        : v.platforms.filter((id) => id !== p.id),
                    })
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Prepare drafts on</span>
          <div className="platform-options">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <label
                key={d}
                className={
                  "platform-option " +
                  (v.weekdays.includes(i) ? "selected" : "")
                }
              >
                <input
                  type="checkbox"
                  checked={v.weekdays.includes(i)}
                  onChange={(e) =>
                    set({
                      ...v,
                      weekdays: e.target.checked
                        ? [...v.weekdays, i]
                        : v.weekdays.filter((x) => x !== i),
                    })
                  }
                />
                {d}
              </label>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <Field label="Local preparation time">
            <input
              type="time"
              required
              value={v.localTime}
              onChange={(e) => set({ ...v, localTime: e.target.value })}
            />
          </Field>
          <Field label="Time zone">
            <select
              value={v.timezone}
              onChange={(e) => set({ ...v, timezone: e.target.value })}
            >
              {Array.from(
                new Set([
                  v.timezone,
                  state.settings.timezone,
                  "UTC",
                  "America/New_York",
                  "Europe/London",
                  "Australia/Sydney",
                ]),
              ).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Editorial focus">
          <textarea
            maxLength={1000}
            rows={3}
            value={v.focus}
            onChange={(e) => set({ ...v, focus: e.target.value })}
          />
        </Field>
        <label className="check-field">
          <input
            type="checkbox"
            checked={v.enabled}
            onChange={(e) => set({ ...v, enabled: e.target.checked })}
          />
          <span>
            Enable recurring generation. This uses your authenticated
            Antigravity CLI account and its usage allowance.
          </span>
        </label>
        <div className="form-actions">
          <button className="secondary" type="button" onClick={close}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={
              saving ||
              !v.projectIds.length ||
              !v.platforms.length ||
              v.platforms.length > 8 ||
              !v.weekdays.length
            }
          >
            <Save size={16} />
            Save cadence
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SettingsForm({ state, run }: { state: State; run: Run }) {
  const [value, setValue] = useState<Settings>(state.settings);
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="panel settings-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await run(
            () =>
              api(
                "/settings",
                { ...value, paused: state.settings.paused },
                "PUT",
              ),
            "Profile saved.",
          );
        } catch {
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2>Your professional profile</h2>
      <p>
        Use clear, factual information. Empty fields are fine while you prepare
        your portfolio.
      </p>
      <div className="form-grid">
        <Field label="Professional / business name">
          <input
            maxLength={100}
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
            placeholder="Your name or studio"
          />
        </Field>
        <Field label="Portfolio website">
          <input
            type="url"
            value={value.website}
            onChange={(e) => setValue({ ...value, website: e.target.value })}
            placeholder="https://your-portfolio.com"
          />
        </Field>
      </div>
      <Field label="Short introduction">
        <textarea
          rows={3}
          maxLength={1200}
          value={value.bio}
          onChange={(e) => setValue({ ...value, bio: e.target.value })}
          placeholder="What you do, who you help and how you work."
        />
      </Field>
      <div className="form-grid">
        <Field label="Public contact / booking destination">
          <input
            maxLength={300}
            value={value.contact}
            onChange={(e) => setValue({ ...value, contact: e.target.value })}
            placeholder="Business email or booking URL"
          />
        </Field>
        <Field label="Workspace time zone">
          <select
            value={value.timezone}
            onChange={(e) => setValue({ ...value, timezone: e.target.value })}
          >
            {Array.from(
              new Set([
                value.timezone,
                "Asia/Kolkata",
                "America/New_York",
                "America/Los_Angeles",
                "Europe/London",
                "Europe/Berlin",
                "Australia/Sydney",
                "UTC",
              ]),
            ).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Target buyers and markets">
        <input
          maxLength={300}
          value={value.audience}
          onChange={(e) => setValue({ ...value, audience: e.target.value })}
        />
      </Field>
      <Field label="Content voice">
        <textarea
          rows={2}
          maxLength={1000}
          value={value.voice}
          onChange={(e) => setValue({ ...value, voice: e.target.value })}
        />
      </Field>
      <div className="form-actions">
        <button className="primary" disabled={saving}>
          <Save size={16} />
          Save profile
        </button>
      </div>
    </form>
  );
}
function Portfolio() {
  const [profile, setProfile] = useState<any>();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/public/profile")
      .then((r) => r.json())
      .then(setProfile)
      .catch(() => setError("Could not load the portfolio."));
  }, []);
  if (!profile)
    return <div className="loading">{error || "Loading portfolio…"}</div>;
  return (
    <div className="portfolio">
      <header>
        <a className="brand" href="/portfolio">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          {profile.name || "Independent studio"}
        </a>
        <a className="secondary" href="#enquire">
          Discuss your project <ArrowRight size={16} />
        </a>
      </header>
      <section className="portfolio-hero">
        <div className="eyebrow">DEVELOPMENT · DATA · DESIGN · AI</div>
        <h1>
          Practical solutions.
          <br />
          Work you can see.
        </h1>
        <p>
          {profile.bio ||
            "Explore development and data services, see the work, and describe the project you have in mind."}
        </p>
        <a href="#enquire" className="primary">
          Let’s discuss your project <ArrowRight size={17} />
        </a>
        <span className="preview-label">
          Local portfolio preview · not publicly hosted
        </span>
      </section>
      <div className="service-grid">
        {services.map((s) => {
          const Icon = iconByService[s.id];
          return (
            <section key={s.id} className="panel service-card">
              <Icon style={{ color: s.color }} size={28} />
              <h3>{s.name}</h3>
              <p>{s.description}</p>
            </section>
          );
        })}
      </div>
      <section className="portfolio-projects">
        <h2>Selected work</h2>
        {profile.projects.length ? (
          profile.projects.map((p: any) => (
            <article className="panel" key={p.id}>
              <Badge tone="orange">
                {p.demo ? "DEMONSTRATION" : "PROJECT"}
              </Badge>
              <h3>{p.title}</h3>
              <p>{p.problem}</p>
              <p>{p.solution}</p>
              {p.results && <p>{p.results}</p>}
              {p.url && (
                <a
                  className="text-button"
                  href={p.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  View project <ExternalLink size={15} />
                </a>
              )}
            </article>
          ))
        ) : (
          <p className="muted">Project examples are being prepared.</p>
        )}
      </section>
      <section className="panel enquiry-panel" id="enquire">
        <div>
          <div className="eyebrow">START A CONVERSATION</div>
          <h2>What are you building?</h2>
          <p>
            Describe the work you need, your timeline and the outcome you’re
            looking for.
          </p>
          {profile.contact && <p>Contact: {profile.contact}</p>}
          <small>
            Your enquiry is stored by this workspace owner to respond to your
            project request. Do not include passwords or sensitive data.
          </small>
        </div>
        {sent ? (
          <div className="empty">
            <CheckCheck size={35} />
            <h3>Enquiry received</h3>
            <p>Your project details have been saved for review.</p>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = e.currentTarget;
              const data = Object.fromEntries(new FormData(f));
              const params = new URLSearchParams(location.search);
              if (!data.source)
                data.source = [
                  params.get("utm_source"),
                  params.get("utm_campaign"),
                ]
                  .filter(Boolean)
                  .join(" / ")
                  .slice(0, 200);
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/public/enquiry", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data),
                });
                const result = await r.json();
                if (!r.ok) throw new Error(result.error);
                setSent(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <Field label="Your name">
                <input name="name" required maxLength={100} />
              </Field>
              <Field label="Email">
                <input type="email" name="email" required />
              </Field>
            </div>
            <Field label="Service">
              <select name="service">
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project details and timeline">
              <textarea
                name="description"
                required
                minLength={5}
                maxLength={4000}
                rows={4}
              />
            </Field>
            <div className="form-grid">
              <Field label="Country / time zone">
                <input name="country" maxLength={100} />
              </Field>
              <Field label="Budget range (optional)">
                <input name="budget" maxLength={100} />
              </Field>
            </div>
            <Field label="How did you find this work? (optional)">
              <input name="source" maxLength={200} />
            </Field>
            <input
              className="honeypot"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              <Send size={16} />
              {busy ? "Sending…" : "Send project enquiry"}
            </button>
          </form>
        )}
      </section>
      <footer>Independent work. Thoughtful delivery.</footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  location.pathname === "/portfolio" ? <Portfolio /> : <AuthGate><App /></AuthGate>,
);
