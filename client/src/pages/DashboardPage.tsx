import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Cpu,
  FileSpreadsheet,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from 'lucide-react';
import {
  COMPONENT_CATALOG,
  CircuitSimulator,
  PRESET_CIRCUITS,
  analyzeCircuitGraph,
  type CircuitDocument,
  type CircuitNodeData,
  type LogicState,
  type SimulationSnapshot,
  type WaveformSample,
} from '@logicforge/shared-types';
import { CircuitCanvas } from '../components/circuit/CircuitCanvas';
import { Button, getButtonClassName } from '../components/ui/Button';
import { LogicBadge } from '../components/ui/LogicBadge';
import { MathVar } from '../components/ui/MathFormula';
import { useWorkspace } from '../context/WorkspaceContext';

const SHOWCASE_PRESETS = [
  {
    id: 'preset-ne555-jk',
    shortTitle: 'Генератор NE555 + JK-тригер',
    badge: 'АВТОКОЛИВНИЙ ТАЙМЕР',
    description:
      'Тактовий генератор NE555 формує меандр, а двокаскадний JK-тригер у режимі T-тригера (J=1, K=1) ділить частоту на 2 та 4.',
  },
  {
    id: 'preset-full-adder',
    shortTitle: '1-розрядний повний суматор',
    badge: 'КОМБІНАЦІЙНА АРИФМЕТИКА',
    description:
      'Автоматичний перебір двійкових векторів A, B, Cin (000 → 111) із обчисленням суми SUM та переносу Cout у реальному часі.',
  },
  {
    id: 'preset-counter-hex',
    shortTitle: '4-розрядний лічильник + HEX',
    badge: 'ДИНАМІЧНА ІНДИКАЦІЯ',
    description:
      'Синхронний 4-бітний лічильник 74HC161 у парі з дешифратором 7-сегментного індикатора циклічно відображає коди 0..F.',
  },
  {
    id: 'preset-mp-alu',
    shortTitle: '4-розрядний АЛП',
    badge: 'АРИФМЕТИКО-ЛОГІЧНИЙ ВУЗОЛ',
    description:
      'Обчислення операцій A+B, A−B, A∧B, A⊕B над 4-бітними шинами з формуванням прапорців переповнення Cout та нуля ZERO.',
  },
] as const;

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectCircuit, setIsSimulationRunning } = useWorkspace();

  const [showcasePresetId, setShowcasePresetId] = useState<string>('preset-ne555-jk');
  const [heroDoc, setHeroDoc] = useState<CircuitDocument>(() => {
    const found = PRESET_CIRCUITS.find((p) => p.id === 'preset-ne555-jk') ?? PRESET_CIRCUITS[0];
    return JSON.parse(JSON.stringify(found.document)) as CircuitDocument;
  });

  const heroSimRef = useRef<CircuitSimulator>(new CircuitSimulator(heroDoc));
  const heroDocRef = useRef<CircuitDocument>(heroDoc);
  heroDocRef.current = heroDoc;
  const vectorStepRef = useRef<number>(0);

  const [heroSnap, setHeroSnap] = useState<SimulationSnapshot>(() =>
    heroSimRef.current.advanceBy(200),
  );
  const [heroWaves, setHeroWaves] = useState<WaveformSample[]>(() => [
    ...heroSimRef.current.getWaveformHistory(),
  ]);
  const [heroSelectedNodeId, setHeroSelectedNodeId] = useState<string | null>('n_555');
  const [heroDraggingNodePos, setHeroDraggingNodePos] = useState<{
    nodeId: string;
    position: { x: number; y: number };
  } | null>(null);
  const [heroAutoPlay, setHeroAutoPlay] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionPrefChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setHeroAutoPlay(false);
      }
    };
    mq.addEventListener?.('change', onMotionPrefChange);
    return () => mq.removeEventListener?.('change', onMotionPrefChange);
  }, []);

  const handleResetShowcase = () => {
    setHeroAutoPlay(false);
    const found = PRESET_CIRCUITS.find((p) => p.id === showcasePresetId) ?? PRESET_CIRCUITS[0];
    const cloned = JSON.parse(JSON.stringify(found.document)) as CircuitDocument;
    setHeroDoc(cloned);
    heroDocRef.current = cloned;
    vectorStepRef.current = 0;
    heroSimRef.current.loadCircuit(cloned);
    heroSimRef.current.clearWaveformHistory();
    setHeroSnap(heroSimRef.current.getSnapshot());
    setHeroWaves([]);
  };

  const switchShowcasePreset = (presetId: string) => {
    const found = PRESET_CIRCUITS.find((p) => p.id === presetId) ?? PRESET_CIRCUITS[0];
    const cloned = JSON.parse(JSON.stringify(found.document)) as CircuitDocument;
    setShowcasePresetId(found.id);
    setHeroDoc(cloned);
    heroDocRef.current = cloned;
    vectorStepRef.current = 0;
    heroSimRef.current.loadCircuit(cloned);
    const hasPeriodic = cloned.nodes.some((n) => n.type === 'CLOCK' || n.type === 'TIMER_555');
    const snap = hasPeriodic
      ? heroSimRef.current.advanceBy(200)
      : heroSimRef.current.settleCombinational(300);
    setHeroSnap(snap);
    setHeroWaves([...heroSimRef.current.getWaveformHistory()]);
    setHeroSelectedNodeId(cloned.nodes[0]?.id ?? null);
  };

  const stepShowcaseSimulation = useCallback(() => {
    const curDoc = heroDocRef.current;
    const hasPeriodic = curDoc.nodes.some((n) => n.type === 'CLOCK' || n.type === 'TIMER_555');

    if (!hasPeriodic) {
      const switches = curDoc.nodes.filter((n) => n.type === 'INPUT_SWITCH');
      const dipNodes = curDoc.nodes.filter((n) => n.type === 'DIP_SWITCH_4');

      if (switches.length > 0) {
        vectorStepRef.current += 1;
        const vec = vectorStepRef.current;
        const nextMap = new Map<string, LogicState>();
        switches.forEach((sw, idx) => {
          const bit: LogicState = ((vec >> idx) & 1) === 1 ? '1' : '0';
          heroSimRef.current.setInputState(sw.id, bit);
          nextMap.set(sw.id, bit);
        });
        setHeroDoc((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            nextMap.has(n.id)
              ? { ...n, properties: { ...n.properties, switchState: nextMap.get(n.id)! } }
              : n,
          ),
        }));
      } else if (dipNodes.length > 0) {
        vectorStepRef.current += 1;
        const vec = vectorStepRef.current;
        const dip = dipNodes[0];
        const nextTuple: [LogicState, LogicState, LogicState, LogicState] = [
          (vec & 1) === 1 ? '1' : '0',
          ((vec >> 1) & 1) === 1 ? '1' : '0',
          ((vec >> 2) & 1) === 1 ? '1' : '0',
          ((vec >> 3) & 1) === 1 ? '1' : '0',
        ];
        nextTuple.forEach((st, bitIdx) => {
          heroSimRef.current.setDipSwitchBit(dip.id, bitIdx, st);
        });
        setHeroDoc((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === dip.id
              ? { ...n, properties: { ...n.properties, dipSwitchStates: nextTuple } }
              : n,
          ),
        }));
      }
    }

    const snap = heroSimRef.current.advanceBy(25);
    setHeroSnap(snap);
    setHeroWaves([...heroSimRef.current.getWaveformHistory()]);
  }, []);

  useEffect(() => {
    if (!heroAutoPlay) return;
    const timer = window.setInterval(() => {
      stepShowcaseSimulation();
    }, 340);
    return () => window.clearInterval(timer);
  }, [heroAutoPlay, stepShowcaseSimulation]);

  const handleHeroToggleSwitch = (node: CircuitNodeData, cycleTriState: boolean) => {
    const nextVal = heroSimRef.current.toggleInputSwitch(node.id, cycleTriState);
    const snap = heroSimRef.current.settleCombinational(300);
    setHeroSnap(snap);
    setHeroWaves([...heroSimRef.current.getWaveformHistory()]);
    setHeroDoc((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === node.id ? { ...n, properties: { ...n.properties, switchState: nextVal } } : n,
      ),
    }));
  };

  const handleHeroToggleDipBit = (node: CircuitNodeData, bitIndex: number) => {
    const nextVal = heroSimRef.current.toggleDipSwitchBit(node.id, bitIndex);
    const snap = heroSimRef.current.settleCombinational(300);
    setHeroSnap(snap);
    setHeroWaves([...heroSimRef.current.getWaveformHistory()]);
    setHeroDoc((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id !== node.id) return n;
        const tuple: [typeof nextVal, typeof nextVal, typeof nextVal, typeof nextVal] = [
          ...(n.properties.dipSwitchStates ?? ['0', '0', '0', '0']),
        ] as [typeof nextVal, typeof nextVal, typeof nextVal, typeof nextVal];
        tuple[bitIndex] = nextVal;
        return {
          ...n,
          properties: {
            ...n.properties,
            dipSwitchStates: tuple,
          },
        };
      }),
    }));
  };

  const heroCanvasNodes = useMemo(
    () =>
      heroDraggingNodePos
        ? heroDoc.nodes.map((n) =>
            n.id === heroDraggingNodePos.nodeId
              ? { ...n, position: heroDraggingNodePos.position }
              : n,
          )
        : heroDoc.nodes,
    [heroDoc.nodes, heroDraggingNodePos],
  );

  const heroTiming = useMemo(() => analyzeCircuitGraph(heroDoc), [heroDoc]);
  const activeShowcaseMeta =
    SHOWCASE_PRESETS.find((p) => p.id === showcasePresetId) ?? SHOWCASE_PRESETS[0];

  const showcaseInputs = useMemo(
    () => heroDoc.nodes.filter((n) => n.type === 'INPUT_SWITCH'),
    [heroDoc.nodes],
  );
  const showcaseOutputs = useMemo(
    () => heroDoc.nodes.filter((n) => n.type === 'LED' || n.type === 'PROBE'),
    [heroDoc.nodes],
  );

  const heroWaveSignals = useMemo(() => {
    const latest = heroWaves[heroWaves.length - 1];
    if (!latest) return [];
    return Object.keys(latest.signals).slice(0, 4);
  }, [heroWaves]);

  const recentHeroSamples = useMemo(() => heroWaves.slice(-26), [heroWaves]);

  const handleOpenInFullEditor = async (circuitId: string, startRunning = false) => {
    await selectCircuit(circuitId);
    if (startRunning) {
      setIsSimulationRunning(true);
    }
    navigate(`/editor/${circuitId}`);
  };

  return (
    <div className="win95-desktop-bg min-h-screen pb-8">
      <div className="mx-auto max-w-[1680px] px-3 sm:px-4 py-3 space-y-3">
        {/* Компактний однорядковий заголовок головної сторінки */}
        <header className="win95-outset bg-win-bg px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="h-4 w-4 shrink-0 text-win-navy" aria-hidden="true" />
            <h1 className="text-sm font-bold text-win-ink truncate">
              Інтерактивний стенд моделювання цифрових схем
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-win-ink">
            <span>
              t = <strong className="text-win-navy">{heroSnap.currentTimeNs} нс</strong>
            </span>
            <span className="text-win-muted">•</span>
            <span className="inline-flex items-center gap-1">
              <MathVar sym="T" sub="crit" />: <strong>{heroTiming.criticalPathDelayNs} нс</strong>
            </span>
            <span className="text-win-muted">•</span>
            <span className="inline-flex items-center gap-1">
              <MathVar sym="f" sub="max" />: <strong>{heroTiming.maxClockFrequencyMhz} МГц</strong>
            </span>
          </div>
        </header>

        {/* Основний інтерактивний стенд з єдиною компактною панеллю інструментів */}
        <section className="win95-window overflow-hidden">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2 border-b border-win-shadow bg-win-bg px-2.5 py-1.5">
            <div
              className="flex flex-wrap items-center gap-1"
              role="tablist"
              aria-label="Демонстраційні схеми"
            >
              {SHOWCASE_PRESETS.map((item) => {
                const active = showcasePresetId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-testid={`showcase-preset-${item.id}`}
                    onClick={() => switchShowcasePreset(item.id)}
                    className={`min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 px-2.5 py-1 text-xs font-bold touch-manipulation focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black ${
                      active
                        ? 'win95-button-pressed bg-win-surface text-win-ink'
                        : 'win95-button text-win-ink'
                    }`}
                  >
                    {item.shortTitle}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                data-testid="showcase-toggle-play"
                variant={heroAutoPlay ? 'success' : 'secondary'}
                size="xs"
                onClick={() => setHeroAutoPlay((v) => !v)}
                icon={heroAutoPlay ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              >
                {heroAutoPlay ? 'Пауза' : 'Старт'}
              </Button>
              <Button
                data-testid="showcase-step"
                variant="secondary"
                size="xs"
                onClick={() => {
                  setHeroAutoPlay(false);
                  stepShowcaseSimulation();
                }}
                icon={<SkipForward className="h-3 w-3" />}
              >
                Крок
              </Button>
              <Button
                data-testid="showcase-reset"
                variant="outline"
                size="xs"
                onClick={handleResetShowcase}
                icon={<RotateCcw className="h-3 w-3" />}
              >
                Скинути
              </Button>
              <Button
                data-testid="showcase-open-editor"
                variant="primary"
                size="xs"
                onClick={() => void handleOpenInFullEditor(showcasePresetId, true)}
                icon={<ArrowRight className="h-3.5 w-3.5" />}
              >
                Відкрити в редакторі →
              </Button>
            </div>
          </div>

          {/* Основне вікно демонстрації: Схемотехнічне полотно + Жива панель станів і осцилограми */}
          <div className="grid lg:grid-cols-[1fr,345px] bg-win-bg p-1.5 gap-2">
            {/* Ліва частина: Інтерактивне полотно схеми, що працює в реальному часі */}
            <div className="flex flex-col min-w-0">
              <div className="h-[360px] sm:h-[440px] w-full">
                <CircuitCanvas
                  nodes={heroCanvasNodes}
                  edges={heroDoc.edges}
                  viewport={heroDoc.viewport}
                  nodePinStates={heroSnap.nodePinStates}
                  edgeStates={heroSnap.edgeStates}
                  selectedNodeId={heroSelectedNodeId}
                  selectedEdgeId={null}
                  onSelectNode={setHeroSelectedNodeId}
                  onSelectEdge={() => {}}
                  onMoveNode={(nodeId, pos) => setHeroDraggingNodePos({ nodeId, position: pos })}
                  onMoveNodeEnd={(nodeId, pos) => {
                    setHeroDraggingNodePos(null);
                    setHeroDoc((prev) => ({
                      ...prev,
                      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, position: pos } : n)),
                    }));
                  }}
                  onToggleSwitch={handleHeroToggleSwitch}
                  onToggleDipBit={handleHeroToggleDipBit}
                  onChangeViewport={(patch) =>
                    setHeroDoc((prev) => ({
                      ...prev,
                      viewport: { ...prev.viewport, ...patch },
                    }))
                  }
                />
              </div>

              {/* Нижня смуга інтерактивних входів/виходів у вдавлених комірках статусу Win95 */}
              <div className="win95-statusbar-cell mt-1 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-win-navy">
                    {activeShowcaseMeta.badge}:
                  </span>
                  <span className="text-win-ink">{activeShowcaseMeta.description}</span>
                </div>

                {showcaseInputs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-win-ink">Входи:</span>
                    {showcaseInputs.map((sw) => {
                      const val = sw.properties.switchState ?? '0';
                      return (
                        <button
                          key={sw.id}
                          type="button"
                          onClick={() => handleHeroToggleSwitch(sw, false)}
                          className={`inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center gap-1 px-2.5 py-1 font-mono text-[11px] font-bold touch-manipulation ${
                            val === '1'
                              ? 'win95-button-pressed bg-win-highlight text-logic-high border border-logic-high-border'
                              : 'win95-button text-win-ink'
                          }`}
                        >
                          <span>{sw.properties.label}:</span>
                          <span>{val}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Права колонка стенда: Живі виходи, часові діаграми сигналів та швидкий старт */}
            <div className="win95-outset flex flex-col justify-between p-3 space-y-3 min-w-0">
              <div className="space-y-2.5">
                <div className="win95-statusbar-cell px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-xs font-bold text-win-ink">
                      {heroDoc.metadata.title}
                    </h2>
                    <span className="shrink-0 font-mono text-[11px] font-bold text-win-navy">
                      t = {heroSnap.currentTimeNs} нс
                    </span>
                  </div>
                </div>

                {showcaseOutputs.length > 0 && (
                  <div className="win95-outset p-2 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase text-win-ink">
                      Вихідні індикатори схеми:
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {showcaseOutputs.map((outNode) => {
                        const pinMap = heroSnap.nodePinStates[outNode.id] ?? {};
                        const state: LogicState = pinMap.IN ?? Object.values(pinMap)[0] ?? '0';
                        return (
                          <div
                            key={outNode.id}
                            className="win95-statusbar-cell flex items-center justify-between px-2 py-1 font-mono text-xs"
                          >
                            <span className="truncate font-bold text-win-ink">
                              {outNode.properties.label}
                            </span>
                            <LogicBadge state={state} compact />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Живий 4-канальний осцилограф сигналів */}
                <div className="win95-outset p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-win-ink">
                      <Activity className="h-3 w-3 text-win-navy" />
                      Часові діаграми (Осцилограф)
                    </span>
                    <span className="font-mono text-[10px] font-bold text-win-teal">4 канали</span>
                  </div>

                  {heroWaveSignals.length === 0 ? (
                    <div className="py-4 text-center text-[11px] text-win-muted">
                      Очікування вибірок сигналів...
                    </div>
                  ) : (
                    <div className="space-y-1.5" data-testid="showcase-oscilloscope">
                      {heroWaveSignals.map((sigName) => {
                        const lastState =
                          recentHeroSamples[recentHeroSamples.length - 1]?.signals[sigName] ?? '0';
                        const points: string[] = [];
                        const w = 190;
                        const h = 24;
                        const minT = recentHeroSamples[0]?.timeNs ?? 0;
                        const maxT =
                          recentHeroSamples[recentHeroSamples.length - 1]?.timeNs ?? minT;
                        const spanT = Math.max(10, maxT - minT);
                        recentHeroSamples.forEach((sample, idx) => {
                          const st = sample.signals[sigName] ?? '0';
                          const y = st === '1' ? 4 : st === '0' ? h - 4 : h / 2;
                          const x = Math.round(((sample.timeNs - minT) / spanT) * w);
                          if (idx > 0) {
                            const prevSt = recentHeroSamples[idx - 1].signals[sigName] ?? '0';
                            const prevY = prevSt === '1' ? 4 : prevSt === '0' ? h - 4 : h / 2;
                            points.push(`${x},${prevY}`);
                          }
                          points.push(`${x},${y}`);
                        });
                        if (recentHeroSamples.length > 0) {
                          const lastY = lastState === '1' ? 4 : lastState === '0' ? h - 4 : h / 2;
                          points.push(`${w},${lastY}`);
                        }

                        return (
                          <div
                            key={sigName}
                            className="win95-statusbar-cell grid grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1"
                          >
                            <div
                              title={sigName}
                              className="truncate font-mono text-[10.5px] font-bold text-win-ink"
                            >
                              {sigName}
                            </div>
                            <svg
                              viewBox={`0 0 ${w} ${h}`}
                              preserveAspectRatio="none"
                              data-testid="showcase-wave-svg"
                              className="win95-inset h-6 w-full min-w-0 bg-win-canvas"
                            >
                              <line
                                x1={0}
                                y1={h / 2}
                                x2={w}
                                y2={h / 2}
                                stroke="#e5e8ef"
                                strokeDasharray="2 2"
                              />
                              {points.length > 1 && (
                                <polyline
                                  fill="none"
                                  stroke="#000000"
                                  strokeWidth={1.8}
                                  points={points.join(' ')}
                                />
                              )}
                            </svg>
                            <LogicBadge state={lastState} compact />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="win95-statusbar-cell flex items-center justify-between px-2 py-1 font-mono text-[11px] text-win-ink border-t border-win-shadow">
                <span>Оброблено подій:</span>
                <strong>{heroSnap.processedEventsCount}</strong>
              </div>
            </div>
          </div>
        </section>

        {/* Триколоночний блок швидкого старту */}
        <section className="grid gap-3 md:grid-cols-3" aria-label="Швидкий старт">
          <div className="win95-outset bg-win-bg p-3 flex flex-col justify-between gap-2.5">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-win-ink">
                <Cpu className="h-4 w-4 text-win-navy shrink-0" aria-hidden="true" />
                <h2>Схемотехнічний редактор</h2>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-win-muted">
                Ортогональне трасування з’єднань, покрокова дискретно-подійна симуляція, змінювані
                панелі та вбудований логічний аналізатор.
              </p>
            </div>
            <Link
              to="/editor"
              className={getButtonClassName('secondary', 'sm', 'w-full justify-between')}
            >
              <span>Відкрити редактор</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="win95-outset bg-win-bg p-3 flex flex-col justify-between gap-2.5">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-win-ink">
                <BookOpen className="h-4 w-4 text-win-navy shrink-0" aria-hidden="true" />
                <h2>Бібліотека {COMPONENT_CATALOG.length - 1} ІМС</h2>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-win-muted">
                Довідник логічних вентилів, тригерів, регістрів, таймера NE555 та вузлів з
                інтерактивним тестуванням і таблицями істинності.
              </p>
            </div>
            <Link
              to="/library"
              className={getButtonClassName('secondary', 'sm', 'w-full justify-between')}
            >
              <span>Переглянути каталог</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="win95-outset bg-win-bg p-3 flex flex-col justify-between gap-2.5">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-win-ink">
                <FileSpreadsheet className="h-4 w-4 text-win-navy shrink-0" aria-hidden="true" />
                <h2>Інженерні звіти та ДДНФ</h2>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-win-muted">
                Автоматичний синтез канонічної ДДНФ, відомість BOM, список кіл Netlist, статичний
                часовий аналіз <MathVar sym="T" sub="crit" /> та експорт у CSV/PDF.
              </p>
            </div>
            <Link
              to="/reports"
              className={getButtonClassName('secondary', 'sm', 'w-full justify-between')}
            >
              <span>Відкрити звіти</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};
