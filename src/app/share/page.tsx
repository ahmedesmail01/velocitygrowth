"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { num } from "@/lib/types";
import { Lock, FileBarChart, AlertTriangle, ArrowRight, X } from "lucide-react";
import { Badge } from "@/components/ui";

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
        <section className="panel action-body" style={{ maxWidth: "480px", margin: "24px 0", padding: "36px" }}>
          <div
            className="icon-tile"
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              marginBottom: "16px",
            }}
          >
            <Lock size={22} />
          </div>

          <h2 style={{ fontSize: "20px" }}>A report was shared with you</h2>
          <p style={{ marginTop: "6px" }}>
            Enter the password supplied with your link to decrypt and view aggregate campaign metrics.
          </p>

          <form onSubmit={unlock} style={{ marginTop: "20px" }}>
            <label htmlFor="report-password" style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--ink-secondary)", marginBottom: "6px" }}>
              Report password
            </label>
            <input
              id="report-password"
              type="password"
              required
              autoComplete="off"
              placeholder="Enter password…"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="button full" disabled={busy} style={{ marginTop: "16px" }}>
              {busy ? "Opening report…" : "Open report"}
              <ArrowRight size={16} />
            </button>
          </form>

          {error && (
            <div className="error-message" role="alert" style={{ marginTop: "16px" }}>
              <span>{error}</span>
            </div>
          )}
        </section>
      )}

      {report && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <Badge tone="green">{report.brand_name}</Badge>
            <Badge tone={report.channel === "email" ? "green" : "neutral"}>
              {report.channel.toUpperCase()}
            </Badge>
          </div>

          <section className="panel action-body">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <FileBarChart size={18} style={{ color: "var(--brand-green)" }} />
              <h2 style={{ margin: 0 }}>Historical source-reported results</h2>
            </div>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <h2 style={{ margin: 0 }}>Portal send results</h2>
                <Badge tone="green">{report.portal_send.status.toUpperCase()}</Badge>
              </div>

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
              <p style={{ fontSize: "13px", color: "var(--muted)" }}>
                Last synchronized:{" "}
                <strong>
                  {report.portal_send.last_synced_at
                    ? new Date(report.portal_send.last_synced_at).toLocaleString()
                    : "Awaiting provider reports"}
                </strong>
                .
              </p>

              {report.portal_send.needs_review && (
                <div
                  role="alert"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "#fffbeb",
                    color: "#b45309",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    marginTop: "12px",
                    fontSize: "13px",
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>
                    Some reports need reconciliation. These totals may be incomplete.
                  </span>
                </div>
              )}
            </section>
          ) : (
            <p style={{ margin: "20px 0", color: "var(--muted)" }}>
              No portal send has been approved for this campaign.
            </p>
          )}

          <p style={{ fontSize: "12.5px", color: "var(--muted)", margin: "16px 0" }}>
            Results retrieved {new Date(report.updated_at).toLocaleString()}.
            Reopen with your password to refresh.
          </p>

          <button
            className="button secondary"
            onClick={() => setReport(null)}
            style={{ marginTop: "8px" }}
          >
            <X size={15} />
            Close report
          </button>
        </>
      )}
    </main>
  );
}
