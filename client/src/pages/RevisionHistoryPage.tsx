import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, GitCommit, History, RotateCcw } from 'lucide-react';
import {
  CircuitSimulator,
  PRESET_CIRCUITS,
  type CircuitRevisionDTO,
} from '@logicforge/shared-types';
import { CircuitCanvas } from '../components/circuit/CircuitCanvas';
import { PropertyInspector } from '../components/circuit/PropertyInspector';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export const RevisionHistoryPage: React.FC = () => {
  const { id = 'preset-full-adder' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loginDemo } = useAuth();

  const [revisions, setRevisions] = useState<CircuitRevisionDTO[]>([]);
  const [selectedRev, setSelectedRev] = useState<CircuitRevisionDTO | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<CircuitRevisionDTO | null>(null);

  useEffect(() => {
    api
      .listRevisions(id)
      .then((res) => {
        setRevisions(res.revisions);
        if (res.revisions.length > 0) {
          setSelectedRev(res.revisions[0]);
        }
      })
      .catch(() => {
        const preset = PRESET_CIRCUITS.find((p) => p.id === id) ?? PRESET_CIRCUITS[0];
        const fallbackRev: CircuitRevisionDTO = {
          id: `rev-${preset.id}-1`,
          circuitId: preset.id,
          versionNumber: 1,
          commitMessage: 'Початкова еталонна версія схеми',
          nodeCount: preset.document.nodes.length,
          edgeCount: preset.document.edges.length,
          authorName: 'Студент Кафедри АСУ',
          createdAt: preset.document.metadata.createdAt,
          schemaJson: preset.document,
        };
        setRevisions([fallbackRev]);
        setSelectedRev(fallbackRev);
      });
  }, [id]);

  const previewDoc = selectedRev?.schemaJson;
  const previewSnapshot = React.useMemo(() => {
    if (!previewDoc) return null;
    const sim = new CircuitSimulator(previewDoc);
    return sim.settleCombinational(300);
  }, [previewDoc]);

  const inspectedNode =
    previewDoc?.nodes.find((n) => n.id === selectedNodeId) ?? previewDoc?.nodes[0] ?? null;

  const handleRestore = async () => {
    if (!confirmRestore) return;
    try {
      if (!user) {
        await loginDemo();
      }
      await api.restoreRevision(id, confirmRestore.versionNumber);
      setConfirmRestore(null);
      navigate(`/editor/${id}`);
    } catch {
      setConfirmRestore(null);
      navigate(`/editor/${id}`);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={`/editor/${id}`}>
            <Button variant="secondary" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>
              До редактора
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <History className="h-5 w-5 text-emerald-400" />
              Історія ревізій та версіонування схеми
            </h1>
            <p className="text-xs text-slate-400">
              Перегляд знімків топології з таблиці circuit_revisions (PostgreSQL) та відкат змін
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px,1fr,300px]">
        {/* Список ревізій */}
        <div className="space-y-2.5">
          {revisions.map((rev) => {
            const active = selectedRev?.versionNumber === rev.versionNumber;
            return (
              <div
                key={rev.id}
                onClick={() => setSelectedRev(rev)}
                className={`cursor-pointer rounded-xl border p-4 transition-all ${
                  active
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300">
                    <GitCommit className="h-3.5 w-3.5" /> v{rev.versionNumber}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(rev.createdAt).toLocaleDateString('uk-UA')}
                  </span>
                </div>
                <p className="mt-2 text-xs font-medium text-white">{rev.commitMessage}</p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Вузлів: {rev.nodeCount} • З’єднань: {rev.edgeCount}
                  </span>
                  <span>{rev.authorName}</span>
                </div>
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="xs"
                    icon={<RotateCcw className="h-3 w-3" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmRestore(rev);
                    }}
                  >
                    Відновити ревізію v{rev.versionNumber}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Інтерактивний попередній перегляд топології ревізії */}
        <div className="h-[560px] overflow-hidden rounded-2xl border border-slate-800">
          {previewDoc ? (
            <CircuitCanvas
              nodes={previewDoc.nodes}
              edges={previewDoc.edges}
              viewport={previewDoc.viewport}
              nodePinStates={previewSnapshot?.nodePinStates}
              edgeStates={previewSnapshot?.edgeStates}
              selectedNodeId={inspectedNode?.id ?? null}
              selectedEdgeId={null}
              readOnly
              onSelectNode={setSelectedNodeId}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Оберіть ревізію зі списку ліворуч
            </div>
          )}
        </div>

        {/* Інспектор вузлів обраної ревізії */}
        <div>
          <PropertyInspector
            node={inspectedNode}
            pinStates={
              inspectedNode && previewSnapshot
                ? previewSnapshot.nodePinStates[inspectedNode.id]
                : undefined
            }
            readOnly
          />
        </div>
      </div>

      <Modal
        open={Boolean(confirmRestore)}
        onClose={() => setConfirmRestore(null)}
        title="Підтвердження відновлення ревізії"
        subtitle="Система створить нову ревізію на основі обраного історичного знімка без втрати попередніх версій."
        maxWidthClass="max-w-md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmRestore(null)}>
              Скасувати
            </Button>
            <Button variant="primary" size="sm" onClick={() => void handleRestore()}>
              Відновити v{confirmRestore?.versionNumber}
            </Button>
          </>
        }
      >
        <p className="text-xs text-slate-300">
          Відновити стан схеми до ревізії{' '}
          <strong className="text-emerald-300">v{confirmRestore?.versionNumber}</strong> («
          {confirmRestore?.commitMessage}»)?
        </p>
      </Modal>
    </div>
  );
};
