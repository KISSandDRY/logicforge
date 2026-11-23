import { useCallback, useEffect, useState } from 'react';
import type { CircuitDocument } from '@logicforge/shared-types';

export interface UseCircuitHistoryOptions {
  doc: CircuitDocument;
  setDoc: (updater: CircuitDocument | ((prev: CircuitDocument) => CircuitDocument)) => void;
  onDeleteSelected?: () => void;
  maxHistory?: number;
}

export function useCircuitHistory({
  doc,
  setDoc,
  onDeleteSelected,
  maxHistory = 25,
}: UseCircuitHistoryOptions) {
  const [undoStack, setUndoStack] = useState<CircuitDocument[]>([]);
  const [redoStack, setRedoStack] = useState<CircuitDocument[]>([]);

  const pushHistory = useCallback(
    (updater: (prev: CircuitDocument) => CircuitDocument) => {
      setDoc((prev) => {
        setUndoStack((u) => [...u.slice(-(maxHistory - 1)), prev]);
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
    [maxHistory, setDoc],
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        onDeleteSelected?.();
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
  }, [handleRedo, handleUndo, onDeleteSelected]);

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    pushHistory,
    handleUndo,
    handleRedo,
  };
}
