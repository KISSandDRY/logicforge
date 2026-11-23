import React from 'react';
import type { LogicState, PinDefinition } from '@logicforge/shared-types';
import { LogicBadge } from '../ui/LogicBadge';

export const PIN_STATE_COLORS: Record<LogicState, { fill: string; stroke: string }> = {
  '0': { fill: 'var(--logic-0-bg)', stroke: 'var(--logic-0)' },
  '1': { fill: 'var(--logic-1-bg)', stroke: 'var(--logic-1)' },
  Z: { fill: 'var(--logic-z-bg)', stroke: 'var(--logic-z)' },
  X: { fill: 'var(--logic-x-bg)', stroke: 'var(--logic-x)' },
};

export interface PinProps {
  pin: PinDefinition;
  state?: LogicState;
  mode?: 'svg' | 'inspector' | 'card';
  labelPlacement?: 'inside-box' | 'above-lead';
  highlighted?: boolean;
  interactive?: boolean;
  onPinClick?: (pin: PinDefinition, e: React.PointerEvent) => void;
  onToggleInputState?: (pin: PinDefinition) => void;
}

export const Pin: React.FC<PinProps> = ({
  pin,
  state,
  mode = 'svg',
  labelPlacement = 'inside-box',
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
        className={`win95-statusbar-cell flex items-center justify-between px-2.5 py-1 text-xs ${
          highlighted ? 'bg-win-surface ring-1 ring-win-navy' : 'bg-win-surface'
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 border"
            style={{ backgroundColor: palette.fill, borderColor: palette.stroke }}
          />
          <span className="font-mono font-bold text-win-ink">{pin.name}</span>
          <span className="text-[10px] uppercase text-win-muted">
            {pin.direction === 'INPUT' ? 'Вхід' : 'Вихід'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {onToggleInputState && pin.direction === 'INPUT' && (
            <button
              type="button"
              onClick={() => onToggleInputState(pin)}
              className="win95-button min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 px-2 py-0.5 text-[10px] font-bold touch-manipulation text-win-ink"
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
  const isAboveLead = labelPlacement === 'above-lead';
  const insideLeftOffset = pin.clockEdge ? 22 : 16;
  const labelX = isAboveLead ? (isLeft ? 12.5 : -13) : isLeft ? insideLeftOffset : -16;
  const labelY = isAboveLead ? -5 : 3.5;
  const textAnchor = isAboveLead ? 'middle' : isLeft ? 'start' : 'end';

  return (
    <g
      transform={`translate(${pin.offset.x}, ${pin.offset.y})`}
      className={interactive ? 'cursor-crosshair group touch-none' : ''}
      onPointerDown={(e) => {
        if (interactive && onPinClick) {
          e.stopPropagation();
          onPinClick(pin, e);
        }
      }}
    >
      <circle r={18} fill="transparent" />

      {/* Класична контактна пайка CAD (Terminal Solder Pad) */}
      <circle
        r={highlighted ? 5.2 : 4}
        fill={palette.fill}
        stroke={highlighted ? 'var(--win-titlebar-start)' : palette.stroke}
        strokeWidth={highlighted ? 2.1 : 1.6}
      />
      <circle r={1.5} fill={palette.stroke} className="pointer-events-none" />

      <text
        x={labelX}
        y={labelY}
        textAnchor={textAnchor}
        fill="var(--win-ink)"
        fontSize={isAboveLead ? 8.5 : 9.5}
        fontFamily="Courier New, Fixedsys, Consolas, monospace"
        fontWeight={700}
        className="select-none pointer-events-none"
      >
        {pin.name}
      </text>
    </g>
  );
};
