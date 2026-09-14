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
        description="An overview of your audience and campaign activity."
        action={<Refresh onClick={refresh} />}
      />
      <SendOverview />
      <State busy={busy} error={error} retry={refresh} />
      {d && (
        <>
          <div className="stats">
            <article className="stat">
              <div className="stat-label">
                Total customers
                <Users size={19} />
              </div>
              <strong>{num(d.totals.customers)}</strong>
              <small>Distinct customers · excluding deleted</small>
            </article>
            <article className="stat featured">
              <div className="stat-label">
                Contactable customers
                <UserCheck size={19} />
              </div>
              <strong>{num(d.totals.contactable)}</strong>
              <small>Eligible for email or SMS · counted once</small>
            </article>
            <article className="stat">
              <div className="stat-label">
                Email audience
                <Mail size={19} />
              </div>
              <strong>{num(d.totals.email_contactable)}</strong>
              <small>Consented, valid and unsuppressed</small>
            </article>
            <article className="stat">
              <div className="stat-label">
                SMS audience
                <Smartphone size={19} />
              </div>
              <strong>{num(d.totals.sms_contactable)}</strong>
              <small>Consented, valid and unsuppressed</small>
            </article>
          </div>
          <div className="dashboard-grid">
            <section className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <h2>Customer signups</h2>
                  <p>Last 30 calendar days · {d.timezone}</p>
                </div>
                <div className="chart-total">
                  <strong>{num(total)}</strong>
                  <small>signups</small>
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
                        style={{ height: `${(x.count / max) * 100}%` }}
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
                <p>
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
                <span className="icon-tile">
                  <Send size={23} />
                </span>
                <h2>Campaign activity</h2>
                <div className="large-number">{num(d.campaigns)}</div>
                <p>Campaigns in your workspace</p>
                <Link className="text-link" href="/campaigns">
                  Explore campaigns
                  <ArrowUpRight size={17} />
                </Link>
              </section>
              <section className="panel">
                <h2>Data quality</h2>
                <p>
                  See what was retained, excluded, or flagged during import.
                </p>
                <div className="quality-row">
                  <span>Rejected-row issues</span>
                  <strong>{num(d.issues.errors)}</strong>
                </div>
                <div className="quality-row">
                  <span>Warning issues</span>
                  <strong>{num(d.issues.warnings)}</strong>
                </div>
                <Link className="text-link" href="/imports">
                  Review import reports
                  <ArrowUpRight size={17} />
                </Link>
              </section>
            </div>
          </div>
          <div className="method-note">
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
        </>
      )}
    </>
  );
}
