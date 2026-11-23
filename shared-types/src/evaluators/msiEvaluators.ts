import {
  evaluateAluSlice,
  evaluateComparator2Bit,
  evaluateDecoder2To4,
  evaluateDemux1To4,
  evaluateEncoder4To2,
  evaluateFullAdder,
  evaluateMux2To1,
  evaluateMux4To1,
} from '../logicAlgebra';
import type { NodeEvaluatorFn } from './types';

export type MsiComponentType =
  | 'MUX_2TO1'
  | 'MUX_4TO1'
  | 'DEMUX_1TO4'
  | 'DECODER_2TO4'
  | 'ENCODER_4TO2'
  | 'FULL_ADDER'
  | 'COMPARATOR_2BIT'
  | 'ALU_4BIT'
  | 'CUSTOM_IC';

export const MSI_EVALUATORS: Record<MsiComponentType, NodeEvaluatorFn> = {
  MUX_2TO1: (node, ctx) => ({
    Y: evaluateMux2To1(
      ctx.getPin(node.id, 'D0'),
      ctx.getPin(node.id, 'D1'),
      ctx.getPin(node.id, 'S'),
    ),
  }),

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

  DEMUX_1TO4: (node, ctx) =>
    evaluateDemux1To4(
      ctx.getPin(node.id, 'D'),
      ctx.getPin(node.id, 'S0'),
      ctx.getPin(node.id, 'S1'),
    ),

  DECODER_2TO4: (node, ctx) =>
    evaluateDecoder2To4(
      ctx.getPin(node.id, 'A0'),
      ctx.getPin(node.id, 'A1'),
      ctx.getPin(node.id, 'EN'),
    ),

  ENCODER_4TO2: (node, ctx) =>
    evaluateEncoder4To2(
      ctx.getPin(node.id, 'D0'),
      ctx.getPin(node.id, 'D1'),
      ctx.getPin(node.id, 'D2'),
      ctx.getPin(node.id, 'D3'),
    ),

  FULL_ADDER: (node, ctx) =>
    evaluateFullAdder(
      ctx.getPin(node.id, 'A'),
      ctx.getPin(node.id, 'B'),
      ctx.getPin(node.id, 'CIN'),
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
