import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Clock,
  Copy,
  Cpu,
  FileSpreadsheet,
  GitBranch,
  History,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { PRESET_CIRCUITS, type CircuitSummaryDTO } from '@logicforge/shared-types';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loginDemo } = useAuth();

  const [circuits, setCircuits] = useState<CircuitSummaryDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [deleteTarget, setDeleteTarget] = useState<CircuitSummaryDTO | null>(null);

  const loadCircuits = async () => {
    setLoading(true);
    try {
      const res = await api.listCircuits();
      setCircuits(res.circuits);
    } catch {
      // Fallback до локальних пресетів, якщо бекенд ще запускається
      setCircuits(
        PRESET_CIRCUITS.map((p) => ({
          id: p.id,
          title: p.document.metadata.title,
          description: p.document.metadata.description,
          category: p.document.metadata.category,
          isPublic: true,
          tags: p.document.metadata.tags,
          nodeCount: p.document.nodes.length,
          edgeCount: p.document.edges.length,
          criticalPathNs: 32,
          maxClockMhz: 31.25,
          authorId: 'demo',
          authorName: 'Студент Кафедри АСУ',
          createdAt: p.document.metadata.createdAt,
          updatedAt: p.document.metadata.updatedAt,
        })),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCircuits();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    circuits.forEach((c) => set.add(c.category));
    return ['ALL', ...Array.from(set)];
  }, [circuits]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return circuits.filter((c) => {
      if (selectedCategory !== 'ALL' && c.category !== selectedCategory) return false;
      if (q) {
        const text = `${c.title} ${c.description} ${c.tags.join(' ')}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [circuits, search, selectedCategory]);

  const totalNodes = circuits.reduce((acc, c) => acc + c.nodeCount, 0);
  const totalEdges = circuits.reduce((acc, c) => acc + c.edgeCount, 0);

  const handleFork = async (id: string) => {
    try {
      if (!user) {
        await loginDemo();
      }
      const res = await api.forkCircuit(id);
      navigate(`/editor/${res.circuit.id}`);
    } catch {
      navigate(`/editor/${id}`);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteCircuit(deleteTarget.id);
      setDeleteTarget(null);
      await loadCircuits();
    } catch {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-8">
      {/* Головний банер інформаційної системи */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 p-6 md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr] items-center">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              Інтерактивна САПР моделювання цифрових та мікропроцесорних схем
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Проєктуйте, досліджуйте та верифікуйте цифрову логіку в реальному часі
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
              Гібридне алгоритмічне ядро поєднує топологічне сортування графа за алгоритмом Кана,
              пошук циклів зворотного зв’язку за алгоритмом Тар’яна та дискретно-подійну чергу
              Min-Heap із затримками поширення сигналів у чотиризначній тристабільній логіці{' '}
              <span className="font-mono text-emerald-300">{'{0, 1, High-Z, X}'}</span>.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link to="/editor">
                <Button variant="primary" size="lg" icon={<Plus className="h-4 w-4" />}>
                  Створити нову схему
                </Button>
              </Link>
              <Link to="/editor/preset-full-adder">
                <Button variant="secondary" size="lg" icon={<ArrowRight className="h-4 w-4" />}>
                  Відкрити 1-бітний суматор
                </Button>
              </Link>
              <Link to="/library">
                <Button variant="outline" size="lg">
                  Довідник елементів (24 ІМС)
                </Button>
              </Link>
            </div>
          </div>

          {/* KPI-картки стану бази знань */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Проєктів у репозиторії</span>
                <Layers className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-white">{circuits.length}</div>
              <div className="mt-1 text-[11px] text-slate-500">Публічні та авторські схеми</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Бібліотека елементів</span>
                <Cpu className="h-4 w-4 text-sky-400" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-white">24 типи</div>
              <div className="mt-1 text-[11px] text-slate-500">Вентилі, D/JK, NE555, АЛП</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Логічних вузлів</span>
                <GitBranch className="h-4 w-4 text-violet-400" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-white">{totalNodes}</div>
              <div className="mt-1 text-[11px] text-slate-500">{totalEdges} сигнальних трас</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Точність симуляції</span>
                <Clock className="h-4 w-4 text-amber-400" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-white">1 нс</div>
              <div className="mt-1 text-[11px] text-slate-500">Event-Driven + STA аналіз</div>
            </div>
          </div>
        </div>
      </section>

      {/* Пошук та фільтрація каталогу проєктів */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">
              Каталог схемних проєктів та еталонних моделей
            </h2>
            <p className="text-xs text-slate-400">
              Оберіть готову схему для інтерактивної симуляції, перегляду історії ревізій або
              формування друкованої інженерної специфікації.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Пошук за назвою або тегом..."
                className="w-64 rounded-lg border border-slate-800 bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              {cat === 'ALL' ? 'Усі категорії' : cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">
            Завантаження каталогу схем...
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <article
                key={item.id}
                className="group flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/75 p-5 transition-all hover:border-emerald-500/50 hover:bg-slate-900"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                      {item.category}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      T_crit: {item.criticalPathNs} нс ({item.maxClockMhz} МГц)
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-white group-hover:text-emerald-300 transition-colors">
                    {item.title}
                  </h3>
                  <p className="line-clamp-3 text-xs leading-relaxed text-slate-400">
                    {item.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 space-y-3 border-t border-slate-800/90 pt-3.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Елементів: <strong className="text-slate-200">{item.nodeCount}</strong> |
                      З’єднань: <strong className="text-slate-200">{item.edgeCount}</strong>
                    </span>
                    <span>Автор: {item.authorName}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link to={`/editor/${item.id}`} className="flex-1">
                      <Button variant="primary" size="sm" className="w-full">
                        Відкрити в симуляторі
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleFork(item.id)}
                      title="Створити власну копію (Fork)"
                      icon={<Copy className="h-3.5 w-3.5" />}
                    />
                    <Link to={`/revisions/${item.id}`}>
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Історія ревізій схеми"
                        icon={<History className="h-3.5 w-3.5" />}
                      />
                    </Link>
                    <Link to={`/reports/${item.id}`}>
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Інженерний звіт та специфікація"
                        icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                      />
                    </Link>
                    {user && user.id === item.authorId && !item.id.startsWith('preset-') && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setDeleteTarget(item)}
                        title="Видалити схему"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                      />
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Підтвердження видалення проєкту"
        subtitle="Ця дія видалить схему та всі пов’язані з нею ревізії з бази даних."
        maxWidthClass="max-w-md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
              Скасувати
            </Button>
            <Button variant="danger" size="sm" onClick={() => void confirmDelete()}>
              Видалити остаточно
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          Ви дійсно бажаєте видалити схему{' '}
          <strong className="text-white">«{deleteTarget?.title}»</strong>?
        </p>
      </Modal>
    </div>
  );
};
