# Onboarding & First-Time User Experience

How a new user goes from "just installed" to "first generation" without reading docs.

## Goals

1. Zero-prior-experience user can generate within ~2 minutes of first launch.
2. Learning happens in context — no required reading.
3. Power users are never slowed down; every onboarding surface is skippable/dismissable.
4. Sidebar only shows workflows the user can actually run.

---

## Shipped Current State

### Generic, dynamic-model workflows for all cloud providers

All seven generic workflows live in `workflows/` and are inlined into `web/src/lib/onboarding.ts` for first-launch insertion:

| Workflow | Provider | Output | `dynamicModel` |
|----------|----------|--------|----------------|
| `replicate-image.json` | Replicate | Image | true |
| `replicate-video.json` | Replicate | Video | true |
| `replicate-audio.json` | Replicate | Audio | true |
| `fal-image.json` | FAL | Image | true |
| `fal-video.json` | FAL | Video | true |
| `fal-audio.json` | FAL | Audio | true |
| `openrouter-image.json` | OpenRouter | Image | true |

ComfyUI workflows are user-created and never shipped. KIE has no model discovery and is not shipped. Old hardcoded variants (`openrouter-gemini-image*.json`, `openrouter-preset-studio.json`, `kie-flux-kontext.json`) have been removed.

### Backend dynamic model dispatch

Both FAL and OpenRouter resolve the model at generation time (mirroring Replicate's existing flow):

- `src-tauri/src/providers/fal_proxy.rs` — accepts dynamic FAL endpoint id.
- `src-tauri/src/providers/openrouter_proxy.rs` — accepts dynamic OpenRouter model.
- `src-tauri/src/providers/generation_dispatch.rs` — `fal_model` / `openrouter_model` parameters wired through the dispatch path.
- `src-tauri/src/providers/model_discovery.rs` + `src-tauri/src/commands/models.rs` — model discovery + parameter fetch for both providers.
- `CreateGenerationInput` exposes `fal_model` and `openrouter_model`.

### Frontend onboarding surfaces

- `web/src/components/onboarding/WelcomeWizard.tsx` — multi-step first-launch modal (welcome → provider keys → ready) with all wizard steps inlined in this component (no separate `ProviderSetupStep` / `CompletionStep` files).
- `web/src/components/onboarding/OnboardingTooltip.tsx` — one-time, dismissable tooltips, keyed by hint id.
- `web/src/components/onboarding/DiscoveryDot.tsx` — pulsing indicator for unexplored features.
- `web/src/lib/onboarding.ts` — bundled workflow loader + state helpers (`isOnboardingCompleted`, `areBundledWorkflowsLoaded`, `isFirstGenCompleted`, hint/feature flags).
- Tests at `web/src/lib/__tests__/onboarding.test.ts`.

### Visibility logic

`Sidebar.tsx` hides (does not gray out) any workflow whose provider is missing an API key, explicitly disabled, or flagged unavailable. Filter logic:

```ts
const isHidden = w.providerAvailable === false ||
  (enabledProviders != null && w.engine != null && enabledProviders[w.engine] === false);
if (isHidden) return null;
```

Workflows still get inserted into the DB on first launch — they appear automatically as the user adds keys.

### localStorage keys

| Key | Purpose |
|-----|---------|
| `imgimg.onboarding.completed` | Wizard finished or skipped |
| `imgimg.onboarding.workflowsLoaded` | Bundled workflows inserted (prevents duplicates) |
| `imgimg.onboarding.firstGenCompleted` | First successful generation occurred |
| `imgimg.onboarding.hints.{hintId}` | Per-hint dismissal |
| `imgimg.onboarding.explored.{feature}` | Per-feature discovery dot dismissal |

---

## Implementation Notes

**Bundled workflows have two representations.** `web/src/lib/onboarding.ts` carries the seven workflow definitions as JS objects and inserts them via `tauri.upsertWorkflow()` on first launch. The matching `.json` files in `workflows/` are also included in Tauri `bundle.resources` for packaged builds, but the current onboarding path does not read those resource files at runtime.

**Generic over specific.** One `dynamicModel: true` workflow per (provider, output mode) replaces the dozens of hardcoded model-specific workflows we used to ship. Model search + pinning happens inside the workflow.

**ComfyUI is intentionally advanced.** Never shipped, never assumed. Users who want local generation know what they're doing.

**Wizard escapability.** Skip path on every step. "Skip Setup" still loads the seven bundled workflows so they appear once the user adds keys later.

---

## Remaining / Future Improvements

These items from the original plan are not (or only partially) wired up. Audit before scheduling work — some may already be shipped and just not verified here.

- **Sidebar provider grouping.** Group visible workflows under provider headers (REPLICATE / FAL / OPENROUTER / COMFYUI). Verify current sidebar layout before implementing.
- **Tauri resource bundling for workflow JSON.** If we want the on-disk `workflows/*.json` files to be the source of truth instead of the inlined copies in `onboarding.ts`, add them to `tauri.conf.json` `bundle.resources` and read them at first launch.
- **"Getting Started" tab in AdminPanel.** Provider status dashboard + "Re-run Setup Wizard" + "Load Default Workflows". `AdminPanel.tsx` already references onboarding state — confirm what's there before adding.
- **Provider status badges in `ApiKeysSection.tsx`.** Connected / no key / not running indicators per provider, sourced from `ProviderStatus` / `getHealth()`.
- **Fresh-canvas hint** in `CanvasWorkspace.tsx` (dismissable floating card).

## Design Principles

1. Provider-driven visibility — workflows shown = providers configured.
2. Generic over specific — one dynamic workflow with model search per (provider, output).
3. ComfyUI is advanced — never shipped, never assumed.
4. Always escapable — every modal has Skip/Dismiss.
5. One thing at a time per wizard step.
6. No jargon without context.
