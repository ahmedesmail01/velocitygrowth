"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ArrowRight, ShieldCheck } from "lucide-react";
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
          <div className="eyebrow">YOUR CLIENT WORKSPACE</div>
          <h1>
            A clear view.
            <br />A better next move.
          </h1>
          <p>
            Know your audience. Understand your campaigns. Keep your team on the
            same page.
          </p>
          <div className="login-rule" />
          <span>Customers · Campaigns · Engagement</span>
        </div>
        <div className="login-footer">
          Velocity Growth <span>Client campaign portal</span>
        </div>
      </section>
      <section className="login-form">
        <div className="login-box">
          <div className="eyebrow">WELCOME BACK</div>
          <h2>Sign in to your workspace</h2>
          <p>Use the email assigned to your brand.</p>
          <form onSubmit={submit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
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
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            <button className="button full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="divider">
            <span>or</span>
          </div>
          <button
            className="button secondary full"
            onClick={google}
            disabled={busy}
          >
            Continue with Google
          </button>
          <p className="login-note">
            <ShieldCheck size={18} />
            Access is limited to approved brand accounts.
          </p>
        </div>
      </section>
    </main>
  );
}
