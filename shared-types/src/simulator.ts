import { analyzeCircuitGraph, extractElectricalNets, pinKey } from './graphAnalysis';
import {
  computeTimer555Intervals,
  evaluateAluSlice,
  evaluateMux4To1,
  logicAnd,
  logicNand,
  logicNor,
  logicNot,
  logicOr,
  logicTriStateBuffer,
  logicXnor,
  logicXor,
  normalizeGateInput,
} from './logicAlgebra';
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

interface InternalSequentialState {
  q: LogicState;
  prevClk: LogicState;
  counterValue: number;
  timerPhase: 'HIGH' | 'LOW';
  nextTimerToggleNs: number;
}

const MAX_EVENTS_PER_WINDOW = 2500;

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

  constructor(doc?: Pick<CircuitDocument, 'nodes' | 'edges' | 'customDefinitions'>) {
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
        const initial: LogicState =
          cloned.type === 'CONST_HIGH' && pin.direction === 'OUTPUT'
            ? '1'
            : cloned.type === 'CONST_LOW' && pin.direction === 'OUTPUT'
              ? '0'
              : (cloned.type === 'INPUT_SWITCH' || cloned.type === 'PUSH_BUTTON') &&
                  pin.direction === 'OUTPUT'
                ? (cloned.properties.switchState ?? '0')
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

  public setInputState(nodeId: string, newState: LogicState): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    if (node.type !== 'INPUT_SWITCH' && node.type !== 'PUSH_BUTTON') return;

    node.properties.switchState = newState;
    this.scheduleOutputTransition(
      node.id,
      'OUT',
      newState,
      Math.max(0, node.properties.propagationDelayNs),
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

  /**
   * Просування модельного часу на deltaNs із обробкою всіх запланованих подій у купі Min-Heap
   * та генерацією чергових імпульсів синхрогенераторів CLOCK і таймерів NE555.
   */
  public advanceBy(deltaNs: number): SimulationSnapshot {
    const targetTimeNs = this.currentTimeNs + Math.max(1, deltaNs);
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
        if (prevState !== ev.newState) {
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
      this.enqueuePeriodicSourcesUpTo(this.currentTimeNs + 50);
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
    const deadline = this.currentTimeNs + maxTimeBudgetNs;
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
    }

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

  private computeNodeOutputsImmediate(node: CircuitNodeData): Record<string, LogicState> {
    const mem = this.seqMemory.get(node.id)!;

    switch (node.type) {
      case 'CONST_HIGH':
        return { OUT: '1' };
      case 'CONST_LOW':
        return { OUT: '0' };
      case 'INPUT_SWITCH':
      case 'PUSH_BUTTON':
        return { OUT: node.properties.switchState ?? '0' };
      case 'CLOCK':
        return { OUT: this.getPin(node.id, 'OUT') === '1' ? '1' : '0' };
      case 'NOT':
        return { Y: logicNot(this.getPin(node.id, 'A')) };
      case 'AND':
        return { Y: logicAnd([this.getPin(node.id, 'A'), this.getPin(node.id, 'B')]) };
      case 'OR':
        return { Y: logicOr([this.getPin(node.id, 'A'), this.getPin(node.id, 'B')]) };
      case 'NAND':
        return { Y: logicNand([this.getPin(node.id, 'A'), this.getPin(node.id, 'B')]) };
      case 'NOR':
        return { Y: logicNor([this.getPin(node.id, 'A'), this.getPin(node.id, 'B')]) };
      case 'XOR':
        return { Y: logicXor([this.getPin(node.id, 'A'), this.getPin(node.id, 'B')]) };
      case 'XNOR':
        return { Y: logicXnor([this.getPin(node.id, 'A'), this.getPin(node.id, 'B')]) };
      case 'TRI_BUFFER':
        return { Y: logicTriStateBuffer(this.getPin(node.id, 'D'), this.getPin(node.id, 'EN')) };

      case 'SR_LATCH': {
        const s =
          this.getPin(node.id, 'S') === 'Z' ? '0' : normalizeGateInput(this.getPin(node.id, 'S'));
        const r =
          this.getPin(node.id, 'R') === 'Z' ? '0' : normalizeGateInput(this.getPin(node.id, 'R'));
        if (s === 'X' || r === 'X' || (s === '1' && r === '1')) {
          mem.q = 'X';
          return { Q: 'X', NQ: 'X' };
        }
        if (s === '1' && r === '0') {
          mem.q = '1';
        } else if (s === '0' && r === '1') {
          mem.q = '0';
        }
        const nq: LogicState = mem.q === '1' ? '0' : mem.q === '0' ? '1' : 'X';
        return { Q: mem.q, NQ: nq };
      }

      case 'D_FLIPFLOP': {
        const d =
          this.getPin(node.id, 'D') === 'Z' ? '0' : normalizeGateInput(this.getPin(node.id, 'D'));
        const clk =
          this.getPin(node.id, 'CLK') === 'Z'
            ? '0'
            : normalizeGateInput(this.getPin(node.id, 'CLK'));
        const clr =
          this.getPin(node.id, 'CLR') === 'Z'
            ? '0'
            : normalizeGateInput(this.getPin(node.id, 'CLR'));

        if (clr === '1') {
          mem.q = '0';
        } else if (mem.prevClk === '0' && clk === '1') {
          mem.q = d;
        }
        mem.prevClk = clk;
        const nq: LogicState = mem.q === '1' ? '0' : mem.q === '0' ? '1' : 'X';
        return { Q: mem.q, NQ: nq };
      }

      case 'JK_FLIPFLOP': {
        const j =
          this.getPin(node.id, 'J') === 'Z' ? '0' : normalizeGateInput(this.getPin(node.id, 'J'));
        const k =
          this.getPin(node.id, 'K') === 'Z' ? '0' : normalizeGateInput(this.getPin(node.id, 'K'));
        const clk =
          this.getPin(node.id, 'CLK') === 'Z'
            ? '0'
            : normalizeGateInput(this.getPin(node.id, 'CLK'));
        const clr =
          this.getPin(node.id, 'CLR') === 'Z'
            ? '0'
            : normalizeGateInput(this.getPin(node.id, 'CLR'));

        if (clr === '1') {
          mem.q = '0';
        } else if (mem.prevClk === '0' && clk === '1') {
          if (j === 'X' || k === 'X') {
            mem.q = 'X';
          } else if (j === '0' && k === '1') {
            mem.q = '0';
          } else if (j === '1' && k === '0') {
            mem.q = '1';
          } else if (j === '1' && k === '1') {
            mem.q = mem.q === '1' ? '0' : mem.q === '0' ? '1' : '0';
          }
        }
        mem.prevClk = clk;
        const nq: LogicState = mem.q === '1' ? '0' : mem.q === '0' ? '1' : 'X';
        return { Q: mem.q, NQ: nq };
      }

      case 'COUNTER_4BIT': {
        const clk =
          this.getPin(node.id, 'CLK') === 'Z'
            ? '0'
            : normalizeGateInput(this.getPin(node.id, 'CLK'));
        const enRaw = this.getPin(node.id, 'EN');
        const en = enRaw === 'Z' ? '1' : normalizeGateInput(enRaw);
        const rst =
          this.getPin(node.id, 'RST') === 'Z'
            ? '0'
            : normalizeGateInput(this.getPin(node.id, 'RST'));

        if (rst === '1') {
          mem.counterValue = 0;
        } else if (mem.prevClk === '0' && clk === '1' && en === '1') {
          mem.counterValue = (mem.counterValue + 1) & 0x0f;
        }
        mem.prevClk = clk;
        const v = mem.counterValue;
        return {
          Q0: (v & 1) !== 0 ? '1' : '0',
          Q1: (v & 2) !== 0 ? '1' : '0',
          Q2: (v & 4) !== 0 ? '1' : '0',
          Q3: (v & 8) !== 0 ? '1' : '0',
          CO: v === 15 && en === '1' ? '1' : '0',
        };
      }

      case 'TIMER_555': {
        const rstRaw = this.getPin(node.id, 'RESET');
        const resetActive = rstRaw === '0'; // !RST активний нуль
        if (resetActive) {
          mem.q = '0';
          mem.timerPhase = 'LOW';
          return { OUT: '0', DISCH: '0' };
        }

        const trig = this.getPin(node.id, 'TRIG');
        const thres = this.getPin(node.id, 'THRES');
        if (trig === '0' && thres !== '1') {
          mem.q = '1';
          mem.timerPhase = 'HIGH';
        } else if (thres === '1' && trig !== '0') {
          mem.q = '0';
          mem.timerPhase = 'LOW';
        }
        const out: LogicState = mem.q === '1' ? '1' : '0';
        const disch: LogicState = out === '1' ? 'Z' : '0';
        return { OUT: out, DISCH: disch };
      }

      case 'MUX_4TO1': {
        const y = evaluateMux4To1(
          [
            this.getPin(node.id, 'D0'),
            this.getPin(node.id, 'D1'),
            this.getPin(node.id, 'D2'),
            this.getPin(node.id, 'D3'),
          ],
          this.getPin(node.id, 'S0'),
          this.getPin(node.id, 'S1'),
        );
        return { Y: y };
      }

      case 'ALU_4BIT': {
        const res = evaluateAluSlice(
          this.getPin(node.id, 'A0'),
          this.getPin(node.id, 'A1'),
          this.getPin(node.id, 'B0'),
          this.getPin(node.id, 'B1'),
          this.getPin(node.id, 'OP0'),
          this.getPin(node.id, 'OP1'),
        );
        return {
          F0: res.f0,
          F1: res.f1,
          CARRY: res.carry,
          ZERO: res.zero,
        };
      }

      case 'CUSTOM_IC': {
        const icDef = node.properties.customIcId
          ? this.customIcMap.get(node.properties.customIcId)
          : undefined;
        if (!icDef) {
          const fallback: Record<string, LogicState> = {};
          for (const p of node.pins) {
            if (p.direction === 'OUTPUT') fallback[p.id] = 'X';
          }
          return fallback;
        }
        const subSim = new CircuitSimulator({
          nodes: icDef.internalCircuit.nodes,
          edges: icDef.internalCircuit.edges,
          customDefinitions: Array.from(this.customIcMap.values()).filter((d) => d.id !== icDef.id),
        });
        for (const inMap of icDef.inputPins) {
          const extVal = this.getPin(node.id, inMap.id);
          subSim.setInputState(inMap.mappedNodeId, extVal === 'Z' ? '0' : extVal);
        }
        const subSnap = subSim.settleCombinational(300);
        const result: Record<string, LogicState> = {};
        for (const outMap of icDef.outputPins) {
          const mappedPins = subSnap.nodePinStates[outMap.mappedNodeId] ?? {};
          result[outMap.id] = mappedPins.IN ?? mappedPins.P ?? mappedPins.OUT ?? '0';
        }
        return result;
      }

      default:
        return {};
    }
  }

  private evaluateNodeAndSchedule(node: CircuitNodeData): void {
    const outputs = this.computeNodeOutputsImmediate(node);
    const delay = Math.max(1, node.properties.propagationDelayNs);
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

    if (!scheduled && currentState === newState) {
      return;
    }
    if (scheduled && scheduled.state === newState) {
      return;
    }

    const timestampNs = this.currentTimeNs + Math.max(0, delayNs);
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
        const halfPeriod = Math.max(10, node.properties.halfPeriodNs ?? 50);
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
        const rstPin = this.getPin(node.id, 'RESET');
        const autoAstable = node.properties.astableAutoTrigger ?? true;
        if (rstPin !== '0' && autoAstable) {
          const mem = this.seqMemory.get(node.id)!;
          const outKey = pinKey(node.id, 'OUT');
          if (!this.scheduledPinTarget.has(outKey)) {
            const intervals = computeTimer555Intervals(
              node.properties.resistanceR1Ohms,
              node.properties.resistanceR2Ohms,
              node.properties.capacitanceUf,
            );
            const curOut = this.pinStates.get(outKey) ?? '0';
            const stepDuration = curOut === '1' ? intervals.highNs : intervals.lowNs;
            const nextTime = Math.max(
              this.currentTimeNs + stepDuration,
              mem.nextTimerToggleNs > this.currentTimeNs
                ? mem.nextTimerToggleNs
                : this.currentTimeNs + stepDuration,
            );
            if (nextTime <= targetTimeNs) {
              const nextOut: LogicState = curOut === '1' ? '0' : '1';
              mem.q = nextOut;
              mem.timerPhase = nextOut === '1' ? 'HIGH' : 'LOW';
              mem.nextTimerToggleNs = nextTime;
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
              this.sequenceCounter += 1;
              this.eventQueue.push({
                timestampNs: nextTime,
                sequence: this.sequenceCounter,
                nodeId: node.id,
                pinId: 'DISCH',
                newState: nextOut === '1' ? 'Z' : '0',
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
        node.type === 'CLOCK' ||
        node.type === 'TIMER_555' ||
        node.type === 'D_FLIPFLOP' ||
        node.type === 'JK_FLIPFLOP' ||
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
