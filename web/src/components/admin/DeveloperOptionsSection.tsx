interface DeveloperOptionsSectionProps {
  skipQueue: boolean;
  onSkipQueueChange: (next: boolean) => void;
}

export function DeveloperOptionsSection({ skipQueue, onSkipQueueChange }: DeveloperOptionsSectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Developer Options</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Local overrides for troubleshooting and admin workflows.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Skip Queue</div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Sends <span className="font-mono">x-skip-queue: true</span> to bypass the FIFO queue for this browser.
            </div>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-black dark:text-zinc-100"
            checked={skipQueue}
            onChange={(e) => onSkipQueueChange(e.target.checked)}
          />
        </label>
      </div>
    </div>
  );
}
