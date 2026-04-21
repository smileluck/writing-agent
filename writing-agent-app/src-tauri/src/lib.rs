use std::{
    collections::HashMap,
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use chrono::{Local, Utc};
use reqwest::{header, StatusCode};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{Emitter, Manager};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
enum AppError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Sql(#[from] rusqlite::Error),
    #[error(transparent)]
    SerdeJson(#[from] serde_json::Error),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
}

type AppResult<T> = Result<T, AppError>;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone)]
struct AppState {
    db_path: PathBuf,
    default_workspace_root: PathBuf,
    secrets_path: PathBuf,
    runtime_root: PathBuf,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SaveModelProfileInput {
    profile_id: Option<String>,
    preset_id: Option<String>,
    provider_label: String,
    base_url: String,
    model: String,
    api_key: String,
    source_url: Option<String>,
    policy_note: Option<String>,
    is_default: bool,
    include_anthropic_version_header: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ModelProfile {
    id: String,
    preset_id: Option<String>,
    provider_label: String,
    protocol: String,
    base_url: String,
    model: String,
    source_url: Option<String>,
    policy_note: Option<String>,
    include_anthropic_version_header: bool,
    is_default: bool,
    last_test_status: Option<String>,
    last_test_error: Option<String>,
    last_tested_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapPayload {
    needs_onboarding: bool,
    profiles: Vec<ModelProfile>,
    projects: Vec<ProjectSummary>,
    workspace_settings: WorkspaceSettings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectSummary {
    id: String,
    slug: String,
    title: String,
    mode: String,
    topic: String,
    audience: String,
    word_target: Option<i64>,
    style_profile_id: Option<String>,
    model_profile_id: String,
    current_stage: String,
    status: String,
    is_archived: bool,
    archived_at: Option<String>,
    workspace_path: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectDetail {
    #[serde(flatten)]
    summary: ProjectSummary,
    outputs: Vec<StageOutput>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectInput {
    title: String,
    topic: String,
    audience: String,
    word_target: Option<i64>,
    mode: String,
    model_profile_id: String,
    style_profile_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProjectModelProfileInput {
    project_id: String,
    model_profile_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TokenUsage {
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StageOutput {
    id: String,
    project_id: String,
    run_id: Option<String>,
    stage_key: String,
    version: i64,
    summary: Option<String>,
    word_count: i64,
    markdown: String,
    structured: Value,
    raw_text: Option<String>,
    artifact_path: String,
    status: String,
    usage: Option<TokenUsage>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveStageOutputInput {
    project_id: String,
    stage_key: String,
    artifact_name: String,
    markdown: String,
    structured: Value,
    raw_text: String,
    summary: Option<String>,
    usage: Option<TokenUsage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSettings {
    root_path: String,
    default_root_path: String,
    uses_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveWorkspaceSettingsInput {
    root_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProjectProgressInput {
    project_id: String,
    current_stage: String,
    status: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunModelRequestInput {
    profile_id: String,
    system_prompt: String,
    user_prompt: String,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    request_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunModelRequestResult {
    text: String,
    endpoint: String,
    status_code: u16,
    usage: Option<TokenUsage>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeRuntimeResponse {
    ok: bool,
    text: Option<String>,
    usage: Option<TokenUsage>,
    error: Option<String>,
    details: Option<Value>,
    raw: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeProgressPayload {
    request_id: String,
    timestamp: String,
    phase: String,
    label: String,
    detail: String,
    raw_type: String,
    session_id: Option<String>,
    partial_text: Option<String>,
    chars_generated: Option<usize>,
    thinking_events: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum ClaudeRuntimeEnvelope {
    Progress { payload: RuntimeProgressPayload },
    Result {
        ok: bool,
        text: String,
        usage: Option<TokenUsage>,
        raw: Option<Value>,
    },
    Error {
        error: String,
        details: Option<Value>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionHealthResult {
    success: bool,
    provider_label: String,
    model: String,
    endpoint: String,
    response_preview: Option<String>,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportProjectResult {
    file_path: String,
}

impl AppState {
    fn bootstrap(app: &tauri::AppHandle) -> AppResult<Self> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| AppError::Message(format!("无法解析应用数据目录：{error}")))?;

        fs::create_dir_all(&app_data_dir)?;
        let default_workspace_root = resolve_default_workspace_root(&app_data_dir)?;
        let secrets_path = app_data_dir.join("secrets.json");
        let runtime_root = resolve_runtime_root(app)?;

        let db_path = app_data_dir.join("writing-agent.db");
        let state = Self {
            db_path,
            default_workspace_root,
            secrets_path,
            runtime_root,
        };

        init_db(&state)?;
        Ok(state)
    }

    fn open_connection(&self) -> AppResult<Connection> {
        Ok(Connection::open(&self.db_path)?)
    }
}

fn init_db(state: &AppState) -> AppResult<()> {
    let connection = state.open_connection()?;
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS model_profiles (
          id TEXT PRIMARY KEY,
          preset_id TEXT,
          provider_label TEXT NOT NULL,
          protocol TEXT NOT NULL,
          base_url TEXT NOT NULL,
          model TEXT NOT NULL,
          source_url TEXT,
          policy_note TEXT,
          include_anthropic_version_header INTEGER NOT NULL DEFAULT 0,
          is_default INTEGER NOT NULL DEFAULT 0,
          last_test_status TEXT,
          last_test_error TEXT,
          last_tested_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS writing_projects (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL,
          title TEXT NOT NULL,
          mode TEXT NOT NULL,
          topic TEXT NOT NULL,
          audience TEXT NOT NULL,
          word_target INTEGER,
          style_profile_id TEXT,
          model_profile_id TEXT NOT NULL,
          current_stage TEXT NOT NULL,
          status TEXT NOT NULL,
          is_archived INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT,
          workspace_path TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stage_outputs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          run_id TEXT,
          stage_key TEXT NOT NULL,
          version INTEGER NOT NULL,
          summary TEXT,
          word_count INTEGER NOT NULL DEFAULT 0,
          markdown TEXT NOT NULL,
          structured_json TEXT NOT NULL,
          raw_text TEXT,
          artifact_path TEXT NOT NULL,
          status TEXT NOT NULL,
          usage_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exports (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          format TEXT NOT NULL,
          file_path TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        ",
    )?;

    ensure_column_exists(
        &connection,
        "stage_outputs",
        "word_count",
        "ALTER TABLE stage_outputs ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column_exists(
        &connection,
        "writing_projects",
        "is_archived",
        "ALTER TABLE writing_projects ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column_exists(
        &connection,
        "writing_projects",
        "archived_at",
        "ALTER TABLE writing_projects ADD COLUMN archived_at TEXT",
    )?;

    Ok(())
}

fn resolve_default_workspace_root(app_data_dir: &Path) -> AppResult<PathBuf> {
    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let candidate = exe_dir.join("workspace");
            if fs::create_dir_all(&candidate).is_ok() {
                return Ok(candidate);
            }
        }
    }

    let fallback = app_data_dir.join("workspace");
    fs::create_dir_all(&fallback)?;
    Ok(fallback)
}

fn ensure_column_exists(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
    alter_sql: &str,
) -> AppResult<()> {
    let pragma = format!("PRAGMA table_info({table_name})");
    let mut statement = connection.prepare(&pragma)?;
    let rows = statement.query_map([], |row| row.get::<_, String>("name"))?;
    let column_names = rows.collect::<Result<Vec<_>, _>>()?;

    if !column_names.iter().any(|name| name == column_name) {
        connection.execute(alter_sql, [])?;
    }

    Ok(())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn current_local_date() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn slugify(input: &str) -> String {
    let mut slug = String::new();
    let mut last_was_dash = false;

    for character in input.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_was_dash = false;
            continue;
        }

        if character.is_whitespace() || "-_/".contains(character) {
            if !last_was_dash {
                slug.push('-');
                last_was_dash = true;
            }
            continue;
        }

        if ('\u{4e00}'..='\u{9fff}').contains(&character) {
            slug.push(character);
            last_was_dash = false;
        }
    }

    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "writing-project".to_string()
    } else {
        trimmed
    }
}

fn unique_workspace_slug(root: &Path, base_slug: &str) -> String {
    let mut index = 1;
    let normalized_base = base_slug.trim_matches('-');

    loop {
        let candidate = if index == 1 {
            normalized_base.to_string()
        } else {
            format!("{normalized_base}-{index}")
        };

        if !root.join(&candidate).exists() {
            return candidate;
        }

        index += 1;
    }
}

fn build_project_workspace(root: &Path, title: &str) -> (String, PathBuf) {
    let dated_base = format!("{}-{}", current_local_date(), slugify(title));
    let slug = unique_workspace_slug(root, &dated_base);
    let workspace_path = root.join(&slug);
    (slug, workspace_path)
}

fn normalize_topic_input(value: &str) -> String {
    value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn derive_project_title(topic: &str) -> String {
    let normalized = normalize_topic_input(topic);

    if normalized.is_empty() {
        return "未命名文章".to_string();
    }

    let first_segment = normalized
        .split(|character| matches!(character, '。' | '！' | '？' | '!' | '?' | '；' | ';' | '：' | ':'))
        .map(str::trim)
        .find(|segment| !segment.is_empty())
        .unwrap_or(normalized.as_str());

    let cleaned = first_segment
        .trim_matches(|character| matches!(character, '“' | '”' | '"' | '\'' | '《' | '》' | '【' | '】' | '[' | ']' | '(' | ')' | '（' | '）'))
        .trim();

    let truncated: String = cleaned.chars().take(24).collect();

    if !truncated.trim().is_empty() {
        truncated.trim().to_string()
    } else {
        normalized.chars().take(24).collect::<String>().trim().to_string()
    }
}

fn load_workspace_root_override(connection: &Connection) -> AppResult<Option<String>> {
    let value = connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'workspace_root' LIMIT 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    Ok(value)
}

fn resolve_workspace_root(state: &AppState, connection: &Connection) -> AppResult<PathBuf> {
    let custom_root = load_workspace_root_override(connection)?
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty());

    let root = custom_root.unwrap_or_else(|| state.default_workspace_root.clone());
    fs::create_dir_all(&root)?;
    Ok(root)
}

fn build_workspace_settings(state: &AppState, connection: &Connection) -> AppResult<WorkspaceSettings> {
    let override_root = load_workspace_root_override(connection)?;
    let uses_default = override_root.is_none();
    let default_root_path = state.default_workspace_root.to_string_lossy().to_string();
    let root_path = override_root.unwrap_or_else(|| default_root_path.clone());

    Ok(WorkspaceSettings {
        root_path,
        default_root_path,
        uses_default,
    })
}

fn save_workspace_root_override(
    connection: &Connection,
    root_path: Option<&str>,
) -> AppResult<()> {
    match root_path {
        Some(value) => {
            let now = now_iso();
            connection.execute(
                "
                INSERT INTO app_settings (key, value, updated_at)
                VALUES ('workspace_root', ?1, ?2)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                ",
                params![value, now],
            )?;
        }
        None => {
            connection.execute("DELETE FROM app_settings WHERE key = 'workspace_root'", [])?;
        }
    }

    Ok(())
}

fn estimate_word_count(markdown: &str) -> i64 {
    let mut count = 0_i64;
    let mut in_ascii_word = false;

    for character in markdown.chars() {
        if character.is_ascii_alphanumeric() {
            if !in_ascii_word {
                count += 1;
                in_ascii_word = true;
            }
            continue;
        }

        in_ascii_word = false;

        if character.is_whitespace() {
            continue;
        }

        if ('\u{4e00}'..='\u{9fff}').contains(&character) {
            count += 1;
            continue;
        }

        if character.is_alphabetic() || character.is_numeric() {
            count += 1;
        }
    }

    count
}

fn delete_project_workspace(project: &ProjectSummary) -> AppResult<()> {
    let workspace_path = PathBuf::from(&project.workspace_path);

    if workspace_path.as_os_str().is_empty() {
        return Err(AppError::Message("项目目录为空，拒绝删除。".to_string()));
    }

    if !workspace_path.is_absolute() {
        return Err(AppError::Message("项目目录不是绝对路径，拒绝删除。".to_string()));
    }

    if workspace_path.file_name().and_then(|name| name.to_str()) != Some(project.slug.as_str()) {
        return Err(AppError::Message(format!(
            "项目目录末级名称与项目标识不一致，拒绝删除：{}",
            workspace_path.display()
        )));
    }

    if workspace_path.exists() {
        fs::remove_dir_all(&workspace_path)?;
    }

    Ok(())
}

fn sync_project_manifest(summary: &ProjectSummary) -> AppResult<()> {
    let workspace_path = PathBuf::from(&summary.workspace_path);

    if workspace_path.as_os_str().is_empty() {
        return Err(AppError::Message("项目目录为空，无法写入项目清单。".to_string()));
    }

    fs::create_dir_all(&workspace_path)?;

    let manifest_path = workspace_path.join("project.json");
    let manifest_json = serde_json::to_string_pretty(summary)?;
    fs::write(manifest_path, manifest_json)?;

    Ok(())
}

fn default_stage_for_mode(_mode: &str) -> &'static str {
    "theme"
}

fn stage_sequence(mode: &str) -> &'static [&'static str] {
    if mode == "quick" {
        &["theme", "outline", "draft", "humanize"]
    } else {
        &[
            "theme", "position", "research", "outline", "titles", "draft", "review", "humanize",
        ]
    }
}

fn artifact_versioned_path(workspace_path: &Path, artifact_name: &str, version: i64) -> PathBuf {
    if version <= 1 {
        return workspace_path.join(artifact_name);
    }

    let artifact = Path::new(artifact_name);
    let stem = artifact
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "artifact".to_string());
    let extension = artifact
        .extension()
        .map(|value| format!(".{}", value.to_string_lossy()))
        .unwrap_or_default();

    workspace_path.join(format!("{stem}.v{version}{extension}"))
}

fn row_to_model_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<ModelProfile> {
    Ok(ModelProfile {
        id: row.get("id")?,
        preset_id: row.get("preset_id")?,
        provider_label: row.get("provider_label")?,
        protocol: row.get("protocol")?,
        base_url: row.get("base_url")?,
        model: row.get("model")?,
        source_url: row.get("source_url")?,
        policy_note: row.get("policy_note")?,
        include_anthropic_version_header: row.get::<_, i64>("include_anthropic_version_header")?
            == 1,
        is_default: row.get::<_, i64>("is_default")? == 1,
        last_test_status: row.get("last_test_status")?,
        last_test_error: row.get("last_test_error")?,
        last_tested_at: row.get("last_tested_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_project_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectSummary> {
    Ok(ProjectSummary {
        id: row.get("id")?,
        slug: row.get("slug")?,
        title: row.get("title")?,
        mode: row.get("mode")?,
        topic: row.get("topic")?,
        audience: row.get("audience")?,
        word_target: row.get("word_target")?,
        style_profile_id: row.get("style_profile_id")?,
        model_profile_id: row.get("model_profile_id")?,
        current_stage: row.get("current_stage")?,
        status: row.get("status")?,
        is_archived: row.get::<_, i64>("is_archived")? != 0,
        archived_at: row.get("archived_at")?,
        workspace_path: row.get("workspace_path")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_stage_output(row: &rusqlite::Row<'_>) -> rusqlite::Result<StageOutput> {
    let structured_json: String = row.get("structured_json")?;
    let usage_json: Option<String> = row.get("usage_json")?;

    Ok(StageOutput {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        run_id: row.get("run_id")?,
        stage_key: row.get("stage_key")?,
        version: row.get("version")?,
        summary: row.get("summary")?,
        word_count: row.get("word_count")?,
        markdown: row.get("markdown")?,
        structured: serde_json::from_str(&structured_json).unwrap_or(Value::Null),
        raw_text: row.get("raw_text")?,
        artifact_path: row.get("artifact_path")?,
        status: row.get("status")?,
        usage: usage_json
            .as_deref()
            .and_then(|value| serde_json::from_str::<TokenUsage>(value).ok()),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn list_model_profiles_db(connection: &Connection) -> AppResult<Vec<ModelProfile>> {
    let mut statement = connection.prepare(
        "
        SELECT *
        FROM model_profiles
        ORDER BY is_default DESC, updated_at DESC
        ",
    )?;
    let rows = statement.query_map([], row_to_model_profile)?;
    let profiles = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(profiles)
}

fn list_projects_db(connection: &Connection) -> AppResult<Vec<ProjectSummary>> {
    let mut statement = connection.prepare(
        "
        SELECT *
        FROM writing_projects
        ORDER BY updated_at DESC
        ",
    )?;
    let rows = statement.query_map([], row_to_project_summary)?;
    let projects = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(projects)
}

fn get_project_summary(connection: &Connection, project_id: &str) -> AppResult<ProjectSummary> {
    let mut statement = connection.prepare(
        "
        SELECT *
        FROM writing_projects
        WHERE id = ?1
        LIMIT 1
        ",
    )?;
    let project = statement
        .query_row([project_id], row_to_project_summary)
        .optional()?
        .ok_or_else(|| AppError::Message(format!("项目不存在：{project_id}")))?;
    Ok(project)
}

fn get_project_detail_db(connection: &Connection, project_id: &str) -> AppResult<ProjectDetail> {
    let summary = get_project_summary(connection, project_id)?;
    let mut statement = connection.prepare(
        "
        SELECT *
        FROM stage_outputs
        WHERE project_id = ?1
        ORDER BY created_at DESC
        ",
    )?;
    let rows = statement.query_map([project_id], row_to_stage_output)?;
    let outputs = rows.collect::<Result<Vec<_>, _>>()?;

    Ok(ProjectDetail { summary, outputs })
}

fn get_model_profile(connection: &Connection, profile_id: &str) -> AppResult<ModelProfile> {
    let mut statement = connection.prepare(
        "
        SELECT *
        FROM model_profiles
        WHERE id = ?1
        LIMIT 1
        ",
    )?;
    let profile = statement
        .query_row([profile_id], row_to_model_profile)
        .optional()?
        .ok_or_else(|| AppError::Message(format!("模型配置不存在：{profile_id}")))?;
    Ok(profile)
}

fn load_secret_map(state: &AppState) -> AppResult<HashMap<String, String>> {
    if !state.secrets_path.exists() {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(&state.secrets_path)?;
    if raw.trim().is_empty() {
        return Ok(HashMap::new());
    }

    Ok(serde_json::from_str(&raw)?)
}

fn write_secret_map(state: &AppState, secrets: &HashMap<String, String>) -> AppResult<()> {
    let raw = serde_json::to_string_pretty(secrets)?;
    fs::write(&state.secrets_path, raw)?;
    Ok(())
}

fn save_api_key(state: &AppState, profile_id: &str, api_key: &str) -> AppResult<()> {
    let mut secrets = load_secret_map(state)?;
    secrets.insert(profile_id.to_string(), api_key.to_string());
    write_secret_map(state, &secrets)
}

fn load_api_key(state: &AppState, profile_id: &str) -> AppResult<String> {
    let secrets = load_secret_map(state)?;
    secrets
        .get(profile_id)
        .cloned()
        .ok_or_else(|| AppError::Message(format!("未找到模型配置 {profile_id} 的 API Key")))
}

fn app_root_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

fn normalize_path_for_node(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let raw = path.to_string_lossy();
        if let Some(stripped) = raw.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{stripped}"));
        }
        if let Some(stripped) = raw.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
        PathBuf::from(raw.as_ref())
    }

    #[cfg(not(windows))]
    {
        path.to_path_buf()
    }
}

fn looks_like_runtime_root(path: &Path) -> bool {
    path.join("agent-runtime").join("execute-claude.mjs").exists()
        && path.join("runtime-bin").join("node.exe").exists()
}

fn runtime_root_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.clone());
        candidates.push(resource_dir.join("_up_"));
    }

    let app_root = app_root_dir();
    candidates.push(app_root.clone());
    candidates.push(app_root.join("_up_"));

    let mut unique = Vec::new();
    for candidate in candidates {
        if !unique.iter().any(|existing: &PathBuf| existing == &candidate) {
            unique.push(candidate);
        }
    }

    unique
}

fn resolve_runtime_root(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    for candidate in runtime_root_candidates(app) {
        if looks_like_runtime_root(&candidate) {
            return Ok(normalize_path_for_node(&candidate));
        }
    }

    let tried = runtime_root_candidates(app)
        .into_iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join("；");

    Err(AppError::Message(format!(
        "未找到 Claude runtime 资源目录。已检查：{tried}"
    )))
}

fn claude_runtime_script_path(runtime_root: &Path) -> PathBuf {
    runtime_root
        .join("agent-runtime")
        .join("execute-claude.mjs")
}

fn resolve_node_executable(runtime_root: &Path) -> AppResult<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    candidates.push(runtime_root.join("runtime-bin").join("node.exe"));

    if let Ok(value) = env::var("NODE_EXE") {
        candidates.push(PathBuf::from(value));
    }
    if let Ok(value) = env::var("NVM_SYMLINK") {
        candidates.push(PathBuf::from(value).join("node.exe"));
    }
    if let Ok(value) = env::var("NVM_HOME") {
        candidates.push(PathBuf::from(value).join("node.exe"));
    }

    candidates.push(PathBuf::from(r"C:\nvm4w\nodejs\node.exe"));
    candidates.push(PathBuf::from(r"C:\Program Files\nodejs\node.exe"));
    candidates.push(PathBuf::from("node"));

    for candidate in candidates {
        let status = Command::new(&candidate)
            .arg("-v")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        if matches!(status, Ok(status) if status.success()) {
            return Ok(candidate);
        }
    }

    Err(AppError::Message(
        "当前环境未找到可用的 Node.js，无法启动 Claude runtime。".to_string(),
    ))
}

fn is_runtime_bootstrap_error(error: &AppError) -> bool {
    let message = error.to_string();
    message.contains("Node.js")
        || message.contains("Claude runtime 脚本不存在")
        || message.contains("Claude runtime 启动失败")
}

fn messages_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');

    if trimmed.ends_with("/v1/messages") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{trimmed}/messages")
    } else {
        format!("{trimmed}/v1/messages")
    }
}

fn is_bailian_coding_plan_key(api_key: &str) -> bool {
    api_key.trim().starts_with("sk-sp-")
}

fn normalize_anthropic_base_url(base_url: &str, api_key: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');

    if !is_bailian_coding_plan_key(api_key) {
        return trimmed.to_string();
    }

    match trimmed {
        "https://dashscope.aliyuncs.com/apps/anthropic" => {
            "https://coding.dashscope.aliyuncs.com/apps/anthropic".to_string()
        }
        "https://dashscope.aliyuncs.com/apps/anthropic/v1" => {
            "https://coding.dashscope.aliyuncs.com/apps/anthropic/v1".to_string()
        }
        _ => trimmed.to_string(),
    }
}

fn should_disable_anthropic_version_header(base_url: &str) -> bool {
    base_url
        .to_ascii_lowercase()
        .contains("dashscope.aliyuncs.com")
}

fn compact_error_body(body: &str) -> String {
    let compact = body.split_whitespace().collect::<Vec<_>>().join(" ");
    compact.chars().take(300).collect()
}

fn format_provider_error(provider_label: &str, status: StatusCode, body: &str) -> String {
    let preview = compact_error_body(body);
    let lowered_body = preview.to_ascii_lowercase();
    let mut message = format!("{} 返回 {}：{}", provider_label, status.as_u16(), preview);

    if lowered_body.contains("anthropic-version") {
        message.push_str("。该兼容接口不接受 anthropic-version 请求头。");
    }

    message
}

fn format_profile_runtime_label(profile: &ModelProfile) -> String {
    format!(
        "{} / {}（{}）",
        profile.provider_label, profile.model, profile.base_url
    )
}

fn should_allow_direct_api_fallback(base_url: &str, api_key: &str) -> bool {
    let normalized = normalize_anthropic_base_url(base_url, api_key).to_ascii_lowercase();

    if normalized.contains("coding.dashscope.aliyuncs.com/apps/anthropic") {
        return false;
    }

    true
}

async fn attempt_request(
    endpoint: &str,
    api_key: &str,
    use_bearer: bool,
    include_version_header: bool,
    payload: &Value,
) -> AppResult<(StatusCode, String)> {
    let client = reqwest::Client::new();
    let mut request = client
        .post(endpoint)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::ACCEPT, "application/json");

    request = if use_bearer {
        request.bearer_auth(api_key)
    } else {
        request.header("x-api-key", api_key)
    };

    if include_version_header {
        request = request.header("anthropic-version", "2023-06-01");
    }

    let response = request.json(payload).send().await?;
    let status = response.status();
    let body = response.text().await?;
    Ok((status, body))
}

async fn perform_anthropic_request(
    provider_label: &str,
    base_url: &str,
    model: &str,
    api_key: &str,
    include_version_header: bool,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
) -> AppResult<RunModelRequestResult> {
    let normalized_base_url = normalize_anthropic_base_url(base_url, api_key);
    let endpoint = messages_endpoint(&normalized_base_url);
    let effective_version_header =
        include_version_header && !should_disable_anthropic_version_header(&normalized_base_url);
    let payload = json!({
        "model": model,
        "max_tokens": max_tokens.unwrap_or(1200),
        "temperature": temperature.unwrap_or(0.2),
        "system": system_prompt,
        "messages": [
            {
                "role": "user",
                "content": user_prompt
            }
        ]
    });

    let mut attempts = vec![
        (false, effective_version_header),
        (true, effective_version_header),
    ];
    if effective_version_header {
        attempts.push((false, false));
        attempts.push((true, false));
    }

    let mut last_error = String::new();

    for (use_bearer, include_version) in attempts {
        let (status, body) =
            attempt_request(&endpoint, api_key, use_bearer, include_version, &payload).await?;

        if status.is_success() {
            let response_json: Value = serde_json::from_str(&body)?;
            let text = response_json
                .get("content")
                .and_then(|content| content.as_array())
                .map(|blocks| {
                    blocks
                        .iter()
                        .filter_map(|block| block.get("text").and_then(|text| text.as_str()))
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();

            if text.trim().is_empty() {
                return Err(AppError::Message(format!(
                    "{provider_label} 返回成功，但未解析到文本内容。"
                )));
            }

            let usage = response_json.get("usage").map(|usage| TokenUsage {
                input_tokens: usage.get("input_tokens").and_then(|value| value.as_i64()),
                output_tokens: usage.get("output_tokens").and_then(|value| value.as_i64()),
            });

            return Ok(RunModelRequestResult {
                text,
                endpoint: endpoint.clone(),
                status_code: status.as_u16(),
                usage,
            });
        }

        last_error = format_provider_error(provider_label, status, &body);

        if !(status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN) {
            if !effective_version_header || !last_error.contains("anthropic-version") {
                break;
            }
        }
    }

    Err(AppError::Message(last_error))
}

async fn perform_claude_runtime_request(
    app_handle: Option<tauri::AppHandle>,
    state: &AppState,
    base_url: &str,
    model: &str,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
    request_id: Option<String>,
) -> AppResult<RunModelRequestResult> {
    let node_path = resolve_node_executable(&state.runtime_root)?;
    let script_path = claude_runtime_script_path(&state.runtime_root);

    if !script_path.exists() {
        return Err(AppError::Message(format!(
            "Claude runtime 脚本不存在：{}",
            script_path.display()
        )));
    }

    let sandbox_home_base = state
        .db_path
        .parent()
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")))
        .join("claude-runtime");

    let payload = json!({
        "baseUrl": normalize_anthropic_base_url(base_url, api_key),
        "apiKey": api_key,
        "model": model,
        "systemPrompt": system_prompt,
        "userPrompt": user_prompt,
        "cwd": state.runtime_root.to_string_lossy().to_string(),
        "sandboxHomeBase": sandbox_home_base.to_string_lossy().to_string(),
        "maxTurns": 1,
        "requestId": request_id
    });
    let raw_input = serde_json::to_vec(&payload)?;
    let app_handle_for_runtime = app_handle.clone();
    let runtime_root = state.runtime_root.clone();
    let normalized_endpoint = format!(
        "claude-runtime:{}",
        normalize_anthropic_base_url(base_url, api_key)
    );

    let response = tauri::async_runtime::spawn_blocking(move || -> AppResult<ClaudeRuntimeResponse> {
        let mut command = Command::new(&node_path);
        command
            .arg(&script_path)
            .current_dir(&runtime_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        command.creation_flags(CREATE_NO_WINDOW);

        let mut child = command.spawn()?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(&raw_input)?;
            stdin.flush()?;
        }

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Message("Claude runtime stdout 不可用。".to_string()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| AppError::Message("Claude runtime stderr 不可用。".to_string()))?;

        let stderr_handle = std::thread::spawn(move || -> String {
            let mut stderr_text = String::new();
            let mut stderr_reader = BufReader::new(stderr);
            let _ = stderr_reader.read_to_string(&mut stderr_text);
            stderr_text
        });

        let mut final_response: Option<ClaudeRuntimeResponse> = None;
        let stdout_reader = BufReader::new(stdout);

        for line in stdout_reader.lines() {
            let line = line?;
            let trimmed = line.trim();

            if trimmed.is_empty() {
                continue;
            }

            let envelope = serde_json::from_str::<ClaudeRuntimeEnvelope>(trimmed).map_err(|error| {
                AppError::Message(format!(
                    "Claude runtime 事件无法解析：{error}；line={}",
                    trimmed.chars().take(500).collect::<String>()
                ))
            })?;

            match envelope {
                ClaudeRuntimeEnvelope::Progress { payload } => {
                    if let Some(app_handle) = &app_handle_for_runtime {
                        let _ = app_handle.emit("writing-runtime-progress", &payload);
                    }
                }
                ClaudeRuntimeEnvelope::Result { ok, text, usage, raw } => {
                    final_response = Some(ClaudeRuntimeResponse {
                        ok,
                        text: Some(text),
                        usage,
                        error: None,
                        details: None,
                        raw,
                    });
                }
                ClaudeRuntimeEnvelope::Error { error, details } => {
                    final_response = Some(ClaudeRuntimeResponse {
                        ok: false,
                        text: None,
                        usage: None,
                        error: Some(error),
                        details,
                        raw: None,
                    });
                }
            }
        }

        let status = child.wait()?;
        let stderr = stderr_handle
            .join()
            .unwrap_or_else(|_| "读取 Claude runtime stderr 失败。".to_string());

        let response = final_response.ok_or_else(|| {
            AppError::Message(format!(
                "Claude runtime 未返回最终结果；stderr={}",
                stderr.chars().take(500).collect::<String>()
            ))
        })?;

        if !status.success() && response.ok {
            return Err(AppError::Message(format!(
                "Claude runtime 退出异常，但未返回错误：stderr={}",
                stderr.chars().take(500).collect::<String>()
            )));
        }

        if !response.ok {
            let detail_suffix = response
                .details
                .as_ref()
                .map(|details| compact_error_body(&details.to_string()))
                .filter(|value| !value.is_empty())
                .map(|value| format!("：{value}"))
                .unwrap_or_default();

            return Err(AppError::Message(format!(
                "{}{}",
                response
                    .error
                    .clone()
                    .unwrap_or_else(|| "Claude runtime 调用失败".to_string()),
                detail_suffix
            )));
        }

        Ok(response)
    })
    .await
    .map_err(|error| AppError::Message(format!("Claude runtime 任务执行失败：{error}")))??;

    Ok(RunModelRequestResult {
        text: response.text.unwrap_or_default(),
        endpoint: normalized_endpoint,
        status_code: 200,
        usage: response.usage,
    })
}

async fn execute_profile_request(
    app_handle: Option<tauri::AppHandle>,
    state: &AppState,
    provider_label: &str,
    base_url: &str,
    model: &str,
    api_key: &str,
    include_anthropic_version_header: bool,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    request_id: Option<String>,
) -> AppResult<RunModelRequestResult> {
    match perform_claude_runtime_request(
        app_handle,
        state,
        base_url,
        model,
        api_key,
        system_prompt,
        user_prompt,
        request_id,
    )
    .await
    {
        Ok(result) => Ok(result),
        Err(error)
            if is_runtime_bootstrap_error(&error)
                && should_allow_direct_api_fallback(base_url, api_key) =>
        {
            perform_anthropic_request(
                provider_label,
                base_url,
                model,
                api_key,
                include_anthropic_version_header || base_url.contains("api.anthropic.com"),
                system_prompt,
                user_prompt,
                max_tokens,
                temperature,
            )
            .await
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
fn bootstrap_app(state: tauri::State<'_, AppState>) -> Result<BootstrapPayload, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let profiles = list_model_profiles_db(&connection).map_err(|error| error.to_string())?;
    let projects = list_projects_db(&connection).map_err(|error| error.to_string())?;
    let workspace_settings =
        build_workspace_settings(&state, &connection).map_err(|error| error.to_string())?;

    Ok(BootstrapPayload {
        needs_onboarding: profiles.is_empty(),
        profiles,
        projects,
        workspace_settings,
    })
}

#[tauri::command]
async fn health_check_profile(
    state: tauri::State<'_, AppState>,
    input: SaveModelProfileInput,
) -> Result<ConnectionHealthResult, String> {
    let api_key = if input.api_key.trim().is_empty() {
        if let Some(profile_id) = input.profile_id.as_deref() {
            load_api_key(&state, profile_id).map_err(|error| error.to_string())?
        } else {
            return Err("API Key 不能为空。".to_string());
        }
    } else {
        input.api_key.clone()
    };

    let result = execute_profile_request(
        None,
        &state,
        &input.provider_label,
        &input.base_url,
        &input.model,
        &api_key,
        input.include_anthropic_version_header,
        "你是一个健康检查助手。只需要用一句中文确认连接可用。",
        "请返回一句不超过 18 个字的确认语句。",
        Some(120),
        Some(0.0),
        None,
    )
    .await
    .map_err(|error| error.to_string())?;

    Ok(ConnectionHealthResult {
        success: true,
        provider_label: input.provider_label,
        model: input.model,
        endpoint: result.endpoint,
        response_preview: Some(result.text.chars().take(120).collect()),
        message: "连接测试通过，这份配置可以直接用于写作阶段。".to_string(),
    })
}

#[tauri::command]
fn save_model_profile(
    state: tauri::State<'_, AppState>,
    input: SaveModelProfileInput,
) -> Result<ModelProfile, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let now = now_iso();
    let profile_id = input
        .profile_id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    if input.is_default {
        connection
            .execute("UPDATE model_profiles SET is_default = 0", [])
            .map_err(|error| error.to_string())?;
    }

    if input.profile_id.is_some() {
        get_model_profile(&connection, &profile_id).map_err(|error| error.to_string())?;

        connection
            .execute(
                "
                UPDATE model_profiles
                SET preset_id = ?2,
                    provider_label = ?3,
                    base_url = ?4,
                    model = ?5,
                    source_url = ?6,
                    policy_note = ?7,
                    include_anthropic_version_header = ?8,
                    is_default = ?9,
                    last_test_status = NULL,
                    last_test_error = NULL,
                    last_tested_at = NULL,
                    updated_at = ?10
                WHERE id = ?1
                ",
                params![
                    profile_id,
                    input.preset_id,
                    input.provider_label,
                    input.base_url,
                    input.model,
                    input.source_url,
                    input.policy_note,
                    if input.include_anthropic_version_header { 1 } else { 0 },
                    if input.is_default { 1 } else { 0 },
                    now
                ],
            )
            .map_err(|error| error.to_string())?;

        if input.api_key.trim().is_empty() {
            load_api_key(&state, &profile_id).map_err(|error| error.to_string())?;
        } else {
            save_api_key(&state, &profile_id, &input.api_key).map_err(|error| error.to_string())?;
        }
    } else {
        if input.api_key.trim().is_empty() {
            return Err("API Key 不能为空。".to_string());
        }

        connection
            .execute(
                "
                INSERT INTO model_profiles (
                  id,
                  preset_id,
                  provider_label,
                  protocol,
                  base_url,
                  model,
                  source_url,
                  policy_note,
                  include_anthropic_version_header,
                  is_default,
                  last_test_status,
                  last_test_error,
                  last_tested_at,
                  created_at,
                  updated_at
                ) VALUES (?1, ?2, ?3, 'anthropic-compatible', ?4, ?5, ?6, ?7, ?8, ?9, 'passed', NULL, ?10, ?11, ?12)
                ",
                params![
                    profile_id,
                    input.preset_id,
                    input.provider_label,
                    input.base_url,
                    input.model,
                    input.source_url,
                    input.policy_note,
                    if input.include_anthropic_version_header { 1 } else { 0 },
                    if input.is_default { 1 } else { 0 },
                    now,
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;

        save_api_key(&state, &profile_id, &input.api_key).map_err(|error| error.to_string())?;
    }

    get_model_profile(&connection, &profile_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_default_model_profile(
    state: tauri::State<'_, AppState>,
    profile_id: String,
) -> Result<ModelProfile, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    get_model_profile(&connection, &profile_id).map_err(|error| error.to_string())?;
    let now = now_iso();

    connection
        .execute("UPDATE model_profiles SET is_default = 0", [])
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "
            UPDATE model_profiles
            SET is_default = 1,
                updated_at = ?2
            WHERE id = ?1
            ",
            params![profile_id, now],
        )
        .map_err(|error| error.to_string())?;

    get_model_profile(&connection, &profile_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_workspace_settings(
    state: tauri::State<'_, AppState>,
    input: SaveWorkspaceSettingsInput,
) -> Result<WorkspaceSettings, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let normalized = input
        .root_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);

    if let Some(path) = &normalized {
        fs::create_dir_all(path).map_err(|error| format!("无法创建工作区目录：{error}"))?;
    }

    let normalized_string = normalized
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());

    save_workspace_root_override(&connection, normalized_string.as_deref())
        .map_err(|error| error.to_string())?;

    build_workspace_settings(&state, &connection).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_project(
    state: tauri::State<'_, AppState>,
    input: CreateProjectInput,
) -> Result<ProjectDetail, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    get_model_profile(&connection, &input.model_profile_id).map_err(|error| error.to_string())?;

    let project_id = Uuid::new_v4().to_string();
    let workspace_root = resolve_workspace_root(&state, &connection).map_err(|error| error.to_string())?;
    let project_title = if input.title.trim().is_empty() {
        derive_project_title(&input.topic)
    } else {
        input.title.trim().to_string()
    };
    let (slug, workspace_path) = build_project_workspace(&workspace_root, &project_title);
    let now = now_iso();
    fs::create_dir_all(&workspace_path).map_err(|error| error.to_string())?;

    connection
        .execute(
            "
            INSERT INTO writing_projects (
              id,
              slug,
              title,
              mode,
              topic,
              audience,
              word_target,
              style_profile_id,
              model_profile_id,
              current_stage,
              status,
              is_archived,
              archived_at,
              workspace_path,
              created_at,
              updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'active', 0, NULL, ?11, ?12, ?13)
            ",
            params![
                project_id,
                slug,
                project_title,
                input.mode,
                input.topic,
                input.audience,
                input.word_target,
                input.style_profile_id,
                input.model_profile_id,
                default_stage_for_mode(&input.mode),
                workspace_path.to_string_lossy().to_string(),
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    let detail =
        get_project_detail_db(&connection, &project_id).map_err(|error| error.to_string())?;
    sync_project_manifest(&detail.summary).map_err(|error| error.to_string())?;

    Ok(detail)
}

#[tauri::command]
fn update_project_model_profile(
    state: tauri::State<'_, AppState>,
    input: UpdateProjectModelProfileInput,
) -> Result<ProjectDetail, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    get_project_summary(&connection, &input.project_id).map_err(|error| error.to_string())?;
    get_model_profile(&connection, &input.model_profile_id).map_err(|error| error.to_string())?;

    let now = now_iso();
    connection
        .execute(
            "
            UPDATE writing_projects
            SET model_profile_id = ?2,
                updated_at = ?3
            WHERE id = ?1
            ",
            params![input.project_id, input.model_profile_id, now],
        )
        .map_err(|error| error.to_string())?;

    let detail =
        get_project_detail_db(&connection, &input.project_id).map_err(|error| error.to_string())?;
    sync_project_manifest(&detail.summary).map_err(|error| error.to_string())?;

    Ok(detail)
}

#[tauri::command]
fn archive_project(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<ProjectDetail, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    get_project_summary(&connection, &project_id).map_err(|error| error.to_string())?;

    let now = now_iso();
    connection
        .execute(
            "
            UPDATE writing_projects
            SET is_archived = 1,
                archived_at = ?2,
                updated_at = ?2
            WHERE id = ?1
            ",
            params![project_id, now],
        )
        .map_err(|error| error.to_string())?;

    let detail =
        get_project_detail_db(&connection, &project_id).map_err(|error| error.to_string())?;
    sync_project_manifest(&detail.summary).map_err(|error| error.to_string())?;

    Ok(detail)
}

#[tauri::command]
fn restore_project(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<ProjectDetail, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    get_project_summary(&connection, &project_id).map_err(|error| error.to_string())?;

    let now = now_iso();
    connection
        .execute(
            "
            UPDATE writing_projects
            SET is_archived = 0,
                archived_at = NULL,
                updated_at = ?2
            WHERE id = ?1
            ",
            params![project_id, now],
        )
        .map_err(|error| error.to_string())?;

    let detail =
        get_project_detail_db(&connection, &project_id).map_err(|error| error.to_string())?;
    sync_project_manifest(&detail.summary).map_err(|error| error.to_string())?;

    Ok(detail)
}

#[tauri::command]
fn delete_project(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let project = get_project_summary(&connection, &project_id).map_err(|error| error.to_string())?;

    delete_project_workspace(&project).map_err(|error| error.to_string())?;

    connection
        .execute(
            "DELETE FROM stage_outputs WHERE project_id = ?1",
            params![project_id.clone()],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM exports WHERE project_id = ?1", params![project_id.clone()])
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM writing_projects WHERE id = ?1", params![project_id])
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_project_detail(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<ProjectDetail, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    get_project_detail_db(&connection, &project_id).map_err(|error| error.to_string())
}

#[tauri::command]
async fn run_model_request(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: RunModelRequestInput,
) -> Result<RunModelRequestResult, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let profile =
        get_model_profile(&connection, &input.profile_id).map_err(|error| error.to_string())?;
    let profile_label = format_profile_runtime_label(&profile);
    let api_key = load_api_key(&state, &input.profile_id).map_err(|error| match error {
        AppError::Message(message) if message.contains("未找到模型配置") => {
            format!("当前项目使用的是 {profile_label}。这份配置还没有保存 API Key，请先去设置里补齐。")
        }
        other => format!("当前项目使用的是 {profile_label}。读取 API Key 失败：{other}"),
    })?;

    execute_profile_request(
        Some(app),
        &state,
        &profile.provider_label,
        &profile.base_url,
        &profile.model,
        &api_key,
        profile.include_anthropic_version_header,
        &input.system_prompt,
        &input.user_prompt,
        input.max_tokens,
        input.temperature,
        input.request_id.clone(),
    )
    .await
    .map_err(|error| format!("当前项目使用的是 {profile_label}。{error}"))
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();

    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("只允许打开 http 或 https 链接。".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(trimmed)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn save_stage_output(
    state: tauri::State<'_, AppState>,
    input: SaveStageOutputInput,
) -> Result<StageOutput, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let project =
        get_project_summary(&connection, &input.project_id).map_err(|error| error.to_string())?;
    let next_version: i64 = connection
        .query_row(
            "
            SELECT COALESCE(MAX(version), 0) + 1
            FROM stage_outputs
            WHERE project_id = ?1 AND stage_key = ?2
            ",
            params![input.project_id, input.stage_key],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;

    let workspace_path = PathBuf::from(&project.workspace_path);
    fs::create_dir_all(&workspace_path).map_err(|error| error.to_string())?;
    let artifact_path =
        artifact_versioned_path(&workspace_path, &input.artifact_name, next_version);
    fs::write(&artifact_path, &input.markdown).map_err(|error| error.to_string())?;

    let stage_output_id = Uuid::new_v4().to_string();
    let now = now_iso();
    let structured_json =
        serde_json::to_string(&input.structured).map_err(|error| error.to_string())?;
    let usage_json = input
        .usage
        .as_ref()
        .map(|usage| serde_json::to_string(usage))
        .transpose()
        .map_err(|error| error.to_string())?;
    let word_count = estimate_word_count(&input.markdown);

    connection
        .execute(
            "
            INSERT INTO stage_outputs (
              id,
              project_id,
              run_id,
              stage_key,
              version,
              summary,
              word_count,
              markdown,
              structured_json,
              raw_text,
              artifact_path,
              status,
              usage_json,
              created_at,
              updated_at
            ) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'generated', ?11, ?12, ?13)
            ",
            params![
                stage_output_id,
                input.project_id,
                input.stage_key,
                next_version,
                input.summary,
                word_count,
                input.markdown,
                structured_json,
                input.raw_text,
                artifact_path.to_string_lossy().to_string(),
                usage_json,
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "UPDATE writing_projects SET updated_at = ?2 WHERE id = ?1",
            params![input.project_id, now],
        )
        .map_err(|error| error.to_string())?;

    let mut statement = connection
        .prepare(
            "
            SELECT *
            FROM stage_outputs
            WHERE id = ?1
            LIMIT 1
            ",
        )
        .map_err(|error| error.to_string())?;

    statement
        .query_row([stage_output_id], row_to_stage_output)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn update_project_progress(
    state: tauri::State<'_, AppState>,
    input: UpdateProjectProgressInput,
) -> Result<ProjectDetail, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let now = now_iso();
    connection
        .execute(
            "
            UPDATE writing_projects
            SET current_stage = ?2,
                status = ?3,
                updated_at = ?4
            WHERE id = ?1
            ",
            params![input.project_id, input.current_stage, input.status, now],
        )
        .map_err(|error| error.to_string())?;

    get_project_detail_db(&connection, &input.project_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn export_project(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<ExportProjectResult, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let detail =
        get_project_detail_db(&connection, &project_id).map_err(|error| error.to_string())?;
    let workspace_path = PathBuf::from(&detail.summary.workspace_path);
    fs::create_dir_all(&workspace_path).map_err(|error| error.to_string())?;

    let mut export_markdown = detail
        .outputs
        .iter()
        .find(|output| output.stage_key == "humanize")
        .map(|output| output.markdown.clone())
        .or_else(|| {
            detail
                .outputs
                .iter()
                .find(|output| output.stage_key == "draft")
                .map(|output| output.markdown.clone())
        });

    if export_markdown.is_none() {
        let mut blocks = Vec::new();
        for stage_key in stage_sequence(&detail.summary.mode) {
            if let Some(output) = detail
                .outputs
                .iter()
                .find(|output| output.stage_key == *stage_key)
            {
                blocks.push(format!("## {stage_key}\n\n{}", output.markdown));
            }
        }
        export_markdown = Some(blocks.join("\n\n"));
    }

    let export_content = export_markdown.unwrap_or_else(|| "当前没有可导出的内容。".to_string());
    let file_path = workspace_path.join("final_export.md");
    fs::write(&file_path, export_content).map_err(|error| error.to_string())?;

    connection
        .execute(
            "
            INSERT INTO exports (id, project_id, format, file_path, created_at)
            VALUES (?1, ?2, 'markdown', ?3, ?4)
            ",
            params![
                Uuid::new_v4().to_string(),
                project_id,
                file_path.to_string_lossy().to_string(),
                now_iso()
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(ExportProjectResult {
        file_path: file_path.to_string_lossy().to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let state = AppState::bootstrap(&app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap_app,
            open_external_url,
            health_check_profile,
            save_model_profile,
            set_default_model_profile,
            save_workspace_settings,
            create_project,
            update_project_model_profile,
            archive_project,
            restore_project,
            delete_project,
            get_project_detail,
            run_model_request,
            save_stage_output,
            update_project_progress,
            export_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
