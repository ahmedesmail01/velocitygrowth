"use client";
import { useCallback, useState } from "react";
import { db } from "@/lib/supabase";
import {
  PageTitle,
  Refresh,
  State,
  Pager,
  Badge,
  useLoad,
} from "@/components/ui";
import { num } from "@/lib/types";
type Run = {
  id: string;
  filename: string;
  status: string;
  total_rows: number;
  accepted_rows: number;
  rejected_rows: number;
  duplicate_rows: number;
  warning_rows: number;
  safe_error: string | null;
};
type Issue = {
  id: string;
  import_id: string;
  row_number: number;
  code: string;
  severity: string;
  safe_message: string;
};
export default function Imports() {
  const [run, setRun] = useState(""),
    [severity, setSeverity] = useState(""),
    [page, setPage] = useState(0);
  const loadRuns = useCallback(async () => {
    const { data, error } = await db()
      .from("import_runs")
      .select(
        "id,filename,status,total_rows,accepted_rows,rejected_rows,duplicate_rows,warning_rows,safe_error",
      )
      .order("created_at")
      .limit(100);
    if (error) throw error;
    return data as Run[];
  }, []);
  const reports = useLoad(loadRuns);
  const loadIssues = useCallback(async () => {
    let q = db()
      .from("import_issues")
      .select("id,import_id,row_number,code,severity,safe_message")
      .order("row_number")
      .order("id")
      .range(page * 50, page * 50 + 50);
    if (run) q = q.eq("import_id", run);
    if (severity) q = q.eq("severity", severity);
    const { data, error } = await q;
    if (error) throw error;
    return { rows: (data as Issue[]).slice(0, 50), more: data.length > 50 };
  }, [run, severity, page]);
  const issues = useLoad(loadIssues);
  return (
    <>
      <PageTitle
        eyebrow="DATA QUALITY"
        title="Import reports"
        description="See exactly what was accepted, deduplicated, or excluded."
        action={
          <Refresh
            onClick={() => {
              reports.refresh();
              issues.refresh();
            }}
          />
        }
      />
      <State
        busy={reports.busy}
        error={reports.error}
        retry={reports.refresh}
      />
      {reports.data && (
        <section className="panel table-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Source file</th>
                  <th>Status</th>
                  <th>Total rows</th>
                  <th>Accepted</th>
                  <th>Rejected</th>
                  <th>Duplicates</th>
                  <th>Warned rows</th>
                </tr>
              </thead>
              <tbody>
                {reports.data.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button
                        className="file-link"
                        onClick={() => {
                          setRun(r.id);
                          setPage(0);
                        }}
                      >
                        {r.filename}
                      </button>
                      {r.safe_error && <small>{r.safe_error}</small>}
                    </td>
                    <td>
                      <Badge
                        tone={
                          r.status === "completed"
                            ? "green"
                            : r.status === "failed"
                              ? "red"
                              : "neutral"
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    {[
                      r.total_rows,
                      r.accepted_rows,
                      r.rejected_rows,
                      r.duplicate_rows,
                      r.warning_rows,
                    ].map((n, i) => (
                      <td key={i}>{num(n)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!reports.data.length && (
            <div className="state">No imports recorded yet.</div>
          )}
        </section>
      )}
      <div className="method-note">
        <strong>Reading this report</strong>
        <p>
          Total = accepted + rejected + duplicates. Warning rows are retained
          and may have more than one issue. Accepted rows can update an existing
          customer. An error on a record does not mean the entire import failed.
        </p>
      </div>
      <section className="panel table-panel section-gap">
        <div className="toolbar">
          <h2>Row-level issues</h2>
          <label className="filter-label">
            File
            <select
              aria-label="Filter issues by file"
              value={run}
              onChange={(e) => {
                setRun(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All files</option>
              {reports.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.filename}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-label">
            Severity
            <select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All issues</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
            </select>
          </label>
        </div>
        <State
          busy={issues.busy}
          error={issues.error}
          retry={issues.refresh}
          empty={!!issues.data && !issues.data.rows.length}
        />
        {issues.data && issues.data.rows.length > 0 && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Source file</th>
                    <th>Line</th>
                    <th>Severity</th>
                    <th>Issue</th>
                    <th>Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.data.rows.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {reports.data?.find((r) => r.id === i.import_id)
                          ?.filename ?? "Source unavailable"}
                      </td>
                      <td>{num(i.row_number)}</td>
                      <td>
                        <Badge tone={i.severity === "error" ? "red" : "amber"}>
                          {i.severity}
                        </Badge>
                      </td>
                      <td className="code-cell">{i.code}</td>
                      <td>{i.safe_message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} hasMore={issues.data.more} onChange={setPage} />
          </>
        )}
      </section>
      <p className="footnote">
        Line references point to the ending line of each CSV record. Only safe
        issue descriptions appear here.
      </p>
    </>
  );
}
