import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  createNodeFromCatalog,
  type CircuitEdgeData,
  type CircuitNodeData,
  type CircuitViewport,
  type ComponentType,
  type CustomICDefinition,
  type LogicState,
  type PinDefinition,
} from '@logicforge/shared-types';
import { usePinchWheelZoom } from '../../hooks/usePinchWheelZoom';
import { CircuitNode } from './CircuitNode';
import {
  computeAlignmentGuides,
  computeNetJunctions,
  computeRoutedNets,
  computeWireRoute,
  snapNodePosition,
  type NetJunctionDot,
  type WirePoint,
  type WireRoute,
} from './wireRouting';

export { computeNetJunctions, computeWireRoute };
export type { NetJunctionDot, WirePoint, WireRoute };

export interface CircuitCanvasProps {
  nodes: CircuitNodeData[];
  edges: CircuitEdgeData[];
  viewport: CircuitViewport;
  nodePinStates?: Record<string, Record<string, LogicState>>;
  edgeStates?: Record<string, LogicState>;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  pendingPaletteDrag?: { type: ComponentType; customIcId?: string } | null;
  customDefinitions?: CustomICDefinition[];
  readOnly?: boolean;
  fitToContent?: boolean;
  hideGrid?: boolean;
  hideStatusbar?: boolean;
  onSelectNode?: (nodeId: string | null) => void;
  onSelectEdge?: (edgeId: string | null) => void;
  onMoveNode?: (nodeId: string, pos: { x: number; y: number }) => void;
  onMoveNodeEnd?: (nodeId: string, pos: { x: number; y: number }) => void;
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
  onToggleDipBit?: (node: CircuitNodeData, bitIndex: number) => void;
  onChangeViewport?: (patch: Partial<CircuitViewport>) => void;
}

const clampCanvasZoom = (z: number) => Math.min(2.2, Math.max(0.35, Number(z.toFixed(2))));

export const CircuitCanvas: React.FC<CircuitCanvasProps> = ({
  nodes,
  edges,
  viewport,
  nodePinStates,
  edgeStates,
  selectedNodeId,
  selectedEdgeId,
  pendingPaletteDrag,
  customDefinitions = [],
  readOnly = false,
  fitToContent = false,
  hideGrid = false,
  hideStatusbar = false,
  onSelectNode,
  onSelectEdge,
  onMoveNode,
  onMoveNodeEnd,
  onConnectPins,
  onDropCatalogType,
  onToggleSwitch,
  onToggleDipBit,
  onChangeViewport,
}) => {
  const dotGridPatternId = useId();
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const onChangeViewportRef = useRef(onChangeViewport);
  onChangeViewportRef.current = onChangeViewport;

  const pinchRef = useRef<{
    startDist: number;
    baseZoom: number;
    basePanX: number;
    basePanY: number;
    startMidX: number;
    startMidY: number;
  } | null>(null);

  const draggingNodeRef = useRef<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);

  const [draggingNode, setDraggingNode] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const [dropGhostPos, setDropGhostPos] = useState<{ x: number; y: number } | null>(null);

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

  const activePointerRef = useRef<number | null>(null);
  const onMoveNodeEndRef = useRef(onMoveNodeEnd);
  onMoveNodeEndRef.current = onMoveNodeEnd;

  const clearInteractions = useCallback((e?: React.PointerEvent<SVGSVGElement>) => {
    const pointerId = e?.pointerId ?? activePointerRef.current;
    if (pointerId !== null && svgRef.current) {
      try {
        if (svgRef.current.hasPointerCapture?.(pointerId)) {
          svgRef.current.releasePointerCapture(pointerId);
        }
      } catch {
        // Synthetic pointer events in tests may not hold native capture
      }
    }
    const activeDrag = draggingNodeRef.current;
    draggingNodeRef.current = null;
    activePointerRef.current = null;
    setDraggingNode(null);
    setPanning(null);
    if (activeDrag && activeDrag.moved && onMoveNodeEndRef.current) {
      onMoveNodeEndRef.current(activeDrag.nodeId, { x: activeDrag.lastX, y: activeDrag.lastY });
    }
  }, []);

  useEffect(() => {
    const onWindowBlur = () => {
      clearInteractions();
      pinchRef.current = null;
      setDropGhostPos(null);
    };
    window.addEventListener('blur', onWindowBlur);
    return () => window.removeEventListener('blur', onWindowBlur);
  }, [clearInteractions]);

  usePinchWheelZoom({
    targetRef: canvasWrapperRef,
    onWheel: (e, wrapper) => {
      const cb = onChangeViewportRef.current;
      if (!cb) return;
      e.preventDefault();
      e.stopPropagation();
      const vp = viewportRef.current;
      const factor = e.ctrlKey
        ? Math.min(1.22, Math.max(0.82, Math.exp(-e.deltaY * 0.012)))
        : e.deltaY < 0
          ? 1.1
          : 0.91;
      const nextZoom = clampCanvasZoom(vp.zoom * factor);
      const safeZoom = Math.max(0.1, Number.isFinite(vp.zoom) ? vp.zoom : 1);
      const rect = wrapper.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const worldX = (cx - vp.panX) / safeZoom;
      const worldY = (cy - vp.panY) / safeZoom;
      cb({
        zoom: nextZoom,
        panX: Math.round(cx - worldX * nextZoom),
        panY: Math.round(cy - worldY * nextZoom),
      });
    },
    onPinchStart: ({ dist, midX, midY }) => {
      if (!onChangeViewportRef.current) return;
      clearInteractions();
      const vp = viewportRef.current;
      pinchRef.current = {
        startDist: dist,
        baseZoom: vp.zoom,
        basePanX: vp.panX,
        basePanY: vp.panY,
        startMidX: midX,
        startMidY: midY,
      };
    },
    onPinchMove: ({ dist, midX, midY }, wrapper) => {
      const cb = onChangeViewportRef.current;
      if (!cb) return;
      const vp = viewportRef.current;
      if (!pinchRef.current) {
        pinchRef.current = {
          startDist: dist,
          baseZoom: vp.zoom,
          basePanX: vp.panX,
          basePanY: vp.panY,
          startMidX: midX,
          startMidY: midY,
        };
        return;
      }
      const pinch = pinchRef.current;
      const rect = wrapper.getBoundingClientRect();
      const nextZoom = clampCanvasZoom(pinch.baseZoom * (dist / pinch.startDist));
      const anchorWorldX = (pinch.startMidX - rect.left - pinch.basePanX) / pinch.baseZoom;
      const anchorWorldY = (pinch.startMidY - rect.top - pinch.basePanY) / pinch.baseZoom;
      cb({
        zoom: nextZoom,
        panX: Math.round(midX - rect.left - anchorWorldX * nextZoom),
        panY: Math.round(midY - rect.top - anchorWorldY * nextZoom),
      });
    },
    onPinchEnd: () => {
      pinchRef.current = null;
    },
    onGesture: (e) => {
      if (onChangeViewportRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  });

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const safeZoom = Math.max(0.1, Number.isFinite(viewport.zoom) ? viewport.zoom : 1);
      const x = (clientX - rect.left - viewport.panX) / safeZoom;
      const y = (clientY - rect.top - viewport.panY) / safeZoom;
      return { x, y };
    },
    [viewport.panX, viewport.panY, viewport.zoom],
  );

  const handleNodePointerDown = (node: CircuitNodeData, e: React.PointerEvent) => {
    if (readOnly) {
      onSelectNode?.(node.id);
      return;
    }
    e.stopPropagation();
    onSelectNode?.(node.id);
    onSelectEdge?.(null);

    if (svgRef.current) {
      activePointerRef.current = e.pointerId;
      try {
        svgRef.current.setPointerCapture?.(e.pointerId);
      } catch {
        // Ignore when browser/test runner declines pointer capture
      }
    }

    const world = clientToWorld(e.clientX, e.clientY);
    const nextDrag = {
      nodeId: node.id,
      offsetX: world.x - node.position.x,
      offsetY: world.y - node.position.y,
      startX: node.position.x,
      startY: node.position.y,
      lastX: node.position.x,
      lastY: node.position.y,
      moved: false,
    };
    draggingNodeRef.current = nextDrag;
    setDraggingNode({
      nodeId: node.id,
      offsetX: nextDrag.offsetX,
      offsetY: nextDrag.offsetY,
    });
  };

  const handlePinClick = (node: CircuitNodeData, pin: PinDefinition, e: React.PointerEvent) => {
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

    if (wiringFrom.pin.direction === 'OUTPUT' && pin.direction === 'INPUT') {
      onConnectPins?.(wiringFrom.nodeId, wiringFrom.pin.id, node.id, pin.id);
    } else if (wiringFrom.pin.direction === 'INPUT' && pin.direction === 'OUTPUT') {
      onConnectPins?.(node.id, pin.id, wiringFrom.nodeId, wiringFrom.pin.id);
    }
    setWiringFrom(null);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const world = clientToWorld(e.clientX, e.clientY);
    setCursorWorld(world);

    const activeDrag = draggingNodeRef.current;
    if (activeDrag && draggingNode && onMoveNode) {
      const subject = nodes.find((n) => n.id === activeDrag.nodeId);
      const rawX = world.x - activeDrag.offsetX;
      const rawY = world.y - activeDrag.offsetY;
      const { x: nx, y: ny } = subject
        ? snapNodePosition(subject, rawX, rawY, nodes, edges, viewport.gridSnap)
        : {
            x: viewport.gridSnap ? Math.round(rawX / 8) * 8 : Math.round(rawX),
            y: viewport.gridSnap ? Math.round(rawY / 8) * 8 : Math.round(rawY),
          };
      if (nx !== activeDrag.lastX || ny !== activeDrag.lastY) {
        activeDrag.lastX = nx;
        activeDrag.lastY = ny;
        activeDrag.moved = true;
        onMoveNode(activeDrag.nodeId, { x: nx, y: ny });
      }
    } else if (panning && onChangeViewport) {
      onChangeViewport({
        panX: panning.origPanX + (e.clientX - panning.startClientX),
        panY: panning.origPanY + (e.clientY - panning.startClientY),
      });
    }
  };

  const dropGhostNode = useMemo(() => {
    if (!pendingPaletteDrag || !dropGhostPos) return null;
    const customIc = pendingPaletteDrag.customIcId
      ? customDefinitions.find((c) => c.id === pendingPaletteDrag.customIcId)
      : undefined;
    return createNodeFromCatalog(
      pendingPaletteDrag.type,
      '__drop_ghost__',
      dropGhostPos,
      customIc?.code,
      customIc,
    );
  }, [customDefinitions, dropGhostPos, pendingPaletteDrag]);

  const activeDraggedNode = useMemo(
    () => (draggingNode ? (nodes.find((n) => n.id === draggingNode.nodeId) ?? null) : null),
    [draggingNode, nodes],
  );

  const alignGuides = useMemo(
    () => computeAlignmentGuides(activeDraggedNode ?? dropGhostNode, nodes),
    [activeDraggedNode, dropGhostNode, nodes],
  );

  const { routedEdges, junctionDots } = useMemo(
    () => computeRoutedNets(nodes, edges, edgeStates),
    [edgeStates, edges, nodes],
  );

  const orderedNodes = useMemo(() => {
    if (!draggingNode) return nodes;
    const rest = nodes.filter((n) => n.id !== draggingNode.nodeId);
    const active = nodes.find((n) => n.id === draggingNode.nodeId);
    return active ? [...rest, active] : nodes;
  }, [draggingNode, nodes]);

  const computeSnappedDropPos = useCallback(
    (dropType: ComponentType, worldX: number, worldY: number, customIcId?: string) => {
      const customIc = customIcId ? customDefinitions.find((c) => c.id === customIcId) : undefined;
      const probe = createNodeFromCatalog(
        dropType,
        '__drop_probe__',
        { x: 0, y: 0 },
        undefined,
        customIc,
      );
      return snapNodePosition(
        probe,
        worldX - probe.width / 2,
        worldY - probe.height / 2,
        nodes,
        edges,
        viewport.gridSnap,
      );
    },
    [customDefinitions, edges, nodes, viewport.gridSnap],
  );

  const fitViewBox = useMemo(() => {
    if (!fitToContent) return undefined;
    if (nodes.length === 0) return '0 0 420 220';
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y - 22);
      maxX = Math.max(maxX, n.position.x + n.width);
      maxY = Math.max(maxY, n.position.y + n.height + 16);
    }
    const padX = 24;
    const padY = 16;
    const vx = Math.round(minX - padX);
    const vy = Math.round(minY - padY);
    const vw = Math.max(260, Math.round(maxX - minX + padX * 2));
    const vh = Math.max(150, Math.round(maxY - minY + padY * 2));
    return `${vx} ${vy} ${vw} ${vh}`;
  }, [fitToContent, nodes]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-win-bg select-none">
      {/* Вдавлене схемотехнічне полотно Windows 95 (.win95-inset) */}
      <div
        ref={canvasWrapperRef}
        className={`win95-inset relative flex-1 min-h-0 w-full overflow-hidden bg-win-canvas ${
          onChangeViewport ? 'touch-none overscroll-contain' : ''
        }`}
        style={onChangeViewport ? { touchAction: 'none' } : undefined}
        onDragOver={(e) => {
          if (!readOnly) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            const world = clientToWorld(e.clientX, e.clientY);
            const snapped = pendingPaletteDrag
              ? computeSnappedDropPos(
                  pendingPaletteDrag.type,
                  world.x,
                  world.y,
                  pendingPaletteDrag.customIcId,
                )
              : {
                  x: viewport.gridSnap
                    ? Math.round((world.x - 56) / 8) * 8
                    : Math.round(world.x - 56),
                  y: viewport.gridSnap
                    ? Math.round((world.y - 24) / 8) * 8
                    : Math.round(world.y - 24),
                };
            setDropGhostPos((prev) =>
              prev && prev.x === snapped.x && prev.y === snapped.y ? prev : snapped,
            );
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDropGhostPos(null);
          }
        }}
        onDrop={(e) => {
          setDropGhostPos(null);
          if (readOnly || !onDropCatalogType) return;
          e.preventDefault();
          const typeStr = e.dataTransfer.getData('application/logicforge-type') as ComponentType;
          const customIcId =
            e.dataTransfer.getData('application/logicforge-custom-ic') || undefined;
          const resolvedType = typeStr || pendingPaletteDrag?.type;
          const resolvedCustomIc = customIcId ?? pendingPaletteDrag?.customIcId;
          if (!resolvedType) return;
          const world = clientToWorld(e.clientX, e.clientY);
          const snapped = computeSnappedDropPos(resolvedType, world.x, world.y, resolvedCustomIc);
          onDropCatalogType(resolvedType, snapped, resolvedCustomIc);
        }}
      >
        <svg
          ref={svgRef}
          data-testid="circuit-canvas"
          aria-label="Інтерактивне схемотехнічне полотно САПР"
          viewBox={fitViewBox}
          preserveAspectRatio={fitToContent ? 'xMidYMid meet' : undefined}
          className={`h-full w-full ${onChangeViewport ? 'touch-none' : ''}`}
          onPointerDown={(e) => {
            if (pinchRef.current) return;
            activePointerRef.current = e.pointerId;
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            } catch {
              // Ignore when browser/test runner declines pointer capture
            }
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
          onPointerMove={(e) => {
            if (pinchRef.current) return;
            handlePointerMove(e);
          }}
          onPointerUp={clearInteractions}
          onPointerCancel={clearInteractions}
          onLostPointerCapture={() => clearInteractions()}
        >
          {/* Світова точкова сітка редактора (приховується при друці/PDF) */}
          {!hideGrid && (
            <>
              <defs>
                <pattern
                  id={dotGridPatternId}
                  width={16}
                  height={16}
                  patternUnits="userSpaceOnUse"
                  patternTransform={`translate(${viewport.panX - 8 * viewport.zoom}, ${viewport.panY - 8 * viewport.zoom}) scale(${viewport.zoom})`}
                >
                  <circle cx={8} cy={8} r={0.95} fill="#808080" />
                </pattern>
              </defs>
              <rect
                x={0}
                y={0}
                width="100%"
                height="100%"
                fill={`url(#${dotGridPatternId})`}
                className="print-hide-grid pointer-events-none"
              />
            </>
          )}
          <g
            transform={
              fitToContent
                ? undefined
                : `translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`
            }
          >
            {alignGuides.vertical !== null && (
              <line
                x1={alignGuides.vertical}
                y1={-400}
                x2={alignGuides.vertical}
                y2={1600}
                stroke="#008080"
                strokeWidth={1}
                strokeDasharray="4 3"
                className="pointer-events-none"
              />
            )}
            {alignGuides.horizontal !== null && (
              <line
                x1={-400}
                y1={alignGuides.horizontal}
                x2={2400}
                y2={alignGuides.horizontal}
                stroke="#008080"
                strokeWidth={1}
                strokeDasharray="4 3"
                className="pointer-events-none"
              />
            )}

            {routedEdges.map(({ edge, sig, style, route }) => {
              const isSelected = selectedEdgeId === edge.id;
              return (
                <g
                  key={edge.id}
                  data-edge-id={edge.id}
                  data-signal={sig}
                  className={readOnly ? '' : 'cursor-pointer'}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelectEdge?.(edge.id);
                    onSelectNode?.(null);
                  }}
                >
                  <path d={route.path} fill="none" stroke="transparent" strokeWidth={14} />
                  {isSelected && (
                    <path
                      d={route.path}
                      fill="none"
                      stroke="var(--win-titlebar-start)"
                      strokeWidth={style.width + 3}
                      strokeOpacity={0.35}
                      strokeLinejoin="miter"
                    />
                  )}
                  <path
                    d={route.path}
                    fill="none"
                    stroke={style.stroke}
                    strokeWidth={style.width}
                    strokeDasharray={style.dash}
                    strokeLinejoin="miter"
                    strokeLinecap="square"
                  />
                </g>
              );
            })}

            {junctionDots.map((j) => (
              <circle
                key={j.key}
                data-testid="wire-junction-dot"
                cx={j.x}
                cy={j.y}
                r={3.8}
                fill={j.color}
                stroke="#ffffff"
                strokeWidth={1}
                className="pointer-events-none"
              />
            ))}

            {wiringFrom && (
              <path
                d={computeWireRoute(wiringFrom.x, wiringFrom.y, cursorWorld.x, cursorWorld.y).path}
                fill="none"
                stroke="var(--logic-1-wire)"
                strokeWidth={2.2}
                strokeDasharray="6 4"
                strokeLinejoin="miter"
                className="pointer-events-none"
              />
            )}

            {orderedNodes.map((node) => {
              const isDragged = draggingNode?.nodeId === node.id;
              return (
                <g key={node.id} opacity={isDragged ? 0.68 : 1}>
                  <CircuitNode
                    node={node}
                    pinStates={nodePinStates?.[node.id]}
                    selected={selectedNodeId === node.id}
                    readOnly={readOnly}
                    activeWiringPinKey={
                      wiringFrom ? `${wiringFrom.nodeId}::${wiringFrom.pin.id}` : null
                    }
                    onNodePointerDown={handleNodePointerDown}
                    onPinClick={handlePinClick}
                    onToggleSwitch={onToggleSwitch}
                    onToggleDipBit={onToggleDipBit}
                  />
                  {isDragged && (
                    <g className="pointer-events-none">
                      <rect
                        x={node.position.x - 4}
                        y={node.position.y - 4}
                        width={node.width + 8}
                        height={node.height + 8}
                        fill="none"
                        stroke="#000080"
                        strokeWidth={1.2}
                        strokeDasharray="4 2"
                      />
                      <rect
                        x={node.position.x}
                        y={node.position.y + node.height + 6}
                        width={88}
                        height={15}
                        fill="#000080"
                        stroke="#000000"
                        strokeWidth={1}
                      />
                      <text
                        x={node.position.x + 44}
                        y={node.position.y + node.height + 16.5}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize={9.5}
                        fontWeight={700}
                        fontFamily="Courier New, Fixedsys, Consolas, monospace"
                      >
                        x:{node.position.x} y:{node.position.y}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {dropGhostNode && (
              <g data-testid="canvas-drop-ghost" opacity={0.58} className="pointer-events-none">
                <rect
                  x={dropGhostNode.position.x - 4}
                  y={dropGhostNode.position.y - 4}
                  width={dropGhostNode.width + 8}
                  height={dropGhostNode.height + 8}
                  fill="#eef4ff"
                  fillOpacity={0.6}
                  stroke="#000080"
                  strokeWidth={1.6}
                  strokeDasharray="4 3"
                />
                <CircuitNode node={dropGhostNode} readOnly />
              </g>
            )}
          </g>
        </svg>

        {wiringFrom && (
          <div className="win95-window pointer-events-none absolute top-2.5 left-1/2 -translate-x-1/2 max-w-[calc(100%-1rem)] px-3 py-1 text-center text-xs font-bold text-win-ink">
            З’єднання від виводу <span className="font-mono font-bold">{wiringFrom.pin.name}</span>{' '}
            — оберіть цільовий пін (або торкніться полотна для скасування)
          </div>
        )}
      </div>

      {!hideStatusbar && (
        <div
          data-testid="canvas-statusbar"
          className="print:hidden flex flex-wrap items-center gap-1 bg-win-bg pt-1 text-xs font-bold min-w-0"
        >
          <div className="win95-statusbar-cell bg-win-highlight shrink-0 px-2 py-0.5 font-mono text-logic-high border border-logic-high-border">
            1 = HIGH
          </div>
          <div className="win95-statusbar-cell shrink-0 px-2 py-0.5 font-mono text-logic-low">
            0 = LOW
          </div>
          <div className="win95-statusbar-cell shrink-0 px-2 py-0.5 font-mono text-logic-z">
            Z = High-Z
          </div>
          <div className="win95-statusbar-cell shrink-0 px-2 py-0.5 font-mono text-logic-x">
            X = Конфлікт
          </div>
          <div className="win95-statusbar-cell hidden sm:flex min-w-0 flex-1 items-center justify-end gap-1 px-2 py-0.5 font-mono text-[11px] font-normal text-win-muted truncate">
            {onChangeViewport && (
              <>
                <button
                  type="button"
                  data-testid="canvas-zoom-out"
                  aria-label="Зменшити масштаб полотна"
                  onClick={() =>
                    onChangeViewport({
                      zoom: Math.max(0.35, Number((viewport.zoom * 0.85).toFixed(2))),
                    })
                  }
                  className="win95-button px-1.5 py-0 text-[10px] font-bold text-win-ink leading-tight"
                >
                  -
                </button>
                <button
                  type="button"
                  data-testid="canvas-zoom-reset"
                  title="Скинути масштаб на 100%"
                  onClick={() => onChangeViewport({ zoom: 1, panX: 0, panY: 0 })}
                  className="win95-button px-1.5 py-0 text-[10px] font-bold text-win-ink leading-tight"
                >
                  100%
                </button>
                <button
                  type="button"
                  data-testid="canvas-zoom-in"
                  aria-label="Збільшити масштаб полотна"
                  onClick={() =>
                    onChangeViewport({
                      zoom: Math.min(2.2, Number((viewport.zoom * 1.18).toFixed(2))),
                    })
                  }
                  className="win95-button px-1.5 py-0 text-[10px] font-bold text-win-ink leading-tight mr-1"
                >
                  +
                </button>
              </>
            )}
            <span data-testid="canvas-zoom-label">Масштаб: {Math.round(viewport.zoom * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
};
