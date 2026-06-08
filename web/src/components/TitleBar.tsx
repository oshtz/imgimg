import { useCallback, useEffect, useState } from "react";
import { checkPortableUpdate, installPortableUpdate, isTauri, type PortableUpdateStatus } from "../tauri-api";
import { TbDownload, TbMinus, TbSquare, TbSquares, TbX } from "react-icons/tb";
import { ProviderStatusIndicator } from "./ProviderStatusIndicator";
import { useProviderStatus } from "../useProviderStatus";
import type { ApiBaseUrl } from "../api";

interface TitleBarProps {
  apiBaseUrl: ApiBaseUrl;
  enabledProviders: Record<string, boolean>;
}

/**
 * Custom title bar replacing the native OS chrome.
 * Only renders window controls in Tauri; in browser it's just branding.
 */
export function TitleBar({ apiBaseUrl, enabledProviders }: TitleBarProps) {
  const inTauri = isTauri();
  const [maximized, setMaximized] = useState(false);
  const [update, setUpdate] = useState<PortableUpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const { status, loading } = useProviderStatus({
    apiBaseUrl,
    fetchOnMount: true,
    autoRefreshMs: 30_000,
  });

  // Sync maximized state on mount + when window resizes (covers snap/restore)
  useEffect(() => {
    if (!inTauri) return;
    let cancelled = false;

    const sync = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const m = await win.isMaximized();
      if (!cancelled) setMaximized(m);
    };

    sync();
    window.addEventListener("resize", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", sync);
    };
  }, [inTauri]);

  useEffect(() => {
    if (!inTauri) return;
    let cancelled = false;

    checkPortableUpdate()
      .then((status) => {
        if (!cancelled && status.updateAvailable && status.downloadUrl) {
          setUpdate(status);
        }
      })
      .catch((err) => {
        console.warn("Portable update check failed", err);
      });

    return () => {
      cancelled = true;
    };
  }, [inTauri]);

  const handleMinimize = useCallback(async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().minimize();
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.toggleMaximize();
    setMaximized(await win.isMaximized());
  }, []);

  const handleClose = useCallback(async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().close();
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    if (!update?.downloadUrl) return;
    const confirmed = window.confirm(
      `imgimg ${update.latestVersion ?? "update"} is available. Download it, close imgimg, replace the current portable EXE, and reopen?`,
    );
    if (!confirmed) return;

    setUpdateBusy(true);
    try {
      await installPortableUpdate(update.downloadUrl);
    } catch (err) {
      setUpdateBusy(false);
      window.alert(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [update]);

  const handleDragStart = useCallback(async (e: React.MouseEvent) => {
    // Only drag on left-click on the bar itself (not buttons)
    if (e.button !== 0) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (e.detail === 2) {
      // Double-click: toggle maximize
      await win.toggleMaximize();
      setMaximized(await win.isMaximized());
    } else {
      win.startDragging();
    }
  }, []);

  return (
    <div
      className="titlebar relative flex h-8 shrink-0 select-none items-center justify-between border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-black"
      onMouseDown={inTauri ? handleDragStart : undefined}
      onDoubleClick={inTauri ? handleToggleMaximize : undefined}
    >
      {/* Brand */}
      <div className="flex items-center gap-1.5 pl-3">
        <span className="text-xs font-semibold tracking-wide text-zinc-500 dark:text-zinc-400">
          img<sup className="text-[8px]">2</sup>
        </span>
      </div>

      {/* Provider status indicators (centered) */}
      <div className="absolute inset-x-0 top-0 flex h-full items-center justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <ProviderStatusIndicator status={status} loading={loading} compact enabledProviders={enabledProviders} />
        </div>
      </div>

      {/* Window controls (Tauri only) */}
      {inTauri && (
        <div className="flex h-full items-stretch">
          {update?.downloadUrl && (
            <button
              type="button"
              onClick={handleInstallUpdate}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={updateBusy}
              className="inline-flex items-center gap-1 px-3 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-60 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              aria-label="Install update"
              title={`Install imgimg ${update.latestVersion ?? "update"}`}
            >
              <TbDownload className="h-3.5 w-3.5" />
              {updateBusy ? "Updating…" : "Update"}
            </button>
          )}
          <button
            type="button"
            onClick={handleMinimize}
            onMouseDown={(e) => e.stopPropagation()}
            className="inline-flex w-11 items-center justify-center text-zinc-500 transition-colors hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Minimize"
          >
            <TbMinus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            onMouseDown={(e) => e.stopPropagation()}
            className="inline-flex w-11 items-center justify-center text-zinc-500 transition-colors hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? (
              <TbSquares className="h-3.5 w-3.5" />
            ) : (
              <TbSquare className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            onClick={handleClose}
            onMouseDown={(e) => e.stopPropagation()}
            className="inline-flex w-11 items-center justify-center text-zinc-500 transition-colors hover:bg-red-500 hover:text-white dark:text-zinc-400 dark:hover:bg-red-500 dark:hover:text-white"
            aria-label="Close"
          >
            <TbX className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
