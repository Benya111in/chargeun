use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::blocking::multipart::{Form, Part};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    env,
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStderr, ChildStdout, Command, Stdio},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, State};

const CAPTURE_EVENT_SESSION_STARTED: &str = "capture/session-started";
const CAPTURE_EVENT_FRAME: &str = "capture/frame";
const CAPTURE_EVENT_AUDIO: &str = "capture/audio";
const CAPTURE_EVENT_SESSION_STOPPED: &str = "capture/session-stopped";
const CAPTURE_EVENT_SYSTEM_ERROR: &str = "error/system";
const VOICE_EVENT_REPLY: &str = "voice/reply";
const SQLITE_SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  platform TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  has_audio INTEGER NOT NULL,
  display_name TEXT
);

CREATE TABLE IF NOT EXISTS perception_packets (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  t_start_ms INTEGER NOT NULL,
  t_end_ms INTEGER NOT NULL,
  asr_text TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  hazard TEXT NOT NULL,
  phase TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  confidence REAL NOT NULL,
  official_rule_ids TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS segment_explanations (
  segment_id TEXT PRIMARY KEY,
  safety_mode TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
"#;

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClearLocalRuntimeResult {
    cleared: bool,
    path: String,
    status: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PrivacyPrefs {
    capture_consent: bool,
    clear_on_stop: bool,
    retain_captured_media: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSessionMeta {
    id: String,
    source_type: String,
    platform: String,
    started_at: u64,
    has_audio: bool,
    display_name: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppRuntimeState {
    demo_mode: String,
    last_session: Option<PersistedSessionMeta>,
    panic_mode: bool,
    privacy_prefs: PrivacyPrefs,
    scenario_id: String,
    selected_source_id: Option<String>,
    selected_track: String,
    show_evidence: bool,
    updated_at: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveAppRuntimeStateInput {
    state: AppRuntimeState,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportDemoArtifactInput {
    artifact_name: String,
    payload: Value,
    screenshot_data_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportDemoArtifactResult {
    artifact_name: String,
    json_path: String,
    screenshot_path: Option<String>,
    status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtractOcrTokensInput {
    image_ref: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeOcrTokensResult {
    tokens: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractOcrTokensResult {
    status: String,
    tokens: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TranscribeAudioSampleInput {
    pcm_ref: String,
    locale: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeAudioTranscriptionResult {
    status: String,
    transcript: String,
    locale: Option<String>,
    source: String,
    message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscribeAudioSampleResult {
    status: String,
    transcript: String,
    locale: Option<String>,
    source: String,
    message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistLocalRecordResult {
    path: String,
    status: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionLogCaptureSession {
    id: String,
    source_type: String,
    platform: String,
    started_at: u64,
    has_audio: bool,
    display_name: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionLogEntryPayload {
    ended_at: Option<u64>,
    selected_source_id: Option<String>,
    selected_track: Option<String>,
    session: SessionLogCaptureSession,
    voice_enabled: Option<bool>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveAnalysisPacketSummary {
    asr_text: String,
    keyframe_count: u32,
    object_hint_labels: Vec<String>,
    ocr_tokens: Vec<String>,
    session_id: String,
    t_end_ms: u64,
    t_start_ms: u64,
    ui_element_labels: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveAnalysisPlanSummary {
    fps: u32,
    hold_ms: u64,
    mode: String,
    reason: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveAnalysisSnapshotInput {
    created_at: u64,
    explanation: Value,
    packet_summary: LiveAnalysisPacketSummary,
    plan: LiveAnalysisPlanSummary,
    segment: Value,
    session: SessionLogEntryPayload,
    source_id: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceRuntimeStatus {
    native_tts_available: bool,
    native_stt_available: bool,
    preferred_voice_identifier: Option<String>,
    preferred_voice_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpeakVoiceReplyInput {
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpeakVoiceReplyResult {
    mode: String,
    request_id: u64,
    started: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StopVoiceReplyResult {
    stopped: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListenForVoiceIntentInput {
    timeout_ms: Option<u64>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceIntentRecognitionResult {
    status: String,
    intent: Option<String>,
    transcript: Option<String>,
    source: String,
    message: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaSourceReference {
    credit: String,
    kind: String,
    notes: String,
    title: String,
    url: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaSourceClipPlan {
    notes: String,
    output_relative_path: String,
    search_hints: Vec<String>,
    source_id: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaFixtureRecord {
    clip_id: String,
    description: String,
    expected_rule_ids: Vec<String>,
    has_audio: bool,
    hazard: String,
    #[serde(default)]
    local_clip_path: Option<String>,
    phase: String,
    #[serde(default)]
    source_clip_plan: Option<QaSourceClipPlan>,
    #[serde(default)]
    source_reference: Option<QaSourceReference>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManualReviewRunRecord {
    clip_id: String,
    date: String,
    notes: String,
    operator: String,
    path: String,
    status: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RehearsalRunRecord {
    backup_ready: bool,
    date: String,
    evidence_and_cache_works: bool,
    fallback_works: bool,
    full_monitor_capture_works: bool,
    low_confidence_fallback_works: bool,
    no_audio_fallback_works: bool,
    notes: String,
    operator: String,
    path: String,
    permissions_retry_works: bool,
    result: String,
    shadow_player_primary: bool,
    startup_under10s: bool,
    voice_off_works: bool,
    window_capture_works: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QaReviewState {
    fixtures: Vec<QaFixtureRecord>,
    manual_review_runs: Vec<ManualReviewRunRecord>,
    rehearsal_runs: Vec<RehearsalRunRecord>,
}

#[derive(Default)]
struct CaptureBridgeState {
    sessions: Mutex<HashMap<String, ManagedCaptureProcess>>,
}

#[derive(Clone, Default)]
struct VoiceRuntimeState {
    playback: Arc<Mutex<Option<ManagedVoicePlayback>>>,
}

struct ManagedCaptureProcess {
    child: Child,
}

#[derive(Clone)]
struct ManagedVoicePlayback {
    pid: u32,
    request_id: u64,
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

#[tauri::command]
fn clear_local_runtime(app: AppHandle) -> Result<ClearLocalRuntimeResult, String> {
    let path = local_runtime_dir(&app);

    if path.exists() {
        fs::remove_dir_all(&path).map_err(|error| error.to_string())?;

        Ok(ClearLocalRuntimeResult {
            cleared: true,
            path: path.display().to_string(),
            status: "cleared".into(),
        })
    } else {
        Ok(ClearLocalRuntimeResult {
            cleared: false,
            path: path.display().to_string(),
            status: "noop".into(),
        })
    }
}

#[tauri::command]
fn load_app_runtime_state(app: AppHandle) -> Result<AppRuntimeState, String> {
    let path = app_runtime_state_path(&app);

    if path.exists() {
        let raw = fs::read(&path).map_err(|error| error.to_string())?;
        return serde_json::from_slice::<AppRuntimeState>(&raw).map_err(|error| error.to_string());
    }

    if let Some(state) = load_app_setting_json::<AppRuntimeState>(&app, "app_runtime_state")? {
        return Ok(state);
    }

    Ok(default_app_runtime_state())
}

#[tauri::command]
fn save_app_runtime_state(
    app: AppHandle,
    input: SaveAppRuntimeStateInput,
) -> Result<AppRuntimeState, String> {
    let path = app_runtime_state_path(&app);
    let parent = path
        .parent()
        .ok_or_else(|| "App runtime state path did not have a parent directory".to_string())?;

    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    fs::write(
        &path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&input.state).map_err(|error| error.to_string())?
        ),
    )
    .map_err(|error| error.to_string())?;
    save_app_setting_json(&app, "app_runtime_state", &input.state)?;

    Ok(input.state)
}

#[tauri::command]
fn export_demo_artifact(
    app: AppHandle,
    input: ExportDemoArtifactInput,
) -> Result<ExportDemoArtifactResult, String> {
    let export_dir = local_runtime_dir(&app).join("export");
    fs::create_dir_all(&export_dir).map_err(|error| error.to_string())?;

    let artifact_name = sanitize_artifact_name(&input.artifact_name);
    let timestamp = current_timestamp_ms();
    let json_path = export_dir.join(format!("{artifact_name}-{timestamp}.json"));
    let screenshot_path = export_dir.join(format!("{artifact_name}-{timestamp}.png"));

    let mut payload = input.payload;
    if let Value::Object(ref mut object) = payload {
        object.insert("exportedAt".into(), Value::from(timestamp));
    }

    fs::write(
        &json_path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&payload).map_err(|error| error.to_string())?
        ),
    )
    .map_err(|error| error.to_string())?;

    let saved_screenshot_path = if let Some(data_url) = input.screenshot_data_url {
        write_screenshot_data_url(&screenshot_path, &data_url)?;
        Some(screenshot_path.display().to_string())
    } else {
        None
    };

    Ok(ExportDemoArtifactResult {
        artifact_name,
        json_path: json_path.display().to_string(),
        screenshot_path: saved_screenshot_path,
        status: "exported".into(),
    })
}

#[tauri::command]
fn extract_ocr_tokens(
    app: AppHandle,
    input: ExtractOcrTokensInput,
) -> Result<ExtractOcrTokensResult, String> {
    let path = write_data_url_temp_file(&app, "ocr-frame", &input.image_ref)?;
    let path_string = path.display().to_string();
    let result = run_mac_capture_bridge_json::<BridgeOcrTokensResult>(&[
        "ocr-image",
        "--image-path",
        &path_string,
    ]);
    let _ = fs::remove_file(&path);

    result.map(|value| ExtractOcrTokensResult {
        status: "recognized".into(),
        tokens: value.tokens,
    })
}

#[tauri::command]
fn transcribe_audio_sample(input: TranscribeAudioSampleInput) -> Result<TranscribeAudioSampleResult, String> {
    let mut args = vec![
        "transcribe-audio".to_string(),
        "--audio-path".to_string(),
        input.pcm_ref.clone(),
    ];

    if let Some(locale) = input.locale.clone() {
        args.push("--locale".to_string());
        args.push(locale);
    }

    let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    let local_result = run_mac_capture_bridge_json::<BridgeAudioTranscriptionResult>(&arg_refs)
        .unwrap_or(BridgeAudioTranscriptionResult {
            status: "error".into(),
            transcript: String::new(),
            locale: input.locale.clone(),
            source: "speech".into(),
            message: Some("MacCaptureBridge audio transcription did not return JSON.".into()),
        });

    let local_status = local_result.status.as_str();
    let needs_fallback = Path::new(&input.pcm_ref).exists()
        && local_status != "recognized"
        && local_status != "no-match"
        && local_status != "missing-file";

    if needs_fallback {
        if let Some(api_key) = openai_api_key_from_env() {
            match transcribe_audio_with_openai(&api_key, &input.pcm_ref, input.locale.as_deref()) {
                Ok(mut fallback) => {
                    if fallback.message.is_none() && local_result.message.is_some() {
                        fallback.message = Some(format!(
                            "macOS Speech unavailable, OpenAI fallback used: {}",
                            local_result.message.clone().unwrap_or_default()
                        ));
                    }

                    return Ok(fallback);
                }
                Err(error) => {
                    return Ok(TranscribeAudioSampleResult {
                        status: local_result.status,
                        transcript: local_result.transcript,
                        locale: local_result.locale,
                        source: local_result.source,
                        message: Some(match local_result.message {
                            Some(message) => format!("{message} | OpenAI fallback failed: {error}"),
                            None => format!("OpenAI fallback failed: {error}"),
                        }),
                    });
                }
            }
        }
    }

    Ok(TranscribeAudioSampleResult {
        status: local_result.status,
        transcript: local_result.transcript,
        locale: local_result.locale,
        source: local_result.source,
        message: local_result.message,
    })
}

#[tauri::command]
fn append_session_log_entry(
    app: AppHandle,
    input: SessionLogEntryPayload,
) -> Result<PersistLocalRecordResult, String> {
    let path = session_logs_path(&app);
    append_json_line(&path, &input)?;
    persist_session_log_entry(&app, &input)?;

    Ok(PersistLocalRecordResult {
        path: path.display().to_string(),
        status: "saved".into(),
    })
}

#[tauri::command]
fn save_live_analysis_snapshot(
    app: AppHandle,
    input: LiveAnalysisSnapshotInput,
) -> Result<PersistLocalRecordResult, String> {
    let path = live_analysis_snapshot_path(&app);
    ensure_parent_dir(&path)?;
    fs::write(
        &path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&input).map_err(|error| error.to_string())?
        ),
    )
    .map_err(|error| error.to_string())?;
    persist_session_log_entry(&app, &input.session)?;
    persist_live_analysis_snapshot(&app, &input)?;

    Ok(PersistLocalRecordResult {
        path: path.display().to_string(),
        status: "saved".into(),
    })
}

#[tauri::command]
fn load_last_live_analysis_snapshot(
    app: AppHandle,
) -> Result<Option<LiveAnalysisSnapshotInput>, String> {
    if let Some(snapshot) =
        load_app_setting_json::<LiveAnalysisSnapshotInput>(&app, "last_live_analysis_snapshot")?
    {
        return Ok(Some(snapshot));
    }

    let path = live_analysis_snapshot_path(&app);
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read(&path).map_err(|error| error.to_string())?;
    let snapshot = serde_json::from_slice::<LiveAnalysisSnapshotInput>(&raw)
        .map_err(|error| error.to_string())?;

    Ok(Some(snapshot))
}

#[tauri::command]
fn load_qa_review_state(app: AppHandle) -> Result<QaReviewState, String> {
    let fixtures = hydrate_qa_fixtures(&app, read_json_file(eval_fixtures_path(&app))?);

    Ok(QaReviewState {
        fixtures,
        manual_review_runs: load_qa_run_records::<ManualReviewRunRecord>(
            qa_manual_review_runs_path(&app),
            qa_manual_review_seed_path(&app),
        )?,
        rehearsal_runs: load_qa_run_records::<RehearsalRunRecord>(
            qa_rehearsal_runs_path(&app),
            qa_rehearsal_seed_path(&app),
        )?,
    })
}

#[tauri::command]
fn append_manual_review_run(
    app: AppHandle,
    input: ManualReviewRunRecord,
) -> Result<QaReviewState, String> {
    let path = qa_manual_review_runs_path(&app);
    let seed_path = qa_manual_review_seed_path(&app);
    let mut runs: Vec<ManualReviewRunRecord> = load_qa_run_records(&path, &seed_path)?;
    runs.push(input);
    write_json_file(&path, &runs)?;
    sync_qa_logs_if_dev_repo()?;
    load_qa_review_state(app)
}

#[tauri::command]
fn append_rehearsal_run(
    app: AppHandle,
    input: RehearsalRunRecord,
) -> Result<QaReviewState, String> {
    let path = qa_rehearsal_runs_path(&app);
    let seed_path = qa_rehearsal_seed_path(&app);
    let mut runs: Vec<RehearsalRunRecord> = load_qa_run_records(&path, &seed_path)?;
    runs.push(input);
    write_json_file(&path, &runs)?;
    sync_qa_logs_if_dev_repo()?;
    load_qa_review_state(app)
}

#[tauri::command]
fn get_voice_runtime_status() -> VoiceRuntimeStatus {
    run_voice_runtime_bridge_json::<VoiceRuntimeStatus>(&["status"]).unwrap_or(VoiceRuntimeStatus {
        native_tts_available: false,
        native_stt_available: false,
        preferred_voice_identifier: None,
        preferred_voice_name: None,
    })
}

#[tauri::command]
fn speak_voice_reply(
    app: AppHandle,
    state: State<VoiceRuntimeState>,
    input: SpeakVoiceReplyInput,
) -> Result<SpeakVoiceReplyResult, String> {
    let _ = stop_voice_playback_process(&state.playback)?;

    let request_id = current_timestamp_ms();
    let mut child = spawn_voice_runtime_bridge_speak(&input)?;
    let pid = child.id();

    {
        let mut playback = state
            .playback
            .lock()
            .map_err(|_| "Voice runtime playback state is poisoned".to_string())?;
        *playback = Some(ManagedVoicePlayback { pid, request_id });
    }

    emit_voice_runtime_event(
        &app,
        json!({
            "mode": "native",
            "requestId": request_id,
            "text": input.text,
            "type": "tts-started",
        }),
    )?;

    let playback_state = state.playback.clone();
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let result = child.wait();
        let payload = match result {
            Ok(status) if status.success() => json!({
                "mode": "native",
                "requestId": request_id,
                "type": "tts-finished",
            }),
            Ok(status) if status.code().is_none() => json!({
                "mode": "native",
                "requestId": request_id,
                "type": "tts-stopped",
            }),
            Ok(status) => json!({
                "message": format!("Voice runtime exited with status {status}"),
                "mode": "native",
                "requestId": request_id,
                "type": "tts-error",
            }),
            Err(error) => json!({
                "message": error.to_string(),
                "mode": "native",
                "requestId": request_id,
                "type": "tts-error",
            }),
        };

        if let Ok(mut playback) = playback_state.lock() {
            if playback
                .as_ref()
                .map(|current| current.request_id == request_id)
                .unwrap_or(false)
            {
                playback.take();
            }
        }

        let _ = emit_voice_runtime_event(&app_handle, payload);
    });

    Ok(SpeakVoiceReplyResult {
        mode: "native".into(),
        request_id,
        started: true,
    })
}

#[tauri::command]
fn stop_voice_reply(state: State<VoiceRuntimeState>) -> Result<StopVoiceReplyResult, String> {
    let stopped = stop_voice_playback_process(&state.playback)?;
    Ok(StopVoiceReplyResult { stopped })
}

#[tauri::command]
fn listen_for_voice_intent(
    input: ListenForVoiceIntentInput,
) -> Result<VoiceIntentRecognitionResult, String> {
    let timeout_ms = input.timeout_ms.unwrap_or(6000).to_string();
    run_voice_runtime_bridge_json::<VoiceIntentRecognitionResult>(&[
        "listen-intent",
        "--timeout-ms",
        &timeout_ms,
    ])
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

fn emit_voice_runtime_event(app: &AppHandle, payload: Value) -> Result<(), String> {
    app.emit(VOICE_EVENT_REPLY, payload)
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

fn openai_api_key_from_env() -> Option<String> {
    env::var("SLOWLEARNER_OPENAI_API_KEY")
        .ok()
        .or_else(|| env::var("OPENAI_API_KEY").ok())
        .filter(|value| !value.trim().is_empty())
}

fn transcribe_audio_with_openai(
    api_key: &str,
    audio_path: &str,
    locale: Option<&str>,
) -> Result<TranscribeAudioSampleResult, String> {
    let (upload_path, cleanup_path, mime_type) = prepare_audio_upload_for_openai(audio_path)?;
    let upload_bytes = fs::read(&upload_path).map_err(|error| error.to_string())?;
    let file_name = upload_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("audio.wav")
        .to_string();
    let mut form = Form::new().text("model", "gpt-4o-mini-transcribe").part(
        "file",
        Part::bytes(upload_bytes)
            .file_name(file_name)
            .mime_str(&mime_type)
            .map_err(|error| error.to_string())?,
    );

    if let Some(language) = locale.and_then(normalize_openai_language) {
        form = form.text("language", language);
    }

    let client = reqwest::blocking::Client::builder()
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(api_key)
        .header(
            "X-Client-Request-Id",
            format!("slowlearner-asr-{}", current_timestamp_ms()),
        )
        .multipart(form)
        .send()
        .map_err(|error| error.to_string())?;
    let status_code = response.status();
    let payload = response.text().map_err(|error| error.to_string())?;

    if let Some(temp_path) = cleanup_path {
        let _ = fs::remove_file(temp_path);
    }

    let value = serde_json::from_str::<Value>(&payload).map_err(|error| error.to_string())?;
    if !status_code.is_success() {
        let message = value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("OpenAI transcription request failed.")
            .to_string();
        return Err(message);
    }

    let transcript = value
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();

    Ok(TranscribeAudioSampleResult {
        status: if transcript.is_empty() {
            "no-match".into()
        } else {
            "recognized".into()
        },
        transcript,
        locale: locale.map(ToString::to_string),
        source: "openai-transcribe".into(),
        message: None,
    })
}

fn prepare_audio_upload_for_openai(audio_path: &str) -> Result<(PathBuf, Option<PathBuf>, String), String> {
    let path = PathBuf::from(audio_path);
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    if matches!(
        extension.as_str(),
        "mp3" | "mp4" | "mpeg" | "mpga" | "m4a" | "wav" | "webm"
    ) {
        return Ok((path, None, mime_type_for_audio_extension(&extension).into()));
    }

    let converted_path = env::temp_dir().join(format!(
        "slowlearner-openai-asr-{}.wav",
        current_timestamp_ms()
    ));
    let output = Command::new("afconvert")
        .args([
            "-f",
            "WAVE",
            "-d",
            "LEI16@16000",
            audio_path,
            converted_path
                .to_str()
                .ok_or_else(|| "Converted audio path was not valid UTF-8".to_string())?,
        ])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if stderr.is_empty() { stdout } else { stderr });
    }

    Ok((converted_path.clone(), Some(converted_path), "audio/wav".into()))
}

fn mime_type_for_audio_extension(extension: &str) -> &'static str {
    match extension {
        "mp3" => "audio/mpeg",
        "mp4" | "m4a" => "audio/mp4",
        "mpeg" | "mpga" => "audio/mpeg",
        "webm" => "audio/webm",
        _ => "audio/wav",
    }
}

fn normalize_openai_language(locale: &str) -> Option<String> {
    let normalized = locale.trim();
    if normalized.is_empty() {
        return None;
    }

    Some(
        normalized
            .split(['-', '_'])
            .next()
            .unwrap_or(normalized)
            .to_ascii_lowercase(),
    )
}

fn spawn_voice_runtime_bridge_speak(input: &SpeakVoiceReplyInput) -> Result<Child, String> {
    let package_dir = mac_capture_package_dir();

    let mut command = if let Some(binary) = voice_runtime_bridge_binary(&package_dir) {
        let mut command = Command::new(binary);
        command.current_dir(&package_dir);
        command
    } else {
        let mut command = Command::new("swift");
        command
            .args(["run", "VoiceRuntimeBridge", "--"])
            .current_dir(&package_dir);
        command
    };

    command
        .args(["speak", "--text", &input.text])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())
}

fn run_voice_runtime_bridge_json<T: DeserializeOwned>(args: &[&str]) -> Result<T, String> {
    let output = run_voice_runtime_bridge(args)?;
    serde_json::from_slice::<T>(&output).map_err(|error| error.to_string())
}

fn run_voice_runtime_bridge(args: &[&str]) -> Result<Vec<u8>, String> {
    let package_dir = mac_capture_package_dir();
    let output = if let Some(binary) = voice_runtime_bridge_binary(&package_dir) {
        Command::new(binary)
            .args(args)
            .current_dir(&package_dir)
            .output()
            .map_err(|error| error.to_string())?
    } else {
        Command::new("swift")
            .args(["run", "VoiceRuntimeBridge", "--"])
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

fn stop_voice_playback_process(
    playback_state: &Arc<Mutex<Option<ManagedVoicePlayback>>>,
) -> Result<bool, String> {
    let playback = playback_state
        .lock()
        .map_err(|_| "Voice runtime playback state is poisoned".to_string())?
        .clone();

    let Some(playback) = playback else {
        return Ok(false);
    };

    let status = Command::new("kill")
        .args(["-TERM", &playback.pid.to_string()])
        .status()
        .map_err(|error| error.to_string())?;

    Ok(status.success())
}

fn mac_capture_package_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../native/mac-capture")
        .to_path_buf()
}

fn use_dev_repo_layout() -> bool {
    cfg!(debug_assertions)
}

fn dev_repo_root_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .to_path_buf()
}

fn dev_local_runtime_dir() -> PathBuf {
    dev_repo_root_dir().join(".slowlearner")
}

fn local_runtime_dir(app: &AppHandle) -> PathBuf {
    if use_dev_repo_layout() {
        return dev_local_runtime_dir();
    }

    app.path()
        .app_local_data_dir()
        .unwrap_or_else(|_| dev_local_runtime_dir())
}

fn app_runtime_state_path(app: &AppHandle) -> PathBuf {
    local_runtime_dir(app).join("ui-state.json")
}

fn session_logs_path(app: &AppHandle) -> PathBuf {
    local_runtime_dir(app).join("logs").join("sessions.jsonl")
}

fn live_analysis_snapshot_path(app: &AppHandle) -> PathBuf {
    local_runtime_dir(app)
        .join("cache")
        .join("live-analysis-latest.json")
}

fn bundled_or_dev_resource_path(app: &AppHandle, relative_path: &str) -> PathBuf {
    if use_dev_repo_layout() {
        return dev_repo_root_dir().join(relative_path);
    }

    app.path()
        .resolve(relative_path, BaseDirectory::Resource)
        .unwrap_or_else(|_| dev_repo_root_dir().join(relative_path))
}

fn qa_runtime_dir(app: &AppHandle) -> PathBuf {
    local_runtime_dir(app).join("qa")
}

fn qa_runtime_clips_dir(app: &AppHandle) -> PathBuf {
    qa_runtime_dir(app).join("clips")
}

fn eval_fixtures_path(app: &AppHandle) -> PathBuf {
    bundled_or_dev_resource_path(app, "data/eval/annotated_segments.json")
}

fn qa_manual_review_runs_path(app: &AppHandle) -> PathBuf {
    if use_dev_repo_layout() {
        dev_repo_root_dir()
            .join("data")
            .join("eval")
            .join("manual_review_runs.json")
    } else {
        qa_runtime_dir(app).join("manual_review_runs.json")
    }
}

fn qa_manual_review_seed_path(app: &AppHandle) -> PathBuf {
    bundled_or_dev_resource_path(app, "data/eval/manual_review_runs.json")
}

fn qa_rehearsal_runs_path(app: &AppHandle) -> PathBuf {
    if use_dev_repo_layout() {
        dev_repo_root_dir()
            .join("data")
            .join("eval")
            .join("rehearsal_runs.json")
    } else {
        qa_runtime_dir(app).join("rehearsal_runs.json")
    }
}

fn qa_rehearsal_seed_path(app: &AppHandle) -> PathBuf {
    bundled_or_dev_resource_path(app, "data/eval/rehearsal_runs.json")
}

fn runtime_db_path(app: &AppHandle) -> PathBuf {
    local_runtime_dir(app).join("runtime.sqlite3")
}

fn hydrate_qa_fixtures(app: &AppHandle, fixtures: Vec<QaFixtureRecord>) -> Vec<QaFixtureRecord> {
    fixtures
        .into_iter()
        .map(|mut fixture| {
            fixture.local_clip_path = resolve_fixture_local_clip_path(app, &fixture);
            fixture
        })
        .collect()
}

fn resolve_fixture_local_clip_path(app: &AppHandle, fixture: &QaFixtureRecord) -> Option<String> {
    let relative_path = fixture
        .source_clip_plan
        .as_ref()?
        .output_relative_path
        .trim();

    if relative_path.is_empty() {
        return None;
    }

    let runtime_clip_path = qa_runtime_clips_dir(app).join(Path::new(relative_path).file_name()?);
    let candidates = if use_dev_repo_layout() {
        vec![dev_repo_root_dir().join(relative_path)]
    } else {
        vec![runtime_clip_path, dev_repo_root_dir().join(relative_path)]
    };

    candidates
        .into_iter()
        .find(|candidate| candidate.exists())
        .map(|path| path.to_string_lossy().to_string())
}

fn default_app_runtime_state() -> AppRuntimeState {
    AppRuntimeState {
        demo_mode: "live-priority".into(),
        last_session: None,
        panic_mode: false,
        privacy_prefs: PrivacyPrefs {
            capture_consent: false,
            clear_on_stop: true,
            retain_captured_media: false,
        },
        scenario_id: "grounded-fire".into(),
        selected_source_id: None,
        selected_track: "action".into(),
        show_evidence: true,
        updated_at: 0,
    }
}

fn sanitize_artifact_name(input: &str) -> String {
    let sanitized = input
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else if ('가'..='힣').contains(&character) {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .split('-')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if sanitized.is_empty() {
        "ansimtrack-demo".into()
    } else {
        sanitized
    }
}

fn write_screenshot_data_url(path: &Path, data_url: &str) -> Result<(), String> {
    fs::write(path, decode_data_url(data_url)?).map_err(|error| error.to_string())
}

fn write_data_url_temp_file(
    app: &AppHandle,
    prefix: &str,
    data_url: &str,
) -> Result<PathBuf, String> {
    let extension = if data_url.starts_with("data:image/png") {
        "png"
    } else if data_url.starts_with("data:image/webp") {
        "webp"
    } else {
        "jpg"
    };
    let path = local_runtime_dir(app)
        .join("cache")
        .join("ocr")
        .join(format!("{prefix}-{}.{}", current_timestamp_ms(), extension));
    ensure_parent_dir(&path)?;
    fs::write(&path, decode_data_url(data_url)?).map_err(|error| error.to_string())?;
    Ok(path)
}

fn decode_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    let encoded = data_url
        .split_once(',')
        .map(|(_, encoded)| encoded)
        .ok_or_else(|| "Data URL was malformed".to_string())?;

    STANDARD.decode(encoded).map_err(|error| error.to_string())
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Target path did not have a parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())
}

fn append_json_line<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    ensure_parent_dir(path)?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    let line = serde_json::to_string(value).map_err(|error| error.to_string())?;
    writeln!(file, "{line}").map_err(|error| error.to_string())
}

fn read_json_file<T>(path: impl AsRef<Path>) -> Result<T, String>
where
    T: Default + DeserializeOwned,
{
    let path = path.as_ref();

    if !path.exists() {
        return Ok(T::default());
    }

    let raw = fs::read(path).map_err(|error| error.to_string())?;
    serde_json::from_slice::<T>(&raw).map_err(|error| error.to_string())
}

fn write_json_file<T: Serialize>(path: impl AsRef<Path>, value: &T) -> Result<(), String> {
    let path = path.as_ref();
    ensure_parent_dir(&path)?;
    fs::write(
        path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(value).map_err(|error| error.to_string())?
        ),
    )
    .map_err(|error| error.to_string())
}

fn load_seeded_json_file<T>(runtime_path: &Path, seed_path: &Path) -> Result<T, String>
where
    T: Default + DeserializeOwned + Serialize,
{
    if runtime_path.exists() {
        return read_json_file(runtime_path);
    }

    if seed_path.exists() {
        let value = read_json_file(seed_path)?;
        write_json_file(runtime_path, &value)?;
        return Ok(value);
    }

    Ok(T::default())
}

fn load_qa_run_records<T>(
    runtime_path: impl AsRef<Path>,
    seed_path: impl AsRef<Path>,
) -> Result<Vec<T>, String>
where
    T: DeserializeOwned + Serialize,
{
    if use_dev_repo_layout() {
        read_json_file(runtime_path)
    } else {
        load_seeded_json_file(runtime_path.as_ref(), seed_path.as_ref())
    }
}

fn open_runtime_db(app: &AppHandle) -> Result<Connection, String> {
    let path = runtime_db_path(app);
    ensure_parent_dir(&path)?;

    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .execute_batch(SQLITE_SCHEMA_SQL)
        .map_err(|error| error.to_string())?;

    Ok(connection)
}

fn save_app_setting_json<T: Serialize>(
    app: &AppHandle,
    key: &str,
    value: &T,
) -> Result<(), String> {
    let connection = open_runtime_db(app)?;
    let value_json = serde_json::to_string(value).map_err(|error| error.to_string())?;

    connection
        .execute(
            "
            INSERT INTO app_settings (key, value_json)
            VALUES (?1, ?2)
            ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
            ",
            params![key, value_json],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn load_app_setting_json<T: DeserializeOwned>(
    app: &AppHandle,
    key: &str,
) -> Result<Option<T>, String> {
    let connection = open_runtime_db(app)?;
    let raw = connection
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    match raw {
        Some(value) => serde_json::from_str::<T>(&value)
            .map(Some)
            .map_err(|error| error.to_string()),
        None => Ok(None),
    }
}

fn persist_session_log_entry(
    app: &AppHandle,
    entry: &SessionLogEntryPayload,
) -> Result<(), String> {
    let connection = open_runtime_db(app)?;

    connection
        .execute(
            "
            INSERT INTO sessions (
              id,
              source_type,
              platform,
              started_at,
              ended_at,
              has_audio,
              display_name
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(id) DO UPDATE SET
              source_type = excluded.source_type,
              platform = excluded.platform,
              started_at = excluded.started_at,
              ended_at = COALESCE(excluded.ended_at, sessions.ended_at),
              has_audio = excluded.has_audio,
              display_name = COALESCE(excluded.display_name, sessions.display_name)
            ",
            params![
                entry.session.id,
                entry.session.source_type,
                entry.session.platform,
                entry.session.started_at,
                entry.ended_at,
                if entry.session.has_audio { 1 } else { 0 },
                entry.session.display_name
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn persist_live_analysis_snapshot(
    app: &AppHandle,
    input: &LiveAnalysisSnapshotInput,
) -> Result<(), String> {
    let connection = open_runtime_db(app)?;
    let packet_id = format!(
        "{}:{}:{}",
        input.packet_summary.session_id,
        input.packet_summary.t_start_ms,
        input.packet_summary.t_end_ms
    );
    let packet_json =
        serde_json::to_string(&input.packet_summary).map_err(|error| error.to_string())?;
    let segment_id = json_string_field(&input.segment, "id")
        .unwrap_or_else(|| format!("segment-{}", input.created_at));
    let official_rule_ids_json = match input.segment.get("officialRuleIds") {
        Some(value) => serde_json::to_string(value).map_err(|error| error.to_string())?,
        None => "[]".into(),
    };
    let explanation_json =
        serde_json::to_string(&input.explanation).map_err(|error| error.to_string())?;

    connection
        .execute(
            "
            INSERT OR REPLACE INTO perception_packets (
              id,
              session_id,
              t_start_ms,
              t_end_ms,
              asr_text,
              payload_json
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ",
            params![
                packet_id,
                input.packet_summary.session_id,
                input.packet_summary.t_start_ms,
                input.packet_summary.t_end_ms,
                input.packet_summary.asr_text,
                packet_json
            ],
        )
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "
            INSERT OR REPLACE INTO segments (
              id,
              session_id,
              hazard,
              phase,
              start_ms,
              end_ms,
              confidence,
              official_rule_ids
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ",
            params![
                segment_id,
                input.session.session.id,
                json_string_field(&input.segment, "hazard").unwrap_or_else(|| "unknown".into()),
                json_string_field(&input.segment, "phase")
                    .unwrap_or_else(|| "review_official".into()),
                json_u64_field(&input.segment, "startMs").unwrap_or(0),
                json_u64_field(&input.segment, "endMs").unwrap_or(0),
                json_f64_field(&input.segment, "confidence").unwrap_or(0.0),
                official_rule_ids_json
            ],
        )
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "
            INSERT OR REPLACE INTO segment_explanations (
              segment_id,
              safety_mode,
              payload_json
            )
            VALUES (?1, ?2, ?3)
            ",
            params![
                segment_id,
                json_string_field(&input.explanation, "safetyMode")
                    .unwrap_or_else(|| "review_official".into()),
                explanation_json
            ],
        )
        .map_err(|error| error.to_string())?;

    save_app_setting_json(app, "last_live_analysis_snapshot", input)?;

    Ok(())
}

fn sync_qa_logs_if_dev_repo() -> Result<(), String> {
    if !use_dev_repo_layout() {
        return Ok(());
    }

    let output = Command::new("pnpm")
        .args(["qa:sync"])
        .current_dir(dev_repo_root_dir())
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

fn json_string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn json_u64_field(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(Value::as_u64)
}

fn json_f64_field(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(Value::as_f64)
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

fn voice_runtime_bridge_binary(package_dir: &Path) -> Option<PathBuf> {
    [
        package_dir.join(".build/arm64-apple-macosx/debug/VoiceRuntimeBridge"),
        package_dir.join(".build/x86_64-apple-macosx/debug/VoiceRuntimeBridge"),
        package_dir.join(".build/debug/VoiceRuntimeBridge"),
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
        .manage(VoiceRuntimeState::default())
        .invoke_handler(tauri::generate_handler![
            get_bootstrap_state,
            list_native_capture_sources,
            start_native_capture,
            stop_native_capture,
            clear_local_runtime,
            load_app_runtime_state,
            save_app_runtime_state,
            export_demo_artifact,
            extract_ocr_tokens,
            transcribe_audio_sample,
            append_session_log_entry,
            save_live_analysis_snapshot,
            load_last_live_analysis_snapshot,
            load_qa_review_state,
            append_manual_review_run,
            append_rehearsal_run,
            get_voice_runtime_status,
            speak_voice_reply,
            stop_voice_reply,
            listen_for_voice_intent
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
