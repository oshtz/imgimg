# imgimg Webview (React/Vite)

## Tech

- React + Vite + TypeScript
- TailwindCSS (dark-mode UI)

## Local dev

The supported development path is from the repository root:

```bash
npm run install:all
npm run tauri:dev
```

The web package is the Tauri webview frontend. Backend calls go through Tauri
IPC via `web/src/client.ts` and `web/src/tauri-api.ts`; no separate backend
process is needed for normal development.

`VITE_API_BASE_URL` is only kept for legacy web-mode/storage URL compatibility.
