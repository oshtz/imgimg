import type { WorkflowParameter, WorkflowParameterOption } from "../api";

/**
 * Convert an OpenAPI Input schema (from Replicate) into WorkflowParameter[]
 * for dynamic UI generation. Resolves $ref and allOf patterns.
 */
// Field names that represent the model's primary text/prompt input.
// These are handled via the main prompt box, not as dynamic parameters.
const PROMPT_FIELD_NAMES = ["prompt", "text", "input_text"];

// Field names handled by dedicated UI controls (aspect ratio picker, seed, etc.)
// rather than as dynamic parameters.
const DEDICATED_UI_FIELD_NAMES = ["aspect_ratio", "seed"];

export function convertSchemaToParameters(
  schema: Record<string, any>,
  definitions?: Record<string, any>
): { parameters: WorkflowParameter[]; fileInputKeys: string[]; maxFileInputs: number | null; promptField: string } {
  const properties: Record<string, any> = schema.properties ?? schema;
  const parameters: WorkflowParameter[] = [];
  const fileInputKeys: string[] = [];
  let maxFileInputs: number | null = null;
  let promptField = "prompt"; // default

  // Detect which field name the model uses for its prompt input
  for (const candidate of PROMPT_FIELD_NAMES) {
    if (properties[candidate]) {
      promptField = candidate;
      break;
    }
  }

  const entries = Object.entries(properties).sort((a, b) => {
    const orderA = a[1]?.["x-order"] ?? 9999;
    const orderB = b[1]?.["x-order"] ?? 9999;
    if (orderA !== orderB) return orderA - orderB;
    return a[0].localeCompare(b[0]);
  });

  for (const [name, rawProp] of entries) {
    if (!rawProp || typeof rawProp !== "object") continue;
    if (PROMPT_FIELD_NAMES.includes(name)) continue;
    if (DEDICATED_UI_FIELD_NAMES.includes(name)) continue;

    // Resolve $ref / allOf / anyOf to get the full property definition
    const prop = resolveProperty(rawProp, definitions);

    // Skip const values — not user-configurable
    if (prop.const !== undefined) continue;

    const schemaType = prop.type;
    const format = prop.format;
    const description = prop.description || rawProp.description || prop.title || undefined;
    const rawDefault = rawProp.default ?? prop.default;
    // Treat null defaults as undefined (common in nullable patterns)
    const defaultValue = rawDefault === null ? undefined : rawDefault;
    const inferredMaxFileInputs = inferMaxFileInputs(prop, description);

    // URI format strings are file inputs
    if (schemaType === "string" && format === "uri") {
      fileInputKeys.push(name);
      continue;
    }

    // Array of URIs = file inputs (suffix with [] so consumers know it expects an array)
    if (schemaType === "array" && prop.items?.format === "uri") {
      fileInputKeys.push(`${name}[]`);
      if (maxFileInputs === null && inferredMaxFileInputs !== null) {
        maxFileInputs = inferredMaxFileInputs;
      }
      continue;
    }

    // Common file input field names — check schema type to determine string vs array
    if (/^(image_url|image|audio|video|mask|reference_audio|input_image|init_image|image_input)$/i.test(name)) {
      fileInputKeys.push(schemaType === "array" ? `${name}[]` : name);
      if (schemaType === "array" && maxFileInputs === null && inferredMaxFileInputs !== null) {
        maxFileInputs = inferredMaxFileInputs;
      }
      continue;
    }

    // Enum (with or without explicit type) → select
    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
      const options: WorkflowParameterOption[] = prop.enum.map((v: any) => ({
        value: String(v),
        label: String(v),
      }));
      parameters.push({
        name,
        type: "select",
        label: formatLabel(name),
        description,
        default: defaultValue !== undefined ? String(defaultValue) : options[0]?.value ?? "",
        options,
      });
      continue;
    }

    // Plain string → text
    if (schemaType === "string") {
      parameters.push({
        name,
        type: "text",
        label: formatLabel(name),
        description,
        default: defaultValue !== undefined ? String(defaultValue) : "",
      });
      continue;
    }

    // Number/integer → number
    if (schemaType === "number" || schemaType === "integer") {
      const param: WorkflowParameter = {
        name,
        type: "number",
        label: formatLabel(name),
        description,
        default: defaultValue !== undefined ? Number(defaultValue) : 0,
      };
      if (prop.minimum !== undefined) param.min = prop.minimum;
      if (prop.maximum !== undefined) param.max = prop.maximum;
      if (prop.exclusiveMinimum !== undefined && param.min === undefined) {
        param.min = prop.exclusiveMinimum + (schemaType === "integer" ? 1 : 0.01);
      }
      if (prop.exclusiveMaximum !== undefined && param.max === undefined) {
        param.max = prop.exclusiveMaximum - (schemaType === "integer" ? 1 : 0.01);
      }
      if (schemaType === "integer") {
        param.step = 1;
      } else if (param.min !== undefined && param.max !== undefined) {
        const range = param.max - param.min;
        param.step = range > 100 ? 1 : range > 10 ? 0.1 : 0.01;
      }
      parameters.push(param);
      continue;
    }

    // Boolean → boolean
    if (schemaType === "boolean") {
      parameters.push({
        name,
        type: "boolean",
        label: formatLabel(name),
        description,
        default: defaultValue !== undefined ? Boolean(defaultValue) : false,
      });
      continue;
    }

    // Skip arrays, objects, and other complex types
  }

  return { parameters, fileInputKeys, maxFileInputs, promptField };
}

function inferMaxFileInputs(prop: Record<string, any>, description?: string): number | null {
  const directMaxItems = toPositiveInteger(prop.maxItems);
  if (directMaxItems !== null) return directMaxItems;

  if (!description) return null;
  const patterns = [
    /\bsupports?\s+up to\s+(\d+)\s+(?:input\s+)?(?:images?|files?|videos?|audio)\b/i,
    /\bup to\s+(\d+)\s+(?:input\s+)?(?:images?|files?|videos?|audio)\b/i,
    /\bmax(?:imum)?(?:\s+of)?\s+(\d+)\s+(?:input\s+)?(?:images?|files?|videos?|audio)\b/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    const parsed = toPositiveInteger(match?.[1]);
    if (parsed !== null) return parsed;
  }

  return null;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Resolve a property that may use $ref or allOf to reference a definition.
 * Merges the referenced schema with any inline overrides (description, default, etc.).
 */
function resolveProperty(
  prop: Record<string, any>,
  definitions?: Record<string, any>
): Record<string, any> {
  // Direct $ref
  if (prop.$ref) {
    const resolved = resolveRef(prop.$ref, definitions);
    return { ...resolved, ...stripRefs(prop) };
  }

  // allOf with $ref — common Replicate pattern: allOf: [{ $ref: "..." }]
  if (Array.isArray(prop.allOf)) {
    let merged: Record<string, any> = {};
    for (const item of prop.allOf) {
      if (item.$ref) {
        const resolved = resolveRef(item.$ref, definitions);
        merged = { ...merged, ...resolved };
      } else {
        merged = { ...merged, ...item };
      }
    }
    // Inline overrides (description, default, x-order) take priority
    return { ...merged, ...stripRefs(prop) };
  }

  // oneOf / anyOf — merge non-null types, pick first meaningful type
  const unionArray = prop.oneOf ?? prop.anyOf;
  if (Array.isArray(unionArray)) {
    const enums: any[] = [];
    let base: Record<string, any> = {};
    for (const item of unionArray) {
      // Skip null type variants (nullable pattern)
      if (item.type === "null") continue;
      const resolved = item.$ref ? resolveRef(item.$ref, definitions) : item;
      if (resolved.enum) enums.push(...resolved.enum);
      // Take the first non-null type as the base, don't overwrite with later types
      if (resolved.type && !base.type) {
        base = { ...base, ...resolved };
      }
    }
    if (enums.length > 0) {
      return { ...base, enum: enums, type: base.type || "string", ...stripRefs(prop) };
    }
    if (base.type) {
      return { ...base, ...stripRefs(prop) };
    }
    return { ...stripRefs(prop) };
  }

  return prop;
}

/**
 * Resolve a $ref string like "#/components/schemas/aspect_ratio" to its definition.
 */
function resolveRef(ref: string, definitions?: Record<string, any>): Record<string, any> {
  if (!definitions || !ref) return {};
  // Extract the schema name from the ref path
  const parts = ref.split("/");
  const schemaName = parts[parts.length - 1];
  return definitions[schemaName] ?? {};
}

/**
 * Return a copy of the object without $ref, allOf, oneOf, anyOf keys.
 */
function stripRefs(obj: Record<string, any>): Record<string, any> {
  const { $ref, allOf, oneOf, anyOf, ...rest } = obj;
  return rest;
}

function formatLabel(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
