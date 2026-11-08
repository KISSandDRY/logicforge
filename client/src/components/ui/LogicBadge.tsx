import React from 'react';
import type { LogicState } from '@logicforge/shared-types';

interface LogicBadgeProps {
  state: LogicState;
  compact?: boolean;
}

const configMap: Record<LogicState, { label: string; short: string; style: string }> = {
  '0': {
    label: '0 (LOW)',
    short: '0',
    style: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  },
  '1': {
    label: '1 (HIGH)',
    short: '1',
    style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
  },
  Z: {
    label: 'Z (High-Z)',
    short: 'Z',
    style: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  },
  X: {
    label: 'X (Конфлікт)',
    short: 'X',
    style: 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse',
  },
};

/**
 * Універсальний індикатор стану сигналу тристабільної логіки (0, 1, High-Z, Conflict X).
 */
export const LogicBadge: React.FC<LogicBadgeProps> = ({ state, compact = false }) => {
  const meta = configMap[state] ?? configMap.Z;
  return (
    <span
      className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-bold ${meta.style}`}
    >
      {compact ? meta.short : meta.label}
    </span>
  );
};
