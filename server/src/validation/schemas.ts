import { z } from 'zod';
import {
  CIRCUIT_LIMITS,
  circuitDocumentSchema,
  circuitEdgeSchema,
  circuitNodeSchema,
  componentTypeSchema,
  customIcDefinitionSchema,
  customIcPinMappingSchema,
  logicStateSchema,
  pinDefinitionSchema,
  pinOffsetSchema,
} from '@logicforge/shared-types';

export {
  circuitDocumentSchema,
  circuitEdgeSchema,
  circuitNodeSchema,
  componentTypeSchema,
  customIcDefinitionSchema,
  customIcPinMappingSchema,
  logicStateSchema,
  pinDefinitionSchema,
  pinOffsetSchema,
};

export const idParamSchema = z
  .string()
  .trim()
  .min(1, 'Ідентифікатор не може бути порожнім')
  .max(128, 'Ідентифікатор занадто довгий')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Некоректний формат ідентифікатора');

export const versionParamSchema = z.coerce.number().int().min(1).max(100000);

export const listCircuitsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  mine: z.enum(['true', 'false']).optional(),
});

export const registerSchema = z.object({
  email: z.email('Некоректний формат email').max(254),
  username: z
    .string()
    .trim()
    .min(3, 'Логін має містити щонайменше 3 символи')
    .max(40, 'Логін не може перевищувати 40 символів')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Дозволені лише латинські літери, цифри, _, - та крапка'),
  fullName: z.string().trim().min(2).max(100),
  password: z.string().min(6, 'Пароль має містити щонайменше 6 символів').max(128),
});

export const loginSchema = z.object({
  email: z.email('Некоректний формат email').max(254),
  password: z.string().min(1).max(128),
});

export const saveCircuitRequestSchema = z.object({
  title: z.string().trim().min(1).max(CIRCUIT_LIMITS.MAX_TITLE_LENGTH),
  description: z.string().trim().max(CIRCUIT_LIMITS.MAX_DESCRIPTION_LENGTH).default(''),
  category: z.string().trim().min(1).max(100).default('Комбінаційні схеми'),
  isPublic: z.boolean().default(true),
  tags: z.array(z.string().trim().max(50)).max(CIRCUIT_LIMITS.MAX_TAGS).default([]),
  commitMessage: z.string().trim().min(1).max(300).optional(),
  schemaJson: circuitDocumentSchema,
});

export const createCustomIcRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(24),
  description: z.string().trim().max(1000).default(''),
  propagationDelayNs: z.number().finite().min(1).max(1000).default(15),
  isShared: z.boolean().default(true),
  inputPins: z.array(customIcPinMappingSchema).max(CIRCUIT_LIMITS.MAX_PINS_PER_NODE),
  outputPins: z.array(customIcPinMappingSchema).max(CIRCUIT_LIMITS.MAX_PINS_PER_NODE),
  internalCircuit: z.object({
    nodes: z.array(circuitNodeSchema).max(CIRCUIT_LIMITS.MAX_NODES),
    edges: z.array(circuitEdgeSchema).max(CIRCUIT_LIMITS.MAX_EDGES),
  }),
});

export const updateCustomIcRequestSchema = createCustomIcRequestSchema.partial();

export const simulateRequestSchema = z.object({
  circuitId: idParamSchema.optional(),
  document: circuitDocumentSchema,
  durationNs: z.number().finite().min(1).max(10000).default(200),
  maxTruthTableInputs: z.number().int().min(1).max(6).default(5),
});
