import React from 'react';
import type { LogicState, PinDefinition } from '@logicforge/shared-types';
import { LogicBadge } from '../ui/LogicBadge';

export const PIN_STATE_COLORS: Record<LogicState, { fill: string; stroke: string; glow: string }> =
  {
    '0': { fill: '#1e3a8a', stroke: '#60a5fa', glow: 'none' },
    '1': { fill: '#10b981', stroke: '#6ee7b7', glow: 'drop-shadow(0 0 5px rgba(16,185,129,0.8))' },
    Z: { fill: '#78350f', stroke: '#fbbf24', glow: 'none' },
    X: { fill: '#ef4444', stroke: '#fca5a5', glow: 'drop-shadow(0 0 6px rgba(239,68,68,0.9))' },
  };

export interface PinProps {
  pin: PinDefinition;
  state?: LogicState;
  mode?: 'svg' | 'inspector' | 'card';
  highlighted?: boolean;
  interactive?: boolean;
  onPinClick?: (pin: PinDefinition, e: React.MouseEvent) => void;
  onToggleInputState?: (pin: PinDefinition) => void;
}

/**
 * Універсальний компонент виводу (Pin), що перевикористовується у 4 місцях системи:
 * 1) На інтерактивному полотні всередині CircuitNode (mode="svg")
 * 2) У панелі діагностики PropertyInspector (mode="inspector")
 * 3) У картці розпіновки Бібліотеки компонентів (mode="card")
 * 4) У конструкторі кастомних ІМС підсхем
 */
export const Pin: React.FC<PinProps> = ({
  pin,
  state,
  mode = 'svg',
  highlighted = false,
  interactive = true,
  onPinClick,
  onToggleInputState,
}) => {
  const current = state ?? pin.state ?? 'Z';
  const palette = PIN_STATE_COLORS[current] ?? PIN_STATE_COLORS.Z;

  if (mode === 'inspector' || mode === 'card') {
    return (
      <div
        className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs ${
          highlighted
            ? 'border-emerald-500/60 bg-emerald-500/10'
            : 'border-slate-800 bg-slate-900/70'
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full border"
            style={{ backgroundColor: palette.fill, borderColor: palette.stroke }}
          />
          <span className="font-mono font-semibold text-slate-200">{pin.name}</span>
          <span className="text-[10px] uppercase text-slate-500">
            {pin.direction === 'INPUT' ? 'Вхід' : 'Вихід'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {onToggleInputState && pin.direction === 'INPUT' && (
            <button
              type="button"
              onClick={() => onToggleInputState(pin)}
              className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:border-emerald-500"
            >
              Змінити
            </button>
          )}
          <LogicBadge state={current} compact={mode === 'card'} />
        </div>
      </div>
    );
  }

  const isLeft = pin.offset.side === 'LEFT';
  const labelX = isLeft ? 12 : -12;
  const textAnchor = isLeft ? 'start' : 'end';

  return (
    <g
      transform={`translate(${pin.offset.x}, ${pin.offset.y})`}
      className={interactive ? 'cursor-crosshair group' : ''}
      onMouseDown={(e) => {
        if (interactive && onPinClick) {
          e.stopPropagation();
          onPinClick(pin, e);
        }
      }}
    >
      {/* Розширена зона кліку для зручного з'єднання провідників */}
      <circle r={11} fill="transparent" />

      {/* Позначка синхровходу (динамічний фронт >) */}
      {pin.clockEdge && isLeft && (
        <polyline points="0,-5 7,0 0,5" fill="none" stroke="#94a3b8" strokeWidth={1.5} />
      )}

      {/* Інверсний кружечок */}
      {pin.inverted && (
        <circle
          cx={isLeft ? -4 : 4}
          cy={0}
          r={3.2}
          fill="#0f172a"
          stroke="#cbd5e1"
          strokeWidth={1.4}
        />
      )}

      {/* Основний контактний термінал піна */}
      <circle
        r={highlighted ? 6.5 : 5}
        fill={palette.fill}
        stroke={highlighted ? '#34d399' : palette.stroke}
        strokeWidth={highlighted ? 2.4 : 1.8}
        style={{ filter: palette.glow }}
      />

      <text
        x={pin.clockEdge && isLeft ? 15 : labelX}
        y={3.5}
        textAnchor={textAnchor}
        fill="#cbd5e1"
        fontSize={10}
        fontFamily="JetBrains Mono, monospace"
        fontWeight={600}
        className="select-none pointer-events-none"
      >
        {pin.name}
      </text>
    </g>
  );
};
