import { describe, expect, it } from 'vitest';
import {
  COMPONENT_CATALOG,
  CircuitSimulator,
  MinHeap,
  PRESET_CIRCUITS,
  analyzeCircuitGraph,
  buildAddressDecoderComparatorPreset,
  buildCounterHexPreset,
  buildFullAdderPreset,
  buildMicroprocessorAluPreset,
  buildShiftRegisterPreset,
  buildTimer555JkDividerPreset,
  buildTriStateBusPreset,
  computeTimer555Intervals,
  createNodeFromCatalog,
  decodeSevenSegment,
  evaluateAluSlice,
  evaluateComparator2Bit,
  evaluateDecoder2To4,
  evaluateMux4To1,
  extractElectricalNets,
  generateEngineeringReport,
  logicAnd,
  logicBuffer,
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

    // Digital buffer, 2-to-4 decoder, and 2-bit magnitude comparator
    expect(logicBuffer('0')).toBe('0');
    expect(logicBuffer('1')).toBe('1');
    expect(logicBuffer('Z')).toBe('X');

    expect(evaluateDecoder2To4('0', '1', '1')).toEqual({
      Y0: '0',
      Y1: '0',
      Y2: '1',
      Y3: '0',
    });
    expect(evaluateDecoder2To4('1', '1', '0')).toEqual({
      Y0: '0',
      Y1: '0',
      Y2: '0',
      Y3: '0',
    });

    expect(evaluateComparator2Bit('1', '1', '0', '1')).toEqual({
      GT: '1',
      EQ: '0',
      LT: '0',
    });
    expect(evaluateComparator2Bit('0', '1', '0', '1')).toEqual({
      GT: '0',
      EQ: '1',
      LT: '0',
    });
    expect(evaluateComparator2Bit('1', '0', '0', '1')).toEqual({
      GT: '0',
      EQ: '0',
      LT: '1',
    });
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

    // NE555 + JK divider across small 25ns UI tick slices (must not slip when highNs > 25ns)
    const timerDoc = buildTimer555JkDividerPreset();
    const timerSim = new CircuitSimulator(timerDoc);
    timerSim.advanceBy(200);
    const outStates = new Set<string>();
    const divStates = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const s = timerSim.advanceBy(25);
      outStates.add(s.nodePinStates.n_555.OUT);
      divStates.add(s.nodePinStates.n_jk.Q);
    }
    expect(outStates.has('0')).toBe(true);
    expect(outStates.has('1')).toBe(true);
    expect(divStates.has('0')).toBe(true);
    expect(divStates.has('1')).toBe(true);
    expect(timerSim.getWaveformHistory().length).toBeGreaterThan(4);
    const stepSnap = timerSim.stepSingleEvent();
    expect(stepSnap.currentTimeNs).toBeGreaterThan(500);
  });

  it('simulates SR-Latch, 4-bit Counter, Microprocessor ALU, and Custom IC Subcircuits', () => {
    expect(COMPONENT_CATALOG).toHaveLength(32);
    expect(PRESET_CIRCUITS).toHaveLength(7);

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

  it('simulates DIP_SWITCH_4, DECODER_2TO4, COMPARATOR_2BIT, T_FLIPFLOP, REGISTER_4BIT, and SHIFT_REG_SIPO', () => {
    // 1. Address Decoder & 2-bit Comparator preset with DIP_SWITCH_4
    const decCompDoc = buildAddressDecoderComparatorPreset();
    const decSim = new CircuitSimulator(decCompDoc);
    let snap = decSim.settleCombinational();
    // Initial DIP = ['1', '0', '1', '0'] -> A = 01 (1), B = 01 (1), EN=1 -> Y1=1, EQ=1
    expect(snap.nodePinStates.n_led_y1.IN).toBe('1');
    expect(snap.nodePinStates.n_led_eq.IN).toBe('1');
    expect(snap.nodePinStates.n_led_gt.IN).toBe('0');

    // Toggle DIP bit 1 (A1 -> 1, so A = 11 = 3 > B = 1) -> Y3=1, GT=1
    decSim.toggleDipSwitchBit('n_dip_bus', 1);
    snap = decSim.settleCombinational();
    expect(snap.nodePinStates.n_dec.Y3).toBe('1');
    expect(snap.nodePinStates.n_led_gt.IN).toBe('1');
    expect(snap.nodePinStates.n_led_eq.IN).toBe('0');

    // 2. T-Flip-Flop, 4-bit PIPO Register, and 4-bit SIPO Shift Register
    const swT = createNodeFromCatalog('INPUT_SWITCH', 'sw_t', { x: 0, y: 0 }, 'T_EN');
    swT.properties.switchState = '1';
    const clk = createNodeFromCatalog('CLOCK', 'clk', { x: 0, y: 80 }, 'CLK');
    clk.properties.halfPeriodNs = 80;
    const clr = createNodeFromCatalog('CONST_LOW', 'clr', { x: 0, y: 160 }, 'CLR');
    const tff = createNodeFromCatalog('T_FLIPFLOP', 'tff', { x: 160, y: 20 }, 'TFF');
    const reg4 = createNodeFromCatalog('REGISTER_4BIT', 'reg4', { x: 160, y: 140 }, 'REG4');
    const sipo = createNodeFromCatalog('SHIFT_REG_SIPO', 'sipo', { x: 160, y: 300 }, 'SIPO');

    const seqSim = new CircuitSimulator({
      nodes: [swT, clk, clr, tff, reg4, sipo],
      edges: [
        {
          id: 'e1',
          sourceNodeId: 'sw_t',
          sourcePinId: 'OUT',
          targetNodeId: 'tff',
          targetPinId: 'T',
          signalState: '0',
        },
        {
          id: 'e2',
          sourceNodeId: 'clk',
          sourcePinId: 'OUT',
          targetNodeId: 'tff',
          targetPinId: 'CLK',
          signalState: '0',
        },
        {
          id: 'e3',
          sourceNodeId: 'clr',
          sourcePinId: 'OUT',
          targetNodeId: 'tff',
          targetPinId: 'CLR',
          signalState: '0',
        },
        {
          id: 'e4',
          sourceNodeId: 'sw_t',
          sourcePinId: 'OUT',
          targetNodeId: 'reg4',
          targetPinId: 'D0',
          signalState: '0',
        },
        {
          id: 'e5',
          sourceNodeId: 'sw_t',
          sourcePinId: 'OUT',
          targetNodeId: 'reg4',
          targetPinId: 'LOAD',
          signalState: '0',
        },
        {
          id: 'e6',
          sourceNodeId: 'clk',
          sourcePinId: 'OUT',
          targetNodeId: 'reg4',
          targetPinId: 'CLK',
          signalState: '0',
        },
        {
          id: 'e7',
          sourceNodeId: 'clr',
          sourcePinId: 'OUT',
          targetNodeId: 'reg4',
          targetPinId: 'CLR',
          signalState: '0',
        },
        {
          id: 'e8',
          sourceNodeId: 'sw_t',
          sourcePinId: 'OUT',
          targetNodeId: 'sipo',
          targetPinId: 'SER',
          signalState: '0',
        },
        {
          id: 'e9',
          sourceNodeId: 'clk',
          sourcePinId: 'OUT',
          targetNodeId: 'sipo',
          targetPinId: 'CLK',
          signalState: '0',
        },
        {
          id: 'e10',
          sourceNodeId: 'clr',
          sourcePinId: 'OUT',
          targetNodeId: 'sipo',
          targetPinId: 'CLR',
          signalState: '0',
        },
      ],
    });

    // Test stepSingleEvent with halfPeriodNs = 80 (> 50 ns)
    const stepped = seqSim.stepSingleEvent();
    expect(stepped.currentTimeNs).toBeGreaterThan(0);

    const afterEdges = seqSim.advanceBy(260);
    expect(afterEdges.nodePinStates.reg4.Q0).toBe('1');
    expect(afterEdges.nodePinStates.sipo.Q0).toBe('1');
    expect(afterEdges.nodePinStates.sipo.Q1).toBe('1');
  });

  it('preserves simulation time, waveform history, and sequential memory when syncCircuit() is called during live edits', () => {
    const shiftDoc = buildShiftRegisterPreset();
    const sim = new CircuitSimulator(shiftDoc);

    // Run simulation to 220 ns so Q0=1, Q1=1 and waveformHistory is populated
    const snapBefore = sim.advanceBy(220);
    expect(snapBefore.currentTimeNs).toBe(220);
    expect(snapBefore.nodePinStates.n_q0.IN).toBe('1');
    expect(snapBefore.nodePinStates.n_q1.IN).toBe('1');
    const historyLenBefore = sim.getWaveformHistory().length;
    expect(historyLenBefore).toBeGreaterThanOrEqual(2);

    // User toggles DIN switch to '0' and drags a node on canvas while simulation is running
    const updatedDoc = structuredClone(shiftDoc);
    const dinNode = updatedDoc.nodes.find((n) => n.id === 'n_din')!;
    dinNode.properties.switchState = '0';
    dinNode.position = { x: dinNode.position.x + 40, y: dinNode.position.y + 20 };

    // Incremental sync MUST NOT reset time, waveform history, or flip-flop states!
    sim.syncCircuit(updatedDoc);
    const snapAfterSync = sim.getSnapshot();
    expect(snapAfterSync.currentTimeNs).toBe(220);
    expect(sim.getWaveformHistory().length).toBeGreaterThanOrEqual(historyLenBefore);
    expect(snapAfterSync.nodePinStates.n_q0.IN).toBe('1');
    expect(snapAfterSync.nodePinStates.n_q1.IN).toBe('1');

    // Advancing past the next rising clock edge shifts the new DIN='0' into Q0 while Q1 latches the previous Q0='1'
    const snapNext = sim.advanceBy(100);
    expect(snapNext.currentTimeNs).toBe(320);
    expect(snapNext.nodePinStates.n_q0.IN).toBe('0');
    expect(snapNext.nodePinStates.n_q1.IN).toBe('1');

    // Dynamic topology change via syncCircuit (adding BUFFER, SCHMITT_INV, SR_LATCH) + Counter preset + reset()
    const buf = createNodeFromCatalog('BUFFER', 'n_buf', { x: 400, y: 100 }, 'BUF1');
    const schm = createNodeFromCatalog('SCHMITT_INV', 'n_schm', { x: 520, y: 100 }, 'SCHM1');
    const srl = createNodeFromCatalog('SR_LATCH', 'n_srl', { x: 640, y: 100 }, 'SRL1');
    const topoDoc = {
      ...updatedDoc,
      nodes: [...updatedDoc.nodes, buf, schm, srl],
      edges: [
        ...updatedDoc.edges,
        {
          id: 'e_buf',
          sourceNodeId: 'n_din',
          sourcePinId: 'OUT',
          targetNodeId: 'n_buf',
          targetPinId: 'A',
          signalState: '0' as const,
        },
        {
          id: 'e_schm',
          sourceNodeId: 'n_buf',
          sourcePinId: 'Y',
          targetNodeId: 'n_schm',
          targetPinId: 'A',
          signalState: '0' as const,
        },
        {
          id: 'e_srl_s',
          sourceNodeId: 'n_schm',
          sourcePinId: 'Y',
          targetNodeId: 'n_srl',
          targetPinId: 'S',
          signalState: '0' as const,
        },
      ],
    };
    const syncedTopo = sim.syncCircuit(topoDoc);
    expect(syncedTopo.nodePinStates.n_schm.Y).toBe('1');
    expect(syncedTopo.nodePinStates.n_srl.Q).toBe('1');

    // Remove added nodes via syncCircuit
    sim.syncCircuit(updatedDoc);
    sim.reset();
    expect(sim.getSnapshot().currentTimeNs).toBe(0);

    // 4-bit synchronous counter with 7-segment hex display preset
    const cntSim = new CircuitSimulator(buildCounterHexPreset());
    const cntSnap = cntSim.advanceBy(260);
    expect(cntSnap.internalMemory.n_cnt.counterValue).toBeGreaterThan(0);
  });

  it('guards division-by-zero when T_crit === 0, handles NaN inputs, and disambiguates duplicate SOP labels', async () => {
    const {
      CircuitImportValidationError,
      safeParseCircuitSummaryList,
      safeParseCustomIcList,
      safeParseUserDto,
      sanitizeAndValidateCircuitDocument,
    } = await import('../circuitSanitizer');

    // Empty circuit: T_crit = 0, f_max MUST be 0 (no 1000 MHz or Infinity division by zero)
    const emptyTiming = analyzeCircuitGraph({ nodes: [], edges: [] });
    expect(emptyTiming.criticalPathDelayNs).toBe(0);
    expect(emptyTiming.maxClockFrequencyMhz).toBe(0);

    // Zero-delay circuit: T_crit = 0, f_max = 0
    const sw0 = createNodeFromCatalog('INPUT_SWITCH', 'sw0', { x: 0, y: 0 }, 'A');
    sw0.properties.propagationDelayNs = 0;
    const led0 = createNodeFromCatalog('LED', 'led0', { x: 100, y: 0 }, 'Y');
    led0.properties.propagationDelayNs = 0;
    const zeroTiming = analyzeCircuitGraph({ nodes: [sw0, led0], edges: [] });
    expect(zeroTiming.criticalPathDelayNs).toBe(0);
    expect(zeroTiming.maxClockFrequencyMhz).toBe(0);

    // NE555 NaN safety
    const safeRc = computeTimer555Intervals(Number.NaN, -50, Number.NaN);
    expect(Number.isFinite(safeRc.highNs)).toBe(true);
    expect(Number.isFinite(safeRc.frequencyHz)).toBe(true);

    // Duplicate input labels in truth table synthesizer
    const swDup1 = createNodeFromCatalog('INPUT_SWITCH', 'dup_1', { x: 0, y: 0 }, 'A');
    const swDup2 = createNodeFromCatalog('INPUT_SWITCH', 'dup_2', { x: 0, y: 80 }, 'A');
    const andGate = createNodeFromCatalog('AND', 'dup_and', { x: 160, y: 30 }, 'G_AND');
    const outDup = createNodeFromCatalog('PROBE', 'dup_out', { x: 320, y: 35 }, 'OUT');
    const dupTt = synthesizeTruthTable({
      nodes: [swDup1, swDup2, andGate, outDup],
      edges: [
        {
          id: 'de1',
          sourceNodeId: 'dup_1',
          sourcePinId: 'OUT',
          targetNodeId: 'dup_and',
          targetPinId: 'A',
          signalState: '0',
        },
        {
          id: 'de2',
          sourceNodeId: 'dup_2',
          sourcePinId: 'OUT',
          targetNodeId: 'dup_and',
          targetPinId: 'B',
          signalState: '0',
        },
        {
          id: 'de3',
          sourceNodeId: 'dup_and',
          sourcePinId: 'Y',
          targetNodeId: 'dup_out',
          targetPinId: 'IN',
          signalState: '0',
        },
      ],
    });
    expect(dupTt.inputLabels.map((i) => i.label)).toEqual(['A', 'A_2']);
    expect(dupTt.rows).toHaveLength(4);
    expect(dupTt.canonicalSopExpressions.OUT).toBe('(A · A_2)');

    // Mutual recursion guard on nested CUSTOM_IC
    const icRecA: CustomICDefinition = {
      id: 'ic_rec_a',
      name: 'Recursive A',
      code: 'RECA',
      description: '',
      propagationDelayNs: 10,
      inputPins: [{ id: 'IN', name: 'IN', mappedNodeId: 'ra_sw' }],
      outputPins: [{ id: 'OUT', name: 'OUT', mappedNodeId: 'ra_prb' }],
      internalCircuit: {
        nodes: [
          createNodeFromCatalog('INPUT_SWITCH', 'ra_sw', { x: 0, y: 0 }, 'IN'),
          createNodeFromCatalog('CUSTOM_IC', 'ra_sub', { x: 120, y: 0 }, 'B', {
            id: 'ic_rec_b',
            name: 'Recursive B',
            code: 'RECB',
            description: '',
            propagationDelayNs: 10,
            inputPins: [{ id: 'IN', name: 'IN', mappedNodeId: 'rb_sw' }],
            outputPins: [{ id: 'OUT', name: 'OUT', mappedNodeId: 'rb_prb' }],
            internalCircuit: { nodes: [], edges: [] },
          }),
          createNodeFromCatalog('PROBE', 'ra_prb', { x: 280, y: 0 }, 'OUT'),
        ],
        edges: [
          {
            id: 're1',
            sourceNodeId: 'ra_sub',
            sourcePinId: 'OUT',
            targetNodeId: 'ra_prb',
            targetPinId: 'IN',
            signalState: '0',
          },
        ],
      },
    };
    const icRecB: CustomICDefinition = {
      ...icRecA,
      id: 'ic_rec_b',
      internalCircuit: {
        nodes: [createNodeFromCatalog('CUSTOM_IC', 'rb_sub', { x: 100, y: 0 }, 'A', icRecA)],
        edges: [],
      },
    };
    const topRecIc = createNodeFromCatalog(
      'CUSTOM_IC',
      'top_rec',
      { x: 100, y: 0 },
      'U_REC',
      icRecA,
    );
    const recSim = new CircuitSimulator({
      nodes: [topRecIc],
      edges: [],
      customDefinitions: [icRecA, icRecB],
    });
    expect(recSim.settleCombinational(200).status).toBe('STABLE');

    // Sanitizer: valid preset passes cleanly & prototype pollution keys stripped cleanly
    const validPreset = buildFullAdderPreset();
    const withProtoStr = JSON.stringify(validPreset).replace(
      '{',
      '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"hacked":true}},',
    );
    const sanitized = sanitizeAndValidateCircuitDocument(withProtoStr);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(false);
    expect(sanitized.nodes).toHaveLength(validPreset.nodes.length);

    // Sanitizer rejects invalid syntax, dangling pin references, and oversized node count
    expect(() => sanitizeAndValidateCircuitDocument('{not-json')).toThrow(
      CircuitImportValidationError,
    );
    const brokenPinDoc = structuredClone(validPreset);
    brokenPinDoc.edges[0].targetPinId = 'NON_EXISTENT_PIN';
    expect(() => sanitizeAndValidateCircuitDocument(brokenPinDoc)).toThrow(
      CircuitImportValidationError,
    );
    const hugeDoc = structuredClone(validPreset);
    for (let i = 0; i < 260; i++) {
      hugeDoc.nodes.push(createNodeFromCatalog('AND', `extra_${i}`, { x: i * 10, y: 0 }));
    }
    expect(() => sanitizeAndValidateCircuitDocument(hugeDoc)).toThrow(CircuitImportValidationError);

    // LocalStorage safe corruption recovery
    expect(safeParseUserDto('{corrupt')).toBeNull();
    expect(safeParseUserDto('{"id":"1","email":"bad-email"}')).toBeNull();
    expect(safeParseCustomIcList('{bad')).toEqual([]);
    expect(safeParseCircuitSummaryList('{bad')).toEqual([]);
  });
});
