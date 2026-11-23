import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CircuitSimulator,
  type CircuitDocument,
  type CircuitNodeData,
  type CustomICDefinition,
  type LogicState,
  type SimulationSnapshot,
  type WaveformSample,
} from '@logicforge/shared-types';

export function hasPeriodicSources(doc: Pick<CircuitDocument, 'nodes'>): boolean {
  return doc.nodes.some((n) => n.type === 'CLOCK' || n.type === 'TIMER_555');
}

export function settleSimulatorInitial(
  sim: CircuitSimulator,
  doc: Pick<CircuitDocument, 'nodes'>,
  periodicAdvanceNs = 240,
): SimulationSnapshot {
  return hasPeriodicSources(doc) ? sim.advanceBy(periodicAdvanceNs) : sim.settleCombinational(300);
}

/**
 * Автоматично подає наступний двійковий вектор на перемикачі (INPUT_SWITCH або DIP_SWITCH_4)
 * для комбінаційних схем без вбудованих генераторів CLOCK/NE555.
 */
export function applyCombinationalStimulusStep(
  doc: CircuitDocument,
  sim: CircuitSimulator,
  stepIndex: number,
  setDoc: (updater: (prev: CircuitDocument) => CircuitDocument) => void,
): void {
  const switches = doc.nodes.filter((n) => n.type === 'INPUT_SWITCH');
  const dipNodes = doc.nodes.filter((n) => n.type === 'DIP_SWITCH_4');

  if (switches.length > 0) {
    const updatedMap = new Map<string, LogicState>();
    switches.forEach((sw, idx) => {
      const bit: LogicState = ((stepIndex >> idx) & 1) === 1 ? '1' : '0';
      sim.setInputState(sw.id, bit);
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
    const dip = dipNodes[0];
    const nextTuple: [LogicState, LogicState, LogicState, LogicState] = [
      (stepIndex & 1) === 1 ? '1' : '0',
      ((stepIndex >> 1) & 1) === 1 ? '1' : '0',
      ((stepIndex >> 2) & 1) === 1 ? '1' : '0',
      ((stepIndex >> 3) & 1) === 1 ? '1' : '0',
    ];
    nextTuple.forEach((st, bitIdx) => {
      sim.setDipSwitchBit(dip.id, bitIdx, st);
    });
    setDoc((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === dip.id ? { ...n, properties: { ...n.properties, dipSwitchStates: nextTuple } } : n,
      ),
    }));
  }
}

export function mergeDocumentCustomIcs(
  doc: CircuitDocument,
  customIcs?: CustomICDefinition[],
): CircuitDocument {
  if (!customIcs || customIcs.length === 0) return doc;
  const mergedDefsMap = new Map((doc.customDefinitions ?? []).map((d) => [d.id, d]));
  for (const ic of customIcs) {
    mergedDefsMap.set(ic.id, ic);
  }
  return {
    ...doc,
    customDefinitions: Array.from(mergedDefsMap.values()),
  };
}

export interface UseSimulationPlaybackOptions {
  circuitKey: string;
  doc: CircuitDocument;
  setDoc: (updater: (prev: CircuitDocument) => CircuitDocument) => void;
  customDefinitions?: CustomICDefinition[];
  isRunning: boolean;
  setIsRunning?: (running: boolean) => void;
  initialPeriodicAdvanceNs?: number;
  stepDeltaNs?: number;
  intervalMs?: number;
  syncWithDoc?: boolean;
}

export function useSimulationPlayback({
  circuitKey,
  doc,
  setDoc,
  customDefinitions,
  isRunning,
  setIsRunning,
  initialPeriodicAdvanceNs = 240,
  stepDeltaNs = 25,
  intervalMs = 220,
  syncWithDoc = true,
}: UseSimulationPlaybackOptions) {
  const simRef = useRef<CircuitSimulator>(
    new CircuitSimulator(mergeDocumentCustomIcs(doc, customDefinitions)),
  );
  const loadedKeyRef = useRef<string>(circuitKey);
  const syncedTopologyRef = useRef<{
    nodes: CircuitDocument['nodes'];
    edges: CircuitDocument['edges'];
    docCustomDefs: CircuitDocument['customDefinitions'];
    customDefs: CustomICDefinition[] | undefined;
  }>({
    nodes: doc.nodes,
    edges: doc.edges,
    docCustomDefs: doc.customDefinitions,
    customDefs: customDefinitions,
  });
  const autoVectorStepRef = useRef<number>(0);
  const analyzerClearedRef = useRef<boolean>(false);
  const docRef = useRef<CircuitDocument>(doc);
  docRef.current = doc;

  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() =>
    settleSimulatorInitial(simRef.current, doc, initialPeriodicAdvanceNs),
  );
  const [waveforms, setWaveforms] = useState<WaveformSample[]>(() => [
    ...simRef.current.getWaveformHistory(),
  ]);

  useEffect(() => {
    if (!syncWithDoc) return;
    if (loadedKeyRef.current !== circuitKey) {
      loadedKeyRef.current = circuitKey;
      syncedTopologyRef.current = {
        nodes: doc.nodes,
        edges: doc.edges,
        docCustomDefs: doc.customDefinitions,
        customDefs: customDefinitions,
      };
      analyzerClearedRef.current = false;
      const mergedDoc = mergeDocumentCustomIcs(doc, customDefinitions);
      simRef.current.loadCircuit(mergedDoc);
      setSnapshot(settleSimulatorInitial(simRef.current, mergedDoc, initialPeriodicAdvanceNs));
      setWaveforms([...simRef.current.getWaveformHistory()]);
    } else {
      const prev = syncedTopologyRef.current;
      if (
        prev.nodes === doc.nodes &&
        prev.edges === doc.edges &&
        prev.docCustomDefs === doc.customDefinitions &&
        prev.customDefs === customDefinitions
      ) {
        return;
      }
      syncedTopologyRef.current = {
        nodes: doc.nodes,
        edges: doc.edges,
        docCustomDefs: doc.customDefinitions,
        customDefs: customDefinitions,
      };
      const mergedDoc = mergeDocumentCustomIcs(doc, customDefinitions);
      const snap = simRef.current.syncCircuit(mergedDoc);
      setSnapshot(snap);
      if (!analyzerClearedRef.current) {
        setWaveforms([...simRef.current.getWaveformHistory()]);
      }
    }
  }, [circuitKey, customDefinitions, doc, initialPeriodicAdvanceNs, syncWithDoc]);

  const loadIntoSimulator = useCallback(
    (
      nextKey: string,
      nextDoc: CircuitDocument,
      options?: { clearWaveforms?: boolean; advanceNs?: number },
    ) => {
      loadedKeyRef.current = nextKey;
      docRef.current = nextDoc;
      syncedTopologyRef.current = {
        nodes: nextDoc.nodes,
        edges: nextDoc.edges,
        docCustomDefs: nextDoc.customDefinitions,
        customDefs: customDefinitions,
      };
      autoVectorStepRef.current = 0;
      const merged = mergeDocumentCustomIcs(nextDoc, customDefinitions);
      simRef.current.loadCircuit(merged);
      if (options?.clearWaveforms) {
        analyzerClearedRef.current = true;
        simRef.current.clearWaveformHistory();
        setSnapshot(simRef.current.getSnapshot());
        setWaveforms([]);
      } else {
        analyzerClearedRef.current = false;
        setSnapshot(
          settleSimulatorInitial(
            simRef.current,
            merged,
            options?.advanceNs ?? initialPeriodicAdvanceNs,
          ),
        );
        setWaveforms([...simRef.current.getWaveformHistory()]);
      }
    },
    [customDefinitions, initialPeriodicAdvanceNs],
  );

  const advanceSimulationTick = useCallback(
    (deltaNs: number = stepDeltaNs) => {
      analyzerClearedRef.current = false;
      const currentDoc = docRef.current;
      if (!hasPeriodicSources(currentDoc)) {
        autoVectorStepRef.current += 1;
        applyCombinationalStimulusStep(
          currentDoc,
          simRef.current,
          autoVectorStepRef.current,
          setDoc,
        );
      }
      const nextSnap = simRef.current.advanceBy(deltaNs);
      setSnapshot(nextSnap);
      setWaveforms([...simRef.current.getWaveformHistory()]);
    },
    [setDoc, stepDeltaNs],
  );

  useEffect(() => {
    if (!isRunning) return;
    analyzerClearedRef.current = false;
    if (simRef.current.getWaveformHistory().length === 0) {
      advanceSimulationTick(stepDeltaNs);
    }
    const timer = window.setInterval(() => {
      advanceSimulationTick(stepDeltaNs);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isRunning, stepDeltaNs, intervalMs, advanceSimulationTick]);

  const handleSingleStep = useCallback(() => {
    setIsRunning?.(false);
    analyzerClearedRef.current = false;
    if (hasPeriodicSources(docRef.current)) {
      const snap = simRef.current.stepSingleEvent();
      setSnapshot(snap);
      setWaveforms([...simRef.current.getWaveformHistory()]);
    } else {
      advanceSimulationTick(stepDeltaNs);
    }
  }, [advanceSimulationTick, setIsRunning, stepDeltaNs]);

  const handleResetSimulation = useCallback(() => {
    setIsRunning?.(false);
    autoVectorStepRef.current = 0;
    analyzerClearedRef.current = true;
    simRef.current.reset();
    simRef.current.clearWaveformHistory();
    setSnapshot(simRef.current.getSnapshot());
    setWaveforms([]);
  }, [setIsRunning]);

  const markWaveformsCleared = useCallback(() => {
    analyzerClearedRef.current = true;
    simRef.current.reset();
    simRef.current.clearWaveformHistory();
    setWaveforms([]);
  }, []);

  const handleToggleSwitch = useCallback(
    (node: CircuitNodeData, cycleTriState: boolean) => {
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
    },
    [setDoc],
  );

  const handleToggleDipBit = useCallback(
    (node: CircuitNodeData, bitIndex: number) => {
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
          const tuple: [LogicState, LogicState, LogicState, LogicState] = [
            ...(n.properties.dipSwitchStates ?? ['0', '0', '0', '0']),
          ] as [LogicState, LogicState, LogicState, LogicState];
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
    },
    [setDoc],
  );

  return {
    simRef,
    snapshot,
    waveforms,
    loadIntoSimulator,
    advanceSimulationTick,
    handleSingleStep,
    handleResetSimulation,
    markWaveformsCleared,
    handleToggleSwitch,
    handleToggleDipBit,
  };
}
