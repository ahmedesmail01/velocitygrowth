"use client";
import { useCallback, useState, useEffect } from "react";
import { Search, Mail, Smartphone } from "lucide-react";
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
        eyebrow="AUDIENCE"
        title="Your contacts"
        description="Explore your customers and their current channel eligibility."
        action={<Refresh onClick={refresh} />}
      />
      <section className="panel table-panel">
        <div className="toolbar">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search contacts"
              placeholder="Search name, email or customer ID"
              value={search}
              maxLength={80}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="filter-label">
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All statuses</option>
              {["active", "pending", "bounced", "unsubscribed"].map((x) => (
                <option key={x}>{x}</option>
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
                        <strong>{c.full_name}</strong>
                        <small>{c.external_id}</small>
                      </td>
                      <td>
                        <span>{c.email ?? "No valid email"}</span>
                        <small>{c.phone ?? "No valid phone"}</small>
                      </td>
                      <td>{c.country ?? "Unknown"}</td>
                      <td>
                        <Badge
                          tone={c.status === "active" ? "green" : "neutral"}
                        >
                          {c.status}
                        </Badge>
                      </td>
                      <td>
                        <div className="channel-icons">
                          {data.eligible[c.id]?.email_contactable && (
                            <Badge tone="green">
                              <Mail size={13} />
                              Email
                            </Badge>
                          )}
                          {data.eligible[c.id]?.sms_contactable && (
                            <Badge tone="green">
                              <Smartphone size={13} />
                              SMS
                            </Badge>
                          )}
                          {!data.eligible[c.id]?.email_contactable &&
                            !data.eligible[c.id]?.sms_contactable && (
                              <span className="muted">None</span>
                            )}
                        </div>
                      </td>
                      <td>
                        {date(c.signup_at, brand.timezone)}
                        {c.signup_precision === "date" && (
                          <small>Date only</small>
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
        alone does not mean a customer is contactable.
      </p>
    </>
  );
}
