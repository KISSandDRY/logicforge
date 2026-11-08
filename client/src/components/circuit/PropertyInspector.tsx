import React from 'react';
import { Trash2, Sliders } from 'lucide-react';
import {
  computeTimer555Intervals,
  getCatalogItem,
  type CircuitNodeData,
  type LogicState,
  type NodeProperties,
} from '@logicforge/shared-types';
import { Button } from '../ui/Button';
import { Pin } from './Pin';

export interface PropertyInspectorProps {
  node: CircuitNodeData | null;
  pinStates?: Record<string, LogicState>;
  readOnly?: boolean;
  onChangeProperties?: (nodeId: string, patch: Partial<NodeProperties>) => void;
  onDeleteNode?: (nodeId: string) => void;
  onTogglePinTestState?: (pinId: string) => void;
}

/**
 * Універсальний адаптивний інспектор властивостей елемента (PropertyInspector),
 * перевикористовується у 3 розділах додатку:
 * 1) Права бічна панель CAD-редактора (EditorPage)
 * 2) Інтерактивний випробувальний стенд компонентів (ComponentLibraryPage)
 * 3) Інспектор параметрів обраного вузла в Історії ревізій (RevisionHistoryPage)
 */
export const PropertyInspector: React.FC<PropertyInspectorProps> = ({
  node,
  pinStates,
  readOnly = false,
  onChangeProperties,
  onDeleteNode,
  onTogglePinTestState,
}) => {
  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center">
        <Sliders className="h-7 w-7 text-slate-600 mb-2" />
        <p className="text-xs font-medium text-slate-300">Елемент не обрано</p>
        <p className="mt-1 text-[11px] text-slate-500">
          Натисніть на будь-який логічний вентиль, тригер або ІМС на полотні для інспекції пінів та
          налаштування затримки поширення.
        </p>
      </div>
    );
  }

  const meta = getCatalogItem(node.type);
  const rcInfo =
    node.type === 'TIMER_555'
      ? computeTimer555Intervals(
          node.properties.resistanceR1Ohms,
          node.properties.resistanceR2Ohms,
          node.properties.capacitanceUf,
        )
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
              {node.type}
            </span>
            <h4 className="mt-1 text-sm font-semibold text-white">{meta.name}</h4>
          </div>
          {!readOnly && onDeleteNode && (
            <Button
              variant="danger"
              size="xs"
              onClick={() => onDeleteNode(node.id)}
              title="Видалити вузол зі схеми"
              icon={<Trash2 className="h-3.5 w-3.5" />}
            />
          )}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{meta.description}</p>
      </div>

      {/* Редаговані параметри вузла */}
      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Параметри елемента
        </div>

        <div>
          <label className="block text-[11px] text-slate-400 mb-1">
            Позначення на схемі (Label)
          </label>
          <input
            type="text"
            disabled={readOnly}
            value={node.properties.label}
            onChange={(e) => onChangeProperties?.(node.id, { label: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-[11px] text-slate-400 mb-1">
            Затримка поширення сигналу t_pd (нс)
          </label>
          <input
            type="number"
            min={0}
            max={1000}
            disabled={readOnly}
            value={node.properties.propagationDelayNs}
            onChange={(e) =>
              onChangeProperties?.(node.id, {
                propagationDelayNs: Math.max(0, Number(e.target.value) || 0),
              })
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none disabled:opacity-60"
          />
        </div>

        {(node.type === 'INPUT_SWITCH' || node.type === 'PUSH_BUTTON') && (
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Вихідний стан перемикача (0 / 1 / High-Z)
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['0', '1', 'Z'] as LogicState[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onChangeProperties?.(node.id, { switchState: st })}
                  className={`rounded-lg border py-1.5 font-mono text-xs font-bold transition-colors ${
                    (node.properties.switchState ?? '0') === st
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {st === 'Z' ? 'Hi-Z' : st}
                </button>
              ))}
            </div>
          </div>
        )}

        {node.type === 'CLOCK' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Частота (Гц)</label>
              <input
                type="number"
                min={1}
                max={20}
                disabled={readOnly}
                value={node.properties.frequencyHz ?? 2}
                onChange={(e) =>
                  onChangeProperties?.(node.id, {
                    frequencyHz: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Напівперіод (нс)</label>
              <input
                type="number"
                min={10}
                max={500}
                disabled={readOnly}
                value={node.properties.halfPeriodNs ?? 50}
                onChange={(e) =>
                  onChangeProperties?.(node.id, {
                    halfPeriodNs: Math.max(10, Number(e.target.value) || 50),
                  })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white"
              />
            </div>
          </div>
        )}

        {node.type === 'TIMER_555' && rcInfo && (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
            <div className="text-[11px] font-semibold text-amber-300">
              RC-параметри таймера NE555
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <span className="block text-[10px] text-slate-400">R1 (Ом)</span>
                <input
                  type="number"
                  min={100}
                  step={100}
                  disabled={readOnly}
                  value={node.properties.resistanceR1Ohms ?? 1000}
                  onChange={(e) =>
                    onChangeProperties?.(node.id, {
                      resistanceR1Ohms: Math.max(100, Number(e.target.value) || 1000),
                    })
                  }
                  className="w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-white"
                />
              </div>
              <div>
                <span className="block text-[10px] text-slate-400">R2 (Ом)</span>
                <input
                  type="number"
                  min={100}
                  step={100}
                  disabled={readOnly}
                  value={node.properties.resistanceR2Ohms ?? 2000}
                  onChange={(e) =>
                    onChangeProperties?.(node.id, {
                      resistanceR2Ohms: Math.max(100, Number(e.target.value) || 2000),
                    })
                  }
                  className="w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-white"
                />
              </div>
              <div>
                <span className="block text-[10px] text-slate-400">C (мкФ)</span>
                <input
                  type="number"
                  min={0.005}
                  step={0.005}
                  disabled={readOnly}
                  value={node.properties.capacitanceUf ?? 0.02}
                  onChange={(e) =>
                    onChangeProperties?.(node.id, {
                      capacitanceUf: Math.max(0.005, Number(e.target.value) || 0.02),
                    })
                  }
                  className="w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-white"
                />
              </div>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-300 pt-1 border-t border-slate-800">
              <span>t_H={rcInfo.highNs}ns</span>
              <span>t_L={rcInfo.lowNs}ns</span>
              <span>D={rcInfo.dutyCyclePercent}%</span>
            </div>
          </div>
        )}

        {node.type === 'LED' && (
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Колір світіння LED</label>
            <select
              disabled={readOnly}
              value={node.properties.ledColor ?? 'emerald'}
              onChange={(e) =>
                onChangeProperties?.(node.id, {
                  ledColor: e.target.value as NodeProperties['ledColor'],
                })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
            >
              <option value="emerald">Смарагдово-зелений</option>
              <option value="red">Червоний</option>
              <option value="amber">Бурштиновий</option>
              <option value="cyan">Блакитний</option>
              <option value="violet">Фіолетовий</option>
            </select>
          </div>
        )}
      </div>

      {/* Стан усіх контактних пінів у реальному часі */}
      <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Діагностика виводів ({node.pins.length})
        </div>
        <div className="space-y-1.5">
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
};
