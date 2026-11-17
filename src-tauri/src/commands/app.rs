use crate::db::AppState;
use crate::dto::{ConnectionInfo, DashboardStats};
use tauri::State;

#[tauri::command]
pub fn app_stats(state: State<AppState>) -> Result<DashboardStats, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let count = |sql: &str| -> Result<i64, String> {
        conn.query_row(sql, [], |r| r.get(0))
            .map_err(|e| e.to_string())
    };

    Ok(DashboardStats {
        documents_processed: count("SELECT COUNT(*) FROM documents WHERE status = 'processed'")?,
        documents_pending: count("SELECT COUNT(*) FROM documents WHERE status != 'processed'")?,
        agents_active: count("SELECT COUNT(*) FROM agents")?,
        actions_logged: count("SELECT COUNT(*) FROM audit_log")?,
        screens_built: count("SELECT COUNT(*) FROM screens")?,
        connections: 5,
    })
}

#[tauri::command]
pub fn connections_list() -> Result<Vec<ConnectionInfo>, String> {
    Ok(vec![
        ConnectionInfo {
            id: "c1".into(),
            name: "Production PostgreSQL".into(),
            kind: "postgres".into(),
            status: "connected".into(),
        },
        ConnectionInfo {
            id: "c2".into(),
            name: "Finance Excel / CSV".into(),
            kind: "excel".into(),
            status: "connected".into(),
        },
        ConnectionInfo {
            id: "c3".into(),
            name: "Orders REST API".into(),
            kind: "rest".into(),
            status: "connected".into(),
        },
        ConnectionInfo {
            id: "c4".into(),
            name: "~/Downloads/Invoices".into(),
            kind: "folder".into(),
            status: "idle".into(),
        },
        ConnectionInfo {
            id: "c5".into(),
            name: "Support IMAP inbox".into(),
            kind: "imap".into(),
            status: "idle".into(),
        },
    ])
}
