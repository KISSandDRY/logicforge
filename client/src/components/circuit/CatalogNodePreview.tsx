import React, { useId, useMemo } from 'react';
import {
  createNodeFromCatalog,
  type ComponentType,
  type CustomICDefinition,
  type LogicState,
} from '@logicforge/shared-types';
import { CircuitNode } from './CircuitNode';

export interface CatalogNodePreviewProps {
  type: ComponentType;
  customIc?: CustomICDefinition;
  compact?: boolean;
  className?: string;
}

/**
 * Рендерить реальний схемний компонент <CircuitNode> у масштабованому SVG-прев'ю,
 * щоб піктограма в бібліотеці та редакторі на 100% відповідала вигляду елемента на полотні.
 */
export const CatalogNodePreview: React.FC<CatalogNodePreviewProps> = ({
  type,
  customIc,
  compact = false,
  className,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const { previewNode, pinStates, vbWidth, vbHeight } = useMemo(() => {
    const pos = compact ? { x: 10, y: 18 } : { x: 24, y: 20 };
    const node = createNodeFromCatalog(
      type,
      `prev_${uid}_${type}`,
      pos,
      compact ? '' : undefined,
      customIc,
    );

    const states: Record<string, LogicState> = {};
    for (const p of node.pins) {
      if (type === 'CONST_HIGH' && p.direction === 'OUTPUT') {
        states[p.id] = '1';
      } else if (type === 'CONST_LOW' && p.direction === 'OUTPUT') {
        states[p.id] = '0';
      } else {
        states[p.id] = p.state;
      }
    }

    const w = compact ? node.width + 20 : Math.max(164, node.width + 48);
    const h = compact ? node.height + 26 : Math.max(98, node.height + 34);

    return { previewNode: node, pinStates: states, vbWidth: w, vbHeight: h };
  }, [type, customIc, compact, uid]);

  return (
    <svg
      data-testid={`preview-symbol-${type}`}
      viewBox={`0 0 ${vbWidth} ${vbHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className={
        className ??
        (compact
          ? 'h-12 w-full max-w-[96px] pointer-events-none'
          : 'h-24 w-full max-w-[210px] pointer-events-none')
      }
    >
      <CircuitNode node={previewNode} pinStates={pinStates} readOnly omitNodeId />
    </svg>
  );
};
