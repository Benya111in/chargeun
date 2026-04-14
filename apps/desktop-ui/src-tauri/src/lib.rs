use serde::{Deserialize, Serialize};
use std::{
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapState {
    platform: &'static str,
    capture_path: &'static str,
    shadow_delay_ms: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCaptureSource {
    id: String,
    display_name: String,
    source_type: &'static str,
    width: u32,
    height: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCaptureSession {
    session_id: String,
    source_id: String,
    source_type: &'static str,
    display_name: String,
    has_audio: bool,
    platform: &'static str,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StopNativeCaptureResult {
    stopped: bool,
}

#[derive(Default)]
struct CaptureCommandState {
    active_session: Mutex<Option<NativeCaptureSession>>,
    next_session: Mutex<u64>,
}

#[tauri::command]
fn get_bootstrap_state() -> BootstrapState {
    BootstrapState {
        platform: "mac-priority",
        capture_path: "screen-capture-kit-command-ready",
        shadow_delay_ms: 4000,
    }
}

#[tauri::command]
fn list_native_capture_sources() -> Vec<NativeCaptureSource> {
    vec![
        NativeCaptureSource {
            id: "display-primary".into(),
            display_name: "현재 모니터".into(),
            source_type: "monitor",
            width: 1920,
            height: 1080,
        },
        NativeCaptureSource {
            id: "window-frontmost".into(),
            display_name: "전면 앱 창".into(),
            source_type: "window",
            width: 1440,
            height: 900,
        },
    ]
}

#[tauri::command]
fn start_native_capture(
    state: tauri::State<'_, CaptureCommandState>,
    input: StartNativeCaptureInput,
) -> Result<NativeCaptureSession, String> {
    let source = list_native_capture_sources()
        .into_iter()
        .find(|candidate| candidate.id == input.source_id)
        .ok_or_else(|| format!("Unknown native capture source: {}", input.source_id))?;

    let mut active_session = state
        .active_session
        .lock()
        .map_err(|_| "Capture state lock poisoned".to_string())?;

    if active_session.is_some() {
        return Err("A native capture session is already running".into());
    }

    let mut next_session = state
        .next_session
        .lock()
        .map_err(|_| "Session counter lock poisoned".to_string())?;

    *next_session += 1;
    let session_index = *next_session;

    let session = NativeCaptureSession {
        session_id: format!("native-session-{}", session_index),
        source_id: source.id.clone(),
        source_type: source.source_type,
        display_name: source.display_name.clone(),
        has_audio: input.include_audio,
        platform: "mac",
        started_at: epoch_ms(),
        output_width: source.width.min(1920),
        output_height: source.height.min(1080),
    };

    *active_session = Some(session.clone());
    Ok(session)
}

#[tauri::command]
fn stop_native_capture(
    state: tauri::State<'_, CaptureCommandState>,
    input: StopNativeCaptureInput,
) -> Result<StopNativeCaptureResult, String> {
    let mut active_session = state
        .active_session
        .lock()
        .map_err(|_| "Capture state lock poisoned".to_string())?;

    let stopped = active_session
        .as_ref()
        .map(|session| session.session_id == input.session_id)
        .unwrap_or(false);

    if stopped {
        *active_session = None;
    }

    Ok(StopNativeCaptureResult { stopped })
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CaptureCommandState::default())
        .invoke_handler(tauri::generate_handler![
            get_bootstrap_state,
            list_native_capture_sources,
            start_native_capture,
            stop_native_capture
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
