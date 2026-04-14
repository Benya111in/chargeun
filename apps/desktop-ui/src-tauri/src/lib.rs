use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, ChildStderr, ChildStdout, Command, Stdio},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, State};

const CAPTURE_EVENT_SESSION_STARTED: &str = "capture/session-started";
const CAPTURE_EVENT_FRAME: &str = "capture/frame";
const CAPTURE_EVENT_AUDIO: &str = "capture/audio";
const CAPTURE_EVENT_SESSION_STOPPED: &str = "capture/session-stopped";
const CAPTURE_EVENT_SYSTEM_ERROR: &str = "error/system";

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

#[derive(Default)]
struct CaptureBridgeState {
    sessions: Mutex<HashMap<String, ManagedCaptureProcess>>,
}

struct ManagedCaptureProcess {
    child: Child,
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
    app: AppHandle,
    state: State<CaptureBridgeState>,
    input: StartNativeCaptureInput,
) -> Result<NativeCaptureSession, String> {
    let sources = list_native_capture_sources()?;
    let source = sources
        .iter()
        .find(|candidate| candidate.id == input.source_id)
        .cloned()
        .ok_or_else(|| format!("Native capture source {} was not found", input.source_id))?;

    let session_id = build_session_id();
    let mut child = spawn_mac_capture_bridge_stream(&session_id, &input)?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "MacCaptureBridge stdout was not available".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "MacCaptureBridge stderr was not available".to_string())?;

    let mut reader = BufReader::new(stdout);
    let started_event = read_stream_event(&mut reader)?
        .ok_or_else(|| "MacCaptureBridge exited before session-started".to_string())?;

    let session = match native_session_from_start_event(&session_id, &source, &started_event) {
        Ok(session) => session,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };

    if let Err(error) = emit_capture_event(&app, started_event.clone()) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    spawn_stdout_forwarder(app.clone(), session_id.clone(), reader);
    spawn_stderr_forwarder(app.clone(), session_id.clone(), stderr);

    state
        .sessions
        .lock()
        .map_err(|_| "Native capture session state is poisoned".to_string())?
        .insert(session_id, ManagedCaptureProcess { child });

    Ok(session)
}

#[tauri::command]
fn stop_native_capture(
    app: AppHandle,
    state: State<CaptureBridgeState>,
    input: StopNativeCaptureInput,
) -> Result<StopNativeCaptureResult, String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Native capture session state is poisoned".to_string())?;

    if let Some(mut process) = sessions.remove(&input.session_id) {
        let _ = process.child.kill();
        let _ = process.child.wait();
        let _ = app.emit(
            CAPTURE_EVENT_SESSION_STOPPED,
            json!({
                "type": "session-stopped",
                "sessionId": input.session_id,
            }),
        );
        let _ = run_mac_capture_bridge_json::<StopNativeCaptureResult>(&[
            "stop",
            "--session-id",
            &input.session_id,
        ]);

        Ok(StopNativeCaptureResult { stopped: true })
    } else {
        let stopped = run_mac_capture_bridge_json::<StopNativeCaptureResult>(&[
            "stop",
            "--session-id",
            &input.session_id,
        ])
        .unwrap_or(StopNativeCaptureResult { stopped: false });

        Ok(stopped)
    }
}

fn read_stream_event(reader: &mut BufReader<ChildStdout>) -> Result<Option<Value>, String> {
    let mut line = String::new();

    loop {
        line.clear();
        let bytes_read = reader
            .read_line(&mut line)
            .map_err(|error| error.to_string())?;

        if bytes_read == 0 {
            return Ok(None);
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        return serde_json::from_str::<Value>(trimmed)
            .map(Some)
            .map_err(|error| error.to_string());
    }
}

fn native_session_from_start_event(
    session_id: &str,
    source: &NativeCaptureSource,
    event: &Value,
) -> Result<NativeCaptureSession, String> {
    let event_type = event
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| "MacCaptureBridge event payload did not contain a type".to_string())?;

    if event_type != "session-started" {
        return Err(format!(
            "Expected session-started event from MacCaptureBridge, received {event_type}"
        ));
    }

    Ok(NativeCaptureSession {
        session_id: session_id.to_string(),
        source_id: source.id.clone(),
        source_type: source.source_type.clone(),
        display_name: source.display_name.clone(),
        has_audio: event
            .get("hasAudio")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        platform: "mac".into(),
        started_at: current_timestamp_ms(),
        output_width: event
            .get("width")
            .and_then(Value::as_u64)
            .unwrap_or(source.width as u64) as u32,
        output_height: event
            .get("height")
            .and_then(Value::as_u64)
            .unwrap_or(source.height as u64) as u32,
    })
}

fn spawn_stdout_forwarder(app: AppHandle, session_id: String, mut reader: BufReader<ChildStdout>) {
    std::thread::spawn(move || loop {
        match read_stream_event(&mut reader) {
            Ok(Some(event)) => {
                let _ = emit_capture_event(&app, event);
            }
            Ok(None) => break,
            Err(error) => {
                let _ = emit_system_error(
                    &app,
                    json!({
                        "type": "error",
                        "sessionId": session_id,
                        "code": "native-preview-parse-error",
                        "message": error,
                    }),
                );
                break;
            }
        }
    });
}

fn spawn_stderr_forwarder(app: AppHandle, session_id: String, stderr: ChildStderr) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();

        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    let _ = emit_system_error(
                        &app,
                        json!({
                            "type": "error",
                            "sessionId": session_id,
                            "code": "native-preview-stderr",
                            "message": trimmed,
                        }),
                    );
                }
                Err(error) => {
                    let _ = emit_system_error(
                        &app,
                        json!({
                            "type": "error",
                            "sessionId": session_id,
                            "code": "native-preview-stderr-read-failed",
                            "message": error.to_string(),
                        }),
                    );
                    break;
                }
            }
        }
    });
}

fn emit_capture_event(app: &AppHandle, payload: Value) -> Result<(), String> {
    let event_name = match payload.get("type").and_then(Value::as_str) {
        Some("session-started") => CAPTURE_EVENT_SESSION_STARTED,
        Some("frame") => CAPTURE_EVENT_FRAME,
        Some("audio") => CAPTURE_EVENT_AUDIO,
        Some("session-stopped") => CAPTURE_EVENT_SESSION_STOPPED,
        Some("error") => CAPTURE_EVENT_SYSTEM_ERROR,
        Some(other) => {
            return Err(format!("Unsupported capture event type: {other}"));
        }
        None => {
            return Err("Capture event payload did not contain a type".into());
        }
    };

    app.emit(event_name, payload)
        .map_err(|error| error.to_string())
}

fn emit_system_error(app: &AppHandle, payload: Value) -> Result<(), String> {
    app.emit(CAPTURE_EVENT_SYSTEM_ERROR, payload)
        .map_err(|error| error.to_string())
}

fn spawn_mac_capture_bridge_stream(
    session_id: &str,
    input: &StartNativeCaptureInput,
) -> Result<Child, String> {
    let package_dir = mac_capture_package_dir();

    let mut command = if let Some(binary) = mac_capture_bridge_binary(&package_dir) {
        let mut command = Command::new(binary);
        command.current_dir(&package_dir);
        command
    } else {
        let mut command = Command::new("swift");
        command
            .args(["run", "MacCaptureBridge", "--"])
            .current_dir(&package_dir);
        command
    };

    command
        .args([
            "stream",
            "--session-id",
            session_id,
            "--source-id",
            &input.source_id,
            "--include-audio",
            if input.include_audio { "true" } else { "false" },
            "--frame-interval-ms",
            "900",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())
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

fn build_session_id() -> String {
    format!("native-session-{}", current_timestamp_ms())
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CaptureBridgeState::default())
        .invoke_handler(tauri::generate_handler![
            get_bootstrap_state,
            list_native_capture_sources,
            start_native_capture,
            stop_native_capture
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
