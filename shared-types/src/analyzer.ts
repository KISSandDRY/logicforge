import { getCatalogItem } from './catalog';
import { analyzeCircuitGraph, extractElectricalNets } from './graphAnalysis';
import { CircuitSimulator } from './simulator';
import type {
  BomItem,
  CircuitDocument,
  EngineeringReport,
  LogicState,
  NetlistEntry,
  TruthTableResult,
  TruthTableRow,
} from './types';

/**
 * Автоматичний синтезатор таблиці істинності та канонічної ДДНФ (Sum of Products)
 * для довільної цифрової комбінаційної схеми шляхом повного перебору 2^n наборів входів.
 */
export function synthesizeTruthTable(
  doc: Pick<CircuitDocument, 'nodes' | 'edges' | 'customDefinitions'>,
  maxInputs = 6,
): TruthTableResult {
  const inputNodes = doc.nodes.filter((n) => n.type === 'INPUT_SWITCH');
  const outputNodes = doc.nodes.filter((n) => n.type === 'LED' || n.type === 'PROBE');

  const truncated = inputNodes.length > maxInputs;
  const activeInputs = inputNodes.slice(0, maxInputs);

  const inputLabels = activeInputs.map((n) => ({
    nodeId: n.id,
    label: n.properties.label || n.id,
  }));
  const outputLabels = outputNodes.map((n) => ({
    nodeId: n.id,
    label: n.properties.label || n.id,
  }));

  if (activeInputs.length === 0 || outputNodes.length === 0) {
    return {
      inputLabels,
      outputLabels,
      rows: [],
      canonicalSopExpressions: {},
      truncated,
    };
  }

  const totalCombinations = 1 << activeInputs.length;
  const rows: TruthTableRow[] = [];
  const mintermsByOutput: Record<string, string[]> = {};

  for (const out of outputLabels) {
    mintermsByOutput[out.label] = [];
  }

  for (let mask = 0; mask < totalCombinations; mask++) {
    const sim = new CircuitSimulator(doc);
    const inputRecord: Record<string, LogicState> = {};

    activeInputs.forEach((inpNode, bitIdx) => {
      const bitPos = activeInputs.length - 1 - bitIdx;
      const bitVal: LogicState = ((mask >> bitPos) & 1) === 1 ? '1' : '0';
      sim.setInputState(inpNode.id, bitVal);
      inputRecord[inpNode.properties.label || inpNode.id] = bitVal;
    });

    const snap = sim.settleCombinational(600);
    const outputRecord: Record<string, LogicState> = {};

    for (const outNode of outputNodes) {
      const outLabel = outNode.properties.label || outNode.id;
      const pinMap = snap.nodePinStates[outNode.id] ?? {};
      const val = pinMap.IN ?? 'Z';
      outputRecord[outLabel] = val;

      if (val === '1') {
        const literals = activeInputs.map((inpNode, bitIdx) => {
          const bitPos = activeInputs.length - 1 - bitIdx;
          const isOne = ((mask >> bitPos) & 1) === 1;
          const name = inpNode.properties.label || inpNode.id;
          return isOne ? name : `!${name}`;
        });
        mintermsByOutput[outLabel].push(
          literals.length > 1 ? `(${literals.join(' · ')})` : literals[0],
        );
      }
    }

    rows.push({
      inputs: inputRecord,
      outputs: outputRecord,
    });
  }

  const canonicalSopExpressions: Record<string, string> = {};
  for (const out of outputLabels) {
    const terms = mintermsByOutput[out.label];
    if (terms.length === 0) {
      canonicalSopExpressions[out.label] = '0';
    } else if (terms.length === totalCombinations) {
      canonicalSopExpressions[out.label] = '1';
    } else {
      canonicalSopExpressions[out.label] = terms.join(' + ');
    }
  }

  return {
    inputLabels,
    outputLabels,
    rows,
    canonicalSopExpressions,
    truncated,
  };
}

/**
 * Генератор комплексного інженерного звіту схеми:
 * - Відомість елементів (Bill of Materials - BOM)
 * - Таблиця електричних з'єднань (Netlist)
 * - Статичний часовий аналіз критичного шляху (STA)
 * - Таблиця істинності та канонічні булеві рівняння (для комбінаційних схем)
 */
export function generateEngineeringReport(doc: CircuitDocument): EngineeringReport {
  const sim = new CircuitSimulator(doc);
  const snap = sim.settleCombinational(500);
  const nets = extractElectricalNets(doc.nodes, doc.edges, snap.nodePinStates);
  const timing = analyzeCircuitGraph(doc);

  const bomGrouped = new Map<string, BomItem>();
  for (const node of doc.nodes) {
    const meta = getCatalogItem(node.type);
    const existing = bomGrouped.get(node.type);
    if (existing) {
      existing.quantity += 1;
      existing.designators.push(node.properties.label || node.id);
    } else {
      bomGrouped.set(node.type, {
        type: node.type,
        name: meta.name,
        category: meta.category,
        quantity: 1,
        designators: [node.properties.label || node.id],
        unitDelayNs: node.properties.propagationDelayNs,
      });
    }
  }

  const nodeLabel = (nodeId: string): string => {
    const n = doc.nodes.find((item) => item.id === nodeId);
    return n ? n.properties.label || n.id : nodeId;
  };

  const netlist: NetlistEntry[] = nets.map((net) => ({
    netId: net.netId,
    drivers: net.driverPins.map((d) => `${nodeLabel(d.nodeId)}.${d.pinId}`),
    loads: net.loadPins.map((l) => `${nodeLabel(l.nodeId)}.${l.pinId}`),
    currentState: net.resolvedState,
  }));

  const hasSequentialClock = doc.nodes.some(
    (n) =>
      n.type === 'CLOCK' ||
      n.type === 'TIMER_555' ||
      n.type === 'JK_FLIPFLOP' ||
      n.type === 'D_FLIPFLOP' ||
      n.type === 'COUNTER_4BIT',
  );

  const truthTable =
    !hasSequentialClock && timing.isCombinationalAcyclic ? synthesizeTruthTable(doc, 5) : undefined;

  return {
    generatedAt: new Date().toISOString(),
    circuitTitle: doc.metadata.title,
    category: doc.metadata.category,
    totalNodes: doc.nodes.length,
    totalEdges: doc.edges.length,
    totalNets: nets.length,
    bom: Array.from(bomGrouped.values()),
    netlist,
    timing,
    truthTable,
  };
}
