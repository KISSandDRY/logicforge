import {
  evaluateAluSlice,
  evaluateComparator2Bit,
  evaluateDecoder2To4,
  evaluateMux4To1,
} from '../logicAlgebra';
import type { NodeEvaluatorFn } from './types';

export type MsiComponentType =
  'MUX_4TO1' | 'DECODER_2TO4' | 'COMPARATOR_2BIT' | 'ALU_4BIT' | 'CUSTOM_IC';

export const MSI_EVALUATORS: Record<MsiComponentType, NodeEvaluatorFn> = {
  MUX_4TO1: (node, ctx) => ({
    Y: evaluateMux4To1(
      [
        ctx.getPin(node.id, 'D0'),
        ctx.getPin(node.id, 'D1'),
        ctx.getPin(node.id, 'D2'),
        ctx.getPin(node.id, 'D3'),
      ],
      ctx.getPin(node.id, 'S0'),
      ctx.getPin(node.id, 'S1'),
    ),
  }),

  DECODER_2TO4: (node, ctx) =>
    evaluateDecoder2To4(
      ctx.getPin(node.id, 'A0'),
      ctx.getPin(node.id, 'A1'),
      ctx.getPin(node.id, 'EN'),
    ),

  COMPARATOR_2BIT: (node, ctx) =>
    evaluateComparator2Bit(
      ctx.getPin(node.id, 'A0'),
      ctx.getPin(node.id, 'A1'),
      ctx.getPin(node.id, 'B0'),
      ctx.getPin(node.id, 'B1'),
    ),

  ALU_4BIT: (node, ctx) => {
    const res = evaluateAluSlice(
      ctx.getPin(node.id, 'A0'),
      ctx.getPin(node.id, 'A1'),
      ctx.getPin(node.id, 'B0'),
      ctx.getPin(node.id, 'B1'),
      ctx.getPin(node.id, 'OP0'),
      ctx.getPin(node.id, 'OP1'),
    );
    return {
      F0: res.f0,
      F1: res.f1,
      CARRY: res.carry,
      ZERO: res.zero,
    };
  },

  CUSTOM_IC: (node, ctx) => ctx.evaluateCustomIc(node),
};
