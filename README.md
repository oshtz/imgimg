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

API keys are configured in-app under Settings -> Providers.

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
npm run test:rust   # src-tauri (cargo test)
npm run test:all    # both
```

## Security and Local Data

imgimg stores settings, generated asset metadata, workflows, and provider API keys in the app's per-user SQLite database. API keys are masked in the UI, but they are not stored in an OS keychain or encrypted at rest yet, so treat the app data directory as sensitive and do not commit copied databases or logs.

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

## Packaging

The npm packages are marked `private` to prevent accidental npm publication. The repository source is MIT licensed; desktop builds are produced through Tauri.
