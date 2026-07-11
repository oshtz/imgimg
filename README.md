# imgimg

Tauri 2 desktop app for AI image, video, and audio generation. Local ComfyUI workflows plus cloud providers, with a built-in gallery, canvas, and prompt enhancement.

## Stack

- **Desktop shell**: Tauri 2
- **Backend**: Rust (`src-tauri/`) - all generation, storage, and provider logic
- **Frontend**: React + Vite + Tailwind (`web/`)
- **Data**: SQLite, stored in the app's per-user data directory

## Providers

- **ComfyUI** - local GPU generation via a running ComfyUI instance
- **OpenRouter** - cloud image generation + prompt enhancement
- **Replicate** - cloud image / video / audio
- **FAL** - cloud image / video / audio
- **Kie** - cloud generation

API keys are configured in-app under Settings → API Keys and stored in the native OS credential vault (Windows Credential Manager or macOS Keychain).

## Prerequisites

- [Node.js](https://nodejs.org/) 24+
- [Rust](https://www.rust-lang.org/tools/install) toolchain + [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform
- *(Optional)* [ComfyUI](https://github.com/comfyanonymous/ComfyUI) running locally if you want local generation

## Quick Start

```bash
# Install root and web dependencies (Rust crates fetch on first cargo build)
npm run install:all

# Run the desktop app in dev mode
npm run tauri:dev

# Produce a release bundle for the current platform
npm run tauri:build
```

## Tests

```bash
npm run test        # web (vitest)
npm run test:coverage # web coverage with enforced thresholds
npm run test:rust   # src-tauri (cargo test)
npm run test:all    # both
npm run check:versions # package/Cargo/Tauri version alignment
```

## Security and Local Data

imgimg stores settings, generation metadata, workflows, canvas state, Iterate threads, and Audio Desk metadata in the app's per-user SQLite database. Provider API keys are stored separately in the native OS credential vault; Tauri commands return only presence flags and masked hints.

Generated assets use immutable UUID filenames and atomic `.part` writes. SQLite migrations are versioned and create a consistent database backup before upgrading an existing schema. Treat the app data directory, exported archives, backups, and logs as private user data.

Generated media stays local unless you send a generation request to a configured cloud provider. Cloud provider requests are governed by that provider's own terms and data handling.

## Project Structure

```
src-tauri/    Rust backend (Tauri commands, SQLite, provider clients)
web/          React + Vite frontend
workflows/    Bundled generic workflow templates (see below)
scripts/      Dev helper scripts
```

## Workflows

Generic workflow templates bundled with the app (copied into the Tauri bundle as resources):

- `replicate-image.json`, `replicate-video.json`, `replicate-audio.json`
- `fal-image.json`, `fal-video.json`, `fal-audio.json`
- `openrouter-image.json`

User-authored and ComfyUI workflows are managed at runtime from the app's data directory. See [`workflows/README.md`](workflows/README.md) for template format, injection tokens, and metadata.

## Packaging and releases

The npm packages are marked `private` to prevent accidental npm publication. Desktop releases are produced only from `v*` tags or an explicit manual workflow run. Release CI verifies tests, coverage, dependency audits, version alignment, Windows Authenticode signatures, macOS signing/notarization, SHA-256 checksums, and SBOM generation before publishing artifacts to an existing tag. The workflow never creates or force-moves Git tags.

The app does not self-replace or execute downloaded updates. Users install newer signed builds from [GitHub Releases](https://github.com/oshtz/imgimg/releases).

Release secrets:

- Windows: `WINDOWS_CERTIFICATE_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD`
- macOS: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`
