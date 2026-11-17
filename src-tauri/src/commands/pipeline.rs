use crate::db::{new_id, now, AppState};
use crate::dto::ExtractedDoc;
use rusqlite::params;
use tauri::State;

fn map_doc(row: &rusqlite::Row) -> rusqlite::Result<ExtractedDoc> {
    let issues_json: String = row.get(8)?;
    Ok(ExtractedDoc {
        id: row.get(0)?,
        filename: row.get(1)?,
        kind: row.get(2)?,
        status: row.get(3)?,
        vendor: row.get(4)?,
        amount: row.get(5)?,
        tax_id: row.get(6)?,
        tax: row.get(7)?,
        issues: serde_json::from_str(&issues_json).unwrap_or_default(),
        created_at: row.get(9)?,
    })
}

const DOC_COLS: &str =
    "id, filename, kind, status, vendor, amount, tax_id, tax, issues, created_at";

#[tauri::command]
pub fn pipeline_list_documents(state: State<AppState>) -> Result<Vec<ExtractedDoc>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {DOC_COLS} FROM documents ORDER BY created_at DESC"
        ))
        .map_err(|e| e.to_string())?;
    let docs = stmt
        .query_map([], map_doc)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(docs)
}

/// Simulates the folder daemon: extracts structured data from a "new file",
/// validates business rules and either commits it or routes it to the
/// Pending Approval queue.
#[tauri::command]
pub fn pipeline_ingest(
    state: State<AppState>,
    filename: String,
    kind: String,
) -> Result<ExtractedDoc, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lower = filename.to_lowercase();
    let unreadable = ["bad", "error", "unreadable", "scan"]
        .iter()
        .any(|k| lower.contains(k));

    let (status, vendor, amount, tax_id, tax, issues): (
        &str,
        &str,
        Option<f64>,
        Option<&str>,
        Option<f64>,
        Vec<&str>,
    ) = if unreadable {
        (
            "pending",
            "—",
            None,
            None,
            None,
            vec![
                "Unreadable amount field (low-confidence OCR)",
                "Tax ID missing",
            ],
        )
    } else {
        let amount = 100.0 + (uuid::Uuid::new_v4().as_u128() % 4000) as f64;
        (
            "processed",
            "Acme Supplies Ltd.",
            Some(amount),
            Some("BR-12.345.678/0001-90"),
            Some((amount * 0.2 * 100.0).round() / 100.0),
            vec![],
        )
    };

    let doc = ExtractedDoc {
        id: new_id(),
        filename,
        kind,
        status: status.to_string(),
        vendor: vendor.to_string(),
        amount,
        tax_id: tax_id.map(|s| s.to_string()),
        tax,
        issues: issues.into_iter().map(String::from).collect(),
        created_at: now(),
    };

    conn.execute(
        &format!(
            "INSERT INTO documents ({DOC_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
        ),
        params![
            doc.id,
            doc.filename,
            doc.kind,
            doc.status,
            doc.vendor,
            doc.amount,
            doc.tax_id,
            doc.tax,
            serde_json::to_string(&doc.issues).unwrap_or_else(|_| "[]".into()),
            doc.created_at
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(doc)
}

#[tauri::command]
pub fn pipeline_decide(
    state: State<AppState>,
    id: String,
    approve: bool,
) -> Result<ExtractedDoc, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if approve {
        conn.execute(
            "UPDATE documents SET status = 'processed', issues = '[]' WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE documents SET status = 'failed' WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.query_row(
        &format!("SELECT {DOC_COLS} FROM documents WHERE id = ?1"),
        params![id],
        map_doc,
    )
    .map_err(|e| format!("Document not found: {e}"))
}
