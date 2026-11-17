// DTOs shared with the frontend. All structs serialize as camelCase to match
// the TypeScript types in src/types.ts exactly.
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub documents_processed: i64,
    pub documents_pending: i64,
    pub agents_active: i64,
    pub actions_logged: i64,
    pub screens_built: i64,
    pub connections: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub status: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedDoc {
    pub id: String,
    pub filename: String,
    pub kind: String,
    pub status: String,
    pub vendor: String,
    pub amount: Option<f64>,
    pub tax_id: Option<String>,
    pub tax: Option<f64>,
    pub issues: Vec<String>,
    pub created_at: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub mode: String,
    pub tools: Vec<String>,
    pub max_autonomous_amount: f64,
    pub created_at: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub tool: String,
    pub args: serde_json::Value,
    pub status: String,
    pub result: String,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartSeries {
    pub name: String,
    pub values: Vec<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableData {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResult {
    pub question: String,
    pub intent: String,
    pub labels: Vec<String>,
    pub series: Vec<ChartSeries>,
    pub table: TableData,
    pub sql: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScreenBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    pub id: String,
    pub title: String,
    pub span: u8,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Screen {
    pub id: String,
    pub name: String,
    pub blocks: Vec<ScreenBlock>,
    #[serde(default)]
    pub created_at: String,
}
