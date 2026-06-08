import { useMemo, useState } from "react";
import type { WorkflowSummary, ApiBaseUrl } from "../client";
import type { Asset, Generation } from "../types";
import type { AssetTypeRegistry } from "../assetTypeRegistry";
import { findWorkflow, getOutputMode, pickPreviewAssets } from "./history/generationUtils";
import { SingleImageCard } from "./history/SingleImageCard";
import { SingleAudioCard } from "./history/SingleAudioCard";
import { FullSetCard } from "./history/FullSetCard";
import { LayeredImageCard } from "./history/LayeredImageCard";

import stackIllustration1 from "../images/stackIllustration.svg";
import stackIllustration2 from "../images/stackIllustration2.svg";
import stackIllustration3 from "../images/stackIllustration3.svg";
import stackIllustration4 from "../images/stackIllustration4.svg";

const STACK_ILLUSTRATIONS = [stackIllustration1, stackIllustration2, stackIllustration3, stackIllustration4];

export function GenerationCards(props: {
  apiBaseUrl: ApiBaseUrl;
  generations: Generation[];
  selectedGenerationId: string | null;
  workflows: WorkflowSummary[];
  assetTypeRegistry: AssetTypeRegistry;
  loading: boolean;
  fillingSlots?: Set<string>;
  queuedSlots?: Set<string>;
  onOpenGeneration: (g: Generation) => void;
  onDelete?: (generationId: string) => void;
  assetUrl: (apiBaseUrl: ApiBaseUrl, asset: Asset) => string;
  onOpenAsset: (g: Generation, asset: Asset) => void;
  onFillSlot?: (generationId: string, slotIndex: number) => void;
  layout?: "list" | "grid";
  showDelete?: boolean;
  showUser?: boolean;
  userLabelById?: Record<string, string>;
}) {
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set());
  const containerClass =
    props.layout === "grid" ? "grid grid-cols-1 gap-4 lg:grid-cols-2" : "divide-y divide-zinc-200 dark:divide-zinc-800";

  const toggleExpand = (generationId: string) => {
    setExpandedSets((prev) => {
      const next = new Set(prev);
      if (next.has(generationId)) {
        next.delete(generationId);
      } else {
        next.add(generationId);
      }
      return next;
    });
  };

  return (
    <div className={containerClass}>
      {props.generations.map((g) => {
        const workflow = findWorkflow(props.workflows, g.workflowUsed);
        const outputMode = getOutputMode(g, props.workflows, props.assetTypeRegistry);
        const isSelected = g.id === props.selectedGenerationId;
        const userId = props.showUser ? g.userId : undefined;
        const userLabel = userId ? props.userLabelById?.[userId] ?? userId : undefined;

        if (outputMode === "layered_image") {
          return (
            <LayeredImageCard
              key={g.id}
              generation={g}
              workflow={workflow}
              isSelected={isSelected}
              apiBaseUrl={props.apiBaseUrl}
              assetUrl={props.assetUrl}
              onOpenGeneration={props.onOpenGeneration}
              onOpenAsset={props.onOpenAsset}
              onDelete={props.onDelete}
              loading={props.loading}
              showDelete={props.showDelete}
              userId={userId}
              userLabel={userLabel}
            />
          );
        }

        if (outputMode === "full_set") {
          return (
            <FullSetCard
              key={g.id}
              generation={g}
              workflow={workflow}
              isSelected={isSelected}
              expanded={expandedSets.has(g.id)}
              onToggleExpand={() => toggleExpand(g.id)}
              apiBaseUrl={props.apiBaseUrl}
              assetUrl={props.assetUrl}
              onOpenGeneration={props.onOpenGeneration}
              onOpenAsset={props.onOpenAsset}
              onDelete={props.onDelete}
              loading={props.loading}
              fillingSlots={props.fillingSlots}
              queuedSlots={props.queuedSlots}
              showDelete={props.showDelete}
              userId={userId}
              userLabel={userLabel}
              assetTypeRegistry={props.assetTypeRegistry}
            />
          );
        }

        if (outputMode === "single_audio") {
          return (
            <SingleAudioCard
              key={g.id}
              generation={g}
              workflow={workflow}
              isSelected={isSelected}
              apiBaseUrl={props.apiBaseUrl}
              assetUrl={props.assetUrl}
              onOpenGeneration={props.onOpenGeneration}
              onOpenAsset={props.onOpenAsset}
              onDelete={props.onDelete}
              loading={props.loading}
              showDelete={props.showDelete}
              userId={userId}
              userLabel={userLabel}
            />
          );
        }

        const previewAssets = pickPreviewAssets(g, props.workflows, props.assetTypeRegistry);
        const latestBatchPreview = [...g.assets]
          .filter((a) => a.type === "preview" && a.itemIndex !== null && a.itemIndex !== undefined)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

        return (
          <SingleImageCard
            key={g.id}
            generation={g}
            workflow={workflow}
            isSelected={isSelected}
            previewAssets={previewAssets}
            latestBatchPreview={latestBatchPreview}
            apiBaseUrl={props.apiBaseUrl}
            assetUrl={props.assetUrl}
            onOpenGeneration={props.onOpenGeneration}
            onOpenAsset={props.onOpenAsset}
            onDelete={props.onDelete}
            onFillSlot={props.onFillSlot}
            fillingSlots={props.fillingSlots}
            queuedSlots={props.queuedSlots}
            loading={props.loading}
            showDelete={props.showDelete}
            userId={userId}
            userLabel={userLabel}
          />
        );
      })}
    </div>
  );
}

export function GenerationHistoryList(props: {
  apiBaseUrl: ApiBaseUrl;
  title: string;
  generations: Generation[];
  selectedGenerationId: string | null;
  workflows: WorkflowSummary[];
  assetTypeRegistry: AssetTypeRegistry;
  loading: boolean;
  fillingSlots?: Set<string>;
  queuedSlots?: Set<string>;
  onRefresh: () => void;
  onOpenGeneration: (g: Generation) => void;
  onDelete: (generationId: string) => void;
  assetUrl: (apiBaseUrl: ApiBaseUrl, asset: Asset) => string;
  onOpenAsset: (g: Generation, asset: Asset) => void;
  onFillSlot?: (generationId: string, slotIndex: number) => void;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const illustration = useMemo(() => STACK_ILLUSTRATIONS[Math.floor(Math.random() * STACK_ILLUSTRATIONS.length)], [props.generations]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{props.title}</div>
          <button
            className="text-xs text-zinc-700 hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-300 dark:hover:text-white"
            onClick={props.onRefresh}
            disabled={props.loading}
            type="button"
          >
            Refresh
          </button>
        </div>

        {props.generations.length === 0 ? (
          <div className="mt-4 flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
            <img src={illustration} alt="" className="mb-3 h-24 w-24" draggable={false} />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No generations yet.</p>
          </div>
        ) : (
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
            <GenerationCards
              apiBaseUrl={props.apiBaseUrl}
              generations={props.generations}
              selectedGenerationId={props.selectedGenerationId}
              workflows={props.workflows}
              assetTypeRegistry={props.assetTypeRegistry}
              loading={props.loading}
              fillingSlots={props.fillingSlots}
              queuedSlots={props.queuedSlots}
              onOpenGeneration={props.onOpenGeneration}
              onDelete={props.onDelete}
              assetUrl={props.assetUrl}
              onOpenAsset={props.onOpenAsset}
              onFillSlot={props.onFillSlot}
              layout="list"
              showDelete={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
