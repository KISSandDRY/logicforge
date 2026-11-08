import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, Printer } from 'lucide-react';
import {
  PRESET_CIRCUITS,
  generateEngineeringReport,
  type EngineeringReport,
} from '@logicforge/shared-types';
import { Button } from '../components/ui/Button';
import { LogicBadge } from '../components/ui/LogicBadge';
import { api } from '../services/api';

export const ReportsPage: React.FC = () => {
  const { id = 'preset-full-adder' } = useParams<{ id: string }>();
  const [report, setReport] = useState<EngineeringReport | null>(null);
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
    api
      .getCircuitReport(id)
      .then((res) => {
        setReport(res.report);
        setRuns(res.runs);
      })
      .catch(() => {
        const preset = PRESET_CIRCUITS.find((p) => p.id === id) ?? PRESET_CIRCUITS[0];
        setReport(generateEngineeringReport(preset.document));
      });
  }, [id]);

  if (!report) {
    return (
      <div className="py-16 text-center text-sm text-slate-400">
        Формування інженерної специфікації та часового звіту...
      </div>
    );
  }

  const exportCsvBom = () => {
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
    a.download = `bom_${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={`/editor/${id}`}>
            <Button variant="secondary" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>
              До редактора
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
              Звітна інженерна документація проєкту
            </h1>
            <p className="text-xs text-slate-400">
              Автоматично сформована відомість елементів (BOM), таблиця з’єднань (Netlist) та
              протокол верифікації
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsvBom}
            icon={<Download className="h-4 w-4" />}
          >
            Експорт BOM (.csv)
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => window.print()}
            icon={<Printer className="h-4 w-4" />}
          >
            Друкована форма / PDF
          </Button>
        </div>
      </div>

      {/* Паспорт схеми та зведення Static Timing Analysis */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-4 print:border-slate-300 print:bg-white print:text-black">
        <div className="border-b border-slate-800 pb-4 flex flex-wrap justify-between gap-4 print:border-slate-300">
          <div>
            <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold print:text-slate-600">
              Специфікація цифрової логічної схеми • LogicForge Studio
            </div>
            <h2 className="text-xl font-bold text-white mt-1 print:text-black">
              {report.circuitTitle}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 print:text-slate-600">
              Категорія: {report.category} • Сформовано:{' '}
              {new Date(report.generatedAt).toLocaleString('uk-UA')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 print:bg-slate-50 print:border-slate-300">
            <div className="text-slate-400 print:text-slate-600">Елементів / Ліній / Вузлів</div>
            <div className="mt-1 font-mono text-base font-bold text-white print:text-black">
              {report.totalNodes} / {report.totalEdges} / {report.totalNets}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 print:bg-slate-50 print:border-slate-300">
            <div className="text-slate-400 print:text-slate-600">Критичний шлях (T_crit)</div>
            <div className="mt-1 font-mono text-base font-bold text-emerald-400 print:text-black">
              {report.timing.criticalPathDelayNs} нс
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 print:bg-slate-50 print:border-slate-300">
            <div className="text-slate-400 print:text-slate-600">Гранична частота f_max</div>
            <div className="mt-1 font-mono text-base font-bold text-sky-400 print:text-black">
              {report.timing.maxClockFrequencyMhz} МГц
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 print:bg-slate-50 print:border-slate-300">
            <div className="text-slate-400 print:text-slate-600">Контури ЗЗ (Tarjan SCC)</div>
            <div className="mt-1 font-mono text-base font-bold text-amber-300 print:text-black">
              {report.timing.stronglyConnectedCycles.length}
            </div>
          </div>
        </div>
      </section>

      {/* Звітна форма №1: Відомість елементів (BOM) */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-3 print:border-slate-300 print:bg-white">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white print:text-black">
          1. Відомість комплектуючих логічних елементів (Bill of Materials — BOM)
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-slate-300">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-300 print:bg-slate-100 print:text-black">
              <tr>
                <th className="px-3 py-2">Код типу</th>
                <th className="px-3 py-2">Найменування елемента</th>
                <th className="px-3 py-2">К-сть</th>
                <th className="px-3 py-2">Позиційні позначення</th>
                <th className="px-3 py-2">Затримка t_pd</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 print:divide-slate-300">
              {report.bom.map((item) => (
                <tr key={item.type}>
                  <td className="px-3 py-2 font-mono text-emerald-300 print:text-black">
                    {item.type}
                  </td>
                  <td className="px-3 py-2 text-slate-200 print:text-black">{item.name}</td>
                  <td className="px-3 py-2 font-mono font-bold text-white print:text-black">
                    {item.quantity}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-300 print:text-black">
                    {item.designators.join(', ')}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-400 print:text-black">
                    {item.unitDelayNs} нс
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Звітна форма №2: Таблиця електричних з'єднань (Netlist) */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-3 print:border-slate-300 print:bg-white">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white print:text-black">
          2. Таблиця еквівалентних електричних вузлів (Netlist)
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-slate-300">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-300 print:bg-slate-100 print:text-black">
              <tr>
                <th className="px-3 py-2">Вузол (Net ID)</th>
                <th className="px-3 py-2">Вихідні драйвери</th>
                <th className="px-3 py-2">Вхідні навантаження</th>
                <th className="px-3 py-2">Усталений стан</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 print:divide-slate-300">
              {report.netlist.map((net) => (
                <tr key={net.netId}>
                  <td className="px-3 py-2 font-mono font-semibold text-sky-300 print:text-black">
                    {net.netId}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-200 print:text-black">
                    {net.drivers.join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-300 print:text-black">
                    {net.loads.join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <LogicBadge state={net.currentState} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Звітна форма №3: Таблиця істинності та булеві рівняння */}
      {report.truthTable && report.truthTable.rows.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-3 print:border-slate-300 print:bg-white">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white print:text-black">
            3. Верифікаційна таблиця істинності та синтезовані вирази ДДНФ
          </h3>
          <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 print:bg-slate-50 print:text-black print:border-slate-300">
            {Object.entries(report.truthTable.canonicalSopExpressions).map(([k, v]) => (
              <div key={k}>
                <strong>{k}</strong> = {v}
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-slate-300">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-300 font-mono print:bg-slate-100 print:text-black">
                <tr>
                  {report.truthTable.inputLabels.map((i) => (
                    <th key={i.nodeId} className="px-3 py-2">
                      {i.label}
                    </th>
                  ))}
                  {report.truthTable.outputLabels.map((o) => (
                    <th key={o.nodeId} className="px-3 py-2 text-emerald-300 print:text-black">
                      {o.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-slate-300">
                {report.truthTable.rows.map((r, idx) => (
                  <tr key={idx}>
                    {report.truthTable!.inputLabels.map((i) => (
                      <td key={i.nodeId} className="px-3 py-1.5 font-mono">
                        {r.inputs[i.label]}
                      </td>
                    ))}
                    {report.truthTable!.outputLabels.map((o) => (
                      <td key={o.nodeId} className="px-3 py-1.5 font-mono font-bold">
                        <LogicBadge state={r.outputs[o.label]} compact />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {runs.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-3 print:border-slate-300 print:bg-white">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white print:text-black">
            4. Журнал серверних запусків симуляції (simulation_runs)
          </h3>
          <div className="text-xs text-slate-300 space-y-1 font-mono print:text-black">
            {runs.map((run) => (
              <div key={run.id} className="flex justify-between border-b border-slate-800 py-1.5">
                <span>Статус: {run.status}</span>
                <span>Тривалість: {run.durationSimNs} нс</span>
                <span>Подій: {run.processedEvents}</span>
                <span>{new Date(run.createdAt).toLocaleString('uk-UA')}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
