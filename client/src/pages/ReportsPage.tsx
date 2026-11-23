import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileSpreadsheet, Lock, Printer } from 'lucide-react';
import {
  CircuitSimulator,
  PRESET_CIRCUITS,
  generateEngineeringReport,
  type EngineeringReport,
} from '@logicforge/shared-types';
import { Button, getButtonClassName } from '../components/ui/Button';
import { CircuitCanvas } from '../components/circuit/CircuitCanvas';
import { LogicBadge } from '../components/ui/LogicBadge';
import { BooleanSopFormula, MathVar } from '../components/ui/MathFormula';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../services/api';

export const ReportsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { activeCircuitId, activeDocument, customIcs, selectCircuit } = useWorkspace();
  const [authGateFeature, setAuthGateFeature] = useState<string | null>(null);

  const targetId = id || activeCircuitId || 'preset-full-adder';

  const [runs, setRuns] = useState<
    Array<{
      id: string;
      durationSimNs: number;
      processedEvents: number;
      criticalPathNs: number;
      status: string;
      createdAt: string;
    }>
  >([]);

  useEffect(() => {
    if (id && id !== activeCircuitId) {
      void selectCircuit(id);
    }
  }, [id, activeCircuitId, selectCircuit]);

  const sourceDoc = useMemo(() => {
    const base =
      targetId === activeCircuitId
        ? activeDocument
        : (PRESET_CIRCUITS.find((p) => p.id === targetId)?.document ?? activeDocument);
    return {
      ...base,
      customDefinitions: customIcs.length > 0 ? customIcs : base.customDefinitions,
    };
  }, [targetId, activeCircuitId, activeDocument, customIcs]);

  const report: EngineeringReport = useMemo(
    () => generateEngineeringReport(sourceDoc),
    [sourceDoc],
  );

  const reportSnapshot = useMemo(() => {
    const sim = new CircuitSimulator(sourceDoc);
    const hasPeriodic = sourceDoc.nodes.some((n) => n.type === 'CLOCK' || n.type === 'TIMER_555');
    return hasPeriodic ? sim.advanceBy(240) : sim.settleCombinational(500);
  }, [sourceDoc]);

  const schematicHeightPx = useMemo(() => {
    if (sourceDoc.nodes.length === 0) return 200;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of sourceDoc.nodes) {
      minY = Math.min(minY, n.position.y - 22);
      maxY = Math.max(maxY, n.position.y + n.height + 16);
    }
    const spanY = Math.max(150, maxY - minY + 32);
    return Math.min(310, Math.max(210, Math.round(spanY * 0.78)));
  }, [sourceDoc]);

  const previewViewport = useMemo(() => ({ panX: 0, panY: 0, zoom: 1, gridSnap: true }), []);

  useEffect(() => {
    api
      .getCircuitReport(targetId)
      .then((res) => {
        setRuns(res.runs ?? []);
      })
      .catch(() => {
        setRuns([]);
      });
  }, [targetId]);

  const exportCsvBom = () => {
    if (!user) {
      setAuthGateFeature('експорт конструкторської специфікації BOM (.csv)');
      return;
    }
    const header = 'Тип;Найменування;Категорія;Кількість;Позначення;Затримка_нс\n';
    const body = report.bom
      .map(
        (b) =>
          `${b.type};"${b.name}";${b.category};${b.quantity};"${b.designators.join(', ')}";${b.unitDelayNs}`,
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bom_${targetId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    if (!user) {
      setAuthGateFeature('друк та експорт PDF-креслення за стандартом ЄСКД');
      return;
    }
    window.print();
  };

  const docCode = `LF-${targetId
    .replace(/^preset-/, '')
    .toUpperCase()
    .slice(0, 14)}-Е3`;
  const reportDateShort = new Date(report.generatedAt).toLocaleDateString('uk-UA');
  const authorDisplayName = user?.fullName || user?.username || 'Інженер';
  const authorHandle = user?.username ? `@${user.username}` : '';

  return (
    <div className={`win95-desktop-bg min-h-screen ${!user ? 'print-auth-required' : ''}`}>
      <div className="mx-auto max-w-6xl px-3 sm:px-4 py-3 space-y-3">
        <div className="no-print win95-outset bg-win-bg px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-win-navy" aria-hidden="true" />
            <h1 className="text-sm font-bold text-win-ink truncate">
              Специфікація: «{report.circuitTitle}»
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              data-testid="btn-export-bom"
              title={
                user
                  ? 'Завантажити відомість комплектуючих BOM (.csv)'
                  : 'Доступно лише авторизованим користувачам'
              }
              onClick={exportCsvBom}
              icon={
                !user ? (
                  <Lock className="h-3.5 w-3.5 text-win-muted" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )
              }
            >
              Експорт BOM (.csv)
            </Button>
            <Button
              variant="primary"
              size="sm"
              data-testid="btn-print-pdf"
              title={
                user
                  ? 'Сформувати креслення ЄСКД з основним написом та зберегти у PDF'
                  : 'Доступно лише авторизованим користувачам'
              }
              onClick={handlePrintPdf}
              icon={
                !user ? (
                  <Lock className="h-3.5 w-3.5 text-win-muted" />
                ) : (
                  <Printer className="h-3.5 w-3.5" />
                )
              }
            >
              Друк / PDF
            </Button>
          </div>
        </div>

        {!user && (
          <>
            <div
              data-testid="reports-guest-banner"
              className="no-print win95-statusbar-cell bg-win-bg px-3 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2"
            >
              <span className="inline-flex items-center gap-1.5 text-win-ink">
                <Lock className="h-3.5 w-3.5 shrink-0 text-win-navy" aria-hidden="true" />
                <span>
                  <strong>Режим гостя:</strong> перегляд звіту доступний, а експорт BOM (.csv) і
                  друк / PDF-креслення зі штампом автора відкриті лише авторизованим користувачам.
                </span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Link to="/login" className={getButtonClassName('primary', 'xs')}>
                  Увійти
                </Link>
                <Link to="/register" className={getButtonClassName('secondary', 'xs')}>
                  Реєстрація
                </Link>
              </div>
            </div>

            <div
              data-testid="print-auth-notice"
              className="hidden print:block border-2 border-black bg-white p-6 text-center text-black"
            >
              <div className="text-sm font-bold uppercase tracking-wide">
                LOGICFORGE САПР • ЕКСПОРТ ТА ДРУК ОБМЕЖЕНО
              </div>
              <p className="mt-2 text-xs">
                Друк та експорт PDF-креслення (зі штампом ЄСКД, автором та специфікацією) доступні
                лише авторизованим користувачам системи.
              </p>
            </div>
          </>
        )}

        <div className="print-cad-sheet space-y-3">
          {/* Компактний конструкторський штамп / паспорт креслення для друку та PDF */}
          <header
            data-testid="print-title-block"
            className="hidden print:block cad-titleblock border border-black bg-white text-black"
          >
            <div className="flex items-center justify-between gap-4 border-b border-black bg-gray-100 px-3 py-1 text-[9.5px] font-mono">
              <span className="font-bold uppercase tracking-wider">
                LOGICFORGE САПР • КОНСТРУКТОРСЬКА СПЕЦИФІКАЦІЯ
              </span>
              <span className="font-bold whitespace-nowrap">{docCode} • Формат А4</span>
            </div>

            <div className="flex items-start justify-between gap-6 border-b border-gray-300 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-bold leading-tight text-black break-words">
                  {report.circuitTitle}
                </h2>
                <p className="mt-1 text-[10px] text-gray-700">
                  Категорія: <strong className="text-black">{report.category}</strong> • Сформовано:{' '}
                  <span className="font-mono">
                    {new Date(report.generatedAt).toLocaleString('uk-UA')}
                  </span>
                </p>
              </div>

              <div className="shrink-0 text-right text-[10px] leading-snug space-y-0.5 whitespace-nowrap">
                <div>
                  <span className="font-bold">Розробив:</span> {authorDisplayName}{' '}
                  {authorHandle && (
                    <span className="font-mono text-gray-700">({authorHandle})</span>
                  )}
                </div>
                <div className="text-gray-700">
                  <span className="font-bold text-black">Дата:</span>{' '}
                  <span className="font-mono text-black">{reportDateShort}</span> •{' '}
                  <span className="font-bold text-black">Перевірив:</span> STA / ДДНФ
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 divide-x divide-gray-300 text-[10px]">
              <div className="px-3 py-1.5">
                <div className="text-[9px] text-gray-600">Елементів / Ліній / Вузлів</div>
                <div className="mt-0.5 font-mono text-[11px] font-bold text-black">
                  {report.totalNodes} / {report.totalEdges} / {report.totalNets}
                </div>
              </div>
              <div className="px-3 py-1.5">
                <div className="text-[9px] text-gray-600">
                  Критичний шлях (<MathVar sym="T" sub="crit" />)
                </div>
                <div className="mt-0.5 font-mono text-[11px] font-bold text-black">
                  {report.timing.criticalPathDelayNs} нс
                </div>
              </div>
              <div className="px-3 py-1.5">
                <div className="text-[9px] text-gray-600">
                  Гранична частота <MathVar sym="f" sub="max" />
                </div>
                <div className="mt-0.5 font-mono text-[11px] font-bold text-black">
                  {report.timing.maxClockFrequencyMhz} МГц
                </div>
              </div>
              <div className="px-3 py-1.5">
                <div className="text-[9px] text-gray-600">Контури зворотного зв’язку</div>
                <div className="mt-0.5 font-mono text-[11px] font-bold text-black">
                  {report.timing.stronglyConnectedCycles.length}
                </div>
              </div>
            </div>
          </header>

          {/* Паспорт схеми та зведення Static Timing Analysis */}
          <section className="win95-window p-4 space-y-3 print:hidden">
            <div className="border-b border-win-shadow pb-2.5 flex flex-wrap justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-win-ink">{report.circuitTitle}</h2>
                <p className="text-xs text-win-muted mt-0.5">
                  Категорія: {report.category} • Сформовано:{' '}
                  {new Date(report.generatedAt).toLocaleString('uk-UA')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
              <div className="win95-statusbar-cell p-2.5">
                <div className="text-win-muted">Елементів / Ліній / Вузлів</div>
                <div className="mt-1 font-mono text-base font-bold text-win-ink">
                  {report.totalNodes} / {report.totalEdges} / {report.totalNets}
                </div>
              </div>
              <div className="win95-statusbar-cell p-2.5">
                <div className="text-win-muted">
                  Критичний шлях (<MathVar sym="T" sub="crit" />)
                </div>
                <div className="mt-1 font-mono text-base font-bold text-win-navy">
                  {report.timing.criticalPathDelayNs} нс
                </div>
              </div>
              <div className="win95-statusbar-cell p-2.5">
                <div className="text-win-muted">
                  Гранична частота <MathVar sym="f" sub="max" />
                </div>
                <div className="mt-1 font-mono text-base font-bold text-win-ink">
                  {report.timing.maxClockFrequencyMhz} МГц
                </div>
              </div>
              <div className="win95-statusbar-cell p-2.5">
                <div className="text-win-muted">Контури зворотного зв’язку</div>
                <div className="mt-1 font-mono text-base font-bold text-win-ink">
                  {report.timing.stronglyConnectedCycles.length}
                </div>
              </div>
            </div>
          </section>

          {/* Графічне креслення принципової логічної схеми для перегляду та друку */}
          <section data-testid="report-schematic-section" className="win95-window overflow-hidden">
            <div className="win95-titlebar px-3 py-1.5 text-xs font-bold">
              0. ГРАФІЧНА ПРИНЦИПОВА ЛОГІЧНА СХЕМА
            </div>
            <div className="print-clean-canvas p-3 print:p-2">
              <div
                style={{ height: `${schematicHeightPx}px` }}
                className="w-full overflow-hidden print:bg-white"
              >
                <CircuitCanvas
                  nodes={sourceDoc.nodes}
                  edges={sourceDoc.edges}
                  viewport={previewViewport}
                  nodePinStates={reportSnapshot.nodePinStates}
                  edgeStates={reportSnapshot.edgeStates}
                  selectedNodeId={null}
                  selectedEdgeId={null}
                  customDefinitions={sourceDoc.customDefinitions}
                  fitToContent
                  hideGrid
                  hideStatusbar
                  readOnly
                />
              </div>
            </div>
          </section>

          {/* Звітна форма №1: Відомість елементів (BOM) */}
          <section className="win95-window overflow-hidden">
            <div className="win95-titlebar px-3 py-1.5 text-xs font-bold">
              1. ВІДОМІСТЬ КОМПЛЕКТУЮЧИХ ЛОГІЧНИХ ЕЛЕМЕНТІВ (BILL OF MATERIALS — BOM)
            </div>
            <div className="p-3">
              <div className="win95-inset overflow-x-auto bg-win-highlight">
                <table className="w-full text-left text-xs print:border-collapse">
                  <thead className="bg-win-surface text-win-ink font-bold border-b border-win-shadow print:bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 print:border print:border-black">Код типу</th>
                      <th className="px-3 py-2 print:border print:border-black">
                        Найменування елемента
                      </th>
                      <th className="px-3 py-2 print:border print:border-black">К-сть</th>
                      <th className="px-3 py-2 print:border print:border-black">
                        Позиційні позначення
                      </th>
                      <th className="px-3 py-2 print:border print:border-black">
                        Затримка <MathVar sym="t" sub="pd" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-win-surface bg-win-highlight">
                    {report.bom.map((item) => (
                      <tr key={item.type}>
                        <td className="px-3 py-2 font-mono font-bold text-win-navy print:border print:border-black">
                          {item.type}
                        </td>
                        <td className="px-3 py-2 text-win-ink font-medium print:border print:border-black">
                          {item.name}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-win-ink print:border print:border-black">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2 font-mono text-win-muted print:border print:border-black">
                          {item.designators.join(', ')}
                        </td>
                        <td className="px-3 py-2 font-mono text-win-muted print:border print:border-black">
                          {item.unitDelayNs} нс
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Звітна форма №2: Таблиця електричних з'єднань (Netlist) */}
          <section className="win95-window overflow-hidden">
            <div className="win95-titlebar px-3 py-1.5 text-xs font-bold">
              2. ТАБЛИЦЯ ЕКВІВАЛЕНТНИХ ЕЛЕКТРИЧНИХ ВУЗЛІВ (NETLIST)
            </div>
            <div className="p-3">
              <div className="win95-inset overflow-x-auto bg-win-highlight">
                <table className="w-full text-left text-xs print:border-collapse">
                  <thead className="bg-win-surface text-win-ink font-bold border-b border-win-shadow print:bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 print:border print:border-black">Вузол (Net ID)</th>
                      <th className="px-3 py-2 print:border print:border-black">
                        Вихідні драйвери
                      </th>
                      <th className="px-3 py-2 print:border print:border-black">
                        Вхідні навантаження
                      </th>
                      <th className="px-3 py-2 print:border print:border-black">Усталений стан</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-win-surface bg-win-highlight">
                    {report.netlist.map((net) => (
                      <tr key={net.netId}>
                        <td className="px-3 py-2 font-mono font-bold text-win-ink print:border print:border-black">
                          {net.netId}
                        </td>
                        <td className="px-3 py-2 font-mono text-win-ink print:border print:border-black">
                          {net.drivers.join(', ') || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-win-muted print:border print:border-black">
                          {net.loads.join(', ') || '—'}
                        </td>
                        <td className="px-3 py-2 print:border print:border-black">
                          <LogicBadge state={net.currentState} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Звітна форма №3: Таблиця істинності та булеві рівняння */}
          {report.truthTable && report.truthTable.rows.length > 0 && (
            <section className="win95-window overflow-hidden">
              <div className="win95-titlebar px-3 py-1.5 text-xs font-bold">
                3. ВЕРИФІКАЦІЙНА ТАБЛИЦЯ ІСТИННОСТІ ТА СИНТЕЗОВАНІ ВИРАЗИ ДДНФ
              </div>
              <div className="p-3 space-y-2.5">
                <div className="win95-inset bg-win-highlight p-3 space-y-1.5">
                  {Object.entries(report.truthTable.canonicalSopExpressions).map(([k, v]) => (
                    <BooleanSopFormula key={k} outputName={k} expression={v} />
                  ))}
                </div>
                <div className="win95-inset overflow-x-auto bg-win-highlight">
                  <table className="w-full text-left text-xs print:border-collapse">
                    <thead className="bg-win-bg text-win-ink font-mono font-bold border-b border-win-shadow">
                      <tr>
                        {report.truthTable.inputLabels.map((i) => (
                          <th key={i.nodeId} className="px-3 py-2 print:border print:border-black">
                            {i.label}
                          </th>
                        ))}
                        {report.truthTable.outputLabels.map((o) => (
                          <th
                            key={o.nodeId}
                            className="border-l border-win-shadow bg-win-bg px-3 py-2 text-win-ink font-bold print:border print:border-black"
                          >
                            {o.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-win-surface bg-win-highlight">
                      {report.truthTable.rows.map((r, idx) => (
                        <tr key={idx}>
                          {report.truthTable!.inputLabels.map((i) => (
                            <td
                              key={i.nodeId}
                              className="px-3 py-1.5 font-mono text-win-ink print:border print:border-black"
                            >
                              {r.inputs[i.label]}
                            </td>
                          ))}
                          {report.truthTable!.outputLabels.map((o) => (
                            <td
                              key={o.nodeId}
                              className="border-l border-win-surface bg-win-canvas px-3 py-1.5 font-mono font-bold print:border print:border-black"
                            >
                              <LogicBadge state={r.outputs[o.label]} compact />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {runs.length > 0 && (
            <section className="win95-window overflow-hidden">
              <div className="win95-titlebar px-3 py-1.5 text-xs font-bold">
                4. ЖУРНАЛ ЗАПУСКІВ СИМУЛЯЦІЇ
              </div>
              <div className="p-3 text-xs text-win-ink space-y-1 font-mono">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    className="win95-statusbar-cell flex flex-wrap justify-between gap-2 px-2.5 py-1.5"
                  >
                    <span>Статус: {run.status}</span>
                    <span>Тривалість: {run.durationSimNs} нс</span>
                    <span>Подій: {run.processedEvents}</span>
                    <span>{new Date(run.createdAt).toLocaleString('uk-UA')}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <footer
            data-testid="print-sheet-footer"
            className="hidden print:flex items-center justify-between border-t-2 border-black pt-1.5 text-[9px] font-mono text-black"
          >
            <span>
              Виконавець: {authorDisplayName}
              {user?.email ? ` (${user.email})` : ''}
            </span>
            <span>Сформовано: {new Date(report.generatedAt).toLocaleString('uk-UA')}</span>
            <span>Підпис: ________________</span>
          </footer>
        </div>
      </div>

      <Modal
        open={Boolean(authGateFeature)}
        onClose={() => setAuthGateFeature(null)}
        title="Потрібна авторизація"
        subtitle="Ця можливість доступна лише зареєстрованим користувачам."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-3 text-xs text-win-ink" data-testid="reports-auth-gate-dialog">
          <p className="leading-relaxed">
            Для дії <strong>«{authGateFeature}»</strong> увійдіть у наявний обліковий запис або
            зареєструйте новий акаунт інженера.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link to="/login" className={getButtonClassName('primary', 'sm')}>
              Увійти в акаунт →
            </Link>
            <Link to="/register" className={getButtonClassName('secondary', 'sm')}>
              Реєстрація →
            </Link>
          </div>
        </div>
      </Modal>
    </div>
  );
};
