use std::collections::HashMap;

use serde::{Deserialize, Deserializer, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::providers::{canvas_agent, common::bearer_headers, prompt_enhancer};
use crate::state::AppState;
use crate::stores::admin_settings::{self, AdminSettings};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminSettingsView {
    #[serde(flatten)]
    settings: AdminSettings,
    openrouter_api_key_present: bool,
    openrouter_api_key_hint: Option<String>,
    replicate_api_key_present: bool,
    replicate_api_key_hint: Option<String>,
    fal_api_key_present: bool,
    fal_api_key_hint: Option<String>,
    kie_api_key_present: bool,
    kie_api_key_hint: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AdminSettingsPatch {
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    openrouter_api_key: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    replicate_api_key: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    fal_api_key: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    kie_api_key: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    admin_emails: Option<Option<Vec<String>>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    allowed_email_domains: Option<Option<Vec<String>>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    comfy_base_urls: Option<Option<Vec<String>>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    canvas_agent_model: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    canvas_agent_system_prompt: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    canvas_agent_temperature: Option<Option<f64>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    prompt_enhancer_model: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    prompt_enhancer_system_prompt: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    inpaint_workflow_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    outpaint_workflow_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    rembg_workflow_id: Option<Option<String>>,
}

fn deserialize_optional_field<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

async fn admin_settings_view(state: &AppState) -> AppResult<AdminSettingsView> {
    let settings = admin_settings::get_settings(&state.db).await?;
    let openrouter = admin_settings::credential_summary("openrouter").await?;
    let replicate = admin_settings::credential_summary("replicate").await?;
    let fal = admin_settings::credential_summary("fal").await?;
    let kie = admin_settings::credential_summary("kie").await?;

    Ok(AdminSettingsView {
        settings,
        openrouter_api_key_present: openrouter.present,
        openrouter_api_key_hint: openrouter.hint,
        replicate_api_key_present: replicate.present,
        replicate_api_key_hint: replicate.hint,
        fal_api_key_present: fal.present,
        fal_api_key_hint: fal.hint,
        kie_api_key_present: kie.present,
        kie_api_key_hint: kie.hint,
    })
}

#[tauri::command]
pub async fn get_admin_settings(state: State<'_, AppState>) -> AppResult<AdminSettingsView> {
    admin_settings_view(&state).await
}

#[tauri::command]
pub async fn update_admin_settings(
    state: State<'_, AppState>,
    settings: AdminSettingsPatch,
) -> AppResult<AdminSettingsView> {
    if let Some(value) = settings.openrouter_api_key {
        admin_settings::set_provider_api_key("openrouter", value).await?;
    }
    if let Some(value) = settings.replicate_api_key {
        admin_settings::set_provider_api_key("replicate", value).await?;
    }
    if let Some(value) = settings.fal_api_key {
        admin_settings::set_provider_api_key("fal", value).await?;
    }
    if let Some(value) = settings.kie_api_key {
        admin_settings::set_provider_api_key("kie", value).await?;
    }

    let mut current = admin_settings::get_settings(&state.db).await?;
    if let Some(value) = settings.admin_emails {
        current.admin_emails = value;
    }
    if let Some(value) = settings.allowed_email_domains {
        current.allowed_email_domains = value;
    }
    if let Some(value) = settings.comfy_base_urls {
        current.comfy_base_urls = value;
    }
    if let Some(value) = settings.canvas_agent_model {
        current.canvas_agent_model = value;
    }
    if let Some(value) = settings.canvas_agent_system_prompt {
        current.canvas_agent_system_prompt = value;
    }
    if let Some(value) = settings.canvas_agent_temperature {
        current.canvas_agent_temperature = value;
    }
    if let Some(value) = settings.prompt_enhancer_model {
        current.prompt_enhancer_model = value;
    }
    if let Some(value) = settings.prompt_enhancer_system_prompt {
        current.prompt_enhancer_system_prompt = value;
    }
    if let Some(value) = settings.inpaint_workflow_id {
        current.inpaint_workflow_id = value;
    }
    if let Some(value) = settings.outpaint_workflow_id {
        current.outpaint_workflow_id = value;
    }
    if let Some(value) = settings.rembg_workflow_id {
        current.rembg_workflow_id = value;
    }
    admin_settings::save_settings(&state.db, &current).await?;

    admin_settings_view(&state).await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialVerificationState {
    Verified,
    ConfiguredUnverified,
    Invalid,
    Unreachable,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialVerification {
    state: CredentialVerificationState,
    message: Option<String>,
}

#[tauri::command]
pub async fn verify_provider_credential(
    state: State<'_, AppState>,
    provider: String,
    candidate: String,
) -> AppResult<CredentialVerification> {
    let candidate = candidate.trim().to_string();
    if candidate.is_empty() {
        return Err(AppError::BadRequest("API key cannot be empty".into()));
    }

    let verification_url = match provider.as_str() {
        "openrouter" => Some(format!(
            "{}/key",
            state.config.openrouter_base_url.trim_end_matches('/')
        )),
        "replicate" => Some("https://api.replicate.com/v1/account".into()),
        "fal" | "kie" => None,
        _ => return Err(AppError::BadRequest("Unknown provider".into())),
    };

    let Some(url) = verification_url else {
        admin_settings::set_provider_api_key(provider_account(&provider)?, Some(candidate)).await?;
        return Ok(CredentialVerification {
            state: CredentialVerificationState::ConfiguredUnverified,
            message: Some(
                "Saved securely; this provider has no non-billable verification endpoint.".into(),
            ),
        });
    };

    let headers = match bearer_headers(&candidate) {
        Ok(headers) => headers,
        Err(_) => {
            return Ok(CredentialVerification {
                state: CredentialVerificationState::Invalid,
                message: Some("The credential format is invalid.".into()),
            })
        }
    };
    let response = state
        .http_client
        .get(url)
        .headers(headers)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await;

    match response {
        Ok(response) if response.status().is_success() => {
            admin_settings::set_provider_api_key(provider_account(&provider)?, Some(candidate))
                .await?;
            Ok(CredentialVerification {
                state: CredentialVerificationState::Verified,
                message: None,
            })
        }
        Ok(response)
            if response.status() == reqwest::StatusCode::UNAUTHORIZED
                || response.status() == reqwest::StatusCode::FORBIDDEN =>
        {
            Ok(CredentialVerification {
                state: CredentialVerificationState::Invalid,
                message: Some("The provider rejected this credential.".into()),
            })
        }
        Ok(response) => Ok(CredentialVerification {
            state: CredentialVerificationState::Unreachable,
            message: Some(format!(
                "The provider returned HTTP {}; try again later.",
                response.status().as_u16()
            )),
        }),
        Err(_) => Ok(CredentialVerification {
            state: CredentialVerificationState::Unreachable,
            message: Some(
                "The provider could not be reached; the credential was not saved.".into(),
            ),
        }),
    }
}

fn provider_account(provider: &str) -> AppResult<&'static str> {
    match provider {
        "openrouter" => Ok("openrouter"),
        "replicate" => Ok("replicate"),
        "fal" => Ok("fal"),
        "kie" => Ok("kie"),
        _ => Err(AppError::BadRequest("Unknown provider".into())),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureWorkflowConfig {
    pub inpaint_workflow_id: Option<String>,
    pub outpaint_workflow_id: Option<String>,
    pub rembg_workflow_id: Option<String>,
}

#[tauri::command]
pub async fn get_feature_workflow_config(
    state: State<'_, AppState>,
) -> AppResult<FeatureWorkflowConfig> {
    let settings = admin_settings::get_settings(&state.db).await?;
    Ok(FeatureWorkflowConfig {
        inpaint_workflow_id: settings.inpaint_workflow_id,
        outpaint_workflow_id: settings.outpaint_workflow_id,
        rembg_workflow_id: settings.rembg_workflow_id,
    })
}

#[tauri::command]
pub async fn get_default_system_prompts() -> AppResult<HashMap<String, String>> {
    let mut prompts = HashMap::new();
    prompts.insert(
        "canvasAgent".to_string(),
        canvas_agent::default_system_prompt().to_string(),
    );
    prompts.insert(
        "promptEnhancer".to_string(),
        prompt_enhancer::default_system_prompt().to_string(),
    );
    Ok(prompts)
}

#[cfg(test)]
mod tests {
    use super::AdminSettingsPatch;

    #[test]
    fn settings_patch_distinguishes_keep_set_and_clear() {
        let keep: AdminSettingsPatch = serde_json::from_str("{}").unwrap();
        let set: AdminSettingsPatch =
            serde_json::from_str(r#"{"openrouterApiKey":"secret"}"#).unwrap();
        let clear: AdminSettingsPatch =
            serde_json::from_str(r#"{"openrouterApiKey":null}"#).unwrap();

        assert!(keep.openrouter_api_key.is_none());
        assert_eq!(set.openrouter_api_key, Some(Some("secret".into())));
        assert_eq!(clear.openrouter_api_key, Some(None));
    }
}
