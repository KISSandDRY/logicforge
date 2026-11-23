import React, { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box,
  Copy,
  Cpu,
  Edit2,
  FileSpreadsheet,
  History,
  Layers,
  Lock,
  Plus,
  Search,
  Trash2,
  Workflow,
} from 'lucide-react';
import type { CircuitSummaryDTO, CustomICDefinition } from '@logicforge/shared-types';
import { NewSchemeModal } from '../components/circuit/NewSchemeModal';
import { Button, getButtonClassName } from '../components/ui/Button';
import { MathVar } from '../components/ui/MathFormula';
import { Modal } from '../components/ui/Modal';
import { Win95Dropdown } from '../components/ui/Win95Dropdown';
import { Win95NumberInput } from '../components/ui/Win95NumberInput';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';

type CabinetTab = 'all' | 'personal' | 'presets' | 'custom-ics';

export const CabinetPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    activeCircuitId,
    circuits,
    customIcs,
    loadingCircuits,
    selectCircuit,
    duplicateCircuit,
    deleteCircuit,
    updateCustomIc,
    deleteCustomIc,
    openCustomIcInEditor,
  } = useWorkspace();

  const formId = useId();
  const [activeTab, setActiveTab] = useState<CabinetTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CircuitSummaryDTO | null>(null);
  const [editingIc, setEditingIc] = useState<CustomICDefinition | null>(null);
  const [editIcName, setEditIcName] = useState('');
  const [editIcCode, setEditIcCode] = useState('');
  const [editIcDesc, setEditIcDesc] = useState('');
  const [editIcDelay, setEditIcDelay] = useState(14);
  const [editIcInputs, setEditIcInputs] = useState<CustomICDefinition['inputPins']>([]);
  const [editIcOutputs, setEditIcOutputs] = useState<CustomICDefinition['outputPins']>([]);
  const [editIcSubmitted, setEditIcSubmitted] = useState(false);
  const [editIcBusy, setEditIcBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const openEditIcModal = (ic: CustomICDefinition) => {
    setEditingIc(ic);
    setEditIcName(ic.name);
    setEditIcCode(ic.code);
    setEditIcDesc(ic.description);
    setEditIcDelay(ic.propagationDelayNs);
    setEditIcInputs(ic.inputPins.map((p) => ({ ...p })));
    setEditIcOutputs(ic.outputPins.map((p) => ({ ...p })));
    setEditIcSubmitted(false);
  };

  const handleSaveCustomIcEdit = async () => {
    if (!editingIc) return;
    setEditIcSubmitted(true);
    const trimmedName = editIcName.trim();
    const trimmedCode = editIcCode.trim().toUpperCase();
    if (trimmedName.length < 2 || trimmedCode.length < 2) return;

    setEditIcBusy(true);
    try {
      const updatedPinsMap = new Map<string, string>();
      editIcInputs.forEach((p) => updatedPinsMap.set(p.mappedNodeId, p.name.trim() || p.id));
      editIcOutputs.forEach((p) => updatedPinsMap.set(p.mappedNodeId, p.name.trim() || p.id));

      const updatedNodes = editingIc.internalCircuit.nodes.map((node) =>
        updatedPinsMap.has(node.id)
          ? {
              ...node,
              properties: { ...node.properties, label: updatedPinsMap.get(node.id)! },
            }
          : node,
      );

      await updateCustomIc(editingIc.id, {
        name: trimmedName,
        code: trimmedCode,
        description: editIcDesc.trim(),
        propagationDelayNs: Math.max(1, Math.min(1000, Math.round(editIcDelay) || 14)),
        inputPins: editIcInputs.map((p) => ({ ...p, name: p.name.trim() || p.id })),
        outputPins: editIcOutputs.map((p) => ({ ...p, name: p.name.trim() || p.id })),
        internalCircuit: {
          nodes: updatedNodes,
          edges: editingIc.internalCircuit.edges,
        },
      });

      setEditingIc(null);
      showToast(`Параметри мікросхеми «${trimmedCode}» оновлено`);
    } finally {
      setEditIcBusy(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3200);
  };

  const personalCircuits = useMemo(
    () => circuits.filter((c) => !c.id.startsWith('preset-')),
    [circuits],
  );
  const presetCircuits = useMemo(
    () => circuits.filter((c) => c.id.startsWith('preset-')),
    [circuits],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    circuits.forEach((c) => set.add(c.category));
    return ['ALL', ...Array.from(set)];
  }, [circuits]);

  const displayedCircuits = useMemo(() => {
    const source =
      activeTab === 'personal'
        ? personalCircuits
        : activeTab === 'presets'
          ? presetCircuits
          : circuits;

    return source.filter((c) => {
      const matchesCat = selectedCategory === 'ALL' || c.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q));
      return matchesCat && matchesSearch;
    });
  }, [activeTab, circuits, personalCircuits, presetCircuits, searchQuery, selectedCategory]);

  const handleOpenCircuit = async (
    circuitId: string,
    targetRoute: '/editor' | '/revisions' | '/reports' = '/editor',
  ) => {
    await selectCircuit(circuitId);
    navigate(`${targetRoute}/${circuitId}`);
  };

  const handleDuplicate = async (sourceId: string) => {
    const cloned = await duplicateCircuit(sourceId);
    setActiveTab('personal');
    showToast(`Створено особисту копію: «${cloned.doc.metadata.title}»`);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const title = deleteTarget.title;
    await deleteCircuit(deleteTarget.id);
    setDeleteTarget(null);
    showToast(`Схему «${title}» видалено з робочого простору.`);
  };

  if (!user) {
    return (
      <div className="win95-desktop-bg min-h-screen pb-10">
        <div className="mx-auto max-w-4xl px-3 sm:px-4 py-4 space-y-3">
          <header className="win95-outset bg-win-bg px-3 py-1.5 flex items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-win-navy" aria-hidden="true" />
            <h1 className="text-sm font-bold text-win-ink truncate">
              Мої схеми та бібліотека проєктів
            </h1>
          </header>

          <section className="win95-window overflow-hidden" data-testid="auth-required-gate">
            <div className="win95-titlebar flex items-center gap-2 px-3 py-1.5 text-xs font-bold">
              <Lock className="h-3.5 w-3.5 text-win-highlight" aria-hidden="true" />
              <span>ДОСТУП ОБМЕЖЕНО — ОСОБИСТИЙ КАБІНЕТ</span>
            </div>
            <div className="p-5 bg-win-bg space-y-3 text-xs text-win-ink">
              <p className="text-sm font-bold">
                Розділ «Мої схеми», збережені проєкти та бібліотека Custom IC доступні лише
                авторизованим користувачам.
              </p>
              <p className="text-win-muted leading-relaxed">
                Увійдіть в акаунт або зареєструйтеся, щоб створювати та зберігати власні проєкти,
                клонувати еталонні шаблони, вести ревізії й інкапсулювати мікросхеми Custom IC.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Link to="/login" className={getButtonClassName('primary', 'sm')}>
                  Увійти в акаунт
                </Link>
                <Link to="/register" className={getButtonClassName('secondary', 'sm')}>
                  Реєстрація
                </Link>
                <Link to="/editor" className={getButtonClassName('outline', 'sm')}>
                  Відкрити редактор
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="win95-desktop-bg min-h-screen pb-10">
      <div className="mx-auto max-w-[1680px] px-3 sm:px-4 py-3 space-y-4">
        {toastMsg && (
          <div className="win95-window fixed bottom-5 right-5 z-50 bg-win-highlight px-4 py-2.5 text-xs font-bold text-win-navy">
            {toastMsg}
          </div>
        )}

        {/* Компактний заголовок сторінки */}
        <header className="win95-outset bg-win-bg px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="h-4 w-4 shrink-0 text-win-navy" aria-hidden="true" />
            <h1 className="text-sm font-bold text-win-ink truncate">
              Мої схеми та бібліотека проєктів
            </h1>
          </div>
          <span className="win95-statusbar-cell px-2 py-0.5 font-mono text-xs font-bold text-win-ink shrink-0">
            Показано: {activeTab === 'custom-ics' ? customIcs.length : displayedCircuits.length}
          </span>
        </header>

        {/* Панель вкладок, пошуку, фільтру та сітка карток */}
        <section className="win95-outset bg-win-bg p-3 space-y-3">
          <div>
            {/* Панель вкладок та пошуку */}
            <div className="win95-inset bg-win-surface flex flex-col lg:flex-row lg:items-center justify-between gap-2 p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="tab-all-circuits"
                  onClick={() => setActiveTab('all')}
                  className={`min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 px-3 py-1 text-xs font-bold touch-manipulation ${
                    activeTab === 'all'
                      ? 'win95-button-pressed bg-win-surface text-win-ink'
                      : 'win95-button text-win-ink'
                  }`}
                >
                  Усі схеми ({circuits.length})
                </button>
                <button
                  type="button"
                  data-testid="tab-personal-circuits"
                  onClick={() => setActiveTab('personal')}
                  className={`min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 px-3 py-1 text-xs font-bold touch-manipulation ${
                    activeTab === 'personal'
                      ? 'win95-button-pressed bg-win-surface text-win-ink'
                      : 'win95-button text-win-ink'
                  }`}
                >
                  Мої схеми ({personalCircuits.length})
                </button>
                <button
                  type="button"
                  data-testid="tab-preset-circuits"
                  onClick={() => setActiveTab('presets')}
                  className={`min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 px-3 py-1 text-xs font-bold touch-manipulation ${
                    activeTab === 'presets'
                      ? 'win95-button-pressed bg-win-surface text-win-ink'
                      : 'win95-button text-win-ink'
                  }`}
                >
                  Еталонні шаблони ({presetCircuits.length})
                </button>
                <button
                  type="button"
                  data-testid="tab-custom-ics"
                  onClick={() => setActiveTab('custom-ics')}
                  className={`min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 px-3 py-1 text-xs font-bold touch-manipulation ${
                    activeTab === 'custom-ics'
                      ? 'win95-button-pressed bg-win-surface text-win-ink'
                      : 'win95-button text-win-ink'
                  }`}
                >
                  Мої мікросхеми ІМС ({customIcs.length})
                </button>
              </div>

              {activeTab !== 'custom-ics' && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 sm:w-64">
                    <label htmlFor={`${formId}-search`} className="sr-only">
                      Пошук проєктів за назвою або тегом
                    </label>
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-win-muted" />
                    <input
                      id={`${formId}-search`}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Пошук за назвою або тегом..."
                      className="win95-field min-h-7 coarse:min-h-9 w-full pl-8 pr-3 py-1.5 text-xs text-win-ink"
                    />
                  </div>
                  <label htmlFor={`${formId}-cat-filter`} className="sr-only">
                    Фільтр категорії схем
                  </label>
                  <Win95Dropdown
                    id={`${formId}-cat-filter`}
                    testId="cabinet-cat-filter"
                    ariaLabel="Фільтр категорії схем"
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                    options={categories.map((cat) => ({
                      value: cat,
                      label: cat === 'ALL' ? 'Усі категорії' : cat,
                    }))}
                    className="w-full sm:w-52"
                  />
                </div>
              )}
            </div>

            {/* Вміст вкладки «Мої мікросхеми ІМС» */}
            {activeTab === 'custom-ics' ? (
              customIcs.length === 0 ? (
                <div className="win95-inset bg-win-canvas p-8 text-center space-y-3">
                  <Box className="mx-auto h-8 w-8 text-win-muted" />
                  <div className="text-sm font-bold text-win-ink">
                    У вашому кабінеті ще немає створених користувацьких мікросхем (Custom IC)
                  </div>
                  <p className="mx-auto max-w-lg text-xs text-win-muted">
                    Ви можете упакувати будь-яку схему з вхідними перемикачами та вихідними
                    індикаторами у власну інтегральну мікросхему в редакторі САПР (кнопка «Створити
                    ІМС»).
                  </p>
                  <div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate(`/editor/${activeCircuitId}`)}
                      icon={<Cpu className="h-3.5 w-3.5" />}
                    >
                      Перейти до редактора для створення ІМС
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {customIcs.map((ic) => (
                    <article
                      key={ic.id}
                      className="win95-outset flex flex-col justify-between p-3.5"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="win95-statusbar-cell px-2 py-0.5 font-mono text-xs font-bold text-win-navy">
                            {ic.code}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-win-muted">
                            <MathVar sym="t" sub="pd" />
                            <span className="font-mono"> = {ic.propagationDelayNs} нс</span>
                          </span>
                        </div>
                        <h2 className="mt-2 text-sm font-bold text-win-ink">{ic.name}</h2>
                        <p className="mt-1 text-xs text-win-muted">{ic.description}</p>
                        <div className="win95-statusbar-cell mt-3 grid grid-cols-2 gap-2 p-2 font-mono text-[11px]">
                          <div>
                            <span className="text-win-muted">Входи ({ic.inputPins.length}): </span>
                            <strong className="text-win-ink">
                              {ic.inputPins.map((p) => p.name).join(', ')}
                            </strong>
                          </div>
                          <div>
                            <span className="text-win-muted">
                              Виходи ({ic.outputPins.length}):{' '}
                            </span>
                            <strong className="text-win-navy">
                              {ic.outputPins.map((p) => p.name).join(', ')}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1.5 border-t border-win-shadow pt-2.5">
                        <Button
                          variant="primary"
                          size="xs"
                          className="w-full"
                          onClick={() => navigate(`/editor/${activeCircuitId}`)}
                          icon={<Cpu className="h-3.5 w-3.5" />}
                        >
                          Використати в редакторі
                        </Button>
                        <div className="flex items-center justify-between gap-1">
                          <Button
                            variant="outline"
                            size="xs"
                            className="flex-1"
                            data-testid={`btn-edit-custom-ic-${ic.id}`}
                            onClick={() => openEditIcModal(ic)}
                            title="Редагувати назву, код, затримку та піни ІМС"
                            icon={<Edit2 className="h-3 w-3 text-win-navy" />}
                          >
                            Редагувати
                          </Button>
                          <Button
                            variant="secondary"
                            size="xs"
                            data-testid={`btn-open-custom-ic-schema-${ic.id}`}
                            onClick={() => {
                              const draftId = openCustomIcInEditor(ic);
                              navigate(`/editor/${draftId}`);
                            }}
                            title="Відкрити внутрішню схему мікросхеми у редакторі"
                            icon={<Workflow className="h-3.5 w-3.5 text-win-navy" />}
                          >
                            Схема ІМС
                          </Button>
                          <Button
                            variant="danger"
                            size="xs"
                            aria-label={`Видалити мікросхему «${ic.code}»`}
                            title="Видалити власну ІМС"
                            onClick={() => {
                              void deleteCustomIc(ic.id).then(() => {
                                showToast(`Мікросхему «${ic.code}» видалено`);
                              });
                            }}
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )
            ) : loadingCircuits ? (
              <div className="py-10 text-center text-sm text-win-muted">
                Завантаження списку схем...
              </div>
            ) : displayedCircuits.length === 0 ? (
              <div className="win95-inset bg-win-canvas p-8 text-center space-y-3">
                <Layers className="mx-auto h-8 w-8 text-win-muted" />
                <div className="text-sm font-bold text-win-ink">
                  {activeTab === 'personal'
                    ? 'У розділі «Мої схеми» поки немає особистих проєктів'
                    : 'За обраними критеріями схем не знайдено'}
                </div>
                <p className="mx-auto max-w-md text-xs text-win-muted">
                  Створіть нову цифрову схему з чистого аркуша або клонуйте будь-який з 7 еталонних
                  інженерних шаблонів у свій кабінет.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setCreateModalOpen(true)}
                    icon={<Plus className="h-3.5 w-3.5" />}
                  >
                    Створити нову схему
                  </Button>
                  {activeTab === 'personal' && (
                    <Button variant="secondary" size="sm" onClick={() => setActiveTab('presets')}>
                      Переглянути еталонні шаблони ({presetCircuits.length})
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {displayedCircuits.map((item) => {
                  const isCurrentActive = item.id === activeCircuitId;
                  const isPreset = item.id.startsWith('preset-');
                  return (
                    <article
                      key={item.id}
                      data-testid={`cabinet-circuit-${item.id}`}
                      className={`win95-window flex flex-col justify-between ${
                        isCurrentActive ? 'ring-1 ring-win-navy' : ''
                      }`}
                    >
                      <div>
                        <div
                          className={`flex items-center justify-between gap-1.5 px-2.5 py-1 text-[11px] font-bold ${
                            isCurrentActive ? 'win95-titlebar' : 'win95-titlebar-inactive'
                          }`}
                        >
                          <span className="truncate">{item.category}</span>
                          <span className="font-mono text-[10px]">
                            {isCurrentActive ? 'АКТИВНА' : isPreset ? 'ШАБЛОН' : 'МОЯ СХЕМА'}
                          </span>
                        </div>

                        <div className="p-3">
                          <h2 className="text-sm font-bold text-win-ink">{item.title}</h2>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-win-muted">
                            {item.description}
                          </p>

                          <div className="win95-statusbar-cell mt-3 grid grid-cols-3 gap-1.5 p-2 text-center font-mono text-[11px]">
                            <div>
                              <div className="text-[9.5px] text-win-muted">Вузлів/Ліній</div>
                              <div className="font-bold text-win-ink">
                                {item.nodeCount} / {item.edgeCount}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9.5px] text-win-muted">
                                <MathVar sym="T" sub="crit" />
                              </div>
                              <div className="font-bold text-win-ink">{item.criticalPathNs} нс</div>
                            </div>
                            <div>
                              <div className="text-[9.5px] text-win-muted">
                                <MathVar sym="f" sub="max" />
                              </div>
                              <div className="font-bold text-win-navy">{item.maxClockMhz} МГц</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5 border-t border-win-shadow p-2.5">
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full"
                          onClick={() => void handleOpenCircuit(item.id, '/editor')}
                          icon={<Cpu className="h-3.5 w-3.5" />}
                        >
                          Відкрити в редакторі
                        </Button>

                        <div className="flex items-center justify-between gap-1">
                          <Button
                            variant="outline"
                            size="xs"
                            className="flex-1"
                            onClick={() => void handleDuplicate(item.id)}
                            title="Створити власну копію цієї схеми у розділі «Мої схеми»"
                            icon={<Copy className="h-3 w-3" />}
                          >
                            Клонувати
                          </Button>
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => void handleOpenCircuit(item.id, '/revisions')}
                            title="Історія ревізій схеми"
                            icon={<History className="h-3.5 w-3.5" />}
                          >
                            Ревізії
                          </Button>
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => void handleOpenCircuit(item.id, '/reports')}
                            title="Конструкторський звіт BOM / Netlist / ДДНФ"
                            icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                          >
                            Звіт
                          </Button>
                          {!isPreset && (
                            <Button
                              variant="danger"
                              size="xs"
                              onClick={() => setDeleteTarget(item)}
                              aria-label={`Видалити схему «${item.title}»`}
                              title="Видалити схему"
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                            />
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <NewSchemeModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCreated={(createdId) => navigate(`/editor/${createdId}`)}
        />

        {/* Модальне вікно редагування параметрів власної ІМС */}
        <Modal
          open={Boolean(editingIc)}
          onClose={() => setEditingIc(null)}
          title={
            editingIc
              ? `Редагування власної мікросхеми «${editingIc.code}»`
              : 'Редагування мікросхеми'
          }
          subtitle="Змініть назву, маркування, затримку поширення та підписи виводів або відкрийте внутрішню схему у редакторі."
          maxWidthClass="max-w-lg"
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!editingIc) return;
                  const target = editingIc;
                  setEditingIc(null);
                  const draftId = openCustomIcInEditor(target);
                  navigate(`/editor/${draftId}`);
                }}
                icon={<Workflow className="h-3.5 w-3.5 text-win-navy" />}
              >
                Схема ІМС у редакторі →
              </Button>
              <Button
                variant="primary"
                size="sm"
                data-testid="btn-save-custom-ic-edit"
                loading={editIcBusy}
                onClick={() => void handleSaveCustomIcEdit()}
              >
                Зберегти зміни
              </Button>
            </div>
          }
        >
          {editingIc && (
            <div data-testid="edit-custom-ic-modal" className="space-y-3 text-xs text-win-ink">
              <div>
                <label htmlFor={`${formId}-edit-ic-name`} className="mb-1 block font-bold">
                  Повна назва мікросхеми
                </label>
                <input
                  id={`${formId}-edit-ic-name`}
                  data-testid="edit-ic-name-input"
                  type="text"
                  value={editIcName}
                  onChange={(e) => setEditIcName(e.target.value)}
                  className={`win95-field w-full px-2.5 py-1.5 font-normal ${
                    editIcSubmitted && editIcName.trim().length < 2 ? 'win95-field-error' : ''
                  }`}
                />
                {editIcSubmitted && editIcName.trim().length < 2 && (
                  <p className="mt-1 text-[11px] font-bold text-logic-x">Мінімум 2 символи.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${formId}-edit-ic-code`} className="mb-1 block font-bold">
                    Кодове маркування
                  </label>
                  <input
                    id={`${formId}-edit-ic-code`}
                    data-testid="edit-ic-code-input"
                    type="text"
                    value={editIcCode}
                    onChange={(e) => setEditIcCode(e.target.value)}
                    className={`win95-field w-full px-2.5 py-1.5 font-mono ${
                      editIcSubmitted && editIcCode.trim().length < 2 ? 'win95-field-error' : ''
                    }`}
                  />
                  {editIcSubmitted && editIcCode.trim().length < 2 && (
                    <p className="mt-1 text-[11px] font-bold text-logic-x">Мінімум 2 символи.</p>
                  )}
                </div>
                <div>
                  <label htmlFor={`${formId}-edit-ic-delay`} className="mb-1 block font-bold">
                    Затримка корпусу (нс)
                  </label>
                  <Win95NumberInput
                    id={`${formId}-edit-ic-delay`}
                    min={1}
                    max={1000}
                    step={1}
                    value={editIcDelay}
                    onChange={(v) => setEditIcDelay(Math.max(1, Math.round(v) || 14))}
                  />
                </div>
              </div>

              <div>
                <label htmlFor={`${formId}-edit-ic-desc`} className="mb-1 block font-bold">
                  Опис мікросхеми
                </label>
                <textarea
                  id={`${formId}-edit-ic-desc`}
                  data-testid="edit-ic-desc-input"
                  rows={2}
                  value={editIcDesc}
                  onChange={(e) => setEditIcDesc(e.target.value)}
                  className="win95-field w-full px-2.5 py-1.5 font-normal"
                />
              </div>

              <div className="win95-inset bg-win-surface p-2.5 space-y-2">
                <div className="text-[11px] font-bold text-win-navy uppercase">
                  Маркування контактних виводів
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold">Вхідні виводи</div>
                    {editIcInputs.map((pin, idx) => (
                      <div key={pin.id} className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-win-muted w-10 shrink-0">
                          {pin.id}:
                        </span>
                        <input
                          type="text"
                          value={pin.name}
                          onChange={(e) =>
                            setEditIcInputs((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, name: e.target.value } : item,
                              ),
                            )
                          }
                          className="win95-field min-w-0 flex-1 px-2 py-1 font-mono text-xs"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold">Вихідні виводи</div>
                    {editIcOutputs.map((pin, idx) => (
                      <div key={pin.id} className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-win-muted w-12 shrink-0">
                          {pin.id}:
                        </span>
                        <input
                          type="text"
                          value={pin.name}
                          onChange={(e) =>
                            setEditIcOutputs((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, name: e.target.value } : item,
                              ),
                            )
                          }
                          className="win95-field min-w-0 flex-1 px-2 py-1 font-mono text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* Модальне вікно підтвердження видалення */}
        <Modal
          open={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Підтвердження видалення схеми"
          subtitle="Ця дія видалить схему з вашого особистого кабінету."
          maxWidthClass="max-w-md"
          footer={
            <Button variant="danger" size="sm" onClick={() => void confirmDelete()}>
              Видалити остаточно
            </Button>
          }
        >
          <p className="text-xs text-win-ink">
            Ви дійсно бажаєте видалити схему{' '}
            <strong className="text-win-ink">«{deleteTarget?.title}»</strong>?
          </p>
        </Modal>
      </div>
    </div>
  );
};
