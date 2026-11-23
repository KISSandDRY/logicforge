import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Minus,
  PanelLeft,
  PanelRight,
} from 'lucide-react';
import {
  STANDARD_COMPONENT_CATALOG,
  analyzeCircuitGraph,
  createNodeFromCatalog,
  synthesizeTruthTable,
  type CircuitNodeData,
  type ComponentCategory,
  type ComponentType,
  type NodeProperties,
  type TruthTableResult,
} from '@logicforge/shared-types';
import { CircuitCanvas } from '../components/circuit/CircuitCanvas';
import { PropertyInspector } from '../components/circuit/PropertyInspector';
import { WaveformPanel } from '../components/circuit/WaveformPanel';
import { ComponentPaletteSidebar } from '../components/editor/ComponentPaletteSidebar';
import { EditorModals } from '../components/editor/EditorModals';
import { EditorToolbar } from '../components/editor/EditorToolbar';
import type { Win95DropdownOption } from '../components/ui/Win95Dropdown';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useCircuitHistory } from '../hooks/useCircuitHistory';
import { useEditorPanels } from '../hooks/useEditorPanels';
import { usePinchWheelZoom } from '../hooks/usePinchWheelZoom';
import { useSimulationPlayback } from '../hooks/useSimulationPlayback';
import { api } from '../services/api';

function findFreeCanvasPlacement(
  existingNodes: CircuitNodeData[],
  width: number,
  height: number,
): { x: number; y: number } {
  const pad = 14;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = 128 + col * 160;
      const cy = 80 + row * 112;
      const occupied = existingNodes.some(
        (existing) =>
          !(
            cx + width + pad <= existing.position.x ||
            existing.position.x + existing.width + pad <= cx ||
            cy + height + pad <= existing.position.y ||
            existing.position.y + existing.height + pad <= cy
          ),
      );
      if (!occupied) {
        return { x: cx, y: cy };
      }
    }
  }
  return { x: 144, y: 80 };
}

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

  const formId = useId();
  const editorRootRef = useRef<HTMLDivElement>(null);

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

  const [stepDeltaNs, setStepDeltaNs] = useState<number>(25);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [authGateFeature, setAuthGateFeature] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('Оновлення топології та параметрів затримок');
  const [saving, setSaving] = useState(false);
  const [truthModalOpen, setTruthModalOpen] = useState(false);
  const [truthTable, setTruthTable] = useState<TruthTableResult | null>(null);
  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [customIcModalOpen, setCustomIcModalOpen] = useState(false);
  const [customIcSubmitted, setCustomIcSubmitted] = useState(false);
  const [icName, setIcName] = useState('Користувацький логічний модуль');
  const [icCode, setIcCode] = useState('IC_USER1');
  const [icDelay, setIcDelay] = useState(16);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3200);
  };

  usePinchWheelZoom({
    targetRef: editorRootRef,
    blockCtrlWheelOnly: true,
  });

  const panels = useEditorPanels();
  const { setShowLeftPanel, setShowRightPanel, setMobilePanelTab } = panels;

  const docRef = useRef(doc);
  docRef.current = doc;
  const customIcsRef = useRef(customIcs);
  customIcsRef.current = customIcs;

  const handleCloseLeftPanel = useCallback(() => setShowLeftPanel(false), [setShowLeftPanel]);
  const handleCloseRightPanel = useCallback(() => setShowRightPanel(false), [setShowRightPanel]);

  const {
    simRef,
    snapshot,
    waveforms,
    loadIntoSimulator,
    handleSingleStep,
    handleResetSimulation,
    markWaveformsCleared,
    handleToggleSwitch,
    handleToggleDipBit,
  } = useSimulationPlayback({
    circuitKey: activeCircuitId,
    doc,
    setDoc,
    customDefinitions: customIcs,
    isRunning,
    setIsRunning,
    initialPeriodicAdvanceNs: 240,
    stepDeltaNs,
    intervalMs: Math.max(45, Math.round(220 / simSpeed)),
    syncWithDoc: true,
  });

  useEffect(() => {
    if (id && id !== activeCircuitId) {
      void selectCircuit(id).then((loadedDoc) => {
        loadIntoSimulator(id, loadedDoc);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setDraggingNodePos(null);
      });
    } else if (!id && activeCircuitId) {
      navigate(`/editor/${activeCircuitId}`, { replace: true });
    }
  }, [id, activeCircuitId, selectCircuit, navigate, loadIntoSimulator]);

  const handleDeleteSelectedRef = useRef<() => void>(() => {});

  const { canUndo, canRedo, pushHistory, handleUndo, handleRedo } = useCircuitHistory({
    doc,
    setDoc,
    onDeleteSelected: useCallback(() => {
      handleDeleteSelectedRef.current();
    }, []),
  });

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

  const handleDeleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    pushHistory((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== selectedEdgeId),
    }));
    setSelectedEdgeId(null);
  }, [pushHistory, selectedEdgeId]);

  handleDeleteSelectedRef.current = () => {
    if (selectedNodeId) {
      handleDeleteNodeById(selectedNodeId);
    } else if (selectedEdgeId) {
      handleDeleteSelectedEdge();
    }
  };

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

  const timingReport = useMemo(
    () => analyzeCircuitGraph({ nodes: doc.nodes, edges: doc.edges }),
    [doc.nodes, doc.edges],
  );

  const selectedNode = useMemo(
    () => (selectedNodeId ? (doc.nodes.find((n) => n.id === selectedNodeId) ?? null) : null),
    [doc.nodes, selectedNodeId],
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

  const addNodeToCanvas = useCallback(
    (type: ComponentType, pos?: { x: number; y: number }, customIcId?: string) => {
      const curDoc = docRef.current;
      const curCustomIcs = customIcsRef.current;
      const icDef = customIcId ? curCustomIcs.find((c) => c.id === customIcId) : undefined;
      const countOfType = curDoc.nodes.filter((n) => n.type === type).length + 1;
      const meta = STANDARD_COMPONENT_CATALOG.find((c) => c.type === type);
      const defaultPrefix = icDef ? icDef.code : (meta?.shortLabel ?? type);
      const idStr = `n_${type.toLowerCase()}_${Date.now().toString(36).slice(-4)}`;

      const probeNode = createNodeFromCatalog(type, '_probe', { x: 0, y: 0 }, undefined, icDef);
      const targetPos =
        pos ?? findFreeCanvasPlacement(curDoc.nodes, probeNode.width, probeNode.height);
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
    },
    [pushHistory, setMobilePanelTab],
  );

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

  const handleConnectPins = useCallback(
    (sourceNodeId: string, sourcePinId: string, targetNodeId: string, targetPinId: string) => {
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
    },
    [pushHistory],
  );

  const handleChangeNodeProperties = useCallback(
    (nodeId: string, patch: Partial<NodeProperties>) => {
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
    },
    [pushHistory, simRef],
  );

  const handleDropCatalogType = useCallback(
    (dropType: ComponentType, dropPos: { x: number; y: number }, customIcId?: string) => {
      setPendingPaletteDrag(null);
      addNodeToCanvas(dropType, dropPos, customIcId);
    },
    [addNodeToCanvas],
  );

  const handleChangeViewport = useCallback(
    (patch: Partial<(typeof doc)['viewport']>) => {
      setDoc((prev) => ({
        ...prev,
        viewport: { ...prev.viewport, ...patch },
      }));
    },
    [setDoc],
  );

  const handleClearCanvas = () => {
    setIsRunning(false);
    pushHistory((prev) => ({
      ...prev,
      nodes: [],
      edges: [],
    }));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setDraggingNodePos(null);
    markWaveformsCleared();
    showToast('Полотно схеми очищено (Ctrl+Z для скасування).');
  };

  const handleOpenTruthTable = useCallback(() => {
    const result = synthesizeTruthTable({
      ...docRef.current,
      customDefinitions: customIcsRef.current,
    });
    setTruthTable(result);
    setTruthModalOpen(true);
  }, []);

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
        internalCircuit: { nodes: doc.nodes, edges: doc.edges },
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
        internalCircuit: { nodes: doc.nodes, edges: doc.edges },
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
        internalCircuit: { nodes: doc.nodes, edges: doc.edges },
      };
      setCustomIcs((prev) => [fallbackIc, ...prev]);
      setCustomIcModalOpen(false);
      setCustomIcSubmitted(false);
      showToast(`Мікросхему ${fallbackIc.code} додано до бібліотеки!`);
    }
  };

  return (
    <div
      ref={editorRootRef}
      className="flex min-h-[calc(100vh-2.75rem)] lg:h-[calc(100vh-2.75rem)] flex-col lg:overflow-hidden bg-win-bg text-win-ink"
    >
      <h1 className="sr-only">Схемотехнічний редактор: {doc.metadata.title}</h1>

      <EditorToolbar
        formId={formId}
        activeCircuitId={activeCircuitId}
        circuitTitle={doc.metadata.title}
        circuitDropdownOptions={circuitDropdownOptions}
        onSelectCircuit={(chosenId) => {
          if (chosenId && chosenId !== activeCircuitId) {
            navigate(`/editor/${chosenId}`);
          }
        }}
        onOpenRename={() => setRenameModalOpen(true)}
        isRunning={isRunning}
        onToggleRun={() => setIsRunning((r) => !r)}
        onSingleStep={handleSingleStep}
        onResetSimulation={handleResetSimulation}
        stepDeltaNs={stepDeltaNs}
        onChangeStepDeltaNs={setStepDeltaNs}
        simSpeed={simSpeed}
        onChangeSimSpeed={setSimSpeed}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canClearCanvas={doc.nodes.length > 0 || doc.edges.length > 0}
        onClearCanvas={handleClearCanvas}
        showLeftPanel={panels.showLeftPanel && panels.maximizedWindow !== 'workspace'}
        onToggleLeftPanel={panels.toggleLeftPanel}
        showSignalsActive={panels.showSignalPanel && panels.maximizedWindow !== 'workspace'}
        onToggleSignalsPanel={panels.toggleSignalsPanel}
        showRightPanel={panels.showRightPanel && panels.maximizedWindow !== 'workspace'}
        onToggleRightPanel={panels.toggleRightPanel}
        onOpenTruthTable={handleOpenTruthTable}
        isAuthenticated={Boolean(user)}
        onOpenCustomIc={() => {
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
        onOpenJson={() => {
          setJsonText(JSON.stringify(doc, null, 2));
          setJsonModalOpen(true);
        }}
        onOpenSaveRevision={() => {
          if (!user) {
            setAuthGateFeature('збереження ревізій та проєктів');
            return;
          }
          setSaveModalOpen(true);
        }}
      />

      {toastMsg && (
        <div className="win95-window fixed bottom-5 right-5 z-50 bg-win-highlight px-4 py-2.5 text-xs font-bold text-win-navy">
          {toastMsg}
        </div>
      )}

      {/* Мобільний перемикач панелей для телефонів та планшетів (< 1024px) */}
      {panels.maximizedWindow !== 'workspace' && (
        <div
          data-testid="editor-mobile-tabs"
          className="flex lg:hidden items-center gap-1 border-b border-win-shadow bg-win-bg px-2 py-1"
        >
          <button
            type="button"
            onClick={() => panels.setMobilePanelTab('workspace')}
            className={`flex-1 inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 py-1 text-xs font-bold touch-manipulation ${
              panels.mobilePanelTab === 'workspace'
                ? 'win95-button-pressed bg-win-surface text-win-ink'
                : 'win95-button text-win-ink'
            }`}
          >
            <Activity className="h-3.5 w-3.5 text-win-navy" />
            <span>Полотно + Сигнали</span>
          </button>
          <button
            type="button"
            onClick={() => panels.setMobilePanelTab('palette')}
            className={`flex-1 inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 py-1 text-xs font-bold touch-manipulation ${
              panels.mobilePanelTab === 'palette'
                ? 'win95-button-pressed bg-win-surface text-win-ink'
                : 'win95-button text-win-ink'
            }`}
          >
            <PanelLeft className="h-3.5 w-3.5 text-win-navy" />
            <span>Бібліотека ({STANDARD_COMPONENT_CATALOG.length})</span>
          </button>
          <button
            type="button"
            onClick={() => panels.setMobilePanelTab('inspector')}
            className={`flex-1 inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 py-1 text-xs font-bold touch-manipulation ${
              panels.mobilePanelTab === 'inspector'
                ? 'win95-button-pressed bg-win-surface text-win-ink'
                : 'win95-button text-win-ink'
            }`}
          >
            <PanelRight className="h-3.5 w-3.5 text-win-navy" />
            <span>Інспектор</span>
          </button>
        </div>
      )}

      {/* Основна гнучка багатопанельна робоча область САПР у стилі вікон Windows 95 */}
      <div ref={panels.editorBodyRef} className="flex flex-1 min-h-0 p-1.5 overflow-hidden">
        {panels.showLeftPanel && panels.maximizedWindow !== 'workspace' && (
          <ComponentPaletteSidebar
            formId={formId}
            widthPx={panels.leftPanelWidth}
            isMobileActive={panels.mobilePanelTab === 'palette'}
            paletteSearch={paletteSearch}
            onChangePaletteSearch={setPaletteSearch}
            paletteCategory={paletteCategory}
            onChangePaletteCategory={setPaletteCategory}
            customIcs={customIcs}
            onStartPaletteDrag={setPendingPaletteDrag}
            onAddComponent={addNodeToCanvas}
            onClosePanel={handleCloseLeftPanel}
          />
        )}

        {panels.maximizedWindow !== 'workspace' && (
          <div
            data-testid="resizer-left"
            role="separator"
            aria-orientation="vertical"
            aria-label="Зміна ширини палітри компонентів"
            onPointerDown={panels.startResizeLeft}
            onDoubleClick={() => panels.setShowLeftPanel((v) => !v)}
            title={
              panels.showLeftPanel
                ? 'Потягніть вліво щоб зменшити або закрити бібліотеку компонентів'
                : 'Потягніть праворуч або двічі клацніть щоб відкрити бібліотеку компонентів'
            }
            className={`hidden lg:flex group w-2.5 coarse:w-4 shrink-0 select-none touch-none cursor-col-resize items-center justify-center transition-colors ${
              panels.showLeftPanel
                ? 'hover:bg-win-surface'
                : 'win95-outset bg-win-surface hover:bg-win-highlight'
            }`}
          >
            <div className="h-12 w-1 border-x border-win-shadow bg-win-highlight/60" />
          </div>
        )}

        {/* 2. Центральна область: ПОЛОТНО + ЛОГІЧНИЙ АНАЛІЗАТОР */}
        <div
          ref={panels.centerColumnRef}
          className={`flex-1 min-w-0 flex-col lg:overflow-hidden ${
            panels.mobilePanelTab === 'workspace' || panels.maximizedWindow === 'workspace'
              ? 'flex'
              : 'hidden lg:flex'
          }`}
        >
          {panels.maximizedWindow !== 'signals' && (
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
                  <button
                    type="button"
                    onClick={() => {
                      panels.setShowSignalPanel(true);
                      panels.setMaximizedWindow('signals');
                    }}
                    aria-label="Згорнути полотно схеми на користь аналізатора"
                    title="Згорнути схему та відкрити логічний аналізатор на весь екран"
                    className="win95-button inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center justify-center touch-manipulation text-win-ink"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-testid="btn-toggle-maximize-workspace"
                    onClick={() =>
                      panels.setMaximizedWindow((w) => (w === 'workspace' ? null : 'workspace'))
                    }
                    aria-label={
                      panels.maximizedWindow === 'workspace'
                        ? 'Відновити розділення вікон'
                        : 'Розгорнути полотно схеми на весь екран'
                    }
                    title={
                      panels.maximizedWindow === 'workspace'
                        ? 'Відновити бічні панелі та логічний аналізатор'
                        : 'Розгорнути полотно на весь екран (сховати всі інші панелі)'
                    }
                    className="win95-button inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center justify-center touch-manipulation text-win-ink"
                  >
                    {panels.maximizedWindow === 'workspace' ? (
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
                  onDropCatalogType={handleDropCatalogType}
                  onToggleSwitch={handleToggleSwitch}
                  onToggleDipBit={handleToggleDipBit}
                  onChangeViewport={handleChangeViewport}
                />
              </div>
            </section>
          )}

          {panels.maximizedWindow !== 'workspace' && (
            <div
              data-testid="resizer-signals"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Зміна висоти вікна логічного аналізатора"
              onPointerDown={panels.startResizeSignal}
              onDoubleClick={() => {
                if (panels.maximizedWindow === 'signals') {
                  panels.setMaximizedWindow(null);
                  panels.setShowSignalPanel(true);
                } else if (!panels.showSignalPanel) {
                  panels.setMaximizedWindow(null);
                  panels.setShowSignalPanel(true);
                } else {
                  panels.setShowSignalPanel(false);
                }
              }}
              title={
                panels.maximizedWindow === 'signals'
                  ? 'Потягніть вниз щоб відкрити полотно схеми'
                  : panels.showSignalPanel
                    ? 'Потягніть вгору/вниз щоб змінити розмір, донизу щоб закрити, або догори на максимум'
                    : 'Потягніть вгору або двічі клацніть щоб відкрити логічний аналізатор'
              }
              className={`group flex shrink-0 select-none touch-none cursor-row-resize items-center justify-center transition-colors ${
                panels.showSignalPanel && panels.maximizedWindow === null
                  ? 'h-2.5 coarse:h-4 hover:bg-win-surface'
                  : 'h-4 coarse:h-5 win95-outset bg-win-surface hover:bg-win-highlight'
              }`}
            >
              {panels.maximizedWindow === 'signals' ? (
                <span className="text-[11px] font-bold text-win-ink">
                  ▼ Потягніть вниз щоб відновити схему
                </span>
              ) : !panels.showSignalPanel ? (
                <span className="text-[11px] font-bold text-win-ink">
                  ▲ Потягніть вгору щоб відкрити логічний аналізатор
                </span>
              ) : (
                <div className="h-1 w-14 border-y border-win-shadow bg-win-highlight/60" />
              )}
            </div>
          )}

          {(panels.showSignalPanel || panels.maximizedWindow === 'signals') &&
            panels.maximizedWindow !== 'workspace' && (
              <section
                data-testid="signals-window"
                style={
                  panels.maximizedWindow === 'signals'
                    ? undefined
                    : { height: `${panels.signalPanelHeight}px` }
                }
                className={`win95-window flex flex-col overflow-hidden ${
                  panels.maximizedWindow === 'signals' ? 'flex-1 min-h-[260px]' : 'shrink-0'
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
                        panels.setMaximizedWindow(null);
                        panels.setShowSignalPanel(false);
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
                        panels.setMaximizedWindow((w) => (w === 'signals' ? null : 'signals'))
                      }
                      aria-label={
                        panels.maximizedWindow === 'signals'
                          ? 'Відновити розмір вікна сигналів'
                          : 'Розгорнути логічний аналізатор на весь екран'
                      }
                      title={
                        panels.maximizedWindow === 'signals'
                          ? 'Повернути розділення зі схемою'
                          : 'Розгорнути на всю висоту робочої області'
                      }
                      className="win95-button inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center gap-1 px-2.5 py-1 text-xs font-bold touch-manipulation text-win-ink"
                    >
                      {panels.maximizedWindow === 'signals' ? (
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

        {panels.maximizedWindow !== 'workspace' && (
          <div
            data-testid="resizer-right"
            role="separator"
            aria-orientation="vertical"
            aria-label="Зміна ширини панелі управління та властивостей"
            onPointerDown={panels.startResizeRight}
            onDoubleClick={() => panels.setShowRightPanel((v) => !v)}
            title={
              panels.showRightPanel
                ? 'Потягніть вправо щоб зменшити або закрити інспектор'
                : 'Потягніть вліво або двічі клацніть щоб відкрити інспектор'
            }
            className={`hidden lg:flex group w-2.5 coarse:w-4 shrink-0 select-none touch-none cursor-col-resize items-center justify-center transition-colors ${
              panels.showRightPanel
                ? 'hover:bg-win-surface'
                : 'win95-outset bg-win-surface hover:bg-win-highlight'
            }`}
          >
            <div className="h-12 w-1 border-x border-win-shadow bg-win-highlight/60" />
          </div>
        )}

        {panels.showRightPanel && panels.maximizedWindow !== 'workspace' && (
          <aside
            style={{ width: `${panels.rightPanelWidth}px` }}
            className={`shrink-0 flex-col overflow-hidden max-lg:!w-full ${
              panels.mobilePanelTab === 'inspector' ? 'flex' : 'hidden lg:flex'
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
                    onClick={handleCloseRightPanel}
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
                  onDeleteSelectedEdge={handleDeleteSelectedEdge}
                  onOpenTruthTable={handleOpenTruthTable}
                  onChangeProperties={handleChangeNodeProperties}
                  onDeleteNode={handleDeleteNodeById}
                />
              </div>
            </div>
          </aside>
        )}
      </div>

      <EditorModals
        formId={formId}
        doc={doc}
        onUpdateMetadata={(patch, persist) =>
          setDoc((p) => ({ ...p, metadata: { ...p.metadata, ...patch } }), { persist })
        }
        onImportDocument={(sanitized) => pushHistory(() => sanitized)}
        onToast={showToast}
        saveModalOpen={saveModalOpen}
        onCloseSaveModal={() => setSaveModalOpen(false)}
        commitMessage={commitMessage}
        onChangeCommitMessage={setCommitMessage}
        saving={saving}
        onSaveCircuit={() => void handleSaveCircuit()}
        truthModalOpen={truthModalOpen}
        onCloseTruthModal={() => setTruthModalOpen(false)}
        truthTable={truthTable}
        jsonModalOpen={jsonModalOpen}
        onCloseJsonModal={() => setJsonModalOpen(false)}
        jsonText={jsonText}
        onChangeJsonText={setJsonText}
        customIcModalOpen={customIcModalOpen}
        onCloseCustomIcModal={() => setCustomIcModalOpen(false)}
        sourceCustomIc={sourceCustomIc}
        detectedCustomIcPins={detectedCustomIcPins}
        icName={icName}
        onChangeIcName={setIcName}
        icCode={icCode}
        onChangeIcCode={setIcCode}
        icDelay={icDelay}
        onChangeIcDelay={setIcDelay}
        customIcSubmitted={customIcSubmitted}
        onCreateCustomIc={(existingId) => void handleCreateCustomIc(existingId)}
        renameModalOpen={renameModalOpen}
        onCloseRenameModal={() => setRenameModalOpen(false)}
        authGateFeature={authGateFeature}
        onCloseAuthGate={() => setAuthGateFeature(null)}
      />
    </div>
  );
};
