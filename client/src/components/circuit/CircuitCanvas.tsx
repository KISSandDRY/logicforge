import React, { useCallback, useRef, useState } from 'react';
import type {
  CircuitEdgeData,
  CircuitNodeData,
  CircuitViewport,
  ComponentType,
  LogicState,
  PinDefinition,
} from '@logicforge/shared-types';
import { CircuitNode } from './CircuitNode';

interface WireStyle {
  stroke: string;
  width: number;
  dash?: string;
  animated: boolean;
}

const WIRE_STYLES: Record<LogicState, WireStyle> = {
  '0': { stroke: '#3b82f6', width: 2.2, animated: false },
  '1': { stroke: '#10b981', width: 2.8, animated: true },
  Z: { stroke: '#f59e0b', width: 2.0, dash: '5 5', animated: false },
  X: { stroke: '#ef4444', width: 3.2, animated: true },
};

function computeWirePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(48, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export interface CircuitCanvasProps {
  nodes: CircuitNodeData[];
  edges: CircuitEdgeData[];
  viewport: CircuitViewport;
  nodePinStates?: Record<string, Record<string, LogicState>>;
  edgeStates?: Record<string, LogicState>;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  readOnly?: boolean;
  onSelectNode?: (nodeId: string | null) => void;
  onSelectEdge?: (edgeId: string | null) => void;
  onMoveNode?: (nodeId: string, pos: { x: number; y: number }) => void;
  onConnectPins?: (
    sourceNodeId: string,
    sourcePinId: string,
    targetNodeId: string,
    targetPinId: string,
  ) => void;
  onDropCatalogType?: (
    type: ComponentType,
    pos: { x: number; y: number },
    customIcId?: string,
  ) => void;
  onToggleSwitch?: (node: CircuitNodeData, cycleTriState: boolean) => void;
  onChangeViewport?: (patch: Partial<CircuitViewport>) => void;
}

export const CircuitCanvas: React.FC<CircuitCanvasProps> = ({
  nodes,
  edges,
  viewport,
  nodePinStates,
  edgeStates,
  selectedNodeId,
  selectedEdgeId,
  readOnly = false,
  onSelectNode,
  onSelectEdge,
  onMoveNode,
  onConnectPins,
  onDropCatalogType,
  onToggleSwitch,
  onChangeViewport,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [draggingNode, setDraggingNode] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const [panning, setPanning] = useState<{
    startClientX: number;
    startClientY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);

  const [wiringFrom, setWiringFrom] = useState<{
    nodeId: string;
    pin: PinDefinition;
    x: number;
    y: number;
  } | null>(null);

  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const x = (clientX - rect.left - viewport.panX) / viewport.zoom;
      const y = (clientY - rect.top - viewport.panY) / viewport.zoom;
      return { x, y };
    },
    [viewport.panX, viewport.panY, viewport.zoom],
  );

  const getPinCoords = (nodeId: string, pinId: string): { x: number; y: number } | null => {
    const n = nodes.find((item) => item.id === nodeId);
    if (!n) return null;
    const p = n.pins.find((item) => item.id === pinId);
    if (!p) return null;
    return {
      x: n.position.x + p.offset.x,
      y: n.position.y + p.offset.y,
    };
  };

  const handleNodeMouseDown = (node: CircuitNodeData, e: React.MouseEvent) => {
    if (readOnly) {
      onSelectNode?.(node.id);
      return;
    }
    e.stopPropagation();
    onSelectNode?.(node.id);
    onSelectEdge?.(null);

    const world = clientToWorld(e.clientX, e.clientY);
    setDraggingNode({
      nodeId: node.id,
      offsetX: world.x - node.position.x,
      offsetY: world.y - node.position.y,
    });
  };

  const handlePinClick = (node: CircuitNodeData, pin: PinDefinition, e: React.MouseEvent) => {
    if (readOnly) return;
    const world = clientToWorld(e.clientX, e.clientY);
    setCursorWorld(world);

    if (!wiringFrom) {
      setWiringFrom({
        nodeId: node.id,
        pin,
        x: node.position.x + pin.offset.x,
        y: node.position.y + pin.offset.y,
      });
      return;
    }

    if (wiringFrom.nodeId === node.id && wiringFrom.pin.id === pin.id) {
      setWiringFrom(null);
      return;
    }

    // Визначаємо напрямок від OUTPUT до INPUT
    if (wiringFrom.pin.direction === 'OUTPUT' && pin.direction === 'INPUT') {
      onConnectPins?.(wiringFrom.nodeId, wiringFrom.pin.id, node.id, pin.id);
    } else if (wiringFrom.pin.direction === 'INPUT' && pin.direction === 'OUTPUT') {
      onConnectPins?.(node.id, pin.id, wiringFrom.nodeId, wiringFrom.pin.id);
    }
    setWiringFrom(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const world = clientToWorld(e.clientX, e.clientY);
    setCursorWorld(world);

    if (draggingNode && onMoveNode) {
      let nx = world.x - draggingNode.offsetX;
      let ny = world.y - draggingNode.offsetY;
      if (viewport.gridSnap) {
        nx = Math.round(nx / 16) * 16;
        ny = Math.round(ny / 16) * 16;
      }
      onMoveNode(draggingNode.nodeId, { x: nx, y: ny });
    } else if (panning && onChangeViewport) {
      onChangeViewport({
        panX: panning.origPanX + (e.clientX - panning.startClientX),
        panY: panning.origPanY + (e.clientY - panning.startClientY),
      });
    }
  };

  const handleMouseUp = () => {
    setDraggingNode(null);
    setPanning(null);
  };

  return (
    <div
      className="relative h-full w-full overflow-hidden cad-grid-bg select-none"
      onDragOver={(e) => {
        if (!readOnly) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        if (readOnly || !onDropCatalogType) return;
        e.preventDefault();
        const typeStr = e.dataTransfer.getData('application/logicforge-type') as ComponentType;
        const customIcId = e.dataTransfer.getData('application/logicforge-custom-ic') || undefined;
        if (!typeStr) return;
        const world = clientToWorld(e.clientX, e.clientY);
        const snapped = viewport.gridSnap
          ? { x: Math.round((world.x - 55) / 16) * 16, y: Math.round((world.y - 30) / 16) * 16 }
          : { x: Math.round(world.x - 55), y: Math.round(world.y - 30) };
        onDropCatalogType(typeStr, snapped, customIcId);
      }}
    >
      <svg
        ref={svgRef}
        className="h-full w-full"
        onMouseDown={(e) => {
          if (e.button === 1 || e.altKey || readOnly) {
            setPanning({
              startClientX: e.clientX,
              startClientY: e.clientY,
              origPanX: viewport.panX,
              origPanY: viewport.panY,
            });
            return;
          }
          setWiringFrom(null);
          onSelectNode?.(null);
          onSelectEdge?.(null);
          setPanning({
            startClientX: e.clientX,
            startClientY: e.clientY,
            origPanX: viewport.panX,
            origPanY: viewport.panY,
          });
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={(e) => {
          if (!onChangeViewport) return;
          const factor = e.deltaY < 0 ? 1.08 : 0.92;
          const nextZoom = Math.min(
            2.2,
            Math.max(0.35, Number((viewport.zoom * factor).toFixed(2))),
          );
          onChangeViewport({ zoom: nextZoom });
        }}
      >
        <g transform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}>
          {/* Лінії з'єднань (Edges / Nets) */}
          {edges.map((edge) => {
            const p1 = getPinCoords(edge.sourceNodeId, edge.sourcePinId);
            const p2 = getPinCoords(edge.targetNodeId, edge.targetPinId);
            if (!p1 || !p2) return null;

            const sig: LogicState = edgeStates?.[edge.id] ?? edge.signalState ?? 'Z';
            const style = WIRE_STYLES[sig] ?? WIRE_STYLES.Z;
            const pathD = computeWirePath(p1.x, p1.y, p2.x, p2.y);
            const isSelected = selectedEdgeId === edge.id;

            return (
              <g
                key={edge.id}
                className={readOnly ? '' : 'cursor-pointer'}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectEdge?.(edge.id);
                  onSelectNode?.(null);
                }}
              >
                {/* Широка прозора лінія для легкого вибору провідника мишею */}
                <path d={pathD} fill="none" stroke="transparent" strokeWidth={12} />
                {/* Фонова підкладка провідника */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={isSelected ? '#f8fafc' : '#1e293b'}
                  strokeWidth={style.width + 2.2}
                  strokeOpacity={isSelected ? 0.85 : 0.7}
                />
                {/* Активний сигнальний провідник */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={style.width}
                  strokeDasharray={style.dash}
                  className={style.animated ? 'wire-active-flow' : ''}
                />
              </g>
            );
          })}

          {/* Провідник у процесі протягування між пінами */}
          {wiringFrom && (
            <path
              d={computeWirePath(wiringFrom.x, wiringFrom.y, cursorWorld.x, cursorWorld.y)}
              fill="none"
              stroke="#34d399"
              strokeWidth={2.2}
              strokeDasharray="6 4"
              className="pointer-events-none"
            />
          )}

          {/* Вузли цифрової схеми */}
          {nodes.map((node) => (
            <CircuitNode
              key={node.id}
              node={node}
              pinStates={nodePinStates?.[node.id]}
              selected={selectedNodeId === node.id}
              readOnly={readOnly}
              activeWiringPinKey={wiringFrom ? `${wiringFrom.nodeId}::${wiringFrom.pin.id}` : null}
              onNodeMouseDown={handleNodeMouseDown}
              onPinClick={handlePinClick}
              onToggleSwitch={onToggleSwitch}
            />
          ))}
        </g>
      </svg>

      {/* Легенда тристабільних рівнів сигналів у лівому нижньому кутку полотна */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/90 bg-slate-950/85 px-3 py-1.5 text-[11px] backdrop-blur">
        <span className="flex items-center gap-1.5 text-blue-300">
          <span className="h-2 w-4 rounded-full bg-blue-500" /> 0 (LOW)
        </span>
        <span className="flex items-center gap-1.5 text-emerald-300">
          <span className="h-2 w-4 rounded-full bg-emerald-500" /> 1 (HIGH)
        </span>
        <span className="flex items-center gap-1.5 text-amber-300">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-amber-400" /> Z (High-Z)
        </span>
        <span className="flex items-center gap-1.5 text-rose-300">
          <span className="h-2 w-4 rounded-full bg-rose-500" /> X (Конфлікт шини)
        </span>
      </div>

      {wiringFrom && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-emerald-500/50 bg-emerald-950/90 px-4 py-1 text-xs font-medium text-emerald-200 shadow-lg">
          З’єднання від виводу <span className="font-mono font-bold">{wiringFrom.pin.name}</span> —
          оберіть цільовий пін (або клікніть по полотну для скасування)
        </div>
      )}
    </div>
  );
};
