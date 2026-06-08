import { describe, it, expect } from "vitest";
import { convertSchemaToParameters } from "../schemaToParameters";

describe("convertSchemaToParameters", () => {
  // ── Basic types ──

  it("converts a plain string field to text", () => {
    const schema = {
      properties: {
        negative_prompt: { type: "string", default: "", description: "Things to avoid" },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "negative_prompt",
      type: "text",
      label: "Negative Prompt",
      default: "",
      description: "Things to avoid",
    });
  });

  it("converts a string with enum to select", () => {
    const schema = {
      properties: {
        output_format: {
          type: "string",
          enum: ["png", "jpg", "webp"],
          default: "png",
          description: "Image format",
        },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "output_format",
      type: "select",
      default: "png",
      options: [
        { value: "png", label: "png" },
        { value: "jpg", label: "jpg" },
        { value: "webp", label: "webp" },
      ],
    });
  });

  it("converts integer field with min/max", () => {
    const schema = {
      properties: {
        steps: {
          type: "integer",
          default: 30,
          minimum: 1,
          maximum: 100,
          description: "Inference steps",
        },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "steps",
      type: "number",
      default: 30,
      min: 1,
      max: 100,
      step: 1,
    });
  });

  it("converts float number field", () => {
    const schema = {
      properties: {
        guidance_scale: {
          type: "number",
          default: 7.5,
          minimum: 0,
          maximum: 20,
        },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "guidance_scale",
      type: "number",
      default: 7.5,
      min: 0,
      max: 20,
      step: 0.1,
    });
  });

  it("converts boolean field", () => {
    const schema = {
      properties: {
        disable_safety: { type: "boolean", default: false, description: "Skip safety check" },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "disable_safety",
      type: "boolean",
      default: false,
    });
  });

  // ── Skipped fields ──

  it("skips prompt field", () => {
    const schema = {
      properties: {
        prompt: { type: "string", description: "Text prompt" },
        steps: { type: "integer", default: 20 },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0].name).toBe("steps");
  });

  it("skips URI format strings and adds to fileInputKeys", () => {
    const schema = {
      properties: {
        image: { type: "string", format: "uri", description: "Input image" },
        mask_url: { type: "string", format: "uri" },
      },
    };
    const { parameters, fileInputKeys } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(0);
    expect(fileInputKeys).toEqual(["image", "mask_url"]);
  });

  it("skips arrays of URIs and adds to fileInputKeys", () => {
    const schema = {
      properties: {
        image_input: {
          type: "array",
          items: { type: "string", format: "uri" },
          description: "Input images",
        },
      },
    };
    const { parameters, fileInputKeys, maxFileInputs } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(0);
    expect(fileInputKeys).toContain("image_input[]");
    expect(maxFileInputs).toBeNull();
  });

  it("extracts maxFileInputs from array file input with maxItems", () => {
    const schema = {
      properties: {
        image_input: {
          type: "array",
          items: { type: "string", format: "uri" },
          maxItems: 14,
          description: "Input images",
        },
      },
    };
    const { fileInputKeys, maxFileInputs } = convertSchemaToParameters(schema);
    expect(fileInputKeys).toContain("image_input[]");
    expect(maxFileInputs).toBe(14);
  });

  it("infers maxFileInputs from Replicate image input descriptions when maxItems is omitted", () => {
    const schema = {
      properties: {
        image_input: {
          type: "array",
          items: { type: "string", format: "uri" },
          default: [],
          description: "Input images to transform or use as reference (supports up to 14 images)",
        },
      },
    };
    const { fileInputKeys, maxFileInputs } = convertSchemaToParameters(schema);
    expect(fileInputKeys).toContain("image_input[]");
    expect(maxFileInputs).toBe(14);
  });

  it("extracts maxFileInputs from common file input name with array type and maxItems", () => {
    const schema = {
      properties: {
        image_input: {
          type: "array",
          maxItems: 10,
        },
      },
    };
    const { fileInputKeys, maxFileInputs } = convertSchemaToParameters(schema);
    expect(fileInputKeys).toContain("image_input[]");
    expect(maxFileInputs).toBe(10);
  });

  it("skips common file input field names", () => {
    const schema = {
      properties: {
        init_image: { type: "string" },
        input_image: { type: "string" },
        mask: { type: "string" },
        audio: { type: "string" },
        video: { type: "string" },
      },
    };
    const { parameters, fileInputKeys } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(0);
    expect(fileInputKeys).toHaveLength(5);
  });

  // ── $ref resolution ──

  it("resolves allOf with $ref to enum (Replicate official pattern)", () => {
    const schema = {
      properties: {
        output_quality: {
          allOf: [{ $ref: "#/components/schemas/output_quality" }],
          default: "high",
          description: "Output quality level",
          "x-order": 2,
        },
      },
    };
    const definitions = {
      output_quality: {
        type: "string",
        enum: ["low", "medium", "high", "ultra", "max"],
        title: "Output Quality",
      },
    };
    const { parameters } = convertSchemaToParameters(schema, definitions);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "output_quality",
      type: "select",
      default: "high",
      description: "Output quality level",
      options: [
        { value: "low", label: "low" },
        { value: "medium", label: "medium" },
        { value: "high", label: "high" },
        { value: "ultra", label: "ultra" },
        { value: "max", label: "max" },
      ],
    });
  });

  it("resolves direct $ref", () => {
    const schema = {
      properties: {
        size: {
          $ref: "#/components/schemas/size",
          default: "2K",
          description: "Resolution",
        },
      },
    };
    const definitions = {
      size: { type: "string", enum: ["2K", "3K"] },
    };
    const { parameters } = convertSchemaToParameters(schema, definitions);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "size",
      type: "select",
      default: "2K",
      options: [
        { value: "2K", label: "2K" },
        { value: "3K", label: "3K" },
      ],
    });
  });

  it("resolves oneOf by merging enums", () => {
    const schema = {
      properties: {
        scheduler: {
          oneOf: [
            { $ref: "#/components/schemas/scheduler_a" },
            { $ref: "#/components/schemas/scheduler_b" },
          ],
          default: "euler",
          description: "Sampling scheduler",
        },
      },
    };
    const definitions = {
      scheduler_a: { type: "string", enum: ["euler", "ddim"] },
      scheduler_b: { type: "string", enum: ["dpm++", "lms"] },
    };
    const { parameters } = convertSchemaToParameters(schema, definitions);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "scheduler",
      type: "select",
      default: "euler",
      options: [
        { value: "euler", label: "euler" },
        { value: "ddim", label: "ddim" },
        { value: "dpm++", label: "dpm++" },
        { value: "lms", label: "lms" },
      ],
    });
  });

  it("falls back gracefully when $ref target is missing", () => {
    const schema = {
      properties: {
        mode: {
          allOf: [{ $ref: "#/components/schemas/missing_def" }],
          default: "auto",
          description: "Mode",
        },
      },
    };
    const { parameters } = convertSchemaToParameters(schema, {});
    // No type or enum resolved — should be skipped
    expect(parameters).toHaveLength(0);
  });

  // ── Ordering ──

  it("sorts by x-order", () => {
    const schema = {
      properties: {
        noise: { type: "integer", default: 0, "x-order": 5 },
        steps: { type: "integer", default: 30, "x-order": 1 },
        cfg: { type: "number", default: 7, "x-order": 2 },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters.map((p) => p.name)).toEqual(["steps", "cfg", "noise"]);
  });

  // ── Number edge cases ──

  it("handles exclusiveMinimum / exclusiveMaximum for integer", () => {
    const schema = {
      properties: {
        count: { type: "integer", exclusiveMinimum: 0, exclusiveMaximum: 10, default: 5 },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters[0]).toMatchObject({ min: 1, max: 9, step: 1 });
  });

  it("handles exclusiveMinimum / exclusiveMaximum for float", () => {
    const schema = {
      properties: {
        weight: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 1, default: 0.5 },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters[0]).toMatchObject({ min: 0.01, max: 0.99 });
    expect(parameters[0].step).toBe(0.01);
  });

  it("infers step from range size", () => {
    // Large range → step 1
    const big = { properties: { x: { type: "number", minimum: 0, maximum: 1000, default: 0 } } };
    expect(convertSchemaToParameters(big).parameters[0].step).toBe(1);

    // Medium range → step 0.1
    const med = { properties: { x: { type: "number", minimum: 0, maximum: 50, default: 0 } } };
    expect(convertSchemaToParameters(med).parameters[0].step).toBe(0.1);

    // Small range → step 0.01
    const small = { properties: { x: { type: "number", minimum: 0, maximum: 1, default: 0 } } };
    expect(convertSchemaToParameters(small).parameters[0].step).toBe(0.01);
  });

  // ── Complex types are skipped ──

  it("skips object and array types (non-URI)", () => {
    const schema = {
      properties: {
        metadata: { type: "object", description: "Extra metadata" },
        tags: { type: "array", items: { type: "string" } },
      },
    };
    const { parameters, fileInputKeys } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(0);
    expect(fileInputKeys).toHaveLength(0);
  });

  // ── Full Replicate model simulation ──

  it("handles a realistic Replicate official model schema", () => {
    const schema = {
      properties: {
        prompt: { type: "string", "x-order": 0 },
        image_input: { type: "array", items: { format: "uri", type: "string" }, "x-order": 1 },
        size: {
          allOf: [{ $ref: "#/components/schemas/size" }],
          default: "2K",
          description: "Resolution",
          "x-order": 2,
        },
        style_preset: {
          allOf: [{ $ref: "#/components/schemas/style_preset" }],
          default: "natural",
          description: "Style preset",
          "x-order": 3,
        },
        sequential_image_generation: {
          allOf: [{ $ref: "#/components/schemas/sequential_image_generation" }],
          default: "disabled",
          description: "Batch mode",
          "x-order": 4,
        },
        max_images: { type: "integer", default: 1, minimum: 1, maximum: 15, "x-order": 5 },
        output_format: {
          allOf: [{ $ref: "#/components/schemas/output_format" }],
          default: "png",
          description: "Format",
          "x-order": 6,
        },
      },
    };
    const definitions = {
      size: { type: "string", enum: ["2K", "3K"], title: "Size" },
      style_preset: { type: "string", enum: ["natural", "vivid", "anime", "3d"], title: "Style Preset" },
      sequential_image_generation: { type: "string", enum: ["disabled", "auto"], title: "Sequential" },
      output_format: { type: "string", enum: ["png", "jpg", "webp"], title: "Output Format" },
    };

    const { parameters, fileInputKeys, maxFileInputs } = convertSchemaToParameters(schema, definitions);

    // prompt skipped, image_input (array type) goes to fileInputKeys with [] suffix
    expect(fileInputKeys).toContain("image_input[]");
    // No maxItems specified in this schema
    expect(maxFileInputs).toBeNull();

    // 5 params: size, style_preset, sequential_image_generation, max_images, output_format
    expect(parameters).toHaveLength(5);

    // Check ordering by x-order
    expect(parameters.map((p) => p.name)).toEqual([
      "size",
      "style_preset",
      "sequential_image_generation",
      "max_images",
      "output_format",
    ]);

    // Check types
    expect(parameters[0].type).toBe("select"); // size
    expect(parameters[1].type).toBe("select"); // style_preset
    expect(parameters[2].type).toBe("select"); // sequential_image_generation
    expect(parameters[3].type).toBe("number"); // max_images
    expect(parameters[4].type).toBe("select"); // output_format

    // Check defaults preserved from inline (not from definition)
    expect(parameters[0].default).toBe("2K");
    expect(parameters[1].default).toBe("natural");
    expect(parameters[4].default).toBe("png");
  });

  // ── No definitions provided ──

  it("works when no definitions are provided (flat schema)", () => {
    const schema = {
      properties: {
        width: { type: "integer", default: 1024, minimum: 64, maximum: 2048 },
        height: { type: "integer", default: 1024, minimum: 64, maximum: 2048 },
        sampler: { type: "string", enum: ["euler", "ddim"], default: "euler" },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(3);
  });

  // ── Properties as top-level (no wrapper) ──

  it("handles schema passed as flat properties object", () => {
    const flat = {
      steps: { type: "integer", default: 20 },
      width: { type: "integer", default: 1024 },
    };
    const { parameters } = convertSchemaToParameters(flat);
    expect(parameters).toHaveLength(2);
  });

  // ── Enum without explicit type ──

  it("handles enum without explicit type from resolved ref", () => {
    const schema = {
      properties: {
        style: {
          allOf: [{ $ref: "#/components/schemas/style" }],
          default: "natural",
        },
      },
    };
    const definitions = {
      style: { enum: ["natural", "vivid", "anime"], title: "Style" },
    };
    const { parameters } = convertSchemaToParameters(schema, definitions);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "style",
      type: "select",
      default: "natural",
      options: [
        { value: "natural", label: "natural" },
        { value: "vivid", label: "vivid" },
        { value: "anime", label: "anime" },
      ],
    });
  });

  // ── anyOf patterns (nullable types) ──

  it("handles anyOf with type + null (nullable string)", () => {
    const schema = {
      properties: {
        negative_prompt: {
          anyOf: [{ type: "string" }, { type: "null" }],
          default: null,
          description: "Negative prompt",
        },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "negative_prompt",
      type: "text",
      default: "",
    });
  });

  it("handles anyOf with number + null (nullable number)", () => {
    const schema = {
      properties: {
        noise_level: {
          anyOf: [{ type: "integer", minimum: 0, maximum: 2147483647 }, { type: "null" }],
          default: null,
          description: "Noise level",
        },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "noise_level",
      type: "number",
      default: 0,
      min: 0,
      max: 2147483647,
    });
  });

  it("handles anyOf with enum ref + null (nullable enum)", () => {
    const schema = {
      properties: {
        scheduler: {
          anyOf: [{ $ref: "#/components/schemas/scheduler" }, { type: "null" }],
          default: "euler",
          description: "Sampler",
        },
      },
    };
    const definitions = {
      scheduler: { type: "string", enum: ["euler", "ddim", "dpm++"] },
    };
    const { parameters } = convertSchemaToParameters(schema, definitions);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "scheduler",
      type: "select",
      default: "euler",
      options: [
        { value: "euler", label: "euler" },
        { value: "ddim", label: "ddim" },
        { value: "dpm++", label: "dpm++" },
      ],
    });
  });

  it("handles anyOf with boolean + null", () => {
    const schema = {
      properties: {
        enable_safety: {
          anyOf: [{ type: "boolean" }, { type: "null" }],
          default: true,
        },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "enable_safety",
      type: "boolean",
      default: true,
    });
  });

  // ── anyOf with multiple real types (not just null) ──

  it("handles anyOf with number + string (picks first meaningful type)", () => {
    const schema = {
      properties: {
        guidance: {
          anyOf: [{ type: "number", minimum: 0, maximum: 20 }, { type: "string" }],
          default: 7.5,
        },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "guidance",
      type: "number",
      default: 7.5,
    });
  });

  // ── Deeply nested ref chains ──

  it("handles allOf with multiple refs merged", () => {
    const schema = {
      properties: {
        mode: {
          allOf: [
            { $ref: "#/components/schemas/base_mode" },
            { description: "Override description" },
          ],
          default: "fast",
        },
      },
    };
    const definitions = {
      base_mode: { type: "string", enum: ["fast", "quality", "balanced"] },
    };
    const { parameters } = convertSchemaToParameters(schema, definitions);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "mode",
      type: "select",
      default: "fast",
      description: "Override description",
    });
  });

  // ── Inline default overrides ref default ──

  it("prefers inline default over definition default", () => {
    const schema = {
      properties: {
        format: {
          allOf: [{ $ref: "#/components/schemas/format" }],
          default: "webp",
        },
      },
    };
    const definitions = {
      format: { type: "string", enum: ["png", "jpg", "webp"], default: "png" },
    };
    const { parameters } = convertSchemaToParameters(schema, definitions);
    expect(parameters[0].default).toBe("webp");
  });

  // ── URI in anyOf (file input) ──

  it("detects file input from anyOf with uri format", () => {
    const schema = {
      properties: {
        image: {
          anyOf: [{ type: "string", format: "uri" }, { type: "null" }],
          default: null,
        },
      },
    };
    const { parameters, fileInputKeys } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(0);
    expect(fileInputKeys).toContain("image");
  });

  // ── Const values (should be skipped — not user-configurable) ──

  it("skips properties with const (fixed values)", () => {
    const schema = {
      properties: {
        version: { type: "string", const: "v2.1" },
        steps: { type: "integer", default: 20 },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0].name).toBe("steps");
  });

  // ── Numeric enum → select (not number) ──

  it("handles numeric enum as select", () => {
    const schema = {
      properties: {
        num_outputs: {
          type: "integer",
          enum: [1, 2, 4, 8],
          default: 1,
        },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({
      name: "num_outputs",
      type: "select",
      default: "1",
      options: [
        { value: "1", label: "1" },
        { value: "2", label: "2" },
        { value: "4", label: "4" },
        { value: "8", label: "8" },
      ],
    });
  });

  // ── Label formatting ──

  it("formats snake_case and camelCase labels", () => {
    const schema = {
      properties: {
        guidance_scale: { type: "number", default: 7 },
        numInferenceSteps: { type: "integer", default: 20 },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters[0].label).toBe("Guidance Scale");
    expect(parameters[1].label).toBe("Num Inference Steps");
  });

  // ── Non-object / null properties are skipped ──

  it("skips null and non-object property values", () => {
    const schema = {
      properties: {
        nullProp: null,
        primitiveProp: 42,
        valid: { type: "integer", default: 1 },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters).toHaveLength(1);
    expect(parameters[0].name).toBe("valid");
  });

  // ── Description fallback from title ──

  it("uses rawProp.description when prop.description is missing", () => {
    const schema = {
      properties: {
        field: {
          allOf: [{ $ref: "#/components/schemas/myType" }],
          description: "From raw prop",
        },
      },
    };
    const definitions = {
      myType: { type: "string", enum: ["a", "b"] },
    };
    const { parameters } = convertSchemaToParameters(schema, definitions);
    expect(parameters[0].description).toBe("From raw prop");
  });

  it("uses prop.title as description fallback when description is missing", () => {
    const schema = {
      properties: {
        field: {
          allOf: [{ $ref: "#/components/schemas/myType" }],
        },
      },
    };
    const definitions = {
      myType: { type: "string", enum: ["a", "b"], title: "My Title" },
    };
    const { parameters } = convertSchemaToParameters(schema, definitions);
    expect(parameters[0].description).toBe("My Title");
  });

  // ── exclusiveMinimum/exclusiveMaximum not applied when min/max already set ──

  it("does not override minimum with exclusiveMinimum when minimum is already set", () => {
    const schema = {
      properties: {
        val: { type: "integer", minimum: 5, exclusiveMinimum: 0, default: 10 },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters[0].min).toBe(5); // minimum takes precedence
  });

  it("does not override maximum with exclusiveMaximum when maximum is already set", () => {
    const schema = {
      properties: {
        val: { type: "integer", maximum: 100, exclusiveMaximum: 200, default: 50 },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters[0].max).toBe(100); // maximum takes precedence
  });

  // ── Number without min/max does not get step ──

  it("number without min/max does not get step assigned from range", () => {
    const schema = {
      properties: {
        unbounded: { type: "number", default: 1.5 },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters[0].step).toBeUndefined();
  });

  // ── Prompt field detection ──

  it("detects 'text' as prompt field", () => {
    const schema = {
      properties: {
        text: { type: "string" },
        steps: { type: "integer", default: 20 },
      },
    };
    const { parameters, promptField } = convertSchemaToParameters(schema);
    expect(promptField).toBe("text");
    expect(parameters).toHaveLength(1);
    expect(parameters[0].name).toBe("steps");
  });

  it("detects 'input_text' as prompt field", () => {
    const schema = {
      properties: {
        input_text: { type: "string" },
        steps: { type: "integer", default: 20 },
      },
    };
    const { parameters, promptField } = convertSchemaToParameters(schema);
    expect(promptField).toBe("input_text");
    expect(parameters).toHaveLength(1);
  });

  // ── anyOf/oneOf with no enums and no base type ──

  it("handles anyOf with all null types (no meaningful type)", () => {
    const schema = {
      properties: {
        noop: {
          anyOf: [{ type: "null" }, { type: "null" }],
          default: null,
        },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    // No meaningful type resolved, should be skipped
    expect(parameters).toHaveLength(0);
  });

  // ── resolveRef with no definitions ──

  it("resolves $ref with no definitions gracefully", () => {
    const schema = {
      properties: {
        mode: {
          $ref: "#/components/schemas/missing",
          default: "auto",
        },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    // Without definitions, no type resolved, skipped
    expect(parameters).toHaveLength(0);
  });

  // ── common file input names as array ──

  it("detects reference_audio as file input", () => {
    const schema = {
      properties: {
        reference_audio: { type: "string" },
      },
    };
    const { fileInputKeys } = convertSchemaToParameters(schema);
    expect(fileInputKeys).toContain("reference_audio");
  });

  // ── enum default falls back to first option when default is undefined ──

  it("uses first enum value as default when no default provided", () => {
    const schema = {
      properties: {
        mode: { type: "string", enum: ["alpha", "beta"] },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters[0].default).toBe("alpha");
  });

  // ── Missing default ──

  it("uses sensible defaults when none provided", () => {
    const schema = {
      properties: {
        label_text: { type: "string" },
        count: { type: "integer" },
        weight: { type: "number" },
        flag: { type: "boolean" },
        mode: { type: "string", enum: ["a", "b"] },
      },
    };
    const { parameters } = convertSchemaToParameters(schema);
    expect(parameters.find((p) => p.name === "label_text")?.default).toBe("");
    expect(parameters.find((p) => p.name === "count")?.default).toBe(0);
    expect(parameters.find((p) => p.name === "weight")?.default).toBe(0);
    expect(parameters.find((p) => p.name === "flag")?.default).toBe(false);
    expect(parameters.find((p) => p.name === "mode")?.default).toBe("a");
  });
});
