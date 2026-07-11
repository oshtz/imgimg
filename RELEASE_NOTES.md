# imgimg v0.2.0

This release hardens imgimg for public beta use while keeping generation data local by default.

## Security

- Provider API keys now live in Windows Credential Manager or macOS Keychain instead of SQLite.
- Tauri permissions, content security policy, storage paths, and provider endpoint validation are tightened.
- Provider settings expose only presence flags and masked hints to the frontend.

## Reliability

- Generation work now uses a bounded, cancellable queue with race-safe terminal states.
- Asset downloads are streamed with size limits, immutable filenames, atomic writes, and transactional activation.
- SQLite schema migrations are versioned and create a pre-migration database backup before upgrading existing data.
- Gallery and recent-generation queries are bounded and batch-load assets.

## Product behavior

- Provider status distinguishes unconfigured, configured-but-unverified, and verified states.
- Failed workflow/model loads preserve the last good state and expose retry actions.
- Generation cancellation, retry, destructive confirmations, canvas save recovery, and keyboard accessibility are improved.
- Iterate threads and Audio Desk metadata now persist in SQLite.

## Distribution and upgrade

- Windows is distributed as an unsigned x64 `imgimg-Portable.exe`. Windows SmartScreen or antivirus software may warn about unsigned packed executables; verify the published SHA-256 checksum before running it.
- macOS is distributed as a signed and notarized Apple Silicon DMG.
- Automatic self-update behavior has been removed. Download new versions from GitHub Releases.
- First launch upgrades the local database to schema v3 and keeps a pre-migration backup in the app data directory.
