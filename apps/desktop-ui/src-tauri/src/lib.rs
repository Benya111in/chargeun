use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapState {
    platform: &'static str,
    capture_path: &'static str,
    shadow_delay_ms: u64,
}

#[tauri::command]
fn get_bootstrap_state() -> BootstrapState {
    BootstrapState {
        platform: "mac-priority",
        capture_path: "screen-capture-kit-pending",
        shadow_delay_ms: 4000,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_bootstrap_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
