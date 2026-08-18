//! Narrow IPC commands for TRAE model preflight and external MCP validation.

use serde_json::Value;
use tauri::State;

use uuid::Uuid;

use crate::services::traework::{
    self, ExternalMcpAgentId, TraeEndpointCancelResult, TraeEndpointProbeResult,
    TraeEndpointProbeState, TraeEndpointProbeTerminalState, TraeErrorCode, TraeErrorDto,
    TraeMcpValidationResult, TraeModelConfigRequest,
};
use crate::services::traework_models::{
    self, FetchTraeWorkModelsRequest, FetchedModelList, SaveTraeWorkModelsOutcome,
    SaveTraeWorkModelsRequest, TraeWorkModelIdsResult,
};

#[tauri::command(rename_all = "camelCase")]
pub async fn validate_traework_model_config(
    request: TraeModelConfigRequest,
) -> Result<TraeEndpointProbeResult, TraeErrorDto> {
    traework::validate_traework_model_config(request)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn test_traework_model_endpoint(
    request_id: String,
    request: TraeModelConfigRequest,
    state: State<'_, TraeEndpointProbeState>,
) -> Result<TraeEndpointProbeResult, TraeErrorDto> {
    // Registration is an RAII guard: duplicate IDs fail before validation and
    // every return, cancellation, timeout, or unwind removes the active token.
    let registration = state.register(&request_id)?;
    traework::test_traework_model_endpoint(
        registration.request_id(),
        request,
        registration.cancellation(),
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn cancel_traework_model_endpoint(
    request_id: String,
    state: State<'_, TraeEndpointProbeState>,
) -> Result<TraeEndpointCancelResult, TraeErrorDto> {
    state.cancel(&request_id)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_traework_model_ids() -> Result<TraeWorkModelIdsResult, TraeErrorDto> {
    traework_models::get_traework_model_ids().await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn fetch_traework_models(
    request: FetchTraeWorkModelsRequest,
) -> Result<FetchedModelList, TraeErrorDto> {
    traework_models::fetch_traework_models(request).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn save_traework_models(
    request: SaveTraeWorkModelsRequest,
    state: State<'_, TraeEndpointProbeState>,
) -> Result<SaveTraeWorkModelsOutcome, TraeErrorDto> {
    if let Some(probe_request) = traework_models::probe_request_for_save(&request) {
        let request_id = Uuid::new_v4().hyphenated().to_string();
        let registration = state.register(&request_id)?;
        let result = traework::test_traework_model_endpoint(
            registration.request_id(),
            probe_request,
            registration.cancellation(),
        )
        .await?;
        if result.state != TraeEndpointProbeTerminalState::Reachable {
            return Err(TraeErrorDto::new(TraeErrorCode::SaveProbeRejected));
        }
    }
    traework_models::save_traework_models(request).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn validate_external_mcp_config(
    agent_id: ExternalMcpAgentId,
    config: Value,
) -> Result<TraeMcpValidationResult, TraeErrorDto> {
    traework::validate_external_mcp_config(agent_id, config)
}
