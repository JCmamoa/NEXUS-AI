import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/ipc";
import type { Agent, AgentMode, AuditEntry } from "../../types";
import type { Notify } from "../../App";

interface Props {
  notify: Notify;
}

const TOOL_POOL = [
  "check_inventory",
  "generate_shipping_label",
  "update_customer_record",
  "lookup_order",
  "issue_refund",
  "reset_customer_password",
  "create_ticket",
  "send_tracking_email",
];

const STATUS_BADGE: Record<AuditEntry["status"], string> = {
  suggested: "warn",
  executed: "ok",
  blocked: "err",
};

export default function AgentsModule({ notify }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<AgentMode>("copilot");
  const [tools, setTools] = useState<string[]>(["lookup_order"]);
  const [guardrail, setGuardrail] = useState(20);

  // run form
  const [agentId, setAgentId] = useState("");
  const [task, setTask] = useState("Issue refund for order #A-4901");
  const [amount, setAmount] = useState(15);
  const [running, setRunning] = useState(false);
  const [lastEntry, setLastEntry] = useState<AuditEntry | null>(null);

  const reload = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        api<Agent[]>("agents_list"),
        api<AuditEntry[]>("agents_audit"),
      ]);
      setAgents(a);
      setAudit(b);
      setAgentId((prev) => prev || a[0]?.id || "");
    } catch (e) {
      notify(`Failed to load agents: ${String(e)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createAgent = async () => {
    if (!name.trim()) return notify("Agent name is required", "error");
    if (tools.length === 0) return notify("Select at least one tool", "error");
    try {
      await api("agents_create", {
        name: name.trim(),
        mode,
        tools,
        max_autonomous_amount: guardrail,
      });
      notify(`Agent "${name.trim()}" created`, "success");
      setName("");
      setTools(["lookup_order"]);
      setShowCreate(false);
      await reload();
    } catch (e) {
      notify(`Create failed: ${String(e)}`, "error");
    }
  };

  const runTask = async () => {
    if (!agentId) return notify("Create or select an agent first", "error");
    if (!task.trim()) return notify("Describe the task first", "error");
    setRunning(true);
    try {
      const entry = await api<AuditEntry>("agents_run", {
        agent_id: agentId,
        task: task.trim(),
        amount,
      });
      setLastEntry(entry);
      notify(
        entry.status === "executed"
          ? "Executed within guardrails"
          : entry.status === "blocked"
            ? "Blocked by guardrail"
            : "Suggestion created — awaiting your approval",
        entry.status === "executed"
          ? "success"
          : entry.status === "blocked"
            ? "error"
            : "info",
      );
      await reload();
    } catch (e) {
      notify(`Run failed: ${String(e)}`, "error");
    } finally {
      setRunning(false);
    }
  };

  const approve = async (entry: AuditEntry) => {
    try {
      const updated = await api<AuditEntry>("agents_approve", { audit_id: entry.id });
      notify(`Approved: ${updated.result}`, "success");
      if (lastEntry?.id === updated.id) setLastEntry(updated);
      await reload();
    } catch (e) {
      notify(`Approval failed: ${String(e)}`, "error");
    }
  };

  const toggleTool = (tool: string) =>
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );

  return (
    <div className="stack">
      <div className="two-col">
        <div className="panel">
          <div className="panel-head">
            <h2>Agents</h2>
            <button className="btn btn-sm" onClick={() => setShowCreate((s) => !s)}>
              {showCreate ? "Cancel" : "+ New agent"}
            </button>
          </div>

          {loading ? (
            <div className="loading">Loading agents…</div>
          ) : (
            <div className="agent-list">
              {agents.map((a) => (
                <div key={a.id} className="agent-card">
                  <div className="agent-top">
                    <strong>{a.name}</strong>
                    <span
                      className={`badge ${a.mode === "autonomous" ? "badge-violet" : "badge-ok"}`}
                    >
                      {a.mode === "autonomous" ? "Autonomous" : "Copilot"}
                    </span>
                  </div>
                  <div className="chips">
                    {a.tools.map((t) => (
                      <code key={t} className="chip">
                        {t}
                      </code>
                    ))}
                  </div>
                  <small className="muted">
                    Guardrail: refunds/actions up to ${a.maxAutonomousAmount.toFixed(2)}
                  </small>
                </div>
              ))}
              {agents.length === 0 && <p className="empty">No agents yet.</p>}
            </div>
          )}

          {showCreate && (
            <div className="form-block">
              <label>
                Name
                <input
                  className="input"
                  value={name}
                  placeholder="e.g. Returns Triage Agent"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Supervision mode
                <select
                  className="input"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as AgentMode)}
                >
                  <option value="copilot">
                    Copilot — suggests actions for one-click approval
                  </option>
                  <option value="autonomous">
                    Autonomous — executes within safe guardrails
                  </option>
                </select>
              </label>
              <label>
                Autonomous guardrail (max amount, USD)
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={guardrail}
                  onChange={(e) => setGuardrail(Number(e.target.value))}
                />
              </label>
              <span className="label-like">Internal tools</span>
              <div className="chips">
                {TOOL_POOL.map((t) => (
                  <button
                    key={t}
                    className={`chip chip-toggle ${tools.includes(t) ? "on" : ""}`}
                    onClick={() => toggleTool(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button className="btn" onClick={() => void createAgent()}>
                Create agent
              </button>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Run a task</h2>
            <span className="badge badge-muted">supervised execution</span>
          </div>
          <div className="form-block">
            <label>
              Agent
              <select
                className="input"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.mode})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Task
              <input
                className="input"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Describe the operational task"
              />
            </label>
            <label>
              Amount involved (USD)
              <input
                className="input"
                type="number"
                min={0}
                step={0.5}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
            <button
              className="btn"
              disabled={running}
              onClick={() => void runTask()}
            >
              {running ? "Executing…" : "Run task"}
            </button>
          </div>

          {lastEntry && (
            <div
              className={`result-banner status-${lastEntry.status}`}
            >
              <div>
                <span
                  className={`badge badge-${STATUS_BADGE[lastEntry.status]}`}
                >
                  {lastEntry.status}
                </span>
                <strong>{lastEntry.tool}</strong>
              </div>
              <p>{lastEntry.result}</p>
              {lastEntry.status === "suggested" && (
                <button className="btn btn-sm" onClick={() => void approve(lastEntry)}>
                  Approve & execute
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Local audit trail</h2>
          <span className="badge badge-muted">append-only</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Tool</th>
              <th>Arguments</th>
              <th>Status</th>
              <th>Result</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}>
                <td>{a.agentName}</td>
                <td>
                  <code>{a.tool}</code>
                </td>
                <td className="mono-small">
                  {JSON.stringify(a.args)}
                </td>
                <td>
                  <span className={`badge badge-${STATUS_BADGE[a.status]}`}>
                    {a.status}
                  </span>
                </td>
                <td>{a.result}</td>
                <td className="row-right">
                  {a.status === "suggested" && (
                    <button className="btn btn-sm" onClick={() => void approve(a)}>
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {audit.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No actions logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
