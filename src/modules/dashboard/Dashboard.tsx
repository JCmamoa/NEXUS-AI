import { useEffect, useState } from "react";
import StatCard from "../../components/StatCard";
import { api } from "../../lib/ipc";
import type {
  ConnectionInfo,
  DashboardStats,
  ExtractedDoc,
  AuditEntry,
  ModuleId,
} from "../../types";
import type { Notify } from "../../App";

interface Props {
  notify: Notify;
  onNavigate: (id: ModuleId) => void;
}

interface Activity {
  id: string;
  kind: "doc" | "action" | "screen";
  title: string;
  detail: string;
  at: string;
}

export default function Dashboard({ notify, onNavigate }: Props) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, c, docs, audit] = await Promise.all([
          api<DashboardStats>("app_stats"),
          api<ConnectionInfo[]>("connections_list"),
          api<ExtractedDoc[]>("pipeline_list_documents"),
          api<AuditEntry[]>("agents_audit"),
        ]);
        if (!alive) return;
        const feed: Activity[] = [
          ...docs.slice(0, 4).map((d) => ({
            id: `d-${d.id}`,
            kind: "doc" as const,
            title: d.filename,
            detail:
              d.status === "processed"
                ? `Extracted & validated · $${d.amount?.toFixed(2) ?? "—"}`
                : `Pending approval · ${d.issues[0] ?? "review required"}`,
            at: d.createdAt,
          })),
          ...audit.slice(0, 4).map((a) => ({
            id: `a-${a.id}`,
            kind: "action" as const,
            title: `${a.agentName} → ${a.tool}`,
            detail: a.result,
            at: a.createdAt,
          })),
        ].sort((x, y) => y.at.localeCompare(x.at));
        setStats(s);
        setConnections(c);
        setActivity(feed.slice(0, 7));
      } catch (e) {
        notify(`Failed to load dashboard: ${String(e)}`, "error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [notify]);

  if (loading || !stats) {
    return <div className="loading">Loading operational overview…</div>;
  }

  return (
    <div className="stack">
      <div className="stat-grid">
        <StatCard
          label="Documents processed"
          value={String(stats.documentsProcessed)}
          hint="auto-extracted & validated"
          tone="cyan"
        />
        <StatCard
          label="Pending approval"
          value={String(stats.documentsPending)}
          hint="needs human review"
          tone="amber"
        />
        <StatCard
          label="Active agents"
          value={String(stats.agentsActive)}
          hint="copilot & autonomous"
          tone="violet"
        />
        <StatCard
          label="Audited actions"
          value={String(stats.actionsLogged)}
          hint="local audit trail"
          tone="green"
        />
        <StatCard
          label="Custom screens"
          value={String(stats.screensBuilt)}
          hint="built without code"
          tone="blue"
        />
        <StatCard
          label="Connectors"
          value={String(stats.connections)}
          hint="one shared bus"
          tone="blue"
        />
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-head">
            <h2>Live activity</h2>
            <span className="badge badge-muted">shared context</span>
          </div>
          <ul className="feed">
            {activity.map((a) => (
              <li key={a.id}>
                <span
                  className={`feed-dot feed-${a.kind}`}
                  aria-hidden
                />
                <div>
                  <strong>{a.title}</strong>
                  <small>{a.detail}</small>
                </div>
                <time>{new Date(a.at).toLocaleTimeString()}</time>
              </li>
            ))}
            {activity.length === 0 && <li className="empty">No activity yet.</li>}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Universal connector layer</h2>
            <span className="badge badge-ok">encrypted locally</span>
          </div>
          <ul className="conn-list">
            {connections.map((c) => (
              <li key={c.id}>
                <span className={`conn-kind kind-${c.kind}`}>{c.kind}</span>
                <span className="conn-name">{c.name}</span>
                <span
                  className={`badge ${c.status === "connected" ? "badge-ok" : "badge-muted"}`}
                >
                  {c.status}
                </span>
              </li>
            ))}
          </ul>

          <div className="quick-actions">
            <button className="btn" onClick={() => onNavigate("pipeline")}>
              Open Pipeline Engine
            </button>
            <button className="btn btn-ghost" onClick={() => onNavigate("analyst")}>
              Ask a question
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
