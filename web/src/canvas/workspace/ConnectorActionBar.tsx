type Viewport = { x: number; y: number; scale: number };

type Connector = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  color?: string;
  arrowEnd?: boolean;
};

type Node = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const CONN_COLORS = [
  { color: "#18181b", label: "Black" },
  { color: "#3f3f46", label: "Dark Gray" },
  { color: "#71717a", label: "Gray" },
  { color: "#a1a1aa", label: "Light Gray" },
  { color: "#d4d4d8", label: "Silver" },
  { color: "#ffffff", label: "White" },
];

type Props = {
  connector: Connector;
  fromNode: Node;
  toNode: Node;
  viewport: Viewport;
  dispatch: (action: any) => void;
  onDeselect: () => void;
};

export function ConnectorActionBar({ connector, fromNode, toNode, viewport, dispatch, onDeselect }: Props) {
  const midX = (fromNode.x + fromNode.width / 2 + toNode.x + toNode.width / 2) / 2;
  const midY = (fromNode.y + fromNode.height / 2 + toNode.y + toNode.height / 2) / 2;
  const screenX = midX * viewport.scale + viewport.x;
  const screenY = midY * viewport.scale + viewport.y - 48;

  return (
    <div
      className="absolute z-30 flex items-center gap-1 rounded-lg border border-zinc-200 bg-white/90 px-2 py-1 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/90"
      style={{ left: screenX, top: screenY, transform: "translateX(-50%)" }}
    >
      {CONN_COLORS.map((c) => (
        <button
          key={c.color}
          onClick={() => dispatch({ type: "UPDATE_CONNECTOR", id: connector.id, updates: { color: c.color } })}
          className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
          style={{
            backgroundColor: c.color,
            borderColor: (connector.color ?? "#71717a") === c.color ? "#fff" : "transparent",
            boxShadow: (connector.color ?? "#71717a") === c.color ? `0 0 0 2px ${c.color}` : undefined,
          }}
          title={c.label}
        />
      ))}
      <div className="mx-1 h-4 w-px bg-zinc-300 dark:bg-zinc-600" />
      <button
        onClick={() => dispatch({ type: "UPDATE_CONNECTOR", id: connector.id, updates: { arrowEnd: connector.arrowEnd === false ? true : false } })}
        className={[
          "rounded px-1.5 py-0.5 text-xs font-medium transition-colors",
          connector.arrowEnd !== false
            ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400"
            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
        ].join(" ")}
        title="Toggle arrowhead"
      >
        {connector.arrowEnd !== false ? "Arrow" : "Line"}
      </button>
      <div className="mx-1 h-4 w-px bg-zinc-300 dark:bg-zinc-600" />
      <button
        onClick={() => {
          dispatch({ type: "REMOVE_CONNECTOR", id: connector.id });
          onDeselect();
        }}
        className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
        title="Delete connector"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
    </div>
  );
}
