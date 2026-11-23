import {
  logicAnd,
  logicBuffer,
  logicNand,
  logicNor,
  logicNot,
  logicOr,
  logicTriStateBuffer,
  logicXnor,
  logicXor,
} from '../logicAlgebra';
import type { NodeEvaluatorFn } from './types';

export type CombinationalComponentType =
  | 'CONST_HIGH'
  | 'CONST_LOW'
  | 'INPUT_SWITCH'
  | 'PUSH_BUTTON'
  | 'DIP_SWITCH_4'
  | 'CLOCK'
  | 'BUFFER'
  | 'NOT'
  | 'SCHMITT_INV'
  | 'AND'
  | 'OR'
  | 'NAND'
  | 'NOR'
  | 'XOR'
  | 'XNOR'
  | 'TRI_BUFFER'
  | 'LED'
  | 'PROBE'
  | 'SEVEN_SEGMENT';

const evalNoOutputs: NodeEvaluatorFn = () => ({});

export const COMBINATIONAL_EVALUATORS: Record<CombinationalComponentType, NodeEvaluatorFn> = {
  CONST_HIGH: () => ({ OUT: '1' }),
  CONST_LOW: () => ({ OUT: '0' }),
  INPUT_SWITCH: (node) => ({ OUT: node.properties.switchState ?? '0' }),
  PUSH_BUTTON: (node) => ({ OUT: node.properties.switchState ?? '0' }),
  DIP_SWITCH_4: (node) => {
    const dip = node.properties.dipSwitchStates ?? ['0', '0', '0', '0'];
    return {
      Q0: dip[0] ?? '0',
      Q1: dip[1] ?? '0',
      Q2: dip[2] ?? '0',
      Q3: dip[3] ?? '0',
    };
  },
  CLOCK: (node, ctx) => ({ OUT: ctx.getPin(node.id, 'OUT') === '1' ? '1' : '0' }),
  BUFFER: (node, ctx) => ({ Y: logicBuffer(ctx.getPin(node.id, 'A')) }),
  NOT: (node, ctx) => ({ Y: logicNot(ctx.getPin(node.id, 'A')) }),
  SCHMITT_INV: (node, ctx) => ({ Y: logicNot(ctx.getPin(node.id, 'A')) }),
  AND: (node, ctx) => ({ Y: logicAnd([ctx.getPin(node.id, 'A'), ctx.getPin(node.id, 'B')]) }),
  OR: (node, ctx) => ({ Y: logicOr([ctx.getPin(node.id, 'A'), ctx.getPin(node.id, 'B')]) }),
  NAND: (node, ctx) => ({ Y: logicNand([ctx.getPin(node.id, 'A'), ctx.getPin(node.id, 'B')]) }),
  NOR: (node, ctx) => ({ Y: logicNor([ctx.getPin(node.id, 'A'), ctx.getPin(node.id, 'B')]) }),
  XOR: (node, ctx) => ({ Y: logicXor([ctx.getPin(node.id, 'A'), ctx.getPin(node.id, 'B')]) }),
  XNOR: (node, ctx) => ({ Y: logicXnor([ctx.getPin(node.id, 'A'), ctx.getPin(node.id, 'B')]) }),
  TRI_BUFFER: (node, ctx) => ({
    Y: logicTriStateBuffer(ctx.getPin(node.id, 'D'), ctx.getPin(node.id, 'EN')),
  }),
  LED: evalNoOutputs,
  PROBE: evalNoOutputs,
  SEVEN_SEGMENT: evalNoOutputs,
};
