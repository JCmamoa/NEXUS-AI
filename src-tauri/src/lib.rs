mod commands;
mod db;
mod dto;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let conn = db::open(&dir.join("nexus.db"))?;
            app.manage(db::AppState {
                db: std::sync::Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_stats,
            commands::app::connections_list,
            commands::pipeline::pipeline_list_documents,
            commands::pipeline::pipeline_ingest,
            commands::pipeline::pipeline_decide,
            commands::agents::agents_list,
            commands::agents::agents_create,
            commands::agents::agents_run,
            commands::agents::agents_approve,
            commands::agents::agents_audit,
            commands::analyst::analyst_query,
            commands::analyst::analyst_sample_questions,
            commands::builder::builder_list_screens,
            commands::builder::builder_save_screen,
            commands::builder::builder_delete_screen,
            commands::builder::builder_export_screen,
            commands::builder::builder_import_screen,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NEXUS OS");
}
