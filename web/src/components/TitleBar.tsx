import { useCallback, useEffect, useState } from "react";
import { TbMinus, TbSquare, TbSquares, TbX } from "react-icons/tb";
import type { ApiBaseUrl } from "../api";
import { isTauri } from "../tauri-api";
import { useProviderStatus } from "../useProviderStatus";
import { ProviderStatusIndicator } from "./ProviderStatusIndicator";

interface TitleBarProps {
  apiBaseUrl: ApiBaseUrl;
  enabledProviders: Record<string, boolean>;
}

export function TitleBar({ apiBaseUrl, enabledProviders }: TitleBarProps) {
  const inTauri = isTauri();
  const [maximized, setMaximized] = useState(false);
  const { status, loading } = useProviderStatus({
    apiBaseUrl,
    fetchOnMount: true,
    autoRefreshMs: 30_000,
  });

  useEffect(() => {
    if (!inTauri) return;
    let cancelled = false;
    const sync = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const window = getCurrentWindow();
      const next = await window.isMaximized();
      if (!cancelled) setMaximized(next);
    };
    void sync();
    window.addEventListener("resize", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", sync);
    };
  }, [inTauri]);

  const handleMinimize = useCallback(async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const window = getCurrentWindow();
    await window.toggleMaximize();
    setMaximized(await window.isMaximized());
  }, []);

  const handleClose = useCallback(async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  }, []);

  const handleDragStart = useCallback(async (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const window = getCurrentWindow();
    if (event.detail === 2) {
      await window.toggleMaximize();
      setMaximized(await window.isMaximized());
    } else {
      await window.startDragging();
    }
  }, []);

  return (
    <div
      className="titlebar relative flex h-8 shrink-0 select-none items-center justify-between border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-black"
      onMouseDown={inTauri ? handleDragStart : undefined}
    >
      <div className="flex items-center gap-1.5 pl-3">
        <span className="text-xs font-semibold tracking-wide text-zinc-500 dark:text-zinc-400">
          img<sup className="text-[8px]">2</sup>
        </span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-full items-center justify-center">
        <div className="pointer-events-auto">
          <ProviderStatusIndicator status={status} loading={loading} compact enabledProviders={enabledProviders} />
        </div>
      </div>

      {inTauri ? (
        <div className="flex h-full items-stretch">
          <button type="button" onClick={handleMinimize} onMouseDown={(event) => event.stopPropagation()} className="inline-flex w-11 items-center justify-center text-zinc-500 transition-colors hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label="Minimize">
            <TbMinus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={handleToggleMaximize} onMouseDown={(event) => event.stopPropagation()} className="inline-flex w-11 items-center justify-center text-zinc-500 transition-colors hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label={maximized ? "Restore" : "Maximize"}>
            {maximized ? <TbSquares className="h-3.5 w-3.5" /> : <TbSquare className="h-3 w-3" />}
          </button>
          <button type="button" onClick={handleClose} onMouseDown={(event) => event.stopPropagation()} className="inline-flex w-11 items-center justify-center text-zinc-500 transition-colors hover:bg-red-500 hover:text-white dark:text-zinc-400 dark:hover:bg-red-500 dark:hover:text-white" aria-label="Close">
            <TbX className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
