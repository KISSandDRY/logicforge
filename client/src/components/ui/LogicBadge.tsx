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
    style: 'bg-win-surface text-logic-low border-win-shadow',
  },
  '1': {
    label: '1 (HIGH)',
    short: '1',
    style: 'bg-win-highlight text-logic-high border-logic-high-border',
  },
  Z: {
    label: 'Z (High-Z)',
    short: 'Z',
    style: 'bg-win-highlight text-logic-z border-logic-z',
  },
  X: {
    label: 'X (Конфлікт)',
    short: 'X',
    style: 'bg-logic-x-bg text-logic-x border-logic-x',
  },
};

/**
 * Універсальний індикатор стану сигналу чотиризначної логіки IEEE 1164 (0, 1, High-Z, Conflict X)
 * у вдавленій рамці Windows 95.
 */
export const LogicBadge: React.FC<LogicBadgeProps> = ({ state, compact = false }) => {
  const meta = configMap[state] ?? configMap.Z;
  return (
    <span
      className={`inline-flex items-center justify-center border px-1.5 py-0.5 font-mono text-[11px] font-bold ${meta.style}`}
    >
      {compact ? meta.short : meta.label}
    </span>
  );
};
