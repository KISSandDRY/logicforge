import { z } from 'zod';
import { getCatalogItem, normalizeCircuitNodesWithCatalog } from './catalog';
import {
  COMPONENT_TYPES,
  type CircuitDocument,
  type CircuitSummaryDTO,
  type ComponentType,
  type CustomICDefinition,
  type UserDTO,
} from './types';

export const CIRCUIT_LIMITS = {
  MAX_JSON_BYTES: 1_048_576, // 1 MiB
  MAX_NODES: 250,
  MAX_EDGES: 600,
  MAX_PINS_PER_NODE: 32,
  MAX_WAYPOINTS_PER_EDGE: 64,
  MAX_CUSTOM_DEFS: 50,
  MAX_TAGS: 20,
  MAX_LABEL_LENGTH: 80,
  MAX_TITLE_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_OBJECT_DEPTH: 24,
} as const;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class CircuitImportValidationError extends Error {
  public readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = 'CircuitImportValidationError';
    this.issues = issues;
  }
}

export function stripControlChars(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // Allow printable characters, tab (9), LF (10), CR (13)
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      out += input[i];
    }
  }
  return out;
}

/**
 * Рекурсивно очищає довільний JSON-об'єкт від небезпечних ключів прототипного забруднення
 * (`__proto__`, `constructor`, `prototype`) та керуючих ASCII-символів.
 */
export function stripUnsafeKeys(value: unknown, depth = 0): unknown {
  if (depth > CIRCUIT_LIMITS.MAX_OBJECT_DEPTH) {
    throw new CircuitImportValidationError('Перевищено допустиму глибину вкладеності JSON.');
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return typeof value === 'number' && !Number.isFinite(value) ? 0 : value;
  }
  if (typeof value === 'string') {
    return stripControlChars(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUnsafeKeys(item, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) {
        continue;
      }
      const cleaned = stripUnsafeKeys((value as Record<string, unknown>)[key], depth + 1);
      Object.defineProperty(result, key, {
        value: cleaned,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  }
  return undefined;
}

export const logicStateSchema = z.enum(['0', '1', 'Z', 'X']);

export const componentTypeSchema = z.enum(COMPONENT_TYPES);

export const pinOffsetSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  side: z.enum(['LEFT', 'RIGHT', 'TOP', 'BOTTOM']),
});

export const pinDefinitionSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  direction: z.enum(['INPUT', 'OUTPUT']),
  offset: pinOffsetSchema,
  inverted: z.boolean().optional(),
  clockEdge: z.boolean().optional(),
  state: logicStateSchema,
});

export const circuitNodeSchema = z.object({
  id: z.string().min(1).max(128),
  type: componentTypeSchema,
  position: z.object({
    x: z.number().finite().min(-50000).max(50000),
    y: z.number().finite().min(-50000).max(50000),
  }),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  width: z.number().finite().positive().max(2000),
  height: z.number().finite().positive().max(2000),
  pins: z.array(pinDefinitionSchema).max(CIRCUIT_LIMITS.MAX_PINS_PER_NODE),
  properties: z.looseObject({
    label: z.string().max(CIRCUIT_LIMITS.MAX_LABEL_LENGTH),
    propagationDelayNs: z.number().finite().min(0).max(10000),
    switchState: logicStateSchema.optional(),
    dipSwitchStates: z
      .tuple([logicStateSchema, logicStateSchema, logicStateSchema, logicStateSchema])
      .optional(),
    frequencyHz: z.number().finite().min(0).max(1000).optional(),
    halfPeriodNs: z.number().finite().min(1).max(100000).optional(),
    resistanceR1Ohms: z.number().finite().min(1).max(10000000).optional(),
    resistanceR2Ohms: z.number().finite().min(1).max(10000000).optional(),
    capacitanceUf: z.number().finite().min(0.0001).max(10000).optional(),
    astableAutoTrigger: z.boolean().optional(),
    ledColor: z.enum(['emerald', 'red', 'amber', 'cyan', 'violet']).optional(),
    customIcId: z.string().max(128).optional(),
    notes: z.string().max(1000).optional(),
  }),
});

export const circuitEdgeSchema = z.object({
  id: z.string().min(1).max(128),
  sourceNodeId: z.string().min(1).max(128),
  sourcePinId: z.string().min(1).max(64),
  targetNodeId: z.string().min(1).max(128),
  targetPinId: z.string().min(1).max(64),
  signalState: logicStateSchema,
  waypoints: z
    .array(
      z.object({
        x: z.number().finite().min(-50000).max(50000),
        y: z.number().finite().min(-50000).max(50000),
      }),
    )
    .max(CIRCUIT_LIMITS.MAX_WAYPOINTS_PER_EDGE)
    .optional(),
});

export const customIcPinMappingSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  mappedNodeId: z.string().min(1).max(128),
});

export const customIcDefinitionSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(32),
  description: z.string().max(CIRCUIT_LIMITS.MAX_DESCRIPTION_LENGTH),
  propagationDelayNs: z.number().finite().min(0).max(10000),
  inputPins: z.array(customIcPinMappingSchema).max(CIRCUIT_LIMITS.MAX_PINS_PER_NODE),
  outputPins: z.array(customIcPinMappingSchema).max(CIRCUIT_LIMITS.MAX_PINS_PER_NODE),
  internalCircuit: z.object({
    nodes: z.array(circuitNodeSchema).max(CIRCUIT_LIMITS.MAX_NODES),
    edges: z.array(circuitEdgeSchema).max(CIRCUIT_LIMITS.MAX_EDGES),
  }),
});

export const circuitDocumentSchema = z.object({
  metadata: z.object({
    schemaVersion: z.literal('1.0.0'),
    title: z.string().min(1).max(CIRCUIT_LIMITS.MAX_TITLE_LENGTH),
    description: z.string().max(CIRCUIT_LIMITS.MAX_DESCRIPTION_LENGTH),
    category: z.string().min(1).max(100),
    tags: z.array(z.string().max(50)).max(CIRCUIT_LIMITS.MAX_TAGS),
    createdAt: z.string().max(64),
    updatedAt: z.string().max(64),
  }),
  viewport: z.object({
    panX: z.number().finite().min(-100000).max(100000),
    panY: z.number().finite().min(-100000).max(100000),
    zoom: z.number().finite().min(0.1).max(5),
    gridSnap: z.boolean(),
  }),
  nodes: z.array(circuitNodeSchema).max(CIRCUIT_LIMITS.MAX_NODES),
  edges: z.array(circuitEdgeSchema).max(CIRCUIT_LIMITS.MAX_EDGES),
  customDefinitions: z
    .array(customIcDefinitionSchema)
    .max(CIRCUIT_LIMITS.MAX_CUSTOM_DEFS)
    .optional(),
});

export interface SanitizeCircuitOptions {
  maxBytes?: number;
  maxNodes?: number;
  maxEdges?: number;
  strictPinRefs?: boolean;
}

/**
 * Валідує та очищає JSON-документ цифрової схеми:
 * - обмежує розмір файлу й максимальну кількість вузлів/з'єднань (захист від DoS);
 * - видаляє ключі прототипного забруднення (`__proto__`, `constructor`, `prototype`);
 * - перевіряє цілісність посилань усіх виводів `edges` на наявні `nodes` та їхні `pins`.
 */
export function sanitizeAndValidateCircuitDocument(
  rawInput: unknown,
  options?: SanitizeCircuitOptions,
): CircuitDocument {
  const maxBytes = options?.maxBytes ?? CIRCUIT_LIMITS.MAX_JSON_BYTES;
  const maxNodes = options?.maxNodes ?? CIRCUIT_LIMITS.MAX_NODES;
  const maxEdges = options?.maxEdges ?? CIRCUIT_LIMITS.MAX_EDGES;
  const strictPinRefs = options?.strictPinRefs ?? true;

  let parsedRaw: unknown = rawInput;
  if (typeof rawInput === 'string') {
    const byteLen = new TextEncoder().encode(rawInput).length;
    if (byteLen > maxBytes) {
      throw new CircuitImportValidationError(
        `Розмір JSON перевищує дозволений ліміт (${Math.round(maxBytes / 1024)} КБ).`,
      );
    }
    try {
      parsedRaw = JSON.parse(rawInput);
    } catch {
      throw new CircuitImportValidationError(
        'Некоректний синтаксис JSON. Перевірте структуру файлу.',
      );
    }
  }

  const sanitizedRaw = stripUnsafeKeys(parsedRaw);
  const res = circuitDocumentSchema.safeParse(sanitizedRaw);
  if (!res.success) {
    const issues = res.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`);
    throw new CircuitImportValidationError('Некоректна структура документа схеми JSON.', issues);
  }

  const doc = res.data as CircuitDocument;
  if (doc.nodes.length > maxNodes) {
    throw new CircuitImportValidationError(
      `Перевищено ліміт елементів у схемі (максимум ${maxNodes}).`,
    );
  }
  if (doc.edges.length > maxEdges) {
    throw new CircuitImportValidationError(
      `Перевищено ліміт провідників у схемі (максимум ${maxEdges}).`,
    );
  }

  const normalized = normalizeCircuitNodesWithCatalog(doc);

  if (strictPinRefs) {
    const pinLookup = new Map<string, Set<string>>();
    for (const node of normalized.nodes) {
      const validIds = new Set<string>();
      if (node.type !== 'CUSTOM_IC') {
        const meta = getCatalogItem(node.type as ComponentType);
        meta.defaultPins.forEach((p) => validIds.add(p.id));
      } else {
        node.pins.forEach((p) => validIds.add(p.id));
      }
      pinLookup.set(node.id, validIds);
    }

    for (const edge of normalized.edges) {
      const srcPins = pinLookup.get(edge.sourceNodeId);
      const dstPins = pinLookup.get(edge.targetNodeId);
      if (!srcPins || !srcPins.has(edge.sourcePinId)) {
        throw new CircuitImportValidationError(
          `З'єднання ${edge.id} посилається на неіснуючий вивід джерела ${edge.sourceNodeId}.${edge.sourcePinId}.`,
        );
      }
      if (!dstPins || !dstPins.has(edge.targetPinId)) {
        throw new CircuitImportValidationError(
          `З'єднання ${edge.id} посилається на неіснуючий вивід приймача ${edge.targetNodeId}.${edge.targetPinId}.`,
        );
      }
    }
  }

  return normalized;
}

const storedUserSchema = z.object({
  id: z.string().min(1).max(128),
  email: z.email(),
  username: z.string().min(1).max(64),
  fullName: z.string().min(1).max(120),
  role: z.enum(['STUDENT', 'INSTRUCTOR', 'ADMIN']),
  createdAt: z.string().max(64),
});

const storedSummarySchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(CIRCUIT_LIMITS.MAX_TITLE_LENGTH),
  description: z.string().max(CIRCUIT_LIMITS.MAX_DESCRIPTION_LENGTH),
  category: z.string().min(1).max(100),
  isPublic: z.boolean(),
  tags: z.array(z.string().max(50)).max(CIRCUIT_LIMITS.MAX_TAGS),
  nodeCount: z.number().int().min(0).max(CIRCUIT_LIMITS.MAX_NODES),
  edgeCount: z.number().int().min(0).max(CIRCUIT_LIMITS.MAX_EDGES),
  criticalPathNs: z.number().finite().min(0),
  maxClockMhz: z.number().finite().min(0),
  authorName: z.string().max(120),
  authorId: z.string().max(128),
  updatedAt: z.string().max(64),
  createdAt: z.string().max(64),
});

export function safeParseUserDto(raw: string | null): UserDTO | null {
  if (!raw) return null;
  try {
    const cleaned = stripUnsafeKeys(JSON.parse(raw));
    const res = storedUserSchema.safeParse(cleaned);
    return res.success ? res.data : null;
  } catch {
    return null;
  }
}

export function safeParseCustomIcList(raw: string | null): CustomICDefinition[] {
  if (!raw) return [];
  try {
    const cleaned = stripUnsafeKeys(JSON.parse(raw));
    const res = z
      .array(customIcDefinitionSchema)
      .max(CIRCUIT_LIMITS.MAX_CUSTOM_DEFS)
      .safeParse(cleaned);
    return res.success ? (res.data as CustomICDefinition[]) : [];
  } catch {
    return [];
  }
}

export function safeParseCircuitSummaryList(raw: string | null): CircuitSummaryDTO[] {
  if (!raw) return [];
  try {
    const cleaned = stripUnsafeKeys(JSON.parse(raw));
    const res = z.array(storedSummarySchema).max(200).safeParse(cleaned);
    return res.success ? (res.data as CircuitSummaryDTO[]) : [];
  } catch {
    return [];
  }
}
