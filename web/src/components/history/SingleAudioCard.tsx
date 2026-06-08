import type { WorkflowSummary, ApiBaseUrl } from "../../client";
import type { Asset, Generation } from "../../types";
import { CopyableText } from "../CopyableText";
import { isAudioAsset, statusPill } from "./generationUtils";
import { UserBadge } from "./UserBadge";

export function SingleAudioCard(props: {
  generation: Generation;
  workflow: WorkflowSummary | null;
  isSelected: boolean;
  apiBaseUrl: ApiBaseUrl;
  assetUrl: (apiBaseUrl: ApiBaseUrl, asset: Asset) => string;
  onOpenGeneration: (g: Generation) => void;
  onOpenAsset: (g: Generation, asset: Asset) => void;
  onDelete?: (generationId: string) => void;
  loading: boolean;
  showDelete?: boolean;
  userId?: string;
  userLabel?: string;
}) {
  const { generation: g, workflow, isSelected } = props;
  const label = workflow?.label ?? g.workflowUsed;
  const runningOrQueued = g.status === "running" || g.status === "queued";
  const showDelete = props.showDelete !== false && Boolean(props.onDelete);

  const audioAsset = g.assets.find((a) => isAudioAsset(a) && a.type !== "preview") ?? null;

  return (
    <div
      className={[
        "py-4",
        isSelected
          ? "bg-zinc-50 dark:bg-zinc-900/50"
          : ""
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => props.onOpenGeneration(g)}
          disabled={props.loading}
          title={g.id}
        >
          <CopyableText text={g.prompt} className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{g.prompt}</CopyableText>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span>{label}</span>
            <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-400">Audio</span>
            {props.userId ? <UserBadge userId={props.userId} label={props.userLabel} /> : null}
            <span className={["rounded-full px-2 py-0.5", statusPill(g.status)].join(" ")}>{g.status}</span>
            {g.queuePosition !== undefined && g.queuePosition !== null ? <span>#{g.queuePosition}</span> : null}
            <span>{new Date(g.createdAt).toLocaleString()}</span>
          </div>
        </button>
        {showDelete ? (
          <button
            className="text-xs text-zinc-600 hover:text-red-600 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-red-300"
            onClick={() => props.onDelete?.(g.id)}
            disabled={props.loading}
            type="button"
          >
            Delete
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-3 px-1 py-2">
        {runningOrQueued ? (
          <div className="flex flex-1 items-center gap-2 text-sm text-zinc-500">
            <svg className="h-5 w-5 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>{g.status === "queued" ? "Queued…" : "Generating…"}</span>
          </div>
        ) : g.status === "failed" ? (
          <div className="flex flex-1 items-center gap-2 text-sm text-red-500 dark:text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>Generation failed</span>
          </div>
        ) : audioAsset ? (
          <>
            <button
              type="button"
              className="flex-shrink-0 rounded-lg bg-zinc-500/10 p-2 text-zinc-600 hover:bg-zinc-500/20 dark:text-zinc-400"
              onClick={() => props.onOpenAsset(g, audioAsset)}
              title="Open in detail panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 10v3a1 1 0 0 0 1 1h3l5 6V1L6 7H3a1 1 0 0 0-1 1z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            </button>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              controls
              className="h-10 min-w-0 flex-1"
              src={props.assetUrl(props.apiBaseUrl, audioAsset)}
              preload="metadata"
            />
          </>
        ) : (
          <div className="flex flex-1 items-center gap-2 text-sm text-zinc-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 10v3a1 1 0 0 0 1 1h3l5 6V1L6 7H3a1 1 0 0 0-1 1z" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
            <span>No audio</span>
          </div>
        )}
      </div>
    </div>
  );
}
