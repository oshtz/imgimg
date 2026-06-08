# Security Policy

## Reporting a Vulnerability

Please report security issues privately before opening a public issue. If the GitHub repository is public, use GitHub's private vulnerability reporting when available. Otherwise, contact the repository owner directly and include reproduction steps, affected versions, and the expected impact.

## Local API Key Storage

Provider API keys are saved in imgimg's per-user SQLite database so the desktop app can run without a separate backend. Keys are masked in the UI, but they are not stored in an OS keychain or encrypted at rest yet.

Treat the app data directory, copied databases, backups, and logs as sensitive. Do not attach them to public issues unless you have removed secrets first.

## Supported Versions

Security fixes are currently made on the `main` branch until the project publishes a versioned support policy.
