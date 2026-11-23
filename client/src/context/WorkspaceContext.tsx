import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  PRESET_CIRCUITS,
  analyzeCircuitGraph,
  buildFullAdderPreset,
  normalizeCircuitNodesWithCatalog,
  safeParseCircuitSummaryList,
  safeParseCustomIcList,
  sanitizeAndValidateCircuitDocument,
  type CircuitDocument,
  type CircuitSummaryDTO,
  type CustomICDefinition,
} from '@logicforge/shared-types';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

const ACTIVE_ID_STORAGE_KEY = 'logicforge_active_circuit_id_v2';
const DRAFT_PREFIX = 'logicforge_circuit_draft_v2_';
const USER_SUMMARIES_STORAGE_KEY = 'logicforge_user_circuits_v2';
const CUSTOM_ICS_STORAGE_KEY = 'logicforge_custom_ics_v1';

function loadStoredCustomIcs(): CustomICDefinition[] {
  try {
    return safeParseCustomIcList(localStorage.getItem(CUSTOM_ICS_STORAGE_KEY));
  } catch {
    return [];
  }
}

function saveStoredCustomIcs(list: CustomICDefinition[]): void {
  try {
    localStorage.setItem(CUSTOM_ICS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

function buildDefaultSummaries(): CircuitSummaryDTO[] {
  return PRESET_CIRCUITS.map((p) => {
    const timing = analyzeCircuitGraph(p.document);
    return {
      id: p.id,
      title: p.document.metadata.title,
      description: p.document.metadata.description,
      category: p.document.metadata.category,
      isPublic: true,
      tags: [...p.document.metadata.tags],
      nodeCount: p.document.nodes.length,
      edgeCount: p.document.edges.length,
      criticalPathNs: timing.criticalPathDelayNs,
      maxClockMhz: timing.maxClockFrequencyMhz,
      authorId: 'u-demo-lpnu-001',
      authorName: 'Інженер-схемотехнік',
      createdAt: p.document.metadata.createdAt,
      updatedAt: p.document.metadata.updatedAt,
    };
  });
}

function loadStoredUserSummaries(): CircuitSummaryDTO[] {
  try {
    return safeParseCircuitSummaryList(localStorage.getItem(USER_SUMMARIES_STORAGE_KEY));
  } catch {
    return [];
  }
}

function saveStoredUserSummaries(list: CircuitSummaryDTO[]): void {
  try {
    const userOnly = list.filter((c) => !c.id.startsWith('preset-'));
    localStorage.setItem(USER_SUMMARIES_STORAGE_KEY, JSON.stringify(userOnly));
  } catch {
    // ignore storage quota errors
  }
}

function mergeCircuitLists(
  presets: CircuitSummaryDTO[],
  storedUser: CircuitSummaryDTO[],
  remoteList: CircuitSummaryDTO[],
): CircuitSummaryDTO[] {
  const map = new Map<string, CircuitSummaryDTO>();
  for (const item of storedUser) {
    map.set(item.id, item);
  }
  for (const item of presets) {
    const draft = loadDraftFromStorage(item.id);
    if (draft) {
      const timing = analyzeCircuitGraph(draft);
      map.set(item.id, {
        ...item,
        title: draft.metadata.title,
        description: draft.metadata.description,
        category: draft.metadata.category,
        tags: [...draft.metadata.tags],
        nodeCount: draft.nodes.length,
        edgeCount: draft.edges.length,
        criticalPathNs: timing.criticalPathDelayNs,
        maxClockMhz: timing.maxClockFrequencyMhz,
        updatedAt: draft.metadata.updatedAt,
      });
    } else {
      map.set(item.id, item);
    }
  }
  for (const item of remoteList) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

function getPresetDocumentById(id: string): CircuitDocument | null {
  const found = PRESET_CIRCUITS.find((p) => p.id === id || p.slug === id);
  if (!found) return null;
  return JSON.parse(JSON.stringify(found.document)) as CircuitDocument;
}

function loadDraftFromStorage(id: string): CircuitDocument | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${id}`);
    if (!raw) return null;
    return sanitizeAndValidateCircuitDocument(raw, { strictPinRefs: false });
  } catch {
    // ignore corrupt or invalid localStorage draft safely
    return null;
  }
}

function saveDraftToStorage(id: string, doc: CircuitDocument): void {
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${id}`, JSON.stringify(doc));
  } catch {
    // ignore quota errors
  }
}

function removeDraftFromStorage(id: string): void {
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${id}`);
  } catch {
    // ignore
  }
}

export interface CreateCircuitOptions {
  mode?: 'empty' | 'template';
  templateId?: string;
  title?: string;
  description?: string;
  category?: string;
}

export interface UpdateDocumentOptions {
  persist?: 'debounced' | 'immediate' | 'skip';
}

export interface WorkspaceContextValue {
  activeCircuitId: string;
  activeDocument: CircuitDocument;
  circuits: CircuitSummaryDTO[];
  customIcs: CustomICDefinition[];
  loadingCircuits: boolean;
  isSimulationRunning: boolean;
  setIsSimulationRunning: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSimulationRunning: () => void;
  selectCircuit: (
    circuitId: string,
    options?: { forceResetToPreset?: boolean },
  ) => Promise<CircuitDocument>;
  updateActiveDocument: (
    updater: CircuitDocument | ((prev: CircuitDocument) => CircuitDocument),
    options?: UpdateDocumentOptions,
  ) => void;
  setActiveCircuitIdAndDoc: (circuitId: string, doc: CircuitDocument) => void;
  createNewCircuit: (options?: CreateCircuitOptions) => { id: string; doc: CircuitDocument };
  duplicateCircuit: (sourceId: string) => Promise<{ id: string; doc: CircuitDocument }>;
  deleteCircuit: (circuitId: string) => Promise<void>;
  refreshCircuits: () => Promise<void>;
  refreshCustomIcs: () => Promise<void>;
  updateCustomIc: (
    icId: string,
    patch: Partial<Omit<CustomICDefinition, 'id'>>,
  ) => Promise<CustomICDefinition | null>;
  deleteCustomIc: (icId: string) => Promise<void>;
  openCustomIcInEditor: (ic: CustomICDefinition) => string;
  setCustomIcs: React.Dispatch<React.SetStateAction<CustomICDefinition[]>>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);

  const [activeCircuitId, setActiveCircuitId] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTIVE_ID_STORAGE_KEY) || 'preset-full-adder';
    } catch {
      return 'preset-full-adder';
    }
  });

  const [activeDocument, setActiveDocument] = useState<CircuitDocument>(() => {
    const initialId = (() => {
      try {
        return localStorage.getItem(ACTIVE_ID_STORAGE_KEY) || 'preset-full-adder';
      } catch {
        return 'preset-full-adder';
      }
    })();
    return (
      loadDraftFromStorage(initialId) ?? getPresetDocumentById(initialId) ?? buildFullAdderPreset()
    );
  });

  const [circuits, setCircuits] = useState<CircuitSummaryDTO[]>(() =>
    user
      ? mergeCircuitLists(buildDefaultSummaries(), loadStoredUserSummaries(), [])
      : buildDefaultSummaries(),
  );
  const [customIcs, setCustomIcsState] = useState<CustomICDefinition[]>(() =>
    user ? loadStoredCustomIcs() : [],
  );

  const setCustomIcs: React.Dispatch<React.SetStateAction<CustomICDefinition[]>> = useCallback(
    (updater) => {
      setCustomIcsState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (isAuthenticatedRef.current) {
          saveStoredCustomIcs(next);
        }
        return next;
      });
    },
    [],
  );
  const [loadingCircuits, setLoadingCircuits] = useState<boolean>(false);
  const [isSimulationRunning, setIsSimulationRunning] = useState<boolean>(false);
  const activeIdRef = useRef<string>(activeCircuitId);
  activeIdRef.current = activeCircuitId;
  const isAuthenticatedRef = useRef<boolean>(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;
  const persistTimerRef = useRef<number | null>(null);

  const toggleSimulationRunning = useCallback(() => {
    setIsSimulationRunning((prev) => !prev);
  }, []);

  const refreshCircuits = useCallback(async () => {
    if (!isAuthenticatedRef.current) {
      setCircuits(buildDefaultSummaries());
      setLoadingCircuits(false);
      return;
    }
    setLoadingCircuits(true);
    try {
      const res = await api.listCircuits({ mine: true });
      const merged = mergeCircuitLists(
        buildDefaultSummaries(),
        loadStoredUserSummaries(),
        res.circuits,
      );
      setCircuits(merged);
      saveStoredUserSummaries(merged);
    } catch {
      const merged = mergeCircuitLists(buildDefaultSummaries(), loadStoredUserSummaries(), []);
      setCircuits(merged);
    } finally {
      setLoadingCircuits(false);
    }
  }, []);

  const refreshCustomIcs = useCallback(async () => {
    if (!isAuthenticatedRef.current) {
      setCustomIcsState([]);
      return;
    }
    const localStored = loadStoredCustomIcs();
    try {
      const res = await api.listCustomComponents();
      const map = new Map<string, CustomICDefinition>();
      for (const item of res.customComponents) map.set(item.id, item);
      for (const item of localStored) {
        if (!map.has(item.id) && item.id.startsWith('ic-local-')) {
          map.set(item.id, item);
        }
      }
      const merged = Array.from(map.values());
      setCustomIcsState(merged);
      saveStoredCustomIcs(merged);
    } catch {
      setCustomIcsState(localStored);
    }
  }, []);

  const deleteCustomIc = useCallback(async (icId: string) => {
    if (!icId.startsWith('ic-local-')) {
      try {
        await api.deleteCustomComponent(icId);
      } catch {
        // ignore offline
      }
    }
    setCustomIcsState((prev) => {
      const next = prev.filter((item) => item.id !== icId);
      if (isAuthenticatedRef.current) {
        saveStoredCustomIcs(next);
      }
      return next;
    });
  }, []);

  const updateCustomIc = useCallback(
    async (
      icId: string,
      patch: Partial<Omit<CustomICDefinition, 'id'>>,
    ): Promise<CustomICDefinition | null> => {
      let updatedLocal: CustomICDefinition | null = null;
      setCustomIcsState((prev) => {
        const existing = prev.find((item) => item.id === icId);
        if (!existing) return prev;
        updatedLocal = { ...existing, ...patch, id: existing.id };
        const next = prev.map((item) => (item.id === icId ? updatedLocal! : item));
        if (isAuthenticatedRef.current) {
          saveStoredCustomIcs(next);
        }
        return next;
      });

      if (!updatedLocal) return null;

      if (!icId.startsWith('ic-local-')) {
        try {
          const res = await api.updateCustomComponent(icId, patch);
          const serverDef = res.customComponent;
          setCustomIcsState((prev) => {
            const next = prev.map((item) => (item.id === icId ? serverDef : item));
            if (isAuthenticatedRef.current) {
              saveStoredCustomIcs(next);
            }
            return next;
          });
          return serverDef;
        } catch {
          // Offline or shared preset: keep local edit synced
        }
      }
      return updatedLocal;
    },
    [],
  );

  useEffect(() => {
    void refreshCircuits();
    void refreshCustomIcs();
  }, [user?.id, refreshCircuits, refreshCustomIcs]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  const syncCircuitSummaryAndDraft = useCallback((circuitId: string, doc: CircuitDocument) => {
    saveDraftToStorage(circuitId, doc);
    const timing = analyzeCircuitGraph(doc);
    const summary: CircuitSummaryDTO = {
      id: circuitId,
      title: doc.metadata.title,
      description: doc.metadata.description,
      category: doc.metadata.category,
      isPublic: true,
      tags: [...doc.metadata.tags],
      nodeCount: doc.nodes.length,
      edgeCount: doc.edges.length,
      criticalPathNs: timing.criticalPathDelayNs,
      maxClockMhz: timing.maxClockFrequencyMhz,
      authorId: 'u-demo-lpnu-001',
      authorName: 'Інженер-схемотехнік',
      createdAt: doc.metadata.createdAt,
      updatedAt: doc.metadata.updatedAt,
    };

    setCircuits((prev) => {
      if (!isAuthenticatedRef.current) {
        return prev;
      }
      const exists = prev.some((c) => c.id === circuitId);
      const nextList = exists
        ? prev.map((c) => (c.id === circuitId ? { ...c, ...summary } : c))
        : [summary, ...prev];
      saveStoredUserSummaries(nextList);
      return nextList;
    });
  }, []);

  const setActiveCircuitIdAndDoc = useCallback(
    (circuitId: string, doc: CircuitDocument) => {
      activeIdRef.current = circuitId;
      setActiveCircuitId(circuitId);
      setActiveDocument(doc);
      try {
        localStorage.setItem(ACTIVE_ID_STORAGE_KEY, circuitId);
      } catch {
        // ignore
      }
      syncCircuitSummaryAndDraft(circuitId, doc);
    },
    [syncCircuitSummaryAndDraft],
  );

  const selectCircuit = useCallback(
    async (
      circuitId: string,
      options?: { forceResetToPreset?: boolean },
    ): Promise<CircuitDocument> => {
      const targetId = circuitId || 'preset-full-adder';
      activeIdRef.current = targetId;
      setActiveCircuitId(targetId);
      try {
        localStorage.setItem(ACTIVE_ID_STORAGE_KEY, targetId);
      } catch {
        // ignore
      }

      if (options?.forceResetToPreset) {
        removeDraftFromStorage(targetId);
      } else {
        const cached = loadDraftFromStorage(targetId);
        if (cached) {
          setActiveDocument(cached);
          return cached;
        }
      }

      try {
        const res = await api.getCircuit(targetId);
        const loaded = normalizeCircuitNodesWithCatalog(res.circuit.schemaJson);
        setActiveDocument(loaded);
        saveDraftToStorage(targetId, loaded);
        return loaded;
      } catch {
        const presetDoc = getPresetDocumentById(targetId) ?? buildFullAdderPreset();
        setActiveDocument(presetDoc);
        saveDraftToStorage(targetId, presetDoc);
        return presetDoc;
      }
    },
    [],
  );

  const updateActiveDocument = useCallback(
    (
      updater: CircuitDocument | ((prev: CircuitDocument) => CircuitDocument),
      options?: UpdateDocumentOptions,
    ) => {
      const persistMode = options?.persist ?? 'debounced';
      setActiveDocument((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const currentId = activeIdRef.current;

        if (persistTimerRef.current !== null) {
          window.clearTimeout(persistTimerRef.current);
          persistTimerRef.current = null;
        }

        if (persistMode === 'skip') {
          return next;
        }

        if (persistMode === 'immediate') {
          syncCircuitSummaryAndDraft(currentId, next);
          return next;
        }

        persistTimerRef.current = window.setTimeout(() => {
          persistTimerRef.current = null;
          syncCircuitSummaryAndDraft(currentId, next);
        }, 140);

        return next;
      });
    },
    [syncCircuitSummaryAndDraft],
  );

  const createNewCircuit = useCallback(
    (options?: CreateCircuitOptions): { id: string; doc: CircuitDocument } => {
      const newId = `draft-${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      const requestedMode = options?.mode ?? 'empty';

      if (requestedMode === 'template' && options?.templateId) {
        const templateDoc = getPresetDocumentById(options.templateId);
        if (templateDoc) {
          const clonedDoc: CircuitDocument = {
            ...templateDoc,
            metadata: {
              ...templateDoc.metadata,
              title: options?.title?.trim() || `${templateDoc.metadata.title} (Копія)`,
              description: options?.description?.trim() || templateDoc.metadata.description,
              category: options?.category?.trim() || templateDoc.metadata.category,
              createdAt: now,
              updatedAt: now,
            },
          };
          setActiveCircuitIdAndDoc(newId, clonedDoc);
          return { id: newId, doc: clonedDoc };
        }
      }

      const finalTitle = options?.title?.trim() || 'Нова цифрова схема';
      const finalCategory = options?.category?.trim() || 'Комбінаційні схеми';
      const emptyDoc: CircuitDocument = {
        metadata: {
          schemaVersion: '1.0.0',
          title: finalTitle,
          description:
            options?.description?.trim() ||
            `Користувацька цифрова схема «${finalTitle}» (${finalCategory.toLowerCase()}).`,
          category: finalCategory,
          tags: ['нова схема', 'проєкт'],
          createdAt: now,
          updatedAt: now,
        },
        viewport: { panX: 20, panY: 20, zoom: 1, gridSnap: true },
        nodes: [],
        edges: [],
      };

      setActiveCircuitIdAndDoc(newId, emptyDoc);
      return { id: newId, doc: emptyDoc };
    },
    [setActiveCircuitIdAndDoc],
  );

  const duplicateCircuit = useCallback(
    async (sourceId: string): Promise<{ id: string; doc: CircuitDocument }> => {
      let baseDoc = loadDraftFromStorage(sourceId) ?? getPresetDocumentById(sourceId);
      if (!baseDoc) {
        try {
          const res = await api.getCircuit(sourceId);
          baseDoc = res.circuit.schemaJson;
        } catch {
          baseDoc = buildFullAdderPreset();
        }
      }
      const cloned: CircuitDocument = JSON.parse(JSON.stringify(baseDoc));
      const now = new Date().toISOString();
      const newId = `draft-${Date.now().toString(36)}`;
      cloned.metadata = {
        ...cloned.metadata,
        title: `${cloned.metadata.title} (Копія)`,
        createdAt: now,
        updatedAt: now,
      };
      setActiveCircuitIdAndDoc(newId, cloned);
      return { id: newId, doc: cloned };
    },
    [setActiveCircuitIdAndDoc],
  );

  const deleteCircuit = useCallback(
    async (circuitId: string): Promise<void> => {
      if (circuitId.startsWith('preset-')) return;
      try {
        if (!circuitId.startsWith('draft-')) {
          await api.deleteCircuit(circuitId);
        }
      } catch {
        // ignore network or auth error if offline
      }
      removeDraftFromStorage(circuitId);
      setCircuits((prev) => {
        const filtered = prev.filter((c) => c.id !== circuitId);
        saveStoredUserSummaries(filtered);
        return filtered;
      });
      if (activeIdRef.current === circuitId) {
        await selectCircuit('preset-full-adder');
      }
    },
    [selectCircuit],
  );

  const openCustomIcInEditor = useCallback(
    (ic: CustomICDefinition): string => {
      const safeSlug = ic.id.replace(/[^a-zA-Z0-9_-]/g, '');
      const draftId = `draft-ic-${safeSlug}`;
      const now = new Date().toISOString();
      const rawDoc: CircuitDocument = {
        metadata: {
          schemaVersion: '1.0.0',
          title: ic.name,
          description: ic.description || `Внутрішня принципова схема ІМС ${ic.code}`,
          category: 'ІМС та генератори',
          tags: ['custom-ic', ic.id],
          createdAt: now,
          updatedAt: now,
        },
        viewport: { panX: 20, panY: 20, zoom: 1, gridSnap: true },
        nodes: JSON.parse(JSON.stringify(ic.internalCircuit.nodes)),
        edges: JSON.parse(JSON.stringify(ic.internalCircuit.edges)),
      };
      const normalized = normalizeCircuitNodesWithCatalog(rawDoc);
      setActiveCircuitIdAndDoc(draftId, normalized);
      return draftId;
    },
    [setActiveCircuitIdAndDoc],
  );

  return (
    <WorkspaceContext.Provider
      value={{
        activeCircuitId,
        activeDocument,
        circuits,
        customIcs,
        loadingCircuits,
        isSimulationRunning,
        setIsSimulationRunning,
        toggleSimulationRunning,
        selectCircuit,
        updateActiveDocument,
        setActiveCircuitIdAndDoc,
        createNewCircuit,
        duplicateCircuit,
        deleteCircuit,
        refreshCircuits,
        refreshCustomIcs,
        updateCustomIc,
        deleteCustomIc,
        openCustomIcInEditor,
        setCustomIcs,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider');
  }
  return ctx;
}
