import { useState } from "react";
import Sidebar, { NAV } from "./components/Sidebar";
import Dashboard from "./modules/dashboard/Dashboard";
import PipelineModule from "./modules/pipeline/PipelineModule";
import AgentsModule from "./modules/agents/AgentsModule";
import AnalystModule from "./modules/analyst/AnalystModule";
import BuilderModule from "./modules/builder/BuilderModule";
import { isNative } from "./lib/ipc";
import type { ModuleId } from "./types";

export type ToastKind = "info" | "success" | "error";
export type Notify = (message: string, kind?: ToastKind) => void;

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

let toastSeq = 0;

export default function App() {
  const [module, setModule] = useState<ModuleId>("dashboard");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify: Notify = (message, kind = "info") => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };

  const current = NAV.find((n) => n.id === module)!;

  return (
    <div className="app">
      <Sidebar active={module} onChange={setModule} />

      <main className="content">
        <header className="content-head">
          <div>
            <h1>{current.label}</h1>
            <p>{current.sub}</p>
          </div>
          <div className="head-badges">
            <span className="badge badge-muted">
              {isNative() ? "Desktop · Rust + SQLite" : "Browser demo · mock backend"}
            </span>
            <span className="badge badge-ok">Zero context fragmentation</span>
          </div>
        </header>

        <section className="module" key={module}>
          {module === "dashboard" && (
            <Dashboard notify={notify} onNavigate={setModule} />
          )}
          {module === "pipeline" && <PipelineModule notify={notify} />}
          {module === "agents" && <AgentsModule notify={notify} />}
          {module === "analyst" && <AnalystModule />}
          {module === "builder" && <BuilderModule notify={notify} />}
        </section>
      </main>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
