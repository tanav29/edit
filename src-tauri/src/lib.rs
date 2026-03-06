mod commands;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            list_files,
            read_file_content,
            get_sessions,
            save_session,
            delete_session,
            glob_search,
            tool_read,
            tool_write,
            tool_bash,
            restore_file_edits,
            send_chat_message,
            approve_tool_call,
            stop_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
