import type Konva from "konva";
import type { ApiBaseUrl } from "../../api";

export type Props = {
  width: number;
  height: number;
  apiBaseUrl: ApiBaseUrl;
  /** When true, disable pan/zoom/marquee (e.g. during inpaint/outpaint/crop) */
  locked?: boolean;
  onContextMenu?: (e: { nodeId: string; x: number; y: number }) => void;
  /** Double-click a node (e.g. to enter crop mode) */
  onNodeDblClick?: (nodeId: string) => void;
  /** ID of the node currently being text-edited (sticky note / frame title) */
  editingNodeId?: string | null;
  /** Called during node drag with cumulative delta (and 0,0 at drag end to reset) */
  onDragDelta?: (dx: number, dy: number) => void;
  /** Callback to expose the Konva Stage ref (for export) */
  onStageRef?: (stage: Konva.Stage | null) => void;
  /** Freehand drawing color */
  drawColor?: string;
  /** Freehand drawing stroke width */
  drawWidth?: number;
  /** Callback when a connector is selected/deselected */
  onConnectorSelect?: (connectorId: string | null) => void;
  /** Currently selected connector ID (controlled from parent) */
  selectedConnectorId?: string | null;
};

export type MarqueeRect = { startX: number; startY: number; endX: number; endY: number };
