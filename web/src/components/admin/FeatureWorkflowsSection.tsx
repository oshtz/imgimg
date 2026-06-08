import { useEffect, useState } from "react";
import { TbLoader2 } from "react-icons/tb";
import { toast } from "sonner";
import {
  getAdminSettings,
  putAdminSettings,
  type ApiBaseUrl,
} from "../../client";

interface FeatureWorkflowsSectionProps {
  apiBaseUrl: ApiBaseUrl;
}

export function FeatureWorkflowsSection({ apiBaseUrl }: FeatureWorkflowsSectionProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [inpaintId, setInpaintId] = useState("");
  const [outpaintId, setOutpaintId] = useState("");
  const [rembgId, setRembgId] = useState("");

  const [savedInpaintId, setSavedInpaintId] = useState("");
  const [savedOutpaintId, setSavedOutpaintId] = useState("");
  const [savedRembgId, setSavedRembgId] = useState("");

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setError(null);
      try {
        const data = await getAdminSettings(apiBaseUrl);
        setInpaintId(data.inpaintWorkflowId ?? "");
        setOutpaintId(data.outpaintWorkflowId ?? "");
        setRembgId(data.rembgWorkflowId ?? "");
        setSavedInpaintId(data.inpaintWorkflowId ?? "");
        setSavedOutpaintId(data.outpaintWorkflowId ?? "");
        setSavedRembgId(data.rembgWorkflowId ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    void loadSettings();
  }, [apiBaseUrl]);

  const hasChanges =
    inpaintId !== savedInpaintId ||
    outpaintId !== savedOutpaintId ||
    rembgId !== savedRembgId;

  async function handleSave() {
    setSaving(true);
    try {
      const data = await putAdminSettings(apiBaseUrl, {
        inpaintWorkflowId: inpaintId.trim() || null,
        outpaintWorkflowId: outpaintId.trim() || null,
        rembgWorkflowId: rembgId.trim() || null,
      });
      setSavedInpaintId(data.inpaintWorkflowId ?? "");
      setSavedOutpaintId(data.outpaintWorkflowId ?? "");
      setSavedRembgId(data.rembgWorkflowId ?? "");
      toast.success("Feature workflows saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-zinc-400">
        <TbLoader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  if (error) {
    return <p className="py-12 text-sm text-red-500">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Feature Workflows
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Assign workflows that power inpainting, outpainting, and background removal.
          These features require ComfyUI workflows to be set up and available.
          Leave blank to disable.
        </p>
      </div>

      <div className="space-y-4">
        <Field
          label="Inpaint Workflow ID"
          description="Workflow for inpainting masked regions (e.g. comfy-inpaint-9b)"
          value={inpaintId}
          onChange={setInpaintId}
        />
        <Field
          label="Outpaint Workflow ID"
          description="Workflow for expanding/extending images (e.g. outpaint-new)"
          value={outpaintId}
          onChange={setOutpaintId}
        />
        <Field
          label="Remove Background Workflow ID"
          description="Workflow for removing image backgrounds (e.g. rembg)"
          value={rembgId}
          onChange={setRembgId}
        />
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || !hasChanges}
        className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {saving && <TbLoader2 className="h-3.5 w-3.5 animate-spin" />}
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

function Field({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{description}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Not configured"
        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-600 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
      />
    </div>
  );
}
