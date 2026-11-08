import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import {
  PRESET_CIRCUITS,
  analyzeCircuitGraph,
  createNodeFromCatalog,
  type CircuitDetailDTO,
  type CircuitDocument,
  type CircuitRevisionDTO,
  type CircuitSummaryDTO,
  type CustomICDefinition,
} from '@logicforge/shared-types';
import type {
  CreateCircuitInput,
  IStorageRepository,
  SimulationRunRecord,
  StoredUserRecord,
  UpdateCircuitInput,
} from './types';

interface EmbeddedStoreData {
  users: StoredUserRecord[];
  circuits: Array<CircuitDetailDTO & { forkedFromId?: string }>;
  revisions: Array<CircuitRevisionDTO & { createdById: string }>;
  customComponents: Array<{
    authorId: string;
    isShared: boolean;
    definition: CustomICDefinition;
  }>;
  simulationRuns: SimulationRunRecord[];
}

export class EmbeddedRepository implements IStorageRepository {
  public readonly driverName = 'embedded-json' as const;
  private store: EmbeddedStoreData;
  private readonly persistFilePath: string | null;

  constructor(options?: { inMemoryOnly?: boolean; filePath?: string }) {
    const inMemory = options?.inMemoryOnly ?? process.env.NODE_ENV === 'test';
    this.persistFilePath = inMemory
      ? null
      : (options?.filePath ?? path.resolve(process.cwd(), '.data', 'dev-store.json'));

    if (this.persistFilePath && fs.existsSync(this.persistFilePath)) {
      try {
        const raw = fs.readFileSync(this.persistFilePath, 'utf8');
        this.store = JSON.parse(raw) as EmbeddedStoreData;
        return;
      } catch {
        // Fallback to fresh seed if file is corrupted
      }
    }

    this.store = this.createSeededStore();
    this.flush();
  }

  private flush(): void {
    if (!this.persistFilePath) return;
    const dir = path.dirname(this.persistFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.persistFilePath, JSON.stringify(this.store, null, 2), 'utf8');
  }

  private createSeededStore(): EmbeddedStoreData {
    const demoUserId = 'u-demo-lpnu-001';
    const passwordHash = bcrypt.hashSync('DemoPass123!', 8);
    const now = '2026-11-06T12:00:00.000Z';

    const demoUser: StoredUserRecord = {
      id: demoUserId,
      email: 'student@lpnu.ua',
      username: 'lpnu_engineer',
      fullName: 'Студент Кафедри АСУ',
      role: 'STUDENT',
      passwordHash,
      createdAt: now,
    };

    const circuits: Array<CircuitDetailDTO & { forkedFromId?: string }> = [];
    const revisions: Array<CircuitRevisionDTO & { createdById: string }> = [];

    for (const preset of PRESET_CIRCUITS) {
      const timing = analyzeCircuitGraph(preset.document);
      const cid = preset.id;
      const clonedDoc = JSON.parse(JSON.stringify(preset.document)) as CircuitDocument;

      circuits.push({
        id: cid,
        title: clonedDoc.metadata.title,
        description: clonedDoc.metadata.description,
        category: clonedDoc.metadata.category,
        isPublic: true,
        tags: [...clonedDoc.metadata.tags],
        nodeCount: clonedDoc.nodes.length,
        edgeCount: clonedDoc.edges.length,
        criticalPathNs: timing.criticalPathDelayNs,
        maxClockMhz: timing.maxClockFrequencyMhz,
        authorId: demoUserId,
        authorName: demoUser.fullName,
        createdAt: clonedDoc.metadata.createdAt,
        updatedAt: clonedDoc.metadata.updatedAt,
        schemaJson: clonedDoc,
      });

      revisions.push({
        id: `rev-${cid}-1`,
        circuitId: cid,
        versionNumber: 1,
        commitMessage: 'Початкова базова топологія схеми',
        nodeCount: clonedDoc.nodes.length,
        edgeCount: clonedDoc.edges.length,
        authorName: demoUser.fullName,
        createdById: demoUserId,
        createdAt: clonedDoc.metadata.createdAt,
        schemaJson: JSON.parse(JSON.stringify(clonedDoc)) as CircuitDocument,
      });

      if (cid === 'preset-full-adder') {
        revisions.push({
          id: `rev-${cid}-2`,
          circuitId: cid,
          versionNumber: 2,
          commitMessage: 'Оптимізовано каскад формування переносу COUT та додано LED-індикацію',
          nodeCount: clonedDoc.nodes.length,
          edgeCount: clonedDoc.edges.length,
          authorName: demoUser.fullName,
          createdById: demoUserId,
          createdAt: clonedDoc.metadata.updatedAt,
          schemaJson: JSON.parse(JSON.stringify(clonedDoc)) as CircuitDocument,
        });
      }
    }

    const halfA = createNodeFromCatalog('INPUT_SWITCH', 'ha_a', { x: 40, y: 40 }, 'A');
    const halfB = createNodeFromCatalog('INPUT_SWITCH', 'ha_b', { x: 40, y: 120 }, 'B');
    const halfXor = createNodeFromCatalog('XOR', 'ha_xor', { x: 200, y: 40 }, 'SUM_G');
    const halfAnd = createNodeFromCatalog('AND', 'ha_and', { x: 200, y: 120 }, 'CARRY_G');
    const halfOutS = createNodeFromCatalog('PROBE', 'ha_s', { x: 380, y: 45 }, 'S');
    const halfOutC = createNodeFromCatalog('PROBE', 'ha_c', { x: 380, y: 125 }, 'C');

    const halfAdderDef: CustomICDefinition = {
      id: 'ic-half-adder',
      name: 'Напівсуматор (Half Adder IC)',
      code: 'HA_1BIT',
      description: 'Інкапсульована ІМС однорозрядного напівсуматора (S = A XOR B, C = A AND B).',
      propagationDelayNs: 14,
      inputPins: [
        { id: 'A', name: 'A', mappedNodeId: 'ha_a' },
        { id: 'B', name: 'B', mappedNodeId: 'ha_b' },
      ],
      outputPins: [
        { id: 'S', name: 'S', mappedNodeId: 'ha_s' },
        { id: 'C', name: 'C', mappedNodeId: 'ha_c' },
      ],
      internalCircuit: {
        nodes: [halfA, halfB, halfXor, halfAnd, halfOutS, halfOutC],
        edges: [
          {
            id: 'h1',
            sourceNodeId: 'ha_a',
            sourcePinId: 'OUT',
            targetNodeId: 'ha_xor',
            targetPinId: 'A',
            signalState: '0',
          },
          {
            id: 'h2',
            sourceNodeId: 'ha_b',
            sourcePinId: 'OUT',
            targetNodeId: 'ha_xor',
            targetPinId: 'B',
            signalState: '0',
          },
          {
            id: 'h3',
            sourceNodeId: 'ha_a',
            sourcePinId: 'OUT',
            targetNodeId: 'ha_and',
            targetPinId: 'A',
            signalState: '0',
          },
          {
            id: 'h4',
            sourceNodeId: 'ha_b',
            sourcePinId: 'OUT',
            targetNodeId: 'ha_and',
            targetPinId: 'B',
            signalState: '0',
          },
          {
            id: 'h5',
            sourceNodeId: 'ha_xor',
            sourcePinId: 'Y',
            targetNodeId: 'ha_s',
            targetPinId: 'IN',
            signalState: '0',
          },
          {
            id: 'h6',
            sourceNodeId: 'ha_and',
            sourcePinId: 'Y',
            targetNodeId: 'ha_c',
            targetPinId: 'IN',
            signalState: '0',
          },
        ],
      },
    };

    return {
      users: [demoUser],
      circuits,
      revisions,
      customComponents: [
        {
          authorId: demoUserId,
          isShared: true,
          definition: halfAdderDef,
        },
      ],
      simulationRuns: [
        {
          id: 'run-demo-1',
          circuitId: 'preset-full-adder',
          executedById: demoUserId,
          durationSimNs: 200,
          processedEvents: 18,
          criticalPathNs: 37,
          status: 'STABLE',
          createdAt: now,
        },
      ],
    };
  }

  public async findUserByEmail(email: string): Promise<StoredUserRecord | null> {
    const lower = email.toLowerCase();
    return this.store.users.find((u) => u.email.toLowerCase() === lower) ?? null;
  }

  public async findUserByUsername(username: string): Promise<StoredUserRecord | null> {
    return this.store.users.find((u) => u.username === username) ?? null;
  }

  public async findUserById(id: string): Promise<StoredUserRecord | null> {
    return this.store.users.find((u) => u.id === id) ?? null;
  }

  public async createUser(data: {
    email: string;
    username: string;
    fullName: string;
    passwordHash: string;
    role?: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
  }): Promise<StoredUserRecord> {
    const record: StoredUserRecord = {
      id: crypto.randomUUID(),
      email: data.email.toLowerCase(),
      username: data.username,
      fullName: data.fullName,
      role: data.role ?? 'STUDENT',
      passwordHash: data.passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.store.users.push(record);
    this.flush();
    return record;
  }

  public async listCircuits(filter?: {
    search?: string;
    category?: string;
    authorId?: string;
    viewerUserId?: string;
  }): Promise<CircuitSummaryDTO[]> {
    const q = filter?.search?.trim().toLowerCase();
    return this.store.circuits
      .filter((c) => {
        if (filter?.authorId && c.authorId !== filter.authorId) return false;
        if (!filter?.authorId) {
          const visible =
            c.isPublic || (filter?.viewerUserId && c.authorId === filter.viewerUserId);
          if (!visible) return false;
        }
        if (filter?.category && c.category !== filter.category) return false;
        if (q) {
          const hay = `${c.title} ${c.description} ${c.tags.join(' ')}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ schemaJson: _s, forkedFromId: _f, ...summary }) => summary);
  }

  public async getCircuitById(id: string): Promise<CircuitDetailDTO | null> {
    const found = this.store.circuits.find((c) => c.id === id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async createCircuit(input: CreateCircuitInput): Promise<CircuitDetailDTO> {
    const author = await this.findUserById(input.authorId);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const clonedSchema = JSON.parse(JSON.stringify(input.schemaJson)) as CircuitDocument;

    const record: CircuitDetailDTO & { forkedFromId?: string } = {
      id,
      title: input.title,
      description: input.description,
      category: input.category,
      isPublic: input.isPublic,
      tags: [...input.tags],
      nodeCount: clonedSchema.nodes.length,
      edgeCount: clonedSchema.edges.length,
      criticalPathNs: input.criticalPathNs,
      maxClockMhz: input.maxClockMhz,
      authorId: input.authorId,
      authorName: author?.fullName ?? 'Інженер',
      createdAt: now,
      updatedAt: now,
      forkedFromId: input.forkedFromId,
      schemaJson: clonedSchema,
    };

    this.store.circuits.push(record);
    this.store.revisions.push({
      id: crypto.randomUUID(),
      circuitId: id,
      versionNumber: 1,
      commitMessage: input.commitMessage ?? 'Початкове створення схеми',
      nodeCount: clonedSchema.nodes.length,
      edgeCount: clonedSchema.edges.length,
      authorName: record.authorName,
      createdById: input.authorId,
      createdAt: now,
      schemaJson: JSON.parse(JSON.stringify(clonedSchema)) as CircuitDocument,
    });
    this.flush();
    return JSON.parse(JSON.stringify(record));
  }

  public async updateCircuit(
    id: string,
    input: UpdateCircuitInput,
  ): Promise<CircuitDetailDTO | null> {
    const idx = this.store.circuits.findIndex((c) => c.id === id);
    if (idx === -1) return null;

    const editor = await this.findUserById(input.editorUserId);
    const now = new Date().toISOString();
    const clonedSchema = JSON.parse(JSON.stringify(input.schemaJson)) as CircuitDocument;

    const existing = this.store.circuits[idx];
    existing.title = input.title;
    existing.description = input.description;
    existing.category = input.category;
    existing.isPublic = input.isPublic;
    existing.tags = [...input.tags];
    existing.schemaJson = clonedSchema;
    existing.nodeCount = clonedSchema.nodes.length;
    existing.edgeCount = clonedSchema.edges.length;
    existing.criticalPathNs = input.criticalPathNs;
    existing.maxClockMhz = input.maxClockMhz;
    existing.updatedAt = now;

    const existingRevs = this.store.revisions.filter((r) => r.circuitId === id);
    const maxVer = existingRevs.reduce((acc, r) => Math.max(acc, r.versionNumber), 0);
    const nextVersion = maxVer + 1;

    this.store.revisions.push({
      id: crypto.randomUUID(),
      circuitId: id,
      versionNumber: nextVersion,
      commitMessage: input.commitMessage ?? `Збереження ревізії #${nextVersion}`,
      nodeCount: clonedSchema.nodes.length,
      edgeCount: clonedSchema.edges.length,
      authorName: editor?.fullName ?? existing.authorName,
      createdById: input.editorUserId,
      createdAt: now,
      schemaJson: JSON.parse(JSON.stringify(clonedSchema)) as CircuitDocument,
    });

    this.flush();
    return JSON.parse(JSON.stringify(existing));
  }

  public async deleteCircuit(id: string): Promise<boolean> {
    const before = this.store.circuits.length;
    this.store.circuits = this.store.circuits.filter((c) => c.id !== id);
    if (this.store.circuits.length === before) return false;
    this.store.revisions = this.store.revisions.filter((r) => r.circuitId !== id);
    this.store.simulationRuns = this.store.simulationRuns.filter((r) => r.circuitId !== id);
    this.flush();
    return true;
  }

  public async listRevisions(circuitId: string): Promise<CircuitRevisionDTO[]> {
    return this.store.revisions
      .filter((r) => r.circuitId === circuitId)
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map(({ createdById: _c, ...dto }) => JSON.parse(JSON.stringify(dto)));
  }

  public async getRevision(
    circuitId: string,
    versionNumber: number,
  ): Promise<CircuitRevisionDTO | null> {
    const found = this.store.revisions.find(
      (r) => r.circuitId === circuitId && r.versionNumber === versionNumber,
    );
    if (!found) return null;
    const { createdById: _c, ...dto } = found;
    return JSON.parse(JSON.stringify(dto));
  }

  public async restoreRevision(
    circuitId: string,
    versionNumber: number,
    userId: string,
  ): Promise<CircuitDetailDTO | null> {
    const rev = await this.getRevision(circuitId, versionNumber);
    const circuit = await this.getCircuitById(circuitId);
    if (!rev || !rev.schemaJson || !circuit) return null;

    const timing = analyzeCircuitGraph(rev.schemaJson);
    return this.updateCircuit(circuitId, {
      title: circuit.title,
      description: circuit.description,
      category: circuit.category,
      isPublic: circuit.isPublic,
      tags: circuit.tags,
      schemaJson: rev.schemaJson,
      criticalPathNs: timing.criticalPathDelayNs,
      maxClockMhz: timing.maxClockFrequencyMhz,
      editorUserId: userId,
      commitMessage: `Відновлено з ревізії v${versionNumber}`,
    });
  }

  public async listCustomComponents(viewerUserId?: string): Promise<CustomICDefinition[]> {
    return this.store.customComponents
      .filter((c) => c.isShared || (viewerUserId && c.authorId === viewerUserId))
      .map((c) => JSON.parse(JSON.stringify(c.definition)));
  }

  public async createCustomComponent(
    authorId: string,
    def: Omit<CustomICDefinition, 'id'>,
    isShared: boolean,
  ): Promise<CustomICDefinition> {
    const created: CustomICDefinition = {
      ...JSON.parse(JSON.stringify(def)),
      id: `ic-${crypto.randomUUID().slice(0, 8)}`,
    };
    this.store.customComponents.push({
      authorId,
      isShared,
      definition: created,
    });
    this.flush();
    return created;
  }

  public async deleteCustomComponent(id: string, userId: string): Promise<boolean> {
    const before = this.store.customComponents.length;
    this.store.customComponents = this.store.customComponents.filter(
      (c) => !(c.definition.id === id && c.authorId === userId),
    );
    const deleted = this.store.customComponents.length < before;
    if (deleted) this.flush();
    return deleted;
  }

  public async recordSimulationRun(
    input: Omit<SimulationRunRecord, 'id' | 'createdAt'>,
  ): Promise<SimulationRunRecord> {
    const rec: SimulationRunRecord = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.store.simulationRuns.unshift(rec);
    this.flush();
    return rec;
  }

  public async listSimulationRuns(circuitId: string): Promise<SimulationRunRecord[]> {
    return this.store.simulationRuns.filter((r) => r.circuitId === circuitId).slice(0, 25);
  }
}
