import React, { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Cpu, FlaskConical, Info, Plus, Search, Table2, Trash2, X } from 'lucide-react';
import {
  CATEGORY_LABELS,
  CircuitSimulator,
  STANDARD_COMPONENT_CATALOG,
  createNodeFromCatalog,
  type ComponentCategory,
  type ComponentType,
  type LogicState,
} from '@logicforge/shared-types';
import { CatalogNodePreview } from '../components/circuit/CatalogNodePreview';
import { CircuitNode } from '../components/circuit/CircuitNode';
import { Button } from '../components/ui/Button';
import { LogicBadge } from '../components/ui/LogicBadge';
import { MathFormula, MathVar } from '../components/ui/MathFormula';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../services/api';
import { getComponentTruthTable } from '../utils/componentTruthTables';

function isLogicStateCell(val: string): val is LogicState {
  return val === '0' || val === '1' || val === 'Z' || val === 'X';
}

export const ComponentLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCircuitId, activeDocument, customIcs, updateActiveDocument, refreshCustomIcs } =
    useWorkspace();

  const searchId = useId();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<ComponentCategory | 'ALL'>('ALL');
  const [selectedType, setSelectedType] = useState<ComponentType | null>(null);

  const [testInputStates, setTestInputStates] = useState<Record<string, LogicState>>({});
  const [sandboxSwitchState, setSandboxSwitchState] = useState<LogicState>('1');
  const [sandboxDipStates, setSandboxDipStates] = useState<
    [LogicState, LogicState, LogicState, LogicState]
  >(['1', '0', '1', '0']);

  const activeCatalogItem = useMemo(
    () =>
      selectedType
        ? (STANDARD_COMPONENT_CATALOG.find((c) => c.type === selectedType) ?? null)
        : null,
    [selectedType],
  );

  const activeTruthTable = useMemo(
    () => (activeCatalogItem ? getComponentTruthTable(activeCatalogItem.type) : null),
    [activeCatalogItem],
  );

  const sandboxNode = useMemo(() => {
    const targetType = selectedType ?? 'JK_FLIPFLOP';
    const node = createNodeFromCatalog(targetType, 'sandbox_node', { x: 75, y: 34 });
    if (node.type === 'INPUT_SWITCH' || node.type === 'PUSH_BUTTON') {
      node.properties.switchState = sandboxSwitchState;
    } else if (node.type === 'DIP_SWITCH_4') {
      node.properties.dipSwitchStates = [...sandboxDipStates];
    }
    return node;
  }, [selectedType, sandboxSwitchState, sandboxDipStates]);

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

  const handleInsertIntoActiveCircuit = (typeToInsert: ComponentType) => {
    const newId = `n_${Date.now().toString(36).slice(-4)}`;
    const offset = (activeDocument.nodes.length % 6) * 28;
    const newNode = createNodeFromCatalog(typeToInsert, newId, {
      x: 240 + offset,
      y: 160 + offset,
    });
    updateActiveDocument((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setSelectedType(null);
    navigate(`/editor/${activeCircuitId}`);
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return STANDARD_COMPONENT_CATALOG.filter((c) => {
      if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
      if (q) {
        const icCode = c.icCode ?? '';
        const haystack =
          `${c.name} ${c.shortLabel} ${c.type} ${icCode} ${c.description} ${CATEGORY_LABELS[c.category]}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [categoryFilter, searchQuery]);

  return (
    <div className="win95-desktop-bg min-h-screen pb-10">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 py-3 space-y-3">
        {/* Компактний однорядковий заголовок + фільтрація бібліотеки елементів */}
        <div className="win95-outset bg-win-bg px-3 py-2 space-y-2">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="h-4 w-4 shrink-0 text-win-navy" aria-hidden="true" />
              <h1 className="text-sm font-bold text-win-ink truncate">
                Каталог елементної бази ({STANDARD_COMPONENT_CATALOG.length} стандартних типів)
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-80">
                <label htmlFor={searchId} className="sr-only">
                  Пошук цифрового компонента в бібліотеці
                </label>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-win-muted" />
                <input
                  id={searchId}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Пошук (AND, 74HC08, JK, NE555, АЛП...)"
                  className="win95-field min-h-7 coarse:min-h-9 w-full pl-8 pr-8 py-1 text-xs font-medium text-win-ink"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Очистити пошук"
                    className="win95-button absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 coarse:h-8 coarse:w-8 items-center justify-center touch-manipulation text-win-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="win95-statusbar-cell px-2 py-0.5 font-mono text-xs font-bold text-win-ink">
                Знайдено: <strong className="text-win-navy">{filteredItems.length}</strong> /{' '}
                {STANDARD_COMPONENT_CATALOG.length}
              </div>
            </div>
          </div>

          {/* Категорії елементів */}
          <div className="flex flex-wrap gap-1.5 border-t border-win-shadow pt-2">
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className={`min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 px-2.5 py-0.5 text-xs font-bold touch-manipulation ${
                categoryFilter === 'ALL'
                  ? 'win95-button-pressed bg-win-surface text-win-ink'
                  : 'win95-button text-win-ink'
              }`}
            >
              Усі ({STANDARD_COMPONENT_CATALOG.length})
            </button>
            {(Object.keys(CATEGORY_LABELS) as ComponentCategory[]).map((cat) => {
              const count = STANDARD_COMPONENT_CATALOG.filter((c) => c.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 px-2.5 py-0.5 text-xs font-bold touch-manipulation ${
                    categoryFilter === cat
                      ? 'win95-button-pressed bg-win-surface text-win-ink'
                      : 'win95-button text-win-ink'
                  }`}
                >
                  {CATEGORY_LABELS[cat]} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Основна повноширинна сітка карток елементів бібліотеки у стилі вікон Win95 */}
        {filteredItems.length === 0 ? (
          <div className="win95-window p-10 text-center space-y-2">
            <p className="text-sm font-bold text-win-ink">
              За запитом «{searchQuery}» елементів не знайдено
            </p>
            <p className="text-xs text-win-muted">
              Спробуйте змінити пошуковий запит або обрати категорію «Усі елементи».
            </p>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setCategoryFilter('ALL');
                }}
              >
                Скинути фільтри
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => {
              const icCode = item.icCode;
              const inputPins = item.defaultPins.filter((p) => p.direction === 'INPUT');
              const outputPins = item.defaultPins.filter((p) => p.direction === 'OUTPUT');

              return (
                <article key={item.type} className="win95-window flex flex-col justify-between">
                  <div>
                    <div className="win95-titlebar flex items-center justify-between px-2.5 py-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-win-highlight">
                          {item.shortLabel}
                        </span>
                        {icCode && (
                          <span className="bg-win-bg px-1.5 py-0.5 font-mono text-[10px] font-bold text-win-ink">
                            {icCode}
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-0.5 text-[10.5px] font-bold text-win-highlight">
                        <MathVar sym="t" sub="pd" />
                        <span className="font-mono"> = {item.defaultDelayNs} нс</span>
                      </span>
                    </div>

                    {/* Графічне схемне прев'ю елемента у вдавленому вікні .win95-inset */}
                    <div className="p-2 pb-0">
                      <div className="win95-inset flex h-24 items-center justify-center bg-win-canvas px-3 py-1.5">
                        <CatalogNodePreview type={item.type} />
                      </div>
                    </div>

                    <div className="p-2.5 space-y-1.5">
                      <h2 className="text-sm font-bold text-win-ink leading-snug">{item.name}</h2>
                      <p className="line-clamp-2 text-xs leading-relaxed text-win-muted">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {/* Нижня панель: контактна конфігурація та єдина кнопка специфікації */}
                  <div className="border-t border-win-shadow px-2.5 py-2 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-[10.5px] font-bold text-win-navy truncate">
                        {CATEGORY_LABELS[item.category]}
                      </span>
                      <span className="win95-statusbar-cell px-2 py-0.5 font-mono text-win-ink shrink-0">
                        Вх: <strong>{inputPins.length}</strong> • Вих:{' '}
                        <strong>{outputPins.length}</strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedType(item.type);
                        setTestInputStates({});
                      }}
                      className="win95-button w-full min-h-7 coarse:min-h-9 inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-bold text-win-ink touch-manipulation focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black"
                    >
                      <Info className="h-3.5 w-3.5 text-win-navy shrink-0" aria-hidden="true" />
                      <span>Специфікація та таблиця істинності →</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Секція збережених користувацьких мікросхем (Custom IC) — лише для авторизованих користувачів */}
        {user && (
          <div data-testid="custom-ics-section" className="win95-window overflow-hidden">
            <div className="win95-titlebar flex items-center justify-between px-3 py-1.5">
              <span className="flex items-center gap-2 text-xs font-bold">
                <Cpu className="h-3.5 w-3.5 text-win-highlight" />
                КОРИСТУВАЦЬКІ МІКРОСХЕМИ (CUSTOM IC)
              </span>
              <span className="font-mono text-[11px] text-win-highlight">
                Збережено модулів: {customIcs.length}
              </span>
            </div>
            <div className="p-3.5 bg-win-bg">
              {customIcs.length === 0 ? (
                <p className="text-xs text-win-muted">
                  Ще немає збережених користувацьких підсхем. Побудуйте схему в редакторі САПР та
                  натисніть кнопку «Створити ІМС», щоб додати власну мікросхему до бібліотеки.
                </p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {customIcs.map((ic) => (
                    <div key={ic.id} className="win95-outset flex items-start justify-between p-3">
                      <div>
                        <div className="font-mono text-xs font-bold text-win-navy">{ic.code}</div>
                        <div className="text-xs font-bold text-win-ink mt-0.5">{ic.name}</div>
                        <div className="mt-1 font-mono text-[11px] text-win-muted">
                          Входів: {ic.inputPins.length} • Виходів: {ic.outputPins.length} •
                          Затримка: {ic.propagationDelayNs} нс
                        </div>
                      </div>
                      <Button
                        variant="danger"
                        size="xs"
                        aria-label={`Видалити власну мікросхему ${ic.name}`}
                        title={`Видалити власну мікросхему ${ic.name}`}
                        onClick={async () => {
                          await api.deleteCustomComponent(ic.id).catch(() => {});
                          await refreshCustomIcs();
                        }}
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Модальне вікно детальної інформації, математичної моделі та таблиці істинності */}
        <Modal
          open={Boolean(activeCatalogItem)}
          onClose={() => setSelectedType(null)}
          title={
            activeCatalogItem
              ? `${activeCatalogItem.name} (${activeCatalogItem.shortLabel}${
                  activeCatalogItem.icCode ? ` • ${activeCatalogItem.icCode}` : ''
                })`
              : 'Специфікація компонента'
          }
          subtitle={
            activeCatalogItem ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                <span>
                  Розділ: {CATEGORY_LABELS[activeCatalogItem.category]} • Затримка поширення сигналу
                </span>
                <MathVar sym="t" sub="pd" />
                <span>= {activeCatalogItem.defaultDelayNs} нс</span>
              </span>
            ) : undefined
          }
          maxWidthClass="max-w-4xl"
          footer={
            activeCatalogItem ? (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => handleInsertIntoActiveCircuit(activeCatalogItem.type)}
              >
                Додати «{activeCatalogItem.shortLabel}» на полотно активної схеми
              </Button>
            ) : undefined
          }
        >
          {activeCatalogItem && activeTruthTable && (
            <div className="space-y-3.5 text-xs">
              <div className="win95-outset p-3 space-y-2.5">
                <p className="text-xs leading-relaxed text-win-ink">
                  {activeCatalogItem.description}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="win95-statusbar-cell p-2">
                    <div className="text-[10px] text-win-muted">Код у САПР</div>
                    <div className="font-mono text-xs font-bold text-win-ink">
                      {activeCatalogItem.type}
                    </div>
                  </div>
                  <div className="win95-statusbar-cell p-2">
                    <div className="text-[10px] text-win-muted">Серія ІМС</div>
                    <div className="font-mono text-xs font-bold text-win-navy">
                      {activeCatalogItem.icCode ?? 'Стандартний елемент'}
                    </div>
                  </div>
                  <div className="win95-statusbar-cell p-2">
                    <div className="text-[10px] text-win-muted">
                      Затримка <MathVar sym="t" sub="pd" />
                    </div>
                    <div className="font-mono text-xs font-bold text-win-ink">
                      {activeCatalogItem.defaultDelayNs} нс
                    </div>
                  </div>
                  <div className="win95-statusbar-cell p-2">
                    <div className="text-[10px] text-win-muted">Клас схеми</div>
                    <div className="text-xs font-bold text-win-ink">
                      {activeCatalogItem.isSequential ? 'Послідовнісна' : 'Комбінаційна'}
                    </div>
                  </div>
                </div>

                <div className="win95-inset bg-win-highlight px-3 py-2 text-xs text-win-ink flex flex-wrap items-center gap-2">
                  <strong className="text-win-navy">Математична модель:</strong>
                  <MathFormula
                    type={activeCatalogItem.type}
                    latex={activeCatalogItem.formulaLatex}
                  />
                </div>
              </div>

              <div className="grid gap-3.5 md:grid-cols-[1fr,1.25fr]">
                <div className="space-y-3">
                  <div className="win95-window overflow-hidden">
                    <div className="win95-titlebar flex items-center justify-between px-2.5 py-1">
                      <span className="flex items-center gap-1.5 text-xs font-bold">
                        <FlaskConical className="h-3.5 w-3.5 text-win-highlight" />
                        ІНТЕРАКТИВНИЙ СТЕНД ПЕРЕВІРКИ
                      </span>
                    </div>
                    <div className="p-1.5">
                      <div className="win95-inset flex h-48 items-center justify-center bg-win-canvas p-3">
                        <svg
                          viewBox={`0 0 300 ${Math.max(180, sandboxNode.height + 56)}`}
                          className="h-44 w-full"
                        >
                          <CircuitNode
                            node={sandboxNode}
                            pinStates={sandboxPinStates}
                            selected
                            onToggleSwitch={() =>
                              setSandboxSwitchState((prev) => (prev === '1' ? '0' : '1'))
                            }
                            onToggleDipBit={(_node, bitIndex) =>
                              setSandboxDipStates((prev) => {
                                const next: [LogicState, LogicState, LogicState, LogicState] = [
                                  ...prev,
                                ];
                                next[bitIndex] = next[bitIndex] === '1' ? '0' : '1';
                                return next;
                              })
                            }
                          />
                        </svg>
                      </div>
                    </div>

                    {sandboxNode.pins.some((p) => p.direction === 'INPUT') && (
                      <div className="border-t border-win-shadow bg-win-bg px-3 py-2 space-y-1.5">
                        <div className="text-[10px] font-bold uppercase text-win-ink">
                          Подати тестові сигнали на входи стенда (клік для 0 → 1 → Z):
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {sandboxNode.pins
                            .filter((p) => p.direction === 'INPUT')
                            .map((p) => {
                              const st = sandboxPinStates[p.id] ?? '0';
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => toggleTestPin(p.id)}
                                  className="win95-button inline-flex min-h-7 items-center gap-1.5 px-2.5 py-1 font-mono text-xs font-bold text-win-ink"
                                >
                                  <span>{p.name}:</span>
                                  <LogicBadge state={st} compact />
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Таблиця цокольовки виводів (Pinout) */}
                  <div className="win95-window overflow-hidden">
                    <div className="win95-titlebar px-2.5 py-1 text-xs font-bold">
                      ЦОКОЛЬОВКА ТА СПЕЦИФІКАЦІЯ ВИВОДІВ ({activeCatalogItem.defaultPins.length})
                    </div>
                    <div className="p-1.5">
                      <div className="win95-inset bg-win-highlight overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-win-surface text-win-ink border-b border-win-shadow">
                            <tr>
                              <th className="px-2.5 py-1.5">Вивід</th>
                              <th className="px-2.5 py-1.5">Напрямок</th>
                              <th className="px-2.5 py-1.5">Розташування</th>
                              <th className="px-2.5 py-1.5">Особливість</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-win-surface">
                            {sandboxNode.pins.map((p) => (
                              <tr key={p.id}>
                                <td className="px-2.5 py-1.5 font-mono font-bold text-win-ink">
                                  {p.name}
                                </td>
                                <td className="px-2.5 py-1.5 text-win-ink">
                                  {p.direction === 'INPUT' ? 'Вхід (INPUT)' : 'Вихід (OUTPUT)'}
                                </td>
                                <td className="px-2.5 py-1.5 font-mono text-[11px] text-win-muted">
                                  {p.offset.side === 'LEFT' ? 'Зліва (LEFT)' : 'Справа (RIGHT)'}
                                </td>
                                <td className="px-2.5 py-1.5 text-[11px] text-win-muted">
                                  {p.clockEdge
                                    ? 'Динамічний фронт CLK ↑'
                                    : p.inverted
                                      ? 'Інверсний вивід (¬)'
                                      : 'Прямий логічний вивід'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Права частина модального вікна: Повна таблиця істинності / переходів елемента */}
                <div className="win95-window overflow-hidden flex flex-col">
                  <div className="win95-titlebar flex items-center justify-between gap-2 px-2.5 py-1">
                    <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold">
                      <Table2 className="h-3.5 w-3.5 shrink-0 text-win-highlight" />
                      <span className="truncate">{activeTruthTable.title.toUpperCase()}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-[10px] text-win-highlight">
                      Рядків: {activeTruthTable.rows.length}
                    </span>
                  </div>

                  <div className="flex-1 p-1.5">
                    <div className="win95-inset h-full overflow-x-auto bg-win-highlight">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-win-bg text-win-ink font-mono border-b border-win-shadow">
                          <tr>
                            {activeTruthTable.inputHeaders.map((h) => (
                              <th key={h} className="px-3 py-2 text-center font-bold">
                                {h}
                              </th>
                            ))}
                            {activeTruthTable.outputHeaders.map((h) => (
                              <th
                                key={h}
                                className="border-l border-win-shadow bg-win-bg px-3 py-2 text-center font-bold text-win-ink"
                              >
                                {h}
                              </th>
                            ))}
                            <th className="border-l border-win-shadow px-3 py-2 font-sans font-bold text-win-ink">
                              Режим / Пояснення
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-win-surface">
                          {activeTruthTable.rows.map((row, idx) => (
                            <tr key={idx}>
                              {row.inputs.map((inpVal, cIdx) => (
                                <td key={cIdx} className="px-3 py-2 text-center font-mono">
                                  {isLogicStateCell(inpVal) ? (
                                    <LogicBadge state={inpVal} compact />
                                  ) : (
                                    <span className="font-bold text-win-ink">{inpVal}</span>
                                  )}
                                </td>
                              ))}
                              {row.outputs.map((outVal, cIdx) => (
                                <td
                                  key={cIdx}
                                  className="border-l border-win-surface bg-win-canvas px-3 py-2 text-center font-mono"
                                >
                                  {isLogicStateCell(outVal) ? (
                                    <LogicBadge state={outVal} compact />
                                  ) : (
                                    <span className="font-bold text-win-navy">{outVal}</span>
                                  )}
                                </td>
                              ))}
                              <td className="border-l border-win-surface px-3 py-2 text-[11px] text-win-muted">
                                {row.mode ?? 'Стандартний логічний стан'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="win95-statusbar-cell mx-1.5 mb-1.5 px-3 py-2 text-[11px] text-win-muted">
                    Позначення рівнів сигналу: <strong className="text-win-ink">0</strong> — низький
                    рівень (LOW), <strong className="text-logic-high">1</strong> — високий рівень
                    (HIGH), <strong className="text-logic-z">Z</strong> — високоімпедансний стан
                    (High-Z), <strong className="text-logic-x">X</strong> — конфлікт або
                    невизначеність.
                  </div>
                </div>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
};
