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
import { CircuitNode } from './CircuitNode';

interface WireStyle {
  stroke: string;
  width: number;
  dash?: string;
  labelColor: string;
}

const WIRE_STYLES: Record<LogicState, WireStyle> = {
  '0': { stroke: 'var(--logic-0)', width: 2.2, labelColor: 'var(--logic-0)' },
  '1': { stroke: 'var(--logic-1-wire)', width: 2.6, labelColor: 'var(--logic-1)' },
  Z: { stroke: 'var(--logic-z)', width: 2.0, dash: '5 4', labelColor: 'var(--logic-z)' },
  X: { stroke: 'var(--logic-x)', width: 2.8, labelColor: 'var(--logic-x)' },
};

export interface WirePoint {
  x: number;
  y: number;
}

export interface WireRoute {
  path: string;
  labelX: number;
  labelY: number;
  points: WirePoint[];
}

export interface NetJunctionDot {
  key: string;
  x: number;
  y: number;
  color: string;
}

/**
 * Будує прямолінійну ортогональну трасу (90° CAD / Manhattan routing)
 * без гладких кривих Безьє, включно з обводом зворотних зв’язків.
 */
export function computeWireRoute(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  overrideMidX?: number,
): WireRoute {
  const sx = Math.round(x1);
  const sy = Math.round(y1);
  const tx = Math.round(x2);
  const ty = Math.round(y2);

  if (Math.abs(ty - sy) < 2 && tx >= sx) {
    return {
      path: `M ${sx} ${sy} L ${tx} ${ty}`,
      labelX: Math.round((sx + tx) / 2),
      labelY: sy,
      points: [
        { x: sx, y: sy },
        { x: tx, y: ty },
      ],
    };
  }

  if (tx >= sx + 20) {
    const midX =
      overrideMidX !== undefined
        ? Math.max(sx + 10, Math.min(tx - 10, Math.round(overrideMidX)))
        : Math.round((sx + tx) / 2);
    const isNearFlat = Math.abs(ty - sy) < 22;
    return {
      path: `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}`,
      labelX: isNearFlat ? Math.round((sx + midX) / 2) : midX,
      labelY: isNearFlat ? sy : Math.round((sy + ty) / 2),
      points: [
        { x: sx, y: sy },
        { x: midX, y: sy },
        { x: midX, y: ty },
        { x: tx, y: ty },
      ],
    };
  }

  // Зворотний або петльовий зв’язок: обводимо корпус чіткими прямими кутами 90°
  const outX = sx + 16;
  const inX = tx - 16;
  const routeY = Math.abs(ty - sy) >= 56 ? Math.round((sy + ty) / 2) : Math.min(sy, ty) - 44;

  return {
    path: `M ${sx} ${sy} L ${outX} ${sy} L ${outX} ${routeY} L ${inX} ${routeY} L ${inX} ${ty} L ${tx} ${ty}`,
    labelX: Math.round((outX + inX) / 2),
    labelY: routeY,
    points: [
      { x: sx, y: sy },
      { x: outX, y: sy },
      { x: outX, y: routeY },
      { x: inX, y: routeY },
      { x: inX, y: ty },
      { x: tx, y: ty },
    ],
  };
}

/**
 * Визначає точки електричного розгалуження/з’єднання (T-подібні вузли або з’єднані перетини)
 * у межах одного електричного кола (net). Нез’єднані перетини різних кіл крапки не отримують.
 */
export function computeNetJunctions(
  routedEdges: Array<{
    sourcePinKey: string;
    targetPinKey: string;
    points: WirePoint[];
    color: string;
  }>,
  pinPointKeys: Set<string>,
): NetJunctionDot[] {
  if (routedEdges.length < 2) return [];

  const parent = new Map<string, string>();
  const findRoot = (k: string): string => {
    const p = parent.get(k);
    if (!p || p === k) return k;
    const r = findRoot(p);
    parent.set(k, r);
    return r;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = findRoot(a);
    const rb = findRoot(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const e of routedEdges) {
    union(e.sourcePinKey, e.targetPinKey);
  }

  const netGroups = new Map<
    string,
    { segs: Array<{ x1: number; y1: number; x2: number; y2: number }>; color: string }
  >();

  for (const e of routedEdges) {
    const netId = findRoot(e.sourcePinKey);
    let grp = netGroups.get(netId);
    if (!grp) {
      grp = { segs: [], color: e.color };
      netGroups.set(netId, grp);
    }
    for (let i = 0; i < e.points.length - 1; i++) {
      const a = e.points[i];
      const b = e.points[i + 1];
      if (a.x === b.x && a.y === b.y) continue;
      grp.segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }

  const dots: NetJunctionDot[] = [];
  for (const [netId, grp] of netGroups.entries()) {
    if (grp.segs.length < 2) continue;

    const hSegs: Array<{ y: number; minX: number; maxX: number }> = [];
    const vSegs: Array<{ x: number; minY: number; maxY: number }> = [];
    const candidates = new Map<string, WirePoint>();

    for (const s of grp.segs) {
      candidates.set(`${s.x1},${s.y1}`, { x: s.x1, y: s.y1 });
      candidates.set(`${s.x2},${s.y2}`, { x: s.x2, y: s.y2 });
      if (s.y1 === s.y2) {
        hSegs.push({ y: s.y1, minX: Math.min(s.x1, s.x2), maxX: Math.max(s.x1, s.x2) });
      } else if (s.x1 === s.x2) {
        vSegs.push({ x: s.x1, minY: Math.min(s.y1, s.y2), maxY: Math.max(s.y1, s.y2) });
      }
    }

    for (const h of hSegs) {
      for (const v of vSegs) {
        if (v.x >= h.minX && v.x <= h.maxX && h.y >= v.minY && h.y <= v.maxY) {
          candidates.set(`${v.x},${h.y}`, { x: v.x, y: h.y });
        }
      }
    }

    for (const [ptKey, pt] of candidates.entries()) {
      if (pinPointKeys.has(ptKey)) continue;
      const dirs = new Set<'L' | 'R' | 'U' | 'D'>();
      for (const h of hSegs) {
        if (h.y === pt.y && pt.x >= h.minX && pt.x <= h.maxX) {
          if (h.minX < pt.x) dirs.add('L');
          if (h.maxX > pt.x) dirs.add('R');
        }
      }
      for (const v of vSegs) {
        if (v.x === pt.x && pt.y >= v.minY && pt.y <= v.maxY) {
          if (v.minY < pt.y) dirs.add('U');
          if (v.maxY > pt.y) dirs.add('D');
        }
      }
      if (dirs.size >= 3) {
        dots.push({
          key: `${netId}_${ptKey}`,
          x: pt.x,
          y: pt.y,
          color: grp.color,
        });
      }
    }
  }

  return dots;
}

/**
 * Прив’язує позицію перетягуваного/нового елемента до 8px сітки та магнітно
 * вирівнює його піни по горизонталі (0px зсуву) до підключених або сусідніх пінів,
 * щоб дроти до світлодіодів та вентилів залишалися ідеально прямими.
 */
function snapNodePosition(
  subject: CircuitNodeData,
  rawX: number,
  rawY: number,
  allNodes: CircuitNodeData[],
  edges: CircuitEdgeData[],
  gridSnap: boolean,
): { x: number; y: number } {
  let nx = gridSnap ? Math.round(rawX / 8) * 8 : Math.round(rawX);
  let ny = gridSnap ? Math.round(rawY / 8) * 8 : Math.round(rawY);

  const others = allNodes.filter((n) => n.id !== subject.id);
  const nodeMap = new Map(others.map((n) => [n.id, n]));

  // Пріоритет 1: магнітне вирівнювання напряму з уже підключеними пінами (допуск 12px)
  let bestPinDelta = Infinity;
  let snappedPinY: number | null = null;

  for (const e of edges) {
    const isSource = e.sourceNodeId === subject.id;
    const isTarget = e.targetNodeId === subject.id;
    if (!isSource && !isTarget) continue;

    const myPinId = isSource ? e.sourcePinId : e.targetPinId;
    const peerId = isSource ? e.targetNodeId : e.sourceNodeId;
    const peerPinId = isSource ? e.targetPinId : e.sourcePinId;

    const myPin = subject.pins.find((p) => p.id === myPinId);
    const peerNode = nodeMap.get(peerId);
    const peerPin = peerNode?.pins.find((p) => p.id === peerPinId);
    if (!myPin || !peerNode || !peerPin) continue;

    const targetY = peerNode.position.y + peerPin.offset.y;
    const diff = Math.abs(ny + myPin.offset.y - targetY);
    if (diff <= 12 && diff < bestPinDelta) {
      bestPinDelta = diff;
      snappedPinY = Math.round(targetY - myPin.offset.y);
    }
  }

  // Пріоритет 2: якщо зв’язку ще немає, вирівнюємо пін до найближчого піна іншого вузла (допуск 8px)
  if (snappedPinY === null) {
    for (const myPin of subject.pins) {
      const curY = ny + myPin.offset.y;
      for (const other of others) {
        for (const otherPin of other.pins) {
          const targetY = other.position.y + otherPin.offset.y;
          const diff = Math.abs(curY - targetY);
          if (diff <= 8 && diff < bestPinDelta) {
            bestPinDelta = diff;
            snappedPinY = Math.round(targetY - myPin.offset.y);
          }
        }
      }
    }
  }

  if (snappedPinY !== null) {
    ny = snappedPinY;
  }

  // Магнітне вирівнювання колонки X до інших компонентів
  for (const other of others) {
    if (Math.abs(nx - other.position.x) <= 6) {
      nx = other.position.x;
      break;
    }
  }

  return { x: nx, y: ny };
}

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

  // Не-пасивна обробка масштабування коліщатком, трекпадом (ctrl+wheel) та жестом зведення/розведення двома пальцями (pinch)
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;

    const clampZoom = (z: number) => Math.min(2.2, Math.max(0.35, Number(z.toFixed(2))));

    const applyAnchoredZoom = (nextZoom: number, clientX: number, clientY: number) => {
      const cb = onChangeViewportRef.current;
      if (!cb) return;
      const vp = viewportRef.current;
      const safeZoom = Math.max(0.1, Number.isFinite(vp.zoom) ? vp.zoom : 1);
      const rect = wrapper.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      const worldX = (cx - vp.panX) / safeZoom;
      const worldY = (cy - vp.panY) / safeZoom;
      cb({
        zoom: nextZoom,
        panX: Math.round(cx - worldX * nextZoom),
        panY: Math.round(cy - worldY * nextZoom),
      });
    };

    const handleWheel = (e: WheelEvent) => {
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
      const nextZoom = clampZoom(vp.zoom * factor);
      applyAnchoredZoom(nextZoom, e.clientX, e.clientY);
    };

    const getTouchMetrics = (touches: TouchList) => {
      const t0 = touches[0];
      const t1 = touches[1];
      return {
        dist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
        midX: (t0.clientX + t1.clientX) / 2,
        midY: (t0.clientY + t1.clientY) / 2,
      };
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!onChangeViewportRef.current) return;
      if (e.touches.length >= 2) {
        e.preventDefault();
        e.stopPropagation();
        clearInteractions();
        const { dist, midX, midY } = getTouchMetrics(e.touches);
        const vp = viewportRef.current;
        pinchRef.current = {
          startDist: Math.max(8, dist),
          baseZoom: vp.zoom,
          basePanX: vp.panX,
          basePanY: vp.panY,
          startMidX: midX,
          startMidY: midY,
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const cb = onChangeViewportRef.current;
      if (!cb) return;
      if (e.touches.length >= 2) {
        e.preventDefault();
        e.stopPropagation();
        const metrics = getTouchMetrics(e.touches);
        const vp = viewportRef.current;
        if (!pinchRef.current) {
          pinchRef.current = {
            startDist: Math.max(8, metrics.dist),
            baseZoom: vp.zoom,
            basePanX: vp.panX,
            basePanY: vp.panY,
            startMidX: metrics.midX,
            startMidY: metrics.midY,
          };
          return;
        }
        const pinch = pinchRef.current;
        const rect = wrapper.getBoundingClientRect();
        const nextZoom = clampZoom(pinch.baseZoom * (metrics.dist / pinch.startDist));
        const anchorWorldX = (pinch.startMidX - rect.left - pinch.basePanX) / pinch.baseZoom;
        const anchorWorldY = (pinch.startMidY - rect.top - pinch.basePanY) / pinch.baseZoom;
        cb({
          zoom: nextZoom,
          panX: Math.round(metrics.midX - rect.left - anchorWorldX * nextZoom),
          panY: Math.round(metrics.midY - rect.top - anchorWorldY * nextZoom),
        });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchRef.current = null;
      }
    };

    const blockGestureZoom = (e: Event) => {
      if (onChangeViewportRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    wrapper.addEventListener('touchstart', handleTouchStart, { passive: false });
    wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    wrapper.addEventListener('touchend', handleTouchEnd, { passive: true });
    wrapper.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    wrapper.addEventListener('gesturestart', blockGestureZoom, { passive: false });
    wrapper.addEventListener('gesturechange', blockGestureZoom, { passive: false });

    return () => {
      wrapper.removeEventListener('wheel', handleWheel);
      wrapper.removeEventListener('touchstart', handleTouchStart);
      wrapper.removeEventListener('touchmove', handleTouchMove);
      wrapper.removeEventListener('touchend', handleTouchEnd);
      wrapper.removeEventListener('touchcancel', handleTouchEnd);
      wrapper.removeEventListener('gesturestart', blockGestureZoom);
      wrapper.removeEventListener('gesturechange', blockGestureZoom);
    };
  }, [clearInteractions]);

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

  // Магнітні напрямні CAD-вирівнювання під час перетягування елементів
  const alignGuides = useMemo(() => {
    const activeSubject = activeDraggedNode ?? dropGhostNode;
    let vertical: number | null = null;
    let horizontal: number | null = null;

    if (activeSubject) {
      const aBox = {
        x: activeSubject.position.x,
        y: activeSubject.position.y,
        width: activeSubject.width,
        height: activeSubject.height,
      };
      const aCx = aBox.x + aBox.width / 2;
      const aCy = aBox.y + aBox.height / 2;

      for (const other of nodes) {
        if (other.id === activeSubject.id) continue;
        const bBox = {
          x: other.position.x,
          y: other.position.y,
          width: other.width,
          height: other.height,
        };
        const bCx = bBox.x + bBox.width / 2;
        const bCy = bBox.y + bBox.height / 2;
        if (vertical === null && (Math.abs(aBox.x - bBox.x) <= 4 || Math.abs(aCx - bCx) <= 4)) {
          vertical = Math.abs(aCx - bCx) <= 4 ? bCx : bBox.x;
        }
        if (horizontal === null && (Math.abs(aBox.y - bBox.y) <= 4 || Math.abs(aCy - bCy) <= 4)) {
          horizontal = Math.abs(aCy - bCy) <= 4 ? bCy : bBox.y;
        }
        if (horizontal === null) {
          for (const ap of activeSubject.pins) {
            const aPinY = aBox.y + ap.offset.y;
            for (const bp of other.pins) {
              const bPinY = bBox.y + bp.offset.y;
              if (Math.abs(aPinY - bPinY) <= 2) {
                horizontal = bPinY;
                break;
              }
            }
            if (horizontal !== null) break;
          }
        }
      }
    }

    return { vertical, horizontal };
  }, [activeDraggedNode, dropGhostNode, nodes]);

  const { routedEdges, junctionDots } = useMemo(() => {
    const coordMap = new Map<string, { x: number; y: number }>();
    const pinKeys = new Set<string>();
    for (const n of nodes) {
      for (const p of n.pins) {
        const px = Math.round(n.position.x + p.offset.x);
        const py = Math.round(n.position.y + p.offset.y);
        coordMap.set(`${n.id}::${p.id}`, { x: px, y: py });
        pinKeys.add(`${px},${py}`);
      }
    }

    const rawEdges = edges
      .map((edge) => {
        const sKey = `${edge.sourceNodeId}::${edge.sourcePinId}`;
        const tKey = `${edge.targetNodeId}::${edge.targetPinId}`;
        const p1 = coordMap.get(sKey);
        const p2 = coordMap.get(tKey);
        if (!p1 || !p2) return null;
        const sig: LogicState = edgeStates?.[edge.id] ?? edge.signalState ?? 'Z';
        const style = WIRE_STYLES[sig] ?? WIRE_STYLES.Z;
        return { edge, sKey, tKey, p1, p2, sig, style };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Об’єднуємо провідники у спільні електричні кола (nets) для розділення паралельних шин без фальшивого накладання
    const parent = new Map<string, string>();
    const findNet = (k: string): string => {
      const p = parent.get(k);
      if (!p || p === k) return k;
      const r = findNet(p);
      parent.set(k, r);
      return r;
    };
    for (const r of rawEdges) {
      if (!parent.has(r.sKey)) parent.set(r.sKey, r.sKey);
      if (!parent.has(r.tKey)) parent.set(r.tKey, r.tKey);
      const ra = findNet(r.sKey);
      const rb = findNet(r.tKey);
      if (ra !== rb) parent.set(ra, rb);
    }

    const netCorridorMeta = new Map<
      string,
      {
        netId: string;
        avgSy: number;
        syCount: number;
        maxSx: number;
        minTx: number;
        bucket: number;
      }
    >();
    for (const r of rawEdges) {
      const netId = findNet(r.sKey);
      const sx = Math.round(r.p1.x);
      const sy = Math.round(r.p1.y);
      const tx = Math.round(r.p2.x);
      const ty = Math.round(r.p2.y);
      if (tx >= sx + 20 && Math.abs(ty - sy) >= 2) {
        const bucket = Math.round(Math.round((sx + tx) / 2) / 16);
        const cur = netCorridorMeta.get(netId);
        if (!cur) {
          netCorridorMeta.set(netId, {
            netId,
            avgSy: sy,
            syCount: 1,
            maxSx: sx,
            minTx: tx,
            bucket,
          });
        } else {
          cur.avgSy = (cur.avgSy * cur.syCount + sy) / (cur.syCount + 1);
          cur.syCount += 1;
          cur.maxSx = Math.max(cur.maxSx, sx);
          cur.minTx = Math.min(cur.minTx, tx);
        }
      }
    }

    const buckets = new Map<number, Array<NonNullable<ReturnType<typeof netCorridorMeta.get>>>>();
    for (const meta of netCorridorMeta.values()) {
      const list = buckets.get(meta.bucket) ?? [];
      list.push(meta);
      buckets.set(meta.bucket, list);
    }

    const netOverrideMidX = new Map<string, number>();
    for (const list of buckets.values()) {
      if (list.length <= 1) continue;
      list.sort((a, b) => a.avgSy - b.avgSy || a.netId.localeCompare(b.netId));
      const sharedLeft = Math.max(...list.map((m) => m.maxSx));
      const sharedRight = Math.min(...list.map((m) => m.minTx));
      const spanAvail = sharedRight - sharedLeft - 24;
      if (spanAvail < 12) continue;
      const baseMid = Math.round((sharedLeft + sharedRight) / 2);
      const step = Math.min(8, Math.max(4, Math.floor(spanAvail / list.length)));
      list.forEach((meta, idx) => {
        const offset = (idx - (list.length - 1) / 2) * step;
        netOverrideMidX.set(meta.netId, Math.round(baseMid + offset));
      });
    }

    const items = rawEdges.map((item) => {
      const netId = findNet(item.sKey);
      const overrideX = netOverrideMidX.get(netId);
      const route = computeWireRoute(item.p1.x, item.p1.y, item.p2.x, item.p2.y, overrideX);
      return {
        edge: item.edge,
        sKey: item.sKey,
        tKey: item.tKey,
        sig: item.sig,
        style: item.style,
        route,
      };
    });

    const dots = computeNetJunctions(
      items.map((item) => ({
        sourcePinKey: item.sKey,
        targetPinKey: item.tKey,
        points: item.route.points,
        color: item.style.stroke,
      })),
      pinKeys,
    );

    return { routedEdges: items, junctionDots: dots };
  }, [edgeStates, edges, nodes]);

  // Переносимо вузол, що перетягується, на передній шар SVG
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
            {/* Напрямні вирівнювання CAD при переміщенні */}
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

            {/* Лінії з'єднань (Edges / Nets) */}
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

            {/* Контактні вузлові крапки у точках розгалуження/з’єднання одного кола */}
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

            {/* Напівпрозорий привид (Drag Ghost) при перетягуванні елемента з палітри */}
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

      {/* Нижній рядок стану Windows 95 із вдавленою легендою логічних рівнів */}
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
