import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Cpu, FlaskConical, Trash2 } from 'lucide-react';
import {
  CATEGORY_LABELS,
  COMPONENT_CATALOG,
  CircuitSimulator,
  createNodeFromCatalog,
  type ComponentCategory,
  type ComponentType,
  type CustomICDefinition,
  type LogicState,
} from '@logicforge/shared-types';
import { CircuitNode } from '../components/circuit/CircuitNode';
import { Pin } from '../components/circuit/Pin';
import { PropertyInspector } from '../components/circuit/PropertyInspector';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export const ComponentLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [selectedType, setSelectedType] = useState<ComponentType>('JK_FLIPFLOP');
  const [categoryFilter, setCategoryFilter] = useState<ComponentCategory | 'ALL'>('ALL');
  const [customIcs, setCustomIcs] = useState<CustomICDefinition[]>([]);
  const [testInputStates, setTestInputStates] = useState<Record<string, LogicState>>({});

  useEffect(() => {
    api
      .listCustomComponents()
      .then((res) => setCustomIcs(res.customComponents))
      .catch(() => {});
  }, []);

  const sandboxNode = useMemo(() => {
    return createNodeFromCatalog(selectedType, 'sandbox_node', { x: 70, y: 40 });
  }, [selectedType]);

  // Локальна симуляція обраного елемента на випробувальному стенді
  const sandboxPinStates = useMemo(() => {
    const inputSwNodes = sandboxNode.pins
      .filter((p) => p.direction === 'INPUT')
      .map((p, idx) => {
        const sw = createNodeFromCatalog(
          'INPUT_SWITCH',
          `sw_${p.id}`,
          { x: 0, y: idx * 40 },
          p.name,
        );
        sw.properties.switchState = testInputStates[p.id] ?? '0';
        return { pinId: p.id, sw };
      });

    const sim = new CircuitSimulator({
      nodes: [...inputSwNodes.map((x) => x.sw), sandboxNode],
      edges: inputSwNodes.map((x, i) => ({
        id: `te_${i}`,
        sourceNodeId: x.sw.id,
        sourcePinId: 'OUT',
        targetNodeId: sandboxNode.id,
        targetPinId: x.pinId,
        signalState: '0' as LogicState,
      })),
    });

    const snap = sim.advanceBy(80);
    return snap.nodePinStates[sandboxNode.id] ?? {};
  }, [sandboxNode, testInputStates]);

  const toggleTestPin = (pinId: string) => {
    setTestInputStates((prev) => {
      const cur = prev[pinId] ?? '0';
      const next: LogicState = cur === '0' ? '1' : cur === '1' ? 'Z' : '0';
      return { ...prev, [pinId]: next };
    });
  };

  const catalogItems = COMPONENT_CATALOG.filter(
    (c) => c.type !== 'CUSTOM_IC' && (categoryFilter === 'ALL' || c.category === categoryFilter),
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <BookOpen className="h-6 w-6 text-emerald-400" />
            Енциклопедія логічних елементів, ІМС та випробувальний стенд
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Досліджуйте параметри поширення сигналів, розпіновку та тестуйте кожен компонент в
            інтерактивній пісочниці.
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('/editor')}>
          Відкрити редактор схем
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
        {/* Ліва частина: Список елементів за категоріями */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                categoryFilter === 'ALL'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'bg-slate-900 text-slate-300 border border-slate-800'
              }`}
            >
              Усі ({COMPONENT_CATALOG.length - 1})
            </button>
            {(Object.keys(CATEGORY_LABELS) as ComponentCategory[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  categoryFilter === cat
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'bg-slate-900 text-slate-300 border border-slate-800'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {catalogItems.map((item) => {
              const active = item.type === selectedType;
              return (
                <div
                  key={item.type}
                  onClick={() => {
                    setSelectedType(item.type);
                    setTestInputStates({});
                  }}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    active
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-800 bg-slate-900/75 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300">
                      {item.shortLabel}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      t_pd = {item.defaultDelayNs} нс
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-white">{item.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">{item.description}</p>
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    {item.defaultPins.slice(0, 4).map((p) => (
                      <Pin
                        key={p.id}
                        pin={{ ...p, state: p.direction === 'INPUT' ? '0' : '1' }}
                        mode="card"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Секція користувацьких інкапсульованих ІМС */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              <Cpu className="h-4 w-4" />
              Збережені користувацькі мікросхеми (Custom Subcircuits)
            </div>
            {customIcs.length === 0 ? (
              <p className="text-xs text-slate-500">
                Ще немає збережених підсхем. Побудуйте схему в редакторі та натисніть «У ІМС».
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {customIcs.map((ic) => (
                  <div
                    key={ic.id}
                    className="flex items-start justify-between rounded-xl border border-amber-500/30 bg-slate-950 p-3"
                  >
                    <div>
                      <div className="font-mono text-xs font-bold text-amber-300">{ic.code}</div>
                      <div className="text-xs font-medium text-white">{ic.name}</div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        Входів: {ic.inputPins.length} • Виходів: {ic.outputPins.length} •{' '}
                        {ic.propagationDelayNs} нс
                      </div>
                    </div>
                    {user && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={async () => {
                          await api.deleteCustomComponent(ic.id).catch(() => {});
                          setCustomIcs((prev) => prev.filter((x) => x.id !== ic.id));
                        }}
                        icon={<Trash2 className="h-3.5 w-3.5 text-rose-400" />}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Права частина: Живий інтерактивний стенд обраного компонента */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4 sticky top-20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <FlaskConical className="h-4 w-4 text-emerald-400" />
                Випробувальний стенд елемента
              </div>
              <span className="text-[11px] text-slate-400">
                Змінюйте входи нижче (0 → 1 → High-Z)
              </span>
            </div>

            <div className="flex items-center justify-center rounded-xl border border-slate-800 cad-grid-bg h-56 overflow-hidden">
              <svg width={300} height={210}>
                <CircuitNode node={sandboxNode} pinStates={sandboxPinStates} selected readOnly />
              </svg>
            </div>

            <PropertyInspector
              node={sandboxNode}
              pinStates={sandboxPinStates}
              readOnly
              onTogglePinTestState={toggleTestPin}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
