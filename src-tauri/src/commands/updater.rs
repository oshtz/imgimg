use std::{env, fs, process::Command};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::{AppError, AppResult};

const GITHUB_LATEST_RELEASE_API: &str = "https://api.github.com/repos/oshtz/imgimg/releases/latest";
const PORTABLE_ASSET_NAME: &str = "imgimg-Portable.exe";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub platform: String,
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: env!("CARGO_PKG_NAME").to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: portable_platform_label().to_string(),
    }
}

fn portable_platform_label() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "windows-portable"
    }

    #[cfg(not(target_os = "windows"))]
    {
        "portable"
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableUpdateStatus {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub release_url: Option<String>,
    pub asset_name: Option<String>,
    pub download_url: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[tauri::command]
pub async fn check_portable_update() -> AppResult<PortableUpdateStatus> {
    check_portable_update_from(GITHUB_LATEST_RELEASE_API, env!("CARGO_PKG_VERSION")).await
}

async fn check_portable_update_from(
    latest_release_url: &str,
    current_version: &str,
) -> AppResult<PortableUpdateStatus> {
    let release = reqwest::Client::new()
        .get(latest_release_url)
        .header(reqwest::header::USER_AGENT, "imgimg-portable-updater")
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await?
        .error_for_status()?
        .json::<GitHubRelease>()
        .await?;

    let latest_version = normalize_version(&release.tag_name);
    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name == PORTABLE_ASSET_NAME)
        .or_else(|| {
            release.assets.iter().find(|asset| {
                let name = asset.name.to_ascii_lowercase();
                name.ends_with(".exe") && name.contains("portable")
            })
        });

    let update_available = is_newer_version(&latest_version, current_version);

    Ok(PortableUpdateStatus {
        current_version: current_version.to_string(),
        latest_version: Some(latest_version),
        update_available: update_available && asset.is_some(),
        release_url: Some(release.html_url),
        asset_name: asset.map(|asset| asset.name.clone()),
        download_url: asset.map(|asset| asset.browser_download_url.clone()),
        body: release.body,
    })
}

#[tauri::command]
pub async fn install_portable_update(app: AppHandle, download_url: String) -> AppResult<()> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        let _ = download_url;
        return Err(AppError::BadRequest(
            "Portable self-update is only supported on Windows".to_string(),
        ));
    }

    #[cfg(target_os = "windows")]
    {
        if !download_url.starts_with("https://github.com/oshtz/imgimg/releases/download/") {
            return Err(AppError::BadRequest(
                "Update download URL must be an imgimg GitHub release asset".to_string(),
            ));
        }

        let current_exe = env::current_exe()?;
        let update_path = env::temp_dir().join("imgimg-Portable-update.exe");
        let script_path = env::temp_dir().join("imgimg-portable-update.cmd");

        let bytes = reqwest::Client::new()
            .get(&download_url)
            .header(reqwest::header::USER_AGENT, "imgimg-portable-updater")
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?;

        fs::write(&update_path, &bytes)?;

        let pid = std::process::id();
        let script = portable_update_script(
            &pid.to_string(),
            &update_path.to_string_lossy(),
            &current_exe.to_string_lossy(),
        );
        fs::write(&script_path, script)?;

        Command::new("cmd")
            .args(["/C", "start", "", "/MIN"])
            .arg(&script_path)
            .spawn()
            .map_err(|err| AppError::Internal(format!("Failed to launch updater script: {err}")))?;

        app.exit(0);
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn portable_update_script(pid: &str, update_path: &str, target_path: &str) -> String {
    format!(
        r#"@echo off
set "PID={pid}"
set "UPDATE={update_path}"
set "TARGET={target_path}"
:wait
for /f "tokens=2" %%P in ('tasklist /fi "PID eq %PID%" /nh 2^>nul') do (
  if "%%P"=="%PID%" (
    timeout /t 1 /nobreak >nul
    goto wait
  )
)
copy /Y "%UPDATE%" "%TARGET%"
if errorlevel 1 exit /b 1
start "" "%TARGET%"
del "%UPDATE%" >nul 2>nul
del "%~f0" >nul 2>nul
"#
    )
}

fn normalize_version(value: &str) -> String {
    value
        .trim()
        .trim_start_matches('v')
        .trim_start_matches('V')
        .to_string()
}

fn is_newer_version(candidate: &str, current: &str) -> bool {
    let candidate_parts = parse_version_parts(candidate);
    let current_parts = parse_version_parts(current);

    for idx in 0..candidate_parts.len().max(current_parts.len()) {
        let candidate_part = candidate_parts.get(idx).copied().unwrap_or(0);
        let current_part = current_parts.get(idx).copied().unwrap_or(0);
        if candidate_part > current_part {
            return true;
        }
        if candidate_part < current_part {
            return false;
        }
    }

    false
}

fn parse_version_parts(value: &str) -> Vec<u64> {
    normalize_version(value)
        .split(|ch| ch == '.' || ch == '-')
        .filter_map(|part| part.parse::<u64>().ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{is_newer_version, normalize_version};

    #[test]
    fn normalize_version_removes_v_prefix() {
        assert_eq!(normalize_version("v0.2.0"), "0.2.0");
        assert_eq!(normalize_version("V1.0.0"), "1.0.0");
    }

    #[test]
    fn version_compare_detects_newer_versions() {
        assert!(is_newer_version("0.2.0", "0.1.9"));
        assert!(is_newer_version("0.10.0", "0.9.9"));
        assert!(!is_newer_version("0.1.0", "0.1.0"));
        assert!(!is_newer_version("0.1.0", "0.2.0"));
    }
}
