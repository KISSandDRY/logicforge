import { PrismaClient, type Prisma } from '@prisma/client';
import {
  analyzeCircuitGraph,
  buildFullAdderPreset,
  circuitDocumentSchema,
  customIcDefinitionSchema,
  stripUnsafeKeys,
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

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return stripUnsafeKeys(JSON.parse(JSON.stringify(value))) as Prisma.InputJsonValue;
}

function parseCircuitDocFromDb(raw: Prisma.JsonValue): CircuitDocument {
  const cleaned = stripUnsafeKeys(raw);
  const parsed = circuitDocumentSchema.safeParse(cleaned);
  if (parsed.success) {
    return parsed.data as CircuitDocument;
  }
  return buildFullAdderPreset();
}

function parseCustomIcFromDb(raw: Prisma.JsonValue, id: string): CustomICDefinition {
  const cleaned = stripUnsafeKeys(raw);
  const parsed = customIcDefinitionSchema.safeParse(cleaned);
  if (parsed.success) {
    return { ...(parsed.data as CustomICDefinition), id };
  }
  return {
    id,
    name: 'Користувацька ІМС',
    code: 'CUSTOM_IC',
    description: '',
    propagationDelayNs: 15,
    inputPins: [],
    outputPins: [],
    internalCircuit: { nodes: [], edges: [] },
  };
}

export class PrismaRepository implements IStorageRepository {
  public readonly driverName = 'postgresql-prisma' as const;
  private readonly prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? new PrismaClient();
  }

  public async checkConnection(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  public async findUserByEmail(email: string): Promise<StoredUserRecord | null> {
    const u = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      passwordHash: u.passwordHash,
      createdAt: u.createdAt.toISOString(),
    };
  }

  public async findUserByUsername(username: string): Promise<StoredUserRecord | null> {
    const u = await this.prisma.user.findUnique({ where: { username } });
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      passwordHash: u.passwordHash,
      createdAt: u.createdAt.toISOString(),
    };
  }

  public async findUserById(id: string): Promise<StoredUserRecord | null> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      passwordHash: u.passwordHash,
      createdAt: u.createdAt.toISOString(),
    };
  }

  public async createUser(data: {
    email: string;
    username: string;
    fullName: string;
    passwordHash: string;
    role?: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
  }): Promise<StoredUserRecord> {
    const u = await this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        username: data.username,
        fullName: data.fullName,
        passwordHash: data.passwordHash,
        role: data.role ?? 'STUDENT',
      },
    });
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      passwordHash: u.passwordHash,
      createdAt: u.createdAt.toISOString(),
    };
  }

  public async listCircuits(filter?: {
    search?: string;
    category?: string;
    authorId?: string;
    viewerUserId?: string;
  }): Promise<CircuitSummaryDTO[]> {
    const rows = await this.prisma.circuit.findMany({
      where: {
        ...(filter?.authorId
          ? { authorId: filter.authorId }
          : filter?.viewerUserId
            ? { OR: [{ isPublic: true }, { authorId: filter.viewerUserId }] }
            : { isPublic: true }),
        ...(filter?.category ? { category: filter.category } : {}),
        ...(filter?.search
          ? {
              OR: [
                { title: { contains: filter.search, mode: 'insensitive' } },
                { description: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { author: true },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      isPublic: r.isPublic,
      tags: r.tags,
      nodeCount: r.nodeCount,
      edgeCount: r.edgeCount,
      criticalPathNs: r.criticalPathNs,
      maxClockMhz: r.maxClockMhz,
      authorId: r.authorId,
      authorName: r.author.fullName,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  public async getCircuitById(id: string): Promise<CircuitDetailDTO | null> {
    const r = await this.prisma.circuit.findUnique({
      where: { id },
      include: { author: true },
    });
    if (!r) return null;
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      isPublic: r.isPublic,
      tags: r.tags,
      nodeCount: r.nodeCount,
      edgeCount: r.edgeCount,
      criticalPathNs: r.criticalPathNs,
      maxClockMhz: r.maxClockMhz,
      authorId: r.authorId,
      authorName: r.author.fullName,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      schemaJson: parseCircuitDocFromDb(r.schemaJson),
    };
  }

  public async createCircuit(input: CreateCircuitInput): Promise<CircuitDetailDTO> {
    const serializedSchema = toPrismaJson(input.schemaJson);

    const created = await this.prisma.$transaction(async (tx) => {
      const circuit = await tx.circuit.create({
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          isPublic: input.isPublic,
          tags: input.tags,
          schemaJson: serializedSchema,
          nodeCount: input.schemaJson.nodes.length,
          edgeCount: input.schemaJson.edges.length,
          criticalPathNs: input.criticalPathNs,
          maxClockMhz: input.maxClockMhz,
          authorId: input.authorId,
          forkedFromId: input.forkedFromId,
        },
        include: { author: true },
      });

      await tx.circuitRevision.create({
        data: {
          circuitId: circuit.id,
          versionNumber: 1,
          commitMessage: input.commitMessage ?? 'Початкове створення схеми',
          schemaJson: serializedSchema,
          nodeCount: input.schemaJson.nodes.length,
          edgeCount: input.schemaJson.edges.length,
          createdById: input.authorId,
        },
      });

      return circuit;
    });

    return {
      id: created.id,
      title: created.title,
      description: created.description,
      category: created.category,
      isPublic: created.isPublic,
      tags: created.tags,
      nodeCount: created.nodeCount,
      edgeCount: created.edgeCount,
      criticalPathNs: created.criticalPathNs,
      maxClockMhz: created.maxClockMhz,
      authorId: created.authorId,
      authorName: created.author.fullName,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      schemaJson: parseCircuitDocFromDb(created.schemaJson),
    };
  }

  public async updateCircuit(
    id: string,
    input: UpdateCircuitInput,
  ): Promise<CircuitDetailDTO | null> {
    const serializedSchema = toPrismaJson(input.schemaJson);

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.circuit.findUnique({ where: { id } });
      if (!existing) return null;

      const latestRev = await tx.circuitRevision.findFirst({
        where: { circuitId: id },
        orderBy: { versionNumber: 'desc' },
      });
      const nextVersion = (latestRev?.versionNumber ?? 0) + 1;

      const nextCircuit = await tx.circuit.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          isPublic: input.isPublic,
          tags: input.tags,
          schemaJson: serializedSchema,
          nodeCount: input.schemaJson.nodes.length,
          edgeCount: input.schemaJson.edges.length,
          criticalPathNs: input.criticalPathNs,
          maxClockMhz: input.maxClockMhz,
        },
        include: { author: true },
      });

      await tx.circuitRevision.create({
        data: {
          circuitId: id,
          versionNumber: nextVersion,
          commitMessage: input.commitMessage ?? `Збереження ревізії #${nextVersion}`,
          schemaJson: serializedSchema,
          nodeCount: input.schemaJson.nodes.length,
          edgeCount: input.schemaJson.edges.length,
          createdById: input.editorUserId,
        },
      });

      return nextCircuit;
    });

    if (!updated) return null;

    return {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      category: updated.category,
      isPublic: updated.isPublic,
      tags: updated.tags,
      nodeCount: updated.nodeCount,
      edgeCount: updated.edgeCount,
      criticalPathNs: updated.criticalPathNs,
      maxClockMhz: updated.maxClockMhz,
      authorId: updated.authorId,
      authorName: updated.author.fullName,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      schemaJson: parseCircuitDocFromDb(updated.schemaJson),
    };
  }

  public async deleteCircuit(id: string): Promise<boolean> {
    try {
      await this.prisma.circuit.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  public async listRevisions(circuitId: string): Promise<CircuitRevisionDTO[]> {
    const revs = await this.prisma.circuitRevision.findMany({
      where: { circuitId },
      include: { createdBy: true },
      orderBy: { versionNumber: 'desc' },
    });
    return revs.map((r) => ({
      id: r.id,
      circuitId: r.circuitId,
      versionNumber: r.versionNumber,
      commitMessage: r.commitMessage,
      nodeCount: r.nodeCount,
      edgeCount: r.edgeCount,
      authorName: r.createdBy.fullName,
      createdAt: r.createdAt.toISOString(),
      schemaJson: parseCircuitDocFromDb(r.schemaJson),
    }));
  }

  public async getRevision(
    circuitId: string,
    versionNumber: number,
  ): Promise<CircuitRevisionDTO | null> {
    const r = await this.prisma.circuitRevision.findUnique({
      where: { circuitId_versionNumber: { circuitId, versionNumber } },
      include: { createdBy: true },
    });
    if (!r) return null;
    return {
      id: r.id,
      circuitId: r.circuitId,
      versionNumber: r.versionNumber,
      commitMessage: r.commitMessage,
      nodeCount: r.nodeCount,
      edgeCount: r.edgeCount,
      authorName: r.createdBy.fullName,
      createdAt: r.createdAt.toISOString(),
      schemaJson: parseCircuitDocFromDb(r.schemaJson),
    };
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
    const rows = await this.prisma.customComponent.findMany({
      where: viewerUserId
        ? { OR: [{ isShared: true }, { authorId: viewerUserId }] }
        : { isShared: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => parseCustomIcFromDb(r.definitionJson, r.id));
  }

  public async createCustomComponent(
    authorId: string,
    def: Omit<CustomICDefinition, 'id'>,
    isShared: boolean,
  ): Promise<CustomICDefinition> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.customComponent.create({
        data: {
          name: def.name,
          code: def.code,
          description: def.description,
          propagationDelayNs: def.propagationDelayNs,
          definitionJson: toPrismaJson({ ...def, id: 'pending' }),
          isShared,
          authorId,
        },
      });
      const finalDef: CustomICDefinition = { ...def, id: created.id };
      await tx.customComponent.update({
        where: { id: created.id },
        data: { definitionJson: toPrismaJson(finalDef) },
      });
      return finalDef;
    });
  }

  public async updateCustomComponent(
    id: string,
    userId: string,
    patch: Partial<Omit<CustomICDefinition, 'id'>> & { isShared?: boolean },
  ): Promise<CustomICDefinition | null> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.customComponent.findUnique({ where: { id } });
      if (!found || found.authorId !== userId) return null;

      const { isShared, ...defPatch } = patch;
      const prevDef = parseCustomIcFromDb(found.definitionJson, found.id);
      const nextDef: CustomICDefinition = {
        ...prevDef,
        ...(stripUnsafeKeys(defPatch) as Partial<CustomICDefinition>),
        id: found.id,
      };

      await tx.customComponent.update({
        where: { id },
        data: {
          name: nextDef.name,
          code: nextDef.code,
          description: nextDef.description,
          propagationDelayNs: nextDef.propagationDelayNs,
          isShared: isShared ?? found.isShared,
          definitionJson: toPrismaJson(nextDef),
        },
      });
      return nextDef;
    });
  }

  public async deleteCustomComponent(id: string, userId: string): Promise<boolean> {
    const found = await this.prisma.customComponent.findUnique({ where: { id } });
    if (!found || found.authorId !== userId) return false;
    await this.prisma.customComponent.delete({ where: { id } });
    return true;
  }

  public async recordSimulationRun(
    input: Omit<SimulationRunRecord, 'id' | 'createdAt'>,
  ): Promise<SimulationRunRecord> {
    const created = await this.prisma.simulationRun.create({
      data: {
        circuitId: input.circuitId,
        executedById: input.executedById,
        durationSimNs: input.durationSimNs,
        processedEvents: input.processedEvents,
        criticalPathNs: input.criticalPathNs,
        status: input.status,
      },
    });
    return {
      id: created.id,
      circuitId: created.circuitId,
      executedById: created.executedById ?? undefined,
      durationSimNs: created.durationSimNs,
      processedEvents: created.processedEvents,
      criticalPathNs: created.criticalPathNs,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
    };
  }

  public async listSimulationRuns(circuitId: string): Promise<SimulationRunRecord[]> {
    const rows = await this.prisma.simulationRun.findMany({
      where: { circuitId },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    return rows.map((r) => ({
      id: r.id,
      circuitId: r.circuitId,
      executedById: r.executedById ?? undefined,
      durationSimNs: r.durationSimNs,
      processedEvents: r.processedEvents,
      criticalPathNs: r.criticalPathNs,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
