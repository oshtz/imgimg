import { useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "./tauri-api";
import { getSessionId, type ApiBaseUrl } from "./client";
import type { Asset, GenerationStatus } from "./types";

type JobEvent = {
  jobId: string;
  state: "queued" | "running" | "succeeded" | "failed";
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

type SlotFillingEvent = {
  generationId: string;
  slotIndex: number;
  status: "running" | "completed" | "failed";
  error?: string;
};

type RembgEvent = {
  generationId: string;
  itemIndex: number;
  status: "running" | "completed" | "failed";
  error?: string;
};

export type GenerationSseEvent =
  | { type: "connected"; data: { ok: true } }
  | { type: "job"; data: JobEvent }
  | { type: "generation"; data: GenerationEvent }
  | { type: "generation_deleted"; data: { generationId: string } }
  | { type: "slot_filling"; data: SlotFillingEvent }
  | { type: "rembg"; data: RembgEvent };

export function useGenerationEvents(params: {
  apiBaseUrl: ApiBaseUrl;
  generationId: string | null;
  authToken?: string | null;
  enabled?: boolean;
  onEvent?: (evt: GenerationSseEvent) => void;
  /** Force SSE even in Tauri mode (for HTTP API-created generations). */
  forceSSE?: boolean;
}) {
  const [evt, setEvt] = useState<GenerationSseEvent | null>(null);
  const onEventRef = useRef<typeof params.onEvent>(params.onEvent);
  onEventRef.current = params.onEvent;

  // Tauri event listener
  useEffect(() => {
    if (params.enabled === false) return;
    if (!isTauri() || params.forceSSE) return;

    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    (async () => {
      const { listen } = await import("@tauri-apps/api/event");

      if (cancelled) return;

      const unlisten1 = await listen<GenerationEvent>(
        "generation-event",
        (event) => {
          const genEvent = event.payload;
          if (
            params.generationId &&
            genEvent.generationId !== params.generationId
          ) {
            return;
          }
          const parsed: GenerationSseEvent = {
            type: "generation",
            data: genEvent,
          };
          if (onEventRef.current) {
            onEventRef.current(parsed);
          } else {
            setEvt(parsed);
          }
        }
      );
      unlisteners.push(unlisten1);

      const unlisten2 = await listen<JobEvent>("queue-event", (event) => {
        const parsed: GenerationSseEvent = {
          type: "job",
          data: event.payload,
        };
        if (onEventRef.current) {
          onEventRef.current(parsed);
        } else {
          setEvt(parsed);
        }
      });
      unlisteners.push(unlisten2);

      // Emit a synthetic "connected" event so the app knows events are flowing
      const connected: GenerationSseEvent = {
        type: "connected",
        data: { ok: true },
      };
      if (onEventRef.current) {
        onEventRef.current(connected);
      } else {
        setEvt(connected);
      }
    })();

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [params.generationId, params.enabled]);

  // SSE EventSource listener (non-Tauri / web mode, or forceSSE)
  const url = useMemo(() => {
    if (isTauri() && !params.forceSSE) return null;
    const u = new URL(`${params.apiBaseUrl}/events`);
    if (params.generationId) u.searchParams.set("generation_id", params.generationId);
    const sessionId = getSessionId();
    if (sessionId) u.searchParams.set("session_id", sessionId);
    if (params.authToken) u.searchParams.set("access_token", params.authToken);
    return u.toString();
  }, [params.apiBaseUrl, params.generationId, params.authToken]);

  useEffect(() => {
    if (params.enabled === false) return;
    if (isTauri() && !params.forceSSE) return; // Handled by Tauri effect above
    if (!url) return;

    const es = new EventSource(url);

    const on = (type: GenerationSseEvent["type"]) => (e: MessageEvent) => {
      const parsed = { type, data: JSON.parse(e.data) } as GenerationSseEvent;
      if (onEventRef.current) {
        onEventRef.current(parsed);
        return;
      }
      setEvt(parsed);
    };

    es.addEventListener("connected", on("connected"));
    es.addEventListener("job", on("job"));
    es.addEventListener("generation", on("generation"));
    es.addEventListener("generation_deleted", on("generation_deleted"));
    es.addEventListener("slot_filling", on("slot_filling"));
    es.addEventListener("rembg", on("rembg"));

    es.onerror = () => {
      // Browser will auto-retry.
    };

    return () => {
      es.close();
    };
  }, [url, params.enabled]);

  return evt;
}
