import { TbX } from "react-icons/tb";
import { useCanvas } from "./CanvasProvider";
import { CANVAS_TEMPLATES, type CanvasTemplate } from "./templates";

type Props = {
  containerWidth: number;
  containerHeight: number;
  onClose: () => void;
};

export function TemplatePicker({ containerWidth, containerHeight, onClose }: Props) {
  const { state, dispatch } = useCanvas();

  const insertTemplate = (tpl: CanvasTemplate) => {
    const vp = state.viewport;
    // Place template at viewport center
    const originX = (-vp.x + containerWidth / 2) / vp.scale - tpl.previewWidth / 2;
    const originY = (-vp.y + containerHeight / 2) / vp.scale - tpl.previewHeight / 2;

    const newIds: string[] = [];

    for (const def of tpl.nodes) {
      const id = crypto.randomUUID();
      newIds.push(id);
      dispatch({
        type: "ADD_NODE",
        node: {
          id,
          type: def.type,
          src: "",
          x: originX + def.dx,
          y: originY + def.dy,
          width: def.width,
          height: def.height,
          naturalWidth: def.width,
          naturalHeight: def.height,
          zIndex: 0,
          title: def.title,
          text: def.text,
          stickyColor: def.stickyColor,
          shapeKind: def.shapeKind,
          fillColor: def.fillColor,
          strokeColor: def.strokeColor,
        },
      });
    }

    dispatch({ type: "SELECT_NODES", ids: newIds });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">Insert Template</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300">
            <TbX size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {CANVAS_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => insertTemplate(tpl)}
              className="group rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-900/20"
            >
              {/* Mini preview */}
              <div className="mb-2 flex h-24 items-center justify-center rounded bg-zinc-50 dark:bg-zinc-900/50">
                <TemplatePreview template={tpl} />
              </div>
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{tpl.name}</div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{tpl.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Miniature SVG preview of a template layout */
function TemplatePreview({ template }: { template: CanvasTemplate }) {
  const pw = template.previewWidth;
  const ph = template.previewHeight;
  // Scale to fit in ~140x80 box
  const scale = Math.min(140 / pw, 80 / ph);
  const svgW = pw * scale;
  const svgH = ph * scale;

  const COLORS: Record<string, string> = {
    yellow: "#d4d4d8",
    green: "#a1a1aa",
    blue: "#a1a1aa",
    pink: "#d4d4d8",
    orange: "#d4d4d8",
    purple: "#a1a1aa",
  };

  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${pw} ${ph}`}>
      {template.nodes.map((n, i) => {
        if (n.type === "frame") {
          return (
            <rect
              key={i}
              x={n.dx}
              y={n.dy}
              width={n.width}
              height={n.height}
              rx={6}
              fill="none"
              stroke="#a1a1aa"
              strokeWidth={2}
              strokeDasharray="6 3"
            />
          );
        }
        if (n.type === "text") {
          return (
            <rect
              key={i}
              x={n.dx}
              y={n.dy}
              width={n.width}
              height={n.height}
              rx={4}
              fill={COLORS[n.stickyColor ?? "yellow"] ?? "#d4d4d8"}
              opacity={0.7}
            />
          );
        }
        if (n.type === "shape") {
          if (n.shapeKind === "circle") {
            return (
              <ellipse
                key={i}
                cx={n.dx + n.width / 2}
                cy={n.dy + n.height / 2}
                rx={n.width / 2}
                ry={n.height / 2}
                fill={n.fillColor ?? "#a1a1aa"}
                opacity={0.7}
              />
            );
          }
          return (
            <rect
              key={i}
              x={n.dx}
              y={n.dy}
              width={n.width}
              height={n.height}
              rx={4}
              fill={n.fillColor ?? "#a1a1aa"}
              opacity={0.7}
            />
          );
        }
        return null;
      })}
    </svg>
  );
}
