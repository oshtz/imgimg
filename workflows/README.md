# Workflow Templates

This directory contains the bundled generic provider workflows copied into the app bundle. User-created workflows are managed from the app data directory at runtime.

## Template Shape

Each workflow JSON file should include:

- `meta`: workflow metadata used by the UI and dispatch layer.
- `prompt`: the provider or ComfyUI template payload.

The filename without `.json` is the workflow ID.

## ComfyUI Tokens

ComfyUI templates can use these injection tokens in string fields. Exact-token values are injected as native JSON numbers/strings where supported; inline tokens inside longer strings are replaced as text.

- `__PROMPT__`
- `__SEED__`
- `__ITEM_INDEX__`
- `__WIDTH__`
- `__HEIGHT__`
- `__BATCH_SIZE__`
- `__ASPECT_RATIO__`
- `__IMAGE__`
- `__IMAGE_2__`
- `__MASK__`
- `__LORA_NAME__`
- `__LAYERS__`
- `__EXPAND_LEFT__`
- `__EXPAND_RIGHT__`
- `__EXPAND_TOP__`
- `__EXPAND_BOTTOM__`
- `__DENOISE__`
- `__EDGE_BLEND__`
- `__OPENROUTER_API_KEY__`

For outpaint workflows, bind `__EXPAND_*__`, `__DENOISE__`, and optionally `__EDGE_BLEND__` to the ComfyUI nodes that control canvas growth, denoise/creativity, and seam feathering.
