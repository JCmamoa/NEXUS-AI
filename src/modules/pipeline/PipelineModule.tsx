import { useCallback, useEffect, useState } from "react";
import StatCard from "../../components/StatCard";
import { api } from "../../lib/ipc";
import type { DocumentKind, DocumentStatus, ExtractedDoc } from "../../types";
import type { Notify } from "../../App";

interface Props {
  notify: Notify;

}

const STATUS_LABEL: Record<DocumentStatus, string> = {
  processed: "Processed",
  pending: "Pending approval",
  failed: "Rejected",
};

export default function PipelineModule({ notify }: Props) {
  const [docs, setDocs] = useState<ExtractedDoc[]>([]);
  const [watchFolder, setWatchFolder] = useState(
    () => localStorage.getItem("nexus.watchFolder") ?? "~/Downloads/Invoices",
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setDocs(await api<ExtractedDoc[]>("pipeline_list_documents"));
    } catch (e) {
      notify(`Failed to list documents: ${String(e)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const ingest = async (filename: string, kind: DocumentKind) => {
    setBusy(true);
    try {
      const doc = await api<ExtractedDoc>("pipeline_ingest", { filename, kind });
      notify(
        doc.status === "processed"
          ? `${doc.filename} extracted and written to the database`
          : `${doc.filename} routed to Pending Approval`,
        doc.status === "processed" ? "success" : "info",
      );
      await reload();
    } catch (e) {
      notify(`Ingest failed: ${String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (doc: ExtractedDoc, approve: boolean) => {
    try {
      await api("pipeline_decide", { id: doc.id, approve });
      notify(
        approve
          ? `${doc.filename} approved and committed`
          : `${doc.filename} rejected`,
        approve ? "success" : "info",
      );
      await reload();
    } catch (e) {
      notify(`Decision failed: ${String(e)}`, "error");
    }
  };

  const pending = docs.filter((d) => d.status === "pending").length;
  const processed = docs.filter((d) => d.status === "processed").length;
  const failed = docs.filter((d) => d.status === "failed").length;

  const sampleInvoice = `invoice-2026-${Math.floor(1000 + Math.random() * 8999)}.pdf`;

  return (
    <div className="stack">
      <div className="stat-grid stat-grid-3">
        <StatCard label="Processed" value={String(processed)} hint="written to database" tone="green" />
        <StatCard label="Pending approval" value={String(pending)} hint="discrepancies & OCR issues" tone="amber" />
        <StatCard label="Rejected" value={String(failed)} hint="excluded from writes" tone="violet" />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Watched folder</h2>
          <span className="badge badge-muted">background daemon</span>
        </div>
        <div className="row">
          <input
            className="input input-grow"
            value={watchFolder}
            onChange={(e) => setWatchFolder(e.target.value)}
            onBlur={() => localStorage.setItem("nexus.watchFolder", watchFolder)}
            aria-label="Watched folder"
          />
          <button
            className="btn"
            disabled={busy}
            onClick={() => void ingest(sampleInvoice, "invoice")}
          >
            {busy ? "Extracting…" : "Simulate file arrival"}
          </button>
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void ingest("invoice-2026-bad-scan.pdf", "invoice")}
          >
            Simulate unreadable scan
          </button>
        </div>
        <p className="hint">
          New PDF, image or CSV files in this folder are extracted, validated
          against business rules (tax ID, taxes, amounts) and written to the
          connected database. Anything unreadable or inconsistent is routed to
          the approval queue below.
        </p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Documents</h2>
          <span className="badge badge-muted">{docs.length} total</span>
        </div>
        {loading ? (
          <div className="loading">Loading documents…</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>File</th>
                <th>Vendor</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Issues</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.filename}</strong>
                    <small className="muted">{d.kind}</small>
                  </td>
                  <td>{d.vendor}</td>
                  <td className="num">
                    {d.amount !== null ? `$${d.amount.toFixed(2)}` : "—"}
                    {d.tax !== null && d.tax > 0 && (
                      <small className="muted">tax ${d.tax.toFixed(2)}</small>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge badge-${
                        d.status === "processed"
                          ? "ok"
                          : d.status === "pending"
                            ? "warn"
                            : "err"
                      }`}
                    >
                      {STATUS_LABEL[d.status]}
                    </span>
                  </td>
                  <td className="issues">
                    {d.issues.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <ul>
                        {d.issues.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="row-right">
                    {d.status === "pending" && (
                      <>
                        <button className="btn btn-sm" onClick={() => void decide(d, true)}>
                          Approve
                        </button>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => void decide(d, false)}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    No documents yet — simulate a file arrival to start the pipeline.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
