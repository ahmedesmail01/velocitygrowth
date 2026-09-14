export type Membership = {
  user_id: string;
  brand_id: string;
  role: "owner" | "analyst";
  active: boolean;
};
export type Brand = {
  id: string;
  code: string;
  name: string;
  timezone: string;
};
export type Campaign = {
  id: string;
  external_id: string;
  name: string;
  channel: string;
  target_country: string | null;
  reported_sent: number | null;
  reported_delivered: number | null;
  reported_opens: number | null;
  reported_clicks: number | null;
  reported_bounced: number | null;
  spend: string | null;
  sent_at: string | null;
};
export type Dashboard = {
  totals: {
    customers: number;
    contactable: number;
    email_contactable: number;
    sms_contactable: number;
  };
  timezone: string;
  as_of: string;
  campaigns: number;
  issues: { errors: number; warnings: number };
  signups: { day: string; count: number }[];
};
export const num = (n: number | string | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("en-US");
export const date = (v: string | null, zone = "UTC") =>
  v
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: zone,
      }).format(new Date(v))
    : "—";
