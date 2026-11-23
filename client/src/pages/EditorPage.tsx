import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Box,
  Download,
  Edit2,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
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
  CircuitImportValidationError,
  CircuitSimulator,
  analyzeCircuitGraph,
  createNodeFromCatalog,
  sanitizeAndValidateCircuitDocument,
  synthesizeTruthTable,
  type CircuitDocument,
  type CircuitNodeData,
  type ComponentCategory,
  type ComponentType,
  type LogicState,
  type NodeProperties,
  type SimulationSnapshot,
  type TruthTableResult,
  type WaveformSample,
} from '@logicforge/shared-types';
import { CatalogNodePreview } from '../components/circuit/CatalogNodePreview';
import { CircuitCanvas } from '../components/circuit/CircuitCanvas';
import { PropertyInspector } from '../components/circuit/PropertyInspector';
import { WaveformPanel } from '../components/circuit/WaveformPanel';
import { Button, getButtonClassName } from '../components/ui/Button';
import { LogicBadge } from '../components/ui/LogicBadge';
import { BooleanSopFormula, MathFormula } from '../components/ui/MathFormula';
import { Modal } from '../components/ui/Modal';
import { Win95Dropdown, type Win95DropdownOption } from '../components/ui/Win95Dropdown';
import { Win95NumberInput } from '../components/ui/Win95NumberInput';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../services/api';

export const EditorPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    activeCircuitId,
    activeDocument: doc,
    circuits,
    customIcs,
    isSimulationRunning: isRunning,
    setIsSimulationRunning: setIsRunning,
    selectCircuit,
    updateActiveDocument: setDoc,
    setActiveCircuitIdAndDoc,
    updateCustomIc,
    setCustomIcs,
    refreshCircuits,
  } = useWorkspace();

  const sourceCustomIc = useMemo(() => {
    if (!doc.metadata.tags?.includes('custom-ic')) return null;
    const matchId = doc.metadata.tags.find((t) => t !== 'custom-ic');
    return matchId ? (customIcs.find((ic) => ic.id === matchId) ?? null) : null;
  }, [customIcs, doc.metadata.tags]);

  const personalCircuits = useMemo(
    () => (user ? circuits.filter((c) => !c.id.startsWith('preset-')) : []),
    [circuits, user],
  );
  const presetCircuits = useMemo(
    () => circuits.filter((c) => c.id.startsWith('preset-')),
    [circuits],
  );

  const formId = useId();
  const [undoStack, setUndoStack] = useState<CircuitDocument[]>([]);
  const [redoStack, setRedoStack] = useState<CircuitDocument[]>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [draggingNodePos, setDraggingNodePos] = useState<{
    nodeId: string;
    position: { x: number; y: number };
  } | null>(null);
  const [paletteCategory, setPaletteCategory] = useState<ComponentCategory | 'ALL'>('ALL');
  const [paletteSearch, setPaletteSearch] = useState<string>('');
  const [pendingPaletteDrag, setPendingPaletteDrag] = useState<{
    type: ComponentType;
    customIcId?: string;
  } | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [authGateFeature, setAuthGateFeature] = useState<string | null>(null);

  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(256);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(312);
  const [signalPanelHeight, setSignalPanelHeight] = useState<number>(230);
  const [showLeftPanel, setShowLeftPanel] = useState<boolean>(true);
  const [showRightPanel, setShowRightPanel] = useState<boolean>(true);
  const [showSignalPanel, setShowSignalPanel] = useState<boolean>(true);
  const [maximizedWindow, setMaximizedWindow] = useState<'workspace' | 'signals' | null>(null);
  const [mobilePanelTab, setMobilePanelTab] = useState<'workspace' | 'palette' | 'inspector'>(
    'workspace',
  );

  const editorRootRef = useRef<HTMLDivElement>(null);
  const editorBodyRef = useRef<HTMLDivElement>(null);
  const centerColumnRef = useRef<HTMLDivElement>(null);

  // Запобігаємо випадковому масштабуванню всієї вебсторінки при pinch-жестах та ctrl+wheel у межах редактора
  useEffect(() => {
    const rootEl = editorRootRef.current;
    if (!rootEl) return;

    const handleRootWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };
    const handleRootTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
      }
    };
    const blockGesture = (e: Event) => {
      e.preventDefault();
    };

    rootEl.addEventListener('wheel', handleRootWheel, { passive: false });
    rootEl.addEventListener('touchmove', handleRootTouchMove, { passive: false });
    rootEl.addEventListener('gesturestart', blockGesture, { passive: false });
    rootEl.addEventListener('gesturechange', blockGesture, { passive: false });
    return () => {
      rootEl.removeEventListener('wheel', handleRootWheel);
      rootEl.removeEventListener('touchmove', handleRootTouchMove);
      rootEl.removeEventListener('gesturestart', blockGesture);
      rootEl.removeEventListener('gesturechange', blockGesture);
    };
  }, []);

  const simRef = useRef<CircuitSimulator>(
    new CircuitSimulator({ ...doc, customDefinitions: customIcs }),
  );
  const loadedCircuitIdRef = useRef<string>(activeCircuitId);
  const autoVectorStepRef = useRef<number>(0);
  const analyzerClearedRef = useRef<boolean>(false);
  const docRef = useRef<CircuitDocument>(doc);
  docRef.current = doc;

  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() => {
    const hasPeriodic = doc.nodes.some((n) => n.type === 'CLOCK' || n.type === 'TIMER_555');
    return hasPeriodic ? simRef.current.advanceBy(240) : simRef.current.settleCombinational(300);
  });
  const [waveforms, setWaveforms] = useState<WaveformSample[]>(() => [
    ...simRef.current.getWaveformHistory(),
  ]);
  const [stepDeltaNs, setStepDeltaNs] = useState<number>(25);
  const [simSpeed, setSimSpeed] = useState<number>(1);

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

  useEffect(() => {
    if (id && id !== activeCircuitId) {
      void selectCircuit(id).then((loadedDoc) => {
        loadedCircuitIdRef.current = id;
        analyzerClearedRef.current = false;
        simRef.current.loadCircuit({ ...loadedDoc, customDefinitions: customIcs });
        const hasPeriodic = loadedDoc.nodes.some(
          (n) => n.type === 'CLOCK' || n.type === 'TIMER_555',
        );
        const snap = hasPeriodic
          ? simRef.current.advanceBy(240)
          : simRef.current.settleCombinational(300);
        setSnapshot(snap);
        setWaveforms([...simRef.current.getWaveformHistory()]);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setDraggingNodePos(null);
      });
    } else if (!id && activeCircuitId) {
      navigate(`/editor/${activeCircuitId}`, { replace: true });
    }
  }, [id, activeCircuitId, selectCircuit, navigate, customIcs]);

  useEffect(() => {
    const mergedDefsMap = new Map((doc.customDefinitions ?? []).map((d) => [d.id, d]));
    for (const ic of customIcs) {
      mergedDefsMap.set(ic.id, ic);
    }
    const mergedDoc: CircuitDocument = {
      ...doc,
      customDefinitions: Array.from(mergedDefsMap.values()),
    };

    if (loadedCircuitIdRef.current !== activeCircuitId) {
      loadedCircuitIdRef.current = activeCircuitId;
      analyzerClearedRef.current = false;
      simRef.current.loadCircuit(mergedDoc);
      const hasPeriodic = mergedDoc.nodes.some((n) => n.type === 'CLOCK' || n.type === 'TIMER_555');
      const snap = hasPeriodic
        ? simRef.current.advanceBy(240)
        : simRef.current.settleCombinational(300);
      setSnapshot(snap);
      setWaveforms([...simRef.current.getWaveformHistory()]);
    } else {
      const snap = simRef.current.syncCircuit(mergedDoc);
      setSnapshot(snap);
      if (!analyzerClearedRef.current) {
        setWaveforms([...simRef.current.getWaveformHistory()]);
      }
    }
  }, [doc, customIcs, activeCircuitId]);

  const advanceSimulationTick = useCallback(
    (deltaNs: number) => {
      analyzerClearedRef.current = false;
      const currentDoc = docRef.current;
      const hasPeriodic = currentDoc.nodes.some(
        (n) => n.type === 'CLOCK' || n.type === 'TIMER_555',
      );

      if (!hasPeriodic) {
        const switches = currentDoc.nodes.filter((n) => n.type === 'INPUT_SWITCH');
        const dipNodes = currentDoc.nodes.filter((n) => n.type === 'DIP_SWITCH_4');

        if (switches.length > 0) {
          autoVectorStepRef.current += 1;
          const vec = autoVectorStepRef.current;
          const updatedMap = new Map<string, LogicState>();
          switches.forEach((sw, idx) => {
            const bit: LogicState = ((vec >> idx) & 1) === 1 ? '1' : '0';
            simRef.current.setInputState(sw.id, bit);
            updatedMap.set(sw.id, bit);
          });
          setDoc((prev) => ({
            ...prev,
            nodes: prev.nodes.map((n) =>
              updatedMap.has(n.id)
                ? { ...n, properties: { ...n.properties, switchState: updatedMap.get(n.id)! } }
                : n,
            ),
          }));
        } else if (dipNodes.length > 0) {
          autoVectorStepRef.current += 1;
          const vec = autoVectorStepRef.current;
          const dip = dipNodes[0];
          const nextTuple: [LogicState, LogicState, LogicState, LogicState] = [
            (vec & 1) === 1 ? '1' : '0',
            ((vec >> 1) & 1) === 1 ? '1' : '0',
            ((vec >> 2) & 1) === 1 ? '1' : '0',
            ((vec >> 3) & 1) === 1 ? '1' : '0',
          ];
          nextTuple.forEach((st, bitIdx) => {
            simRef.current.setDipSwitchBit(dip.id, bitIdx, st);
          });
          setDoc((prev) => ({
            ...prev,
            nodes: prev.nodes.map((n) =>
              n.id === dip.id
                ? { ...n, properties: { ...n.properties, dipSwitchStates: nextTuple } }
                : n,
            ),
          }));
        }
      }

      const nextSnap = simRef.current.advanceBy(deltaNs);
      setSnapshot(nextSnap);
      setWaveforms([...simRef.current.getWaveformHistory()]);
    },
    [setDoc],
  );

  useEffect(() => {
    if (!isRunning) return;
    analyzerClearedRef.current = false;
    if (simRef.current.getWaveformHistory().length === 0) {
      advanceSimulationTick(stepDeltaNs);
    }
    const intervalMs = Math.max(45, Math.round(220 / simSpeed));
    const timer = window.setInterval(() => {
      advanceSimulationTick(stepDeltaNs);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isRunning, stepDeltaNs, simSpeed, advanceSimulationTick]);

  const beginPanelResize = (
    e: React.PointerEvent<HTMLDivElement>,
    onDelta: (dx: number, dy: number) => void,
  ) => {
    e.preventDefault();
    const handle = e.currentTarget;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;

    try {
      handle.setPointerCapture?.(pointerId);
    } catch {
      // Ignore synthetic pointer events where capture is unavailable
    }

    const onMove = (ev: PointerEvent) => {
      onDelta(ev.clientX - startX, ev.clientY - startY);
    };

    const cleanup = () => {
      try {
        if (handle.hasPointerCapture?.(pointerId)) {
          handle.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore release errors when capture already ended
      }
      handle.removeEventListener('lostpointercapture', cleanup);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
    };

    handle.addEventListener('lostpointercapture', cleanup);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  };

  const startResizeLeft = (e: React.PointerEvent<HTMLDivElement>) => {
    const startWidth = showLeftPanel ? leftPanelWidth : 0;
    const maxW = Math.max(360, Math.round((editorBodyRef.current?.clientWidth ?? 1200) * 0.65));
    beginPanelResize(e, (dx) => {
      const next = startWidth + dx;
      if (next < 48) {
        setShowLeftPanel(false);
      } else {
        setShowLeftPanel(true);
        setLeftPanelWidth(Math.min(maxW, Math.max(140, next)));
      }
    });
  };

  const startResizeRight = (e: React.PointerEvent<HTMLDivElement>) => {
    const startWidth = showRightPanel ? rightPanelWidth : 0;
    const maxW = Math.max(360, Math.round((editorBodyRef.current?.clientWidth ?? 1200) * 0.65));
    beginPanelResize(e, (dx) => {
      const next = startWidth - dx;
      if (next < 48) {
        setShowRightPanel(false);
      } else {
        setShowRightPanel(true);
        setRightPanelWidth(Math.min(maxW, Math.max(190, next)));
      }
    });
  };

  const startResizeSignal = (e: React.PointerEvent<HTMLDivElement>) => {
    const initialTotalH = centerColumnRef.current?.clientHeight ?? 680;
    const startHeight =
      maximizedWindow === 'signals' ? initialTotalH : showSignalPanel ? signalPanelHeight : 0;
    beginPanelResize(e, (_dx, dy) => {
      const liveTotalH = centerColumnRef.current?.clientHeight || initialTotalH;
      const next = startHeight - dy;
      if (next < 48) {
        setMaximizedWindow(null);
        setShowSignalPanel(false);
      } else if (next > liveTotalH - 56) {
        setShowSignalPanel(true);
        setMaximizedWindow('signals');
      } else {
        setMaximizedWindow(null);
        setShowSignalPanel(true);
        setSignalPanelHeight(Math.max(88, next));
      }
    });
  };

  const pushHistory = useCallback(
    (updater: (prev: CircuitDocument) => CircuitDocument) => {
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
    },
    [setDoc],
  );

  const handleUndo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const previous = u[u.length - 1];
      setRedoStack((r) => [doc, ...r]);
      setDoc(previous);
      return u.slice(0, -1);
    });
  }, [doc, setDoc]);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const [nextDoc, ...rest] = r;
      setUndoStack((u) => [...u, doc]);
      setDoc(nextDoc);
      return rest;
    });
  }, [doc, setDoc]);

  const handleDeleteNodeById = useCallback(
    (nodeIdToRemove: string) => {
      pushHistory((prev) => ({
        ...prev,
        nodes: prev.nodes.filter((n) => n.id !== nodeIdToRemove),
        edges: prev.edges.filter(
          (e) => e.sourceNodeId !== nodeIdToRemove && e.targetNodeId !== nodeIdToRemove,
        ),
      }));
      setSelectedNodeId((cur) => (cur === nodeIdToRemove ? null : cur));
    },
    [pushHistory],
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedNodeId) {
      handleDeleteNodeById(selectedNodeId);
    } else if (selectedEdgeId) {
      pushHistory((prev) => ({
        ...prev,
        edges: prev.edges.filter((e) => e.id !== selectedEdgeId),
      }));
      setSelectedEdgeId(null);
    }
  }, [handleDeleteNodeById, pushHistory, selectedEdgeId, selectedNodeId]);

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
    () => (selectedNodeId ? (doc.nodes.find((n) => n.id === selectedNodeId) ?? null) : null),
    [doc.nodes, selectedNodeId],
  );

  const addNodeToCanvas = (
    type: ComponentType,
    pos?: { x: number; y: number },
    customIcId?: string,
  ) => {
    const icDef = customIcId ? customIcs.find((c) => c.id === customIcId) : undefined;
    const countOfType = doc.nodes.filter((n) => n.type === type).length + 1;
    const meta = COMPONENT_CATALOG.find((c) => c.type === type);
    const defaultPrefix = icDef ? icDef.code : (meta?.shortLabel ?? type);
    const idStr = `n_${type.toLowerCase()}_${Date.now().toString(36).slice(-4)}`;

    let targetPos = pos;
    if (!targetPos) {
      const probeNode = createNodeFromCatalog(type, '_probe', { x: 0, y: 0 }, undefined, icDef);
      targetPos = { x: 144, y: 80 };
      outer: for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 5; col++) {
          const cx = 128 + col * 160;
          const cy = 80 + row * 112;
          const occupied = doc.nodes.some((existing) => {
            const pad = 14;
            return !(
              cx + probeNode.width + pad <= existing.position.x ||
              existing.position.x + existing.width + pad <= cx ||
              cy + probeNode.height + pad <= existing.position.y ||
              existing.position.y + existing.height + pad <= cy
            );
          });
          if (!occupied) {
            targetPos = { x: cx, y: cy };
            break outer;
          }
        }
      }
    }

    const newNode = createNodeFromCatalog(
      type,
      idStr,
      targetPos,
      `${defaultPrefix}_${countOfType}`,
      icDef,
    );

    pushHistory((prev) => {
      const existingDefs = prev.customDefinitions ?? [];
      const nextDefs =
        icDef && !existingDefs.some((d) => d.id === icDef.id)
          ? [...existingDefs, icDef]
          : existingDefs;
      return {
        ...prev,
        nodes: [...prev.nodes, newNode],
        customDefinitions: nextDefs.length > 0 ? nextDefs : prev.customDefinitions,
      };
    });
    setSelectedNodeId(newNode.id);
    setMobilePanelTab('workspace');
  };

  const handleMoveNode = useCallback((nodeId: string, pos: { x: number; y: number }) => {
    setDraggingNodePos({ nodeId, position: pos });
  }, []);

  const handleMoveNodeEnd = useCallback(
    (nodeId: string, pos: { x: number; y: number }) => {
      setDraggingNodePos(null);
      setDoc(
        (prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, position: pos } : n)),
        }),
        { persist: 'immediate' },
      );
    },
    [setDoc],
  );

  const canvasNodes = useMemo(
    () =>
      draggingNodePos
        ? doc.nodes.map((n) =>
            n.id === draggingNodePos.nodeId ? { ...n, position: draggingNodePos.position } : n,
          )
        : doc.nodes,
    [doc.nodes, draggingNodePos],
  );

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
    if (!analyzerClearedRef.current) {
      setWaveforms([...simRef.current.getWaveformHistory()]);
    }
    setDoc((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === node.id ? { ...n, properties: { ...n.properties, switchState: nextVal } } : n,
      ),
    }));
  };

  const handleToggleDipBit = (node: CircuitNodeData, bitIndex: number) => {
    const nextVal = simRef.current.toggleDipSwitchBit(node.id, bitIndex);
    const snap = simRef.current.settleCombinational(300);
    setSnapshot(snap);
    if (!analyzerClearedRef.current) {
      setWaveforms([...simRef.current.getWaveformHistory()]);
    }
    setDoc((prev) => ({
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

  const handleChangeNodeProperties = (nodeId: string, patch: Partial<NodeProperties>) => {
    if (patch.switchState !== undefined) {
      simRef.current.setInputState(nodeId, patch.switchState);
    }
    if (patch.dipSwitchStates) {
      patch.dipSwitchStates.forEach((st, idx) => {
        simRef.current.setDipSwitchBit(nodeId, idx, st);
      });
    }
    pushHistory((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId ? { ...n, properties: { ...n.properties, ...patch } } : n,
      ),
    }));
  };

  const handleSingleStep = () => {
    setIsRunning(false);
    analyzerClearedRef.current = false;
    const currentDoc = docRef.current;
    const hasPeriodic = currentDoc.nodes.some((n) => n.type === 'CLOCK' || n.type === 'TIMER_555');
    if (hasPeriodic) {
      const snap = simRef.current.stepSingleEvent();
      setSnapshot(snap);
      setWaveforms([...simRef.current.getWaveformHistory()]);
    } else {
      advanceSimulationTick(stepDeltaNs);
    }
  };

  const handleResetSimulation = () => {
    setIsRunning(false);
    autoVectorStepRef.current = 0;
    analyzerClearedRef.current = true;
    simRef.current.reset();
    simRef.current.clearWaveformHistory();
    setSnapshot(simRef.current.getSnapshot());
    setWaveforms([]);
  };

  const handleClearCanvas = () => {
    setIsRunning(false);
    analyzerClearedRef.current = true;
    pushHistory((prev) => ({
      ...prev,
      nodes: [],
      edges: [],
    }));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setDraggingNodePos(null);
    simRef.current.reset();
    simRef.current.clearWaveformHistory();
    setWaveforms([]);
    showToast('Полотно схеми очищено (Ctrl+Z для скасування).');
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
    if (!user) {
      setSaveModalOpen(false);
      setAuthGateFeature('збереження ревізій проєкту');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: doc.metadata.title,
        description: doc.metadata.description,
        category: doc.metadata.category,
        isPublic: true,
        tags: doc.metadata.tags,
        commitMessage,
        schemaJson: doc,
      };
      if (activeCircuitId && !activeCircuitId.startsWith('draft-')) {
        try {
          const res = await api.updateCircuit(activeCircuitId, payload);
          setActiveCircuitIdAndDoc(res.circuit.id, res.circuit.schemaJson);
          await refreshCircuits();
          showToast('Нову ревізію схеми успішно збережено!');
        } catch {
          try {
            const res = await api.createCircuit(payload);
            setActiveCircuitIdAndDoc(res.circuit.id, res.circuit.schemaJson);
            await refreshCircuits();
            navigate(`/editor/${res.circuit.id}`, { replace: true });
            showToast('Проєкт збережено як нову схему з ревізією v1!');
          } catch {
            setActiveCircuitIdAndDoc(activeCircuitId, doc);
            showToast('Схему збережено у розділі «Мої схеми»!');
          }
        }
      } else {
        try {
          const res = await api.createCircuit(payload);
          setActiveCircuitIdAndDoc(res.circuit.id, res.circuit.schemaJson);
          await refreshCircuits();
          navigate(`/editor/${res.circuit.id}`, { replace: true });
          showToast('Проєкт збережено як нову схему з ревізією v1!');
        } catch {
          const localId = activeCircuitId || `draft-${Date.now().toString(36)}`;
          setActiveCircuitIdAndDoc(localId, doc);
          showToast('Схему збережено у розділі «Мої схеми»!');
        }
      }
      setSaveModalOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  const [customIcSubmitted, setCustomIcSubmitted] = useState(false);

  const detectedCustomIcPins = useMemo(() => {
    const byCanvasOrder = (a: CircuitNodeData, b: CircuitNodeData) =>
      a.position.y - b.position.y || a.position.x - b.position.x;

    const inputs = doc.nodes
      .filter((n) => n.type === 'INPUT_SWITCH' || n.type === 'PUSH_BUTTON')
      .slice()
      .sort(byCanvasOrder)
      .map((n, idx) => ({
        id: `IN_${idx}`,
        name: n.properties.label || `I${idx}`,
        mappedNodeId: n.id,
      }));

    const outputs = doc.nodes
      .filter((n) => n.type === 'LED' || n.type === 'PROBE')
      .slice()
      .sort(byCanvasOrder)
      .map((n, idx) => ({
        id: `OUT_${idx}`,
        name: n.properties.label || `O${idx}`,
        mappedNodeId: n.id,
      }));

    return { inputs, outputs };
  }, [doc.nodes]);

  const handleCreateCustomIc = async (updateExistingId?: string) => {
    if (!user) {
      setCustomIcModalOpen(false);
      setAuthGateFeature('створення власних мікросхем (Custom IC)');
      return;
    }
    setCustomIcSubmitted(true);
    const trimmedName = icName.trim();
    const trimmedCode = icCode.trim().toUpperCase();
    if (trimmedName.length < 2 || trimmedCode.length < 2) {
      return;
    }
    const { inputs: inputPins, outputs: outputPins } = detectedCustomIcPins;
    if (inputPins.length === 0 || outputPins.length === 0) {
      showToast('Для створення ІМС потрібні щонайменше 1 перемикач входу та 1 вихід (LED/PROBE).');
      return;
    }

    if (updateExistingId) {
      await updateCustomIc(updateExistingId, {
        name: trimmedName,
        code: trimmedCode,
        description: doc.metadata.description || `Синтезовано зі схеми «${doc.metadata.title}»`,
        propagationDelayNs: icDelay,
        inputPins,
        outputPins,
        internalCircuit: {
          nodes: doc.nodes,
          edges: doc.edges,
        },
      });
      setCustomIcModalOpen(false);
      setCustomIcSubmitted(false);
      showToast(`Мікросхему ${trimmedCode} оновлено в бібліотеці!`);
      return;
    }

    try {
      const res = await api.createCustomComponent({
        name: trimmedName,
        code: trimmedCode,
        description: `Синтезовано зі схеми «${doc.metadata.title}»`,
        propagationDelayNs: icDelay,
        isShared: true,
        inputPins,
        outputPins,
        internalCircuit: {
          nodes: doc.nodes,
          edges: doc.edges,
        },
      });
      setCustomIcs((prev) => [res.customComponent, ...prev]);
      setCustomIcModalOpen(false);
      setCustomIcSubmitted(false);
      showToast(`Мікросхему ${res.customComponent.code} додано до бібліотеки!`);
    } catch {
      const fallbackIc = {
        id: `ic-local-${Date.now().toString(36)}`,
        name: trimmedName,
        code: trimmedCode,
        description: `Синтезовано зі схеми «${doc.metadata.title}»`,
        propagationDelayNs: icDelay,
        isShared: true,
        inputPins,
        outputPins,
        internalCircuit: {
          nodes: doc.nodes,
          edges: doc.edges,
        },
      };
      setCustomIcs((prev) => [fallbackIc, ...prev]);
      setCustomIcModalOpen(false);
      setCustomIcSubmitted(false);
      showToast(`Мікросхему ${fallbackIc.code} додано до бібліотеки!`);
    }
  };

  const filteredCatalog = useMemo(() => {
    const q = paletteSearch.trim().toLowerCase();
    return COMPONENT_CATALOG.filter((item) => {
      if (item.type === 'CUSTOM_IC') return false;
      if (paletteCategory !== 'ALL' && item.category !== paletteCategory) return false;
      if (q) {
        const text = `${item.name} ${item.shortLabel} ${item.type}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [paletteCategory, paletteSearch]);

  const circuitDropdownOptions = useMemo<Win95DropdownOption[]>(() => {
    const opts: Win95DropdownOption[] = [];
    if (!user && !activeCircuitId.startsWith('preset-')) {
      opts.push({
        value: activeCircuitId,
        label: doc.metadata.title,
        group: 'Поточна чернетка',
      });
    } else if (!circuits.some((c) => c.id === activeCircuitId)) {
      opts.push({
        value: activeCircuitId,
        label: doc.metadata.title,
        group: 'Активна схема',
      });
    }
    for (const c of personalCircuits) {
      opts.push({
        value: c.id,
        label: c.id === activeCircuitId ? doc.metadata.title : c.title,
        group: `Мої схеми (${personalCircuits.length})`,
      });
    }
    for (const c of presetCircuits) {
      opts.push({
        value: c.id,
        label: c.id === activeCircuitId ? doc.metadata.title : c.title,
        group: `Еталонні схеми (${presetCircuits.length})`,
      });
    }
    return opts;
  }, [activeCircuitId, circuits, doc.metadata.title, personalCircuits, presetCircuits, user]);

  return (
    <div
      ref={editorRootRef}
      className="flex min-h-[calc(100vh-2.75rem)] lg:h-[calc(100vh-2.75rem)] flex-col lg:overflow-hidden bg-win-bg text-win-ink"
    >
      <h1 className="sr-only">Схемотехнічний редактор: {doc.metadata.title}</h1>
      {/* Єдина компактна панель інструментів редактора Windows 95 */}
      <div className="win95-outset flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-w-full w-full lg:w-auto">
          <Win95Dropdown
            testId="editor-circuit-select"
            ariaLabel="Перемикач активної схеми"
            value={activeCircuitId}
            options={circuitDropdownOptions}
            placeholder={doc.metadata.title}
            onChange={(chosenId) => {
              if (chosenId && chosenId !== activeCircuitId) {
                navigate(`/editor/${chosenId}`);
              }
            }}
            className="min-w-0 flex-1 sm:flex-none sm:w-64 max-w-full"
          />

          <Button
            data-testid="btn-rename-scheme"
            variant="secondary"
            size="xs"
            onClick={() => setRenameModalOpen(true)}
            aria-label="Перейменувати поточну схему"
            title="Перейменувати поточну схему"
            icon={<Edit2 className="h-3.5 w-3.5 text-win-navy" />}
          />

          <div className="hidden sm:block h-4 w-px bg-win-shadow" />

          <Button
            data-testid="btn-toggle-run"
            variant={isRunning ? 'danger' : 'success'}
            size="sm"
            onClick={() => setIsRunning((r) => !r)}
            icon={isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          >
            {isRunning ? 'Пауза' : 'Старт'}
          </Button>

          <Button
            data-testid="btn-step"
            variant="secondary"
            size="sm"
            onClick={handleSingleStep}
            title="Виконати наступний крок дискретно-подійної симуляції"
            icon={<SkipForward className="h-3.5 w-3.5" />}
          >
            Крок
          </Button>

          <Button
            data-testid="btn-reset"
            variant="outline"
            size="sm"
            onClick={handleResetSimulation}
            title="Скинути моделювання до початкового стану"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
          >
            Скинути
          </Button>

          <label htmlFor={`${formId}-step-delta`} className="sr-only">
            Крок модельного часу на 1 тік (точність, нс)
          </label>
          <Win95Dropdown
            id={`${formId}-step-delta`}
            testId="editor-step-delta-select"
            ariaLabel="Крок модельного часу на 1 тік (точність, нс)"
            value={String(stepDeltaNs)}
            onChange={(nextVal) => setStepDeltaNs(Number(nextVal))}
            options={[
              { value: '5', label: '5 нс/тік' },
              { value: '10', label: '10 нс/тік' },
              { value: '25', label: '25 нс/тік' },
              { value: '50', label: '50 нс/тік' },
              { value: '100', label: '100 нс/тік' },
            ]}
            className="w-28"
          />

          <Win95Dropdown
            testId="editor-speed-select"
            ariaLabel="Швидкість відтворення у реальному часі (FPS)"
            value={String(simSpeed)}
            onChange={(nextVal) => setSimSpeed(Number(nextVal))}
            options={[
              { value: '0.5', label: 'Швидк.: 0.5x' },
              { value: '1', label: 'Швидк.: 1x' },
              { value: '2', label: 'Швидк.: 2x' },
              { value: '4', label: 'Швидк.: 4x' },
            ]}
            className="w-28"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="secondary"
            size="xs"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            aria-label="Скасувати (Ctrl+Z)"
            title="Скасувати (Ctrl+Z)"
            icon={<Undo2 className="h-3.5 w-3.5" />}
          />
          <Button
            variant="secondary"
            size="xs"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            aria-label="Повторити (Ctrl+Y)"
            title="Повторити (Ctrl+Y)"
            icon={<Redo2 className="h-3.5 w-3.5" />}
          />
          <Button
            data-testid="btn-clear-canvas"
            variant="outline"
            size="xs"
            disabled={doc.nodes.length === 0 && doc.edges.length === 0}
            onClick={handleClearCanvas}
            title="Очистити полотно схеми (Ctrl+Z для скасування)"
            icon={<Trash2 className="h-3.5 w-3.5" />}
          >
            Очистити
          </Button>

          <div className="hidden xl:block h-4 w-px bg-win-shadow" />

          {/* Видимість панелей робочої області */}
          <div className="hidden xl:flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowLeftPanel((v) => !v)}
              title="Показати / сховати бібліотеку компонентів"
              className={`inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center gap-1 px-2 py-1 text-xs font-bold touch-manipulation focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black ${
                showLeftPanel
                  ? 'win95-button-pressed bg-win-surface text-win-ink'
                  : 'win95-button text-win-ink'
              }`}
            >
              <PanelLeft className="h-3 w-3" aria-hidden="true" /> Бібліотека
            </button>
            <button
              type="button"
              onClick={() => {
                if (maximizedWindow === 'signals') {
                  setMaximizedWindow(null);
                  setShowSignalPanel(false);
                } else if (maximizedWindow === 'workspace' || !showSignalPanel) {
                  setMaximizedWindow(null);
                  setShowSignalPanel(true);
                } else {
                  setShowSignalPanel(false);
                }
              }}
              title="Показати / сховати логічний аналізатор"
              className={`inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center gap-1 px-2 py-1 text-xs font-bold touch-manipulation focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black ${
                showSignalPanel && maximizedWindow !== 'workspace'
                  ? 'win95-button-pressed bg-win-surface text-win-ink'
                  : 'win95-button text-win-ink'
              }`}
            >
              <PanelBottom className="h-3 w-3" aria-hidden="true" /> Сигнали
            </button>
            <button
              type="button"
              onClick={() => setShowRightPanel((v) => !v)}
              title="Показати / сховати інспектор властивостей"
              className={`inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center gap-1 px-2 py-1 text-xs font-bold touch-manipulation focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black ${
                showRightPanel
                  ? 'win95-button-pressed bg-win-surface text-win-ink'
                  : 'win95-button text-win-ink'
              }`}
            >
              <PanelRight className="h-3 w-3" aria-hidden="true" /> Інспектор
            </button>
          </div>

          <div className="h-4 w-px bg-win-shadow" />

          <Button
            data-testid="btn-truth-table"
            variant="outline"
            size="sm"
            onClick={handleOpenTruthTable}
            icon={<Table2 className="h-3.5 w-3.5 text-win-navy" />}
          >
            Таблиця істинності
          </Button>

          <Button
            data-testid="btn-custom-ic"
            variant="outline"
            size="sm"
            title={
              user
                ? 'Упакувати поточну схему в окрему інтегральну мікросхему (ІМС)'
                : 'Доступно лише авторизованим користувачам'
            }
            onClick={() => {
              if (!user) {
                setAuthGateFeature('створення власних мікросхем (Custom IC)');
                return;
              }
              if (sourceCustomIc) {
                setIcName(sourceCustomIc.name);
                setIcCode(sourceCustomIc.code);
                setIcDelay(sourceCustomIc.propagationDelayNs);
              }
              setCustomIcSubmitted(false);
              setCustomIcModalOpen(true);
            }}
            icon={
              !user ? (
                <Lock className="h-3.5 w-3.5 text-win-muted" />
              ) : (
                <Box className="h-3.5 w-3.5 text-win-navy" />
              )
            }
          >
            Створити ІМС
          </Button>

          <Button
            data-testid="btn-json"
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
            data-testid="btn-save-revision"
            variant="primary"
            size="sm"
            title={
              user
                ? 'Зберегти поточну версію як нову ревізію'
                : 'Доступно лише авторизованим користувачам'
            }
            onClick={() => {
              if (!user) {
                setAuthGateFeature('збереження ревізій та проєктів');
                return;
              }
              setSaveModalOpen(true);
            }}
            icon={
              !user ? (
                <Lock className="h-3.5 w-3.5 text-win-muted" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )
            }
          >
            Зберегти ревізію
          </Button>
        </div>
      </div>

      {toastMsg && (
        <div className="win95-window fixed bottom-5 right-5 z-50 bg-win-highlight px-4 py-2.5 text-xs font-bold text-win-navy">
          {toastMsg}
        </div>
      )}

      {/* Мобільний перемикач панелей для телефонів та планшетів (< 1024px) */}
      <div
        data-testid="editor-mobile-tabs"
        className="flex lg:hidden items-center gap-1 border-b border-win-shadow bg-win-bg px-2 py-1"
      >
        <button
          type="button"
          onClick={() => setMobilePanelTab('workspace')}
          className={`flex-1 inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 py-1 text-xs font-bold touch-manipulation ${
            mobilePanelTab === 'workspace'
              ? 'win95-button-pressed bg-win-surface text-win-ink'
              : 'win95-button text-win-ink'
          }`}
        >
          <Activity className="h-3.5 w-3.5 text-win-navy" />
          <span>Полотно + Сигнали</span>
        </button>
        <button
          type="button"
          onClick={() => setMobilePanelTab('palette')}
          className={`flex-1 inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 py-1 text-xs font-bold touch-manipulation ${
            mobilePanelTab === 'palette'
              ? 'win95-button-pressed bg-win-surface text-win-ink'
              : 'win95-button text-win-ink'
          }`}
        >
          <PanelLeft className="h-3.5 w-3.5 text-win-navy" />
          <span>Бібліотека ({COMPONENT_CATALOG.length - 1})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobilePanelTab('inspector')}
          className={`flex-1 inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 py-1 text-xs font-bold touch-manipulation ${
            mobilePanelTab === 'inspector'
              ? 'win95-button-pressed bg-win-surface text-win-ink'
              : 'win95-button text-win-ink'
          }`}
        >
          <PanelRight className="h-3.5 w-3.5 text-win-navy" />
          <span>Інспектор</span>
        </button>
      </div>

      {/* Основна гнучка багатопанельна робоча область САПР у стилі вікон Windows 95 */}
      <div ref={editorBodyRef} className="flex flex-1 min-h-0 p-1.5 overflow-hidden">
        {/* 1. Ліва панель: БІБЛІОТЕКА КОМПОНЕНТІВ */}
        {showLeftPanel && (
          <aside
            style={{ width: `${leftPanelWidth}px` }}
            className={`win95-window shrink-0 flex-col overflow-hidden max-lg:!w-full ${
              mobilePanelTab === 'palette' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <div className="win95-titlebar flex items-center justify-between gap-1 px-2 py-1">
              <span className="truncate text-xs font-bold">БІБЛІОТЕКА КОМПОНЕНТІВ</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="bg-win-bg px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-win-ink">
                  {COMPONENT_CATALOG.length - 1}
                </span>
                <button
                  type="button"
                  onClick={() => setShowLeftPanel(false)}
                  aria-label="Згорнути бібліотеку компонентів"
                  title="Згорнути панель (або потягніть повзунок вліво)"
                  className="hidden lg:inline-flex win95-button min-h-6 min-w-6 coarse:min-h-9 coarse:min-w-9 items-center justify-center text-win-ink"
                >
                  <Minus className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="border-b border-win-shadow bg-win-bg p-2 space-y-1.5">
              <div className="relative">
                <label htmlFor={`${formId}-palette-search`} className="sr-only">
                  Пошук компонента у бібліотеці
                </label>
                <input
                  id={`${formId}-palette-search`}
                  type="text"
                  value={paletteSearch}
                  onChange={(e) => setPaletteSearch(e.target.value)}
                  placeholder="Пошук компонента..."
                  className="win95-field w-full pl-2.5 pr-7 py-1 text-xs text-win-ink"
                />
                <Search className="pointer-events-none absolute right-2 top-1.5 h-3.5 w-3.5 text-win-muted" />
              </div>
              <label htmlFor={`${formId}-palette-cat`} className="sr-only">
                Категорія бібліотеки
              </label>
              <Win95Dropdown
                id={`${formId}-palette-cat`}
                testId="editor-palette-category-select"
                ariaLabel="Категорія бібліотеки"
                value={paletteCategory}
                onChange={(nextVal) => setPaletteCategory(nextVal as ComponentCategory | 'ALL')}
                options={[
                  { value: 'ALL', label: `Усі розділи (${COMPONENT_CATALOG.length - 1})` },
                  ...(Object.keys(CATEGORY_LABELS) as ComponentCategory[]).map((cat) => ({
                    value: cat,
                    label: CATEGORY_LABELS[cat],
                  })),
                ]}
                className="w-full"
              />
            </div>

            <div className="win95-inset flex-1 overflow-y-auto p-2 space-y-2 bg-win-surface">
              {customIcs.length > 0 && (
                <div className="space-y-1.5 pb-2 border-b border-win-shadow">
                  <div className="text-[10px] font-bold uppercase text-win-ink">
                    Користувацькі ІМС ({customIcs.length})
                  </div>
                  {customIcs.map((ic) => (
                    <button
                      key={ic.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/logicforge-type', 'CUSTOM_IC');
                        e.dataTransfer.setData('application/logicforge-custom-ic', ic.id);
                        setPendingPaletteDrag({ type: 'CUSTOM_IC', customIcId: ic.id });
                      }}
                      onDragEnd={() => setPendingPaletteDrag(null)}
                      onClick={() => addNodeToCanvas('CUSTOM_IC', undefined, ic.id)}
                      className="win95-button flex w-full cursor-pointer items-center justify-between px-2.5 py-1.5 text-left text-xs focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black focus-visible:outline-offset-[-4px]"
                    >
                      <div>
                        <div className="font-mono font-bold text-win-ink">{ic.code}</div>
                        <div className="text-[10px] text-win-muted truncate max-w-[165px]">
                          {ic.name}
                        </div>
                      </div>
                      <Plus className="h-3.5 w-3.5 text-win-teal" />
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5">
                {filteredCatalog.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    data-testid={`palette-item-${item.type}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/logicforge-type', item.type);
                      setPendingPaletteDrag({ type: item.type });
                    }}
                    onDragEnd={() => setPendingPaletteDrag(null)}
                    onClick={() => addNodeToCanvas(item.type)}
                    title={`${item.name} (затримка: ${item.defaultDelayNs} нс)`}
                    className="win95-button group flex w-full cursor-pointer flex-col items-center justify-between p-1.5 text-center focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black focus-visible:outline-offset-[-4px]"
                  >
                    <div className="flex w-full items-center justify-between text-[11px] font-mono text-win-muted">
                      <span>{item.defaultPins.length}p</span>
                      <span>{item.defaultDelayNs}ns</span>
                    </div>
                    <div className="my-0.5 flex items-center justify-center w-full">
                      <CatalogNodePreview
                        type={item.type}
                        compact
                        className="h-11 w-full max-w-[92px]"
                      />
                    </div>
                    <div className="w-full truncate text-xs font-bold text-win-ink">
                      {item.shortLabel}
                    </div>
                    <div className="w-full truncate text-[11px] text-win-muted">{item.name}</div>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}

        <div
          data-testid="resizer-left"
          role="separator"
          aria-orientation="vertical"
          aria-label="Зміна ширини палітри компонентів"
          onPointerDown={startResizeLeft}
          onDoubleClick={() => setShowLeftPanel((v) => !v)}
          title={
            showLeftPanel
              ? 'Потягніть вліво щоб зменшити або закрити бібліотеку компонентів'
              : 'Потягніть праворуч або двічі клацніть щоб відкрити бібліотеку компонентів'
          }
          className={`hidden lg:flex group w-2.5 coarse:w-4 shrink-0 select-none touch-none cursor-col-resize items-center justify-center transition-colors ${
            showLeftPanel
              ? 'hover:bg-win-surface'
              : 'win95-outset bg-win-surface hover:bg-win-highlight'
          }`}
        >
          <div className="h-12 w-1 border-x border-win-shadow bg-win-highlight/60" />
        </div>

        {/* 2. Центральна область: СХЕМОТЕХНІЧНЕ ПОЛОТНО (вгорі) + ОКРЕМЕ ВІКНО СИГНАЛІВ (внизу) */}
        <div
          ref={centerColumnRef}
          className={`flex-1 min-w-0 flex-col lg:overflow-hidden ${
            mobilePanelTab === 'workspace' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {maximizedWindow !== 'signals' && (
            <section
              aria-label="Робоче полотно схеми"
              className="win95-window flex flex-1 min-h-[260px] lg:min-h-[80px] flex-col overflow-hidden"
            >
              <div className="win95-titlebar flex flex-wrap items-center justify-between gap-2 px-2.5 py-1">
                <div className="flex flex-wrap items-center gap-3 text-xs font-sans tabular-nums">
                  <span>
                    СТАТУС:{' '}
                    <strong data-testid="sim-status" className="text-win-highlight">
                      {isRunning ? 'АКТИВНО' : snapshot.status}
                    </strong>
                  </span>
                  <span>
                    ЧАС:{' '}
                    <strong data-testid="sim-time-ns" className="text-win-highlight">
                      {snapshot.currentTimeNs} нс
                    </strong>
                  </span>
                  <span>
                    ПОДІЙ:{' '}
                    <strong data-testid="sim-events-count" className="text-win-highlight">
                      {snapshot.processedEventsCount}
                    </strong>
                  </span>
                  {snapshot.activeConflicts.length > 0 && (
                    <span className="inline-flex items-center gap-1 bg-logic-x-bg px-2 py-0.5 text-[11px] font-bold text-logic-x">
                      <AlertTriangle className="h-3 w-3" />
                      Колізія шини: {snapshot.activeConflicts.join(', ')}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="xs"
                    aria-label="Зменшити масштаб схеми"
                    title="Зменшити масштаб схеми"
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
                  <span className="w-11 text-center text-xs font-bold tabular-nums text-win-highlight">
                    {Math.round(doc.viewport.zoom * 100)}%
                  </span>
                  <Button
                    variant="secondary"
                    size="xs"
                    aria-label="Збільшити масштаб схеми"
                    title="Збільшити масштаб схеми"
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
                  <button
                    type="button"
                    onClick={() => {
                      setShowSignalPanel(true);
                      setMaximizedWindow('signals');
                    }}
                    aria-label="Згорнути полотно схеми на користь аналізатора"
                    title="Згорнути схему та відкрити логічний аналізатор на весь екран"
                    className="win95-button ml-1 inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center justify-center touch-manipulation text-win-ink"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMaximizedWindow((w) => (w === 'workspace' ? null : 'workspace'))
                    }
                    aria-label={
                      maximizedWindow === 'workspace'
                        ? 'Відновити розділення вікон'
                        : 'Розгорнути полотно схеми на весь екран'
                    }
                    title={
                      maximizedWindow === 'workspace'
                        ? 'Відновити розділення зі шкалою сигналів'
                        : 'Розгорнути полотно схеми на весь екран'
                    }
                    className="win95-button inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center justify-center touch-manipulation text-win-ink"
                  >
                    {maximizedWindow === 'workspace' ? (
                      <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 p-1">
                <CircuitCanvas
                  nodes={canvasNodes}
                  edges={doc.edges}
                  viewport={doc.viewport}
                  nodePinStates={snapshot.nodePinStates}
                  edgeStates={snapshot.edgeStates}
                  selectedNodeId={selectedNodeId}
                  selectedEdgeId={selectedEdgeId}
                  pendingPaletteDrag={pendingPaletteDrag}
                  customDefinitions={customIcs}
                  onSelectNode={setSelectedNodeId}
                  onSelectEdge={setSelectedEdgeId}
                  onMoveNode={handleMoveNode}
                  onMoveNodeEnd={handleMoveNodeEnd}
                  onConnectPins={handleConnectPins}
                  onDropCatalogType={(dropType, dropPos, customIcId) => {
                    setPendingPaletteDrag(null);
                    addNodeToCanvas(dropType, dropPos, customIcId);
                  }}
                  onToggleSwitch={handleToggleSwitch}
                  onToggleDipBit={handleToggleDipBit}
                  onChangeViewport={(patch) =>
                    setDoc((prev) => ({
                      ...prev,
                      viewport: { ...prev.viewport, ...patch },
                    }))
                  }
                />
              </div>
            </section>
          )}

          {/* Повзунок-розділювач між полотном схеми та логічним аналізатором (завжди доступний 0..100%) */}
          <div
            data-testid="resizer-signals"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Зміна висоти вікна логічного аналізатора"
            onPointerDown={startResizeSignal}
            onDoubleClick={() => {
              if (maximizedWindow === 'signals') {
                setMaximizedWindow(null);
                setShowSignalPanel(true);
              } else if (!showSignalPanel || maximizedWindow === 'workspace') {
                setMaximizedWindow(null);
                setShowSignalPanel(true);
              } else {
                setShowSignalPanel(false);
              }
            }}
            title={
              maximizedWindow === 'signals'
                ? 'Потягніть вниз щоб відкрити полотно схеми'
                : showSignalPanel && maximizedWindow !== 'workspace'
                  ? 'Потягніть вгору/вниз щоб змінити розмір, донизу щоб закрити, або догори на максимум'
                  : 'Потягніть вгору або двічі клацніть щоб відкрити логічний аналізатор'
            }
            className={`group flex shrink-0 select-none touch-none cursor-row-resize items-center justify-center transition-colors ${
              showSignalPanel && maximizedWindow === null
                ? 'h-2.5 coarse:h-4 hover:bg-win-surface'
                : 'h-4 coarse:h-5 win95-outset bg-win-surface hover:bg-win-highlight'
            }`}
          >
            {maximizedWindow === 'signals' ? (
              <span className="text-[11px] font-bold text-win-ink">
                ▼ Потягніть вниз щоб відновити схему
              </span>
            ) : !showSignalPanel || maximizedWindow === 'workspace' ? (
              <span className="text-[11px] font-bold text-win-ink">
                ▲ Потягніть вгору щоб відкрити логічний аналізатор
              </span>
            ) : (
              <div className="h-1 w-14 border-y border-win-shadow bg-win-highlight/60" />
            )}
          </div>

          {/* Нижня / повнорозмірна панель: ВІКНО СИГНАЛІВ ТА ЧАСОВИХ ДІАГРАМ (ЛОГІЧНИЙ АНАЛІЗАТОР) */}
          {(showSignalPanel || maximizedWindow === 'signals') &&
            maximizedWindow !== 'workspace' && (
              <section
                data-testid="signals-window"
                style={
                  maximizedWindow === 'signals' ? undefined : { height: `${signalPanelHeight}px` }
                }
                className={`win95-window flex flex-col overflow-hidden ${
                  maximizedWindow === 'signals' ? 'flex-1 min-h-[260px]' : 'shrink-0'
                }`}
              >
                <div className="win95-titlebar flex items-center justify-between gap-2 px-2.5 py-1">
                  <div className="flex items-center gap-2 min-w-0 text-xs font-bold">
                    <Activity className="h-3.5 w-3.5 shrink-0 text-win-highlight" />
                    <span className="truncate">ЛОГІЧНИЙ АНАЛІЗАТОР</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setMaximizedWindow(null);
                        setShowSignalPanel(false);
                      }}
                      aria-label="Згорнути логічний аналізатор"
                      title="Закрити вікно сигналів (або потягніть повзунок донизу)"
                      className="win95-button inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center justify-center touch-manipulation text-win-ink"
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMaximizedWindow((w) => (w === 'signals' ? null : 'signals'))
                      }
                      aria-label={
                        maximizedWindow === 'signals'
                          ? 'Відновити розмір вікна сигналів'
                          : 'Розгорнути логічний аналізатор на весь екран'
                      }
                      title={
                        maximizedWindow === 'signals'
                          ? 'Повернути розділення зі схемою'
                          : 'Розгорнути на всю висоту робочої області'
                      }
                      className="win95-button inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center gap-1 px-2.5 py-1 text-xs font-bold touch-manipulation text-win-ink"
                    >
                      {maximizedWindow === 'signals' ? (
                        <>
                          <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" /> Відновити
                        </>
                      ) : (
                        <>
                          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> Розгорнути
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 p-1">
                  <WaveformPanel
                    samples={waveforms}
                    currentTimeNs={snapshot.currentTimeNs}
                    isRunning={isRunning}
                  />
                </div>
              </section>
            )}
        </div>

        {/* 3. Права бічна колонка: ПАНЕЛЬ УПРАВЛІННЯ (STA) та ВЛАСТИВОСТІ */}
        <div
          data-testid="resizer-right"
          role="separator"
          aria-orientation="vertical"
          aria-label="Зміна ширини панелі управління та властивостей"
          onPointerDown={startResizeRight}
          onDoubleClick={() => setShowRightPanel((v) => !v)}
          title={
            showRightPanel
              ? 'Потягніть вправо щоб зменшити або закрити інспектор'
              : 'Потягніть вліво або двічі клацніть щоб відкрити інспектор'
          }
          className={`hidden lg:flex group w-2.5 coarse:w-4 shrink-0 select-none touch-none cursor-col-resize items-center justify-center transition-colors ${
            showRightPanel
              ? 'hover:bg-win-surface'
              : 'win95-outset bg-win-surface hover:bg-win-highlight'
          }`}
        >
          <div className="h-12 w-1 border-x border-win-shadow bg-win-highlight/60" />
        </div>

        {showRightPanel && (
          <aside
            style={{ width: `${rightPanelWidth}px` }}
            className={`shrink-0 flex-col overflow-hidden max-lg:!w-full ${
              mobilePanelTab === 'inspector' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <div className="win95-window flex flex-1 flex-col overflow-hidden min-h-0">
              <div className="win95-titlebar flex items-center justify-between gap-1 px-2.5 py-1">
                <span className="truncate text-xs font-bold">
                  {selectedNode ? 'ВЛАСТИВОСТІ ЕЛЕМЕНТА' : 'ВЛАСТИВОСТІ ТА АНАЛІЗ'}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold tabular-nums text-win-highlight">
                    {selectedNode
                      ? selectedNode.properties.label
                      : `${doc.nodes.length} ел. • ${doc.edges.length} ліній`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRightPanel(false)}
                    aria-label="Згорнути інспектор властивостей"
                    title="Згорнути панель (або потягніть повзунок праворуч)"
                    className="hidden lg:inline-flex win95-button min-h-6 min-w-6 coarse:min-h-9 coarse:min-w-9 items-center justify-center text-win-ink"
                  >
                    <Minus className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 bg-win-bg">
                <PropertyInspector
                  node={selectedNode}
                  pinStates={selectedNode ? snapshot.nodePinStates[selectedNode.id] : undefined}
                  timingReport={timingReport}
                  nodeCount={doc.nodes.length}
                  edgeCount={doc.edges.length}
                  selectedEdgeId={selectedEdgeId}
                  onDeleteSelectedEdge={handleDeleteSelected}
                  onOpenTruthTable={handleOpenTruthTable}
                  onChangeProperties={handleChangeNodeProperties}
                  onDeleteNode={handleDeleteNodeById}
                />
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Модальне вікно 1: Збереження схеми та створення ревізії */}
      <Modal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title="Збереження схеми та фіксація нової ревізії"
        subtitle="Кожне збереження створює окрему версію проєкту з можливістю повернення до попередніх знімків."
        maxWidthClass="max-w-lg"
        footer={
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            onClick={() => void handleSaveCircuit()}
          >
            Зберегти ревізію
          </Button>
        }
      >
        <div className="space-y-3 text-xs">
          <div>
            <label htmlFor={`${formId}-save-title`} className="block font-bold text-win-ink">
              <span className="mb-1 block">Назва проєкту</span>
            </label>
            <input
              id={`${formId}-save-title`}
              type="text"
              value={doc.metadata.title}
              onChange={(e) =>
                setDoc((p) => ({ ...p, metadata: { ...p.metadata, title: e.target.value } }))
              }
              className="win95-field w-full px-3 py-2 font-normal text-win-ink"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-save-cat`} className="block font-bold text-win-ink">
              <span className="mb-1 block">Категорія</span>
            </label>
            <input
              id={`${formId}-save-cat`}
              type="text"
              value={doc.metadata.category}
              onChange={(e) =>
                setDoc((p) => ({ ...p, metadata: { ...p.metadata, category: e.target.value } }))
              }
              className="win95-field w-full px-3 py-2 font-normal text-win-ink"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-save-desc`} className="block font-bold text-win-ink">
              <span className="mb-1 block">Опис схеми</span>
            </label>
            <textarea
              id={`${formId}-save-desc`}
              rows={3}
              value={doc.metadata.description}
              onChange={(e) =>
                setDoc((p) => ({
                  ...p,
                  metadata: { ...p.metadata, description: e.target.value },
                }))
              }
              className="win95-field w-full px-3 py-2 font-normal text-win-ink"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-save-commit`} className="block font-bold text-win-ink">
              <span className="mb-1 block">Коментар до ревізії (що змінено)</span>
            </label>
            <input
              id={`${formId}-save-commit`}
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="win95-field w-full px-3 py-2 font-normal text-win-ink"
            />
          </div>
        </div>
      </Modal>

      {/* Модальне вікно 2: Автоматична таблиця істинності та ДДНФ */}
      <Modal
        open={truthModalOpen}
        onClose={() => setTruthModalOpen(false)}
        title="Автоматичний синтез таблиці істинності та канонічної ДДНФ"
        subtitle={
          <>
            Повна перевірка всіх <MathFormula latex="2^n" /> комбінацій вхідних сигналів із синтезом
            булевої формули ДДНФ.
          </>
        }
        maxWidthClass="max-w-3xl"
      >
        {!truthTable || truthTable.rows.length === 0 ? (
          <div className="py-6 text-center text-xs text-win-muted">
            Для побудови таблиці істинності додайте до схеми щонайменше один вхідний перемикач або
            кнопку імпульсу та один вихідний індикатор (світлодіод LED або пробник).
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="win95-inset space-y-2 bg-win-highlight p-3">
              <div className="text-xs font-bold text-win-navy">
                Синтезовані булеві вирази (ДДНФ / Canonical SOP):
              </div>
              <div className="space-y-1.5 border-t border-win-surface pt-1.5">
                {Object.entries(truthTable.canonicalSopExpressions).map(([outName, expr]) => (
                  <BooleanSopFormula key={outName} outputName={outName} expression={expr} />
                ))}
              </div>
            </div>

            <div className="win95-inset overflow-x-auto bg-win-highlight">
              <table className="w-full text-left text-xs">
                <thead className="bg-win-bg text-win-ink font-mono border-b border-win-shadow">
                  <tr>
                    {truthTable.inputLabels.map((inp) => (
                      <th key={inp.nodeId} className="px-3 py-2 font-bold">
                        {inp.label}
                      </th>
                    ))}
                    {truthTable.outputLabels.map((out) => (
                      <th
                        key={out.nodeId}
                        className="border-l border-win-shadow bg-win-bg px-3 py-2 font-bold text-win-ink"
                      >
                        {out.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-win-surface bg-win-highlight">
                  {truthTable.rows.map((row, idx) => (
                    <tr key={idx}>
                      {truthTable.inputLabels.map((inp) => (
                        <td key={inp.nodeId} className="px-3 py-1.5 font-mono">
                          <LogicBadge state={row.inputs[inp.label] ?? '0'} compact />
                        </td>
                      ))}
                      {truthTable.outputLabels.map((out) => (
                        <td
                          key={out.nodeId}
                          className="border-l border-win-surface bg-win-canvas px-3 py-1.5 font-mono"
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
        title="Експорт та імпорт схеми у форматі JSON"
        subtitle="Містить компоненти схеми, з’єднання між виводами, параметри елементів і стани сигналів."
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
                  const sanitized = sanitizeAndValidateCircuitDocument(jsonText, {
                    strictPinRefs: true,
                  });
                  pushHistory(() => sanitized);
                  setJsonModalOpen(false);
                  showToast('Схему успішно імпортовано з JSON!');
                } catch (err) {
                  const msg =
                    err instanceof CircuitImportValidationError
                      ? err.message
                      : 'Некоректний формат JSON. Перевірте структуру файлу.';
                  showToast(msg);
                }
              }}
            >
              Застосувати JSON до полотна
            </Button>
          </>
        }
      >
        <div>
          <label htmlFor={`${formId}-json-spec`} className="sr-only">
            JSON специфікація схеми
          </label>
          <textarea
            id={`${formId}-json-spec`}
            rows={16}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="win95-field w-full p-3 font-mono text-xs text-win-ink"
          />
        </div>
      </Modal>

      {/* Модальне вікно 4: Інкапсуляція поточної схеми у користувацьку ІМС */}
      <Modal
        open={customIcModalOpen}
        onClose={() => setCustomIcModalOpen(false)}
        title="Збереження схеми як власної мікросхеми (ІМС)"
        subtitle="Усі вхідні перемикачі й кнопки стануть вхідними пінами корпусу, а світлодіоди й пробники — вихідними."
        maxWidthClass="max-w-md"
        footer={
          sourceCustomIc ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => void handleCreateCustomIc()}>
                Зберегти як нову
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleCreateCustomIc(sourceCustomIc.id)}
              >
                Оновити «{sourceCustomIc.code}»
              </Button>
            </div>
          ) : (
            <Button variant="primary" size="sm" onClick={() => void handleCreateCustomIc()}>
              Створити мікросхему
            </Button>
          )
        }
      >
        <div className="space-y-3 text-xs">
          <div className="win95-statusbar-cell bg-win-bg px-2.5 py-2 space-y-1.5 text-[11px] text-win-ink">
            <div>
              <strong>Як визначаються виводи:</strong> кожен перемикач (
              <span className="font-mono">SW</span>) або кнопка (
              <span className="font-mono">BTN</span>) на полотні автоматично стають{' '}
              <strong>входами</strong> корпусу, а світлодіоди (
              <span className="font-mono">LED</span>) чи пробники (
              <span className="font-mono">PROBE</span>) — <strong>виходами</strong> (згори донизу).
            </div>
            <div className="flex flex-wrap gap-1 pt-0.5">
              <span className="font-bold">Входи ({detectedCustomIcPins.inputs.length}):</span>
              {detectedCustomIcPins.inputs.length === 0 ? (
                <span className="text-logic-x font-bold">додайте SW або BTN на полотно</span>
              ) : (
                detectedCustomIcPins.inputs.map((p) => (
                  <span
                    key={p.id}
                    className="win95-outset bg-win-highlight px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {p.name} → {p.id}
                  </span>
                ))
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              <span className="font-bold">Виходи ({detectedCustomIcPins.outputs.length}):</span>
              {detectedCustomIcPins.outputs.length === 0 ? (
                <span className="text-logic-x font-bold">додайте LED або PROBE на полотно</span>
              ) : (
                detectedCustomIcPins.outputs.map((p) => (
                  <span
                    key={p.id}
                    className="win95-outset bg-win-highlight px-1.5 py-0.5 font-mono text-[10px] text-win-navy"
                  >
                    {p.name} → {p.id}
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <label htmlFor={`${formId}-ic-name`} className="block font-bold text-win-ink">
              <span className="mb-1 block">Повна назва мікросхеми</span>
            </label>
            <input
              id={`${formId}-ic-name`}
              type="text"
              value={icName}
              onChange={(e) => setIcName(e.target.value)}
              className={`win95-field w-full px-3 py-2 font-normal text-win-ink ${
                customIcSubmitted && icName.trim().length < 2 ? 'win95-field-error' : ''
              }`}
            />
            {customIcSubmitted && icName.trim().length < 2 && (
              <p className="mt-1 text-[11px] font-bold text-logic-x">
                Вкажіть назву мікросхеми (мінімум 2 символи).
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${formId}-ic-code`} className="block font-bold text-win-ink">
                <span className="mb-1 block">Кодове маркування</span>
              </label>
              <input
                id={`${formId}-ic-code`}
                type="text"
                value={icCode}
                onChange={(e) => setIcCode(e.target.value)}
                className={`win95-field w-full px-3 py-2 font-mono font-normal text-win-ink ${
                  customIcSubmitted && icCode.trim().length < 2 ? 'win95-field-error' : ''
                }`}
              />
              {customIcSubmitted && icCode.trim().length < 2 && (
                <p className="mt-1 text-[11px] font-bold text-logic-x">Мінімум 2 символи.</p>
              )}
            </div>
            <div>
              <label htmlFor={`${formId}-ic-delay`} className="block font-bold text-win-ink">
                <span className="mb-1 block">Затримка корпусу (нс)</span>
              </label>
              <Win95NumberInput
                id={`${formId}-ic-delay`}
                min={1}
                max={500}
                step={1}
                value={icDelay}
                onChange={(val) => setIcDelay(Math.max(1, Math.round(val) || 15))}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Модальне вікно 5: Назва, опис та категорія поточної схеми */}
      <Modal
        open={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        title="Властивості та опис цифрової схеми"
        maxWidthClass="max-w-md"
        footer={
          <Button variant="primary" size="sm" onClick={() => setRenameModalOpen(false)}>
            Застосувати зміни
          </Button>
        }
      >
        <div className="space-y-3 text-xs">
          <div>
            <label htmlFor={`${formId}-rename-title`} className="block font-bold text-win-ink">
              <span className="mb-1 block">Назва схеми</span>
            </label>
            <input
              id={`${formId}-rename-title`}
              data-testid="editor-rename-input"
              type="text"
              value={doc.metadata.title}
              onChange={(e) =>
                setDoc(
                  (p) => ({
                    ...p,
                    metadata: { ...p.metadata, title: e.target.value },
                  }),
                  { persist: 'immediate' },
                )
              }
              className="win95-field w-full px-2.5 py-1.5 font-bold text-win-ink"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-scheme-cat`} className="block font-bold text-win-ink">
              <span className="mb-1 block">Категорія схеми</span>
            </label>
            <Win95Dropdown
              id={`${formId}-scheme-cat`}
              testId="editor-scheme-category-select"
              ariaLabel="Категорія схеми"
              value={doc.metadata.category}
              onChange={(nextCat) =>
                setDoc(
                  (p) => ({
                    ...p,
                    metadata: { ...p.metadata, category: nextCat },
                  }),
                  { persist: 'immediate' },
                )
              }
              options={Array.from(
                new Set([
                  'Комбінаційні схеми',
                  'Тригери та лічильники',
                  'ІМС та генератори',
                  'Мікропроцесорні вузли',
                  'Користувацькі проєкти',
                  doc.metadata.category,
                ]),
              ).map((cat) => ({ value: cat, label: cat }))}
              className="w-full"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-rename-desc`} className="block font-bold text-win-ink">
              <span className="mb-1 block">Опис схеми (відображається в «Моїх схемах»)</span>
            </label>
            <textarea
              id={`${formId}-rename-desc`}
              data-testid="editor-description-input"
              rows={3}
              value={doc.metadata.description}
              onChange={(e) =>
                setDoc(
                  (p) => ({
                    ...p,
                    metadata: { ...p.metadata, description: e.target.value },
                  }),
                  { persist: 'immediate' },
                )
              }
              placeholder="Коротко опишіть призначення та роботу схеми..."
              className="win95-field w-full px-2.5 py-1.5 font-normal text-win-ink"
            />
          </div>
        </div>
      </Modal>

      {/* Модальне вікно 6: Обмеження гостьового доступу (потрібна авторизація) */}
      <Modal
        open={Boolean(authGateFeature)}
        onClose={() => setAuthGateFeature(null)}
        title="Потрібна авторизація"
        subtitle="Ця можливість доступна лише зареєстрованим користувачам."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-3 text-xs text-win-ink" data-testid="editor-auth-gate-dialog">
          <p className="leading-relaxed">
            Для дії <strong>«{authGateFeature}»</strong> увійдіть у наявний обліковий запис або
            зареєструйте новий акаунт інженера. Поточна топологія на полотні буде збережена у вашому
            браузері.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link to="/login" className={getButtonClassName('primary', 'sm')}>
              Увійти в акаунт →
            </Link>
            <Link to="/register" className={getButtonClassName('secondary', 'sm')}>
              Реєстрація →
            </Link>
          </div>
        </div>
      </Modal>
    </div>
  );
};
