// In-browser demo backend. Mirrors the Rust command surface so the full UI
// can be explored with `npm run dev` before the native shell is available.
import type {
  Agent,
  AnalysisResult,
  AuditEntry,
  ConnectionInfo,
  DashboardStats,
  DocumentKind,
  ExtractedDoc,
  Screen,
  ScreenBlock,
} from "../types";
import { delay } from "./ipc";

const now = () => new Date().toISOString();
const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------- seed data

const connections: ConnectionInfo[] = [
  { id: "c1", name: "Production PostgreSQL", kind: "postgres", status: "connected" },
  { id: "c2", name: "Finance Excel / CSV", kind: "excel", status: "connected" },
  { id: "c3", name: "Orders REST API", kind: "rest", status: "connected" },
  { id: "c4", name: "~/Downloads/Invoices", kind: "folder", status: "idle" },
  { id: "c5", name: "Support IMAP inbox", kind: "imap", status: "idle" },
];

let documents: ExtractedDoc[] = [
  {
    id: "d1",
    filename: "invoice-2026-0881.pdf",
    kind: "invoice",
    status: "processed",
    vendor: "Acme Supplies Ltd.",
    amount: 1840.5,
    taxId: "BR-12.345.678/0001-90",
    tax: 368.1,
    issues: [],
    createdAt: "2026-11-16T09:12:00Z",
  },
  {
    id: "d2",
    filename: "invoice-2026-0882.pdf",
    kind: "invoice",
    status: "processed",
    vendor: "Northwind Logistics",
    amount: 942.0,
    taxId: "BR-98.765.432/0001-10",
    tax: 188.4,
    issues: [],
    createdAt: "2026-11-16T09:14:00Z",
  },
  {
    id: "d3",
    filename: "invoice-2026-0883-bad-scan.pdf",
    kind: "invoice",
    status: "pending",
    vendor: "—",
    amount: null,
    taxId: null,
    tax: null,
    issues: ["Unreadable amount field (low-confidence OCR)", "Tax ID missing"],
    createdAt: "2026-11-16T09:15:00Z",
  },
  {
    id: "d4",
    filename: "orders-export.csv",
    kind: "csv",
    status: "pending",
    vendor: "Salesforce export",
    amount: 15230.75,
    taxId: null,
    tax: null,
    issues: [
      "Value discrepancy: CSV total 15,230.75 vs. database total 15,110.25 (diff 120.50)",
    ],
    createdAt: "2026-11-16T09:16:00Z",
  },
];

let agents: Agent[] = [
  {
    id: "a1",
    name: "Order Triage Agent",
    mode: "autonomous",
    tools: ["check_inventory", "generate_shipping_label", "update_customer_record"],
    maxAutonomousAmount: 20,
    createdAt: "2026-11-15T14:00:00Z",
  },
  {
    id: "a2",
    name: "Tier-1 Support Agent",
    mode: "copilot",
    tools: ["lookup_order", "issue_refund", "reset_customer_password"],
    maxAutonomousAmount: 20,
    createdAt: "2026-11-15T14:05:00Z",
  },
];

let audit: AuditEntry[] = [
  {
    id: "au1",
    agentId: "a1",
    agentName: "Order Triage Agent",
    tool: "generate_shipping_label",
    args: { order: "#A-4821", carrier: "express" },
    status: "executed",
    result: "Label created: 1Z999AA10123456784",
    createdAt: "2026-11-16T10:02:00Z",
  },
  {
    id: "au2",
    agentId: "a2",
    agentName: "Tier-1 Support Agent",
    tool: "issue_refund",
    args: { order: "#A-4790", amount: 18.5 },
    status: "suggested",
    result: "Refund of $18.50 suggested — awaiting one-click approval",
    createdAt: "2026-11-16T10:05:00Z",
  },
];

let screens: Screen[] = [
  {
    id: "s1",
    name: "Internal Returns Portal",
    blocks: [
      { id: "b1", type: "metric", title: "Open returns", span: 1 },
      { id: "b2", type: "table", title: "Return requests", span: 2 },
      { id: "b3", type: "form", title: "Register return", span: 1 },
      { id: "b4", type: "action", title: "Trigger triage agent", span: 1 },
    ],
    createdAt: "2026-11-16T11:00:00Z",
  },
];

// --------------------------------------------------------------- commands

const round = (n: number) => Math.round(n * 100) / 100;

export async function app_stats(): Promise<DashboardStats> {
  await delay(120);
  return {
    documentsProcessed: documents.filter((d) => d.status === "processed").length,
    documentsPending: documents.filter((d) => d.status !== "processed").length,
    agentsActive: agents.length,
    actionsLogged: audit.length,
    screensBuilt: screens.length,
    connections: connections.length,
  };
}

export async function connections_list(): Promise<ConnectionInfo[]> {
  await delay(80);
  return [...connections];
}

export async function pipeline_list_documents(): Promise<ExtractedDoc[]> {
  await delay(120);
  return [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function pipeline_ingest(args: {
  filename?: string;
  kind?: DocumentKind;
}): Promise<ExtractedDoc> {
  await delay(350);
  const filename = args.filename || `invoice-2026-${Math.floor(1000 + Math.random() * 8999)}.pdf`;
  const kind: DocumentKind = args.kind || (filename.endsWith(".csv") ? "csv" : "invoice");
  const bad = /bad|error|unreadable|scan/i.test(filename);
  const doc: ExtractedDoc = {
    id: uid(),
    filename,
    kind,
    status: bad ? "pending" : "processed",
    vendor: bad ? "—" : ["Acme Supplies Ltd.", "Northwind Logistics", "Contoso Trading"][
      Math.floor(Math.random() * 3)
    ],
    amount: bad ? null : round(100 + Math.random() * 4000),
    taxId: bad ? null : "BR-12.345.678/0001-90",
    tax: bad ? null : 0,
    issues: bad
      ? ["Unreadable amount field (low-confidence OCR)", "Tax ID missing"]
      : [],
    createdAt: now(),
  };
  if (doc.amount !== null && doc.tax !== null) doc.tax = round(doc.amount * 0.2);
  documents = [doc, ...documents];
  return doc;
}

export async function pipeline_decide(args: {
  id: string;
  approve: boolean;
}): Promise<ExtractedDoc> {
  await delay(200);
  const doc = documents.find((d) => d.id === args.id);
  if (!doc) throw new Error("Document not found");
  doc.status = args.approve ? "processed" : "failed";
  if (args.approve) doc.issues = [];
  return { ...doc };
}

export async function agents_list(): Promise<Agent[]> {
  await delay(100);
  return [...agents];
}

export async function agents_create(args: {
  name: string;
  mode: string;
  tools: string[];
  max_autonomous_amount: number;
}): Promise<Agent> {
  await delay(250);
  const agent: Agent = {
    id: uid(),
    name: args.name,
    mode: args.mode === "autonomous" ? "autonomous" : "copilot",
    tools: args.tools,
    maxAutonomousAmount: args.max_autonomous_amount,
    createdAt: now(),
  };
  agents = [...agents, agent];
  return agent;
}

export async function agents_run(args: {
  agent_id: string;
  task: string;
  amount: number;
}): Promise<AuditEntry> {
  await delay(450);
  const agent = agents.find((a) => a.id === args.agent_id);
  if (!agent) throw new Error("Agent not found");
  const task = args.task.toLowerCase();
  const tool =
    agent.tools.find((t) => task.includes(t.split("_")[0])) ?? agent.tools[0];

  let status: AuditEntry["status"];
  let result: string;
  if (agent.mode === "copilot") {
    status = "suggested";
    result = `Copilot suggestion: ${tool}(${args.task.trim()}) — awaiting approval`;
  } else if (args.amount > agent.maxAutonomousAmount) {
    status = "blocked";
    result = `Blocked by guardrail: $${args.amount.toFixed(2)} exceeds autonomous limit of $${agent.maxAutonomousAmount.toFixed(2)}`;
  } else {
    status = "executed";
    result = `Executed ${tool} autonomously within guardrails (amount $${args.amount.toFixed(2)})`;
  }

  const entry: AuditEntry = {
    id: uid(),
    agentId: agent.id,
    agentName: agent.name,
    tool,
    args: { task: args.task, amount: args.amount },
    status,
    result,
    createdAt: now(),
  };
  audit = [entry, ...audit];
  return entry;
}

export async function agents_approve(args: { audit_id: string }): Promise<AuditEntry> {
  await delay(250);
  const entry = audit.find((a) => a.id === args.audit_id);
  if (!entry) throw new Error("Audit entry not found");
  entry.status = "executed";
  entry.result = `Approved and executed ${entry.tool}`;
  return { ...entry };
}

export async function agents_audit(): Promise<AuditEntry[]> {
  await delay(120);
  return [...audit].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const SAMPLE_QUESTIONS = [
  "Compare net margin by category over the last 6 months",
  "Show monthly revenue for the last 6 months",
  "Which category has the highest cost?",
  "Total revenue by category",
];

export async function analyst_sample_questions(): Promise<string[]> {
  return [...SAMPLE_QUESTIONS];
}

export async function analyst_query(args: { question: string }): Promise<AnalysisResult> {
  await delay(500);
  const q = args.question.toLowerCase();
  const metric = q.includes("margin")
    ? "net_margin"
    : q.includes("cost")
      ? "cost"
      : q.includes("profit")
        ? "profit"
        : "revenue";
  const byCategory = q.includes("category");
  const byMonth = q.includes("month") || q.includes("time") || q.includes("6");

  // Aggregated demo dataset: 6 months x 4 categories.
  const months = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  const categories = ["Electronics", "Apparel", "Home", "Sports"];
  const cell = (m: number, c: number) => {
    const base = [42000, 28000, 19000, 14500][c];
    const trend = 1 + 0.04 * m + ((m * c) % 3) * 0.015;
    const revenue = base * trend;
    const costRatio = [0.62, 0.55, 0.58, 0.6][c] - m * 0.004;
    return { revenue, cost: revenue * costRatio };
  };

  const value = (revenue: number, cost: number): number => {
    switch (metric) {
      case "cost":
        return cost;
      case "profit":
        return revenue - cost;
      case "net_margin":
        return revenue === 0 ? 0 : ((revenue - cost) / revenue) * 100;
      default:
        return revenue;
    }
  };

  const metricLabel =
    metric === "net_margin"
      ? "Net margin (%)"
      : metric === "cost"
        ? "Cost ($)"
        : metric === "profit"
          ? "Profit ($)"
          : "Revenue ($)";

  const labels = byCategory && !byMonth ? categories : months;
  let series: AnalysisResult["series"];
  if (byCategory && byMonth) {
    series = categories.map((cat) => ({
      name: cat,
      values: months.map((_, m) => {
        const c = categories.indexOf(cat);
        const { revenue, cost } = cell(m, c);
        return round(value(revenue, cost));
      }),
    }));
    } else if (byCategory) {
    series = [
      {
        name: metricLabel,
        values: categories.map((_, c) => {
          let revenue = months.reduce((acc, _, m) => acc + cell(m, c).revenue, 0);
          const cost = months.reduce((acc, _, m) => acc + cell(m, c).cost, 0);
          return round(value(revenue, cost));
        }),
      },
    ];
  } else {
    series = [
      {
        name: metricLabel,
        values: months.map((_, m) => {
          let revenue = 0;
          let cost = 0;
          categories.forEach((_, c) => {
            const cellData = cell(m, c);
            revenue += cellData.revenue;
            cost += cellData.cost;
          });
          return round(value(revenue, cost));
        }),
      },
    ];
  }

  const headers = ["Period", ...series.map((s) => s.name)];
  const rows = labels.map((label, i) => [
    label,
    ...series.map((s) => s.values[i]),
  ]);

  const agg =
    metric === "cost"
      ? "SUM(cost)"
      : metric === "profit"
        ? "SUM(revenue - cost)"
        : metric === "net_margin"
          ? "ROUND((SUM(revenue) - SUM(cost)) / SUM(revenue) * 100, 2)"
          : "SUM(revenue)";
  const sql = byCategory && byMonth
    ? `SELECT month, category, ${agg} AS ${metric}\nFROM orders\nWHERE month >= '2026-05'\nGROUP BY month, category\nORDER BY month;`
    : byCategory
      ? `SELECT category, ${agg} AS ${metric}\nFROM orders\nGROUP BY category\nORDER BY ${metric} DESC;`
      : `SELECT month, ${agg} AS ${metric}\nFROM orders\nGROUP BY month\nORDER BY month;`;

  return {
    question: args.question,
    intent: `${metricLabel} · ${byCategory ? "by category" : "total"}${byMonth ? " · monthly trend" : ""}`,
    labels,
    series,
    table: { headers, rows },
    sql,
  };
}

export async function builder_list_screens(): Promise<Screen[]> {
  await delay(100);
  return [...screens];
}

export async function builder_save_screen(args: {
  name: string;
  blocks: ScreenBlock[];
}): Promise<Screen> {
  await delay(250);
  const existing = screens.find((s) => s.name === args.name);
  if (existing) {
    existing.blocks = args.blocks;
    return { ...existing };
  }
  const screen: Screen = {
    id: uid(),
    name: args.name,
    blocks: args.blocks,
    createdAt: now(),
  };
  screens = [...screens, screen];
  return screen;
}

export async function builder_delete_screen(args: { id: string }): Promise<void> {
  await delay(150);
  screens = screens.filter((s) => s.id !== args.id);
}

export async function builder_export_screen(args: { id: string }): Promise<string> {
  await delay(150);
  const screen = screens.find((s) => s.id === args.id);
  if (!screen) throw new Error("Screen not found");
  return JSON.stringify(
    {
      format: "nexus-os/screen-package",
      version: 1,
      exportedAt: now(),
      screen,
    },
    null,
    2,
  );
}

export async function builder_import_screen(args: {
  package_json: string;
}): Promise<Screen> {
  await delay(250);
  const parsed = JSON.parse(args.package_json);
  const source: Screen = parsed.screen ?? parsed;
  const screen: Screen = {
    id: uid(),
    name: source.name,
    blocks: source.blocks,
    createdAt: now(),
  };
  screens = [...screens, screen];
  return screen;
}
