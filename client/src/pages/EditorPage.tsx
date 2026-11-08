import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Box,
  Download,
  FileSpreadsheet,
  History,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  SkipForward,
  Table2,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  COMPONENT_CATALOG,
  CircuitSimulator,
  PRESET_CIRCUITS,
  analyzeCircuitGraph,
  buildFullAdderPreset,
  createNodeFromCatalog,
  synthesizeTruthTable,
  type CircuitDocument,
  type CircuitNodeData,
  type ComponentCategory,
  type ComponentType,
  type CustomICDefinition,
  type NodeProperties,
  type SimulationSnapshot,
  type TruthTableResult,
  type WaveformSample,
} from '@logicforge/shared-types';
import { CircuitCanvas } from '../components/circuit/CircuitCanvas';
import { PropertyInspector } from '../components/circuit/PropertyInspector';
import { WaveformPanel } from '../components/circuit/WaveformPanel';
import { Button } from '../components/ui/Button';
import { LogicBadge } from '../components/ui/LogicBadge';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const AUTOSAVE_KEY = 'logicforge_editor_autosave_v1';

export const EditorPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user, loginDemo } = useAuth();

  const [doc, setDoc] = useState<CircuitDocument>(() => {
    if (!id) {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved) as CircuitDocument;
        } catch {
          // ignore
        }
      }
    }
    return buildFullAdderPreset();
  });

  const [circuitDbId, setCircuitDbId] = useState<string | null>(id ?? null);
  const [customIcs, setCustomIcs] = useState<CustomICDefinition[]>([]);
  const [undoStack, setUndoStack] = useState<CircuitDocument[]>([]);
  const [redoStack, setRedoStack] = useState<CircuitDocument[]>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [paletteCategory, setPaletteCategory] = useState<ComponentCategory | 'ALL'>('ALL');

  const simRef = useRef<CircuitSimulator>(new CircuitSimulator(doc));
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() => simRef.current.getSnapshot());
  const [waveforms, setWaveforms] = useState<WaveformSample[]>(() =>
    simRef.current.getWaveformHistory(),
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [stepDeltaNs, setStepDeltaNs] = useState<number>(25);

  // Стани модальних вікон
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('Оновлення топології та параметрів затримок');
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [truthModalOpen, setTruthModalOpen] = useState(false);
  const [truthTable, setTruthTable] = useState<TruthTableResult | null>(null);

  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');

  const [customIcModalOpen, setCustomIcModalOpen] = useState(false);
  const [icName, setIcName] = useState('Користувацький логічний модуль');
  const [icCode, setIcCode] = useState('IC_USER1');
  const [icDelay, setIcDelay] = useState(16);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3200);
  };

  // Завантаження користувацьких ІМС
  useEffect(() => {
    api
      .listCustomComponents()
      .then((res) => setCustomIcs(res.customComponents))
      .catch(() => {});
  }, []);

  // Завантаження схеми за ID з API або пресетів
  useEffect(() => {
    if (!id) {
      setCircuitDbId(null);
      return;
    }
    setCircuitDbId(id);
    api
      .getCircuit(id)
      .then((res) => {
        setDoc(res.circuit.schemaJson);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      })
      .catch(() => {
        const preset = PRESET_CIRCUITS.find((p) => p.id === id || p.slug === id);
        if (preset) {
          setDoc(JSON.parse(JSON.stringify(preset.document)) as CircuitDocument);
        }
      });
  }, [id]);

  // Переініціалізація ядра симуляції при зміні структури схеми або кастомних ІМС
  useEffect(() => {
    const mergedDoc: CircuitDocument = {
      ...doc,
      customDefinitions: customIcs,
    };
    simRef.current.loadCircuit(mergedDoc);
    const snap = simRef.current.settleCombinational(400);
    setSnapshot(snap);
    setWaveforms([...simRef.current.getWaveformHistory()]);
    if (!id) {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
    }
  }, [doc, customIcs, id]);

  // Цикл реального часу при запущеному тактовому генераторі
  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => {
      const nextSnap = simRef.current.advanceBy(stepDeltaNs);
      setSnapshot(nextSnap);
      setWaveforms([...simRef.current.getWaveformHistory()]);
    }, 120);
    return () => window.clearInterval(timer);
  }, [isRunning, stepDeltaNs]);

  const pushHistory = useCallback((updater: (prev: CircuitDocument) => CircuitDocument) => {
    setDoc((prev) => {
      setUndoStack((u) => [...u.slice(-24), prev]);
      setRedoStack([]);
      const next = updater(prev);
      return {
        ...next,
        metadata: {
          ...next.metadata,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const handleUndo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const previous = u[u.length - 1];
      setRedoStack((r) => [doc, ...r]);
      setDoc(previous);
      return u.slice(0, -1);
    });
  }, [doc]);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const [nextDoc, ...rest] = r;
      setUndoStack((u) => [...u, doc]);
      setDoc(nextDoc);
      return rest;
    });
  }, [doc]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedNodeId) {
      pushHistory((prev) => ({
        ...prev,
        nodes: prev.nodes.filter((n) => n.id !== selectedNodeId),
        edges: prev.edges.filter(
          (e) => e.sourceNodeId !== selectedNodeId && e.targetNodeId !== selectedNodeId,
        ),
      }));
      setSelectedNodeId(null);
    } else if (selectedEdgeId) {
      pushHistory((prev) => ({
        ...prev,
        edges: prev.edges.filter((e) => e.id !== selectedEdgeId),
      }));
      setSelectedEdgeId(null);
    }
  }, [pushHistory, selectedEdgeId, selectedNodeId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDeleteSelected, handleRedo, handleUndo]);

  const timingReport = useMemo(() => analyzeCircuitGraph(doc), [doc]);

  const selectedNode = useMemo(
    () => doc.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [doc.nodes, selectedNodeId],
  );

  const addNodeToCanvas = (
    type: ComponentType,
    pos?: { x: number; y: number },
    customIcId?: string,
  ) => {
    const icDef = customIcId ? customIcs.find((c) => c.id === customIcId) : undefined;
    const countOfType = doc.nodes.filter((n) => n.type === type).length + 1;
    const idStr = `n_${type.toLowerCase()}_${Date.now().toString(36).slice(-4)}`;
    const targetPos = pos ?? {
      x: Math.round((180 + (doc.nodes.length % 5) * 96) / 16) * 16,
      y: Math.round((100 + (doc.nodes.length % 4) * 80) / 16) * 16,
    };
    const newNode = createNodeFromCatalog(
      type,
      idStr,
      targetPos,
      icDef ? `${icDef.code}_${countOfType}` : undefined,
      icDef,
    );

    pushHistory((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setSelectedNodeId(newNode.id);
  };

  const handleMoveNode = (nodeId: string, pos: { x: number; y: number }) => {
    setDoc((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, position: pos } : n)),
    }));
  };

  const handleConnectPins = (
    sourceNodeId: string,
    sourcePinId: string,
    targetNodeId: string,
    targetPinId: string,
  ) => {
    pushHistory((prev) => {
      const duplicate = prev.edges.some(
        (e) =>
          e.sourceNodeId === sourceNodeId &&
          e.sourcePinId === sourcePinId &&
          e.targetNodeId === targetNodeId &&
          e.targetPinId === targetPinId,
      );
      if (duplicate) return prev;
      return {
        ...prev,
        edges: [
          ...prev.edges,
          {
            id: `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
            sourceNodeId,
            sourcePinId,
            targetNodeId,
            targetPinId,
            signalState: 'Z',
          },
        ],
      };
    });
  };

  const handleToggleSwitch = (node: CircuitNodeData, cycleTriState: boolean) => {
    const nextVal = simRef.current.toggleInputSwitch(node.id, cycleTriState);
    const snap = simRef.current.settleCombinational(300);
    setSnapshot(snap);
    setWaveforms([...simRef.current.getWaveformHistory()]);
    setDoc((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === node.id ? { ...n, properties: { ...n.properties, switchState: nextVal } } : n,
      ),
    }));
  };

  const handleChangeNodeProperties = (nodeId: string, patch: Partial<NodeProperties>) => {
    pushHistory((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId ? { ...n, properties: { ...n.properties, ...patch } } : n,
      ),
    }));
  };

  const handleSingleStep = () => {
    setIsRunning(false);
    const snap = simRef.current.stepSingleEvent();
    setSnapshot(snap);
    setWaveforms([...simRef.current.getWaveformHistory()]);
  };

  const handleResetSimulation = () => {
    setIsRunning(false);
    simRef.current.reset();
    const snap = simRef.current.settleCombinational(300);
    setSnapshot(snap);
    setWaveforms([...simRef.current.getWaveformHistory()]);
  };

  const handleOpenTruthTable = () => {
    const result = synthesizeTruthTable({
      ...doc,
      customDefinitions: customIcs,
    });
    setTruthTable(result);
    setTruthModalOpen(true);
  };

  const handleSaveCircuit = async () => {
    setSaving(true);
    try {
      if (!user) {
        await loginDemo();
      }
      const payload = {
        title: doc.metadata.title,
        description: doc.metadata.description,
        category: doc.metadata.category,
        isPublic: true,
        tags: doc.metadata.tags,
        commitMessage,
        schemaJson: doc,
      };
      if (circuitDbId && !circuitDbId.startsWith('preset-')) {
        const res = await api.updateCircuit(circuitDbId, payload);
        setCircuitDbId(res.circuit.id);
        showToast('Нову ревізію схеми успішно збережено в БД!');
      } else {
        const res = await api.createCircuit(payload);
        setCircuitDbId(res.circuit.id);
        navigate(`/editor/${res.circuit.id}`, { replace: true });
        showToast('Проєкт збережено як нову схему з ревізією v1!');
      }
      setSaveModalOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCustomIc = async () => {
    const inputs = doc.nodes.filter((n) => n.type === 'INPUT_SWITCH');
    const outputs = doc.nodes.filter((n) => n.type === 'LED' || n.type === 'PROBE');
    if (inputs.length === 0 || outputs.length === 0) {
      showToast('Для створення ІМС потрібні щонайменше 1 перемикач входу та 1 вихід (LED/PROBE).');
      return;
    }

    try {
      if (!user) {
        await loginDemo();
      }
      const res = await api.createCustomComponent({
        name: icName,
        code: icCode.toUpperCase(),
        description: `Синтезовано зі схеми «${doc.metadata.title}»`,
        propagationDelayNs: icDelay,
        isShared: true,
        inputPins: inputs.map((n, idx) => ({
          id: `IN_${idx}`,
          name: n.properties.label || `I${idx}`,
          mappedNodeId: n.id,
        })),
        outputPins: outputs.map((n, idx) => ({
          id: `OUT_${idx}`,
          name: n.properties.label || `O${idx}`,
          mappedNodeId: n.id,
        })),
        internalCircuit: {
          nodes: doc.nodes,
          edges: doc.edges,
        },
      });
      setCustomIcs((prev) => [res.customComponent, ...prev]);
      setCustomIcModalOpen(false);
      showToast(`Мікросхему ${res.customComponent.code} додано до палітри!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Помилка створення ІМС');
    }
  };

  const filteredCatalog = useMemo(
    () =>
      COMPONENT_CATALOG.filter(
        (item) =>
          item.type !== 'CUSTOM_IC' &&
          (paletteCategory === 'ALL' || item.category === paletteCategory),
      ),
    [paletteCategory],
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* Верхня панель інструментів CAD та керування симуляцією */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={doc.metadata.title}
            onChange={(e) =>
              setDoc((prev) => ({
                ...prev,
                metadata: { ...prev.metadata, title: e.target.value },
              }))
            }
            className="w-56 md:w-72 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white focus:border-emerald-500 focus:outline-none"
          />

          <select
            value=""
            onChange={(e) => {
              const chosen = PRESET_CIRCUITS.find((p) => p.id === e.target.value);
              if (chosen) {
                navigate(`/editor/${chosen.id}`);
              }
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300"
          >
            <option value="">Швидке завантаження пресету...</option>
            {PRESET_CIRCUITS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.document.metadata.title}
              </option>
            ))}
          </select>

          <div className="h-5 w-px bg-slate-800" />

          {/* Керування дискретно-подійним ядром */}
          <Button
            variant={isRunning ? 'danger' : 'primary'}
            size="sm"
            onClick={() => setIsRunning((r) => !r)}
            icon={isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          >
            {isRunning ? 'Пауза' : 'Старт CLK'}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleSingleStep}
            title="Виконати наступну подію з черги Min-Heap"
            icon={<SkipForward className="h-3.5 w-3.5" />}
          >
            Крок
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetSimulation}
            title="Скинути модельний час та внутрішні стани тригерів"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
          />

          <select
            value={stepDeltaNs}
            onChange={(e) => setStepDeltaNs(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-300"
            title="Крок модельного часу за такт візуалізації"
          >
            <option value={10}>10 нс/тік</option>
            <option value={25}>25 нс/тік</option>
            <option value={50}>50 нс/тік</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            title="Скасувати (Ctrl+Z)"
            icon={<Undo2 className="h-3.5 w-3.5" />}
          />
          <Button
            variant="ghost"
            size="xs"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            title="Повторити (Ctrl+Y)"
            icon={<Redo2 className="h-3.5 w-3.5" />}
          />
          <Button
            variant="ghost"
            size="xs"
            disabled={!selectedNodeId && !selectedEdgeId}
            onClick={handleDeleteSelected}
            title="Видалити виділений елемент або провідник (Delete)"
            icon={<Trash2 className="h-3.5 w-3.5 text-rose-400" />}
          />

          <div className="h-5 w-px bg-slate-800" />

          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenTruthTable}
            icon={<Table2 className="h-3.5 w-3.5 text-emerald-400" />}
          >
            Таблиця істинності
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCustomIcModalOpen(true)}
            icon={<Box className="h-3.5 w-3.5 text-amber-400" />}
          >
            У ІМС
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setJsonText(JSON.stringify(doc, null, 2));
              setJsonModalOpen(true);
            }}
            icon={<Download className="h-3.5 w-3.5" />}
          >
            JSON
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setSaveModalOpen(true)}
            icon={<Save className="h-3.5 w-3.5" />}
          >
            Зберегти
          </Button>

          {circuitDbId && (
            <>
              <Link to={`/revisions/${circuitDbId}`}>
                <Button variant="ghost" size="sm" icon={<History className="h-3.5 w-3.5" />} />
              </Link>
              <Link to={`/reports/${circuitDbId}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                />
              </Link>
            </>
          )}
        </div>
      </div>

      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-emerald-500/50 bg-slate-900 px-4 py-2.5 text-xs font-medium text-emerald-300 shadow-xl">
          {toastMsg}
        </div>
      )}

      {/* Основна триколонкова робоча область (CSS Grid / Flexbox) */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[260px,1fr,300px] overflow-hidden">
        {/* Ліва панель: Драг-енд-дроп палітра логічних елементів */}
        <aside className="flex flex-col border-r border-slate-800 bg-slate-900/75 overflow-hidden">
          <div className="border-b border-slate-800 p-2.5 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Палітра елементів
            </div>
            <select
              value={paletteCategory}
              onChange={(e) => setPaletteCategory(e.target.value as ComponentCategory | 'ALL')}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="ALL">Усі групи ({COMPONENT_CATALOG.length - 1})</option>
              {(Object.keys(CATEGORY_LABELS) as ComponentCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {customIcs.length > 0 && (
              <div className="space-y-1.5 pb-2 border-b border-slate-800">
                <div className="text-[10px] font-semibold uppercase text-amber-400">
                  Користувацькі підсхеми ІМС ({customIcs.length})
                </div>
                {customIcs.map((ic) => (
                  <div
                    key={ic.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/logicforge-type', 'CUSTOM_IC');
                      e.dataTransfer.setData('application/logicforge-custom-ic', ic.id);
                    }}
                    onClick={() => addNodeToCanvas('CUSTOM_IC', undefined, ic.id)}
                    className="flex cursor-grab items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs hover:border-amber-400"
                  >
                    <div>
                      <div className="font-mono font-bold text-amber-200">{ic.code}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[160px]">
                        {ic.name}
                      </div>
                    </div>
                    <Plus className="h-3.5 w-3.5 text-amber-300" />
                  </div>
                ))}
              </div>
            )}

            {filteredCatalog.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/logicforge-type', item.type);
                }}
                onClick={() => addNodeToCanvas(item.type)}
                className="group flex cursor-grab items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-2 transition-colors hover:border-emerald-500/50 hover:bg-slate-900"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                      {item.shortLabel}
                    </span>
                    <span className="truncate text-xs font-medium text-slate-200">{item.name}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    Висновків: {item.defaultPins.length} • t_pd: {item.defaultDelayNs} нс
                  </div>
                </div>
                <Plus className="h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-emerald-400" />
              </div>
            ))}
          </div>
        </aside>

        {/* Центральна колонка: Полотно + Нижня панель осцилографа */}
        <main className="flex flex-col overflow-hidden">
          {/* Рядок оперативної телеметрії ядра симуляції */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-950 px-3 py-1.5 text-[11px]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-slate-300">
                Статус:{' '}
                <strong
                  className={
                    snapshot.status === 'BUS_CONFLICT' || snapshot.status === 'OSCILLATION_GUARD'
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }
                >
                  {snapshot.status}
                </strong>
              </span>
              <span className="font-mono text-slate-400">
                Час: <strong className="text-white">{snapshot.currentTimeNs} нс</strong>
              </span>
              <span className="font-mono text-slate-400">
                Подій оброблено:{' '}
                <strong className="text-white">{snapshot.processedEventsCount}</strong>
              </span>
              {snapshot.activeConflicts.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 font-semibold text-rose-300">
                  <AlertTriangle className="h-3 w-3" />
                  Колізія шини: {snapshot.activeConflicts.join(', ')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  setDoc((prev) => ({
                    ...prev,
                    viewport: {
                      ...prev.viewport,
                      zoom: Math.max(0.4, Number((prev.viewport.zoom - 0.1).toFixed(2))),
                    },
                  }))
                }
                icon={<ZoomOut className="h-3.5 w-3.5" />}
              />
              <span className="font-mono text-[11px] text-slate-400 w-12 text-center">
                {Math.round(doc.viewport.zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  setDoc((prev) => ({
                    ...prev,
                    viewport: {
                      ...prev.viewport,
                      zoom: Math.min(2.0, Number((prev.viewport.zoom + 0.1).toFixed(2))),
                    },
                  }))
                }
                icon={<ZoomIn className="h-3.5 w-3.5" />}
              />
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <CircuitCanvas
              nodes={doc.nodes}
              edges={doc.edges}
              viewport={doc.viewport}
              nodePinStates={snapshot.nodePinStates}
              edgeStates={snapshot.edgeStates}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              onSelectNode={setSelectedNodeId}
              onSelectEdge={setSelectedEdgeId}
              onMoveNode={handleMoveNode}
              onConnectPins={handleConnectPins}
              onDropCatalogType={addNodeToCanvas}
              onToggleSwitch={handleToggleSwitch}
              onChangeViewport={(patch) =>
                setDoc((prev) => ({
                  ...prev,
                  viewport: { ...prev.viewport, ...patch },
                }))
              }
            />
          </div>

          <div className="h-44 border-t border-slate-800">
            <WaveformPanel samples={waveforms} currentTimeNs={snapshot.currentTimeNs} />
          </div>
        </main>

        {/* Права бічна панель: Статичний графовий аналіз Кана/Тар'яна + PropertyInspector */}
        <aside className="flex flex-col border-l border-slate-800 bg-slate-900/75 overflow-y-auto p-3 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Графовий та часовий аналіз (STA)
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-900 p-2">
                <div className="text-[10px] text-slate-400">Критичний шлях</div>
                <div className="font-mono font-bold text-white">
                  {timingReport.criticalPathDelayNs} нс
                </div>
              </div>
              <div className="rounded-lg bg-slate-900 p-2">
                <div className="text-[10px] text-slate-400">Макс. частота f_max</div>
                <div className="font-mono font-bold text-emerald-300">
                  {timingReport.maxClockFrequencyMhz} МГц
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 space-y-1 pt-1">
              <div>
                Топологія Кана:{' '}
                <strong className="text-slate-200">
                  {timingReport.isCombinationalAcyclic
                    ? 'Ациклічний DAG'
                    : `Цикли ЗЗ (${timingReport.stronglyConnectedCycles.length})`}
                </strong>
              </div>
              <div className="truncate" title={timingReport.criticalPathNodes.join(' -> ')}>
                Вузлів у трасі: <strong className="text-slate-200">{doc.nodes.length}</strong> |
                Ліній: <strong className="text-slate-200">{doc.edges.length}</strong>
              </div>
            </div>
          </div>

          <PropertyInspector
            node={selectedNode}
            pinStates={selectedNode ? snapshot.nodePinStates[selectedNode.id] : undefined}
            onChangeProperties={handleChangeNodeProperties}
            onDeleteNode={(nid) => {
              setSelectedNodeId(nid);
              handleDeleteSelected();
            }}
          />
        </aside>
      </div>

      {/* Модальне вікно 1: Збереження схеми та створення ревізії */}
      <Modal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title="Збереження схеми та фіксація ревізії в БД"
        subtitle="Кожне збереження автоматично записує версію у таблицю circuit_revisions (PostgreSQL)."
        maxWidthClass="max-w-lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setSaveModalOpen(false)}>
              Скасувати
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              onClick={() => void handleSaveCircuit()}
            >
              Зберегти ревізію
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Назва проєкту</label>
            <input
              type="text"
              value={doc.metadata.title}
              onChange={(e) =>
                setDoc((p) => ({ ...p, metadata: { ...p.metadata, title: e.target.value } }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Категорія</label>
            <input
              type="text"
              value={doc.metadata.category}
              onChange={(e) =>
                setDoc((p) => ({ ...p, metadata: { ...p.metadata, category: e.target.value } }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Опис схеми</label>
            <textarea
              rows={3}
              value={doc.metadata.description}
              onChange={(e) =>
                setDoc((p) => ({
                  ...p,
                  metadata: { ...p.metadata, description: e.target.value },
                }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">
              Коментар до ревізії (Commit message)
            </label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </div>
        </div>
      </Modal>

      {/* Модальне вікно 2: Автоматична таблиця істинності та ДДНФ */}
      <Modal
        open={truthModalOpen}
        onClose={() => setTruthModalOpen(false)}
        title="Автоматичний синтез таблиці істинності та канонічної ДДНФ"
        subtitle="Сформовано шляхом повного перебору 2^n комбінацій вхідних перемикачів у дискретно-подійному ядрі."
        maxWidthClass="max-w-3xl"
        footer={
          <Button variant="primary" size="sm" onClick={() => setTruthModalOpen(false)}>
            Готово
          </Button>
        }
      >
        {!truthTable || truthTable.rows.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            Для побудови таблиці істинності додайте до схеми щонайменше один вхідний перемикач
            (INPUT_SWITCH) та один вихідний індикатор (LED або PROBE).
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="text-xs font-semibold text-emerald-300">
                Синтезовані булеві вирази (ДДНФ / Canonical SOP):
              </div>
              {Object.entries(truthTable.canonicalSopExpressions).map(([outName, expr]) => (
                <div key={outName} className="font-mono text-xs text-slate-200 break-all">
                  <span className="text-emerald-400 font-bold">{outName}</span> = {expr}
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-300 font-mono">
                  <tr>
                    {truthTable.inputLabels.map((inp) => (
                      <th key={inp.nodeId} className="border-b border-slate-800 px-3 py-2">
                        {inp.label}
                      </th>
                    ))}
                    {truthTable.outputLabels.map((out) => (
                      <th
                        key={out.nodeId}
                        className="border-b border-l border-slate-800 bg-emerald-950/20 px-3 py-2 text-emerald-300"
                      >
                        {out.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {truthTable.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      {truthTable.inputLabels.map((inp) => (
                        <td key={inp.nodeId} className="px-3 py-1.5 font-mono">
                          <LogicBadge state={row.inputs[inp.label] ?? '0'} compact />
                        </td>
                      ))}
                      {truthTable.outputLabels.map((out) => (
                        <td
                          key={out.nodeId}
                          className="border-l border-slate-800/70 bg-emerald-950/10 px-3 py-1.5 font-mono"
                        >
                          <LogicBadge state={row.outputs[out.label] ?? 'Z'} compact />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Модальне вікно 3: Специфікація JSON (Імпорт / Експорт) */}
      <Modal
        open={jsonModalOpen}
        onClose={() => setJsonModalOpen(false)}
        title="Специфікація серіалізації схеми у форматі JSON"
        subtitle="Включає метадані, координати вузлів (Nodes), зміщення виводів (PinOffsets), з’єднання (Edges) та стани (LogicStates)."
        maxWidthClass="max-w-3xl"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => {
                const blob = new Blob([jsonText], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${doc.metadata.title.replace(/\s+/g, '_').toLowerCase()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Завантажити .json
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Upload className="h-3.5 w-3.5" />}
              onClick={() => {
                try {
                  const parsed = JSON.parse(jsonText) as CircuitDocument;
                  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
                    throw new Error('Некоректна структура JSON');
                  }
                  pushHistory(() => parsed);
                  setJsonModalOpen(false);
                  showToast('JSON-специфікацію успішно імпортовано на полотно!');
                } catch {
                  showToast('Помилка парсингу JSON-документа.');
                }
              }}
            >
              Застосувати JSON до полотна
            </Button>
          </>
        }
      >
        <textarea
          rows={16}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-emerald-200 focus:border-emerald-500 focus:outline-none"
        />
      </Modal>

      {/* Модальне вікно 4: Інкапсуляція поточної схеми у користувацьку ІМС */}
      <Modal
        open={customIcModalOpen}
        onClose={() => setCustomIcModalOpen(false)}
        title="Інкапсуляція схеми у користувацьку ІМС (Custom Subcircuit)"
        subtitle="Всі елементи INPUT_SWITCH стануть вхідними ніжками мікросхеми, а LED/PROBE — вихідними."
        maxWidthClass="max-w-md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCustomIcModalOpen(false)}>
              Скасувати
            </Button>
            <Button variant="primary" size="sm" onClick={() => void handleCreateCustomIc()}>
              Створити мікросхему
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Повна назва мікросхеми</label>
            <input
              type="text"
              value={icName}
              onChange={(e) => setIcName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Кодове маркування</label>
              <input
                type="text"
                value={icCode}
                onChange={(e) => setIcCode(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Затримка корпусу (нс)</label>
              <input
                type="number"
                min={1}
                value={icDelay}
                onChange={(e) => setIcDelay(Number(e.target.value) || 15)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
