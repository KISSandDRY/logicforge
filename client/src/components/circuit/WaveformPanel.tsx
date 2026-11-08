import React from 'react';
import { Activity } from 'lucide-react';
import type { LogicState, WaveformSample } from '@logicforge/shared-types';
import { LogicBadge } from '../ui/LogicBadge';

interface WaveformPanelProps {
  samples: WaveformSample[];
  currentTimeNs: number;
}

export const WaveformPanel: React.FC<WaveformPanelProps> = ({ samples, currentTimeNs }) => {
  const latest = samples[samples.length - 1];
  const channelNames = latest ? Object.keys(latest.signals).slice(0, 6) : [];

  if (channelNames.length === 0 || samples.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        Додайте перемикачі, тактовий генератор або світлодіоди для побудови часової осцилограми.
      </div>
    );
  }

  const width = 680;
  const rowHeight = 26;
  const svgHeight = channelNames.length * rowHeight + 12;

  const yOffsetForState = (state: LogicState, top: number): number => {
    if (state === '1') return top + 4;
    if (state === '0') return top + 19;
    return top + 11.5; // High-Z та X по центру каналу
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-950/95">
      <div className="flex items-center justify-between border-b border-slate-800/80 px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Activity className="h-3.5 w-3.5 text-emerald-400" />
          Логічний аналізатор часових діаграм (Oscilloscope)
        </div>
        <div className="font-mono text-[11px] text-slate-400">
          Модельний час t = <span className="text-emerald-300">{currentTimeNs} нс</span> | Вибірок:{' '}
          {samples.length}
        </div>
      </div>

      <div className="flex flex-1 overflow-y-auto px-3 py-2 gap-3">
        {/* Назви каналів та поточні стани */}
        <div className="w-44 shrink-0 space-y-1">
          {channelNames.map((ch) => (
            <div
              key={ch}
              className="flex h-[22px] items-center justify-between rounded bg-slate-900/80 px-2 text-[11px]"
            >
              <span className="truncate font-mono text-slate-300" title={ch}>
                {ch}
              </span>
              <LogicBadge state={latest?.signals[ch] ?? 'Z'} compact />
            </div>
          ))}
        </div>

        {/* Графік часових діаграм */}
        <div className="flex-1 overflow-x-auto rounded-lg border border-slate-800/80 bg-slate-950 px-2">
          <svg
            viewBox={`0 0 ${width} ${svgHeight}`}
            preserveAspectRatio="none"
            className="h-full w-full min-w-[480px]"
          >
            {channelNames.map((ch, rowIdx) => {
              const top = rowIdx * rowHeight + 4;
              const stepX = samples.length > 1 ? width / (samples.length - 1) : width;

              const points: string[] = [];
              samples.forEach((s, idx) => {
                const st = s.signals[ch] ?? 'Z';
                const x = Number((idx * stepX).toFixed(1));
                const y = yOffsetForState(st, top);
                if (idx > 0) {
                  const prevSt = samples[idx - 1].signals[ch] ?? 'Z';
                  const prevY = yOffsetForState(prevSt, top);
                  if (prevY !== y) {
                    points.push(`L ${x} ${prevY}`);
                  }
                }
                points.push(`${idx === 0 ? 'M' : 'L'} ${x} ${y}`);
              });

              const curState = latest?.signals[ch] ?? 'Z';
              const stroke =
                curState === '1'
                  ? '#10b981'
                  : curState === '0'
                    ? '#3b82f6'
                    : curState === 'Z'
                      ? '#f59e0b'
                      : '#ef4444';

              return (
                <g key={ch}>
                  <line
                    x1={0}
                    y1={top + 21}
                    x2={width}
                    y2={top + 21}
                    stroke="#1e293b"
                    strokeWidth={0.8}
                  />
                  <path d={points.join(' ')} fill="none" stroke={stroke} strokeWidth={1.8} />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};
