"use client";
import { SendOverview } from "@/components/send-overview";
import { useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  Send,
  ArrowUpRight,
  UserCheck,
  Mail,
  Smartphone,
  BarChart3,
  ShieldAlert,
  Info,
} from "lucide-react";
import { useAccess } from "@/components/auth";
import { PageTitle, Refresh, State, useLoad } from "@/components/ui";
import { db } from "@/lib/supabase";
import { num, type Dashboard } from "@/lib/types";

export default function DashboardPage() {
  const { brand } = useAccess();
  const load = useCallback(async () => {
    const { data, error } = await db().rpc("portal_dashboard");
    if (error || !data) throw Error("dashboard");
    return data as Dashboard;
  }, []);
  const { data: d, busy, error, refresh } = useLoad(load);

  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  const total = d?.signups.reduce((n, x) => n + x.count, 0) ?? 0,
    max = Math.max(1, ...(d?.signups.map((x) => x.count) ?? []));

  return (
    <>
      <PageTitle
        eyebrow={brand.name.toUpperCase()}
        title="Your growth, at a glance"
        description="An overview of your audience, campaign activity, and delivery status."
        action={<Refresh onClick={refresh} />}
      />
      <SendOverview />
      <State busy={busy} error={error} retry={refresh} />
      {d && (
        <>
          <div className="stats" style={{ marginTop: "24px" }}>
            <article className="stat">
              <div className="stat-label">
                <span>Total customers</span>
                <span className="icon-tile" style={{ width: "32px", height: "32px", borderRadius: "8px" }}>
                  <Users size={16} />
                </span>
              </div>
              <strong>{num(d.totals.customers)}</strong>
              <small>Distinct customers · excluding deleted</small>
            </article>

            <article className="stat featured">
              <div className="stat-label">
                <span>Contactable customers</span>
                <span className="icon-tile" style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#dcfce7", borderColor: "#86efac", color: "#059669" }}>
                  <UserCheck size={16} />
                </span>
              </div>
              <strong>{num(d.totals.contactable)}</strong>
              <small>Eligible for email or SMS · counted once</small>
            </article>

            <article className="stat">
              <div className="stat-label">
                <span>Email audience</span>
                <span className="icon-tile" style={{ width: "32px", height: "32px", borderRadius: "8px" }}>
                  <Mail size={16} />
                </span>
              </div>
              <strong>{num(d.totals.email_contactable)}</strong>
              <small>Consented, valid and unsuppressed</small>
            </article>

            <article className="stat">
              <div className="stat-label">
                <span>SMS audience</span>
                <span className="icon-tile" style={{ width: "32px", height: "32px", borderRadius: "8px" }}>
                  <Smartphone size={16} />
                </span>
              </div>
              <strong>{num(d.totals.sms_contactable)}</strong>
              <small>Consented, valid and unsuppressed</small>
            </article>
          </div>

          <div className="dashboard-grid">
            <section className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <BarChart3 size={18} style={{ color: "var(--brand-green)" }} />
                    <h2 style={{ margin: 0 }}>Customer signups</h2>
                  </div>
                  <p>Last 30 calendar days · {d.timezone}</p>
                </div>
                <div className="chart-total">
                  <strong>{num(total)}</strong>
                  <small>Total signups</small>
                </div>
              </div>

              <div
                className="bar-chart"
                aria-label="Daily signups for the last 30 days"
              >
                {d.signups.map((x, i) => (
                  <div
                    className="bar-column"
                    key={x.day}
                    title={`${x.day}: ${num(x.count)} signups`}
                  >
                    <div className="bar-track">
                      <div
                        className="bar"
                        style={{ height: `${Math.max(4, (x.count / max) * 100)}%` }}
                      />
                    </div>
                    <span>
                      {(i % 7 === 0 && i < 27) || i === 29
                        ? x.day.slice(5)
                        : ""}
                    </span>
                  </div>
                ))}
              </div>

              {total === 0 && (
                <p className="chart-empty">
                  No signups were recorded in this period.
                </p>
              )}

              <details className="definitions">
                <summary>View daily counts and counting rules</summary>
                <p style={{ marginTop: "8px" }}>
                  Non-deleted customers, grouped by signup date in the brand
                  timezone. Dates without a time use local midnight. Missing
                  dates are excluded.
                </p>
                <div className="daily-grid">
                  {d.signups.map((x) => (
                    <div key={x.day}>
                      <span>{x.day}</span>
                      <strong>{num(x.count)}</strong>
                    </div>
                  ))}
                </div>
              </details>
            </section>

            <div className="dashboard-side">
              <section className="panel campaign-callout">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="icon-tile">
                    <Send size={20} />
                  </span>
                  <span className="badge green">Live Campaigns</span>
                </div>
                <h2>Campaign activity</h2>
                <div className="large-number">{num(d.campaigns)}</div>
                <p>Active campaigns in your brand workspace</p>
                <Link className="text-link" href="/campaigns">
                  <span>Explore campaigns</span>
                  <ArrowUpRight size={17} />
                </Link>
              </section>

              <section className="panel">
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                  <span className="icon-tile" style={{ width: "36px", height: "36px", background: "#fef3c7", borderColor: "#fde68a", color: "#d97706" }}>
                    <ShieldAlert size={18} />
                  </span>
                  <h2 style={{ margin: 0 }}>Data quality</h2>
                </div>
                <p>
                  Review excluded, deduplicated, or flagged records from imports.
                </p>
                <div className="quality-row">
                  <span style={{ color: "var(--muted)" }}>Rejected-row errors</span>
                  <span className="badge red">{num(d.issues.errors)}</span>
                </div>
                <div className="quality-row">
                  <span style={{ color: "var(--muted)" }}>Warning issues</span>
                  <span className="badge amber">{num(d.issues.warnings)}</span>
                </div>
                <Link className="text-link" href="/imports">
                  <span>Review import reports</span>
                  <ArrowUpRight size={17} />
                </Link>
              </section>
            </div>
          </div>

          <div className="method-note">
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <Info size={18} style={{ color: "var(--brand-green)", flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>How we count contactability</strong>
                <p>
                  Active status, explicit consent, a valid destination, no deletion,
                  and no current suppression for that channel. Email and SMS
                  audiences can overlap. A campaign’s country filter may narrow its
                  audience further.
                </p>
                <span>
                  Updated {new Date(d.as_of).toLocaleTimeString()} · Refresh to
                  check for changes
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
