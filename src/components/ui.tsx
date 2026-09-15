"use client";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from "lucide-react";

export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((x) => x + 1), []);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setData(null);
    setError("");
    load()
      .then((r) => {
        if (live) setData(r);
      })
      .catch(() => {
        if (live)
          setError(
            "We couldn’t load this data. Check your connection and try again.",
          );
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [load, version]);
  return { data, error, busy, refresh };
}

export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Refresh({ onClick }: { onClick: () => void }) {
  return (
    <button className="button secondary" onClick={onClick} title="Refresh data">
      <RefreshCw size={15} />
      Refresh
    </button>
  );
}

export function State({
  busy,
  error,
  retry,
  empty = false,
}: {
  busy: boolean;
  error: string;
  retry: () => void;
  empty?: boolean;
}) {
  if (busy)
    return (
      <div className="state" role="status">
        <div className="spinner" />
        <span style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--muted)" }}>
          Loading your data…
        </span>
      </div>
    );
  if (error)
    return (
      <div className="state" role="alert">
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "var(--radius)",
            padding: "24px 28px",
            maxWidth: "440px",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <AlertCircle size={28} style={{ color: "#dc2626" }} />
          <p style={{ color: "#991b1b", fontWeight: 500, margin: 0, textAlign: "center" }}>
            {error}
          </p>
          <button className="button secondary" onClick={retry} style={{ marginTop: "4px" }}>
            Try again
          </button>
        </div>
      </div>
    );
  if (empty)
    return (
      <div className="state">
        <div
          style={{
            background: "var(--surface)",
            border: "1px dashed var(--line)",
            borderRadius: "var(--radius)",
            padding: "36px 28px",
            maxWidth: "440px",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Inbox size={32} style={{ color: "var(--muted-light)", marginBottom: "4px" }} />
          <h3 style={{ margin: 0, color: "var(--ink)" }}>No matching records</h3>
          <p style={{ margin: 0, fontSize: "13.5px", color: "var(--muted)" }}>
            Try a different search or filter.
          </p>
        </div>
      </div>
    );
  return null;
}

export function Pager({
  page,
  hasMore,
  onChange,
}: {
  page: number;
  hasMore: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className="pager">
      <span>Page {page + 1}</span>
      <button
        aria-label="Previous page"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={16} />
        Previous
      </button>
      <button
        aria-label="Next page"
        disabled={!hasMore}
        onClick={() => onChange(page + 1)}
      >
        Next
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
