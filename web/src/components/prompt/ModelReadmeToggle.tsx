import { useState } from "react";
import { TbChevronDown, TbChevronUp, TbInfoCircle } from "react-icons/tb";

export function ModelReadmeToggle(props: { readme: string }) {
  const [open, setOpen] = useState(false);
  const truncated = props.readme.length > 300
    ? props.readme.slice(0, 300).replace(/\s+\S*$/, "") + "…"
    : props.readme;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        <TbInfoCircle className="h-3 w-3" />
        <span>Model Info</span>
        {open ? <TbChevronUp className="h-2.5 w-2.5" /> : <TbChevronDown className="h-2.5 w-2.5" />}
      </button>
      {open && (
        <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          <pre className="whitespace-pre-wrap font-sans">{open ? props.readme : truncated}</pre>
        </div>
      )}
    </div>
  );
}
