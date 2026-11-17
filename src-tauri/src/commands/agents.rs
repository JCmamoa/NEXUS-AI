use crate::db::{new_id, now, AppState};
use crate::dto::{Agent, AuditEntry};
use rusqlite::params;
use tauri::State;

const AGENT_COLS: &str = "id, name, mode, tools, max_autonomous_amount, created_at";
const AUDIT_COLS: &str = "id, agent_id, agent_name, tool, args, status, result, created_at";

fn map_agent(row: &rusqlite::Row) -> rusqlite::Result<Agent> {
    let tools_json: String = row.get(3)?;
    Ok(Agent {
        id: row.get(0)?,
        name: row.get(1)?,
        mode: row.get(2)?,
        tools: serde_json::from_str(&tools_json).unwrap_or_default(),
        max_autonomous_amount: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn map_audit(row: &rusqlite::Row) -> rusqlite::Result<AuditEntry> {
    let args_json: String = row.get(4)?;
    Ok(AuditEntry {
        id: row.get(0)?,
        agent_id: row.get(1)?,
        agent_name: row.get(2)?,
        tool: row.get(3)?,
        args: serde_json::from_str(&args_json).unwrap_or(serde_json::Value::Null),
        status: row.get(5)?,
        result: row.get(6)?,
        created_at: row.get(7)?,
    })
}

#[tauri::command]
pub fn agents_list(state: State<AppState>) -> Result<Vec<Agent>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {AGENT_COLS} FROM agents ORDER BY created_at"
        ))
        .map_err(|e| e.to_string())?;
    let agents = stmt
        .query_map([], map_agent)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(agents)
}

#[tauri::command]
pub fn agents_create(
    state: State<AppState>,
    name: String,
    mode: String,
    tools: Vec<String>,
    max_autonomous_amount: f64,
) -> Result<Agent, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let agent = Agent {
        id: new_id(),
        name,
        mode,
        tools,
        max_autonomous_amount,
        created_at: now(),
    };
    conn.execute(
        &format!("INSERT INTO agents ({AGENT_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"),
        params![
            agent.id,
            agent.name,
            agent.mode,
            serde_json::to_string(&agent.tools).map_err(|e| e.to_string())?,
            agent.max_autonomous_amount,
            agent.created_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(agent)
}

/// Runs a task through the selected agent under its supervision mode:
/// - copilot     -> suggestion recorded, awaits one-click approval
/// - autonomous  -> executed when inside the guardrail, blocked otherwise
/// Every outcome is appended to the local audit trail.
#[tauri::command]
pub fn agents_run(
    state: State<AppState>,
    agent_id: String,
    task: String,
    amount: f64,
) -> Result<AuditEntry, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let agent: Agent = conn
        .query_row(
            &format!("SELECT {AGENT_COLS} FROM agents WHERE id = ?1"),
            params![agent_id],
            map_agent,
        )
        .map_err(|e| format!("Agent not found: {e}"))?;

    let task_lower = task.to_lowercase();
    let tool = agent
        .tools
        .iter()
        .find(|t| {
            let head = t.split('_').next().unwrap_or("");
            !head.is_empty() && task_lower.contains(head)
        })
        .cloned()
        .or_else(|| agent.tools.first().cloned())
        .unwrap_or_else(|| "unknown_tool".to_string());

    let (status, result) = if agent.mode == "copilot" {
        (
            "suggested",
            format!(
                "Copilot suggestion: {tool}({}) — awaiting approval",
                task.trim()
            ),
        )
    } else if amount > agent.max_autonomous_amount {
        (
            "blocked",
            format!(
                "Blocked by guardrail: ${amount:.2} exceeds autonomous limit of ${:.2}",
                agent.max_autonomous_amount
            ),
        )
    } else {
        (
            "executed",
            format!("Executed {tool} autonomously within guardrails (amount ${amount:.2})"),
        )
    };

    let entry = AuditEntry {
        id: new_id(),
        agent_id: agent.id.clone(),
        agent_name: agent.name.clone(),
        tool,
        args: serde_json::json!({ "task": task, "amount": amount }),
        status: status.to_string(),
        result,
        created_at: now(),
    };

    conn.execute(
        &format!("INSERT INTO audit_log ({AUDIT_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"),
        params![
            entry.id,
            entry.agent_id,
            entry.agent_name,
            entry.tool,
            entry.args.to_string(),
            entry.status,
            entry.result,
            entry.created_at
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(entry)
}

#[tauri::command]
pub fn agents_approve(state: State<AppState>, audit_id: String) -> Result<AuditEntry, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE audit_log
            SET status = 'executed',
                result = 'Approved and executed ' || tool
          WHERE id = ?1 AND status = 'suggested'",
        params![audit_id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {AUDIT_COLS} FROM audit_log WHERE id = ?1"),
        params![audit_id],
        map_audit,
    )
    .map_err(|e| format!("Audit entry not found: {e}"))
}

#[tauri::command]
pub fn agents_audit(state: State<AppState>) -> Result<Vec<AuditEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {AUDIT_COLS} FROM audit_log ORDER BY created_at DESC"
        ))
        .map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map([], map_audit)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(entries)
}
