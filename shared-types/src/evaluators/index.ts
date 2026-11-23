import type { ComponentType } from '../types';
import { COMBINATIONAL_EVALUATORS } from './combinationalEvaluators';
import { MSI_EVALUATORS } from './msiEvaluators';
import { SEQUENTIAL_EVALUATORS } from './sequentialEvaluators';
import type { NodeEvaluatorFn } from './types';

export type { InternalSequentialState, NodeEvaluatorContext, NodeEvaluatorFn } from './types';

/**
 * Повний типізований реєстр функцій обчислення виходів компонентів.
 * TypeScript гарантує на етапі компіляції наявність обробника для кожного типу з COMPONENT_TYPES.
 */
export const NODE_EVALUATORS: Record<ComponentType, NodeEvaluatorFn> = {
  ...COMBINATIONAL_EVALUATORS,
  ...SEQUENTIAL_EVALUATORS,
  ...MSI_EVALUATORS,
};
