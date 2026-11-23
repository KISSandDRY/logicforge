import React from 'react';
import {
  getCatalogItem,
  type CircuitNodeData,
  type LogicState,
  type PinDefinition,
} from '@logicforge/shared-types';
import { Pin } from './Pin';
import { ComponentBodyVisuals } from './symbols/ComponentBodyVisuals';
import { GateSymbol } from './symbols/GateSymbol';

export interface CircuitNodeProps {
  node: CircuitNodeData;
  pinStates?: Record<string, LogicState>;
  selected?: boolean;
  readOnly?: boolean;
  omitNodeId?: boolean;
  activeWiringPinKey?: string | null;
  onNodePointerDown?: (node: CircuitNodeData, e: React.PointerEvent) => void;
  onPinClick?: (node: CircuitNodeData, pin: PinDefinition, e: React.PointerEvent) => void;
  onToggleSwitch?: (node: CircuitNodeData, cycleTriState: boolean) => void;
  onToggleDipBit?: (node: CircuitNodeData, bitIndex: number) => void;
}

const MONO_FONT = 'Courier New, Fixedsys, Consolas, monospace';
const UI_FONT = 'Tahoma, "MS Sans Serif", "Microsoft Sans Serif", sans-serif';

export const CircuitNode: React.FC<CircuitNodeProps> = React.memo(
  ({
    node,
    pinStates,
    selected = false,
    readOnly = false,
    omitNodeId = false,
    activeWiringPinKey,
    onNodePointerDown,
    onPinClick,
    onToggleSwitch,
    onToggleDipBit,
  }) => {
    const meta = getCatalogItem(node.type);
    const getPinVal = (pinId: string): LogicState =>
      pinStates?.[pinId] ??
      (node.type === 'INPUT_SWITCH' || node.type === 'PUSH_BUTTON'
        ? (node.properties.switchState ?? '0')
        : (node.pins.find((p) => p.id === pinId)?.state ?? 'Z'));

    const strokeColor = selected ? 'var(--win-titlebar-start)' : '#000000';
    const strokeWidth = selected ? 2.4 : 2;
    const isDipChip = meta.symbolVariant === 'dip-ic';
    const isShapedGate = meta.symbolVariant === 'shaped-gate';

    const hasLeftPins = node.pins.some((p) => p.offset.side === 'LEFT');
    const hasRightPins = node.pins.some((p) => p.offset.side === 'RIGHT');
    const leftInset = hasLeftPins ? 12 : 2;
    const rightInset = hasRightPins ? 12 : 2;
    const bodyWidth = Math.max(24, node.width - leftInset - rightInset);
    const bodyEnd = leftInset + bodyWidth;

    const bodyFill = selected ? '#f0f5ff' : isDipChip ? '#f4f4f0' : '#ffffff';
    const icPartNumber = meta.icCode;
    const notchCx = leftInset + bodyWidth / 2;

    return (
      <g
        data-node-id={omitNodeId ? undefined : node.id}
        transform={`translate(${node.position.x}, ${node.position.y})`}
        onPointerDown={(e) => {
          if (!readOnly && onNodePointerDown) {
            onNodePointerDown(node, e);
          }
        }}
        className={readOnly ? 'touch-none' : 'touch-none cursor-grab active:cursor-grabbing'}
      >
        <text
          x={isShapedGate ? 24 : leftInset}
          y={-6}
          textAnchor="start"
          fill={selected ? 'var(--win-titlebar-start)' : '#000000'}
          fontSize={11}
          fontWeight={800}
          fontFamily={UI_FONT}
          className="select-none pointer-events-none"
        >
          {node.properties.label}
        </text>

        {icPartNumber && !isShapedGate && (
          <text
            x={bodyEnd}
            y={-6}
            textAnchor="end"
            fill="#3b3b3b"
            fontSize={9}
            fontWeight={700}
            fontFamily={MONO_FONT}
            className="select-none pointer-events-none"
          >
            {icPartNumber}
          </text>
        )}

        {isShapedGate ? (
          <GateSymbol
            node={node}
            bodyFill={bodyFill}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
          />
        ) : (
          <>
            {node.pins.map((pin) => {
              const isLeft = pin.offset.side === 'LEFT';
              if (isDipChip) {
                return (
                  <g key={`lead_${pin.id}`} className="pointer-events-none">
                    <rect
                      x={isLeft ? 2 : bodyEnd}
                      y={pin.offset.y - 2.8}
                      width={isLeft ? leftInset - 2 : rightInset - 2}
                      height={5.6}
                      fill="#c0c0c0"
                      stroke="#000000"
                      strokeWidth={1.1}
                    />
                  </g>
                );
              }
              return (
                <line
                  key={`lead_${pin.id}`}
                  x1={isLeft ? 0 : bodyEnd}
                  y1={pin.offset.y}
                  x2={isLeft ? leftInset : node.width}
                  y2={pin.offset.y}
                  stroke="#000000"
                  strokeWidth={2}
                  className="pointer-events-none"
                />
              );
            })}

            <rect
              x={leftInset}
              y={0}
              width={bodyWidth}
              height={node.height}
              fill={bodyFill}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            {isDipChip && (
              <>
                <polyline
                  points={`${leftInset + 2},${node.height - 2} ${leftInset + 2},2 ${bodyEnd - 2},2`}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={1.2}
                  className="pointer-events-none"
                />
                <polyline
                  points={`${bodyEnd - 2},2 ${bodyEnd - 2},${node.height - 2} ${leftInset + 2},${node.height - 2}`}
                  fill="none"
                  stroke="#808080"
                  strokeWidth={1.2}
                  className="pointer-events-none"
                />
                <path
                  d={`M ${notchCx - 8} 1 A 8 8 0 0 0 ${notchCx + 8} 1 Z`}
                  fill="#c0c0c0"
                  stroke="#000000"
                  strokeWidth={1.2}
                  className="pointer-events-none"
                />
              </>
            )}

            {node.pins
              .filter((p) => p.inverted)
              .map((invPin) => {
                const isLeft = invPin.offset.side === 'LEFT';
                return (
                  <circle
                    key={`inv_${invPin.id}`}
                    cx={isLeft ? leftInset - 3.3 : bodyEnd + 3.3}
                    cy={invPin.offset.y}
                    r={2.9}
                    fill="#ffffff"
                    stroke="#000000"
                    strokeWidth={1.4}
                    className="pointer-events-none"
                  />
                );
              })}

            {node.pins
              .filter((p) => p.clockEdge && p.offset.side === 'LEFT')
              .map((clkPin) => (
                <polygon
                  key={`clk_edge_${clkPin.id}`}
                  points={`${leftInset},${clkPin.offset.y - 4.5} ${leftInset + 7},${clkPin.offset.y} ${leftInset},${clkPin.offset.y + 4.5}`}
                  fill="none"
                  stroke="#000000"
                  strokeWidth={1.5}
                  className="pointer-events-none"
                />
              ))}

            <ComponentBodyVisuals
              node={node}
              shortLabel={meta.shortLabel}
              leftInset={leftInset}
              bodyWidth={bodyWidth}
              readOnly={readOnly}
              getPinVal={getPinVal}
              onToggleSwitch={onToggleSwitch}
              onToggleDipBit={onToggleDipBit}
            />
          </>
        )}

        {!isShapedGate && node.properties.propagationDelayNs > 0 && (
          <text
            x={bodyEnd - 5}
            y={node.height - 5}
            textAnchor="end"
            fill="#3b3b3b"
            fontSize={8}
            fontWeight={700}
            fontFamily={MONO_FONT}
            className="select-none pointer-events-none"
          >
            {node.properties.propagationDelayNs}ns
          </text>
        )}

        {node.pins.map((pin) => {
          const pinKeyStr = `${node.id}::${pin.id}`;
          const curState = getPinVal(pin.id);
          return (
            <Pin
              key={pin.id}
              pin={pin}
              state={curState}
              mode="svg"
              labelPlacement={isShapedGate ? 'above-lead' : 'inside-box'}
              interactive={!readOnly}
              highlighted={activeWiringPinKey === pinKeyStr}
              onPinClick={(clickedPin, ev) => onPinClick?.(node, clickedPin, ev)}
            />
          );
        })}
      </g>
    );
  },
);
