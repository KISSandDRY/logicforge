import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPONENT_CATALOG,
  CircuitSimulator,
  PRESET_CIRCUITS,
  STANDARD_COMPONENT_CATALOG,
  analyzeCircuitGraph,
  computeTimer555Intervals,
  createNodeFromCatalog,
  generateEngineeringReport,
  normalizeCircuitNodesWithCatalog,
  synthesizeTruthTable,
} from '@logicforge/shared-types';
import { computeNetJunctions, computeWireRoute } from '../components/circuit/CircuitCanvas';
import {
  computeAlignmentGuides,
  computeRoutedNets,
  snapNodePosition,
} from '../components/circuit/wireRouting';
import { CircuitNode } from '../components/circuit/CircuitNode';
import { NewSchemeModal } from '../components/circuit/NewSchemeModal';
import { PropertyInspector } from '../components/circuit/PropertyInspector';
import {
  WaveformPanel,
  computeEvenTimeTicks,
  computeVisibleWaveformTicks,
} from '../components/circuit/WaveformPanel';
import { BooleanSopFormula, MathFormula, MathVar } from '../components/ui/MathFormula';
import { Navbar } from '../components/layout/Navbar';
import { LogicBadge } from '../components/ui/LogicBadge';
import { Modal } from '../components/ui/Modal';
import { Win95Dropdown } from '../components/ui/Win95Dropdown';
import { AuthProvider } from '../context/AuthContext';
import { WorkspaceProvider } from '../context/WorkspaceContext';
import { CabinetPage } from '../pages/CabinetPage';
import { AuthPage } from '../pages/AuthPage';
import { ComponentLibraryPage } from '../pages/ComponentLibraryPage';
import { DashboardPage } from '../pages/DashboardPage';
import { EditorPage } from '../pages/EditorPage';
import { ReportsPage } from '../pages/ReportsPage';
import { RevisionHistoryPage } from '../pages/RevisionHistoryPage';
import { getComponentTruthTable } from '../utils/componentTruthTables';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

beforeAll(() => {
  const ls = createMemoryStorage();
  const ss = createMemoryStorage();
  const matchMediaMock = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });

  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: ss, configurable: true });
  if (typeof globalThis.window === 'undefined') {
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: ls,
        sessionStorage: ss,
        matchMedia: matchMediaMock,
        addEventListener: () => {},
        removeEventListener: () => {},
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        setInterval: globalThis.setInterval.bind(globalThis),
        clearInterval: globalThis.clearInterval.bind(globalThis),
      },
      configurable: true,
    });
  } else {
    globalThis.window.matchMedia = globalThis.window.matchMedia ?? matchMediaMock;
  }
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline unit test environment')));
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

function renderWithProviders(
  element: React.ReactElement,
  initialEntries: string[] = ['/'],
): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <WorkspaceProvider>{element}</WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Oscilloscope Waveform Tick Layout (computeVisibleWaveformTicks)', () => {
  it('handles empty and single-sample timelines gracefully', () => {
    expect(computeVisibleWaveformTicks([], 600)).toEqual([]);
    const single = computeVisibleWaveformTicks([0], 600);
    expect(single).toHaveLength(1);
    expect(single[0]).toMatchObject({
      index: 0,
      timeNs: 0,
      showLabel: true,
      anchor: 'start',
    });
  });

  it('prevents adjacent label overlaps on narrow (220px), standard (520px), and wide (1280px) viewports while keeping final timestamp', () => {
    const samples = Array.from({ length: 16 }, (_, idx) => idx * 25); // 0..375 ns

    for (const width of [220, 320, 520, 960, 1280]) {
      const ticks = computeVisibleWaveformTicks(samples, width);
      expect(ticks).toHaveLength(samples.length);

      const labeled = ticks.filter((t) => t.showLabel);
      expect(labeled.length).toBeGreaterThanOrEqual(2);
      expect(labeled[0].timeNs).toBe(0);
      expect(labeled[labeled.length - 1].timeNs).toBe(375);
      expect(labeled[labeled.length - 1].anchor).toBe('end');
      expect(labeled[labeled.length - 1].labelX).toBeLessThanOrEqual(width);

      for (let i = 0; i < labeled.length - 1; i++) {
        const curr = labeled[i];
        const next = labeled[i + 1];
        const currTextW = `${curr.timeNs} нс`.length * 6.8;
        const nextTextW = `${next.timeNs} нс`.length * 6.8;
        const currRight = curr.anchor === 'end' ? curr.labelX : curr.labelX + currTextW;
        const nextLeft = next.anchor === 'end' ? next.labelX - nextTextW : next.labelX;
        expect(currRight).toBeLessThan(nextLeft);
      }
    }
  });
});

describe('Component Library Catalog & Truth Tables', () => {
  it('returns valid non-empty truth table metadata for all 31 standard catalog elements', () => {
    const standardItems = COMPONENT_CATALOG.filter((item) => item.type !== 'CUSTOM_IC');
    expect(standardItems).toHaveLength(31);

    for (const item of standardItems) {
      const truth = getComponentTruthTable(item.type);
      expect(truth.title.length).toBeGreaterThan(3);
      expect(truth.inputHeaders.length).toBeGreaterThanOrEqual(1);
      expect(truth.outputHeaders.length).toBeGreaterThanOrEqual(1);
      expect(truth.rows.length).toBeGreaterThanOrEqual(1);
    }
    const truth = getComponentTruthTable('INPUT_SWITCH');
    expect(truth.title).toBe('Таблиця істинності');
    expect(truth.title).not.toContain('IEEE');

    const latexHtml = renderToStaticMarkup(
      <div>
        <MathVar sym="t" sub="pd" />
        <MathFormula latex="2^n" />
        <MathFormula latex="T_{crit} + f_{max}" />
        <BooleanSopFormula outputName="OUT_Y" expression="(!IN_A · IN_B) + (IN_A · !IN_B)" />
      </div>,
    );
    expect(latexHtml).toContain('<sub ');
    expect(latexHtml).toContain('data-testid="boolean-latex-formula"');
    expect(latexHtml).toContain('border-t-[1.5px]');
    expect(latexHtml).not.toContain('!IN_A');
    expect(latexHtml).not.toContain('!IN_B');
    expect(latexHtml).not.toContain('t_pd');
    expect(latexHtml).not.toContain('T_crit');
    expect(latexHtml).not.toContain('f_max');

    // Verify Custom IC encapsulation & nested CircuitSimulator execution works end-to-end
    const swA = createNodeFromCatalog('INPUT_SWITCH', 'ha_in_a', { x: 40, y: 40 }, 'A');
    const swB = createNodeFromCatalog('INPUT_SWITCH', 'ha_in_b', { x: 40, y: 120 }, 'B');
    const gXor = createNodeFromCatalog('XOR', 'ha_xor', { x: 200, y: 40 }, 'XOR');
    const gAnd = createNodeFromCatalog('AND', 'ha_and', { x: 200, y: 120 }, 'AND');
    const outS = createNodeFromCatalog('PROBE', 'ha_s', { x: 360, y: 40 }, 'S');
    const outC = createNodeFromCatalog('PROBE', 'ha_c', { x: 360, y: 120 }, 'C');
    const halfAdderDef = {
      id: 'ic-test-ha',
      name: 'Напівсуматор',
      code: 'HA_TEST',
      description: 'Тест ІМС',
      propagationDelayNs: 10,
      inputPins: [
        { id: 'IN_0', name: 'A', mappedNodeId: swA.id },
        { id: 'IN_1', name: 'B', mappedNodeId: swB.id },
      ],
      outputPins: [
        { id: 'OUT_0', name: 'S', mappedNodeId: outS.id },
        { id: 'OUT_1', name: 'C', mappedNodeId: outC.id },
      ],
      internalCircuit: {
        nodes: [swA, swB, gXor, gAnd, outS, outC],
        edges: [
          {
            id: 'h1',
            sourceNodeId: swA.id,
            sourcePinId: 'OUT',
            targetNodeId: gXor.id,
            targetPinId: 'A',
            signalState: '0' as const,
          },
          {
            id: 'h2',
            sourceNodeId: swB.id,
            sourcePinId: 'OUT',
            targetNodeId: gXor.id,
            targetPinId: 'B',
            signalState: '0' as const,
          },
          {
            id: 'h3',
            sourceNodeId: swA.id,
            sourcePinId: 'OUT',
            targetNodeId: gAnd.id,
            targetPinId: 'A',
            signalState: '0' as const,
          },
          {
            id: 'h4',
            sourceNodeId: swB.id,
            sourcePinId: 'OUT',
            targetNodeId: gAnd.id,
            targetPinId: 'B',
            signalState: '0' as const,
          },
          {
            id: 'h5',
            sourceNodeId: gXor.id,
            sourcePinId: 'Y',
            targetNodeId: outS.id,
            targetPinId: 'IN',
            signalState: '0' as const,
          },
          {
            id: 'h6',
            sourceNodeId: gAnd.id,
            sourcePinId: 'Y',
            targetNodeId: outC.id,
            targetPinId: 'IN',
            signalState: '0' as const,
          },
        ],
      },
    };
    const extA = createNodeFromCatalog('INPUT_SWITCH', 'ext_a', { x: 40, y: 40 }, 'X', undefined);
    const extB = createNodeFromCatalog('INPUT_SWITCH', 'ext_b', { x: 40, y: 120 }, 'Y', undefined);
    extA.properties.switchState = '1';
    extB.properties.switchState = '1';
    const icNode = createNodeFromCatalog(
      'CUSTOM_IC',
      'ic_u1',
      { x: 200, y: 60 },
      'U1',
      halfAdderDef,
    );
    const customSim = new CircuitSimulator({
      nodes: [extA, extB, icNode],
      edges: [
        {
          id: 'c1',
          sourceNodeId: extA.id,
          sourcePinId: 'OUT',
          targetNodeId: icNode.id,
          targetPinId: 'IN_0',
          signalState: '1',
        },
        {
          id: 'c2',
          sourceNodeId: extB.id,
          sourcePinId: 'OUT',
          targetNodeId: icNode.id,
          targetPinId: 'IN_1',
          signalState: '1',
        },
      ],
      customDefinitions: [halfAdderDef],
    });
    const customSnap = customSim.settleCombinational(200);
    expect(customSnap.nodePinStates[icNode.id].OUT_0).toBe('0');
    expect(customSnap.nodePinStates[icNode.id].OUT_1).toBe('1');

    // Linear hardware time axis ruler uses even round increments regardless of irregular event times
    const evenTicks = computeEvenTimeTicks(0, 200, 640);
    expect(evenTicks.length).toBeGreaterThanOrEqual(4);
    const majors = evenTicks.filter((t) => t.isMajor).map((t) => t.timeNs);
    expect(majors[0]).toBe(0);
    expect(majors).not.toContain(64);
    expect(majors).not.toContain(144);
    if (majors.length >= 3) {
      expect(majors[2] - majors[1]).toBe(majors[1] - majors[0]);
    }
  });
});

describe('IEEE 1164 Simulation Core Across All Presets & NE555 Astability', () => {
  it('toggles NE555 OUT and JK divider DIV_BY_2 cleanly across 25ns steps and honors !RST=0', () => {
    const preset = PRESET_CIRCUITS.find((p) => p.id === 'preset-ne555-jk');
    expect(preset).toBeDefined();

    const doc = JSON.parse(JSON.stringify(preset!.document));
    const ne555Node = doc.nodes.find((n: { type: string }) => n.type === 'TIMER_555');
    expect(ne555Node).toBeDefined();

    const intervals = computeTimer555Intervals(
      ne555Node.properties.resistanceR1Ohms,
      ne555Node.properties.resistanceR2Ohms,
      ne555Node.properties.capacitanceUf,
    );
    expect(intervals.highNs).toBeGreaterThan(0);
    expect(intervals.lowNs).toBeGreaterThan(0);

    const sim = new CircuitSimulator(doc);
    const outStates: string[] = [];
    const divStates: string[] = [];

    for (let i = 0; i < 12; i++) {
      const snap = sim.advanceBy(25);
      outStates.push(snap.nodePinStates.n_555?.OUT ?? 'Z');
      divStates.push(snap.nodePinStates.n_jk?.Q ?? 'Z');
    }

    expect(outStates).toContain('1');
    expect(outStates).toContain('0');
    expect(divStates).toContain('1');
    expect(divStates).toContain('0');

    // Holding !RST low forces NE555 OUT to 0
    sim.setInputState('n_555_en', '0');
    const resetSnap = sim.advanceBy(50);
    expect(resetSnap.nodePinStates.n_555?.OUT).toBe('0');
  });

  it('analyzes timing, simulates signals, synthesizes Full Adder truth table, and builds engineering report across all 7 presets', () => {
    expect(PRESET_CIRCUITS.length).toBe(7);

    for (const preset of PRESET_CIRCUITS) {
      const timing = analyzeCircuitGraph(preset.document);
      expect(timing.criticalPathDelayNs).toBeGreaterThanOrEqual(0);
      expect(timing.maxClockFrequencyMhz).toBeGreaterThan(0);

      const sim = new CircuitSimulator(preset.document);
      const snap = preset.document.nodes.some((n) => n.type === 'CLOCK' || n.type === 'TIMER_555')
        ? sim.advanceBy(200)
        : sim.settleCombinational(300);
      expect(snap.processedEventsCount).toBeGreaterThanOrEqual(0);

      const report = generateEngineeringReport(preset.document);
      expect(report.bom.length).toBeGreaterThan(0);
      expect(report.timing.criticalPathDelayNs).toBeGreaterThanOrEqual(0);
    }

    const fullAdder = PRESET_CIRCUITS.find((p) => p.id === 'preset-full-adder')!;
    const table = synthesizeTruthTable(fullAdder.document);
    expect(table.rows).toHaveLength(8);
    expect(Object.keys(table.canonicalSopExpressions).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Win95 UI Polish, CAD SVG Upgrade & Collision Detection', () => {
  it('renders crisp hardware LogicBadge styling without pastel mint backgrounds', () => {
    const htmlHigh = renderToStaticMarkup(<LogicBadge state="1" />);
    expect(htmlHigh).toContain('1 (HIGH)');
    expect(htmlHigh).toContain('bg-win-highlight');
    expect(htmlHigh).toContain('border-logic-high-border');
    expect(htmlHigh).not.toContain('bg-logic-high-bg');
  });

  it('renders NewSchemeModal with Empty vs Template selection and strictly single close [X] button', () => {
    const html = renderWithProviders(
      <NewSchemeModal open onClose={() => {}} onCreated={() => {}} />,
      ['/'],
    );
    expect(html).toContain('data-testid="new-scheme-mode-empty"');
    expect(html).toContain('data-testid="new-scheme-mode-template"');
    expect(html).toContain('data-testid="new-scheme-name-input"');
    expect(html).toContain('data-testid="new-scheme-description-input"');
    expect(html).toContain('data-testid="new-scheme-category-select"');
    expect(html).toContain('data-testid="btn-confirm-create-scheme"');
    expect(html).not.toContain('із палітри');
    expect(html).not.toContain('Робочий проєкт цифрової логічної схеми');
    const closeMatches = html.match(/aria-label="Закрити діалогове вікно"/g) ?? [];
    expect(closeMatches).toHaveLength(1);
    expect(html).not.toMatch(/>Скасувати</);
  });

  it('renders Win95Dropdown with sharp listbox trigger and arrow glyph', () => {
    const html = renderToStaticMarkup(
      <Win95Dropdown
        testId="test-win95-dropdown"
        ariaLabel="Тест"
        value="a"
        options={[
          { value: 'a', label: 'Перший', group: 'Група 1' },
          { value: 'b', label: 'Другий', group: 'Група 2' },
        ]}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('data-testid="test-win95-dropdown"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('Перший');
    expect(html).not.toContain('rounded');
  });

  it('routes straight 90-degree orthogonal wires without cubic curves and renders empty analyzer on reset', async () => {
    const forward = computeWireRoute(100, 40, 260, 120);
    expect(forward.path).toContain(' L ');
    expect(forward.path).not.toContain(' C ');

    const feedback = computeWireRoute(300, 120, 120, 40);
    expect(feedback.path.startsWith('M 300 120 L 316 120')).toBe(true);
    expect(feedback.path).not.toContain(' C ');

    const sim = new CircuitSimulator(PRESET_CIRCUITS[0].document);
    sim.reset();
    sim.clearWaveformHistory();
    expect(sim.getWaveformHistory()).toHaveLength(0);

    const emptyHtml = renderToStaticMarkup(<WaveformPanel samples={[]} currentTimeNs={0} />);
    expect(emptyHtml).toContain('data-testid="waveform-empty-state"');

    sim.advanceBy(25);
    expect(sim.getWaveformHistory().length).toBeGreaterThanOrEqual(2);

    // Connected same-net T-junction gets a dot; unconnected crossing between distinct nets does NOT
    const dots = computeNetJunctions(
      [
        {
          sourcePinKey: 'n1::OUT',
          targetPinKey: 'n2::IN',
          points: [
            { x: 100, y: 100 },
            { x: 300, y: 100 },
          ],
          color: '#009900',
        },
        {
          sourcePinKey: 'n1::OUT',
          targetPinKey: 'n3::IN',
          points: [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
            { x: 200, y: 200 },
          ],
          color: '#009900',
        },
        {
          sourcePinKey: 'n4::OUT',
          targetPinKey: 'n5::IN',
          points: [
            { x: 250, y: 40 },
            { x: 250, y: 200 },
          ],
          color: '#1a1a1a',
        },
      ],
      new Set(['100,100', '300,100', '200,200', '250,40', '250,200']),
    );
    expect(dots).toHaveLength(1);
    expect(dots[0]).toMatchObject({ x: 200, y: 100 });

    // CircuitCanvas removes clutter wire 0/1 square badges, keeps touch-none pinch protection, and separates parallel net buses
    const compPreset = PRESET_CIRCUITS.find((p) => p.id === 'preset-decoder-comparator')!.document;
    const compSim = new CircuitSimulator(compPreset);
    const compSnap = compSim.settleCombinational(200);
    const { CircuitCanvas } = await import('../components/circuit/CircuitCanvas');
    const canvasHtml = renderToStaticMarkup(
      <CircuitCanvas
        nodes={compPreset.nodes}
        edges={compPreset.edges}
        viewport={compPreset.viewport}
        nodePinStates={compSnap.nodePinStates}
        edgeStates={compSnap.edgeStates}
        selectedNodeId={null}
        selectedEdgeId={null}
        onChangeViewport={() => {}}
      />,
    );
    expect(canvasHtml).toContain('touch-none overscroll-contain');
    expect(canvasHtml).toContain('data-testid="wire-junction-dot"');
    expect(canvasHtml).not.toContain('width="16" height="14"');
    // Distinct parallel bus nets (Q0..Q3, EN) get separated vertical lanes instead of overlapping on x=256
    expect(canvasHtml).toContain('L 240 ');
    expect(canvasHtml).toContain('L 248 ');
    expect(canvasHtml).toContain('L 256 ');
    expect(canvasHtml).toContain('L 264 ');
    expect(canvasHtml).toContain('L 272 ');
  });

  it('renders upgraded DIP package notch, non-overlapping above-lead gate labels, and radial gradient LED', () => {
    const timerNode = createNodeFromCatalog('TIMER_555', 'ic_1', { x: 0, y: 0 }, 'NE555');
    const xorNode = createNodeFromCatalog('XOR', 'g_xor', { x: 0, y: 150 }, 'XOR1');
    const ledNode = createNodeFromCatalog('LED', 'led_1', { x: 200, y: 0 }, 'L1');
    const html = renderToStaticMarkup(
      <svg>
        <CircuitNode node={timerNode} readOnly />
        <CircuitNode node={xorNode} readOnly />
        <CircuitNode node={ledNode} pinStates={{ IN: '1' }} readOnly />
      </svg>,
    );
    expect(html).toContain('#f4f4f0');
    expect(html).toContain('radialGradient');
    expect(html).toContain('led-grad-led_1');
    expect(html).toContain('y="-5"');
  });
});

describe('Accessible Single-Close Modal & Contextual PropertyInspector', () => {
  it('renders Modal with ARIA dialog attributes and strictly ONE close button', () => {
    const html = renderToStaticMarkup(
      <Modal
        open
        onClose={() => {}}
        title="Специфікація елемента"
        subtitle="Підзаголовок"
        footer={<button type="button">Зберегти</button>}
      >
        <div>Вміст</div>
      </Modal>,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="');
    const closeMatches = html.match(/aria-label="Закрити діалогове вікно"/g) ?? [];
    expect(closeMatches).toHaveLength(1);
    expect(html).not.toMatch(/>Закрити</);
    expect(html).not.toMatch(/>Скасувати</);
    expect(html).not.toMatch(/>Готово</);
  });

  it('renders timing/analysis overview with ДДНФ action when no node is selected', () => {
    const fullAdder = PRESET_CIRCUITS.find((p) => p.id === 'preset-full-adder')!.document;
    const timing = analyzeCircuitGraph(fullAdder);
    const html = renderToStaticMarkup(
      <PropertyInspector
        node={null}
        timingReport={timing}
        nodeCount={fullAdder.nodes.length}
        edgeCount={fullAdder.edges.length}
        selectedEdgeId="e_test"
        onDeleteSelectedEdge={() => {}}
        onOpenTruthTable={() => {}}
      />,
    );

    expect(html).toContain('data-testid="inspector-circuit-overview"');
    expect(html).toContain(`${timing.criticalPathDelayNs} нс`);
    expect(html).toContain(`${timing.maxClockFrequencyMhz} МГц`);
    expect(html).toContain('Аналіз ДДНФ');
    expect(html).toContain('Видалити лінію');
    expect(html).not.toContain('Елемент не обрано');
  });

  it('renders collapsed <details> truth table by default when a component node is selected', () => {
    const timerNode = createNodeFromCatalog(
      'TIMER_555',
      'ne555_test_1',
      { x: 100, y: 100 },
      'NE555_TEST',
    );
    const html = renderToStaticMarkup(
      <PropertyInspector node={timerNode} onChangeProperties={() => {}} />,
    );

    expect(html).toContain('Параметри елемента');
    expect(html).toContain('NE555_TEST');
    expect(html).toContain('Таблиця істинності елемента');
    expect(html).toContain('<details');
    expect(html).not.toContain('<details open');
  });
});

describe('Refactored Pages, Guest Auth Gating & Win95 Structure Verification', () => {
  it('renders unified slim Navbar without circuit selector or simulation CTA', () => {
    const html = renderWithProviders(<Navbar />, ['/']);
    expect(html).toContain('LOGICFORGE');
    expect(html).toContain('Головна');
    expect(html).toContain('Мої схеми');
    expect(html).toContain('Редактор');
    expect(html).toContain('Бібліотека');
    expect(html).toContain('Ревізії');
    expect(html).toContain('Звіти');
    expect(html).toContain('data-testid="navbar-new-btn"');
    expect(html).toContain('Вхід');
    expect(html).toContain('Реєстрація');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('ЗАПУСТИТИ СИМУЛЯЦІЮ');
  });

  it('renders Home Dashboard centered on 4 demo presets + playback toolbar + 3 quick-start cards', () => {
    const html = renderWithProviders(<DashboardPage />, ['/']);
    expect(html).toContain('Генератор NE555 + JK-тригер');
    expect(html).toContain('1-розрядний повний суматор');
    expect(html).toContain('4-розрядний лічильник + HEX');
    expect(html).toContain('4-розрядний АЛП');
    expect(html).toContain('Відкрити в редакторі →');
    expect(html).toContain('Схемотехнічний редактор');
    expect(html).toContain('Бібліотека 31 ІМС');
    expect(html).toContain('Інженерні звіти та ДДНФ');
    expect(html).not.toContain('LOGICFORGE.EXE');
  });

  it('renders compact ComponentLibrary cards without embedded truth tables or back links', () => {
    const html = renderWithProviders(<ComponentLibraryPage />, ['/library']);
    expect(html).toContain('Каталог елементної бази');
    expect(html).toContain('Специфікація та таблиця істинності →');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('До редактора САПР');
  });

  it('gates CabinetPage and RevisionHistoryPage for unauthenticated guests', () => {
    const cabGuestHtml = renderWithProviders(<CabinetPage />, ['/cabinet']);
    expect(cabGuestHtml).toContain('data-testid="auth-required-gate"');
    expect(cabGuestHtml).toContain('Увійти в акаунт');
    expect(cabGuestHtml).toContain('Реєстрація');

    const revGuestHtml = renderWithProviders(
      <Routes>
        <Route path="/revisions/:id" element={<RevisionHistoryPage />} />
      </Routes>,
      ['/revisions/preset-full-adder'],
    );
    expect(revGuestHtml).toContain('data-testid="auth-required-gate"');
    expect(revGuestHtml).toContain('ДОСТУП ОБМЕЖЕНО');
  });

  it('renders Cabinet and RevisionHistory full functionality when user is authenticated', () => {
    localStorage.setItem(
      'logicforge_user',
      JSON.stringify({
        id: 'u-test-1',
        email: 'test@logicforge.eda',
        username: 'tester',
        fullName: 'Тестовий Інженер',
        role: 'STUDENT',
        createdAt: new Date().toISOString(),
      }),
    );
    localStorage.setItem(
      'logicforge_custom_ics_v1',
      JSON.stringify([
        {
          id: 'ic-half-adder',
          name: 'Напівсуматор (Half Adder IC)',
          code: 'HA_1BIT',
          description: 'Тестовий 1-бітний півсуматор для перевірки редагування ІМС',
          propagationDelayNs: 14,
          inputPins: [
            { id: 'in_a', name: 'A', mappedNodeId: 'n_in_a' },
            { id: 'in_b', name: 'B', mappedNodeId: 'n_in_b' },
          ],
          outputPins: [
            { id: 'out_s', name: 'SUM', mappedNodeId: 'n_out_sum' },
            { id: 'out_c', name: 'CARRY', mappedNodeId: 'n_out_carry' },
          ],
          internalCircuit: { nodes: [], edges: [] },
        },
      ]),
    );

    const cabUserHtml = renderWithProviders(<CabinetPage />, ['/cabinet']);
    expect(cabUserHtml).toContain('data-testid="tab-all-circuits"');
    expect(cabUserHtml).toContain('data-testid="tab-personal-circuits"');
    expect(cabUserHtml).toContain('data-testid="tab-custom-ics"');
    expect(cabUserHtml).toContain('Мої мікросхеми ІМС (1)');
    expect(cabUserHtml).not.toContain('auth-required-gate');

    const revUserHtml = renderWithProviders(
      <Routes>
        <Route path="/revisions/:id" element={<RevisionHistoryPage />} />
      </Routes>,
      ['/revisions/preset-full-adder'],
    );
    expect(revUserHtml).toContain('data-testid="revision-summary-panel"');
    expect(revUserHtml).toContain('ІНФОРМАЦІЯ ПРО РЕВІЗІЮ');
    expect(revUserHtml).toContain('Відновити цю ревізію в редактор');
    expect(revUserHtml).not.toContain('auth-required-gate');
  });

  it('renders ReportsPage compact header with Win95 gray output column headers and auth-gated exports', async () => {
    const html = renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportsPage />} />
      </Routes>,
      ['/reports/preset-full-adder'],
    );
    expect(html).toContain('Специфікація:');
    expect(html).toContain('Експорт BOM (.csv)');
    expect(html).toContain('ГРАФІЧНА ПРИНЦИПОВА ЛОГІЧНА СХЕМА');
    expect(html).toContain('data-testid="circuit-canvas"');
    expect(html).toContain('bg-win-bg');
    expect(html).toContain('print-auth-required');
    expect(html).toContain('data-testid="reports-guest-banner"');
    expect(html).toContain('data-testid="print-auth-notice"');
    expect(html).not.toContain('bg-logic-high-bg');
    expect(html).not.toContain('До редактора САПР');

    localStorage.setItem(
      'logicforge_user',
      JSON.stringify({
        id: 'u-test-1',
        email: 'test@logicforge.eda',
        username: 'tester',
        fullName: 'Тестовий Інженер',
        role: 'STUDENT',
        createdAt: new Date().toISOString(),
      }),
    );
    const authReportHtml = renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportsPage />} />
      </Routes>,
      ['/reports/preset-full-adder'],
    );
    expect(authReportHtml).toContain('data-testid="print-title-block"');
    expect(authReportHtml).toContain('Розробив');
    expect(authReportHtml).toContain('Тестовий Інженер');
    expect(authReportHtml).toContain('viewBox="');
    expect(authReportHtml).not.toContain('print-hide-grid');
    expect(authReportHtml).not.toContain('print-auth-required');

    // CatalogNodePreview matches exact canvas CircuitNode symbols (3D beveled switch track, 1-pin VCC, LED radial gradient)
    const { CatalogNodePreview } = await import('../components/circuit/CatalogNodePreview');
    const swPrev = renderToStaticMarkup(<CatalogNodePreview type="INPUT_SWITCH" compact />);
    const vccPrev = renderToStaticMarkup(<CatalogNodePreview type="CONST_HIGH" compact />);
    const ledPrev = renderToStaticMarkup(<CatalogNodePreview type="LED" compact />);
    expect(swPrev).toContain('data-testid="preview-symbol-INPUT_SWITCH"');
    expect(swPrev).toContain('fill="#2b2b2b"');
    expect(swPrev).toContain('switch-toggle-prev_');
    expect(vccPrev).toContain('VCC');
    expect(ledPrev).toContain('radialGradient');
  });

  it('renders EditorPage single Win95Dropdown switcher without duplicate text input', () => {
    const html = renderWithProviders(
      <Routes>
        <Route path="/editor/:id" element={<EditorPage />} />
      </Routes>,
      ['/editor/preset-ne555-jk'],
    );
    expect(html).toContain('data-testid="editor-circuit-select"');
    expect(html).toContain('data-testid="editor-speed-select"');
    expect(html).toContain('data-testid="btn-rename-scheme"');
    expect(html).not.toContain('CENTRAL WORKSPACE');
    expect(html).not.toContain('data-testid="editor-title-input"');
    expect(html).not.toContain('<select');
    expect(html).toContain('patternTransform="translate(');
    expect(html).toContain('data-testid="btn-toggle-run"');
    expect(html).toContain('data-testid="btn-clear-canvas"');
    expect(html).toContain('data-testid="btn-truth-table"');
    expect(html).toContain('data-testid="btn-save-revision"');
    expect(html).toContain('data-testid="inspector-circuit-overview"');
    expect(html).toContain('Скинути<');
    expect(html).not.toContain('Скинути 0 нс');
    expect(html).toContain('ЛОГІЧНИЙ АНАЛІЗАТОР');
    expect(html).not.toContain('ВІКНО СИГНАЛІВ ТА ЧАСОВИХ ДІАГРАМ');
    expect(html).toContain('Бібліотека');
    expect(html).not.toContain('Палітра');
    expect(html).toContain('Створити ІМС');
    expect(html).not.toContain('Зберегти в ІМС');
    expect(html).not.toContain('ПАНЕЛЬ УПРАВЛІННЯ');
  });

  it('uses Win95Dropdown everywhere (no native <select>), Win95NumberInput spinners, and Saleae waveform background without dot grid', () => {
    const ledNode = createNodeFromCatalog('LED', 'led_ui_1', { x: 200, y: 120 }, 'OUT_Y');
    const ledInspectorHtml = renderToStaticMarkup(
      <PropertyInspector node={ledNode} onChangeProperties={() => {}} />,
    );
    expect(ledInspectorHtml).toContain('data-testid="inspector-led-color-select"');
    expect(ledInspectorHtml).toContain('win95-number-raw');
    expect(ledInspectorHtml).toContain('Збільшити значення');
    expect(ledInspectorHtml).not.toContain('<select');

    const waveHtml = renderToStaticMarkup(
      <WaveformPanel
        samples={[
          { timeNs: 0, signals: { 'IN_A (Q)': '0', OUT_Y: '0' } },
          { timeNs: 25, signals: { 'IN_A (Q)': '1', OUT_Y: '1' } },
        ]}
        currentTimeNs={25}
      />,
    );
    expect(waveHtml).toContain('fill="#ffffff"');
    expect(waveHtml).toContain('stroke="#000000"');
    expect(waveHtml).toContain('data-testid="waveform-follow-toggle"');
    expect(waveHtml).not.toContain('cad-grid-bg');

    const staleXorDoc = structuredClone(PRESET_CIRCUITS[0].document);
    const xorNode = staleXorDoc.nodes.find((n) => n.type === 'XOR')!;
    xorNode.pins[0].offset.y = 20;
    const normalized = normalizeCircuitNodesWithCatalog(staleXorDoc);
    const fixedXor = normalized.nodes.find((n) => n.id === xorNode.id)!;
    expect(fixedXor.pins[0].offset).toEqual({ x: 0, y: 16, side: 'LEFT' });
    expect(fixedXor.pins[1].offset).toEqual({ x: 0, y: 48, side: 'LEFT' });

    const regHtml = renderWithProviders(<AuthPage />, ['/register']);
    expect(regHtml).toContain('placeholder="Шевченко Іван"');
    expect(regHtml.toLowerCase()).toContain('novalidate');
    expect(regHtml).not.toContain('Самець');
    expect(regHtml).not.toContain('Особистий кабінет • Збереження проєктів');
  });

  it('escapes user-supplied labels safely (zero XSS) and recovers cleanly from corrupted localStorage', async () => {
    const { CircuitImportValidationError, sanitizeAndValidateCircuitDocument } =
      await import('@logicforge/shared-types');

    // Corrupt & prototype-polluting localStorage MUST NOT crash CabinetPage or pollute Object.prototype
    localStorage.setItem('logicforge_user', '{corrupt-user-json');
    localStorage.setItem('logicforge_custom_ics_v1', '[{"__proto__":{"polluted":true},"bad":1}]');
    localStorage.setItem(
      'logicforge_circuit_draft_v2_preset-full-adder',
      '{"__proto__":{"pollutedDraft":true},"nodes":"invalid"}',
    );

    const fallbackCabHtml = renderWithProviders(<CabinetPage />, ['/cabinet']);
    expect(fallbackCabHtml).toContain('auth-required-gate');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).pollutedDraft).toBeUndefined();

    // Verify XSS payload inside circuit title and node label renders strictly escaped as text
    localStorage.setItem(
      'logicforge_user',
      JSON.stringify({
        id: 'u-xss-1',
        email: 'xss@logicforge.eda',
        username: 'tester_xss',
        fullName: '<script>alert("u")</script>',
        role: 'STUDENT',
        createdAt: new Date().toISOString(),
      }),
    );
    const xssDoc = structuredClone(PRESET_CIRCUITS[0].document);
    xssDoc.metadata.title = '<img src=x onerror=alert(1)>';
    xssDoc.nodes[0].properties.label = '<b>SW_XSS</b>';
    localStorage.setItem('logicforge_circuit_draft_v2_preset-full-adder', JSON.stringify(xssDoc));

    const xssReportHtml = renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportsPage />} />
      </Routes>,
      ['/reports/preset-full-adder'],
    );
    expect(xssReportHtml).not.toContain('<img src=x');
    expect(xssReportHtml).not.toContain('<script>alert');
    expect(xssReportHtml).toContain('&lt;img src=x onerror=alert(1)&gt;');

    // Verify JSON import sanitizer strips unsafe keys & rejects bad pins
    expect(() =>
      sanitizeAndValidateCircuitDocument(
        JSON.stringify({
          ...xssDoc,
          edges: [
            {
              id: 'bad_e',
              sourceNodeId: 'missing_node',
              sourcePinId: 'OUT',
              targetNodeId: xssDoc.nodes[1].id,
              targetPinId: 'A',
              signalState: '0',
            },
          ],
        }),
      ),
    ).toThrow(CircuitImportValidationError);
  });

  it('separates parallel net corridors, computes magnetic snaps/guides, and keeps STANDARD_COMPONENT_CATALOG consistent', () => {
    expect(STANDARD_COMPONENT_CATALOG.length).toBe(COMPONENT_CATALOG.length - 1);
    expect(STANDARD_COMPONENT_CATALOG.every((item) => item.type !== 'CUSTOM_IC')).toBe(true);

    const sw1 = createNodeFromCatalog('INPUT_SWITCH', 'w_sw1', { x: 40, y: 40 }, 'A');
    const sw2 = createNodeFromCatalog('INPUT_SWITCH', 'w_sw2', { x: 40, y: 120 }, 'B');
    const led1 = createNodeFromCatalog('LED', 'w_led1', { x: 260, y: 80 }, 'Y1');
    const led2 = createNodeFromCatalog('LED', 'w_led2', { x: 260, y: 160 }, 'Y2');

    // Magnetic snap aligns LED pin Y (offset 24) to switch output pin Y (40 + 24 = 64 => y=40)
    const snapped = snapNodePosition(led1, 261, 44, [sw1, sw2, led1], [], true);
    expect(snapped).toEqual({ x: 264, y: 40 });

    const centerAlignedGuides = computeAlignmentGuides(
      createNodeFromCatalog('LED', 'w_probe', { x: 42, y: 200 }, 'P'),
      [sw1, sw2, led1],
    );
    expect(centerAlignedGuides.vertical).toBe(96);

    const edgeAlignedGuides = computeAlignmentGuides(
      createNodeFromCatalog('CONST_HIGH', 'w_vcc', { x: 42, y: 200 }, 'VCC'),
      [sw1, sw2, led1],
    );
    expect(edgeAlignedGuides.vertical).toBe(40);

    // Parallel nets crossing a shared corridor get distinct vertical midX coordinates
    const { routedEdges } = computeRoutedNets(
      [sw1, sw2, led1, led2],
      [
        {
          id: 'pe1',
          sourceNodeId: 'w_sw1',
          sourcePinId: 'OUT',
          targetNodeId: 'w_led1',
          targetPinId: 'IN',
          signalState: '1',
        },
        {
          id: 'pe2',
          sourceNodeId: 'w_sw2',
          sourcePinId: 'OUT',
          targetNodeId: 'w_led2',
          targetPinId: 'IN',
          signalState: '0',
        },
      ],
      { pe1: '1', pe2: '0' },
    );
    expect(routedEdges).toHaveLength(2);
    expect(routedEdges[0].route.points[1].x).not.toBe(routedEdges[1].route.points[1].x);
  });
});
