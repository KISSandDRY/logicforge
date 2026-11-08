import { getCatalogItem } from './catalog';
import { resolveBusSignals } from './logicAlgebra';
import type {
  CircuitDocument,
  CircuitEdgeData,
  CircuitNodeData,
  ElectricalNet,
  LogicState,
  StaticTimingReport,
} from './types';

class DisjointSet {
  private readonly parent = new Map<string, string>();

  public makeSet(key: string): void {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
    }
  }

  public find(key: string): string {
    const p = this.parent.get(key);
    if (!p || p === key) {
      this.parent.set(key, key);
      return key;
    }
    const root = this.find(p);
    this.parent.set(key, root);
    return root;
  }

  public union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      if (rootA < rootB) {
        this.parent.set(rootB, rootA);
      } else {
        this.parent.set(rootA, rootB);
      }
    }
  }
}

export function pinKey(nodeId: string, pinId: string): string {
  return `${nodeId}::${pinId}`;
}

export function parsePinKey(key: string): { nodeId: string; pinId: string } {
  const idx = key.indexOf('::');
  return {
    nodeId: key.slice(0, idx),
    pinId: key.slice(idx + 2),
  };
}

/**
 * Побудова еквівалентних електричних вузлів (Nets) методом неперетинних множин (Union-Find).
 * Підтримує розгалуження виходів (fan-out) та спільні тристабільні шини (multi-driver buses).
 */
export function extractElectricalNets(
  nodes: CircuitNodeData[],
  edges: CircuitEdgeData[],
  pinStates?: Record<string, Record<string, LogicState>>,
): ElectricalNet[] {
  const dsu = new DisjointSet();
  const pinDirMap = new Map<string, 'INPUT' | 'OUTPUT'>();

  for (const node of nodes) {
    for (const pin of node.pins) {
      const k = pinKey(node.id, pin.id);
      dsu.makeSet(k);
      pinDirMap.set(k, pin.direction);
    }
  }

  for (const edge of edges) {
    const srcKey = pinKey(edge.sourceNodeId, edge.sourcePinId);
    const dstKey = pinKey(edge.targetNodeId, edge.targetPinId);
    if (pinDirMap.has(srcKey) && pinDirMap.has(dstKey)) {
      dsu.union(srcKey, dstKey);
    }
  }

  const groups = new Map<
    string,
    {
      drivers: Array<{ nodeId: string; pinId: string }>;
      loads: Array<{ nodeId: string; pinId: string }>;
      edgeIds: string[];
    }
  >();

  for (const [k, dir] of pinDirMap.entries()) {
    const root = dsu.find(k);
    let grp = groups.get(root);
    if (!grp) {
      grp = { drivers: [], loads: [], edgeIds: [] };
      groups.set(root, grp);
    }
    const parsed = parsePinKey(k);
    if (dir === 'OUTPUT') {
      grp.drivers.push(parsed);
    } else {
      grp.loads.push(parsed);
    }
  }

  for (const edge of edges) {
    const srcKey = pinKey(edge.sourceNodeId, edge.sourcePinId);
    if (pinDirMap.has(srcKey)) {
      const root = dsu.find(srcKey);
      groups.get(root)?.edgeIds.push(edge.id);
    }
  }

  let netCounter = 1;
  const nets: ElectricalNet[] = [];

  for (const grp of groups.values()) {
    if (grp.edgeIds.length === 0 && grp.drivers.length + grp.loads.length <= 1) {
      continue;
    }
    const driverSignals: LogicState[] = grp.drivers.map(({ nodeId, pinId }) => {
      if (pinStates && pinStates[nodeId]?.[pinId]) {
        return pinStates[nodeId][pinId];
      }
      const node = nodes.find((n) => n.id === nodeId);
      const pin = node?.pins.find((p) => p.id === pinId);
      return pin?.state ?? 'Z';
    });

    const resolved = resolveBusSignals(driverSignals);
    nets.push({
      netId: `NET_${String(netCounter).padStart(3, '0')}`,
      driverPins: grp.drivers,
      loadPins: grp.loads,
      edgeIds: grp.edgeIds,
      resolvedState: resolved.state,
      hasConflict: resolved.conflict,
    });
    netCounter += 1;
  }

  return nets;
}

function isRegisterBoundary(node: CircuitNodeData): boolean {
  const meta = getCatalogItem(node.type);
  return meta.isSequential && node.type !== 'SR_LATCH';
}

/**
 * Алгоритм Тар'яна пошуку компонент сильної зв'язності (Strongly Connected Components) O(|V| + |E|)
 * для детектування асинхронних петель зворотного зв'язку (тригерних защіпок, кільцевих генераторів).
 */
export function findFeedbackCyclesTarjan(
  nodeIds: string[],
  adjacency: Map<string, Set<string>>,
): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const strongConnect = (v: string): void => {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    const neighbors = adjacency.get(v) ?? new Set<string>();
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = [];
      while (stack.length > 0) {
        const w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
        if (w === v) break;
      }
      const hasSelfLoop = scc.length === 1 && (adjacency.get(scc[0])?.has(scc[0]) ?? false);
      if (scc.length > 1 || hasSelfLoop) {
        cycles.push(scc.reverse());
      }
    }
  };

  for (const id of nodeIds) {
    if (!indices.has(id)) {
      strongConnect(id);
    }
  }

  return cycles;
}

/**
 * Гібридний графовий аналізатор:
 * 1) Будує комбінаційний граф (розриваючи синхронні межі тригерів/регістрів).
 * 2) Виконує топологічне сортування за алгоритмом Кана (Kahn's Algorithm) за час O(|V| + |E|).
 * 3) Обчислює критичний шлях затримок поширення (Static Timing Analysis) та f_max.
 * 4) Виявляє асинхронні контури зворотного зв'язку алгоритмом Тар'яна.
 */
export function analyzeCircuitGraph(
  doc: Pick<CircuitDocument, 'nodes' | 'edges'>,
): StaticTimingReport {
  const nodeMap = new Map<string, CircuitNodeData>();
  for (const n of doc.nodes) {
    nodeMap.set(n.id, n);
  }

  const nets = extractElectricalNets(doc.nodes, doc.edges);
  const fullAdj = new Map<string, Set<string>>();
  const dagAdj = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const n of doc.nodes) {
    fullAdj.set(n.id, new Set<string>());
    dagAdj.set(n.id, new Set<string>());
    inDegree.set(n.id, 0);
  }

  for (const net of nets) {
    for (const drv of net.driverPins) {
      for (const load of net.loadPins) {
        const u = drv.nodeId;
        const v = load.nodeId;
        if (!nodeMap.has(u) || !nodeMap.has(v)) continue;

        fullAdj.get(u)!.add(v);

        const targetNode = nodeMap.get(v)!;
        // Синхронні тригери розривають комбінаційний шлях на своїх входах
        if (!isRegisterBoundary(targetNode)) {
          if (!dagAdj.get(u)!.has(v)) {
            dagAdj.get(u)!.add(v);
            inDegree.set(v, (inDegree.get(v) ?? 0) + 1);
          }
        }
      }
    }
  }

  // Алгоритм Кана для топологічного сортування комбінаційного підграфа
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const topologicalOrder: string[] = [];
  const arrivalTimesNs: Record<string, number> = {};
  const predecessor = new Map<string, string | null>();

  for (const n of doc.nodes) {
    arrivalTimesNs[n.id] = n.properties.propagationDelayNs;
    predecessor.set(n.id, null);
  }

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    topologicalOrder.push(u);

    const neighbors = dagAdj.get(u) ?? new Set<string>();
    for (const v of neighbors) {
      const vNode = nodeMap.get(v)!;
      const candidateArrival = arrivalTimesNs[u] + vNode.properties.propagationDelayNs;
      if (candidateArrival > arrivalTimesNs[v]) {
        arrivalTimesNs[v] = candidateArrival;
        predecessor.set(v, u);
      }

      const nextDeg = (inDegree.get(v) ?? 1) - 1;
      inDegree.set(v, nextDeg);
      if (nextDeg === 0) {
        queue.push(v);
      }
    }
  }

  const isCombinationalAcyclic = topologicalOrder.length === doc.nodes.length;
  const stronglyConnectedCycles = findFeedbackCyclesTarjan(
    doc.nodes.map((n) => n.id),
    dagAdj,
  );

  // Відновлення критичного шляху (найбільший час прибуття сигналу)
  let maxDelay = 0;
  let endNodeId: string | null = null;
  for (const id of topologicalOrder) {
    if (arrivalTimesNs[id] >= maxDelay) {
      maxDelay = arrivalTimesNs[id];
      endNodeId = id;
    }
  }

  const criticalPathNodes: string[] = [];
  let cursor = endNodeId;
  const visitedGuard = new Set<string>();
  while (cursor && !visitedGuard.has(cursor)) {
    visitedGuard.add(cursor);
    criticalPathNodes.push(cursor);
    cursor = predecessor.get(cursor) ?? null;
  }
  criticalPathNodes.reverse();

  const maxClockFrequencyMhz = maxDelay > 0 ? Number((1000 / maxDelay).toFixed(2)) : 1000;

  return {
    isCombinationalAcyclic,
    topologicalOrder,
    stronglyConnectedCycles,
    criticalPathNodes,
    criticalPathDelayNs: maxDelay,
    maxClockFrequencyMhz,
    arrivalTimesNs,
  };
}
