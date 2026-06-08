import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { TbPlus, TbPencil, TbTrash, TbSearch, TbX, TbDownload } from "react-icons/tb";
import type { SavedPrompt } from "../types";
import { cn } from "../utils/cn";
import { extractVariables } from "../utils/promptVariables";
import { downloadJson, buildSavedPromptsExport } from "../utils/exportJson";

const VARIABLE_COLORS = [
  { bg: "bg-accent-sky/20",    text: "text-accent-sky"    },
  { bg: "bg-accent-coral/20",  text: "text-accent-coral"  },
  { bg: "bg-accent-forest/20", text: "text-accent-forest" },
  { bg: "bg-accent-blush/30",  text: "text-accent-ember"  },
  { bg: "bg-accent-mist/40",   text: "text-accent-forest" },
  { bg: "bg-accent-ember/20",  text: "text-accent-ember"  },
];

function getVariableColor(index: number) {
  return VARIABLE_COLORS[index % VARIABLE_COLORS.length];
}

type PromptManagerPanelProps = {
  savedPrompts: SavedPrompt[];
  onSavedPromptsChange: (next: SavedPrompt[]) => void;
};

export function PromptManagerPanel({ savedPrompts, onSavedPromptsChange }: PromptManagerPanelProps) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editText, setEditText] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 300)}px`;
  }, []);

  useEffect(() => {
    if (editingId && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [editingId]);

  useEffect(() => {
    if (editingId) {
      // Wait a tick for the textarea to render with content
      requestAnimationFrame(resizeTextarea);
    }
  }, [editingId, resizeTextarea]);

  function renderHighlightedText(text: string) {
    const vars = extractVariables(text);
    if (vars.length === 0) return <span>{text}</span>;
    // Build a map of variable name -> color index (first-occurrence order)
    const colorMap = new Map<string, number>();
    vars.forEach((v, i) => colorMap.set(v, i));
    // Split by [VAR] pattern
    const parts: React.ReactNode[] = [];
    const regex = /\[([^\[\]]+)\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const varName = match[1];
      const colorIdx = colorMap.get(varName);
      if (lastIndex < match.index) {
        parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
      }
      if (colorIdx !== undefined) {
        const color = getVariableColor(colorIdx);
        parts.push(
          <span key={`v-${match.index}`} className={cn("rounded px-0.5", color.bg, color.text)}>
            {match[0]}
          </span>
        );
      } else {
        parts.push(<span key={`v-${match.index}`}>{match[0]}</span>);
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }
    return <>{parts}</>;
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return savedPrompts;
    const q = search.toLowerCase();
    return savedPrompts.filter(
      (p) => p.name.toLowerCase().includes(q) || p.text.toLowerCase().includes(q)
    );
  }, [savedPrompts, search]);

  function handleCreate() {
    const now = new Date().toISOString();
    const newPrompt: SavedPrompt = {
      id: crypto.randomUUID(),
      name: "",
      text: "",
      createdAt: now,
      updatedAt: now,
    };
    onSavedPromptsChange([newPrompt, ...savedPrompts]);
    setEditingId(newPrompt.id);
    setEditName("");
    setEditText("");
  }

  function handleSave() {
    if (!editingId) return;
    const name = editName.trim();
    const text = editText.trim();
    if (!name && !text) {
      // Remove empty unsaved prompt
      onSavedPromptsChange(savedPrompts.filter((p) => p.id !== editingId));
      setEditingId(null);
      return;
    }
    const now = new Date().toISOString();
    onSavedPromptsChange(
      savedPrompts.map((p) =>
        p.id === editingId ? { ...p, name: name || "Untitled", text, updatedAt: now } : p
      )
    );
    setEditingId(null);
  }

  function handleEdit(prompt: SavedPrompt) {
    setEditingId(prompt.id);
    setEditName(prompt.name);
    setEditText(prompt.text);
  }

  function handleDelete(id: string) {
    onSavedPromptsChange(savedPrompts.filter((p) => p.id !== id));
    if (editingId === id) setEditingId(null);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Prompts</h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              downloadJson(
                buildSavedPromptsExport(savedPrompts),
                `saved-prompts-${Date.now()}.json`
              );
            }}
            disabled={savedPrompts.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <TbDownload className="h-3.5 w-3.5" />
            Export
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <TbPlus className="h-3.5 w-3.5" />
            New Prompt
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <div className="relative">
          <TbSearch className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter prompts…"
            className="w-full rounded-lg border border-zinc-200 bg-transparent py-1.5 pl-8 pr-8 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <TbX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {savedPrompts.length === 0
                ? "No saved prompts yet. Click \"New Prompt\" to create one."
                : "No prompts match your search."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {filtered.map((prompt) =>
              editingId === prompt.id ? (
                <div key={prompt.id} className="space-y-2 bg-zinc-50 px-4 py-3 dark:bg-zinc-900/50">
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Prompt name"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />
                  <div className="relative w-full rounded-lg border border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800">
                    <div
                      ref={backdropRef}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-sm"
                    >
                      {renderHighlightedText(editText)}
                    </div>
                    <textarea
                      ref={textareaRef}
                      value={editText}
                      onChange={(e) => {
                        setEditText(e.target.value);
                        resizeTextarea();
                      }}
                      onScroll={() => {
                        if (textareaRef.current && backdropRef.current) {
                          backdropRef.current.scrollTop = textareaRef.current.scrollTop;
                        }
                      }}
                      placeholder="Prompt text"
                      rows={1}
                      spellCheck={false}
                      className="relative w-full resize-none bg-transparent px-3 py-1.5 font-mono text-sm text-transparent caret-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:caret-zinc-100 dark:placeholder:text-zinc-500"
                    />
                  </div>
                  {(() => {
                    const vars = extractVariables(editText);
                    if (vars.length === 0) return null;
                    return (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-zinc-400">Variables:</span>
                        {vars.map((v, i) => {
                          const color = getVariableColor(i);
                          return (
                            <span key={v} className={cn("rounded px-1.5 py-0.5 text-[11px] font-mono font-medium", color.bg, color.text)}>
                              [{v}]
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Cancel: remove if new & empty, otherwise revert
                        const existing = savedPrompts.find((p) => p.id === editingId);
                        if (existing && !existing.name && !existing.text) {
                          onSavedPromptsChange(savedPrompts.filter((p) => p.id !== editingId));
                        }
                        setEditingId(null);
                      }}
                      className="rounded-lg px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={prompt.id}
                  className="group flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {prompt.name || "Untitled"}
                      </span>
                      {extractVariables(prompt.text).length > 0 ? (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {extractVariables(prompt.text).length} var{extractVariables(prompt.text).length > 1 ? "s" : ""}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {prompt.text || "No content"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleEdit(prompt)}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                      title="Edit"
                    >
                      <TbPencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(prompt.id)}
                      className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                      title="Delete"
                    >
                      <TbTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
