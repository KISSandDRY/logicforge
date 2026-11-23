import type { CircuitEdgeData, CircuitNodeData, LogicState } from '@logicforge/shared-types';

export interface WireStyle {
  stroke: string;
  width: number;
  dash?: string;
  labelColor: string;
}

export const WIRE_STYLES: Record<LogicState, WireStyle> = {
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

export interface RoutedEdgeItem {
  edge: CircuitEdgeData;
  sKey: string;
  tKey: string;
  sig: LogicState;
  style: WireStyle;
  route: WireRoute;
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
export function snapNodePosition(
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

  for (const other of others) {
    if (Math.abs(nx - other.position.x) <= 6) {
      nx = other.position.x;
      break;
    }
  }

  return { x: nx, y: ny };
}

export function computeAlignmentGuides(
  activeSubject: CircuitNodeData | null,
  nodes: CircuitNodeData[],
): { vertical: number | null; horizontal: number | null } {
  let vertical: number | null = null;
  let horizontal: number | null = null;

  if (!activeSubject) {
    return { vertical, horizontal };
  }

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

  return { vertical, horizontal };
}

export function computeRoutedNets(
  nodes: CircuitNodeData[],
  edges: CircuitEdgeData[],
  edgeStates?: Record<string, LogicState>,
): { routedEdges: RoutedEdgeItem[]; junctionDots: NetJunctionDot[] } {
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

  interface NetCorridorMeta {
    netId: string;
    avgSy: number;
    syCount: number;
    maxSx: number;
    minTx: number;
    bucket: number;
  }

  const netCorridorMeta = new Map<string, NetCorridorMeta>();
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

  const buckets = new Map<number, NetCorridorMeta[]>();
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

  const routedEdges = rawEdges.map((item) => {
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

  const junctionDots = computeNetJunctions(
    routedEdges.map((item) => ({
      sourcePinKey: item.sKey,
      targetPinKey: item.tKey,
      points: item.route.points,
      color: item.style.stroke,
    })),
    pinKeys,
  );

  return { routedEdges, junctionDots };
}
