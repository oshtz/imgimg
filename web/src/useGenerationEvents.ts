import { useEffect, useRef, useState } from "react";
import type { Asset, GenerationStatus } from "./types";

type JobEvent = {
  jobId: string;
  state: "queued" | "running" | "cancelled" | "succeeded" | "failed";
  position: number | null;
  generationId: string | null;
  error?: string;
};

type GenerationEvent = {
  generationId: string;
  status: GenerationStatus;
  assets?: Asset[];
  error?: string;
};

export type GenerationEventEnvelope =
  | { type: "connected"; data: { ok: true } }
  | { type: "job"; data: JobEvent }
  | { type: "generation"; data: GenerationEvent };

export function useGenerationEvents(params: {
  generationId: string | null;
  enabled?: boolean;
  onEvent?: (event: GenerationEventEnvelope) => void;
}) {
  const [event, setEvent] = useState<GenerationEventEnvelope | null>(null);
  const onEventRef = useRef(params.onEvent);
  onEventRef.current = params.onEvent;

  useEffect(() => {
    if (params.enabled === false) return;
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    const publish = (next: GenerationEventEnvelope) => {
      if (onEventRef.current) onEventRef.current(next);
      else setEvent(next);
    };

    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (cancelled) return;
      unlisteners.push(await listen<GenerationEvent>("generation-event", ({ payload }) => {
        if (params.generationId && payload.generationId !== params.generationId) return;
        publish({ type: "generation", data: payload });
      }));
      unlisteners.push(await listen<JobEvent>("queue-event", ({ payload }) => {
        publish({ type: "job", data: payload });
      }));
      publish({ type: "connected", data: { ok: true } });
    })();

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, [params.enabled, params.generationId]);

  return event;
}
