import React from 'react';
import type { CircuitNodeData } from '@logicforge/shared-types';

const UI_FONT = 'Tahoma, "MS Sans Serif", "Microsoft Sans Serif", sans-serif';

export interface GateSymbolProps {
  node: CircuitNodeData;
  bodyFill: string;
  strokeColor: string;
  strokeWidth: number;
}

export const GateSymbol: React.FC<GateSymbolProps> = ({
  node,
  bodyFill,
  strokeColor,
  strokeWidth,
}) => {
  const cy = node.height / 2;

  switch (node.type) {
    case 'AND':
    case 'NAND': {
      const isNand = node.type === 'NAND';
      return (
        <g>
          <line x1={0} y1={16} x2={24} y2={16} stroke="#000000" strokeWidth={2} />
          <line x1={0} y1={48} x2={24} y2={48} stroke="#000000" strokeWidth={2} />
          <line
            x1={isNand ? 91 : 82}
            y1={32}
            x2={node.width}
            y2={32}
            stroke="#000000"
            strokeWidth={2}
          />
          <path
            d="M 24 6 L 56 6 A 26 26 0 0 1 56 58 L 24 58 Z"
            fill={bodyFill}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <path
            d="M 27 55 L 55 55 A 23 23 0 0 0 77 24"
            fill="none"
            stroke="#d4d4d4"
            strokeWidth={1.6}
            className="pointer-events-none"
          />
          <circle cx={24} cy={16} r={2.2} fill="#000000" className="pointer-events-none" />
          <circle cx={24} cy={48} r={2.2} fill="#000000" className="pointer-events-none" />
          {isNand && (
            <circle
              cx={86.5}
              cy={32}
              r={4.2}
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          )}
          <text
            x={51}
            y={36}
            textAnchor="middle"
            fill="#000000"
            fontSize={11.5}
            fontWeight={800}
            fontFamily={UI_FONT}
            className="select-none pointer-events-none"
          >
            {isNand ? 'NAND' : 'AND'}
          </text>
        </g>
      );
    }

    case 'OR':
    case 'NOR':
    case 'XOR':
    case 'XNOR': {
      const isNor = node.type === 'NOR' || node.type === 'XNOR';
      const isXor = node.type === 'XOR' || node.type === 'XNOR';
      const leadEndX = isXor ? 23.5 : 29.5;
      return (
        <g>
          <line x1={0} y1={16} x2={leadEndX} y2={16} stroke="#000000" strokeWidth={2} />
          <line x1={0} y1={48} x2={leadEndX} y2={48} stroke="#000000" strokeWidth={2} />
          <line
            x1={isNor ? 91 : 82}
            y1={32}
            x2={node.width}
            y2={32}
            stroke="#000000"
            strokeWidth={2}
          />
          {isXor && (
            <path
              d="M 19 6 Q 33 32 19 58"
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          )}
          <path
            d="M 25 6 Q 56 6 82 32 Q 56 58 25 58 Q 39 32 25 6 Z"
            fill={bodyFill}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <path
            d="M 30 54 Q 54 54 78 33"
            fill="none"
            stroke="#d4d4d4"
            strokeWidth={1.6}
            className="pointer-events-none"
          />
          <circle cx={leadEndX} cy={16} r={2} fill="#000000" className="pointer-events-none" />
          <circle cx={leadEndX} cy={48} r={2} fill="#000000" className="pointer-events-none" />
          {isNor && (
            <circle
              cx={86.5}
              cy={32}
              r={4.2}
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          )}
          <text
            x={53}
            y={36}
            textAnchor="middle"
            fill="#000000"
            fontSize={11}
            fontWeight={800}
            fontFamily={UI_FONT}
            className="select-none pointer-events-none"
          >
            {node.type}
          </text>
        </g>
      );
    }

    case 'NOT':
    case 'BUFFER':
    case 'SCHMITT_INV': {
      const hasBubble = node.type === 'NOT' || node.type === 'SCHMITT_INV';
      const isSchmitt = node.type === 'SCHMITT_INV';
      return (
        <g>
          <line x1={0} y1={cy} x2={24} y2={cy} stroke="#000000" strokeWidth={2} />
          <line
            x1={hasBubble ? 83 : 74}
            y1={cy}
            x2={node.width}
            y2={cy}
            stroke="#000000"
            strokeWidth={2}
          />
          <polygon
            points={`24,6 24,${node.height - 6} 74,${cy}`}
            fill={bodyFill}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <polyline
            points={`26,${node.height - 9} 70,${cy}`}
            fill="none"
            stroke="#d4d4d4"
            strokeWidth={1.5}
            className="pointer-events-none"
          />
          <circle cx={24} cy={cy} r={2.2} fill="#000000" className="pointer-events-none" />
          {hasBubble && (
            <circle
              cx={78.5}
              cy={cy}
              r={4.2}
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          )}
          {isSchmitt ? (
            <polyline
              points={`32,${cy + 5} 41,${cy + 5} 45,${cy - 5} 51,${cy - 5} 41,${cy - 5} 37,${cy + 5}`}
              fill="none"
              stroke="#000000"
              strokeWidth={1.7}
              className="pointer-events-none"
            />
          ) : (
            <text
              x={42}
              y={cy + 4}
              textAnchor="middle"
              fill="#000000"
              fontSize={10}
              fontWeight={800}
              fontFamily={UI_FONT}
              className="select-none pointer-events-none"
            >
              {node.type === 'NOT' ? 'NOT' : 'BUF'}
            </text>
          )}
        </g>
      );
    }

    default:
      return null;
  }
};
