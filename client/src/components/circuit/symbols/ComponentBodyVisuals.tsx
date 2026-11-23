import React from 'react';
import {
  decodeSevenSegment,
  type CircuitNodeData,
  type LogicState,
} from '@logicforge/shared-types';

const MONO_FONT = 'Courier New, Fixedsys, Consolas, monospace';
const UI_FONT = 'Tahoma, "MS Sans Serif", "Microsoft Sans Serif", sans-serif';

const LED_RADIAL_PALETTES: Record<
  string,
  { hiCenter: string; hiMid: string; hiEdge: string; halo: string }
> = {
  emerald: { hiCenter: '#a8ffaa', hiMid: '#00d000', hiEdge: '#006800', halo: '#00d000' },
  red: { hiCenter: '#ffb3b3', hiMid: '#ff1e1e', hiEdge: '#8b0000', halo: '#ff1e1e' },
  amber: { hiCenter: '#fff3a8', hiMid: '#ffaa00', hiEdge: '#995800', halo: '#ffaa00' },
  cyan: { hiCenter: '#b8f8ff', hiMid: '#00c4ff', hiEdge: '#005f8a', halo: '#00c4ff' },
  violet: { hiCenter: '#edd5ff', hiMid: '#a855f7', hiEdge: '#5b21b6', halo: '#a855f7' },
};

export interface ComponentBodyVisualsProps {
  node: CircuitNodeData;
  shortLabel: string;
  leftInset: number;
  bodyWidth: number;
  readOnly: boolean;
  getPinVal: (pinId: string) => LogicState;
  onToggleSwitch?: (node: CircuitNodeData, cycleTriState: boolean) => void;
  onToggleDipBit?: (node: CircuitNodeData, bitIndex: number) => void;
}

export const ComponentBodyVisuals: React.FC<ComponentBodyVisualsProps> = ({
  node,
  shortLabel,
  leftInset,
  bodyWidth,
  readOnly,
  getPinVal,
  onToggleSwitch,
  onToggleDipBit,
}) => {
  if (node.type === 'INPUT_SWITCH') {
    const val = getPinVal('OUT');
    const isOne = val === '1';
    const isZ = val === 'Z';
    const actuatorX = isOne ? 42 : isZ ? 26 : 11;
    const interactive = !readOnly && Boolean(onToggleSwitch);
    return (
      <g
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `Перемикач ${node.properties.label}` : undefined}
        data-testid={`switch-toggle-${node.id}`}
        className={
          interactive
            ? 'cursor-pointer focus:outline-dotted focus:outline-1 focus:outline-black'
            : ''
        }
        onPointerDown={(e) => {
          if (!readOnly) e.stopPropagation();
        }}
        onClick={(e) => {
          if (!interactive || !onToggleSwitch) return;
          e.stopPropagation();
          onToggleSwitch(node, e.shiftKey);
        }}
        onKeyDown={(e) => {
          if (!interactive || !onToggleSwitch) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onToggleSwitch(node, e.shiftKey);
          }
        }}
      >
        <rect
          x={8}
          y={8}
          width={66}
          height={32}
          fill="#2b2b2b"
          stroke="#808080"
          strokeWidth={1.5}
        />
        <polyline
          points="9,39 73,39 73,9"
          fill="none"
          stroke="#ffffff"
          strokeWidth={1}
          className="pointer-events-none"
        />
        <rect
          x={actuatorX}
          y={11}
          width={28}
          height={26}
          fill="#c0c0c0"
          stroke="#000000"
          strokeWidth={1}
        />
        <polyline
          points={`${actuatorX + 1},36 ${actuatorX + 1},12 ${actuatorX + 27},12`}
          fill="none"
          stroke="#ffffff"
          strokeWidth={1.5}
          className="pointer-events-none"
        />
        <polyline
          points={`${actuatorX + 27},12 ${actuatorX + 27},36 ${actuatorX + 1},36`}
          fill="none"
          stroke="#595959"
          strokeWidth={1.5}
          className="pointer-events-none"
        />
        <circle
          cx={actuatorX + 22}
          cy={17}
          r={2.5}
          fill={isOne ? '#00c000' : isZ ? '#b8860b' : '#555555'}
          className="pointer-events-none"
        />
        <text
          x={actuatorX + 12}
          y={28}
          textAnchor="middle"
          fill={isOne ? '#006600' : isZ ? '#806000' : '#1a1a1a'}
          fontSize={12}
          fontWeight={800}
          fontFamily={MONO_FONT}
          className="select-none pointer-events-none"
        >
          {val}
        </text>
      </g>
    );
  }

  if (node.type === 'PUSH_BUTTON') {
    const val = getPinVal('OUT');
    const isPressed = val === '1';
    const interactive = !readOnly && Boolean(onToggleSwitch);
    return (
      <g
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `Кнопка ${node.properties.label}` : undefined}
        data-testid={`button-toggle-${node.id}`}
        className={
          interactive
            ? 'cursor-pointer focus:outline-dotted focus:outline-1 focus:outline-black'
            : ''
        }
        onPointerDown={(e) => {
          if (!readOnly) e.stopPropagation();
        }}
        onClick={(e) => {
          if (!interactive || !onToggleSwitch) return;
          e.stopPropagation();
          onToggleSwitch(node, false);
        }}
        onKeyDown={(e) => {
          if (!interactive || !onToggleSwitch) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onToggleSwitch(node, false);
          }
        }}
      >
        <rect
          x={8}
          y={6}
          width={66}
          height={36}
          fill="#c0c0c0"
          stroke="#000000"
          strokeWidth={1.2}
        />
        <polyline points="9,41 9,7 73,7" fill="none" stroke="#ffffff" strokeWidth={1.5} />
        <polyline points="73,7 73,41 9,41" fill="none" stroke="#808080" strokeWidth={1.5} />
        <circle cx={30} cy={24} r={12} fill="#2b2b2b" stroke="#808080" strokeWidth={1.4} />
        <circle
          cx={30}
          cy={24}
          r={9}
          fill={isPressed ? '#00b800' : '#dfdfdf'}
          stroke="#000000"
          strokeWidth={1.2}
        />
        <circle cx={27.5} cy={21.5} r={2.2} fill="#ffffff" fillOpacity={isPressed ? 0.85 : 0.65} />
        <text
          x={57}
          y={28}
          textAnchor="middle"
          fill={isPressed ? '#008000' : '#1a1a1a'}
          fontSize={12.5}
          fontWeight={800}
          fontFamily={MONO_FONT}
          className="select-none pointer-events-none"
        >
          {val}
        </text>
      </g>
    );
  }

  if (node.type === 'DIP_SWITCH_4') {
    const bits: [LogicState, LogicState, LogicState, LogicState] = [
      getPinVal('Q0'),
      getPinVal('Q1'),
      getPinVal('Q2'),
      getPinVal('Q3'),
    ];
    const interactive = !readOnly && Boolean(onToggleDipBit);
    return (
      <g>
        <rect
          x={8}
          y={6}
          width={80}
          height={100}
          fill="#2b2b2b"
          stroke="#000000"
          strokeWidth={1.5}
        />
        <polyline points="9,105 9,7 87,7" fill="none" stroke="#808080" strokeWidth={1.2} />
        {[0, 1, 2, 3].map((idx) => {
          const y = 15 + idx * 24;
          const isOn = bits[idx] === '1';
          const rockerX = isOn ? 53 : 14;
          return (
            <g
              key={idx}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={interactive ? `DIP ${node.properties.label} біт ${idx}` : undefined}
              data-testid={`dip-toggle-${node.id}-${idx}`}
              className={
                interactive
                  ? 'cursor-pointer focus:outline-dotted focus:outline-1 focus:outline-black'
                  : ''
              }
              onPointerDown={(e) => {
                if (!readOnly) e.stopPropagation();
              }}
              onClick={(e) => {
                if (!interactive || !onToggleDipBit) return;
                e.stopPropagation();
                onToggleDipBit(node, idx);
              }}
              onKeyDown={(e) => {
                if (!interactive || !onToggleDipBit) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleDipBit(node, idx);
                }
              }}
            >
              <rect
                x={12}
                y={y}
                width={72}
                height={18}
                fill="#141414"
                stroke="#595959"
                strokeWidth={1}
              />
              <rect
                x={rockerX}
                y={y + 2}
                width={29}
                height={14}
                fill="#dfdfdf"
                stroke="#000000"
                strokeWidth={1}
              />
              <polyline
                points={`${rockerX + 1},${y + 15} ${rockerX + 1},${y + 3} ${rockerX + 28},${y + 3}`}
                fill="none"
                stroke="#ffffff"
                strokeWidth={1.2}
              />
              <circle cx={isOn ? 48 : 79} cy={y + 9} r={2.2} fill={isOn ? '#00d000' : '#404040'} />
              <text
                x={isOn ? 30 : 64}
                y={y + 12.5}
                textAnchor="middle"
                fill={isOn ? '#99ff99' : '#d4d4d4'}
                fontSize={9}
                fontWeight={700}
                fontFamily={MONO_FONT}
                className="select-none pointer-events-none"
              >
                S{idx}:{bits[idx]}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  if (node.type === 'LED') {
    const val = getPinVal('IN');
    const colorKey = node.properties.ledColor ?? 'emerald';
    const palette = LED_RADIAL_PALETTES[colorKey] ?? LED_RADIAL_PALETTES.emerald;
    const isHigh = val === '1';
    const isConflict = val === 'X';
    const gradId = `led-grad-${node.id}`;

    return (
      <g>
        <defs>
          <radialGradient id={gradId} cx="38%" cy="35%" r="65%">
            {isConflict ? (
              <>
                <stop offset="0%" stopColor="#ff9999" />
                <stop offset="55%" stopColor="#ff1e1e" />
                <stop offset="100%" stopColor="#800000" />
              </>
            ) : isHigh ? (
              <>
                <stop offset="0%" stopColor={palette.hiCenter} />
                <stop offset="55%" stopColor={palette.hiMid} />
                <stop offset="100%" stopColor={palette.hiEdge} />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#464646" />
                <stop offset="65%" stopColor="#2b2b2b" />
                <stop offset="100%" stopColor="#161616" />
              </>
            )}
          </radialGradient>
        </defs>

        <circle cx={60} cy={24} r={14.5} fill="#c0c0c0" stroke="#000000" strokeWidth={1.4} />
        <path
          d="M 50 34 A 14 14 0 0 1 70 14"
          fill="none"
          stroke="#ffffff"
          strokeWidth={1.5}
          className="pointer-events-none"
        />
        <path
          d="M 70 14 A 14 14 0 0 1 50 34"
          fill="none"
          stroke="#808080"
          strokeWidth={1.5}
          className="pointer-events-none"
        />
        <circle
          cx={60}
          cy={24}
          r={11}
          fill={`url(#${gradId})`}
          stroke={isHigh || isConflict ? '#000000' : '#333333'}
          strokeWidth={1.5}
        />
        <circle
          cx={56}
          cy={20}
          r={2.2}
          fill="#ffffff"
          fillOpacity={isHigh || isConflict ? 0.92 : 0.35}
          className="pointer-events-none"
        />
        <text
          x={82}
          y={28}
          textAnchor="start"
          fill={isConflict ? '#cc0000' : isHigh ? '#008000' : '#3b3b3b'}
          fontSize={10.5}
          fontWeight={800}
          fontFamily={MONO_FONT}
          className="select-none pointer-events-none"
        >
          {isConflict ? 'X' : isHigh ? '1' : '0'}
        </text>
      </g>
    );
  }

  if (node.type === 'PROBE') {
    const val = getPinVal('IN');
    const valColor =
      val === '1' ? '#00e600' : val === '0' ? '#d4d4d4' : val === 'Z' ? '#ffd166' : '#ff4444';
    return (
      <g>
        <rect
          x={32}
          y={8}
          width={66}
          height={32}
          fill="#141414"
          stroke="#808080"
          strokeWidth={1.6}
        />
        <polyline points="33,39 97,39 97,9" fill="none" stroke="#ffffff" strokeWidth={1} />
        <text
          x={65}
          y={29}
          textAnchor="middle"
          fill={valColor}
          fontSize={13}
          fontWeight={800}
          fontFamily={MONO_FONT}
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
    const segOn = '#00e600';
    const segOff = '#282828';
    return (
      <g transform="translate(50, 19)">
        <rect
          x={0}
          y={0}
          width={68}
          height={90}
          fill="#141414"
          stroke="#000000"
          strokeWidth={1.6}
        />
        <polyline points="1,89 67,89 67,1" fill="none" stroke="#dfdfdf" strokeWidth={1} />
        <polyline points="1,89 1,1 67,1" fill="none" stroke="#808080" strokeWidth={1.2} />
        <rect x={18} y={10} width={32} height={6} fill={a ? segOn : segOff} />
        <rect x={50} y={16} width={6} height={26} fill={b ? segOn : segOff} />
        <rect x={50} y={48} width={6} height={26} fill={c ? segOn : segOff} />
        <rect x={18} y={74} width={32} height={6} fill={d ? segOn : segOff} />
        <rect x={12} y={48} width={6} height={26} fill={e ? segOn : segOff} />
        <rect x={12} y={16} width={6} height={26} fill={f ? segOn : segOff} />
        <rect x={18} y={42} width={32} height={6} fill={g ? segOn : segOff} />
        <circle cx={60} cy={80} r={2.5} fill={segOn} />
      </g>
    );
  }

  if (node.type === 'CLOCK') {
    const out = getPinVal('OUT');
    return (
      <g transform="translate(10, 9)">
        <rect
          x={0}
          y={0}
          width={58}
          height={30}
          fill="#ffffff"
          stroke="#808080"
          strokeWidth={1.4}
        />
        <polyline
          points="4,23 12,23 12,7 23,7 23,23 35,23 35,7 46,7 46,23 54,23"
          fill="none"
          stroke={out === '1' ? 'var(--logic-1)' : '#000000'}
          strokeWidth={2}
        />
      </g>
    );
  }

  if (
    node.type === 'COUNTER_4BIT' ||
    node.type === 'REGISTER_4BIT' ||
    node.type === 'SHIFT_REG_SIPO'
  ) {
    const b0 = getPinVal('Q0') === '1' ? 1 : 0;
    const b1 = getPinVal('Q1') === '1' ? 2 : 0;
    const b2 = getPinVal('Q2') === '1' ? 4 : 0;
    const b3 = getPinVal('Q3') === '1' ? 8 : 0;
    const hex = (b0 | b1 | b2 | b3).toString(16).toUpperCase();
    return (
      <g>
        <text
          x={node.width / 2}
          y={node.height / 2 - 6}
          textAnchor="middle"
          fill="#000000"
          fontSize={12}
          fontWeight={800}
          fontFamily={UI_FONT}
          className="select-none pointer-events-none"
        >
          {shortLabel}
        </text>
        <rect
          x={node.width / 2 - 24}
          y={node.height / 2 + 2}
          width={48}
          height={18}
          fill="#141414"
          stroke="#808080"
          strokeWidth={1.2}
        />
        <text
          x={node.width / 2}
          y={node.height / 2 + 15}
          textAnchor="middle"
          fill="#00e600"
          fontSize={10.5}
          fontWeight={800}
          fontFamily={MONO_FONT}
          className="select-none pointer-events-none"
        >
          0x{hex}
        </text>
      </g>
    );
  }

  const bodyMidX = leftInset + bodyWidth / 2;
  const isConstSource = node.type === 'CONST_HIGH' || node.type === 'CONST_LOW';
  return (
    <g>
      <text
        x={isConstSource ? bodyMidX - 4 : bodyMidX}
        y={node.height / 2 + 4}
        textAnchor="middle"
        fill="#000000"
        fontSize={isConstSource ? 12 : 12.5}
        fontWeight={800}
        fontFamily={UI_FONT}
        className="select-none pointer-events-none"
      >
        {shortLabel}
      </text>
      {node.type === 'TIMER_555' && (
        <text
          x={bodyMidX}
          y={node.height / 2 + 19}
          textAnchor="middle"
          fill="#3b3b3b"
          fontSize={9}
          fontWeight={700}
          fontFamily={MONO_FONT}
          className="select-none pointer-events-none"
        >
          NE555P RC
        </text>
      )}
    </g>
  );
};
