import { useState, useRef, useEffect, useCallback } from "react";

type PromptVariableFormProps = {
  variables: string[];
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
};

export function PromptVariableForm({ variables, onSubmit, onCancel }: PromptVariableFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of variables) init[v] = "";
    return init;
  });
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmit(values);
  }, [onSubmit, values]);

  return (
    <div
      className={[
        "absolute left-0 top-full z-40 mt-2 w-[20rem] overflow-hidden rounded-xl border shadow-lg",
        "border-zinc-200 bg-white",
        "dark:border-zinc-800 dark:bg-black"
      ].join(" ")}
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
        }
      }}
    >
      <div className="border-b border-zinc-200 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Fill in variables
      </div>
      <div className="max-h-64 overflow-auto px-3 py-2 space-y-2">
        {variables.map((name, i) => (
          <div key={name}>
            <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">
              {name}
            </label>
            <input
              ref={i === 0 ? firstInputRef : undefined}
              type="text"
              value={values[name] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  onCancel();
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={`[${name}]`}
              className="w-full rounded-lg border border-zinc-200 bg-transparent px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Insert
        </button>
      </div>
    </div>
  );
}
