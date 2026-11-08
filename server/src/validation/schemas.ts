import { z } from 'zod';

export const logicStateSchema = z.enum(['0', '1', 'Z', 'X']);

export const pinOffsetSchema = z.object({
  x: z.number(),
  y: z.number(),
  side: z.enum(['LEFT', 'RIGHT', 'TOP', 'BOTTOM']),
});

export const pinDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  direction: z.enum(['INPUT', 'OUTPUT']),
  offset: pinOffsetSchema,
  inverted: z.boolean().optional(),
  clockEdge: z.boolean().optional(),
  state: logicStateSchema,
});

export const circuitNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'INPUT_SWITCH',
    'PUSH_BUTTON',
    'CLOCK',
    'CONST_HIGH',
    'CONST_LOW',
    'AND',
    'OR',
    'NOT',
    'NAND',
    'NOR',
    'XOR',
    'XNOR',
    'TRI_BUFFER',
    'SR_LATCH',
    'D_FLIPFLOP',
    'JK_FLIPFLOP',
    'COUNTER_4BIT',
    'TIMER_555',
    'MUX_4TO1',
    'ALU_4BIT',
    'CUSTOM_IC',
    'LED',
    'PROBE',
    'SEVEN_SEGMENT',
  ]),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  width: z.number().positive(),
  height: z.number().positive(),
  pins: z.array(pinDefinitionSchema),
  properties: z
    .object({
      label: z.string(),
      propagationDelayNs: z.number().min(0).max(10000),
      switchState: logicStateSchema.optional(),
      frequencyHz: z.number().optional(),
      halfPeriodNs: z.number().optional(),
      resistanceR1Ohms: z.number().optional(),
      resistanceR2Ohms: z.number().optional(),
      capacitanceUf: z.number().optional(),
      astableAutoTrigger: z.boolean().optional(),
      ledColor: z.enum(['emerald', 'red', 'amber', 'cyan', 'violet']).optional(),
      customIcId: z.string().optional(),
      notes: z.string().optional(),
    })
    .passthrough(),
});

export const circuitEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  sourcePinId: z.string().min(1),
  targetNodeId: z.string().min(1),
  targetPinId: z.string().min(1),
  signalState: logicStateSchema,
  waypoints: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
});

export const circuitDocumentSchema = z.object({
  metadata: z.object({
    schemaVersion: z.literal('1.0.0'),
    title: z.string().min(1).max(200),
    description: z.string().max(2000),
    category: z.string().min(1).max(100),
    tags: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  viewport: z.object({
    panX: z.number(),
    panY: z.number(),
    zoom: z.number().min(0.1).max(5),
    gridSnap: z.boolean(),
  }),
  nodes: z.array(circuitNodeSchema),
  edges: z.array(circuitEdgeSchema),
  customDefinitions: z.array(z.any()).optional(),
});

export const registerSchema = z.object({
  email: z.string().email('Некоректний формат email'),
  username: z.string().min(3).max(40),
  fullName: z.string().min(2).max(100),
  password: z.string().min(6, 'Пароль має містити щонайменше 6 символів'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const saveCircuitRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  category: z.string().min(1).max(100).default('Комбінаційні схеми'),
  isPublic: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  commitMessage: z.string().min(1).max(300).optional(),
  schemaJson: circuitDocumentSchema,
});

export const createCustomIcRequestSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(24),
  description: z.string().max(1000).default(''),
  propagationDelayNs: z.number().min(1).max(1000).default(15),
  isShared: z.boolean().default(true),
  inputPins: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      mappedNodeId: z.string().min(1),
    }),
  ),
  outputPins: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      mappedNodeId: z.string().min(1),
    }),
  ),
  internalCircuit: z.object({
    nodes: z.array(circuitNodeSchema),
    edges: z.array(circuitEdgeSchema),
  }),
});

export const simulateRequestSchema = z.object({
  circuitId: z.string().optional(),
  document: circuitDocumentSchema,
  durationNs: z.number().min(1).max(10000).default(200),
  maxTruthTableInputs: z.number().min(1).max(6).default(5),
});
