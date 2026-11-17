// SQLite persistence layer: schema creation, demo seeding and shared state.
// The database file lives in the app data directory (encrypted at rest by the
// OS user profile; credential encryption is a roadmap item).
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

pub struct AppState {
    pub db: Mutex<Connection>,
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn open(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let _ = conn.busy_timeout(Duration::from_secs(5));
    init_schema(&mut conn)?;
    Ok(conn)
}

fn init_schema(conn: &mut Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS documents (
            id         TEXT PRIMARY KEY,
            filename   TEXT NOT NULL,
            kind       TEXT NOT NULL,
            status     TEXT NOT NULL,
            vendor     TEXT NOT NULL DEFAULT '',
            amount     REAL,
            tax_id     TEXT,
            tax        REAL,
            issues     TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agents (
            id                     TEXT PRIMARY KEY,
            name                   TEXT NOT NULL,
            mode                   TEXT NOT NULL,
            tools                  TEXT NOT NULL,
            max_autonomous_amount  REAL NOT NULL DEFAULT 20,
            created_at             TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id         TEXT PRIMARY KEY,
            agent_id   TEXT NOT NULL,
            agent_name TEXT NOT NULL,
            tool       TEXT NOT NULL,
            args       TEXT NOT NULL,
            status     TEXT NOT NULL,
            result     TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS screens (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            blocks     TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS orders (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            month    TEXT NOT NULL,
            category TEXT NOT NULL,
            revenue  REAL NOT NULL,
            cost     REAL NOT NULL
        );
        "#,
    )
    .map_err(|e| e.to_string())?;

    seed(conn)?;
    Ok(())
}

/// Deterministic demo dataset: 6 months x 4 categories, plus a realistic
/// starting state for the other modules so the app is alive on first launch.
fn seed(conn: &mut Connection) -> Result<(), String> {
    let order_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM orders", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if order_count == 0 {
        let months = [
            "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
        ];
        let categories = ["Electronics", "Apparel", "Home", "Sports"];
        let base = [42_000.0, 28_000.0, 19_000.0, 14_500.0];
        let cost_ratio0 = [0.62, 0.55, 0.58, 0.60];
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for (m, month) in months.iter().enumerate() {
            for (c, category) in categories.iter().enumerate() {
                let trend = 1.0 + 0.04 * m as f64 + (((m * c) % 3) as f64) * 0.015;
                let revenue = base[c] * trend;
                let cost_ratio = cost_ratio0[c] - m as f64 * 0.004;
                tx.execute(
                    "INSERT INTO orders (month, category, revenue, cost) VALUES (?1, ?2, ?3, ?4)",
                    params![month, category, revenue, revenue * cost_ratio],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    let doc_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if doc_count == 0 {
        let seed_docs: Vec<(&str, &str, &str, &str, Option<f64>, &str, Option<f64>, &str)> = vec![
            (
                "invoice-2026-0881.pdf",
                "invoice",
                "processed",
                "Acme Supplies Ltd.",
                Some(1840.5),
                "BR-12.345.678/0001-90",
                Some(368.1),
                "[]",
            ),
            (
                "invoice-2026-0882.pdf",
                "invoice",
                "processed",
                "Northwind Logistics",
                Some(942.0),
                "BR-98.765.432/0001-10",
                Some(188.4),
                "[]",
            ),
            (
                "invoice-2026-0883-bad-scan.pdf",
                "invoice",
                "pending",
                "—",
                None,
                "—",
                None,
                r#"["Unreadable amount field (low-confidence OCR)", "Tax ID missing"]"#,
            ),
            (
                "orders-export.csv",
                "csv",
                "pending",
                "Salesforce export",
                Some(15230.75),
                "",
                None,
                r#"["Value discrepancy: CSV total 15,230.75 vs. database total 15,110.25 (diff 120.50)"]"#,
            ),
        ];
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for (i, d) in seed_docs.iter().enumerate() {
            let created = chrono::Utc::now()
                .checked_sub_signed(chrono::Duration::minutes((4 - i) as i64))
                .unwrap_or_else(chrono::Utc::now)
                .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
            tx.execute(
                "INSERT INTO documents (id, filename, kind, status, vendor, amount, tax_id, tax, issues, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULLIF(?7, ''), ?8, ?9, ?10)",
                params![new_id(), d.0, d.1, d.2, d.3, d.4, d.5, d.6, d.7, created],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    let agent_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM agents", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if agent_count == 0 {
        let agents: Vec<(&str, &str, &str, &str)> = vec![
            (
                "Order Triage Agent",
                "autonomous",
                r#"["check_inventory", "generate_shipping_label", "update_customer_record"]"#,
                "2026-11-15T14:00:00Z",
            ),
            (
                "Tier-1 Support Agent",
                "copilot",
                r#"["lookup_order", "issue_refund", "reset_customer_password"]"#,
                "2026-11-15T14:05:00Z",
            ),
        ];
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for a in agents {
            tx.execute(
                "INSERT INTO agents (id, name, mode, tools, max_autonomous_amount, created_at)
                 VALUES (?1, ?2, ?3, ?4, 20, ?5)",
                params![new_id(), a.0, a.1, a.2, a.3],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    let audit_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM audit_log", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if audit_count == 0 {
        let (agent_id, agent_name): (String, String) = conn
            .query_row(
                "SELECT id, name FROM agents ORDER BY created_at LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO audit_log (id, agent_id, agent_name, tool, args, status, result, created_at)
             VALUES (?1, ?2, ?3, 'generate_shipping_label', ?4, 'executed', ?5, ?6)",
            params![
                new_id(),
                agent_id,
                agent_name,
                r#"{"order":"#A-4821","carrier":"express"}"#,
                "Label created: 1Z999AA10123456784",
                now()
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    let screen_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM screens", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if screen_count == 0 {
        conn.execute(
            "INSERT INTO screens (id, name, blocks, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![
                new_id(),
                "Internal Returns Portal",
                r#"[
                    {"id":"b1","type":"metric","title":"Open returns","span":1},
                    {"id":"b2","type":"table","title":"Return requests","span":2},
                    {"id":"b3","type":"form","title":"Register return","span":1},
                    {"id":"b4","type":"action","title":"Trigger triage agent","span":1}
                ]"#,
                now()
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
