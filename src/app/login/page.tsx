"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ArrowRight, ShieldCheck, CheckCircle2, Lock } from "lucide-react";
import { db } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await db().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error)
        setError("Unable to sign in. Check your email and portal password.");
      else router.replace("/dashboard");
    } catch {
      setError(
        "Unable to connect. Check your portal configuration and connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError("");
    try {
      const { error } = await db().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/dashboard",
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        setError(
          "Google sign-in is unavailable. Please use your portal password or contact your workspace administrator.",
        );
        setBusy(false);
      }
    } catch {
      setError("Unable to start Google sign-in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="login-story">
        <div className="wordmark">
          <span className="mark">
            V<ArrowUpRight size={16} />
          </span>
          velocity<span className="wordmark-small">GROWTH</span>
        </div>

        <div className="login-copy">
          <div className="eyebrow" style={{ color: "var(--lime)" }}>
            YOUR CLIENT WORKSPACE
          </div>
          <h1>
            A clear view.
            <br />A better next move.
          </h1>
          <p>
            Know your audience. Understand your campaigns. Keep your team aligned
            with live deliverability and verified observed metrics.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "32px" }}>
            {[
              "Real-time portal dispatch & live event reconciliation",
              "Consented customer contactability tracking",
              "Automated data hygiene & import validation logs",
            ].map((feature, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "#d1fae5" }}>
                <CheckCircle2 size={16} style={{ color: "var(--lime)", flexShrink: 0 }} />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <div className="login-rule" />
          <span>Customers · Campaigns · Engagement</span>
        </div>

        <div className="login-footer">
          <span>Velocity Growth</span>
          <span>Enterprise Client Portal</span>
        </div>
      </section>

      <section className="login-form">
        <div className="login-box">
          <div className="eyebrow">WELCOME BACK</div>
          <h2>Sign in to your workspace</h2>
          <p>Use the email credentials assigned to your brand account.</p>

          <form onSubmit={submit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="name@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label htmlFor="password">Portal password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <div className="error-message" role="alert">
                <span>{error}</span>
              </div>
            )}

            <button className="button full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to workspace"}
              <ArrowRight size={17} />
            </button>
          </form>

          <div className="divider">
            <span>or</span>
          </div>

          <button
            className="button secondary full"
            onClick={google}
            disabled={busy}
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            Continue with Google
          </button>

          <p className="login-note">
            <ShieldCheck size={18} />
            <span>Secured client access for authorized brand memberships only.</span>
          </p>
        </div>
      </section>
    </main>
  );
}
