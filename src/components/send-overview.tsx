"use client";
import { useCallback, useEffect } from "react";
import { db } from "@/lib/supabase";
import { num } from "@/lib/types";
import { State, useLoad } from "./ui";
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
      <h2>Live portal delivery</h2>
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
          <p className="footnote">
            Totals across portal sends. A destination counts once per send and
            per event type; it may appear in multiple campaigns. Historical
            export totals are excluded. Last report sync:{" "}
            {data.last_sync
              ? new Date(data.last_sync).toLocaleString()
              : "No reports yet"}
            . Refreshes every 30 seconds.
          </p>
          {data.issues > 0 && (
            <p role="alert">
              {num(data.issues)} reports need reconciliation. Totals may be
              incomplete.
            </p>
          )}
        </>
      )}
    </section>
  );
}
