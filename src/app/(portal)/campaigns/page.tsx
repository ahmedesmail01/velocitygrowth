"use client";
import { CampaignActions } from "@/components/campaign-actions";
import { useCallback, useState } from "react";
import { ArrowLeft, ArrowUpRight, Mail, Smartphone, Calendar, Globe, AlertTriangle, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/supabase";
import { useAccess } from "@/components/auth";
import { PageTitle, Refresh, State, Badge, useLoad } from "@/components/ui";
import { num, date, type Campaign } from "@/lib/types";

type Results = {
  campaign: Campaign;
  observed: {
    open_events: number;
    unique_openers: number;
    click_events: number;
    unique_clickers: number;
    bounced_contacts: number;
    unsubscribed_contacts: number;
    complaint_contacts: number;
    different_channel_events: number;
  };
};

function Detail({ id, back }: { id: string; back: () => void }) {
  const { brand } = useAccess();
  const load = useCallback(async () => {
    const { data, error } = await db().rpc("portal_campaign_results", {
      p_campaign_id: id,
    });
    if (error || !data) throw Error("Not found");
    return data as Results;
  }, [id]);
  const { data: d, busy, error, refresh } = useLoad(load);

  return (
    <>
      <button className="back" onClick={back}>
        <ArrowLeft size={16} />
        Back to all campaigns
      </button>

      <State busy={busy} error={error} retry={refresh} />

      {d && (
        <>
          <PageTitle
            eyebrow={d.campaign.external_id}
            title={d.campaign.name}
            description={`${d.campaign.channel.toUpperCase()} · ${date(d.campaign.sent_at, brand.timezone)} · ${d.campaign.target_country ?? "All countries"}`}
            action={<Refresh onClick={refresh} />}
          />

          <section className="panel">
            <div className="panel-heading">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h2 style={{ margin: 0 }}>Source-reported results</h2>
                </div>
                <p>Historical totals supplied directly in the campaign export.</p>
              </div>
              <Badge>Reported</Badge>
            </div>
            <div className="metrics-row">
              {[
                ["Sent", d.campaign.reported_sent],
                ["Delivered", d.campaign.reported_delivered],
                ["Bounced", d.campaign.reported_bounced],
                ["Opens", d.campaign.reported_opens],
                ["Clicks", d.campaign.reported_clicks],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <span>{k}</span>
                  <strong>{num(v)}</strong>
                </div>
              ))}
            </div>
            <p className="footnote">
              Reported opens and clicks may include repeated events and are not
              guaranteed to reflect unique recipients.
            </p>
          </section>

          <section className="panel section-gap">
            <div className="panel-heading">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <CheckCircle2 size={18} style={{ color: "var(--brand-green)" }} />
                  <h2 style={{ margin: 0 }}>Observed engagement</h2>
                </div>
                <p>Calculated strictly from accepted, deduplicated event logs.</p>
              </div>
              <Badge tone="green">Observed</Badge>
            </div>
            <div className="metrics-row">
              {[
                ["Unique openers", d.observed.unique_openers],
                ["Unique clickers", d.observed.unique_clickers],
                ["Bounced contacts", d.observed.bounced_contacts],
                ["Unsubscribed contacts", d.observed.unsubscribed_contacts],
                ["Complaint contacts", d.observed.complaint_contacts],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <span>{k}</span>
                  <strong>{num(v)}</strong>
                </div>
              ))}
            </div>
            <div className="method-note">
              <p>
                Total open events: <strong>{num(d.observed.open_events)}</strong> ·
                Total click events: <strong>{num(d.observed.click_events)}</strong>.
              </p>
              <p>
                Unique counts use distinct customer identities within this
                campaign. Rejected and unresolved events are excluded. Historical
                delivery totals cannot be reconstructed from the supplied
                engagement log, so observed delivery rates are not inferred.
              </p>
              {d.observed.different_channel_events > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#b45309",
                    background: "#fffbeb",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    marginTop: "10px",
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>
                    <strong>Channel mismatch:</strong>{" "}
                    {num(d.observed.different_channel_events)} events use a
                    different channel from the campaign specification.
                  </span>
                </div>
              )}
            </div>
          </section>

          <CampaignActions key={id} campaignId={id} />
        </>
      )}
    </>
  );
}

export default function Campaigns() {
  const { brand } = useAccess();
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await db()
      .from("campaigns")
      .select(
        "id,external_id,name,channel,target_country,reported_sent,reported_delivered,reported_bounced,reported_opens,reported_clicks,spend,sent_at",
      )
      .order("sent_at", { ascending: false })
      .order("id")
      .limit(100);
    if (error) throw error;
    return data as Campaign[];
  }, []);

  const { data, busy, error, refresh } = useLoad(load);

  if (selected) return <Detail id={selected} back={() => setSelected(null)} />;

  return (
    <>
      <PageTitle
        eyebrow="CAMPAIGN PERFORMANCE"
        title="Every campaign, in view"
        description="Review reported delivery and deep engagement behind each client campaign."
        action={<Refresh onClick={refresh} />}
      />

      <State
        busy={busy}
        error={error}
        retry={refresh}
        empty={!!data && !data.length}
      />

      {data && (
        <>
          <p className="footnote" style={{ marginBottom: "20px" }}>
            Cards display source-reported figures. Click any campaign to explore
            unique observed engagement and dispatch actions.
          </p>
          <div className="campaign-grid">
            {data.map((c) => (
              <button
                key={c.id}
                className="campaign-card"
                onClick={() => setSelected(c.id)}
              >
                <div className="campaign-card-top">
                  <span className="icon-tile">
                    {c.channel === "email" ? (
                      <Mail size={18} />
                    ) : (
                      <Smartphone size={18} />
                    )}
                  </span>
                  <Badge tone={c.channel === "email" ? "green" : "neutral"}>
                    {c.channel.toUpperCase()}
                  </Badge>
                </div>

                <small>{c.external_id}</small>
                <h2>{c.name}</h2>

                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", fontSize: "12px", color: "var(--muted)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Calendar size={13} />
                    {date(c.sent_at, brand.timezone)}
                  </span>
                  <span>·</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Globe size={13} />
                    {c.target_country ?? "All countries"}
                  </span>
                </div>

                <div className="campaign-numbers">
                  <div>
                    <span>Reported sent</span>
                    <strong>{num(c.reported_sent)}</strong>
                  </div>
                  <div>
                    <span>Reported delivered</span>
                    <strong>{num(c.reported_delivered)}</strong>
                  </div>
                </div>

                <div className="card-action">
                  <span>View performance</span>
                  <ArrowUpRight size={17} />
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
