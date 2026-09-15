"use client";
import { useCallback, useEffect } from "react";
import { db } from "@/lib/supabase";
import { num } from "@/lib/types";
import { State, useLoad } from "./ui";
import { Activity, AlertTriangle, Clock } from "lucide-react";

type Summary = {
  approved: number;
  accepted: number;
  delivered: number;
  opened: number;
  bounced: number;
  unsubscribed: number;
  issues: number;
  last_sync: string | null;
};

export function SendOverview() {
  const load = useCallback(async () => {
    const { data, error } = await db().rpc("portal_send_summary");
    if (error) throw error;
    return data as Summary;
  }, []);
  const { data, busy, error, refresh } = useLoad(load);

  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <section className="panel section-gap action-body">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="icon-tile" style={{ width: "34px", height: "34px", borderRadius: "8px" }}>
            <Activity size={18} />
          </span>
          <div>
            <h2 style={{ fontSize: "16px", margin: 0 }}>Live portal delivery</h2>
            <p style={{ margin: 0, fontSize: "12.5px" }}>Real-time event aggregation across all sends</p>
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--brand-green)", background: "#ecfdf5", padding: "4px 10px", borderRadius: "9999px", border: "1px solid #a7f3d0", fontWeight: 600 }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
          Auto-updates every 30s
        </div>
      </div>

      <State busy={busy} error={error} retry={refresh} />

      {data && (
        <>
          <div className="metrics-row">
            {(
              [
                "approved",
                "accepted",
                "delivered",
                "opened",
                "bounced",
                "unsubscribed",
              ] as const
            ).map((k) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{num(data[k])}</strong>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "16px", fontSize: "12px", color: "var(--muted)" }}>
            <Clock size={14} style={{ flexShrink: 0 }} />
            <span>
              Last sync:{" "}
              <strong>
                {data.last_sync
                  ? new Date(data.last_sync).toLocaleString()
                  : "No reports yet"}
              </strong>
            </span>
          </div>

          <p className="footnote" style={{ marginTop: "8px" }}>
            Totals across portal sends. A destination counts once per send and
            per event type; it may appear in multiple campaigns. Historical
            export totals are excluded.
          </p>

          {data.issues > 0 && (
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 16px",
                borderRadius: "var(--radius-sm)",
                background: "#fffbeb",
                border: "1px solid #fde68a",
                color: "#b45309",
                fontSize: "13px",
                marginTop: "12px",
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span>
                <strong>{num(data.issues)} reports</strong> need reconciliation.
                Totals may be incomplete.
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
