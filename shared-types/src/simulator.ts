import {
  NODE_EVALUATORS,
  type InternalSequentialState,
  type NodeEvaluatorContext,
} from './evaluators';
import { analyzeCircuitGraph, extractElectricalNets, pinKey } from './graphAnalysis';
import { computeTimer555Intervals } from './logicAlgebra';
import { MinHeap } from './minHeap';
import type {
  CircuitDocument,
  CircuitEdgeData,
  CircuitNodeData,
  CustomICDefinition,
  ElectricalNet,
  LogicState,
  SimulationEvent,
  SimulationSnapshot,
  WaveformSample,
} from './types';

function createInitialSeqState(): InternalSequentialState {
  return {
    q: '0',
    prevClk: '0',
    counterValue: 0,
    timerPhase: 'LOW',
    nextTimerToggleNs: 0,
  };
}

const MAX_EVENTS_PER_WINDOW = 2500;
const MAX_CUSTOM_IC_NESTING_DEPTH = 8;

function sanitizeDelayNs(rawDelay: number | undefined, fallback = 0): number {
  if (typeof rawDelay !== 'number' || !Number.isFinite(rawDelay)) {
    return fallback;
  }
  return Math.max(0, Math.min(10000, rawDelay));
}

/**
 * Гібридне ядро симуляції цифрових логічних схем:
 * - Комбінує топологічну ініціалізацію за алгоритмом Кана (Kahn's Algorithm) для комбінаційних ділянок
 *   із дискретно-подійною чергою пріоритетів (Min-Heap Event-Driven Engine) із затримками поширення.
 * - Підтримує чотиризначну тристабільну алгебру {'0', '1', 'Z', 'X'} та розв'язання спільних шин R(S).
 * - Моделює послідовнісні елементи (SR, D, JK-тригери, 4-бітний лічильник, таймер NE555, кастомні ІМС).
 */
export class CircuitSimulator {
  private nodes = new Map<string, CircuitNodeData>();
  private edges: CircuitEdgeData[] = [];
  private customIcMap = new Map<string, CustomICDefinition>();
  private nets: ElectricalNet[] = [];
  private pinToNet = new Map<string, ElectricalNet>();

  private pinStates = new Map<string, LogicState>();
  private scheduledPinTarget = new Map<string, { state: LogicState; timestampNs: number }>();
  private seqMemory = new Map<string, InternalSequentialState>();

  private eventQueue = new MinHeap<SimulationEvent>((a, b) =>
    a.timestampNs !== b.timestampNs ? a.timestampNs - b.timestampNs : a.sequence - b.sequence,
  );

  private currentTimeNs = 0;
  private sequenceCounter = 0;
  private processedEventsCount = 0;
  private status: SimulationSnapshot['status'] = 'STABLE';
  private warnings: string[] = [];
  private waveformHistory: WaveformSample[] = [];
  private readonly maxWaveformSamples = 160;
  private readonly nestingDepth: number;

  constructor(
    doc?: Pick<CircuitDocument, 'nodes' | 'edges' | 'customDefinitions'>,
    options?: { nestingDepth?: number },
  ) {
    this.nestingDepth = options?.nestingDepth ?? 0;
    if (doc) {
      this.loadCircuit(doc);
    }
  }

  public loadCircuit(doc: Pick<CircuitDocument, 'nodes' | 'edges' | 'customDefinitions'>): void {
    this.nodes.clear();
    this.pinStates.clear();
    this.scheduledPinTarget.clear();
    this.seqMemory.clear();
    this.customIcMap.clear();
    this.eventQueue.clear();
    this.waveformHistory = [];
    this.currentTimeNs = 0;
    this.sequenceCounter = 0;
    this.processedEventsCount = 0;
    this.status = 'STABLE';
    this.warnings = [];

    for (const ic of doc.customDefinitions ?? []) {
      this.customIcMap.set(ic.id, ic);
    }

    for (const rawNode of doc.nodes) {
      const cloned: CircuitNodeData = {
        ...rawNode,
        position: { ...rawNode.position },
        properties: { ...rawNode.properties },
        pins: rawNode.pins.map((p) => ({ ...p, offset: { ...p.offset } })),
      };
      this.nodes.set(cloned.id, cloned);

      for (const pin of cloned.pins) {
        const dipIdx =
          cloned.type === 'DIP_SWITCH_4' && pin.id.startsWith('Q') ? Number(pin.id.slice(1)) : -1;
        const initial: LogicState =
          cloned.type === 'CONST_HIGH' && pin.direction === 'OUTPUT'
            ? '1'
            : cloned.type === 'CONST_LOW' && pin.direction === 'OUTPUT'
              ? '0'
              : (cloned.type === 'INPUT_SWITCH' || cloned.type === 'PUSH_BUTTON') &&
                  pin.direction === 'OUTPUT'
                ? (cloned.properties.switchState ?? '0')
                : dipIdx >= 0 && dipIdx < 4
                  ? (cloned.properties.dipSwitchStates?.[dipIdx] ?? '0')
                  : pin.direction === 'INPUT'
                    ? 'Z'
                    : '0';
        this.pinStates.set(pinKey(cloned.id, pin.id), initial);
      }

      this.seqMemory.set(cloned.id, {
        q: '0',
        prevClk: '0',
        counterValue: 0,
        timerPhase: 'LOW',
        nextTimerToggleNs: 0,
      });
    }

    this.edges = doc.edges.map((e) => ({ ...e }));
    this.rebuildNets();
    this.bootstrapInitialState();
    this.recordWaveformSample();
  }

  public reset(): void {
    const doc = {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
      customDefinitions: Array.from(this.customIcMap.values()),
    };
    this.loadCircuit(doc);
  }

  public clearWaveformHistory(): void {
    this.waveformHistory = [];
  }

  public setInputState(nodeId: string, newState: LogicState): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    if (node.type !== 'INPUT_SWITCH' && node.type !== 'PUSH_BUTTON') return;

    node.properties.switchState = newState;
    this.scheduleOutputTransition(
      node.id,
      'OUT',
      newState,
      sanitizeDelayNs(node.properties.propagationDelayNs, 0),
      'User input change',
    );
  }

  public toggleInputSwitch(nodeId: string, cycleTriState = false): LogicState {
    const node = this.nodes.get(nodeId);
    if (!node) return '0';
    const current = node.properties.switchState ?? '0';
    let next: LogicState = '0';
    if (cycleTriState) {
      next = current === '0' ? '1' : current === '1' ? 'Z' : '0';
    } else {
      next = current === '1' ? '0' : '1';
    }
    this.setInputState(nodeId, next);
    return next;
  }

  public setDipSwitchBit(nodeId: string, bitIndex: number, newState: LogicState): void {
    const node = this.nodes.get(nodeId);
    if (!node || node.type !== 'DIP_SWITCH_4') return;
    if (bitIndex < 0 || bitIndex > 3) return;
    const currentTuple: [LogicState, LogicState, LogicState, LogicState] = [
      ...(node.properties.dipSwitchStates ?? ['0', '0', '0', '0']),
    ] as [LogicState, LogicState, LogicState, LogicState];
    currentTuple[bitIndex] = newState;
    node.properties.dipSwitchStates = currentTuple;
    this.scheduleOutputTransition(
      node.id,
      `Q${bitIndex}`,
      newState,
      sanitizeDelayNs(node.properties.propagationDelayNs, 0),
      `DIP switch Q${bitIndex} change`,
    );
  }

  public toggleDipSwitchBit(nodeId: string, bitIndex: number): LogicState {
    const node = this.nodes.get(nodeId);
    if (!node || node.type !== 'DIP_SWITCH_4') return '0';
    const current = node.properties.dipSwitchStates?.[bitIndex] ?? '0';
    const next: LogicState = current === '1' ? '0' : '1';
    this.setDipSwitchBit(nodeId, bitIndex, next);
    return next;
  }

  /**
   * Інкрементальна синхронізація топології та параметрів схеми БЕЗ скидання модельного часу,
   * черги подій, осцилограм і станів тригерів/лічильників.
   */
  public syncCircuit(
    doc: Pick<CircuitDocument, 'nodes' | 'edges' | 'customDefinitions'>,
  ): SimulationSnapshot {
    this.customIcMap.clear();
    for (const ic of doc.customDefinitions ?? []) {
      this.customIcMap.set(ic.id, ic);
    }

    const incomingNodeIds = new Set(doc.nodes.map((n) => n.id));
    let topologyChanged = false;

    for (const existingId of Array.from(this.nodes.keys())) {
      if (!incomingNodeIds.has(existingId)) {
        const oldNode = this.nodes.get(existingId)!;
        for (const p of oldNode.pins) {
          const k = pinKey(existingId, p.id);
          this.pinStates.delete(k);
          this.scheduledPinTarget.delete(k);
        }
        this.nodes.delete(existingId);
        this.seqMemory.delete(existingId);
        topologyChanged = true;
      }
    }

    for (const rawNode of doc.nodes) {
      const existing = this.nodes.get(rawNode.id);
      if (!existing) {
        topologyChanged = true;
        const cloned: CircuitNodeData = {
          ...rawNode,
          position: { ...rawNode.position },
          properties: { ...rawNode.properties },
          pins: rawNode.pins.map((p) => ({ ...p, offset: { ...p.offset } })),
        };
        this.nodes.set(cloned.id, cloned);
        for (const pin of cloned.pins) {
          const dipIdx =
            cloned.type === 'DIP_SWITCH_4' && pin.id.startsWith('Q') ? Number(pin.id.slice(1)) : -1;
          const initial: LogicState =
            cloned.type === 'CONST_HIGH' && pin.direction === 'OUTPUT'
              ? '1'
              : cloned.type === 'CONST_LOW' && pin.direction === 'OUTPUT'
                ? '0'
                : (cloned.type === 'INPUT_SWITCH' || cloned.type === 'PUSH_BUTTON') &&
                    pin.direction === 'OUTPUT'
                  ? (cloned.properties.switchState ?? '0')
                  : dipIdx >= 0 && dipIdx < 4
                    ? (cloned.properties.dipSwitchStates?.[dipIdx] ?? '0')
                    : pin.direction === 'INPUT'
                      ? 'Z'
                      : '0';
          this.pinStates.set(pinKey(cloned.id, pin.id), initial);
        }
        this.seqMemory.set(cloned.id, {
          q: '0',
          prevClk: '0',
          counterValue: 0,
          timerPhase: 'LOW',
          nextTimerToggleNs: 0,
        });
      } else {
        const prevSwitch = existing.properties.switchState;
        const prevDip = existing.properties.dipSwitchStates;
        const prevDelay = existing.properties.propagationDelayNs;
        const prevR1 = existing.properties.resistanceR1Ohms;
        const prevR2 = existing.properties.resistanceR2Ohms;
        const prevCap = existing.properties.capacitanceUf;
        const prevAuto = existing.properties.astableAutoTrigger;

        existing.position = { ...rawNode.position };
        existing.properties = { ...rawNode.properties };
        existing.pins = rawNode.pins.map((p) => ({ ...p, offset: { ...p.offset } }));

        if (
          existing.type === 'TIMER_555' &&
          (rawNode.properties.resistanceR1Ohms !== prevR1 ||
            rawNode.properties.resistanceR2Ohms !== prevR2 ||
            rawNode.properties.capacitanceUf !== prevCap ||
            rawNode.properties.astableAutoTrigger !== prevAuto)
        ) {
          const mem = this.seqMemory.get(existing.id);
          if (mem) {
            mem.nextTimerToggleNs = this.currentTimeNs;
          }
        }

        if (
          (existing.type === 'INPUT_SWITCH' || existing.type === 'PUSH_BUTTON') &&
          rawNode.properties.switchState !== undefined &&
          rawNode.properties.switchState !== prevSwitch
        ) {
          const k = pinKey(existing.id, 'OUT');
          this.pinStates.set(k, rawNode.properties.switchState);
          const net = this.pinToNet.get(k);
          if (net) {
            for (const nid of this.propagateNet(net)) {
              const downstream = this.nodes.get(nid);
              if (downstream) this.evaluateNodeAndSchedule(downstream);
            }
          }
        }

        if (existing.type === 'DIP_SWITCH_4' && rawNode.properties.dipSwitchStates) {
          for (let i = 0; i < 4; i++) {
            const nextBit = rawNode.properties.dipSwitchStates[i] ?? '0';
            if (!prevDip || prevDip[i] !== nextBit) {
              const k = pinKey(existing.id, `Q${i}`);
              this.pinStates.set(k, nextBit);
              const net = this.pinToNet.get(k);
              if (net) {
                for (const nid of this.propagateNet(net)) {
                  const downstream = this.nodes.get(nid);
                  if (downstream) this.evaluateNodeAndSchedule(downstream);
                }
              }
            }
          }
        }

        if (rawNode.properties.propagationDelayNs !== prevDelay) {
          this.evaluateNodeAndSchedule(existing);
        }
      }
    }

    const oldEdgesSig = this.edges
      .map((e) => `${e.sourceNodeId}:${e.sourcePinId}->${e.targetNodeId}:${e.targetPinId}`)
      .sort()
      .join('|');
    const newEdgesSig = doc.edges
      .map((e) => `${e.sourceNodeId}:${e.sourcePinId}->${e.targetNodeId}:${e.targetPinId}`)
      .sort()
      .join('|');

    if (oldEdgesSig !== newEdgesSig) {
      topologyChanged = true;
    }

    this.edges = doc.edges.map((e) => ({ ...e }));

    if (topologyChanged) {
      // Reset unconnected input pins to Z before rebuilding nets
      for (const node of this.nodes.values()) {
        for (const p of node.pins) {
          if (p.direction === 'INPUT') {
            this.pinStates.set(pinKey(node.id, p.id), 'Z');
          }
        }
      }
      this.rebuildNets();
      for (const net of this.nets) {
        this.propagateNet(net);
      }
      for (const node of this.nodes.values()) {
        this.evaluateNodeAndSchedule(node);
      }
    }

    if (this.currentTimeNs === 0 || topologyChanged) {
      return this.settleCombinational(300);
    }
    this.updateSystemStatus();
    return this.getSnapshot();
  }

  /**
   * Просування модельного часу на deltaNs із обробкою всіх запланованих подій у купі Min-Heap
   * та генерацією чергових імпульсів синхрогенераторів CLOCK і таймерів NE555.
   */
  public advanceBy(deltaNs: number): SimulationSnapshot {
    if (this.waveformHistory.length === 0) {
      this.recordWaveformSample();
    }
    const safeDeltaNs = Number.isFinite(deltaNs) ? Math.max(1, Math.min(100000, deltaNs)) : 1;
    const targetTimeNs = this.currentTimeNs + safeDeltaNs;
    this.enqueuePeriodicSourcesUpTo(targetTimeNs);

    let processedInWindow = 0;
    this.warnings = [];

    while (!this.eventQueue.isEmpty()) {
      const nextEvent = this.eventQueue.peek()!;
      if (nextEvent.timestampNs > targetTimeNs) {
        break;
      }

      if (processedInWindow >= MAX_EVENTS_PER_WINDOW) {
        this.status = 'OSCILLATION_GUARD';
        this.warnings.push(
          `Спрацював захист від нескінченної генерації (${MAX_EVENTS_PER_WINDOW} подій за вікно). Перевірте асинхронні петлі без затримки.`,
        );
        break;
      }

      const batchTime = nextEvent.timestampNs;
      this.currentTimeNs = batchTime;

      const affectedLoadNodes = new Set<string>();

      // Обробляємо всі одночасні події в момент часу batchTime (дельта-цикл)
      while (!this.eventQueue.isEmpty() && this.eventQueue.peek()!.timestampNs === batchTime) {
        const ev = this.eventQueue.pop()!;
        const k = pinKey(ev.nodeId, ev.pinId);
        const scheduled = this.scheduledPinTarget.get(k);
        if (scheduled && scheduled.timestampNs === ev.timestampNs) {
          this.scheduledPinTarget.delete(k);
        }

        const prevState = this.pinStates.get(k);
        const evNode = this.nodes.get(ev.nodeId);
        const suppressedByReset =
          evNode?.type === 'TIMER_555' &&
          Boolean(ev.reason?.startsWith('NE555')) &&
          this.getPin(ev.nodeId, 'RESET') === '0' &&
          ev.newState !== '0';

        if (!suppressedByReset && prevState !== ev.newState) {
          this.pinStates.set(k, ev.newState);
          this.processedEventsCount += 1;
          processedInWindow += 1;

          const net = this.pinToNet.get(k);
          if (net) {
            const impacted = this.propagateNet(net);
            for (const loadNodeId of impacted) {
              affectedLoadNodes.add(loadNodeId);
            }
          }
        }
      }

      for (const loadNodeId of affectedLoadNodes) {
        const loadNode = this.nodes.get(loadNodeId);
        if (loadNode) {
          this.evaluateNodeAndSchedule(loadNode);
        }
      }

      this.recordWaveformSample();

      // Якщо таймер 555 змінив фазу або скидання, перевіримо періодичні джерела
      this.enqueuePeriodicSourcesUpTo(targetTimeNs);
    }

    this.currentTimeNs = targetTimeNs;
    this.recordWaveformSample();
    this.updateSystemStatus();
    return this.getSnapshot();
  }

  /**
   * Виконує рівно один крок події з черги Min-Heap (режим покрокового налагодження Step).
   */
  public stepSingleEvent(): SimulationSnapshot {
    if (this.eventQueue.isEmpty()) {
      let maxLookahead = 50;
      for (const node of this.nodes.values()) {
        if (node.type === 'CLOCK') {
          maxLookahead = Math.max(maxLookahead, (node.properties.halfPeriodNs ?? 50) + 10);
        } else if (node.type === 'TIMER_555') {
          const iv = computeTimer555Intervals(
            node.properties.resistanceR1Ohms,
            node.properties.resistanceR2Ohms,
            node.properties.capacitanceUf,
          );
          maxLookahead = Math.max(maxLookahead, Math.max(iv.highNs, iv.lowNs) + 10);
        }
      }
      this.enqueuePeriodicSourcesUpTo(this.currentTimeNs + maxLookahead);
    }
    const next = this.eventQueue.peek();
    if (!next) {
      return this.advanceBy(10);
    }
    const delta = Math.max(1, next.timestampNs - this.currentTimeNs);
    return this.advanceBy(delta);
  }

  /**
   * Стабілізує всі комбінаційні та асинхронні перехідні процеси без просування зовнішніх генераторів CLOCK.
   */
  public settleCombinational(maxTimeBudgetNs = 1000): SimulationSnapshot {
    const safeBudget = Number.isFinite(maxTimeBudgetNs)
      ? Math.max(10, Math.min(100000, maxTimeBudgetNs))
      : 1000;
    const deadline = this.currentTimeNs + safeBudget;
    let guard = 0;

    while (!this.eventQueue.isEmpty() && guard < MAX_EVENTS_PER_WINDOW) {
      const ev = this.eventQueue.peek()!;
      if (ev.timestampNs > deadline) break;
      const batchTime = ev.timestampNs;
      this.currentTimeNs = batchTime;

      const affectedNodes = new Set<string>();
      while (!this.eventQueue.isEmpty() && this.eventQueue.peek()!.timestampNs === batchTime) {
        const item = this.eventQueue.pop()!;
        const k = pinKey(item.nodeId, item.pinId);
        this.scheduledPinTarget.delete(k);
        if (this.pinStates.get(k) !== item.newState) {
          this.pinStates.set(k, item.newState);
          this.processedEventsCount += 1;
          guard += 1;
          const net = this.pinToNet.get(k);
          if (net) {
            for (const nid of this.propagateNet(net)) {
              affectedNodes.add(nid);
            }
          }
        }
      }
      for (const nid of affectedNodes) {
        const node = this.nodes.get(nid);
        if (node) {
          this.evaluateNodeAndSchedule(node);
        }
      }
      this.recordWaveformSample();
    }

    if (guard >= MAX_EVENTS_PER_WINDOW) {
      this.status = 'OSCILLATION_GUARD';
      this.warnings.push(
        `Спрацював захист від асинхронної осциляції (${MAX_EVENTS_PER_WINDOW} подій під час стабілізації).`,
      );
    }

    this.recordWaveformSample();
    this.updateSystemStatus();
    return this.getSnapshot();
  }

  public getWaveformHistory(): WaveformSample[] {
    return this.waveformHistory;
  }

  public getSnapshot(): SimulationSnapshot {
    const nodePinStates: Record<string, Record<string, LogicState>> = {};
    for (const [nodeId, node] of this.nodes.entries()) {
      nodePinStates[nodeId] = {};
      for (const pin of node.pins) {
        nodePinStates[nodeId][pin.id] = this.pinStates.get(pinKey(nodeId, pin.id)) ?? 'Z';
      }
    }

    const edgeStates: Record<string, LogicState> = {};
    for (const edge of this.edges) {
      const net = this.pinToNet.get(pinKey(edge.sourceNodeId, edge.sourcePinId));
      edgeStates[edge.id] = net ? net.resolvedState : 'Z';
    }

    const internalMemory: Record<string, Record<string, string | number | boolean>> = {};
    for (const [nid, mem] of this.seqMemory.entries()) {
      internalMemory[nid] = {
        q: mem.q,
        counterValue: mem.counterValue,
        timerPhase: mem.timerPhase,
      };
    }

    const activeConflicts = this.nets.filter((n) => n.hasConflict).map((n) => n.netId);

    return {
      currentTimeNs: this.currentTimeNs,
      processedEventsCount: this.processedEventsCount,
      pendingEventsCount: this.eventQueue.size,
      status: activeConflicts.length > 0 ? 'BUS_CONFLICT' : this.status,
      nodePinStates,
      edgeStates,
      internalMemory,
      activeConflicts,
      warnings: [...this.warnings],
    };
  }

  private rebuildNets(): void {
    const snapshotMap: Record<string, Record<string, LogicState>> = {};
    for (const [nid, node] of this.nodes.entries()) {
      snapshotMap[nid] = {};
      for (const p of node.pins) {
        snapshotMap[nid][p.id] = this.pinStates.get(pinKey(nid, p.id)) ?? 'Z';
      }
    }

    this.nets = extractElectricalNets(Array.from(this.nodes.values()), this.edges, snapshotMap);
    this.pinToNet.clear();

    for (const net of this.nets) {
      for (const d of net.driverPins) {
        this.pinToNet.set(pinKey(d.nodeId, d.pinId), net);
      }
      for (const l of net.loadPins) {
        this.pinToNet.set(pinKey(l.nodeId, l.pinId), net);
      }
    }
  }

  /**
   * Початкова ініціалізація комбінаційної частини схеми у топологічному порядку Кана.
   */
  private bootstrapInitialState(): void {
    const report = analyzeCircuitGraph({
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
    });

    for (const net of this.nets) {
      this.propagateNet(net);
    }

    const evalOrder =
      report.topologicalOrder.length > 0 ? report.topologicalOrder : Array.from(this.nodes.keys());

    for (const nodeId of evalOrder) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      const outputs = this.computeNodeOutputsImmediate(node);
      for (const [pinId, state] of Object.entries(outputs)) {
        const k = pinKey(node.id, pinId);
        this.pinStates.set(k, state);
        const net = this.pinToNet.get(k);
        if (net) {
          this.propagateNet(net);
        }
      }
    }

    // Додаткова оцінка елементів, що входять у цикли зворотного зв'язку (наприклад, NOR RS-защіпка)
    if (!report.isCombinationalAcyclic) {
      for (const cycle of report.stronglyConnectedCycles) {
        for (const nid of cycle) {
          const node = this.nodes.get(nid);
          if (node) {
            this.evaluateNodeAndSchedule(node);
          }
        }
      }
      this.settleCombinational(200);
    }

    this.updateSystemStatus();
  }

  private propagateNet(net: ElectricalNet): string[] {
    const driverValues = net.driverPins.map(
      ({ nodeId, pinId }) => this.pinStates.get(pinKey(nodeId, pinId)) ?? 'Z',
    );

    let seenZero = false;
    let seenOne = false;
    let seenX = false;
    for (const s of driverValues) {
      if (s === '0') seenZero = true;
      else if (s === '1') seenOne = true;
      else if (s === 'X') seenX = true;
    }

    let resolved: LogicState = 'Z';
    let conflict = false;
    if (seenZero && seenOne) {
      resolved = 'X';
      conflict = true;
    } else if (seenX) {
      resolved = 'X';
      conflict = true;
    } else if (seenOne) {
      resolved = '1';
    } else if (seenZero) {
      resolved = '0';
    }

    net.resolvedState = resolved;
    net.hasConflict = conflict;

    const changedLoadNodes: string[] = [];
    for (const load of net.loadPins) {
      const lk = pinKey(load.nodeId, load.pinId);
      if (this.pinStates.get(lk) !== resolved) {
        this.pinStates.set(lk, resolved);
        changedLoadNodes.push(load.nodeId);
      }
    }
    return changedLoadNodes;
  }

  private getPin(nodeId: string, pinId: string): LogicState {
    return this.pinStates.get(pinKey(nodeId, pinId)) ?? 'Z';
  }

  private readonly evaluatorContext: NodeEvaluatorContext = {
    getPin: (nodeId, pinId) => this.getPin(nodeId, pinId),
    getMemory: (nodeId) => {
      let mem = this.seqMemory.get(nodeId);
      if (!mem) {
        mem = createInitialSeqState();
        this.seqMemory.set(nodeId, mem);
      }
      return mem;
    },
    evaluateCustomIc: (node) => this.evaluateCustomIcNode(node),
  };

  private evaluateCustomIcNode(node: CircuitNodeData): Record<string, LogicState> {
    const icDef = node.properties.customIcId
      ? this.customIcMap.get(node.properties.customIcId)
      : undefined;
    if (!icDef || this.nestingDepth >= MAX_CUSTOM_IC_NESTING_DEPTH) {
      const fallback: Record<string, LogicState> = {};
      for (const p of node.pins) {
        if (p.direction === 'OUTPUT') fallback[p.id] = 'X';
      }
      return fallback;
    }

    const subSim = new CircuitSimulator(
      {
        nodes: icDef.internalCircuit.nodes,
        edges: icDef.internalCircuit.edges,
        customDefinitions: Array.from(this.customIcMap.values()).filter((d) => d.id !== icDef.id),
      },
      { nestingDepth: this.nestingDepth + 1 },
    );
    for (const inMap of icDef.inputPins) {
      const extVal = this.getPin(node.id, inMap.id);
      subSim.setInputState(inMap.mappedNodeId, extVal === 'Z' ? '0' : extVal);
    }
    const subSnap = subSim.settleCombinational(300);
    const result: Record<string, LogicState> = {};
    for (const outMap of icDef.outputPins) {
      const mappedPins = subSnap.nodePinStates[outMap.mappedNodeId] ?? {};
      result[outMap.id] = mappedPins.IN ?? mappedPins.P ?? mappedPins.OUT ?? 'Z';
    }
    return result;
  }

  private computeNodeOutputsImmediate(node: CircuitNodeData): Record<string, LogicState> {
    return NODE_EVALUATORS[node.type](node, this.evaluatorContext);
  }

  private evaluateNodeAndSchedule(node: CircuitNodeData): void {
    const outputs = this.computeNodeOutputsImmediate(node);
    const delay = Math.max(1, sanitizeDelayNs(node.properties.propagationDelayNs, 1));
    for (const [pinId, nextState] of Object.entries(outputs)) {
      this.scheduleOutputTransition(node.id, pinId, nextState, delay);
    }
  }

  private scheduleOutputTransition(
    nodeId: string,
    pinId: string,
    newState: LogicState,
    delayNs: number,
    reason?: string,
  ): void {
    const k = pinKey(nodeId, pinId);
    const currentState = this.pinStates.get(k);
    const scheduled = this.scheduledPinTarget.get(k);
    const safeDelay = Number.isFinite(delayNs) ? Math.max(0, delayNs) : 0;
    const timestampNs = this.currentTimeNs + safeDelay;

    if (!scheduled && currentState === newState) {
      return;
    }
    if (scheduled && scheduled.state === newState && scheduled.timestampNs <= timestampNs) {
      return;
    }

    this.scheduledPinTarget.set(k, { state: newState, timestampNs });
    this.sequenceCounter += 1;
    this.eventQueue.push({
      timestampNs,
      sequence: this.sequenceCounter,
      nodeId,
      pinId,
      newState,
      reason,
    });
  }

  private enqueuePeriodicSourcesUpTo(targetTimeNs: number): void {
    for (const node of this.nodes.values()) {
      if (node.type === 'CLOCK') {
        const rawHalf = node.properties.halfPeriodNs;
        const halfPeriod = Math.max(
          10,
          typeof rawHalf === 'number' && Number.isFinite(rawHalf) ? rawHalf : 50,
        );
        const k = pinKey(node.id, 'OUT');
        if (!this.scheduledPinTarget.has(k)) {
          const nextFlip = Math.floor(this.currentTimeNs / halfPeriod) * halfPeriod + halfPeriod;
          if (nextFlip <= targetTimeNs) {
            const cur = this.pinStates.get(k) ?? '0';
            const nextVal: LogicState = cur === '1' ? '0' : '1';
            this.scheduledPinTarget.set(k, { state: nextVal, timestampNs: nextFlip });
            this.sequenceCounter += 1;
            this.eventQueue.push({
              timestampNs: nextFlip,
              sequence: this.sequenceCounter,
              nodeId: node.id,
              pinId: 'OUT',
              newState: nextVal,
              reason: 'Clock tick',
            });
          }
        }
      } else if (node.type === 'TIMER_555') {
        const mem = this.seqMemory.get(node.id)!;
        const rstPin = this.getPin(node.id, 'RESET');
        const autoAstable = node.properties.astableAutoTrigger ?? true;
        if (rstPin === '0') {
          mem.q = '0';
          mem.timerPhase = 'LOW';
          mem.nextTimerToggleNs = this.currentTimeNs;
          continue;
        }
        if (autoAstable) {
          const outKey = pinKey(node.id, 'OUT');
          const dischKey = pinKey(node.id, 'DISCH');
          const trig = this.getPin(node.id, 'TRIG');
          const thres = this.getPin(node.id, 'THRES');
          const heldLow = thres === '1' && trig !== '0';
          const heldHigh = trig === '0' && thres !== '1';
          if (!heldLow && !heldHigh && !this.scheduledPinTarget.has(outKey)) {
            const intervals = computeTimer555Intervals(
              node.properties.resistanceR1Ohms,
              node.properties.resistanceR2Ohms,
              node.properties.capacitanceUf,
            );
            const curOut = this.pinStates.get(outKey) ?? '0';
            const phaseDuration = curOut === '1' ? intervals.highNs : intervals.lowNs;
            if (mem.nextTimerToggleNs <= this.currentTimeNs) {
              mem.nextTimerToggleNs = this.currentTimeNs + phaseDuration;
            }
            const nextTime = mem.nextTimerToggleNs;
            if (nextTime <= targetTimeNs) {
              const nextOut: LogicState = curOut === '1' ? '0' : '1';
              const nextPhaseDuration = nextOut === '1' ? intervals.highNs : intervals.lowNs;
              mem.q = nextOut;
              mem.timerPhase = nextOut === '1' ? 'HIGH' : 'LOW';
              mem.nextTimerToggleNs = nextTime + nextPhaseDuration;

              this.scheduledPinTarget.set(outKey, { state: nextOut, timestampNs: nextTime });
              this.sequenceCounter += 1;
              this.eventQueue.push({
                timestampNs: nextTime,
                sequence: this.sequenceCounter,
                nodeId: node.id,
                pinId: 'OUT',
                newState: nextOut,
                reason: 'NE555 RC comparator threshold',
              });

              const nextDisch: LogicState = nextOut === '1' ? 'Z' : '0';
              this.scheduledPinTarget.set(dischKey, { state: nextDisch, timestampNs: nextTime });
              this.sequenceCounter += 1;
              this.eventQueue.push({
                timestampNs: nextTime,
                sequence: this.sequenceCounter,
                nodeId: node.id,
                pinId: 'DISCH',
                newState: nextDisch,
                reason: 'NE555 discharge transistor',
              });
            }
          }
        }
      }
    }
  }

  private recordWaveformSample(): void {
    const signals: Record<string, LogicState> = {};
    for (const node of this.nodes.values()) {
      if (
        node.type === 'INPUT_SWITCH' ||
        node.type === 'PUSH_BUTTON' ||
        node.type === 'DIP_SWITCH_4' ||
        node.type === 'CLOCK' ||
        node.type === 'TIMER_555' ||
        node.type === 'SR_LATCH' ||
        node.type === 'D_FLIPFLOP' ||
        node.type === 'JK_FLIPFLOP' ||
        node.type === 'T_FLIPFLOP' ||
        node.type === 'REGISTER_4BIT' ||
        node.type === 'SHIFT_REG_SIPO' ||
        node.type === 'COUNTER_4BIT'
      ) {
        const primaryOut = node.pins.find((p) => p.direction === 'OUTPUT');
        if (primaryOut) {
          signals[`${node.properties.label} (${primaryOut.name})`] = this.getPin(
            node.id,
            primaryOut.id,
          );
        }
      } else if (node.type === 'LED' || node.type === 'PROBE') {
        const primaryIn = node.pins[0];
        if (primaryIn) {
          signals[node.properties.label] = this.getPin(node.id, primaryIn.id);
        }
      }
    }

    const last = this.waveformHistory[this.waveformHistory.length - 1];
    if (last && last.timeNs === this.currentTimeNs) {
      last.signals = signals;
      return;
    }

    this.waveformHistory.push({
      timeNs: this.currentTimeNs,
      signals,
    });
    if (this.waveformHistory.length > this.maxWaveformSamples) {
      this.waveformHistory.shift();
    }
  }

  private updateSystemStatus(): void {
    if (this.status === 'OSCILLATION_GUARD') {
      return;
    }
    if (this.nets.some((n) => n.hasConflict)) {
      this.status = 'BUS_CONFLICT';
    } else if (!this.eventQueue.isEmpty()) {
      this.status = 'RUNNING';
    } else {
      this.status = 'STABLE';
    }
  }
}
