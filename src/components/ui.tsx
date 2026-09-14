"use client";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
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
    <button className="button secondary" onClick={onClick}>
      <RefreshCw size={16} />
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
        Loading your data…
      </div>
    );
  if (error)
    return (
      <div className="state" role="alert">
        <AlertCircle />
        <p>{error}</p>
        <button onClick={retry}>Try again</button>
      </div>
    );
  if (empty)
    return (
      <div className="state">
        <h3>No matching records</h3>
        <p>Try a different search or filter.</p>
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
        <ChevronLeft size={17} />
        Previous
      </button>
      <button
        aria-label="Next page"
        disabled={!hasMore}
        onClick={() => onChange(page + 1)}
      >
        Next
        <ChevronRight size={17} />
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
