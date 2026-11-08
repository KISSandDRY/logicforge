import type {
  CircuitDetailDTO,
  CircuitDocument,
  CircuitRevisionDTO,
  CircuitSummaryDTO,
  CustomICDefinition,
  UserDTO,
} from '@logicforge/shared-types';

export interface StoredUserRecord extends UserDTO {
  passwordHash: string;
}

export interface CreateCircuitInput {
  title: string;
  description: string;
  category: string;
  isPublic: boolean;
  tags: string[];
  schemaJson: CircuitDocument;
  criticalPathNs: number;
  maxClockMhz: number;
  authorId: string;
  commitMessage?: string;
  forkedFromId?: string;
}

export interface UpdateCircuitInput {
  title: string;
  description: string;
  category: string;
  isPublic: boolean;
  tags: string[];
  schemaJson: CircuitDocument;
  criticalPathNs: number;
  maxClockMhz: number;
  editorUserId: string;
  commitMessage?: string;
}

export interface SimulationRunRecord {
  id: string;
  circuitId: string;
  executedById?: string;
  durationSimNs: number;
  processedEvents: number;
  criticalPathNs: number;
  status: 'STABLE' | 'RUNNING' | 'OSCILLATION_GUARD' | 'BUS_CONFLICT';
  createdAt: string;
}

export interface IStorageRepository {
  readonly driverName: 'postgresql-prisma' | 'embedded-json';

  findUserByEmail(email: string): Promise<StoredUserRecord | null>;
  findUserByUsername(username: string): Promise<StoredUserRecord | null>;
  findUserById(id: string): Promise<StoredUserRecord | null>;
  createUser(data: {
    email: string;
    username: string;
    fullName: string;
    passwordHash: string;
    role?: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
  }): Promise<StoredUserRecord>;

  listCircuits(filter?: {
    search?: string;
    category?: string;
    authorId?: string;
    viewerUserId?: string;
  }): Promise<CircuitSummaryDTO[]>;
  getCircuitById(id: string): Promise<CircuitDetailDTO | null>;
  createCircuit(input: CreateCircuitInput): Promise<CircuitDetailDTO>;
  updateCircuit(id: string, input: UpdateCircuitInput): Promise<CircuitDetailDTO | null>;
  deleteCircuit(id: string): Promise<boolean>;

  listRevisions(circuitId: string): Promise<CircuitRevisionDTO[]>;
  getRevision(circuitId: string, versionNumber: number): Promise<CircuitRevisionDTO | null>;
  restoreRevision(
    circuitId: string,
    versionNumber: number,
    userId: string,
  ): Promise<CircuitDetailDTO | null>;

  listCustomComponents(viewerUserId?: string): Promise<CustomICDefinition[]>;
  createCustomComponent(
    authorId: string,
    def: Omit<CustomICDefinition, 'id'>,
    isShared: boolean,
  ): Promise<CustomICDefinition>;
  deleteCustomComponent(id: string, userId: string): Promise<boolean>;

  recordSimulationRun(
    input: Omit<SimulationRunRecord, 'id' | 'createdAt'>,
  ): Promise<SimulationRunRecord>;
  listSimulationRuns(circuitId: string): Promise<SimulationRunRecord[]>;
}
