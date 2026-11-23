import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GitCommit, History, Layers, Lock, RotateCcw } from 'lucide-react';
import {
  CircuitSimulator,
  PRESET_CIRCUITS,
  analyzeCircuitGraph,
  type CircuitRevisionDTO,
} from '@logicforge/shared-types';
import { CircuitCanvas } from '../components/circuit/CircuitCanvas';
import { Button, getButtonClassName } from '../components/ui/Button';
import { MathVar } from '../components/ui/MathFormula';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../services/api';

export const RevisionHistoryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCircuitId, activeDocument, customIcs, selectCircuit, setActiveCircuitIdAndDoc } =
    useWorkspace();

  const targetId = id || activeCircuitId || 'preset-full-adder';

  const [revisions, setRevisions] = useState<CircuitRevisionDTO[]>([]);
  const [selectedRev, setSelectedRev] = useState<CircuitRevisionDTO | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<CircuitRevisionDTO | null>(null);

  useEffect(() => {
    if (id && id !== activeCircuitId) {
      void selectCircuit(id);
    }
  }, [id, activeCircuitId, selectCircuit]);

  const liveWorkspaceRev: CircuitRevisionDTO = useMemo(
    () => ({
      id: `live-${targetId}`,
      circuitId: targetId,
      versionNumber: 0,
      commitMessage: 'Поточна робоча версія в САПР (Live Workspace)',
      nodeCount: activeDocument.nodes.length,
      edgeCount: activeDocument.edges.length,
      authorName: user?.fullName ?? 'Поточна сесія',
      createdAt: activeDocument.metadata.updatedAt || new Date().toISOString(),
      schemaJson: activeDocument,
    }),
    [targetId, activeDocument, user?.fullName],
  );

  useEffect(() => {
    api
      .listRevisions(targetId)
      .then((res) => {
        setRevisions(res.revisions);
        if (res.revisions.length > 0) {
          setSelectedRev(res.revisions[0]);
        } else {
          setSelectedRev(liveWorkspaceRev);
        }
      })
      .catch(() => {
        const preset = PRESET_CIRCUITS.find((p) => p.id === targetId);
        const baseDoc = preset ? preset.document : activeDocument;
        const fallbackRev: CircuitRevisionDTO = {
          id: `rev-${targetId}-1`,
          circuitId: targetId,
          versionNumber: 1,
          commitMessage: 'Початкова еталонна ревізія схеми',
          nodeCount: baseDoc.nodes.length,
          edgeCount: baseDoc.edges.length,
          authorName: 'Інженер-схемотехнік',
          createdAt: baseDoc.metadata.createdAt,
          schemaJson: baseDoc,
        };
        setRevisions([fallbackRev]);
        setSelectedRev(fallbackRev);
      });
  }, [targetId, activeDocument, liveWorkspaceRev]);

  const previewDoc = useMemo(() => {
    const raw =
      selectedRev?.versionNumber === 0
        ? activeDocument
        : (selectedRev?.schemaJson ?? activeDocument);
    return {
      ...raw,
      customDefinitions: customIcs.length > 0 ? customIcs : raw.customDefinitions,
    };
  }, [selectedRev, activeDocument, customIcs]);

  const previewSnapshot = useMemo(() => {
    if (!previewDoc) return null;
    const sim = new CircuitSimulator(previewDoc);
    return sim.settleCombinational(300);
  }, [previewDoc]);

  const previewTiming = useMemo(
    () => (previewDoc ? analyzeCircuitGraph(previewDoc) : null),
    [previewDoc],
  );

  const handleRestore = async () => {
    if (!confirmRestore || !user) return;
    try {
      if (confirmRestore.versionNumber > 0) {
        await api.restoreRevision(targetId, confirmRestore.versionNumber).catch(() => {});
      }
      if (confirmRestore.schemaJson) {
        setActiveCircuitIdAndDoc(targetId, structuredClone(confirmRestore.schemaJson));
      }
      setConfirmRestore(null);
      navigate(`/editor/${targetId}`);
    } catch {
      if (confirmRestore.schemaJson) {
        setActiveCircuitIdAndDoc(targetId, structuredClone(confirmRestore.schemaJson));
      }
      setConfirmRestore(null);
      navigate(`/editor/${targetId}`);
    }
  };

  if (!user) {
    return (
      <div className="win95-desktop-bg min-h-screen">
        <div className="mx-auto max-w-4xl px-3 sm:px-4 py-4 space-y-3">
          <div className="win95-outset bg-win-bg px-3 py-1.5 flex items-center gap-2">
            <History className="h-4 w-4 shrink-0 text-win-navy" aria-hidden="true" />
            <h1 className="text-sm font-bold text-win-ink truncate">
              Історія ревізій: «{activeDocument.metadata.title}»
            </h1>
          </div>

          <section className="win95-window overflow-hidden" data-testid="auth-required-gate">
            <div className="win95-titlebar flex items-center gap-2 px-3 py-1.5 text-xs font-bold">
              <Lock className="h-3.5 w-3.5 text-win-highlight" aria-hidden="true" />
              <span>ДОСТУП ОБМЕЖЕНО — ПОТРІБНА АВТОРИЗАЦІЯ</span>
            </div>
            <div className="p-5 bg-win-bg space-y-3 text-xs text-win-ink">
              <p className="text-sm font-bold">
                Перегляд журналу ревізій і відновлення версій доступні лише зареєстрованим
                користувачам.
              </p>
              <p className="text-win-muted leading-relaxed">
                Увійдіть у свій обліковий запис або створіть профіль, щоб зберігати знімки топології
                (v1, v2...) і повертатися до попередніх версій схем.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Link to="/login" className={getButtonClassName('primary', 'sm')}>
                  Увійти в акаунт
                </Link>
                <Link to="/register" className={getButtonClassName('secondary', 'sm')}>
                  Реєстрація
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="win95-desktop-bg min-h-screen">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 py-3 space-y-3">
        <div className="win95-outset bg-win-bg px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <History className="h-4 w-4 shrink-0 text-win-navy" aria-hidden="true" />
            <h1 className="text-sm font-bold text-win-ink truncate">
              Історія ревізій: «{activeDocument.metadata.title}»
            </h1>
          </div>
          <span className="win95-statusbar-cell px-2 py-0.5 font-mono text-xs font-bold text-win-ink shrink-0">
            {selectedRev?.versionNumber === 0
              ? 'Активна робоча версія'
              : `Перегляд REV v${selectedRev?.versionNumber ?? 1}`}
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-[320px,1fr,310px]">
          {/* Список ревізій */}
          <div className="win95-window flex flex-col overflow-hidden">
            <div className="win95-titlebar px-3 py-1.5 text-xs font-bold">
              СПИСОК ЗНІМКІВ РЕВІЗІЙ
            </div>
            <div className="p-2.5 space-y-2 bg-win-bg flex-1">
              <button
                type="button"
                onClick={() => setSelectedRev(liveWorkspaceRev)}
                className={`w-full text-left cursor-pointer p-3 focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black focus-visible:outline-offset-[-4px] ${
                  selectedRev?.versionNumber === 0
                    ? 'win95-inset bg-win-highlight ring-1 ring-inset ring-win-navy'
                    : 'win95-outset bg-win-bg'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="win95-statusbar-cell inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] font-bold text-win-navy">
                    <Layers className="h-3 w-3" /> ПОТОЧНА РОБОЧА ВЕРСІЯ
                  </span>
                  <span className="font-mono text-[10px] font-bold text-win-teal">АКТИВНА</span>
                </div>
                <p className="mt-2 text-xs font-bold text-win-ink">
                  Поточна робоча топологія у редакторі САПР
                </p>
                <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-win-muted">
                  <span>
                    Вузлів: {activeDocument.nodes.length} • Ліній: {activeDocument.edges.length}
                  </span>
                  <span>Робоча копія</span>
                </div>
              </button>

              {revisions.map((rev) => {
                const active = selectedRev?.versionNumber === rev.versionNumber;
                return (
                  <button
                    key={rev.id}
                    type="button"
                    onClick={() => setSelectedRev(rev)}
                    className={`w-full text-left cursor-pointer p-3 focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black focus-visible:outline-offset-[-4px] ${
                      active
                        ? 'win95-inset bg-win-highlight ring-1 ring-inset ring-win-navy'
                        : 'win95-outset bg-win-bg'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="win95-statusbar-cell inline-flex items-center gap-1 px-2 py-0.5 font-mono text-xs font-bold text-win-ink">
                        <GitCommit className="h-3.5 w-3.5 text-win-navy" /> REV v{rev.versionNumber}
                      </span>
                      <span className="font-mono text-[11px] text-win-muted">
                        {new Date(rev.createdAt).toLocaleDateString('uk-UA')}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-bold text-win-ink">{rev.commitMessage}</p>
                    <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-win-muted">
                      <span>
                        Вузлів: {rev.nodeCount} • Ліній: {rev.edgeCount}
                      </span>
                      <span>{rev.authorName}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Інтерактивний попередній перегляд топології ревізії */}
          <div className="win95-window flex flex-col h-[380px] sm:h-[480px] lg:h-[580px] overflow-hidden">
            <div className="win95-titlebar flex items-center justify-between px-3 py-1.5">
              <span className="text-xs font-bold">ПЕРЕГЛЯД ТОПОЛОГІЇ ЗНІМКА СХЕМИ</span>
              <span className="font-mono text-xs text-win-highlight">
                {selectedRev?.versionNumber === 0
                  ? 'Поточна версія'
                  : `Ревізія v${selectedRev?.versionNumber ?? 1}`}
              </span>
            </div>
            <div className="flex-1 min-h-0 p-1">
              {previewDoc ? (
                <CircuitCanvas
                  nodes={previewDoc.nodes}
                  edges={previewDoc.edges}
                  viewport={{ panX: 12, panY: 16, zoom: 0.76, gridSnap: true }}
                  nodePinStates={previewSnapshot?.nodePinStates}
                  edgeStates={previewSnapshot?.edgeStates}
                  selectedNodeId={selectedNodeId}
                  selectedEdgeId={null}
                  readOnly
                  onSelectNode={setSelectedNodeId}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-win-muted">
                  Оберіть ревізію зі списку ліворуч
                </div>
              )}
            </div>
          </div>

          {/* Інформація про ревізію та головна кнопка відновлення */}
          <div
            className="win95-window flex flex-col overflow-hidden"
            data-testid="revision-summary-panel"
          >
            <div className="win95-titlebar px-3 py-1.5 text-xs font-bold">
              ІНФОРМАЦІЯ ПРО РЕВІЗІЮ
            </div>
            <div className="p-3 bg-win-bg flex-1 flex flex-col justify-between gap-3 text-xs">
              {selectedRev ? (
                <div className="space-y-3">
                  <div className="win95-outset p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="win95-statusbar-cell px-2 py-0.5 font-mono text-xs font-bold text-win-navy">
                        {selectedRev.versionNumber === 0
                          ? 'LIVE WORKSPACE'
                          : `REV v${selectedRev.versionNumber}`}
                      </span>
                      <span className="font-mono text-[11px] text-win-muted">
                        {new Date(selectedRev.createdAt).toLocaleString('uk-UA', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="font-bold text-win-ink leading-snug">
                      {selectedRev.commitMessage}
                    </p>
                    <div className="text-[11px] text-win-muted">
                      Автор: <strong className="text-win-ink">{selectedRev.authorName}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                    <div className="win95-statusbar-cell p-2">
                      <div className="text-[10px] text-win-muted">Елементів (вузлів)</div>
                      <strong className="text-sm text-win-ink">{previewDoc.nodes.length}</strong>
                    </div>
                    <div className="win95-statusbar-cell p-2">
                      <div className="text-[10px] text-win-muted">Провідників (ліній)</div>
                      <strong className="text-sm text-win-ink">{previewDoc.edges.length}</strong>
                    </div>
                    <div className="win95-statusbar-cell p-2">
                      <div className="text-[10px] text-win-muted">
                        Крит. шлях <MathVar sym="T" sub="crit" />
                      </div>
                      <strong className="text-sm text-win-ink">
                        {previewTiming?.criticalPathDelayNs ?? 0} нс
                      </strong>
                    </div>
                    <div className="win95-statusbar-cell p-2">
                      <div className="text-[10px] text-win-muted">
                        Частота <MathVar sym="f" sub="max" />
                      </div>
                      <strong className="text-sm text-win-navy">
                        {previewTiming?.maxClockFrequencyMhz ?? 0} МГц
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="win95-inset bg-win-surface p-4 text-center text-win-muted">
                  Оберіть ревізію зі списку ліворуч для перегляду її характеристик.
                </div>
              )}

              <div className="space-y-2 border-t border-win-shadow pt-3">
                <Button
                  data-testid="btn-restore-revision"
                  variant="primary"
                  size="sm"
                  className="w-full"
                  disabled={!selectedRev || selectedRev.versionNumber === 0}
                  onClick={() => selectedRev && setConfirmRestore(selectedRev)}
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                >
                  Відновити цю ревізію в редактор
                </Button>
                {selectedRev?.versionNumber === 0 && (
                  <p className="text-[11px] text-win-muted text-center">
                    Це поточна активна версія. Оберіть зафіксовану ревізію (REV v1…) у списку
                    ліворуч.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <Modal
          open={Boolean(confirmRestore)}
          onClose={() => setConfirmRestore(null)}
          title="Підтвердження відновлення ревізії"
          subtitle="Обраний знімок схеми буде завантажено як активний проєкт у редакторі САПР."
          maxWidthClass="max-w-md"
          footer={
            <Button variant="primary" size="sm" onClick={() => void handleRestore()}>
              Відновити v{confirmRestore?.versionNumber}
            </Button>
          }
        >
          <p className="text-xs text-win-ink">
            Відновити стан схеми до ревізії{' '}
            <strong className="text-win-navy">v{confirmRestore?.versionNumber}</strong> («
            {confirmRestore?.commitMessage}»)?
          </p>
        </Modal>
      </div>
    </div>
  );
};
