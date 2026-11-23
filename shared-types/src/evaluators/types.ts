import type { CircuitNodeData, LogicState } from '../types';

export interface InternalSequentialState {
  q: LogicState;
  prevClk: LogicState;
  counterValue: number;
  timerPhase: 'HIGH' | 'LOW';
  nextTimerToggleNs: number;
}

export interface NodeEvaluatorContext {
  getPin: (nodeId: string, pinId: string) => LogicState;
  getMemory: (nodeId: string) => InternalSequentialState;
  evaluateCustomIc: (node: CircuitNodeData) => Record<string, LogicState>;
}

export type NodeEvaluatorFn = (
  node: CircuitNodeData,
  ctx: NodeEvaluatorContext,
) => Record<string, LogicState>;
