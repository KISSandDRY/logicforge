import React, { useId } from 'react';
import { Trash2, Clock, Table2, Activity } from 'lucide-react';
import {
  computeTimer555Intervals,
  getCatalogItem,
  type CircuitNodeData,
  type LogicState,
  type NodeProperties,
  type StaticTimingReport,
} from '@logicforge/shared-types';
import { Button } from '../ui/Button';
import { MathFormula, MathVar } from '../ui/MathFormula';
import { Win95Dropdown } from '../ui/Win95Dropdown';
import { Win95NumberInput } from '../ui/Win95NumberInput';
import { getComponentTruthTable } from '../../utils/componentTruthTables';
import { Pin } from './Pin';

export interface PropertyInspectorProps {
  node: CircuitNodeData | null;
  pinStates?: Record<string, LogicState>;
  timingReport?: StaticTimingReport;
  nodeCount?: number;
  edgeCount?: number;
  selectedEdgeId?: string | null;
  readOnly?: boolean;
  onChangeProperties?: (nodeId: string, patch: Partial<NodeProperties>) => void;
  onDeleteNode?: (nodeId: string) => void;
  onDeleteSelectedEdge?: () => void;
  onOpenTruthTable?: () => void;
  onTogglePinTestState?: (pinId: string) => void;
}

export const PropertyInspector: React.FC<PropertyInspectorProps> = React.memo(
  ({
    node,
    pinStates,
    timingReport,
    nodeCount,
    edgeCount,
    selectedEdgeId,
    readOnly = false,
    onChangeProperties,
    onDeleteNode,
    onDeleteSelectedEdge,
    onOpenTruthTable,
    onTogglePinTestState,
  }) => {
    const formId = useId();

    if (!node) {
      return (
        <div className="space-y-2.5 text-win-ink" data-testid="inspector-circuit-overview">
          <div className="win95-outset p-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-win-ink">
              <Clock className="h-3.5 w-3.5 text-win-navy" aria-hidden="true" />
              <span>Таймінги та аналіз схеми</span>
            </div>

            {timingReport ? (
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                <div className="win95-statusbar-cell px-2 py-1">
                  <div className="text-[10px] text-win-muted">
                    Крит. шлях <MathVar sym="T" sub="crit" />
                  </div>
                  <strong className="text-win-ink">{timingReport.criticalPathDelayNs} нс</strong>
                </div>
                <div className="win95-statusbar-cell px-2 py-1">
                  <div className="text-[10px] text-win-muted">
                    Частота <MathVar sym="f" sub="max" />
                  </div>
                  <strong className="text-win-navy">{timingReport.maxClockFrequencyMhz} МГц</strong>
                </div>
                <div className="win95-statusbar-cell px-2 py-1">
                  <div className="text-[10px] text-win-muted">Елементів / Ліній</div>
                  <strong className="text-win-ink">
                    {nodeCount ?? '—'} / {edgeCount ?? '—'}
                  </strong>
                </div>
                <div className="win95-statusbar-cell px-2 py-1">
                  <div className="text-[10px] text-win-muted">Зворотні зв’язки</div>
                  <strong
                    className={
                      !timingReport.isCombinationalAcyclic ? 'text-logic-x' : 'text-win-teal'
                    }
                  >
                    {!timingReport.isCombinationalAcyclic
                      ? `${timingReport.stronglyConnectedCycles.length || 1} контур(и)`
                      : 'Ациклічна (DAG)'}
                  </strong>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-win-muted">
                Натисніть на компонент на полотні, щоб змінити його параметри або оглянути виводи.
              </p>
            )}

            {selectedEdgeId && onDeleteSelectedEdge && !readOnly && (
              <div className="win95-inset bg-win-surface px-2.5 py-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-win-ink">Обрано з’єднання</span>
                <Button
                  variant="danger"
                  size="xs"
                  onClick={onDeleteSelectedEdge}
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                >
                  Видалити лінію
                </Button>
              </div>
            )}

            {onOpenTruthTable && (
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={onOpenTruthTable}
                icon={<Table2 className="h-3.5 w-3.5" />}
              >
                Аналіз ДДНФ
              </Button>
            )}
          </div>

          <div className="win95-inset bg-win-surface p-2.5 text-[11px] text-win-muted space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-win-ink">
              <Activity className="h-3.5 w-3.5 text-win-navy" aria-hidden="true" />
              <span>Контекстна підказка</span>
            </div>
            <p className="leading-relaxed">
              Клікніть по логічному елементу або мікросхемі на полотні, щоб відкрити налаштування
              позначення, затримки <MathVar sym="t" sub="pd" />, параметрів генератора та таблицю
              істинності елемента.
            </p>
          </div>
        </div>
      );
    }

    const meta = getCatalogItem(node.type);
    const truthSpec = getComponentTruthTable(node.type);
    const rcInfo =
      node.type === 'TIMER_555'
        ? computeTimer555Intervals(
            node.properties.resistanceR1Ohms,
            node.properties.resistanceR2Ohms,
            node.properties.capacitanceUf,
          )
        : null;

    return (
      <div className="space-y-2.5 text-win-ink">
        <div className="win95-outset p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="win95-statusbar-cell inline-block px-1.5 py-0.5 font-mono text-[10px] font-bold text-win-navy">
                {node.type}
              </span>
              <h2 className="mt-1 text-xs font-bold text-win-ink">{meta.name}</h2>
            </div>
            {!readOnly && onDeleteNode && (
              <Button
                variant="danger"
                size="xs"
                onClick={() => onDeleteNode(node.id)}
                aria-label="Видалити вузол зі схеми"
                title="Видалити вузол зі схеми"
                icon={<Trash2 className="h-3.5 w-3.5" />}
              />
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-win-muted">{meta.description}</p>
          <div className="win95-inset mt-2 bg-win-highlight px-2.5 py-1.5 text-[11px] text-win-ink">
            <span className="font-bold text-win-navy mr-1">Модель:</span>
            <MathFormula type={node.type} latex={meta.formulaLatex} compact />
          </div>
        </div>

        {/* Редаговані параметри вузла */}
        <div className="win95-outset space-y-2.5 p-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-win-ink">
            Параметри елемента
          </div>

          <div>
            <label htmlFor={`${formId}-label`} className="block text-[11px] font-bold text-win-ink">
              <span className="mb-1 block">Позначення на схемі (Label)</span>
            </label>
            <input
              id={`${formId}-label`}
              type="text"
              disabled={readOnly}
              value={node.properties.label}
              onChange={(e) => onChangeProperties?.(node.id, { label: e.target.value })}
              className="win95-field w-full px-2.5 py-1.5 text-xs font-medium text-win-ink disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor={`${formId}-delay`} className="block text-[11px] font-bold text-win-ink">
              <span className="mb-1 inline-flex items-center gap-1">
                <span>Затримка поширення сигналу</span>
                <MathVar sym="t" sub="pd" />
                <span>(нс)</span>
              </span>
            </label>
            <Win95NumberInput
              id={`${formId}-delay`}
              min={0}
              max={1000}
              step={1}
              disabled={readOnly}
              value={node.properties.propagationDelayNs}
              onChange={(val) =>
                onChangeProperties?.(node.id, {
                  propagationDelayNs: Math.max(0, Math.round(val)),
                })
              }
            />
          </div>

          {(node.type === 'INPUT_SWITCH' || node.type === 'PUSH_BUTTON') && (
            <div>
              <div className="mb-1 block text-[11px] font-bold text-win-ink">
                Вихідний стан перемикача (0 / 1 / High-Z)
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['0', '1', 'Z'] as LogicState[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    disabled={readOnly}
                    onClick={() => onChangeProperties?.(node.id, { switchState: st })}
                    className={`min-h-7 py-1 font-mono text-xs font-bold ${
                      (node.properties.switchState ?? '0') === st
                        ? 'win95-button-pressed bg-win-navy text-win-highlight'
                        : 'win95-button text-win-ink'
                    }`}
                  >
                    {st === 'Z' ? 'Hi-Z' : st}
                  </button>
                ))}
              </div>
            </div>
          )}

          {node.type === 'DIP_SWITCH_4' && (
            <div>
              <div className="mb-1 block text-[11px] font-bold text-win-ink">
                Секції DIP-перемикача (Q0..Q3)
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 1, 2, 3].map((bitIdx) => {
                  const cur = node.properties.dipSwitchStates?.[bitIdx] ?? '0';
                  return (
                    <button
                      key={bitIdx}
                      type="button"
                      disabled={readOnly}
                      onClick={() => {
                        const nextTuple: [LogicState, LogicState, LogicState, LogicState] = [
                          ...(node.properties.dipSwitchStates ?? ['0', '0', '0', '0']),
                        ] as [LogicState, LogicState, LogicState, LogicState];
                        nextTuple[bitIdx] = cur === '1' ? '0' : '1';
                        onChangeProperties?.(node.id, { dipSwitchStates: nextTuple });
                      }}
                      className={`min-h-7 py-1 font-mono text-xs font-bold ${
                        cur === '1'
                          ? 'win95-button-pressed bg-win-highlight text-logic-high border border-logic-high-border'
                          : 'win95-button text-win-ink'
                      }`}
                    >
                      Q{bitIdx}:{cur}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {node.type === 'CLOCK' && (
            <div className="win95-statusbar-cell space-y-2 p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor={`${formId}-freq`}
                    className="block text-[11px] font-bold text-win-ink"
                  >
                    <span className="mb-1 block">Частота (МГц)</span>
                  </label>
                  <Win95NumberInput
                    id={`${formId}-freq`}
                    min={1}
                    max={50}
                    step={0.5}
                    disabled={readOnly}
                    value={Number(
                      (500 / Math.max(10, node.properties.halfPeriodNs ?? 50)).toFixed(1),
                    )}
                    onChange={(nextFreqMhz) => {
                      const clampedFreq = Math.min(50, Math.max(1, nextFreqMhz || 10));
                      const nextHalf = Math.min(500, Math.max(10, Math.round(500 / clampedFreq)));
                      onChangeProperties?.(node.id, {
                        halfPeriodNs: nextHalf,
                        frequencyHz: clampedFreq,
                      });
                    }}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${formId}-half`}
                    className="block text-[11px] font-bold text-win-ink"
                  >
                    <span className="mb-1 block">Напівперіод (нс)</span>
                  </label>
                  <Win95NumberInput
                    id={`${formId}-half`}
                    min={10}
                    max={500}
                    step={5}
                    disabled={readOnly}
                    value={node.properties.halfPeriodNs ?? 50}
                    onChange={(nextHalf) => {
                      const clampedHalf = Math.min(500, Math.max(10, Math.round(nextHalf || 50)));
                      onChangeProperties?.(node.id, {
                        halfPeriodNs: clampedHalf,
                        frequencyHz: Number((500 / clampedHalf).toFixed(1)),
                      });
                    }}
                  />
                </div>
              </div>
              <div className="flex justify-between border-t border-win-shadow pt-1 font-mono text-[11px] font-bold text-win-navy">
                <span>T = {2 * (node.properties.halfPeriodNs ?? 50)} нс</span>
                <span>
                  f = {(500 / Math.max(10, node.properties.halfPeriodNs ?? 50)).toFixed(1)} МГц
                </span>
              </div>
            </div>
          )}

          {node.type === 'TIMER_555' && rcInfo && (
            <div className="win95-statusbar-cell space-y-2 p-2.5">
              <div className="text-[11px] font-bold text-win-ink">RC-параметри таймера NE555</div>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label
                    htmlFor={`${formId}-r1`}
                    className="block text-[10px] font-bold text-win-ink"
                  >
                    <span className="mb-1 block">R1 (Ом)</span>
                  </label>
                  <Win95NumberInput
                    id={`${formId}-r1`}
                    min={100}
                    max={100000}
                    step={100}
                    disabled={readOnly}
                    value={node.properties.resistanceR1Ohms ?? 1000}
                    onChange={(val) =>
                      onChangeProperties?.(node.id, {
                        resistanceR1Ohms: Math.max(100, Math.round(val) || 1000),
                      })
                    }
                    inputClassName="px-1.5 py-1"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${formId}-r2`}
                    className="block text-[10px] font-bold text-win-ink"
                  >
                    <span className="mb-1 block">R2 (Ом)</span>
                  </label>
                  <Win95NumberInput
                    id={`${formId}-r2`}
                    min={100}
                    max={100000}
                    step={100}
                    disabled={readOnly}
                    value={node.properties.resistanceR2Ohms ?? 2000}
                    onChange={(val) =>
                      onChangeProperties?.(node.id, {
                        resistanceR2Ohms: Math.max(100, Math.round(val) || 2000),
                      })
                    }
                    inputClassName="px-1.5 py-1"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${formId}-cap`}
                    className="block text-[10px] font-bold text-win-ink"
                  >
                    <span className="mb-1 block">C (мкФ)</span>
                  </label>
                  <Win95NumberInput
                    id={`${formId}-cap`}
                    min={0.005}
                    max={10}
                    step={0.005}
                    disabled={readOnly}
                    value={node.properties.capacitanceUf ?? 0.02}
                    onChange={(val) =>
                      onChangeProperties?.(node.id, {
                        capacitanceUf: Math.max(0.005, Number(val.toFixed(4)) || 0.02),
                      })
                    }
                    inputClassName="px-1.5 py-1"
                  />
                </div>
              </div>
              <div className="flex justify-between border-t border-win-shadow pt-1 font-mono text-[11px] font-bold text-logic-z">
                <span className="inline-flex items-baseline gap-0.5">
                  <MathVar sym="t" sub="H" />={rcInfo.highNs}ns
                </span>
                <span className="inline-flex items-baseline gap-0.5">
                  <MathVar sym="t" sub="L" />={rcInfo.lowNs}ns
                </span>
                <span>D={rcInfo.dutyCyclePercent}%</span>
              </div>
            </div>
          )}

          {node.type === 'LED' && (
            <div>
              <label
                htmlFor={`${formId}-led-color`}
                className="block text-[11px] font-bold text-win-ink"
              >
                <span className="mb-1 block">Колір індикатора LED</span>
              </label>
              <Win95Dropdown
                id={`${formId}-led-color`}
                testId="inspector-led-color-select"
                ariaLabel="Колір індикатора LED"
                disabled={readOnly}
                value={node.properties.ledColor ?? 'emerald'}
                onChange={(nextVal) =>
                  onChangeProperties?.(node.id, {
                    ledColor: nextVal as NodeProperties['ledColor'],
                  })
                }
                options={[
                  { value: 'emerald', label: 'Зелений' },
                  { value: 'red', label: 'Червоний' },
                  { value: 'amber', label: 'Бурштиновий' },
                  { value: 'cyan', label: 'Синій' },
                  { value: 'violet', label: 'Фіолетовий' },
                ]}
                className="w-full"
              />
            </div>
          )}
        </div>

        {/* Таблиця істинності обраного елемента (згорнута за замовчуванням) */}
        <details className="win95-outset p-2.5 group">
          <summary className="cursor-pointer select-none text-[11px] font-bold uppercase tracking-wide text-win-ink flex items-center justify-between gap-2 focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black">
            <span>Таблиця істинності елемента ({truthSpec.rows.length})</span>
            <span className="font-mono text-[10px] text-win-muted group-open:hidden">
              ▼ Показати
            </span>
            <span className="font-mono text-[10px] text-win-muted hidden group-open:inline">
              ▲ Сховати
            </span>
          </summary>
          <div className="win95-inset mt-2 max-h-60 overflow-auto bg-win-highlight">
            <table className="w-full text-center font-mono text-[10.5px]">
              <thead className="sticky top-0 z-10 bg-win-surface text-win-ink border-b border-win-shadow">
                <tr>
                  {truthSpec.inputHeaders.map((h) => (
                    <th key={h} className="px-1.5 py-1 font-bold">
                      {h}
                    </th>
                  ))}
                  {truthSpec.outputHeaders.map((h) => (
                    <th
                      key={h}
                      className="border-l border-win-shadow bg-win-bg px-1.5 py-1 font-bold text-win-ink"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-win-surface text-win-ink">
                {truthSpec.rows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.inputs.map((val, cIdx) => (
                      <td key={cIdx} className="px-1.5 py-1">
                        {val}
                      </td>
                    ))}
                    {row.outputs.map((val, cIdx) => (
                      <td
                        key={cIdx}
                        className="border-l border-win-surface bg-win-highlight px-1.5 py-1 font-bold text-win-navy"
                      >
                        {val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {/* Стан усіх контактних пінів вузла на активній схемі */}
        <div className="win95-outset space-y-2 p-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-win-ink">
            Поточні сигнали виводів на схемі ({node.pins.length})
          </div>
          <div className="space-y-1">
            {node.pins.map((pin) => (
              <Pin
                key={pin.id}
                pin={pin}
                state={pinStates?.[pin.id] ?? pin.state}
                mode="inspector"
                onToggleInputState={
                  onTogglePinTestState ? () => onTogglePinTestState(pin.id) : undefined
                }
              />
            ))}
          </div>
        </div>
      </div>
    );
  },
);
