import { normalizeGateInput } from '../logicAlgebra';
import type { LogicState } from '../types';
import type { NodeEvaluatorContext, NodeEvaluatorFn } from './types';

export type SequentialComponentType =
  | 'SR_LATCH'
  | 'D_FLIPFLOP'
  | 'JK_FLIPFLOP'
  | 'T_FLIPFLOP'
  | 'REGISTER_4BIT'
  | 'SHIFT_REG_SIPO'
  | 'COUNTER_4BIT'
  | 'TIMER_555';

function readGateInput(
  ctx: NodeEvaluatorContext,
  nodeId: string,
  pinId: string,
  defaultOnZ: LogicState = '0',
): LogicState {
  const raw = ctx.getPin(nodeId, pinId);
  return raw === 'Z' ? defaultOnZ : normalizeGateInput(raw);
}

function complementaryOutput(q: LogicState): LogicState {
  return q === '1' ? '0' : q === '0' ? '1' : 'X';
}

function encode4BitOutputs(value: number): Record<'Q0' | 'Q1' | 'Q2' | 'Q3', LogicState> {
  return {
    Q0: (value & 1) !== 0 ? '1' : '0',
    Q1: (value & 2) !== 0 ? '1' : '0',
    Q2: (value & 4) !== 0 ? '1' : '0',
    Q3: (value & 8) !== 0 ? '1' : '0',
  };
}

export const SEQUENTIAL_EVALUATORS: Record<SequentialComponentType, NodeEvaluatorFn> = {
  SR_LATCH: (node, ctx) => {
    const mem = ctx.getMemory(node.id);
    const s = readGateInput(ctx, node.id, 'S');
    const r = readGateInput(ctx, node.id, 'R');
    if (s === 'X' || r === 'X' || (s === '1' && r === '1')) {
      mem.q = 'X';
      return { Q: 'X', NQ: 'X' };
    }
    if (s === '1' && r === '0') {
      mem.q = '1';
    } else if (s === '0' && r === '1') {
      mem.q = '0';
    }
    return { Q: mem.q, NQ: complementaryOutput(mem.q) };
  },

  D_FLIPFLOP: (node, ctx) => {
    const mem = ctx.getMemory(node.id);
    const d = readGateInput(ctx, node.id, 'D');
    const clk = readGateInput(ctx, node.id, 'CLK');
    const clr = readGateInput(ctx, node.id, 'CLR');

    if (clr === '1') {
      mem.q = '0';
    } else if (mem.prevClk === '0' && clk === '1') {
      mem.q = d;
    }
    mem.prevClk = clk;
    return { Q: mem.q, NQ: complementaryOutput(mem.q) };
  },

  JK_FLIPFLOP: (node, ctx) => {
    const mem = ctx.getMemory(node.id);
    const j = readGateInput(ctx, node.id, 'J');
    const k = readGateInput(ctx, node.id, 'K');
    const clk = readGateInput(ctx, node.id, 'CLK');
    const clr = readGateInput(ctx, node.id, 'CLR');

    if (clr === '1') {
      mem.q = '0';
    } else if (mem.prevClk === '0' && clk === '1') {
      if (j === 'X' || k === 'X') {
        mem.q = 'X';
      } else if (j === '0' && k === '1') {
        mem.q = '0';
      } else if (j === '1' && k === '0') {
        mem.q = '1';
      } else if (j === '1' && k === '1') {
        mem.q = complementaryOutput(mem.q);
      }
    }
    mem.prevClk = clk;
    return { Q: mem.q, NQ: complementaryOutput(mem.q) };
  },

  T_FLIPFLOP: (node, ctx) => {
    const mem = ctx.getMemory(node.id);
    const t = readGateInput(ctx, node.id, 'T');
    const clk = readGateInput(ctx, node.id, 'CLK');
    const clr = readGateInput(ctx, node.id, 'CLR');

    if (clr === '1') {
      mem.q = '0';
    } else if (mem.prevClk === '0' && clk === '1') {
      if (t === 'X') {
        mem.q = 'X';
      } else if (t === '1') {
        mem.q = mem.q === '1' ? '0' : '1';
      }
    }
    mem.prevClk = clk;
    return { Q: mem.q, NQ: complementaryOutput(mem.q) };
  },

  REGISTER_4BIT: (node, ctx) => {
    const mem = ctx.getMemory(node.id);
    const clk = readGateInput(ctx, node.id, 'CLK');
    const load = readGateInput(ctx, node.id, 'LOAD', '1');
    const clr = readGateInput(ctx, node.id, 'CLR');

    if (clr === '1') {
      mem.counterValue = 0;
    } else if (mem.prevClk === '0' && clk === '1' && load === '1') {
      const d0 = ctx.getPin(node.id, 'D0') === '1' ? 1 : 0;
      const d1 = ctx.getPin(node.id, 'D1') === '1' ? 2 : 0;
      const d2 = ctx.getPin(node.id, 'D2') === '1' ? 4 : 0;
      const d3 = ctx.getPin(node.id, 'D3') === '1' ? 8 : 0;
      mem.counterValue = d0 | d1 | d2 | d3;
    }
    mem.prevClk = clk;
    return encode4BitOutputs(mem.counterValue);
  },

  SHIFT_REG_SIPO: (node, ctx) => {
    const mem = ctx.getMemory(node.id);
    const clk = readGateInput(ctx, node.id, 'CLK');
    const ser = readGateInput(ctx, node.id, 'SER');
    const clr = readGateInput(ctx, node.id, 'CLR');

    if (clr === '1') {
      mem.counterValue = 0;
    } else if (mem.prevClk === '0' && clk === '1') {
      const inBit = ser === '1' ? 1 : 0;
      mem.counterValue = ((mem.counterValue << 1) | inBit) & 0x0f;
    }
    mem.prevClk = clk;
    return encode4BitOutputs(mem.counterValue);
  },

  COUNTER_4BIT: (node, ctx) => {
    const mem = ctx.getMemory(node.id);
    const clk = readGateInput(ctx, node.id, 'CLK');
    const en = readGateInput(ctx, node.id, 'EN', '1');
    const rst = readGateInput(ctx, node.id, 'RST');

    if (rst === '1') {
      mem.counterValue = 0;
    } else if (mem.prevClk === '0' && clk === '1' && en === '1') {
      mem.counterValue = (mem.counterValue + 1) & 0x0f;
    }
    mem.prevClk = clk;
    const v = mem.counterValue;
    return {
      ...encode4BitOutputs(v),
      CO: v === 15 && en === '1' ? '1' : '0',
    };
  },

  TIMER_555: (node, ctx) => {
    const mem = ctx.getMemory(node.id);
    const rstRaw = ctx.getPin(node.id, 'RESET');
    if (rstRaw === '0') {
      mem.q = '0';
      mem.timerPhase = 'LOW';
      return { OUT: '0', DISCH: '0' };
    }

    const trig = ctx.getPin(node.id, 'TRIG');
    const thres = ctx.getPin(node.id, 'THRES');
    if (trig === '0' && thres !== '1') {
      mem.q = '1';
      mem.timerPhase = 'HIGH';
    } else if (thres === '1' && trig !== '0') {
      mem.q = '0';
      mem.timerPhase = 'LOW';
    }
    const out: LogicState = mem.q === '1' ? '1' : '0';
    const disch: LogicState = out === '1' ? 'Z' : '0';
    return { OUT: out, DISCH: disch };
  },
};
