// Shared domain types for NEXUS OS.
// These mirror the DTOs returned by the Rust/Tauri backend commands.

export type ModuleId =
  | "dashboard"
  | "pipeline"
  | "agents"
  | "analyst"
  | "builder";

export interface DashboardStats {
  documentsProcessed: number;
  documentsPending: number;
  agentsActive: number;
  actionsLogged: number;
  screensBuilt: number;
  connections: number;
}

export interface ConnectionInfo {
  id: string;
  name: string;
  kind: "postgres" | "mysql" | "sqlite" | "excel" | "rest" | "folder" | "imap";
  status: "connected" | "idle";
}

export type DocumentStatus = "processed" | "pending" | "failed";
export type DocumentKind = "invoice" | "receipt" | "csv";

export interface ExtractedDoc {
  id: string;
  filename: string;
  kind: DocumentKind;
  status: DocumentStatus;
  vendor: string;
  amount: number | null;
  taxId: string | null;
  tax: number | null;
  issues: string[];
  createdAt: string;
}

export type AgentMode = "copilot" | "autonomous";

export interface Agent {
  id: string;
  name: string;
  mode: AgentMode;
  tools: string[];
  maxAutonomousAmount: number;
  createdAt: string;
}

export type AuditStatus = "suggested" | "executed" | "blocked";

export interface AuditEntry {
  id: string;
  agentId: string;
  agentName: string;
  tool: string;
  args: Record<string, unknown>;
  status: AuditStatus;
  result: string;
  createdAt: string;
}

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface AnalysisResult {
  question: string;
  intent: string;
  labels: string[];
  series: ChartSeries[];
  table: { headers: string[]; rows: (string | number)[][] };
  sql: string;
}

export interface WhatIfInputs {
  avgPrice: number;
  conversionRate: number; // %
  traffic: number; // monthly visitors
  shippingCost: number;
  adSpend: number;
}

export interface WhatIfProjection {
  month: number;
  revenue: number;
  grossProfit: number;
  netProfit: number;
  cashFlow: number;
}

export type BlockType = "form" | "table" | "action" | "metric";

export interface ScreenBlock {
  id: string;
  type: BlockType;
  title: string;
  span: 1 | 2 | 3;
}

export interface Screen {
  id: string;
  name: string;
  blocks: ScreenBlock[];
  createdAt: string;
}
