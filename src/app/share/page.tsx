"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { num } from "@/lib/types";
type Report = {
  campaign_name: string;
  brand_name: string;
  channel: string;
  updated_at: string;
  reported: Record<string, number | null>;
  portal_send: null | {
    status: string;
    approved: number;
    accepted: number;
    rejected: number;
    delivered: number;
    opened: number;
    bounced: number;
    unsubscribed: number;
    needs_review: boolean;
    last_synced_at: string | null;
  };
};
export default function Share() {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [report, setReport] = useState<Report | null>(null);
  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setReport(null);
    setError("");
    setBusy(true);
    try {
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        "token",
      );
      if (!token) throw Error("Missing token");
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: "public-share-no-session",
          },
        },
      );
      const { data, error } = await client.rpc("portal_unlock_share", {
        p_token: token,
        p_password: password,
      });
      if (error || !data) throw Error("Unavailable");
      setReport(data as Report);
      setPassword("");
    } catch {
      setError(
        "Unable to open this report. Check the link and password. If you tried repeatedly, wait 15 minutes; the link may also have expired or been revoked.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="shared-page">
      <div className="eyebrow">VELOCITY GROWTH · CLIENT REPORT</div>
      <h1>{report ? report.campaign_name : "Campaign results"}</h1>
      {!report && (
        <section className="panel action-body">
          <h2>A report shared with you</h2>
          <p>Enter the password supplied with your link.</p>
          <form onSubmit={unlock}>
            <label htmlFor="report-password">Report password</label>
            <input
              id="report-password"
              type="password"
              required
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="button" disabled={busy}>
              {busy ? "Opening report…" : "Open report"}
            </button>
          </form>
          {error && <p role="alert">{error}</p>}
        </section>
      )}
      {report && (
        <>
          <p>
            {report.brand_name} · {report.channel.toUpperCase()}
          </p>
          <section className="panel action-body">
            <h2>Historical source-reported results</h2>
            <div className="metrics-row">
              {Object.entries(report.reported).map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <strong>{num(v)}</strong>
                </div>
              ))}
            </div>
            <p className="footnote">
              Source-reported opens and clicks can include repeated events.
            </p>
          </section>
          {report.portal_send ? (
            <section className="panel action-body section-gap">
              <h2>Portal send · {report.portal_send.status}</h2>
              <div className="metrics-row">
                {(
                  [
                    "approved",
                    "accepted",
                    "rejected",
                    "delivered",
                    "opened",
                    "bounced",
                    "unsubscribed",
                  ] as const
                ).map((k) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{num(report.portal_send![k])}</strong>
                  </div>
                ))}
              </div>
              <p className="footnote">
                Approved counts distinct destinations in the saved audience.
                Accepted is provider acknowledgement. Delivery and engagement
                count unique recipients per event type; these counts may
                overlap.
              </p>
              <p>
                Last synchronized:{" "}
                {report.portal_send.last_synced_at
                  ? new Date(report.portal_send.last_synced_at).toLocaleString()
                  : "Awaiting provider reports"}
                .
              </p>
              {report.portal_send.needs_review && (
                <p role="alert">
                  Some reports need reconciliation. These totals may be
                  incomplete.
                </p>
              )}
            </section>
          ) : (
            <p>No portal send has been approved for this campaign.</p>
          )}
          <p>
            Results retrieved {new Date(report.updated_at).toLocaleString()}.
            Reopen with your password to refresh.
          </p>
          <button className="button secondary" onClick={() => setReport(null)}>
            Close report
          </button>
        </>
      )}
    </main>
  );
}
