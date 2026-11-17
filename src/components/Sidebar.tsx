import type { ModuleId } from "../types";

export const NAV: {
  id: ModuleId;
  code?: string;
  label: string;
  sub: string;
}[] = [
  { id: "dashboard", label: "Dashboard", sub: "Operational overview" },
  { id: "pipeline", code: "A", label: "Pipeline Engine", sub: "Process automation" },
  { id: "agents", code: "B", label: "Agents & Tools", sub: "Supervised execution" },
  { id: "analyst", code: "C", label: "Analyst & What-If", sub: "Plain-English analytics" },
  { id: "builder", code: "D", label: "Interface Builder", sub: "Rapid screens" },
];

interface Props {
  active: ModuleId;
  onChange: (id: ModuleId) => void;
}

export default function Sidebar({ active, onChange }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">N</span>
        <div>
          <strong>NEXUS OS</strong>
          <small>Operational Studio</small>
        </div>
      </div>

      <nav>
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${active === item.id ? "active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            <span className="nav-code">{item.code ?? "◆"}</span>
            <span className="nav-text">
              <strong>{item.label}</strong>
              <small>{item.sub}</small>
            </span>
          </button>
        ))}
      </nav>

      <footer className="sidebar-foot">
        <span className="dot" /> Local-first · data stays on this machine
      </footer>
    </aside>
  );
}
