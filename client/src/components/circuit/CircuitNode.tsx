import React from 'react';
import {
  decodeSevenSegment,
  getCatalogItem,
  type CircuitNodeData,
  type LogicState,
  type PinDefinition,
} from '@logicforge/shared-types';
import { Pin } from './Pin';

export interface CircuitNodeProps {
  node: CircuitNodeData;
  pinStates?: Record<string, LogicState>;
  selected?: boolean;
  readOnly?: boolean;
  activeWiringPinKey?: string | null;
  onNodeMouseDown?: (node: CircuitNodeData, e: React.MouseEvent) => void;
  onPinClick?: (node: CircuitNodeData, pin: PinDefinition, e: React.MouseEvent) => void;
  onToggleSwitch?: (node: CircuitNodeData, cycleTriState: boolean) => void;
}

const LED_PALETTES: Record<string, { on: string; glow: string }> = {
  emerald: { on: '#10b981', glow: 'rgba(16,185,129,0.75)' },
  red: { on: '#ef4444', glow: 'rgba(239,68,68,0.75)' },
  amber: { on: '#f59e0b', glow: 'rgba(245,158,11,0.75)' },
  cyan: { on: '#06b6d4', glow: 'rgba(6,182,212,0.75)' },
  violet: { on: '#8b5cf6', glow: 'rgba(139,92,246,0.75)' },
};

/**
 * Універсальний графічний компонент вузла схеми (CircuitNode), який перевикористовується у:
 * 1) Головному полотні редактора (EditorPage)
 * 2) Мініатюрах палітри елементів
 * 3) Інтерактивному стенді випробувань (ComponentLibraryPage)
 * 4) Перегляді знімків ревізій та інженерних звітів (RevisionHistoryPage / ReportsPage)
 */
export const CircuitNode: React.FC<CircuitNodeProps> = ({
  node,
  pinStates,
  selected = false,
  readOnly = false,
  activeWiringPinKey,
  onNodeMouseDown,
  onPinClick,
  onToggleSwitch,
}) => {
  const meta = getCatalogItem(node.type);
  const getPinVal = (pinId: string): LogicState =>
    pinStates?.[pinId] ?? node.pins.find((p) => p.id === pinId)?.state ?? 'Z';

  const renderCenterVisual = () => {
    if (node.type === 'INPUT_SWITCH' || node.type === 'PUSH_BUTTON') {
      const val = getPinVal('OUT');
      const bg = val === '1' ? '#059669' : val === 'Z' ? '#b45309' : '#1e293b';
      return (
        <g
          className={!readOnly ? 'cursor-pointer' : ''}
          onClick={(e) => {
            if (readOnly || !onToggleSwitch) return;
            e.stopPropagation();
            onToggleSwitch(node, e.shiftKey);
          }}
        >
          <rect
            x={14}
            y={14}
            width={52}
            height={28}
            rx={6}
            fill={bg}
            stroke={val === '1' ? '#34d399' : val === 'Z' ? '#fbbf24' : '#475569'}
            strokeWidth={1.5}
          />
          <text
            x={40}
            y={32}
            textAnchor="middle"
            fill="#f8fafc"
            fontSize={13}
            fontWeight={800}
            fontFamily="JetBrains Mono, monospace"
            className="select-none"
          >
            {val}
          </text>
        </g>
      );
    }

    if (node.type === 'LED') {
      const val = getPinVal('IN');
      const colorCfg = LED_PALETTES[node.properties.ledColor ?? 'emerald'] ?? LED_PALETTES.emerald;
      const isHigh = val === '1';
      const isConflict = val === 'X';
      return (
        <g>
          <circle
            cx={60}
            cy={28}
            r={14}
            fill={isConflict ? '#ef4444' : isHigh ? colorCfg.on : '#1e293b'}
            stroke={isHigh ? '#f8fafc' : '#475569'}
            strokeWidth={2}
            style={{
              filter: isHigh
                ? `drop-shadow(0 0 10px ${colorCfg.glow})`
                : isConflict
                  ? 'drop-shadow(0 0 8px rgba(239,68,68,0.9))'
                  : 'none',
            }}
          />
          {isConflict && (
            <text x={60} y={32} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={800}>
              !
            </text>
          )}
        </g>
      );
    }

    if (node.type === 'PROBE') {
      const val = getPinVal('IN');
      const color =
        val === '1' ? '#34d399' : val === '0' ? '#60a5fa' : val === 'Z' ? '#fbbf24' : '#f87171';
      return (
        <g>
          <rect
            x={32}
            y={13}
            width={58}
            height={30}
            rx={6}
            fill="#020617"
            stroke={color}
            strokeWidth={1.5}
          />
          <text
            x={61}
            y={33}
            textAnchor="middle"
            fill={color}
            fontSize={14}
            fontWeight={800}
            fontFamily="JetBrains Mono, monospace"
          >
            {val === 'Z' ? 'Hi-Z' : val}
          </text>
        </g>
      );
    }

    if (node.type === 'SEVEN_SEGMENT') {
      const decoded = decodeSevenSegment(
        getPinVal('B0'),
        getPinVal('B1'),
        getPinVal('B2'),
        getPinVal('B3'),
      );
      const [a, b, c, d, e, f, g] = decoded.segments;
      const segOn = '#10b981';
      const segOff = '#1e293b';
      return (
        <g transform="translate(46, 22)">
          <rect x={0} y={0} width={68} height={90} rx={6} fill="#020617" stroke="#334155" />
          {/* Сегменти a..g */}
          <rect x={18} y={10} width={32} height={6} rx={3} fill={a ? segOn : segOff} />
          <rect x={50} y={16} width={6} height={26} rx={3} fill={b ? segOn : segOff} />
          <rect x={50} y={48} width={6} height={26} rx={3} fill={c ? segOn : segOff} />
          <rect x={18} y={74} width={32} height={6} rx={3} fill={d ? segOn : segOff} />
          <rect x={12} y={48} width={6} height={26} rx={3} fill={e ? segOn : segOff} />
          <rect x={12} y={16} width={6} height={26} rx={3} fill={f ? segOn : segOff} />
          <rect x={18} y={42} width={32} height={6} rx={3} fill={g ? segOn : segOff} />
        </g>
      );
    }

    if (node.type === 'CLOCK') {
      const out = getPinVal('OUT');
      return (
        <g transform="translate(22, 18)">
          <polyline
            points="0,18 10,18 10,4 24,4 24,18 38,18 38,4 50,4"
            fill="none"
            stroke={out === '1' ? '#34d399' : '#64748b'}
            strokeWidth={2.2}
          />
        </g>
      );
    }

    return (
      <g>
        <text
          x={node.width / 2}
          y={node.height / 2 + 4}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize={13}
          fontWeight={800}
          fontFamily="JetBrains Mono, monospace"
          className="select-none pointer-events-none"
        >
          {meta.shortLabel}
        </text>
        {node.type === 'TIMER_555' && (
          <text
            x={node.width / 2}
            y={node.height / 2 + 20}
            textAnchor="middle"
            fill="#fbbf24"
            fontSize={9}
            fontFamily="JetBrains Mono, monospace"
            className="select-none pointer-events-none"
          >
            IC TIMER
          </text>
        )}
      </g>
    );
  };

  const categoryAccent =
    meta.category === 'GATES'
      ? '#38bdf8'
      : meta.category === 'SEQUENTIAL'
        ? '#a78bfa'
        : meta.category === 'MICROPROCESSOR'
          ? '#fbbf24'
          : meta.category === 'OUTPUTS'
            ? '#34d399'
            : '#94a3b8';

  return (
    <g
      transform={`translate(${node.position.x}, ${node.position.y})`}
      onMouseDown={(e) => {
        if (!readOnly && onNodeMouseDown) {
          onNodeMouseDown(node, e);
        }
      }}
      className={readOnly ? '' : 'cursor-grab active:cursor-grabbing'}
    >
      {/* Підпис елемента над корпусом */}
      <text
        x={node.width / 2}
        y={-7}
        textAnchor="middle"
        fill={selected ? '#6ee7b7' : '#94a3b8'}
        fontSize={11}
        fontWeight={700}
        fontFamily="Inter, sans-serif"
        className="select-none pointer-events-none"
      >
        {node.properties.label}
      </text>

      {/* Основний корпус логічного елемента / ІМС */}
      <rect
        width={node.width}
        height={node.height}
        rx={10}
        fill="#0f172a"
        stroke={selected ? '#10b981' : '#334155'}
        strokeWidth={selected ? 2.4 : 1.6}
        style={{
          filter: selected
            ? 'drop-shadow(0 0 12px rgba(16,185,129,0.35))'
            : 'drop-shadow(0 4px 8px rgba(2,6,23,0.65))',
        }}
      />

      {/* Верхній кольоровий індикатор категорії ІМС */}
      <line
        x1={10}
        y1={1.5}
        x2={node.width - 10}
        y2={1.5}
        stroke={categoryAccent}
        strokeWidth={2.2}
        strokeOpacity={0.75}
      />

      {renderCenterVisual()}

      {/* Затримка поширення t_pd у кутку корпусу */}
      {node.properties.propagationDelayNs > 0 && (
        <text
          x={node.width - 8}
          y={node.height - 6}
          textAnchor="end"
          fill="#64748b"
          fontSize={8.5}
          fontFamily="JetBrains Mono, monospace"
          className="select-none pointer-events-none"
        >
          {node.properties.propagationDelayNs}ns
        </text>
      )}

      {/* Всі вхідні та вихідні виводи (Pin) */}
      {node.pins.map((pin) => {
        const key = `${node.id}::${pin.id}`;
        return (
          <Pin
            key={pin.id}
            pin={pin}
            state={getPinVal(pin.id)}
            mode="svg"
            interactive={!readOnly}
            highlighted={activeWiringPinKey === key}
            onPinClick={(clickedPin, ev) => onPinClick?.(node, clickedPin, ev)}
          />
        );
      })}
    </g>
  );
};
