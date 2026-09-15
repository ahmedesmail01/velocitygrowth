"use client";
import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/supabase";
import { useAccess } from "./auth";
import { Badge, Pager, State, useLoad } from "./ui";
import { num } from "@/lib/types";
import {
  Send,
  Share2,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Lock,
  Copy,
  Check,
  RotateCcw,
} from "lucide-react";

type Run = {
  id: string;
  status: string;
  recipient_count: number;
  accepted_count: number;
  rejected_count: number;
  delivered_count: number;
  opened_count: number;
  bounced_count: number;
  unsubscribed_count: number;
  issue_count: number;
  safe_message: string | null;
  approved_at: string | null;
  preview_expires_at: string;
  last_synced_at: string | null;
  campaign_snapshot: {
    name: string;
    channel: string;
    target_country: string | null;
  };
};

type Recipient = {
  id: string;
  full_name: string;
  destination: string;
  channel: string;
};

function Audience({ run }: { run: Run }) {
  const [page, setPage] = useState(0);
  const load = useCallback(async () => {
    const { data, error } = await db()
      .from("send_recipients")
      .select("id,full_name,destination,channel")
      .eq("run_id", run.id)
      .order("full_name")
      .order("id")
      .range(page * 50, page * 50 + 50);
    if (error) throw error;
    return data as Recipient[];
  }, [run.id, page]);

  const { data, busy, error, refresh } = useLoad(load);

  return (
    <details className="audience">
      <summary style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
        <Users size={16} />
        <span>View saved audience · {num(run.recipient_count)} destinations</span>
      </summary>

      <div style={{ marginTop: "12px" }}>
        <State
          busy={busy}
          error={error}
          retry={refresh}
          empty={!!data && !data.length}
        />
        {data && (
          <>
            <div className="table-wrap" style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }}>
              <table>
                <thead>
                  <tr>
                    <th>Name at approval</th>
                    <th>Destination</th>
                    <th>Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 50).map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.full_name}</strong></td>
                      <td><span className="code-cell">{r.destination}</span></td>
                      <td>
                        <Badge tone={r.channel === "email" ? "green" : "neutral"}>
                          {r.channel.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} hasMore={data.length > 50} onChange={setPage} />
          </>
        )}
      </div>
    </details>
  );
}

export function CampaignActions({ campaignId }: { campaignId: string }) {
  const { membership } = useAccess();
  const owner = membership.role === "owner";
  const [runs, setRuns] = useState<Run[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [checked, setChecked] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await db()
      .from("send_runs")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) {
      setError("Could not load send progress. Try again.");
      return;
    }
    setRuns(data as Run[]);
    setError("");
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [load]);

  async function action(name: string, args: Record<string, unknown>) {
    setWorking(true);
    setError("");
    try {
      const { error } = await db().rpc(name, args);
      if (error) throw error;
      setChecked(false);
      await load();
    } catch {
      setError(
        "The action could not be confirmed. Refresh progress before trying again; retries reuse the same send.",
      );
    } finally {
      setWorking(false);
    }
  }

  const current = runs.find(
    (r) => !["blocked", "cancelled"].includes(r.status),
  );

  return (
    <section className="panel section-gap">
      <div className="panel-heading">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Send size={18} style={{ color: "var(--brand-green)" }} />
            <h2 style={{ margin: 0 }}>Send this campaign</h2>
          </div>
          <p>Review a snapshot audience before approving delivery.</p>
        </div>
        <Badge tone={owner ? "green" : "neutral"}>
          {owner ? "Owner controls" : "View only"}
        </Badge>
      </div>

      {error && (
        <div className="method-note" role="alert" style={{ borderColor: "#ef4444", background: "#fef2f2", color: "#991b1b" }}>
          {error}{" "}
          <button className="button secondary" onClick={() => void load()} style={{ marginTop: "8px" }}>
            <RotateCcw size={14} /> Refresh progress
          </button>
        </div>
      )}

      {loading && !error && <p role="status" style={{ padding: "16px 0", color: "var(--muted)" }}>Loading send history…</p>}

      {!loading && !current && (
        <div className="action-body" style={{ background: "var(--surface-subtle)", borderRadius: "var(--radius)", padding: "20px" }}>
          <p style={{ margin: 0, fontSize: "14px" }}>
            No active send.{" "}
            {owner
              ? "Build a preview to inspect the exact eligible recipients."
              : "An owner can prepare and approve a send."}
          </p>
          {owner && (
            <button
              className="button"
              disabled={working || !!error}
              onClick={() =>
                action("portal_prepare_send", { p_campaign_id: campaignId })
              }
              style={{ marginTop: "14px" }}
            >
              Prepare recipient preview
            </button>
          )}
        </div>
      )}

      {current && (
        <div className="action-body" style={{ background: "var(--surface-subtle)", borderRadius: "var(--radius)", padding: "24px" }}>
          <div className="send-status">
            <h3 style={{ margin: 0 }}>{current.campaign_snapshot.name}</h3>
            <Badge
              tone={
                current.status === "completed" || current.status === "delivered"
                  ? "green"
                  : current.status === "preview"
                    ? "amber"
                    : "neutral"
              }
            >
              {current.status.toUpperCase()}
            </Badge>
          </div>

          <p style={{ marginTop: "8px", fontSize: "13.5px" }}>
            <strong>{current.campaign_snapshot.channel.toUpperCase()}</strong> ·{" "}
            {current.campaign_snapshot.target_country || "All countries"} ·{" "}
            <strong>{num(current.recipient_count)} saved destinations</strong>
          </p>

          <p className="footnote">
            One recipient per distinct eligible destination. Marketing consent,
            valid channel address, deletion, suppression and country rules
            apply. Multiple customer records sharing an address count once. This
            saved list does not grow after approval.
          </p>

          {current.safe_message && (
            <p className="method-note" role="status">
              {current.safe_message}
            </p>
          )}

          <Audience key={current.id} run={current} />

          {current.status === "preview" && (
            <div style={{ marginTop: "20px", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--muted)" }}>
                <Clock size={14} />
                <span>
                  Preview expires:{" "}
                  <strong>{new Date(current.preview_expires_at).toLocaleString()}</strong>
                </span>
              </div>
              <p style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "4px" }}>
                If recipients become ineligible before dispatch, this attempt is
                stopped for a new review.
              </p>

              {owner && (
                <>
                  <label className="approve-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setChecked(e.target.checked)}
                    />
                    <span>
                      I approve sending this campaign to exactly{" "}
                      <strong>{num(current.recipient_count)}</strong> destinations.
                    </span>
                  </label>

                  <div className="action-buttons">
                    <button
                      className="button"
                      disabled={
                        !checked ||
                        working ||
                        !!error ||
                        current.recipient_count === 0 ||
                        Date.parse(current.preview_expires_at) <= Date.now()
                      }
                      onClick={() =>
                        action("portal_confirm_send", {
                          p_run_id: current.id,
                          p_expected_count: current.recipient_count,
                        })
                      }
                    >
                      <CheckCircle2 size={16} />
                      {working ? "Recording approval…" : "Confirm and send"}
                    </button>
                    <button
                      className="button secondary"
                      disabled={working}
                      onClick={() =>
                        action("portal_cancel_preview", {
                          p_run_id: current.id,
                        })
                      }
                    >
                      Discard preview
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {current.approved_at && (
            <div style={{ marginTop: "20px", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
              <p style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--ink)" }}>
                Approved on {new Date(current.approved_at).toLocaleString()}. Saved
                approval and recipients remain unchanged.
              </p>
              <div className="metrics-row">
                {[
                  ["Approved", current.recipient_count],
                  ["Accepted", current.accepted_count],
                  ["Rejected", current.rejected_count],
                  ["Delivered", current.delivered_count],
                  ["Opened", current.opened_count],
                  ["Bounced", current.bounced_count],
                  ["Unsubscribed", current.unsubscribed_count],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{num(v)}</strong>
                  </div>
                ))}
              </div>
              <p className="footnote" style={{ marginTop: "14px" }}>
                Observed counts use unique recipient IDs per event type and may
                overlap. Accepted means the provider acknowledged a recipient,
                not delivered. Last synchronized:{" "}
                <strong>
                  {current.last_synced_at
                    ? new Date(current.last_synced_at).toLocaleString()
                    : "Waiting for worker"}
                </strong>
                .
              </p>
              {current.issue_count > 0 && (
                <div
                  role="alert"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 14px",
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    color: "#b45309",
                    borderRadius: "var(--radius-sm)",
                    marginTop: "12px",
                    fontSize: "13px",
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>
                    {num(current.issue_count)} provider reports need review;
                    totals may be incomplete.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {runs
        .filter((r) => ["blocked", "cancelled"].includes(r.status))
        .map((r) => (
          <div className="method-note" key={r.id} style={{ marginTop: "16px" }}>
            <Badge tone="red">{r.status}</Badge> {num(r.recipient_count)} saved
            destinations. {r.safe_message || "Preview discarded; no dispatch."}
            {r.approved_at && <Audience run={r} />}
          </div>
        ))}

      <p className="footnote">
        One dispatch per campaign. Background delivery reporting continues while
        the worker is running.
      </p>

      <Sharing campaignId={campaignId} owner={owner} />
    </section>
  );
}

function Sharing({
  campaignId,
  owner,
}: {
  campaignId: string;
  owner: boolean;
}) {
  const [password, setPassword] = useState(""),
    [link, setLink] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await db()
      .from("share_links")
      .select("id,created_at,expires_at,revoked_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data as {
      id: string;
      created_at: string;
      expires_at: string;
      revoked_at: string | null;
    }[];
  }, [campaignId]);

  const state = useLoad(load);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setLink("");
    try {
      const { data, error } = await db().rpc("portal_create_share", {
        p_campaign_id: campaignId,
        p_password: password,
      });
      if (error) throw error;
      setLink(`${window.location.origin}/share#token=${data.token}`);
      setPassword("");
      state.refresh();
    } catch {
      setMessage(
        "Could not create link. Use a password of 12–72 bytes and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    const { error } = await db().rpc("portal_revoke_share", { p_share_id: id });
    setMessage(
      error ? "Could not revoke this link. Try again." : "Link revoked.",
    );
    if (!error) {
      setLink("");
      state.refresh();
    }
    setBusy(false);
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="sharing">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <Share2 size={18} style={{ color: "var(--brand-green)" }} />
        <h2 style={{ margin: 0 }}>Share campaign results</h2>
      </div>
      <p style={{ margin: 0, fontSize: "13.5px" }}>
        Clients can view aggregate results with a password. Links automatically expire after
        30 days.
      </p>

      {owner && (
        <form onSubmit={create} style={{ marginTop: "18px" }}>
          <label htmlFor="share-password" style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--ink-secondary)", marginBottom: "6px" }}>
            Set a link password (12–72 bytes)
          </label>
          <div className="action-buttons">
            <input
              id="share-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={72}
              placeholder="Enter secure link password…"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="button" disabled={busy}>
              <Lock size={15} />
              Create protected link
            </button>
          </div>
        </form>
      )}

      {link && (
        <div className="method-note" style={{ background: "#f0fdf4", borderColor: "#86efac", color: "#064e3b" }}>
          <label htmlFor="new-share-link" style={{ display: "block", fontWeight: 600, marginBottom: "6px" }}>
            Copy this link now; it is shown only once. Send your chosen password
            separately.
          </label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              id="new-share-link"
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              style={{ margin: 0 }}
            />
            <button
              type="button"
              className="button secondary"
              onClick={copyLink}
              style={{ flexShrink: 0 }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p role="status" style={{ fontSize: "13px", color: "var(--muted)", marginTop: "10px" }}>
          {message}
        </p>
      )}

      <State busy={state.busy} error={state.error} retry={state.refresh} />

      {state.data && state.data.length === 0 && (
        <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "14px" }}>
          No shared links created yet.
        </p>
      )}

      {state.data && state.data.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "14px" }}>
          {state.data.map((s) => (
            <div className="share-row" key={s.id}>
              <span>
                Created {new Date(s.created_at).toLocaleDateString()} ·{" "}
                {s.revoked_at ? (
                  <Badge tone="red">Revoked</Badge>
                ) : (
                  <Badge tone="neutral">Expires {new Date(s.expires_at).toLocaleDateString()}</Badge>
                )}
              </span>
              {owner && !s.revoked_at && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => revoke(s.id)}
                  style={{ fontSize: "12px", padding: "4px 10px", minHeight: "auto" }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
