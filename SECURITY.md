# Security Policy

## Reporting a Vulnerability

Please report security issues privately before opening a public issue. If the GitHub repository is public, use GitHub's private vulnerability reporting when available. Otherwise, contact the repository owner directly and include reproduction steps, affected versions, and the expected impact.

## Local API Key Storage

Provider API keys are stored in the native OS credential vault: Windows Credential Manager or macOS Keychain. The SQLite database stores settings and masked credential hints, not plaintext provider keys.

Existing plaintext credentials from older versions are migrated to the credential vault and removed from SQLite on first launch. Treat copied databases, backups, exported assets, and logs as private user data and review them before attaching anything to a public issue.

## Supported Versions

Security fixes are provided for the latest published version and on the `main` branch.
