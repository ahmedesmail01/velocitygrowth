"use client";
import { useCallback, useState, useEffect } from "react";
import { Search, Mail, Smartphone, Globe, Calendar, User, X } from "lucide-react";
import { db } from "@/lib/supabase";
import { useAccess } from "@/components/auth";
import {
  PageTitle,
  Refresh,
  State,
  Pager,
  Badge,
  useLoad,
} from "@/components/ui";
import { date } from "@/lib/types";

type Contact = {
  id: string;
  external_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  status: string;
  consent_marketing: boolean;
  signup_at: string | null;
  signup_precision: string;
};

export default function Contacts() {
  const { brand } = useAccess();
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      setQuery(search.replace(/[^\p{L}\p{N}\s@.+-]/gu, "").trim());
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    let request = db()
      .from("contacts")
      .select(
        "id,external_id,full_name,email,phone,country,status,consent_marketing,signup_at,signup_precision",
      )
      .is("deleted_at", null)
      .order("full_name")
      .order("id")
      .range(page * 50, page * 50 + 50);

    if (status) request = request.eq("status", status);
    if (query)
      request = request.or(
        `full_name.ilike.%${query}%,email.ilike.%${query}%,external_id.ilike.%${query}%`,
      );

    const { data, error } = await request;
    if (error) throw error;
    const rows = (data ?? []) as Contact[];
    const ids = rows.slice(0, 50).map((r) => r.id);
    const eligible: Record<
      string,
      { email_contactable: boolean; sms_contactable: boolean }
    > = {};

    if (ids.length) {
      const { data: e, error } = await db()
        .from("contact_eligibility")
        .select("id,email_contactable,sms_contactable")
        .in("id", ids);
      if (error) throw error;
      for (const r of e ?? []) eligible[r.id] = r;
    }

    return { rows: rows.slice(0, 50), more: rows.length > 50, eligible };
  }, [page, query, status]);

  const { data, busy, error, refresh } = useLoad(load);

  return (
    <>
      <PageTitle
        eyebrow="AUDIENCE & CRM"
        title="Your contacts"
        description="Explore your customer base and their live channel eligibility."
        action={<Refresh onClick={refresh} />}
      />

      <section className="panel table-panel">
        <div className="toolbar">
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Search contacts"
              placeholder="Search name, email, or customer ID…"
              value={search}
              maxLength={80}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{ background: "none", border: "none", padding: 0, boxShadow: "none", color: "var(--muted)" }}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </label>

          <label className="filter-label">
            <span>Status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All statuses</option>
              {["active", "pending", "bounced", "unsubscribed"].map((x) => (
                <option key={x} value={x}>
                  {x.charAt(0).toUpperCase() + x.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <State
          busy={busy}
          error={error}
          retry={refresh}
          empty={!!data && !data.rows.length}
        />

        {data && data.rows.length > 0 && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Contact details</th>
                    <th>Country</th>
                    <th>Status</th>
                    <th>Eligible channels</th>
                    <th>Signed up</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span
                            className="avatar"
                            style={{
                              width: "30px",
                              height: "30px",
                              fontSize: "11px",
                              borderRadius: "6px",
                              background: "var(--surface-subtle)",
                              color: "var(--ink)",
                              border: "1px solid var(--line)",
                            }}
                          >
                            <User size={14} style={{ color: "var(--muted)" }} />
                          </span>
                          <div>
                            <strong>{c.full_name}</strong>
                            <small className="code-cell">{c.external_id}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ color: c.email ? "var(--ink)" : "var(--muted-light)" }}>
                            {c.email ?? "No email"}
                          </span>
                          {c.phone && (
                            <small style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                              {c.phone}
                            </small>
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--ink-secondary)" }}>
                          <Globe size={13} style={{ color: "var(--muted)" }} />
                          {c.country ?? "Unknown"}
                        </span>
                      </td>
                      <td>
                        <Badge
                          tone={
                            c.status === "active"
                              ? "green"
                              : c.status === "pending"
                                ? "amber"
                                : c.status === "bounced"
                                  ? "red"
                                  : "neutral"
                          }
                        >
                          {c.status}
                        </Badge>
                      </td>
                      <td>
                        <div className="channel-icons">
                          {data.eligible[c.id]?.email_contactable && (
                            <Badge tone="green">
                              <Mail size={12} />
                              Email
                            </Badge>
                          )}
                          {data.eligible[c.id]?.sms_contactable && (
                            <Badge tone="green">
                              <Smartphone size={12} />
                              SMS
                            </Badge>
                          )}
                          {!data.eligible[c.id]?.email_contactable &&
                            !data.eligible[c.id]?.sms_contactable && (
                              <span className="muted" style={{ fontSize: "12px" }}>None</span>
                            )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                          <Calendar size={13} style={{ color: "var(--muted-light)" }} />
                          <span>{date(c.signup_at, brand.timezone)}</span>
                        </div>
                        {c.signup_precision === "date" && (
                          <small style={{ color: "var(--muted-light)", display: "block" }}>
                            Date only
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} hasMore={data.more} onChange={setPage} />
          </>
        )}
      </section>

      <p className="footnote">
        50 customers per page. Deleted customers are excluded. “Active” status
        alone does not guarantee message deliverability (consent and suppression
        filters also apply).
      </p>
    </>
  );
}
