use crate::db::{new_id, now, AppState};
use crate::dto::{Screen, ScreenBlock};
use rusqlite::params;
use tauri::State;

const SCREEN_COLS: &str = "id, name, blocks, created_at";

fn map_screen(row: &rusqlite::Row) -> rusqlite::Result<Screen> {
    let blocks_json: String = row.get(2)?;
    Ok(Screen {
        id: row.get(0)?,
        name: row.get(1)?,
        blocks: serde_json::from_str(&blocks_json).unwrap_or_default(),
        created_at: row.get(3)?,
    })
}

#[tauri::command]
pub fn builder_list_screens(state: State<AppState>) -> Result<Vec<Screen>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {SCREEN_COLS} FROM screens ORDER BY created_at DESC"
        ))
        .map_err(|e| e.to_string())?;
    stmt.query_map([], map_screen)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn builder_save_screen(
    state: State<AppState>,
    name: String,
    blocks: Vec<ScreenBlock>,
) -> Result<Screen, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let blocks_json = serde_json::to_string(&blocks).map_err(|e| e.to_string())?;

    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM screens WHERE name = ?1",
            params![name],
            |r| r.get(0),
        )
        .ok();

    if let Some(id) = existing {
        conn.execute(
            "UPDATE screens SET blocks = ?1 WHERE id = ?2",
            params![blocks_json, id],
        )
        .map_err(|e| e.to_string())?;
        return conn
            .query_row(
                &format!("SELECT {SCREEN_COLS} FROM screens WHERE id = ?1"),
                params![id],
                map_screen,
            )
            .map_err(|e| e.to_string());
    }

    let screen = Screen {
        id: new_id(),
        name,
        blocks,
        created_at: now(),
    };
    conn.execute(
        &format!("INSERT INTO screens ({SCREEN_COLS}) VALUES (?1, ?2, ?3, ?4)"),
        params![screen.id, screen.name, blocks_json, screen.created_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(screen)
}

#[tauri::command]
pub fn builder_delete_screen(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM screens WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Exports a shareable configuration package (JSON) that can be imported on
/// any other machine running NEXUS OS.
#[tauri::command]
pub fn builder_export_screen(state: State<AppState>, id: String) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let screen = conn
        .query_row(
            &format!("SELECT {SCREEN_COLS} FROM screens WHERE id = ?1"),
            params![id],
            map_screen,
        )
        .map_err(|e| format!("Screen not found: {e}"))?;

    let package = serde_json::json!({
        "format": "nexus-os/screen-package",
        "version": 1,
        "exportedAt": now(),
        "screen": screen,
    });
    serde_json::to_string_pretty(&package).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn builder_import_screen(
    state: State<AppState>,
    package_json: String,
) -> Result<Screen, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(&package_json).map_err(|e| format!("Invalid package: {e}"))?;

    let screen_value = parsed.get("screen").cloned().unwrap_or(parsed);

    let source: Screen = serde_json::from_value(screen_value)
        .map_err(|e| format!("Invalid screen definition: {e}"))?;

    let screen = Screen {
        id: new_id(),
        name: source.name,
        blocks: source.blocks,
        created_at: now(),
    };

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let blocks_json = serde_json::to_string(&screen.blocks).map_err(|e| e.to_string())?;
    conn.execute(
        &format!("INSERT INTO screens ({SCREEN_COLS}) VALUES (?1, ?2, ?3, ?4)"),
        params![screen.id, screen.name, blocks_json, screen.created_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(screen)
}
