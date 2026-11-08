import { describe, expect, it } from 'vitest';
import {
  COMPONENT_CATALOG,
  CircuitSimulator,
  MinHeap,
  PRESET_CIRCUITS,
  analyzeCircuitGraph,
  buildFullAdderPreset,
  buildMicroprocessorAluPreset,
  buildShiftRegisterPreset,
  buildTimer555JkDividerPreset,
  buildTriStateBusPreset,
  computeTimer555Intervals,
  createNodeFromCatalog,
  decodeSevenSegment,
  evaluateAluSlice,
  evaluateMux4To1,
  extractElectricalNets,
  generateEngineeringReport,
  logicAnd,
  logicNand,
  logicNor,
  logicNot,
  logicOr,
  logicTriStateBuffer,
  logicXnor,
  logicXor,
  resolveBusSignals,
  synthesizeTruthTable,
} from '../index';
import type { CustomICDefinition } from '../types';

describe('Four-valued Tri-State Logic Algebra (IEEE 1164 / Kleene)', () => {
  it('resolves multi-driver shared bus states including High-Z and short-circuit conflict X', () => {
    expect(resolveBusSignals([])).toEqual({ state: 'Z', conflict: false });
    expect(resolveBusSignals(['Z', 'Z'])).toEqual({ state: 'Z', conflict: false });
    expect(resolveBusSignals(['Z', '1', 'Z'])).toEqual({ state: '1', conflict: false });
    expect(resolveBusSignals(['0', 'Z'])).toEqual({ state: '0', conflict: false });
    expect(resolveBusSignals(['1', '0'])).toEqual({ state: 'X', conflict: true });
    expect(resolveBusSignals(['X', 'Z'])).toEqual({ state: 'X', conflict: true });
  });

  it('evaluates basic gates with Kleene dominance laws', () => {
    expect(logicNot('0')).toBe('1');
    expect(logicNot('1')).toBe('0');
    expect(logicNot('Z')).toBe('X');

    // Zero dominates in AND; One dominates in OR
    expect(logicAnd(['0', 'Z'])).toBe('0');
    expect(logicAnd(['1', 'Z'])).toBe('X');
    expect(logicAnd(['1', '1'])).toBe('1');

    expect(logicOr(['1', 'Z'])).toBe('1');
    expect(logicOr(['0', 'X'])).toBe('X');
    expect(logicOr(['0', '0'])).toBe('0');

    expect(logicNand(['1', '1'])).toBe('0');
    expect(logicNor(['0', '0'])).toBe('1');
    expect(logicXor(['1', '0'])).toBe('1');
    expect(logicXor(['1', '1'])).toBe('0');
    expect(logicXor(['1', 'Z'])).toBe('X');
    expect(logicXnor(['1', '1'])).toBe('1');
  });

  it('evaluates tri-state buffer, MUX 4-to-1, 4-bit ALU, 7-segment decoder and NE555 RC model', () => {
    expect(logicTriStateBuffer('1', '0')).toBe('Z');
    expect(logicTriStateBuffer('1', '1')).toBe('1');
    expect(logicTriStateBuffer('0', 'X')).toBe('X');

    expect(evaluateMux4To1(['0', '1', '0', '1'], '1', '0')).toBe('1');
    expect(evaluateMux4To1(['1', '1', '1', '1'], 'Z', '0')).toBe('1');
    expect(evaluateMux4To1(['0', '1', '0', '1'], 'Z', '0')).toBe('X');

    // ALU: 3 + 2 = 5 -> F=01 (1), Carry=1, Zero=0
    expect(evaluateAluSlice('1', '1', '0', '1', '0', '0')).toEqual({
      f0: '1',
      f1: '0',
      carry: '1',
      zero: '0',
    });
    // ALU SUB: 2 - 2 = 0 -> Zero=1
    expect(evaluateAluSlice('0', '1', '0', '1', '1', '0')).toEqual({
      f0: '0',
      f1: '0',
      carry: '0',
      zero: '1',
    });
    // ALU AND & XOR
    expect(evaluateAluSlice('1', '1', '0', '1', '0', '1').f1).toBe('1');
    expect(evaluateAluSlice('1', '1', '1', '1', '1', '1').zero).toBe('1');

    expect(decodeSevenSegment('1', '0', '1', '1').hexChar).toBe('D');
    expect(decodeSevenSegment('X', '0', '0', '0').hexChar).toBe('E');

    const rc = computeTimer555Intervals(1000, 2000, 0.02);
    expect(rc.highNs).toBeGreaterThan(rc.lowNs);
    expect(rc.dutyCyclePercent).toBeCloseTo(60, 0);
  });
});

describe('MinHeap Priority Queue & Graph Analysis (Kahn + Tarjan SCC)', () => {
  it('maintains strict chronological and sequence ordering in MinHeap', () => {
    const heap = new MinHeap<{ t: number; seq: number }>((a, b) =>
      a.t !== b.t ? a.t - b.t : a.seq - b.seq,
    );
    heap.push({ t: 30, seq: 1 });
    heap.push({ t: 10, seq: 2 });
    heap.push({ t: 10, seq: 1 });
    heap.push({ t: 20, seq: 3 });

    expect(heap.size).toBe(4);
    expect(heap.pop()).toEqual({ t: 10, seq: 1 });
    expect(heap.pop()).toEqual({ t: 10, seq: 2 });
    expect(heap.pop()).toEqual({ t: 20, seq: 3 });
    expect(heap.pop()).toEqual({ t: 30, seq: 1 });
    expect(heap.isEmpty()).toBe(true);
  });

  it('computes Kahn topological order and critical path delay on Full Adder DAG', () => {
    const adder = buildFullAdderPreset();
    const report = analyzeCircuitGraph(adder);

    expect(report.isCombinationalAcyclic).toBe(true);
    expect(report.stronglyConnectedCycles).toHaveLength(0);
    expect(report.topologicalOrder).toHaveLength(adder.nodes.length);
    // Critical path: SW (1) + XOR1 (14) + AND2 (10) + OR_COUT (10) + LED (2) = 37 ns
    expect(report.criticalPathDelayNs).toBe(37);
    expect(report.maxClockFrequencyMhz).toBeCloseTo(27.03, 1);
  });

  it('detects asynchronous feedback loops via Tarjan SCC on cross-coupled NOR latch', () => {
    const s = createNodeFromCatalog('INPUT_SWITCH', 's', { x: 0, y: 0 }, 'S');
    const r = createNodeFromCatalog('INPUT_SWITCH', 'r', { x: 0, y: 80 }, 'R');
    const nor1 = createNodeFromCatalog('NOR', 'nor1', { x: 160, y: 0 }, 'NOR1');
    const nor2 = createNodeFromCatalog('NOR', 'nor2', { x: 160, y: 80 }, 'NOR2');

    const doc = {
      nodes: [s, r, nor1, nor2],
      edges: [
        {
          id: 'e1',
          sourceNodeId: 's',
          sourcePinId: 'OUT',
          targetNodeId: 'nor1',
          targetPinId: 'A',
          signalState: '0' as const,
        },
        {
          id: 'e2',
          sourceNodeId: 'r',
          sourcePinId: 'OUT',
          targetNodeId: 'nor2',
          targetPinId: 'B',
          signalState: '0' as const,
        },
        {
          id: 'e3',
          sourceNodeId: 'nor1',
          sourcePinId: 'Y',
          targetNodeId: 'nor2',
          targetPinId: 'A',
          signalState: '0' as const,
        },
        {
          id: 'e4',
          sourceNodeId: 'nor2',
          sourcePinId: 'Y',
          targetNodeId: 'nor1',
          targetPinId: 'B',
          signalState: '0' as const,
        },
      ],
    };

    const nets = extractElectricalNets(doc.nodes, doc.edges);
    expect(nets).toHaveLength(4);

    const analysis = analyzeCircuitGraph(doc);
    expect(analysis.isCombinationalAcyclic).toBe(false);
    expect(analysis.stronglyConnectedCycles).toHaveLength(1);
    expect(analysis.stronglyConnectedCycles[0].sort()).toEqual(['nor1', 'nor2']);
  });
});

describe('Hybrid Discrete-Event CircuitSimulator', () => {
  it('simulates 1-bit Full Adder truth table and synthesizes canonical SOP expressions', () => {
    const adder = buildFullAdderPreset();
    const tt = synthesizeTruthTable(adder);

    expect(tt.rows).toHaveLength(8);
    // 1 + 1 + 1 = 3 -> SUM = 1, COUT = 1
    const lastRow = tt.rows[7];
    expect(lastRow.inputs).toEqual({ A: '1', B: '1', Cin: '1' });
    expect(lastRow.outputs).toEqual({ SUM: '1', COUT: '1' });

    expect(tt.canonicalSopExpressions.SUM).toContain('(A · B · Cin)');
    expect(tt.canonicalSopExpressions.COUT).toContain('(A · B · !Cin)');

    const engReport = generateEngineeringReport(adder);
    expect(engReport.totalNodes).toBe(10);
    expect(engReport.bom.length).toBeGreaterThanOrEqual(4);
    expect(engReport.netlist.length).toBeGreaterThan(0);
  });

  it('simulates Tri-State Shared Bus in High-Z, valid drive, and bus collision X', () => {
    const busDoc = buildTriStateBusPreset();
    const sim = new CircuitSimulator(busDoc);

    // Initially DRV_A enabled with DATA_A=1, DRV_B disabled (High-Z) -> Bus = 1
    let snap = sim.settleCombinational();
    expect(snap.nodePinStates.n_probe_bus.IN).toBe('1');
    expect(snap.status).toBe('STABLE');

    // Disable DRV_A as well -> both drivers output High-Z -> Shared Bus = Z
    sim.setInputState('n_en0', '0');
    snap = sim.settleCombinational();
    expect(snap.nodePinStates.n_probe_bus.IN).toBe('Z');

    // Enable BOTH DRV_A (1) and DRV_B (0) -> Bus Conflict ('X')!
    sim.setInputState('n_en0', '1');
    sim.setInputState('n_en1', '1');
    snap = sim.settleCombinational();
    expect(snap.nodePinStates.n_probe_bus.IN).toBe('X');
    expect(snap.status).toBe('BUS_CONFLICT');
    expect(snap.activeConflicts.length).toBeGreaterThan(0);
  });

  it('simulates sequential D-Flip-Flop Shift Register and NE555 + JK Frequency Divider', () => {
    const shiftDoc = buildShiftRegisterPreset();
    const sim = new CircuitSimulator(shiftDoc);

    // Advance past two rising clock edges
    const snap = sim.advanceBy(220);
    expect(snap.nodePinStates.n_q0.IN).toBe('1');
    expect(snap.nodePinStates.n_q1.IN).toBe('1');

    // Assert asynchronous CLEAR
    sim.setInputState('n_sclr', '1');
    const cleared = sim.advanceBy(40);
    expect(cleared.nodePinStates.n_q0.IN).toBe('0');
    expect(cleared.nodePinStates.n_q1.IN).toBe('0');

    // NE555 + JK divider
    const timerDoc = buildTimer555JkDividerPreset();
    const timerSim = new CircuitSimulator(timerDoc);
    timerSim.advanceBy(300);
    expect(timerSim.getWaveformHistory().length).toBeGreaterThan(1);
    const stepSnap = timerSim.stepSingleEvent();
    expect(stepSnap.currentTimeNs).toBeGreaterThan(300);
  });

  it('simulates SR-Latch, 4-bit Counter, Microprocessor ALU, and Custom IC Subcircuits', () => {
    expect(COMPONENT_CATALOG.length).toBeGreaterThanOrEqual(20);
    expect(PRESET_CIRCUITS).toHaveLength(6);

    const aluSim = new CircuitSimulator(buildMicroprocessorAluPreset());
    const aluSnap = aluSim.settleCombinational();
    // A = 3 (11), B = 1 (01), OP = 00 (ADD) -> 4 -> F=00, CY=1, ZF=1
    expect(aluSnap.nodePinStates.n_cy.IN).toBe('1');
    expect(aluSnap.nodePinStates.n_zf.IN).toBe('1');

    // Custom IC encapsulating a NAND gate
    const inA = createNodeFromCatalog('INPUT_SWITCH', 'sub_a', { x: 0, y: 0 }, 'IN_A');
    const inB = createNodeFromCatalog('INPUT_SWITCH', 'sub_b', { x: 0, y: 60 }, 'IN_B');
    const nand = createNodeFromCatalog('NAND', 'sub_nand', { x: 140, y: 20 }, 'G1');
    const outP = createNodeFromCatalog('PROBE', 'sub_out', { x: 280, y: 25 }, 'OUT_Y');

    const customIc: CustomICDefinition = {
      id: 'ic_my_nand',
      name: 'Custom NAND Module',
      code: 'IC_NAND',
      description: 'Encapsulated NAND subcircuit',
      propagationDelayNs: 12,
      inputPins: [
        { id: 'P_A', name: 'A', mappedNodeId: 'sub_a' },
        { id: 'P_B', name: 'B', mappedNodeId: 'sub_b' },
      ],
      outputPins: [{ id: 'P_Y', name: 'Y', mappedNodeId: 'sub_out' }],
      internalCircuit: {
        nodes: [inA, inB, nand, outP],
        edges: [
          {
            id: 'se1',
            sourceNodeId: 'sub_a',
            sourcePinId: 'OUT',
            targetNodeId: 'sub_nand',
            targetPinId: 'A',
            signalState: '0',
          },
          {
            id: 'se2',
            sourceNodeId: 'sub_b',
            sourcePinId: 'OUT',
            targetNodeId: 'sub_nand',
            targetPinId: 'B',
            signalState: '0',
          },
          {
            id: 'se3',
            sourceNodeId: 'sub_nand',
            sourcePinId: 'Y',
            targetNodeId: 'sub_out',
            targetPinId: 'IN',
            signalState: '0',
          },
        ],
      },
    };

    const topSw1 = createNodeFromCatalog('INPUT_SWITCH', 'top_1', { x: 0, y: 0 }, 'SW1');
    topSw1.properties.switchState = '1';
    const topSw2 = createNodeFromCatalog('INPUT_SWITCH', 'top_2', { x: 0, y: 70 }, 'SW2');
    topSw2.properties.switchState = '1';
    const icNode = createNodeFromCatalog('CUSTOM_IC', 'top_ic', { x: 160, y: 20 }, 'U1', customIc);
    const topLed = createNodeFromCatalog('LED', 'top_led', { x: 360, y: 30 }, 'LED1');

    const sim = new CircuitSimulator({
      nodes: [topSw1, topSw2, icNode, topLed],
      edges: [
        {
          id: 'te1',
          sourceNodeId: 'top_1',
          sourcePinId: 'OUT',
          targetNodeId: 'top_ic',
          targetPinId: 'P_A',
          signalState: '0',
        },
        {
          id: 'te2',
          sourceNodeId: 'top_2',
          sourcePinId: 'OUT',
          targetNodeId: 'top_ic',
          targetPinId: 'P_B',
          signalState: '0',
        },
        {
          id: 'te3',
          sourceNodeId: 'top_ic',
          sourcePinId: 'P_Y',
          targetNodeId: 'top_led',
          targetPinId: 'IN',
          signalState: '0',
        },
      ],
      customDefinitions: [customIc],
    });

    expect(sim.settleCombinational().nodePinStates.top_led.IN).toBe('0');
    sim.toggleInputSwitch('top_1');
    expect(sim.settleCombinational().nodePinStates.top_led.IN).toBe('1');
  });

  it('triggers oscillation guard on unstable odd inverter ring over long window', () => {
    const inv = createNodeFromCatalog('NOT', 'inv1', { x: 100, y: 100 }, 'RING_INV');
    inv.properties.propagationDelayNs = 1;
    const sim = new CircuitSimulator({
      nodes: [inv],
      edges: [
        {
          id: 'ring_edge',
          sourceNodeId: 'inv1',
          sourcePinId: 'Y',
          targetNodeId: 'inv1',
          targetPinId: 'A',
          signalState: '0',
        },
      ],
    });
    const snap = sim.advanceBy(5000);
    expect(snap.status).toBe('OSCILLATION_GUARD');
    expect(snap.warnings.length).toBeGreaterThan(0);
  });
});
