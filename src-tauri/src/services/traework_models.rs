//! Secret-free TRAE SOLO CN custom-model projection and revisioned writes.

use std::{
    collections::{HashMap, HashSet},
    fmt,
    path::{Path, PathBuf},
    sync::{Mutex as StdMutex, OnceLock},
    time::{Duration, Instant},
};

use hmac::{Hmac, Mac};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Sha256;
use tokio::sync::Mutex;
use uuid::Uuid;

use super::traework::{
    TraeApiFormat, TraeErrorCode, TraeErrorDto, TraeModelConfigRequest, TraeUrlMode,
};

const ITEM_TABLE: &str = "ItemTable";
const MAP_SUFFIX: &str = "AI.agent.model.model_list_map";
const LITE_LIST: &str = "solo_work_lite";
const REMOTE_LIST: &str = "solo_work_remote";
const MAX_MODELS: usize = 1_000;
const OVERWRITE_TOKEN_TTL: Duration = Duration::from_secs(3 * 60);
const OVERWRITE_TOKEN_EXPIRED_RETENTION: Duration = Duration::from_secs(3 * 60);
const FETCH_MODEL_ID: &str = "__fyagent_models_fetch__";
type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FetchTraeWorkModelsRequest {
    pub api_format: TraeApiFormat,
    pub url_mode: TraeUrlMode,
    pub url: String,
    pub api_key: String,
    pub allow_no_api_key: bool,
    pub allow_loopback: bool,
    pub allow_private_network: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveTraeWorkModelsRequest {
    pub api_format: TraeApiFormat,
    pub url_mode: TraeUrlMode,
    pub url: String,
    pub api_key: String,
    pub allow_no_api_key: bool,
    pub allow_loopback: bool,
    pub allow_private_network: bool,
    #[serde(default)]
    pub selected_model_ids: Vec<String>,
    #[serde(default)]
    pub removed_model_ids: Vec<String>,
    pub expected_revision: Option<String>,
    #[serde(default)]
    pub overwrite_token: Option<String>,
}

impl fmt::Debug for FetchTraeWorkModelsRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("FetchTraeWorkModelsRequest")
            .field("url", &"[REDACTED]")
            .field("api_key", &"[REDACTED]")
            .field("allow_no_api_key", &self.allow_no_api_key)
            .finish()
    }
}

impl fmt::Debug for SaveTraeWorkModelsRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SaveTraeWorkModelsRequest")
            .field("url", &"[REDACTED]")
            .field("api_key", &"[REDACTED]")
            .field("selected_model_id_count", &self.selected_model_ids.len())
            .field("removed_model_id_count", &self.removed_model_ids.len())
            .field("expected_revision", &"[REDACTED]")
            .field("overwrite_token", &"[REDACTED]")
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TraeWorkModelIdsResult {
    pub model_ids: Vec<String>,
    pub revision: Option<String>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FetchedModelRef {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owned_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FetchedModelList {
    pub models: Vec<FetchedModelRef>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "state")]
pub enum SaveTraeWorkModelsOutcome {
    #[serde(rename = "saved")]
    Saved {
        revision: String,
        #[serde(rename = "modelCount")]
        model_count: usize,
        #[serde(rename = "createdEntries")]
        created_entries: usize,
        #[serde(rename = "updatedEntries")]
        updated_entries: usize,
    },
    #[serde(rename = "overwrite_confirmation_required")]
    OverwriteConfirmationRequired {
        token: String,
        #[serde(rename = "existingIds")]
        existing_ids: Vec<String>,
    },
    #[serde(rename = "concurrent_modification")]
    ConcurrentModification,
}

#[derive(Debug, Clone)]
pub(crate) struct TraePaths {
    pub(crate) directory: PathBuf,
    pub(crate) db: PathBuf,
    pub(crate) backup: PathBuf,
}

impl TraePaths {
    pub(crate) fn from_home(home: &Path) -> Self {
        let directory = if cfg!(target_os = "windows") {
            home.join("AppData")
                .join("Roaming")
                .join("TRAE SOLO CN")
                .join("User")
                .join("globalStorage")
        } else {
            home.join("Library")
                .join("Application Support")
                .join("TRAE SOLO CN")
                .join("User")
                .join("globalStorage")
        };
        Self {
            db: directory.join("state.vscdb"),
            backup: directory.join("model_list_map.json.backup"),
            directory,
        }
    }
}

struct PendingOverwrite {
    request_digest: [u8; 32],
    expected_revision: Option<String>,
    expires_at: Instant,
}

fn write_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn pending_overwrites() -> &'static StdMutex<HashMap<String, PendingOverwrite>> {
    static PENDING: OnceLock<StdMutex<HashMap<String, PendingOverwrite>>> = OnceLock::new();
    PENDING.get_or_init(|| StdMutex::new(HashMap::new()))
}

fn current_paths() -> TraePaths {
    #[cfg(target_os = "windows")]
    {
        let directory = crate::config::get_user_roaming_app_data_dir()
            .join("TRAE SOLO CN")
            .join("User")
            .join("globalStorage");
        TraePaths {
            db: directory.join("state.vscdb"),
            backup: directory.join("model_list_map.json.backup"),
            directory,
        }
    }
    #[cfg(not(target_os = "windows"))]
    TraePaths::from_home(&crate::config::get_home_dir())
}

pub(crate) async fn get_traework_model_ids() -> Result<TraeWorkModelIdsResult, TraeErrorDto> {
    let paths = current_paths();
    tokio::task::spawn_blocking(move || get_traework_model_ids_at(&paths))
        .await
        .map_err(|_| TraeErrorDto::new(TraeErrorCode::StateUnavailable))?
}

pub(crate) async fn fetch_traework_models(
    request: FetchTraeWorkModelsRequest,
) -> Result<FetchedModelList, TraeErrorDto> {
    let admission = TraeModelConfigRequest::from_connection(
        request.api_format,
        request.url_mode,
        request.url.clone(),
        FETCH_MODEL_ID.to_string(),
        request.api_key.clone(),
        request.allow_no_api_key,
        request.allow_loopback,
        request.allow_private_network,
    );
    super::traework::validate_model_request(admission)?;
    let is_full_url = matches!(request.url_mode, TraeUrlMode::CompleteUrl);
    let models = super::model_fetch::fetch_models_optional_auth(
        &request.url,
        &request.api_key,
        is_full_url,
        request.allow_no_api_key,
    )
    .await
    .map_err(|_| TraeErrorDto::new(TraeErrorCode::InvalidModelConfig))?;
    project_fetched_models(models, request.api_key.trim())
}

pub(crate) fn probe_request_for_save(
    request: &SaveTraeWorkModelsRequest,
) -> Option<TraeModelConfigRequest> {
    let selected = normalize_ids(&request.selected_model_ids);
    selected.first().map(|model_id| {
        TraeModelConfigRequest::from_connection(
            request.api_format,
            request.url_mode,
            request.url.clone(),
            model_id.clone(),
            request.api_key.clone(),
            request.allow_no_api_key,
            request.allow_loopback,
            request.allow_private_network,
        )
    })
}

pub(crate) async fn save_traework_models(
    request: SaveTraeWorkModelsRequest,
) -> Result<SaveTraeWorkModelsOutcome, TraeErrorDto> {
    let paths = current_paths();
    let _guard = write_lock().lock().await;
    tokio::task::spawn_blocking(move || save_traework_models_at(&paths, &request))
        .await
        .map_err(|_| TraeErrorDto::new(TraeErrorCode::StateUnavailable))?
}

pub(crate) fn get_traework_model_ids_at(
    paths: &TraePaths,
) -> Result<TraeWorkModelIdsResult, TraeErrorDto> {
    let loaded = load_map(paths)?;
    let ids = project_custom_ids(&loaded.map)?;
    let truncated = ids.len() > MAX_MODELS;
    Ok(TraeWorkModelIdsResult {
        model_ids: ids.into_iter().take(MAX_MODELS).collect(),
        revision: loaded.revision,
        truncated,
    })
}

pub(crate) fn save_traework_models_at(
    paths: &TraePaths,
    request: &SaveTraeWorkModelsRequest,
) -> Result<SaveTraeWorkModelsOutcome, TraeErrorDto> {
    let selected = normalize_ids(&request.selected_model_ids);
    let removed = normalize_ids(&request.removed_model_ids);
    if selected
        .iter()
        .any(|id| removed.iter().any(|other| other == id))
    {
        return Err(TraeErrorDto::new(TraeErrorCode::InvalidModelConfig));
    }
    if selected.is_empty() && removed.is_empty() {
        return Err(TraeErrorDto::new(TraeErrorCode::ModelsNoTarget));
    }
    let credential = request.api_key.trim();
    if selected
        .iter()
        .any(|id| credential_matches_model_id(credential, id))
    {
        return Err(TraeErrorDto::new(TraeErrorCode::CredentialCollision));
    }
    if !selected.is_empty() {
        let admission = TraeModelConfigRequest::from_connection(
            request.api_format,
            request.url_mode,
            request.url.clone(),
            selected[0].clone(),
            request.api_key.clone(),
            request.allow_no_api_key,
            request.allow_loopback,
            request.allow_private_network,
        );
        super::traework::validate_model_request(admission)?;
    }

    let pending = request
        .overwrite_token
        .as_deref()
        .map(|token| consume_overwrite_token(token, request, &selected, &removed))
        .transpose()?;

    let mut loaded = load_map(paths)?;
    if request.expected_revision != loaded.revision {
        return Ok(SaveTraeWorkModelsOutcome::ConcurrentModification);
    }

    let existing = existing_custom_targets(&loaded.map, &selected, &removed)?;
    if let Some(pending) = pending {
        if pending.expected_revision != loaded.revision {
            return Ok(SaveTraeWorkModelsOutcome::ConcurrentModification);
        }
    } else if !existing.is_empty() {
        let token = issue_overwrite_token(request, &selected, &removed);
        return Ok(SaveTraeWorkModelsOutcome::OverwriteConfirmationRequired {
            token,
            existing_ids: existing,
        });
    }

    let (created, updated) = apply_custom_mutations(
        &mut loaded.map,
        &selected,
        &removed,
        &request.url,
        credential,
    )?;
    let serialized = serde_json::to_vec(&loaded.map)
        .map_err(|_| TraeErrorDto::new(TraeErrorCode::ModelsWriteFailed))?;
    if let Some(parent) = paths.backup.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|_| TraeErrorDto::new(TraeErrorCode::ModelsBackupFailed))?;
    }
    std::fs::write(&paths.backup, loaded.blob.as_deref().unwrap_or(b"{}"))
        .map_err(|_| TraeErrorDto::new(TraeErrorCode::ModelsBackupFailed))?;
    persist_map(paths, &loaded.key, &serialized)?;
    let ids = project_custom_ids(&loaded.map)?;
    Ok(SaveTraeWorkModelsOutcome::Saved {
        revision: revision_for(&serialized),
        model_count: ids.len(),
        created_entries: created,
        updated_entries: updated,
    })
}

struct LoadedMap {
    key: String,
    blob: Option<Vec<u8>>,
    revision: Option<String>,
    map: Value,
}

fn load_map(paths: &TraePaths) -> Result<LoadedMap, TraeErrorDto> {
    if !paths.db.exists() {
        return Ok(LoadedMap {
            key: default_map_key(),
            blob: None,
            revision: None,
            map: empty_map(),
        });
    }
    let connection = Connection::open(&paths.db)
        .map_err(|_| TraeErrorDto::new(TraeErrorCode::ModelsStoreUnavailable))?;
    let row = connection
        .query_row(
            &format!("SELECT key, value FROM {ITEM_TABLE} WHERE key LIKE ?1 ORDER BY key LIMIT 1"),
            params![format!("%{MAP_SUFFIX}")],
            |row| {
                let key: String = row.get(0)?;
                let value: Vec<u8> = row.get(1)?;
                Ok((key, value))
            },
        )
        .optional()
        .map_err(|_| TraeErrorDto::new(TraeErrorCode::ModelsStoreUnavailable))?;
    let Some((key, value)) = row else {
        return Ok(LoadedMap {
            key: default_map_key_from_connection(&connection).unwrap_or_else(default_map_key),
            blob: None,
            revision: None,
            map: empty_map(),
        });
    };
    let map = if value.is_empty() {
        empty_map()
    } else {
        serde_json::from_slice(&value)
            .map_err(|_| TraeErrorDto::new(TraeErrorCode::ModelsStoreUnavailable))?
    };
    if !map.is_object() {
        return Err(TraeErrorDto::new(TraeErrorCode::ModelsStoreUnavailable));
    }
    reject_secret_model_ids(&map)?;
    Ok(LoadedMap {
        revision: Some(revision_for(&value)),
        key,
        blob: Some(value),
        map,
    })
}

fn persist_map(paths: &TraePaths, key: &str, bytes: &[u8]) -> Result<(), TraeErrorDto> {
    std::fs::create_dir_all(&paths.directory)
        .map_err(|_| TraeErrorDto::new(TraeErrorCode::ModelsWriteFailed))?;
    let connection = Connection::open(&paths.db)
        .map_err(|_| TraeErrorDto::new(TraeErrorCode::ModelsWriteFailed))?;
    connection
        .execute(
            &format!(
                "CREATE TABLE IF NOT EXISTS {ITEM_TABLE} (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)"
            ),
            [],
        )
        .map_err(|_| TraeErrorDto::new(TraeErrorCode::ModelsWriteFailed))?;
    connection
        .execute(
            &format!("INSERT OR REPLACE INTO {ITEM_TABLE} (key, value) VALUES (?1, ?2)"),
            params![key, bytes],
        )
        .map_err(|_| TraeErrorDto::new(TraeErrorCode::ModelsWriteFailed))?;
    Ok(())
}

fn empty_map() -> Value {
    json!({ LITE_LIST: [], REMOTE_LIST: [] })
}

fn default_map_key() -> String {
    format!("fyagent:{MAP_SUFFIX}")
}

fn default_map_key_from_connection(connection: &Connection) -> Option<String> {
    let key: String = connection
        .query_row(
            &format!("SELECT key FROM {ITEM_TABLE} WHERE key LIKE '%:%' LIMIT 1"),
            [],
            |row| row.get(0),
        )
        .ok()?;
    let prefix = key.split_once(':')?.0;
    if prefix.is_empty() {
        return None;
    }
    Some(format!("{prefix}:{MAP_SUFFIX}"))
}

fn list_rows<'a>(map: &'a Value, name: &str) -> Result<&'a [Value], TraeErrorDto> {
    match map.get(name) {
        None => Ok(&[]),
        Some(Value::Array(rows)) => Ok(rows),
        Some(_) => Err(TraeErrorDto::new(TraeErrorCode::ModelsStoreUnavailable)),
    }
}

fn list_rows_mut<'a>(map: &'a mut Value, name: &str) -> Result<&'a mut Vec<Value>, TraeErrorDto> {
    let object = map
        .as_object_mut()
        .ok_or_else(|| TraeErrorDto::new(TraeErrorCode::ModelsStoreUnavailable))?;
    if !object.contains_key(name) {
        object.insert(name.to_string(), Value::Array(Vec::new()));
    }
    object
        .get_mut(name)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| TraeErrorDto::new(TraeErrorCode::ModelsStoreUnavailable))
}

fn row_model_id(row: &Value) -> Option<String> {
    ["custom_model_id", "name"].into_iter().find_map(|key| {
        row.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn is_preset_row(row: &Value) -> bool {
    row.get("is_preset").and_then(Value::as_bool) == Some(true)
}

fn document_secrets(map: &Value) -> Result<Vec<String>, TraeErrorDto> {
    let mut secrets = Vec::new();
    for name in [LITE_LIST, REMOTE_LIST] {
        for row in list_rows(map, name)? {
            for key in ["ak", "sk"] {
                if let Some(secret) = row
                    .get(key)
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                {
                    secrets.push(secret.to_string());
                }
            }
        }
    }
    Ok(secrets)
}

fn reject_secret_model_ids(map: &Value) -> Result<(), TraeErrorDto> {
    let secrets = document_secrets(map)?;
    for name in [LITE_LIST, REMOTE_LIST] {
        for row in list_rows(map, name)? {
            if is_preset_row(row) {
                continue;
            }
            if let Some(model_id) = row_model_id(row) {
                if secrets
                    .iter()
                    .any(|secret| credential_matches_model_id(secret, &model_id))
                {
                    return Err(TraeErrorDto::new(TraeErrorCode::CredentialCollision));
                }
            }
        }
    }
    Ok(())
}

fn project_custom_ids(map: &Value) -> Result<Vec<String>, TraeErrorDto> {
    reject_secret_model_ids(map)?;
    let mut seen = HashSet::new();
    let mut ids = Vec::new();
    for row in list_rows(map, LITE_LIST)? {
        if is_preset_row(row) {
            continue;
        }
        let Some(model_id) = row_model_id(row) else {
            continue;
        };
        if seen.insert(model_id.clone()) {
            ids.push(model_id);
        }
    }
    Ok(ids)
}

fn existing_custom_targets(
    map: &Value,
    selected: &[String],
    removed: &[String],
) -> Result<Vec<String>, TraeErrorDto> {
    let existing: HashSet<String> = project_custom_ids(map)?.into_iter().collect();
    let mut confirmation = Vec::new();
    let mut seen = HashSet::new();
    for id in selected.iter().chain(removed) {
        if existing.contains(id) && seen.insert(id.clone()) {
            confirmation.push(id.clone());
        }
    }
    Ok(confirmation)
}

fn first_work_preset(map: &Value) -> Result<Option<Value>, TraeErrorDto> {
    for name in [LITE_LIST, REMOTE_LIST] {
        for row in list_rows(map, name)? {
            if is_preset_row(row) && row.is_object() {
                return Ok(Some(row.clone()));
            }
        }
    }
    Ok(None)
}

fn fallback_template() -> Value {
    json!({
        "is_preset": false,
        "is_custom_base_url": true,
        "name": "",
        "display_name": "",
        "custom_model_id": "",
        "base_url": "",
        "ak": "",
        "sk": "",
        "is_default": false,
        "selectable": true,
        "status": true
    })
}

fn custom_row_from_template(
    template: &Value,
    model_id: &str,
    base_url: &str,
    api_key: &str,
) -> Value {
    let mut row = if template.is_object() {
        template.clone()
    } else {
        fallback_template()
    };
    let object = row
        .as_object_mut()
        .expect("custom TRAE row template is always an object");
    object.insert("is_preset".into(), json!(false));
    object.insert("is_custom_base_url".into(), json!(true));
    object.insert("name".into(), json!(model_id));
    object.insert("display_name".into(), json!(model_id));
    object.insert("custom_model_id".into(), json!(model_id));
    object.insert("base_url".into(), json!(base_url));
    object.insert("ak".into(), json!(api_key));
    object.insert("sk".into(), json!(""));
    object.insert("is_default".into(), json!(false));
    object.insert("selectable".into(), json!(true));
    object.insert("status".into(), json!(true));
    row
}

fn patch_custom_connection(row: &mut Value, base_url: &str, api_key: &str) {
    if let Some(object) = row.as_object_mut() {
        object.insert("base_url".into(), json!(base_url));
        object.insert("ak".into(), json!(api_key));
        object.insert("is_custom_base_url".into(), json!(true));
        object.insert("is_preset".into(), json!(false));
    }
}

fn apply_custom_mutations(
    map: &mut Value,
    selected: &[String],
    removed: &[String],
    base_url: &str,
    api_key: &str,
) -> Result<(usize, usize), TraeErrorDto> {
    let template = first_work_preset(map)?.unwrap_or_else(fallback_template);
    let removed_set: HashSet<&str> = removed.iter().map(String::as_str).collect();
    for name in [LITE_LIST, REMOTE_LIST] {
        let rows = list_rows_mut(map, name)?;
        rows.retain(|row| {
            if is_preset_row(row) {
                return true;
            }
            row_model_id(row)
                .map(|id| !removed_set.contains(id.as_str()))
                .unwrap_or(true)
        });
    }

    let existing_lite: HashSet<String> = project_custom_ids(map)?.into_iter().collect();
    let mut created = 0usize;
    let mut updated = 0usize;
    for model_id in selected {
        if existing_lite.contains(model_id) {
            updated += 1;
        } else {
            created += 1;
        }
        for name in [LITE_LIST, REMOTE_LIST] {
            let rows = list_rows_mut(map, name)?;
            if let Some(row) = rows.iter_mut().find(|row| {
                !is_preset_row(row) && row_model_id(row).as_deref() == Some(model_id.as_str())
            }) {
                patch_custom_connection(row, base_url, api_key);
            } else {
                rows.push(custom_row_from_template(
                    &template, model_id, base_url, api_key,
                ));
            }
        }
    }
    reject_secret_model_ids(map)?;
    Ok((created, updated))
}

fn project_fetched_models(
    models: Vec<super::model_fetch::FetchedModel>,
    api_key: &str,
) -> Result<FetchedModelList, TraeErrorDto> {
    let mut seen = HashSet::new();
    let mut projected = Vec::new();
    let mut truncated = false;
    for model in models {
        let id = model.id.trim().to_string();
        if id.is_empty() || !seen.insert(id.clone()) {
            continue;
        }
        if credential_matches_model_id(api_key, &id) {
            return Err(TraeErrorDto::new(TraeErrorCode::CredentialCollision));
        }
        if projected.len() >= MAX_MODELS {
            truncated = true;
            continue;
        }
        projected.push(FetchedModelRef {
            id,
            owned_by: model.owned_by,
        });
    }
    Ok(FetchedModelList {
        models: projected,
        truncated,
    })
}

fn normalize_ids(ids: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for raw in ids {
        let id = raw.trim();
        if id.is_empty() || !seen.insert(id.to_string()) {
            continue;
        }
        result.push(id.to_string());
    }
    result
}

fn credential_matches_model_id(credential: &str, model_id: &str) -> bool {
    let credential = credential.trim();
    !credential.is_empty() && model_id.trim().contains(credential)
}

fn issue_overwrite_token(
    request: &SaveTraeWorkModelsRequest,
    selected: &[String],
    removed: &[String],
) -> String {
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let pending = PendingOverwrite {
        request_digest: request_digest(request, selected, removed),
        expected_revision: request.expected_revision.clone(),
        expires_at: Instant::now() + OVERWRITE_TOKEN_TTL,
    };
    let mut pending_overwrites = lock_pending();
    let now = Instant::now();
    pending_overwrites.retain(|_, item| item.expires_at + OVERWRITE_TOKEN_EXPIRED_RETENTION > now);
    pending_overwrites.insert(token.clone(), pending);
    token
}

fn consume_overwrite_token(
    token: &str,
    request: &SaveTraeWorkModelsRequest,
    selected: &[String],
    removed: &[String],
) -> Result<PendingOverwrite, TraeErrorDto> {
    let pending = lock_pending()
        .remove(token)
        .ok_or_else(|| TraeErrorDto::new(TraeErrorCode::OverwriteTokenInvalid))?;
    if pending.expires_at <= Instant::now() {
        return Err(TraeErrorDto::new(TraeErrorCode::OverwriteTokenExpired));
    }
    if !constant_time_equals(
        &pending.request_digest,
        &request_digest(request, selected, removed),
    ) {
        return Err(TraeErrorDto::new(TraeErrorCode::OverwriteTokenInvalid));
    }
    Ok(pending)
}

fn lock_pending() -> std::sync::MutexGuard<'static, HashMap<String, PendingOverwrite>> {
    pending_overwrites()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn request_digest(
    request: &SaveTraeWorkModelsRequest,
    selected: &[String],
    removed: &[String],
) -> [u8; 32] {
    let mut mac = HmacSha256::new_from_slice(overwrite_mac_key())
        .expect("the fixed-size overwrite MAC key is always valid");
    mac.update(b"fyagent-trae-overwrite-v1");
    update_length_prefixed(&mut mac, request.url.trim().as_bytes());
    update_bool(&mut mac, request.allow_no_api_key);
    update_optional_string(&mut mac, request.expected_revision.as_deref());
    for id in selected {
        update_length_prefixed(&mut mac, id.as_bytes());
    }
    mac.update(&(selected.len() as u64).to_be_bytes());
    for id in removed {
        update_length_prefixed(&mut mac, id.as_bytes());
    }
    mac.update(&(removed.len() as u64).to_be_bytes());
    let api_key_digest = mac_bytes(api_key_mac_key(), request.api_key.as_bytes());
    update_length_prefixed(&mut mac, &api_key_digest);
    mac_bytes_from_mac(mac)
}

fn update_length_prefixed(mac: &mut HmacSha256, bytes: &[u8]) {
    mac.update(&(bytes.len() as u64).to_be_bytes());
    mac.update(bytes);
}

fn update_optional_string(mac: &mut HmacSha256, value: Option<&str>) {
    match value {
        Some(value) => {
            mac.update(&[1]);
            update_length_prefixed(mac, value.as_bytes());
        }
        None => mac.update(&[0]),
    }
}

fn update_bool(mac: &mut HmacSha256, value: bool) {
    mac.update(&[u8::from(value)]);
}

fn mac_bytes(key: &[u8; 32], bytes: &[u8]) -> [u8; 32] {
    let mut mac = HmacSha256::new_from_slice(key).expect("the fixed-size MAC key is always valid");
    mac.update(bytes);
    mac_bytes_from_mac(mac)
}

fn mac_bytes_from_mac(mac: HmacSha256) -> [u8; 32] {
    let bytes = mac.finalize().into_bytes();
    let mut output = [0u8; 32];
    output.copy_from_slice(&bytes);
    output
}

fn constant_time_equals(left: &[u8; 32], right: &[u8; 32]) -> bool {
    left.iter()
        .zip(right)
        .fold(0u8, |difference, (left, right)| difference | (left ^ right))
        == 0
}

fn revision_for(bytes: &[u8]) -> String {
    mac_bytes(revision_mac_key(), bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn revision_mac_key() -> &'static [u8; 32] {
    static KEY: OnceLock<[u8; 32]> = OnceLock::new();
    KEY.get_or_init(random_mac_key)
}

fn overwrite_mac_key() -> &'static [u8; 32] {
    static KEY: OnceLock<[u8; 32]> = OnceLock::new();
    KEY.get_or_init(random_mac_key)
}

fn api_key_mac_key() -> &'static [u8; 32] {
    static KEY: OnceLock<[u8; 32]> = OnceLock::new();
    KEY.get_or_init(random_mac_key)
}

fn random_mac_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    key[..16].copy_from_slice(Uuid::new_v4().as_bytes());
    key[16..].copy_from_slice(Uuid::new_v4().as_bytes());
    key
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn write_fixture(paths: &TraePaths, map: &Value) {
        std::fs::create_dir_all(&paths.directory).unwrap();
        let connection = Connection::open(&paths.db).unwrap();
        connection
            .execute(
                "CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO ItemTable (key, value) VALUES (?1, ?2)",
                params![
                    "machine:AI.agent.model.model_list_map",
                    serde_json::to_vec(map).unwrap()
                ],
            )
            .unwrap();
    }

    fn read_map(paths: &TraePaths) -> Value {
        let connection = Connection::open(&paths.db).unwrap();
        let bytes: Vec<u8> = connection
            .query_row(
                "SELECT value FROM ItemTable WHERE key LIKE '%AI.agent.model.model_list_map'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    fn preset_and_custom(custom_id: &str, secret: &str) -> Value {
        json!({
            "solo_work_lite": [
                {
                    "is_preset": true,
                    "name": "preset-lite",
                    "display_name": "Preset",
                    "custom_model_id": "preset-lite",
                    "base_url": "https://api.example.test/v1",
                    "ak": "PRESET-AK",
                    "sk": "PRESET-SK",
                    "selectable": true,
                    "status": true
                },
                {
                    "is_preset": false,
                    "name": custom_id,
                    "display_name": custom_id,
                    "custom_model_id": custom_id,
                    "base_url": "https://api.example.test/v1",
                    "ak": secret,
                    "sk": "",
                    "selectable": true,
                    "status": true
                }
            ],
            "solo_work_remote": [
                {
                    "is_preset": true,
                    "name": "preset-remote",
                    "display_name": "Preset",
                    "custom_model_id": "preset-remote",
                    "ak": "PRESET-AK",
                    "sk": "PRESET-SK"
                }
            ]
        })
    }

    fn save_request(
        revision: Option<String>,
        selected: &[&str],
        removed: &[&str],
    ) -> SaveTraeWorkModelsRequest {
        SaveTraeWorkModelsRequest {
            api_format: TraeApiFormat::OpenaiChatCompletions,
            url_mode: TraeUrlMode::BaseUrl,
            url: "https://gateway.example.test/v1".into(),
            api_key: "USER-TRAE-KEY".into(),
            allow_no_api_key: false,
            allow_loopback: false,
            allow_private_network: false,
            selected_model_ids: selected.iter().map(|id| (*id).to_string()).collect(),
            removed_model_ids: removed.iter().map(|id| (*id).to_string()).collect(),
            expected_revision: revision,
            overwrite_token: None,
        }
    }

    #[test]
    fn projects_secret_free_custom_ids_from_lite_only() {
        let temp = tempfile::TempDir::new().unwrap();
        let paths = TraePaths::from_home(temp.path());
        write_fixture(&paths, &preset_and_custom("custom-a", "USER-TRAE-KEY"));
        let ids = get_traework_model_ids_at(&paths).unwrap();
        assert_eq!(ids.model_ids, vec!["custom-a"]);
        let debug = format!("{ids:?}");
        let json = serde_json::to_string(&ids).unwrap();
        for secret in ["USER-TRAE-KEY", "PRESET-AK", "PRESET-SK"] {
            assert!(!debug.contains(secret));
            assert!(!json.contains(secret));
        }
    }

    #[test]
    fn fails_closed_when_custom_id_contains_document_secret() {
        let temp = tempfile::TempDir::new().unwrap();
        let paths = TraePaths::from_home(temp.path());
        write_fixture(&paths, &preset_and_custom("USER-TRAE-KEY", "USER-TRAE-KEY"));
        assert_eq!(
            get_traework_model_ids_at(&paths).unwrap_err().code,
            TraeErrorCode::CredentialCollision
        );
    }

    fn lite_custom<'a>(map: &'a Value, model_id: &str) -> &'a Value {
        map["solo_work_lite"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["custom_model_id"] == model_id)
            .unwrap()
    }

    #[test]
    fn save_adds_new_custom_to_both_lists_and_never_mutates_presets() {
        let temp = tempfile::TempDir::new().unwrap();
        let paths = TraePaths::from_home(temp.path());
        write_fixture(&paths, &preset_and_custom("custom-a", "OLD-KEY"));
        let revision = get_traework_model_ids_at(&paths).unwrap().revision;
        let request = save_request(revision, &["custom-b"], &[]);
        assert!(!format!("{request:?}").contains("USER-TRAE-KEY"));
        let outcome = save_traework_models_at(&paths, &request).unwrap();
        match &outcome {
            SaveTraeWorkModelsOutcome::Saved {
                created_entries,
                updated_entries,
                model_count,
                ..
            } => {
                assert_eq!(*created_entries, 1);
                assert_eq!(*updated_entries, 0);
                assert_eq!(*model_count, 2);
            }
            other => panic!("unexpected outcome: {other:?}"),
        }
        assert!(paths.backup.exists());
        let map = read_map(&paths);
        let lite = map["solo_work_lite"].as_array().unwrap();
        let remote = map["solo_work_remote"].as_array().unwrap();
        let preset = lite.iter().find(|row| row["is_preset"] == true).unwrap();
        assert_eq!(preset["ak"], "PRESET-AK");
        assert_eq!(preset["sk"], "PRESET-SK");
        assert_eq!(preset["name"], "preset-lite");
        assert!(remote.iter().any(|row| {
            row["is_preset"] == true
                && row["name"] == "preset-remote"
                && row["ak"] == "PRESET-AK"
                && row["sk"] == "PRESET-SK"
        }));
        let lite_b = lite_custom(&map, "custom-b");
        let remote_b = remote
            .iter()
            .find(|row| row["custom_model_id"] == "custom-b")
            .unwrap();
        assert_eq!(lite_b["is_preset"], false);
        assert_eq!(lite_b["is_custom_base_url"], true);
        assert_eq!(lite_b["ak"], "USER-TRAE-KEY");
        assert_eq!(lite_b["sk"], "");
        assert_eq!(lite_b["base_url"], "https://gateway.example.test/v1");
        assert_eq!(remote_b["ak"], "USER-TRAE-KEY");
        assert_eq!(remote_b["sk"], "");
        let ids = get_traework_model_ids_at(&paths).unwrap();
        assert_eq!(ids.model_ids, vec!["custom-a", "custom-b"]);
        let debug = format!("{ids:?} {outcome:?}");
        assert!(!debug.contains("USER-TRAE-KEY"));
        assert!(!debug.contains("OLD-KEY"));
        assert!(!debug.contains("PRESET-AK"));
    }

    #[test]
    fn updating_existing_custom_requires_overwrite_then_writes_both_lists() {
        let temp = tempfile::TempDir::new().unwrap();
        let paths = TraePaths::from_home(temp.path());
        write_fixture(&paths, &preset_and_custom("custom-a", "OLD-KEY"));
        let revision = get_traework_model_ids_at(&paths).unwrap().revision;
        let first =
            save_traework_models_at(&paths, &save_request(revision.clone(), &["custom-a"], &[]))
                .unwrap();
        let SaveTraeWorkModelsOutcome::OverwriteConfirmationRequired {
            token,
            existing_ids,
        } = first
        else {
            panic!("expected overwrite confirmation: {first:?}");
        };
        assert_eq!(existing_ids, vec!["custom-a"]);
        let mut confirmed = save_request(revision, &["custom-a"], &[]);
        confirmed.overwrite_token = Some(token);
        let saved = save_traework_models_at(&paths, &confirmed).unwrap();
        match saved {
            SaveTraeWorkModelsOutcome::Saved {
                updated_entries, ..
            } => assert_eq!(updated_entries, 1),
            other => panic!("unexpected outcome: {other:?}"),
        }
        let map = read_map(&paths);
        assert_eq!(lite_custom(&map, "custom-a")["ak"], "USER-TRAE-KEY");
        assert_eq!(
            map["solo_work_remote"]
                .as_array()
                .unwrap()
                .iter()
                .find(|row| row["custom_model_id"] == "custom-a")
                .unwrap()["ak"],
            "USER-TRAE-KEY"
        );
        let preset = map["solo_work_lite"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["is_preset"] == true)
            .unwrap();
        assert_eq!(preset["ak"], "PRESET-AK");
        assert_eq!(preset["sk"], "PRESET-SK");
    }

    #[test]
    fn delete_existing_custom_requires_overwrite_and_leaves_presets() {
        let temp = tempfile::TempDir::new().unwrap();
        let paths = TraePaths::from_home(temp.path());
        write_fixture(&paths, &preset_and_custom("custom-a", "OLD-KEY"));
        let revision = get_traework_model_ids_at(&paths).unwrap().revision;
        let first =
            save_traework_models_at(&paths, &save_request(revision.clone(), &[], &["custom-a"]))
                .unwrap();
        let SaveTraeWorkModelsOutcome::OverwriteConfirmationRequired {
            token,
            existing_ids,
        } = first
        else {
            panic!("expected overwrite confirmation: {first:?}");
        };
        assert_eq!(existing_ids, vec!["custom-a"]);
        let mut confirmed = save_request(revision, &[], &["custom-a"]);
        confirmed.overwrite_token = Some(token);
        let saved = save_traework_models_at(&paths, &confirmed).unwrap();
        match saved {
            SaveTraeWorkModelsOutcome::Saved { model_count, .. } => assert_eq!(model_count, 0),
            other => panic!("unexpected outcome: {other:?}"),
        }
        let map = read_map(&paths);
        assert!(map["solo_work_lite"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| row["is_preset"] == true || row["custom_model_id"] != "custom-a"));
        assert!(map["solo_work_lite"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["is_preset"] == true && row["ak"] == "PRESET-AK"));
    }

    #[test]
    fn stale_revision_is_concurrent_modification() {
        let temp = tempfile::TempDir::new().unwrap();
        let paths = TraePaths::from_home(temp.path());
        write_fixture(&paths, &preset_and_custom("custom-a", "OLD-KEY"));
        let outcome = save_traework_models_at(
            &paths,
            &save_request(Some("stale-revision".into()), &["custom-b"], &[]),
        )
        .unwrap();
        assert_eq!(outcome, SaveTraeWorkModelsOutcome::ConcurrentModification);
    }

    #[test]
    fn save_request_debug_redacts_secrets() {
        let request = save_request(Some("rev".into()), &["custom-b"], &[]);
        let debug = format!("{request:?}");
        assert!(!debug.contains("USER-TRAE-KEY"));
        assert!(!debug.contains("gateway.example.test"));
        assert!(!debug.contains("custom-b"));
    }
}
