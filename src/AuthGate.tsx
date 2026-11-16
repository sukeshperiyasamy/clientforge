import { useState, useEffect, type ReactNode } from "react";
import {
  ShieldCheck,
  Globe2,
  Layers3,
  LockKeyhole,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import { session, signIn, AuthRequired } from "./api";
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "setup" | "login" | "ready">(
    "checking",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    session()
      .then(() => setState("ready"))
      .catch((e) => {
        if (e instanceof AuthRequired)
          setState(e.needsSetup ? "setup" : "login");
        else setError(e.message);
      });
  }, []);
  useEffect(() => {
    const expired = () => {
      setPassword("");
      setConfirm("");
      setState("login");
      setError("Your dashboard session expired. Sign in again.");
    };
    window.addEventListener("owner-session-expired", expired);
    return () => window.removeEventListener("owner-session-expired", expired);
  }, []);
  if (state === "ready") return children;
  if (state === "checking")
    return (
      <div className="loading">
        <LoaderCircle className="spin" />
        <p>{error || "Opening your private workspace…"}</p>
      </div>
    );
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <span className="auth-brand">
          <Layers3 /> FreelanceGrowth <b>AI</b>
        </span>
        <div className="eyebrow">YOUR DEDICATED GROWTH WORKSPACE</div>
        <h1>
          Your browser.
          <br />
          Your sessions.
          <br />
          <span>Your control.</span>
        </h1>
        <p>
          A separate home for your freelance work, connected accounts and
          approved marketing content.
        </p>
        <div className="auth-promise">
          <ShieldCheck size={19} />
          <span>Personal browser profiles stay separate.</span>
        </div>
        <div className="auth-promise">
          <LockKeyhole size={19} />
          <span>Passwords and login challenges stay with you.</span>
        </div>
        <div className="auth-promise">
          <Globe2 size={19} />
          <span>
            Browser sign-in and API authorization are tracked separately.
          </span>
        </div>
      </section>
      <section className="auth-login">
        <span className="eyebrow">LOCAL OWNER ACCESS</span>
        <h2>{state === "setup" ? "Secure your workspace" : "Welcome back"}</h2>
        <p>
          {state === "setup"
            ? "Create a dashboard password. Enter it here yourself; it is never sent to an AI model."
            : "Sign in to manage your project browser and connections."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (state === "setup" && password !== confirm) {
              setError("The passwords do not match.");
              return;
            }
            setBusy(true);
            try {
              await signIn(password, state === "setup");
              setPassword("");
              setConfirm("");
              setState("ready");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>Dashboard password</span>
            <input
              type="password"
              aria-label="Dashboard password"
              required
              minLength={12}
              maxLength={256}
              autoComplete={
                state === "setup" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small>
              At least 12 characters. This is separate from your website account
              passwords.
            </small>
          </label>
          {state === "setup" && (
            <label className="field">
              <span>Confirm dashboard password</span>
              <input
                type="password"
                aria-label="Confirm dashboard password"
                required
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <ArrowRight size={16} />
            )}{" "}
            {state === "setup" ? "Create owner login" : "Sign in"}
          </button>
        </form>
        <small>
          Runs on your computer. No browser cookies, session tokens or account
          passwords are sent to Antigravity.
        </small>
      </section>
    </main>
  );
}
