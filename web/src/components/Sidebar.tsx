import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  TbSettings,
  TbWand,
  TbPhoto,
  TbPin,
  TbPinFilled,
  TbFolder,
  TbFolderOpen,
  TbChevronRight,
  TbChevronDown,
  TbPlus,
  TbPencil,
  TbTrash,
  TbGripVertical,
  TbLayoutBoard,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
  TbX,
  TbColumns,
  TbBookmark,
  TbHeadphones,
  TbMessageCircle,
} from "react-icons/tb";
import type { CanvasMeta } from "../canvas/canvasStorage";
import type { WorkflowId } from "../workflows";
import type { WorkflowOrganization, WorkflowOrderItem, WorkflowFolder } from "../api";
import { openStorageFolder } from "../tauri-api";
import { cn } from "../utils/cn";
import logoText from "../images/logoText.svg";
import { DiscoveryDot } from "./onboarding/DiscoveryDot";
import { setFeatureExplored } from "../lib/onboarding";

export type FakeRole = "user" | "admin";

export interface SidebarWorkflow {
  id: string;
  label: string;
  providerAvailable?: boolean;
  engine?: string;
}

const ENGINE_LOGOS: Record<string, string> = {
  comfy: "/comfyui.svg",
  comfyui: "/comfyui.svg",
  openrouter: "/openrouter.svg",
  replicate: "/replicate.svg",
  fal: "/fal.svg",
  kie: "/kieai.svg",
};

// ─── Sortable Workflow Item ─────────────────────────────────────────

function SortableWorkflowItem(props: {
  id: string;
  workflow: SidebarWorkflow;
  isActive: boolean;
  isPinned: boolean;
  onSelect: () => void;
  onTogglePin?: () => void;
  enabledProviders?: Record<string, boolean>;
}) {
  const { workflow: w, isActive, isPinned, onSelect, onTogglePin, enabledProviders } = props;
  // Hide workflows for unconfigured/disabled providers entirely
  const isHidden = w.providerAvailable === false ||
    (enabledProviders != null && w.engine != null && enabledProviders[w.engine] === false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  if (isHidden) return null;

  return (
    <div ref={setNodeRef} style={style} className="group/row relative flex items-center pl-4" {...attributes} {...listeners}>
      {isActive && (
        <span className="absolute left-1 flex items-center justify-center">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
        </span>
      )}
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-2.5 text-left text-sm transition-colors",
          isActive
            ? "font-medium text-zinc-900 dark:text-zinc-100"
            : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-100"
        )}
        aria-current={isActive ? "page" : undefined}
        title={w.label}
      >
        {w.engine && ENGINE_LOGOS[w.engine] && (
          <span
            className="inline-block h-3.5 w-3.5 shrink-0 bg-current"
            style={{
              mask: `url(${ENGINE_LOGOS[w.engine]}) center/contain no-repeat`,
              WebkitMask: `url(${ENGINE_LOGOS[w.engine]}) center/contain no-repeat`,
            }}
          />
        )}
        <span className="min-w-0 truncate">{w.label}</span>
      </button>
      {onTogglePin && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          className={cn(
            "absolute right-1 rounded p-1 transition-colors",
            isPinned
              ? "text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-400"
              : "text-zinc-300 opacity-0 group-hover/row:opacity-100 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
          )}
          title={isPinned ? "Unpin workflow" : "Pin workflow"}
          aria-label={isPinned ? "Unpin workflow" : "Pin workflow"}
        >
          {isPinned ? <TbPinFilled className="h-3.5 w-3.5" /> : <TbPin className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

// ─── Drag Overlay (ghost while dragging) ────────────────────────────

function DragOverlayContent(props: { label: string; engine?: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-zinc-100/90 px-2 py-2.5 text-sm font-medium text-zinc-900 shadow-sm backdrop-blur-sm dark:bg-zinc-800/90 dark:text-zinc-100">
      {props.engine && ENGINE_LOGOS[props.engine] && (
        <span
          className="inline-block h-3.5 w-3.5 shrink-0 bg-current"
          style={{
            mask: `url(${ENGINE_LOGOS[props.engine]}) center/contain no-repeat`,
            WebkitMask: `url(${ENGINE_LOGOS[props.engine]}) center/contain no-repeat`,
          }}
        />
      )}
      <span className="min-w-0 truncate">{props.label}</span>
    </div>
  );
}

// ─── Folder Component ───────────────────────────────────────────────

const COLLAPSED_FOLDERS_KEY = "imgimg.sidebar.collapsedFolders";
const COLLAPSED_PROVIDERS_KEY = "imgimg.sidebar.collapsedProviders";

const ENGINE_DISPLAY_ORDER: string[] = ["replicate", "fal", "openrouter", "kie", "comfy", "comfyui"];

const ENGINE_LABELS: Record<string, string> = {
  replicate: "Replicate",
  fal: "FAL",
  openrouter: "OpenRouter",
  kie: "kie.ai",
  comfy: "ComfyUI",
  comfyui: "ComfyUI",
};

function getCollapsedProviders(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_PROVIDERS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function persistCollapsedProviders(set: Set<string>) {
  localStorage.setItem(COLLAPSED_PROVIDERS_KEY, JSON.stringify([...set]));
}

function getCollapsedFolders(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_FOLDERS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persistCollapsedFolders(ids: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_FOLDERS_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

function FolderHeader(props: {
  folder: WorkflowFolder;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  itemCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(props.folder.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== props.folder.name) {
      props.onRename(trimmed);
    }
    setEditing(false);
  };

  return (
    <div className="group/folder relative flex items-center gap-1 rounded-lg px-2 py-1.5">
      <button
        type="button"
        onClick={props.onToggleCollapse}
        className="flex shrink-0 items-center text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        aria-label={props.isCollapsed ? "Expand folder" : "Collapse folder"}
      >
        {props.isCollapsed ? <TbChevronRight className="h-3.5 w-3.5" /> : <TbChevronDown className="h-3.5 w-3.5" />}
      </button>
      {props.isCollapsed
        ? <TbFolder className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
        : <TbFolderOpen className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
      }
      {editing ? (
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setEditName(props.folder.name); setEditing(false); }
          }}
          className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-900 outline-none focus:border-accent-sky dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      ) : (
        <button
          type="button"
          onClick={props.onToggleCollapse}
          className="min-w-0 flex-1 truncate text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
        >
          {props.folder.name}
          {props.isCollapsed && props.itemCount > 0 && (
            <span className="ml-1 text-zinc-300 dark:text-zinc-600">({props.itemCount})</span>
          )}
        </button>
      )}
      {/* Folder actions */}
      {!editing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/folder:opacity-100">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditName(props.folder.name); setEditing(true); }}
            className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            title="Rename folder"
            aria-label="Rename folder"
          >
            <TbPencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowMenu(true); }}
            className="rounded p-0.5 text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
            title="Delete folder"
            aria-label="Delete folder"
          >
            <TbTrash className="h-3 w-3" />
          </button>
        </div>
      )}
      {/* Delete confirmation */}
      {showMenu && (
        <div className="absolute right-0 top-full z-20 mt-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-300">Delete folder?</p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => { props.onDelete(); setShowMenu(false); }}
              className="rounded bg-red-500 px-2 py-0.5 text-xs text-white hover:bg-red-600"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setShowMenu(false)}
              className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Droppable Folder Zone ───────────────────────────────────────────

function DroppableFolderZone(props: {
  folderId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-drop-${props.folderId}`,
    data: { type: "folder", folderId: props.folderId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg transition-colors",
        isOver && "bg-accent-sky/10 ring-1 ring-accent-sky/40 dark:bg-accent-sky/10 dark:ring-accent-sky/30"
      )}
    >
      {props.children}
    </div>
  );
}

// ─── Sortable Workflow List (with DnD + Folders) ────────────────────

type SortableItem = {
  sortId: string;
  workflowId: string;
  folderId: string | null;
};

function buildSortedList(
  workflows: SidebarWorkflow[],
  pinnedIds: Set<string>,
  organization: WorkflowOrganization | null,
  folderId: string | null
): SortableItem[] {
  const workflowMap = new Map(workflows.map((w) => [w.id, w]));

  if (!organization || organization.items.length === 0) {
    // No custom ordering: pinned first, then unpinned, all in root
    if (folderId !== null) return [];
    const pinned = workflows.filter((w) => pinnedIds.has(w.id));
    const unpinned = workflows.filter((w) => !pinnedIds.has(w.id));
    return [...pinned, ...unpinned].map((w) => ({
      sortId: `wf-${w.id}`,
      workflowId: w.id,
      folderId: null,
    }));
  }

  // Use custom ordering
  const orderedInFolder = organization.items
    .filter((item) => item.folderId === folderId && workflowMap.has(item.workflowId))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({
      sortId: `wf-${item.workflowId}`,
      workflowId: item.workflowId,
      folderId: item.folderId,
    }));

  // For root level, also include workflows not in any ordering (new workflows)
  if (folderId === null) {
    const orderedIds = new Set(organization.items.map((i) => i.workflowId));
    const unordered = workflows
      .filter((w) => !orderedIds.has(w.id))
      .map((w) => ({
        sortId: `wf-${w.id}`,
        workflowId: w.id,
        folderId: null,
      }));
    return [...orderedInFolder, ...unordered];
  }

  return orderedInFolder;
}

function SortableWorkflowList(props: {
  workflows: SidebarWorkflow[];
  activeWorkflow: WorkflowId;
  onWorkflowChange: (next: WorkflowId) => void;
  pinnedWorkflowIds?: string[];
  onTogglePin?: (workflowId: string) => void;
  organization: WorkflowOrganization | null;
  onReorderWorkflows?: (items: WorkflowOrderItem[]) => void;
  onCreateFolder?: (name: string) => void;
  onRenameFolder?: (folderId: string, name: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  enabledProviders?: Record<string, boolean>;
}) {
  const [collapsedFolders, setCollapsedState] = useState<Set<string>>(getCollapsedFolders);
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(getCollapsedProviders);
  const [activeId, setActiveId] = useState<string | null>(null);

  const pinnedSet = useMemo(() => new Set(props.pinnedWorkflowIds ?? []), [props.pinnedWorkflowIds]);
  const workflowMap = useMemo(() => new Map(props.workflows.map((w) => [w.id, w])), [props.workflows]);

  const folders = useMemo(
    () => (props.organization?.folders ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [props.organization?.folders]
  );

  // Build the flat list of root items
  const rootItems = useMemo(
    () => buildSortedList(props.workflows, pinnedSet, props.organization, null),
    [props.workflows, pinnedSet, props.organization]
  );

  // Build items per folder
  const folderItems = useMemo(() => {
    const map = new Map<string, SortableItem[]>();
    for (const folder of folders) {
      map.set(folder.id, buildSortedList(props.workflows, pinnedSet, props.organization, folder.id));
    }
    return map;
  }, [folders, props.workflows, pinnedSet, props.organization]);

  // All sortable IDs
  const allSortableIds = useMemo(() => {
    const ids: string[] = [];
    for (const item of rootItems) ids.push(item.sortId);
    for (const folder of folders) {
      const items = folderItems.get(folder.id) ?? [];
      for (const item of items) ids.push(item.sortId);
    }
    return ids;
  }, [rootItems, folders, folderItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Custom collision detection: prefer folder droppables (pointerWithin) over sortable items (closestCenter)
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      // First check if pointer is inside a folder droppable
      const pointerCollisions = pointerWithin(args);
      const folderCollision = pointerCollisions.find(
        (c) => String(c.id).startsWith("folder-drop-")
      );
      if (folderCollision) {
        return [folderCollision];
      }

      // Fall back to closest center for sortable items
      return closestCenter(args);
    },
    []
  );

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedState((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      persistCollapsedFolders(next);
      return next;
    });
  }, []);

  const toggleProvider = useCallback((engine: string) => {
    setCollapsedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(engine)) next.delete(engine);
      else next.add(engine);
      persistCollapsedProviders(next);
      return next;
    });
  }, []);

  const activeWorkflow = activeId
    ? workflowMap.get(activeId.replace("wf-", ""))
    : null;

  // Compute new ordering after a drag
  const computeReorder = useCallback(
    (activeIdStr: string, overIdStr: string): WorkflowOrderItem[] | null => {
      const allItems: SortableItem[] = [...rootItems];
      for (const folder of folders) {
        const items = folderItems.get(folder.id) ?? [];
        allItems.push(...items);
      }

      const activeIdx = allItems.findIndex((i) => i.sortId === activeIdStr);
      const overIdx = allItems.findIndex((i) => i.sortId === overIdStr);
      if (activeIdx === -1 || overIdx === -1) return null;

      // Determine the target folder: use the over item's folder
      const targetFolderId = allItems[overIdx].folderId;
      const reordered = arrayMove(allItems, activeIdx, overIdx);
      // Update the moved item's folder
      reordered[overIdx] = { ...reordered[overIdx], folderId: targetFolderId };

      return reordered.map((item, idx) => ({
        workflowId: item.workflowId,
        folderId: item.folderId,
        sortOrder: idx,
      }));
    },
    [rootItems, folders, folderItems]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  // Move a workflow into a folder (appending at end)
  const moveToFolder = useCallback(
    (workflowSortId: string, targetFolderId: string): WorkflowOrderItem[] | null => {
      const allItems: SortableItem[] = [...rootItems];
      for (const folder of folders) {
        const items = folderItems.get(folder.id) ?? [];
        allItems.push(...items);
      }

      const activeIdx = allItems.findIndex((i) => i.sortId === workflowSortId);
      if (activeIdx === -1) return null;

      // Remove from current position
      const [moved] = allItems.splice(activeIdx, 1);

      // Find last item in target folder and insert after it
      let insertIdx = -1;
      for (let i = allItems.length - 1; i >= 0; i--) {
        if (allItems[i].folderId === targetFolderId) {
          insertIdx = i + 1;
          break;
        }
      }
      // If no items in folder yet, find the folder's position in the render order
      // and insert right after where folder items would go
      if (insertIdx === -1) {
        // Just append with the target folder assignment
        insertIdx = allItems.length;
      }

      allItems.splice(insertIdx, 0, { ...moved, folderId: targetFolderId });

      return allItems.map((item, idx) => ({
        workflowId: item.workflowId,
        folderId: item.folderId,
        sortOrder: idx,
      }));
    },
    [rootItems, folders, folderItems]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const overId = String(over.id);

      // Check if dropped onto a folder droppable zone
      if (overId.startsWith("folder-drop-")) {
        const targetFolderId = overId.replace("folder-drop-", "");
        const newItems = moveToFolder(String(active.id), targetFolderId);
        if (newItems && props.onReorderWorkflows) {
          props.onReorderWorkflows(newItems);
        }
        return;
      }

      // Normal reorder between sortable items
      const newItems = computeReorder(String(active.id), overId);
      if (newItems && props.onReorderWorkflows) {
        props.onReorderWorkflows(newItems);
      }
    },
    [computeReorder, moveToFolder, props.onReorderWorkflows]
  );

  if (props.workflows.length === 0) {
    return (
      <div className="rounded-lg px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
        No workflows available
      </div>
    );
  }

  // Separate pinned (root-level only, at the top) from everything else
  const pinnedRoot = rootItems.filter((item) => pinnedSet.has(item.workflowId));
  const unpinnedRoot = rootItems.filter((item) => !pinnedSet.has(item.workflowId));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
        {/* Pinned workflows */}
        {pinnedRoot.map((item) => {
          const w = workflowMap.get(item.workflowId);
          if (!w) return null;
          return (
            <SortableWorkflowItem
              key={item.sortId}
              id={item.sortId}
              workflow={w}
              isActive={w.id === props.activeWorkflow}
              isPinned={true}
              onSelect={() => props.onWorkflowChange(w.id as WorkflowId)}
              onTogglePin={props.onTogglePin ? () => props.onTogglePin!(w.id) : undefined}
              enabledProviders={props.enabledProviders}
            />
          );
        })}

        {/* Separator between pinned and rest */}
        {pinnedRoot.length > 0 && (unpinnedRoot.length > 0 || folders.length > 0) && (
          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
        )}

        {/* Folders */}
        {folders.map((folder) => {
          const items = folderItems.get(folder.id) ?? [];
          const isCollapsed = collapsedFolders.has(folder.id);
          return (
            <DroppableFolderZone key={folder.id} folderId={folder.id}>
              <FolderHeader
                folder={folder}
                isCollapsed={isCollapsed}
                onToggleCollapse={() => toggleFolder(folder.id)}
                onRename={(name) => props.onRenameFolder?.(folder.id, name)}
                onDelete={() => props.onDeleteFolder?.(folder.id)}
                itemCount={items.length}
              />
              {!isCollapsed && (
                <div className="ml-3 border-l border-zinc-100 pl-1 dark:border-zinc-800">
                  {items.map((item) => {
                    const w = workflowMap.get(item.workflowId);
                    if (!w) return null;
                    return (
                      <SortableWorkflowItem
                        key={item.sortId}
                        id={item.sortId}
                        workflow={w}
                        isActive={w.id === props.activeWorkflow}
                        isPinned={pinnedSet.has(w.id)}
                        onSelect={() => props.onWorkflowChange(w.id as WorkflowId)}
                        onTogglePin={props.onTogglePin ? () => props.onTogglePin!(w.id) : undefined}
                        enabledProviders={props.enabledProviders}
                      />
                    );
                  })}
                  {items.length === 0 && (
                    <div className="px-3 py-1.5 text-xs italic text-zinc-400 dark:text-zinc-600">
                      Drop workflows here
                    </div>
                  )}
                </div>
              )}
            </DroppableFolderZone>
          );
        })}

        {/* Unpinned root workflows — grouped by provider */}
        {(() => {
          // Group unpinned workflows by engine
          const byEngine = new Map<string, SortableItem[]>();
          for (const item of unpinnedRoot) {
            const w = workflowMap.get(item.workflowId);
            const engine = w?.engine ?? "_other";
            if (!byEngine.has(engine)) byEngine.set(engine, []);
            byEngine.get(engine)!.push(item);
          }

          // Sort engines by display order
          const sortedEngines = [...byEngine.keys()].sort((a, b) => {
            const ia = ENGINE_DISPLAY_ORDER.indexOf(a);
            const ib = ENGINE_DISPLAY_ORDER.indexOf(b);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
          });

          // If only one engine group, render flat (no headers)
          if (sortedEngines.length <= 1) {
            return unpinnedRoot.map((item) => {
              const w = workflowMap.get(item.workflowId);
              if (!w) return null;
              return (
                <SortableWorkflowItem
                  key={item.sortId}
                  id={item.sortId}
                  workflow={w}
                  isActive={w.id === props.activeWorkflow}
                  isPinned={false}
                  onSelect={() => props.onWorkflowChange(w.id as WorkflowId)}
                  onTogglePin={props.onTogglePin ? () => props.onTogglePin!(w.id) : undefined}
                  enabledProviders={props.enabledProviders}
                />
              );
            });
          }

          return sortedEngines.map((engine) => {
            const items = byEngine.get(engine) ?? [];
            // Check if all items in this group would be hidden
            const hasVisible = items.some((item) => {
              const w = workflowMap.get(item.workflowId);
              if (!w) return false;
              const hidden = w.providerAvailable === false ||
                (props.enabledProviders != null && w.engine != null && props.enabledProviders[w.engine] === false);
              return !hidden;
            });
            if (!hasVisible) return null;

            const isCollapsed = collapsedProviders.has(engine);
            const label = ENGINE_LABELS[engine] ?? engine;

            return (
              <div key={`provider-${engine}`}>
                <button
                  type="button"
                  onClick={() => toggleProvider(engine)}
                  className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  {isCollapsed ? (
                    <TbChevronRight className="h-3 w-3" />
                  ) : (
                    <TbChevronDown className="h-3 w-3" />
                  )}
                  {ENGINE_LOGOS[engine] && (
                    <span
                      className="inline-block h-3 w-3 shrink-0 bg-current"
                      style={{
                        mask: `url(${ENGINE_LOGOS[engine]}) center/contain no-repeat`,
                        WebkitMask: `url(${ENGINE_LOGOS[engine]}) center/contain no-repeat`,
                      }}
                    />
                  )}
                  {label}
                </button>
                {!isCollapsed && items.map((item) => {
                  const w = workflowMap.get(item.workflowId);
                  if (!w) return null;
                  return (
                    <SortableWorkflowItem
                      key={item.sortId}
                      id={item.sortId}
                      workflow={w}
                      isActive={w.id === props.activeWorkflow}
                      isPinned={false}
                      onSelect={() => props.onWorkflowChange(w.id as WorkflowId)}
                      onTogglePin={props.onTogglePin ? () => props.onTogglePin!(w.id) : undefined}
                      enabledProviders={props.enabledProviders}
                    />
                  );
                })}
              </div>
            );
          });
        })()}
      </SortableContext>

      <DragOverlay>
        {activeWorkflow ? <DragOverlayContent label={activeWorkflow.label} engine={activeWorkflow.engine} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────

export function Sidebar(props: {
  className?: string;
  workflow: WorkflowId;
  onWorkflowChange: (next: WorkflowId) => void;
  workflows: SidebarWorkflow[];
  activeView?: "generate" | "gallery" | "canvas" | "compare" | "prompts" | "audio" | "iterate";
  onSettingsOpen?: () => void;
  onGalleryOpen?: () => void;
  onPromptsOpen?: () => void;
  onCompareOpen?: () => void;
  onAudioOpen?: () => void;
  onIterateOpen?: () => void;
  onLogoClick?: () => void;
  pinnedWorkflowIds?: string[];
  onTogglePin?: (workflowId: string) => void;
  organization?: WorkflowOrganization | null;
  onReorderWorkflows?: (items: WorkflowOrderItem[]) => void;
  onCreateFolder?: (name: string) => void;
  onRenameFolder?: (folderId: string, name: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  // Canvas management
  canvases?: CanvasMeta[];
  activeCanvasId?: string | null;
  onCanvasSelect?: (id: string) => void;
  onCanvasCreate?: () => void;
  onCanvasDelete?: (id: string) => void;
  onCanvasRename?: (id: string, name: string) => void;
  // Collapse
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  // Resize
  width?: number;
  onWidthChange?: (width: number) => void;
  enabledProviders?: Record<string, boolean>;
}) {
  const galleryActive = props.activeView === "gallery";
  const promptsActive = props.activeView === "prompts";
  const compareActive = props.activeView === "compare";
  const audioActive = props.activeView === "audio";
  const iterateActive = props.activeView === "iterate";
  const canvasActive = props.activeView === "canvas";
  const [renamingCanvasId, setRenamingCanvasId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingCanvasId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingCanvasId]);

  const commitRename = useCallback(() => {
    if (renamingCanvasId && renameValue.trim()) {
      props.onCanvasRename?.(renamingCanvasId, renameValue.trim());
    }
    setRenamingCanvasId(null);
  }, [renamingCanvasId, renameValue, props.onCanvasRename]);

  // ── Resize handle logic ──
  const MIN_WIDTH = 200;
  const MAX_WIDTH = 480;
  const sidebarWidth = props.width ?? 288;
  const isResizing = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!props.onWidthChange) return;
      e.preventDefault();
      isResizing.current = true;
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const onMouseMove = (ev: MouseEvent) => {
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX)));
        props.onWidthChange!(newWidth);
      };
      const onMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [sidebarWidth, props.onWidthChange],
  );

  // Collapsed state — show a thin icon strip
  if (props.collapsed) {
    return (
      <aside className={props.className ?? "hidden w-12 shrink-0 flex-col items-center border-r border-zinc-200 bg-white py-3 lg:flex dark:border-zinc-800 dark:bg-black"}>
        <button
          type="button"
          onClick={props.onLogoClick}
          className="mb-2 flex items-center justify-center transition-opacity hover:opacity-70"
          title="Home"
          aria-label="Home"
        >
          <img src={logoText} alt="img²" className="h-8 w-8 object-contain dark:invert" />
        </button>
        <button
          type="button"
          onClick={props.onToggleCollapse}
          className="rounded p-1.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <TbLayoutSidebarLeftExpand className="h-4 w-4" />
        </button>

        {/* Spacer to push bottom icons down */}
        <div className="flex-1" />

        {/* Bottom icon buttons */}
        <div className="flex flex-col items-center gap-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
          {props.onGalleryOpen && (
            <button
              type="button"
              onClick={props.onGalleryOpen}
              className={cn(
                "rounded p-1.5 transition-colors",
                galleryActive
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              )}
              title="Gallery"
              aria-label="Gallery"
            >
              <TbPhoto className="h-4 w-4" />
            </button>
          )}
          {props.onAudioOpen && (
            <button
              type="button"
              onClick={props.onAudioOpen}
              className={cn(
                "rounded p-1.5 transition-colors",
                audioActive
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              )}
              title="Audio Desk"
              aria-label="Audio Desk"
            >
              <TbHeadphones className="h-4 w-4" />
            </button>
          )}
          {props.onIterateOpen && (
            <button
              type="button"
              onClick={props.onIterateOpen}
              className={cn(
                "rounded p-1.5 transition-colors",
                iterateActive
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              )}
              title="Iterate"
              aria-label="Iterate"
            >
              <TbMessageCircle className="h-4 w-4" />
            </button>
          )}
          {props.onPromptsOpen && (
            <button
              type="button"
              onClick={props.onPromptsOpen}
              className={cn(
                "rounded p-1.5 transition-colors",
                promptsActive
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              )}
              title="Prompts"
              aria-label="Prompts"
            >
              <TbBookmark className="h-4 w-4" />
            </button>
          )}
          {props.onCompareOpen && (
            <button
              type="button"
              onClick={props.onCompareOpen}
              className={cn(
                "rounded p-1.5 transition-colors",
                compareActive
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              )}
              title="Compare"
              aria-label="Compare"
            >
              <TbColumns className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => openStorageFolder()}
            className="rounded p-1.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            title="Open output folder"
            aria-label="Open output folder"
          >
            <TbFolderOpen className="h-4 w-4" />
          </button>
          {props.onSettingsOpen && (
            <button
              type="button"
              onClick={props.onSettingsOpen}
              className="rounded p-1.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              title="Settings"
              aria-label="Settings"
            >
              <TbSettings className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={props.className ?? "relative hidden shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex dark:border-zinc-800 dark:bg-black"}
      style={props.className ? undefined : { width: sidebarWidth }}
    >
      {/* Header: collapse toggle + Logo */}
      <div className="relative flex flex-col items-center px-3 py-3">
        {props.onToggleCollapse && (
          <button
            type="button"
            onClick={props.onToggleCollapse}
            className="absolute top-3 right-3 rounded p-1.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <TbLayoutSidebarLeftCollapse className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={props.onLogoClick}
          className="flex items-center justify-center transition-opacity hover:opacity-70"
          title="Home"
          aria-label="Home"
        >
          <img src={logoText} alt="img\u00B2" className="h-32 dark:invert" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3">
        {/* ── Canvases section ── */}
        {props.canvases && (
          <>
            <div className="mb-2 flex items-center justify-between px-2">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <TbLayoutBoard className="h-3.5 w-3.5" />
                Canvases
              </div>
              {props.onCanvasCreate && (
                <button
                  type="button"
                  onClick={props.onCanvasCreate}
                  className="rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                  title="New canvas"
                  aria-label="New canvas"
                >
                  <TbPlus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <nav className="mb-4 space-y-0.5">
              {props.canvases.map((canvas) => {
                const isActive = canvasActive && props.activeCanvasId === canvas.id;
                return (
                  <div key={canvas.id} className="group/crow relative flex items-center">
                    {/* Selection dot */}
                    <div className="relative flex shrink-0 items-center px-1">
                      {isActive && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
                        </span>
                      )}
                    </div>
                    {renamingCanvasId === canvas.id ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingCanvasId(null); }}
                        className="min-w-0 flex-1 rounded px-2 py-2 text-sm bg-zinc-100 dark:bg-zinc-800 outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => props.onCanvasSelect?.(canvas.id)}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm transition-colors",
                          isActive
                            ? "font-medium text-zinc-900 dark:text-zinc-100"
                            : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-100"
                        )}
                      >
                        <span className="min-w-0 truncate">{canvas.name}</span>
                      </button>
                    )}
                    {/* Rename / delete actions (on hover) */}
                    <div className="absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/crow:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setRenamingCanvasId(canvas.id); setRenameValue(canvas.name); }}
                        className="rounded p-1 text-zinc-300 transition-colors hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
                        title="Rename canvas"
                        aria-label="Rename canvas"
                      >
                        <TbPencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); props.onCanvasDelete?.(canvas.id); }}
                        className="rounded p-1 text-zinc-300 transition-colors hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400"
                        title="Delete canvas"
                        aria-label="Delete canvas"
                      >
                        <TbX className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {props.canvases.length === 0 && (
                <p className="px-2 py-2 text-xs text-zinc-400 dark:text-zinc-500">No canvases yet</p>
              )}
            </nav>
          </>
        )}

        {/* ── Workflows section ── */}
        <div className="mb-2 flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <TbWand className="h-3.5 w-3.5" />
            Workflows
          </div>
          {props.onCreateFolder && (
            <button
              type="button"
              onClick={() => props.onCreateFolder?.("New Folder")}
              className="rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              title="New folder"
              aria-label="New folder"
            >
              <TbPlus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <nav className="space-y-0.5">
          <SortableWorkflowList
            workflows={props.workflows}
            activeWorkflow={!canvasActive ? props.workflow : ""}
            onWorkflowChange={props.onWorkflowChange}
            pinnedWorkflowIds={props.pinnedWorkflowIds}
            onTogglePin={props.onTogglePin}
            organization={props.organization ?? null}
            onReorderWorkflows={props.onReorderWorkflows}
            onCreateFolder={props.onCreateFolder}
            onRenameFolder={props.onRenameFolder}
            onDeleteFolder={props.onDeleteFolder}
            enabledProviders={props.enabledProviders}
          />
        </nav>
      </div>

      {/* Bottom actions */}
      <div className="space-y-1 border-t border-zinc-200 p-3 dark:border-zinc-800">
        {props.onGalleryOpen && (
          <button
            type="button"
            onClick={() => { setFeatureExplored("gallery"); props.onGalleryOpen!(); }}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              galleryActive
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-100"
            )}
          >
            <TbPhoto className="h-4 w-4" />
            Gallery
            <DiscoveryDot feature="gallery" />
          </button>
        )}
        {props.onAudioOpen && (
          <button
            type="button"
            onClick={props.onAudioOpen}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              audioActive
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-100"
            )}
          >
            <TbHeadphones className="h-4 w-4" />
            Audio Desk
          </button>
        )}
        {props.onIterateOpen && (
          <button
            type="button"
            onClick={props.onIterateOpen}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              iterateActive
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-100"
            )}
          >
            <TbMessageCircle className="h-4 w-4" />
            Iterate
          </button>
        )}
        {props.onPromptsOpen && (
          <button
            type="button"
            onClick={props.onPromptsOpen}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              promptsActive
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-100"
            )}
          >
            <TbBookmark className="h-4 w-4" />
            Prompts
          </button>
        )}
        {props.onCompareOpen && (
          <button
            type="button"
            onClick={props.onCompareOpen}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              compareActive
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-100"
            )}
          >
            <TbColumns className="h-4 w-4" />
            Compare
          </button>
        )}
        <button
          type="button"
          onClick={() => openStorageFolder()}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-100"
        >
          <TbFolderOpen className="h-4 w-4" />
          Output folder
        </button>
        {props.onSettingsOpen && (
          <button
            type="button"
            onClick={props.onSettingsOpen}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-100"
          >
            <TbSettings className="h-4 w-4" />
            Settings
          </button>
        )}
      </div>

      {/* Resize handle */}
      {props.onWidthChange && (
        <div
          onMouseDown={handleMouseDown}
          className="absolute inset-y-0 -right-1 w-2 cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/30"
        />
      )}
    </aside>
  );
}

/**
 * Mobile sidebar overlay -- renders a backdrop + the Sidebar in a fixed
 * drawer on screens below `lg`.  Auto-closes on any navigation action.
 */
export function MobileSidebarOverlay(props: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        onClick={props.onClose}
        aria-label="Close sidebar"
      />
      <div className="absolute inset-y-0 left-0 w-72 shadow-xl">
        {props.children}
      </div>
    </div>
  );
}
