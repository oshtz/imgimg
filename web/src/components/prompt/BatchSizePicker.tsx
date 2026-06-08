import { pillBase } from "./pillStyles";

export function BatchSizePicker(props: {
  value: 1 | 2 | 3 | 4;
  onChange: (next: 1 | 2 | 3 | 4) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={pillBase(props.disabled)}
      onClick={() => props.onChange((props.value === 4 ? 1 : (props.value + 1)) as 1 | 2 | 3 | 4)}
      disabled={props.disabled}
      aria-label="Batch size"
      title="Batch size (1–4)"
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Batch</span>
      <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100">{props.value}</span>
    </button>
  );
}
