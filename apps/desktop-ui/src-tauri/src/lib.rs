use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapState {
    platform: String,
    capture_path: String,
    shadow_delay_ms: u64,
    permission_state: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCaptureSource {
    id: String,
    display_name: String,
    source_type: String,
    width: u32,
    height: u32,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCaptureSession {
    session_id: String,
    source_id: String,
    source_type: String,
    display_name: String,
    has_audio: bool,
    platform: String,
    started_at: u64,
    output_width: u32,
    output_height: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartNativeCaptureInput {
    source_id: String,
    include_audio: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StopNativeCaptureInput {
    session_id: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StopNativeCaptureResult {
    stopped: bool,
}

#[tauri::command]
fn get_bootstrap_state() -> BootstrapState {
    run_mac_capture_bridge_json::<BootstrapState>(&["bootstrap"]).unwrap_or(BootstrapState {
        platform: "mac-priority".into(),
        capture_path: "screen-capture-kit-pending".into(),
        shadow_delay_ms: 4000,
        permission_state: "unknown".into(),
    })
}

#[tauri::command]
fn list_native_capture_sources() -> Result<Vec<NativeCaptureSource>, String> {
    run_mac_capture_bridge_json(&["list-sources"])
}

#[tauri::command]
fn start_native_capture(
    input: StartNativeCaptureInput,
) -> Result<NativeCaptureSession, String> {
    run_mac_capture_bridge_json(&[
        "start",
        "--source-id",
        &input.source_id,
        "--include-audio",
        if input.include_audio { "true" } else { "false" },
    ])
}

#[tauri::command]
fn stop_native_capture(
    input: StopNativeCaptureInput,
) -> Result<StopNativeCaptureResult, String> {
    run_mac_capture_bridge_json(&["stop", "--session-id", &input.session_id])
}

fn run_mac_capture_bridge_json<T: DeserializeOwned>(args: &[&str]) -> Result<T, String> {
    let output = run_mac_capture_bridge(args)?;
    serde_json::from_slice::<T>(&output).map_err(|error| error.to_string())
}

fn run_mac_capture_bridge(args: &[&str]) -> Result<Vec<u8>, String> {
    let package_dir = mac_capture_package_dir();
    let output = if let Some(binary) = mac_capture_bridge_binary(&package_dir) {
        Command::new(binary)
            .args(args)
            .current_dir(&package_dir)
            .output()
            .map_err(|error| error.to_string())?
    } else {
        Command::new("swift")
            .args(["run", "MacCaptureBridge", "--"])
            .args(args)
            .current_dir(&package_dir)
            .output()
            .map_err(|error| error.to_string())?
    };

    if output.status.success() {
        Ok(output.stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

fn mac_capture_package_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../native/mac-capture")
        .to_path_buf()
}

fn mac_capture_bridge_binary(package_dir: &Path) -> Option<PathBuf> {
    [
        package_dir.join(".build/arm64-apple-macosx/debug/MacCaptureBridge"),
        package_dir.join(".build/x86_64-apple-macosx/debug/MacCaptureBridge"),
        package_dir.join(".build/debug/MacCaptureBridge"),
    ]
    .into_iter()
    .find(|candidate| candidate.exists())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_bootstrap_state,
            list_native_capture_sources,
            start_native_capture,
            stop_native_capture
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
