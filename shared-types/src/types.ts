/**
 * Чотиризначна (тристабільна розширена за IEEE 1164 / Kleene) логічна алгебра:
 * - '0' : Логічний нуль (LOW, GND)
 * - '1' : Логічна одиниця (HIGH, VCC)
 * - 'Z' : Високоімпедансний стан (High-Z, третій стан тристабільного буфера або обрив лінії)
 * - 'X' : Колізія шини / невизначений стан (Error / Conflict при одночасній подачі 0 і 1)
 */
export type LogicState = '0' | '1' | 'Z' | 'X';

export type PinDirection = 'INPUT' | 'OUTPUT';

export type ComponentCategory = 'INPUTS' | 'GATES' | 'SEQUENTIAL' | 'MICROPROCESSOR' | 'OUTPUTS';

export type ComponentType =
  | 'INPUT_SWITCH'
  | 'PUSH_BUTTON'
  | 'CLOCK'
  | 'CONST_HIGH'
  | 'CONST_LOW'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'NAND'
  | 'NOR'
  | 'XOR'
  | 'XNOR'
  | 'TRI_BUFFER'
  | 'SR_LATCH'
  | 'D_FLIPFLOP'
  | 'JK_FLIPFLOP'
  | 'COUNTER_4BIT'
  | 'TIMER_555'
  | 'MUX_4TO1'
  | 'ALU_4BIT'
  | 'CUSTOM_IC'
  | 'LED'
  | 'PROBE'
  | 'SEVEN_SEGMENT';

/**
 * Геометричне зміщення виводу (піна) відносно верхнього лівого кута корпусу елемента.
 */
export interface PinOffset {
  x: number;
  y: number;
  side: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
}

export interface PinDefinition {
  id: string;
  name: string;
  direction: PinDirection;
  offset: PinOffset;
  inverted?: boolean;
  clockEdge?: boolean;
  state: LogicState;
}

export interface NodeProperties {
  label: string;
  propagationDelayNs: number;
  /** Початковий або поточний стан перемикача ('0' | '1' | 'Z') */
  switchState?: LogicState;
  /** Частота тактового генератора в Гц (візуальна) та напівперіод у нс (модельний) */
  frequencyHz?: number;
  halfPeriodNs?: number;
  /** Параметри RC-кола інтегрального таймера NE555 */
  resistanceR1Ohms?: number;
  resistanceR2Ohms?: number;
  capacitanceUf?: number;
  astableAutoTrigger?: boolean;
  /** Колір індикатора світлодіода */
  ledColor?: 'emerald' | 'red' | 'amber' | 'cyan' | 'violet';
  /** Посилання на шаблон користувацької мікросхеми (Custom IC) */
  customIcId?: string;
  /** Нотатка інженера до вузла */
  notes?: string;
}

export interface CircuitNodeData {
  id: string;
  type: ComponentType;
  position: {
    x: number;
    y: number;
  };
  rotation?: 0 | 90 | 180 | 270;
  width: number;
  height: number;
  pins: PinDefinition[];
  properties: NodeProperties;
}

export interface CircuitEdgeData {
  id: string;
  sourceNodeId: string;
  sourcePinId: string;
  targetNodeId: string;
  targetPinId: string;
  signalState: LogicState;
  waypoints?: Array<{ x: number; y: number }>;
}

export interface CircuitViewport {
  panX: number;
  panY: number;
  zoom: number;
  gridSnap: boolean;
}

export interface CircuitMetadata {
  schemaVersion: '1.0.0';
  title: string;
  description: string;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Канонічна специфікація серіалізації цифрової схеми у форматі JSON.
 */
export interface CircuitDocument {
  metadata: CircuitMetadata;
  viewport: CircuitViewport;
  nodes: CircuitNodeData[];
  edges: CircuitEdgeData[];
  customDefinitions?: CustomICDefinition[];
}

export interface CustomICDefinition {
  id: string;
  name: string;
  code: string;
  description: string;
  propagationDelayNs: number;
  inputPins: Array<{ id: string; name: string; mappedNodeId: string }>;
  outputPins: Array<{ id: string; name: string; mappedNodeId: string }>;
  internalCircuit: {
    nodes: CircuitNodeData[];
    edges: CircuitEdgeData[];
  };
}

export interface ComponentCatalogItem {
  type: ComponentType;
  name: string;
  shortLabel: string;
  category: ComponentCategory;
  description: string;
  defaultWidth: number;
  defaultHeight: number;
  defaultDelayNs: number;
  isSequential: boolean;
  formulaLatex?: string;
  defaultPins: Array<Omit<PinDefinition, 'state'>>;
}

export interface SimulationEvent {
  timestampNs: number;
  sequence: number;
  nodeId: string;
  pinId: string;
  newState: LogicState;
  reason?: string;
}

export interface ElectricalNet {
  netId: string;
  driverPins: Array<{ nodeId: string; pinId: string }>;
  loadPins: Array<{ nodeId: string; pinId: string }>;
  edgeIds: string[];
  resolvedState: LogicState;
  hasConflict: boolean;
}

export interface StaticTimingReport {
  isCombinationalAcyclic: boolean;
  topologicalOrder: string[];
  stronglyConnectedCycles: string[][];
  criticalPathNodes: string[];
  criticalPathDelayNs: number;
  maxClockFrequencyMhz: number;
  arrivalTimesNs: Record<string, number>;
}

export interface WaveformSample {
  timeNs: number;
  signals: Record<string, LogicState>;
}

export interface SimulationSnapshot {
  currentTimeNs: number;
  processedEventsCount: number;
  pendingEventsCount: number;
  status: 'STABLE' | 'RUNNING' | 'OSCILLATION_GUARD' | 'BUS_CONFLICT';
  nodePinStates: Record<string, Record<string, LogicState>>;
  edgeStates: Record<string, LogicState>;
  internalMemory: Record<string, Record<string, string | number | boolean>>;
  activeConflicts: string[];
  warnings: string[];
}

export interface TruthTableRow {
  inputs: Record<string, LogicState>;
  outputs: Record<string, LogicState>;
}

export interface TruthTableResult {
  inputLabels: Array<{ nodeId: string; label: string }>;
  outputLabels: Array<{ nodeId: string; label: string }>;
  rows: TruthTableRow[];
  canonicalSopExpressions: Record<string, string>;
  truncated: boolean;
}

export interface BomItem {
  type: ComponentType;
  name: string;
  category: ComponentCategory;
  quantity: number;
  designators: string[];
  unitDelayNs: number;
}

export interface NetlistEntry {
  netId: string;
  drivers: string[];
  loads: string[];
  currentState: LogicState;
}

export interface EngineeringReport {
  generatedAt: string;
  circuitTitle: string;
  category: string;
  totalNodes: number;
  totalEdges: number;
  totalNets: number;
  bom: BomItem[];
  netlist: NetlistEntry[];
  timing: StaticTimingReport;
  truthTable?: TruthTableResult;
}

export interface UserDTO {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
  createdAt: string;
}

export interface AuthResponseDTO {
  token: string;
  user: UserDTO;
}

export interface CircuitSummaryDTO {
  id: string;
  title: string;
  description: string;
  category: string;
  isPublic: boolean;
  tags: string[];
  nodeCount: number;
  edgeCount: number;
  criticalPathNs: number;
  maxClockMhz: number;
  authorName: string;
  authorId: string;
  updatedAt: string;
  createdAt: string;
}

export interface CircuitDetailDTO extends CircuitSummaryDTO {
  schemaJson: CircuitDocument;
}

export interface CircuitRevisionDTO {
  id: string;
  circuitId: string;
  versionNumber: number;
  commitMessage: string;
  nodeCount: number;
  edgeCount: number;
  authorName: string;
  createdAt: string;
  schemaJson?: CircuitDocument;
}
