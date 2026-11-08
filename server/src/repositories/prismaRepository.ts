import { PrismaClient } from '@prisma/client';
import { analyzeCircuitGraph } from '@logicforge/shared-types';
import type {
  CircuitDetailDTO,
  CircuitDocument,
  CircuitRevisionDTO,
  CircuitSummaryDTO,
  CustomICDefinition,
} from '@logicforge/shared-types';
import type {
  CreateCircuitInput,
  IStorageRepository,
  SimulationRunRecord,
  StoredUserRecord,
  UpdateCircuitInput,
} from './types';

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
      schemaJson: r.schemaJson as unknown as CircuitDocument,
    };
  }

  public async createCircuit(input: CreateCircuitInput): Promise<CircuitDetailDTO> {
    const created = await this.prisma.circuit.create({
      data: {
        title: input.title,
        description: input.description,
        category: input.category,
        isPublic: input.isPublic,
        tags: input.tags,
        schemaJson: JSON.parse(JSON.stringify(input.schemaJson)),
        nodeCount: input.schemaJson.nodes.length,
        edgeCount: input.schemaJson.edges.length,
        criticalPathNs: input.criticalPathNs,
        maxClockMhz: input.maxClockMhz,
        authorId: input.authorId,
        forkedFromId: input.forkedFromId,
      },
      include: { author: true },
    });

    await this.prisma.circuitRevision.create({
      data: {
        circuitId: created.id,
        versionNumber: 1,
        commitMessage: input.commitMessage ?? 'Початкове створення схеми',
        schemaJson: JSON.parse(JSON.stringify(input.schemaJson)),
        nodeCount: input.schemaJson.nodes.length,
        edgeCount: input.schemaJson.edges.length,
        createdById: input.authorId,
      },
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
      schemaJson: created.schemaJson as unknown as CircuitDocument,
    };
  }

  public async updateCircuit(
    id: string,
    input: UpdateCircuitInput,
  ): Promise<CircuitDetailDTO | null> {
    const existing = await this.prisma.circuit.findUnique({ where: { id } });
    if (!existing) return null;

    const latestRev = await this.prisma.circuitRevision.findFirst({
      where: { circuitId: id },
      orderBy: { versionNumber: 'desc' },
    });
    const nextVersion = (latestRev?.versionNumber ?? 0) + 1;

    const updated = await this.prisma.circuit.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        category: input.category,
        isPublic: input.isPublic,
        tags: input.tags,
        schemaJson: JSON.parse(JSON.stringify(input.schemaJson)),
        nodeCount: input.schemaJson.nodes.length,
        edgeCount: input.schemaJson.edges.length,
        criticalPathNs: input.criticalPathNs,
        maxClockMhz: input.maxClockMhz,
      },
      include: { author: true },
    });

    await this.prisma.circuitRevision.create({
      data: {
        circuitId: id,
        versionNumber: nextVersion,
        commitMessage: input.commitMessage ?? `Збереження ревізії #${nextVersion}`,
        schemaJson: JSON.parse(JSON.stringify(input.schemaJson)),
        nodeCount: input.schemaJson.nodes.length,
        edgeCount: input.schemaJson.edges.length,
        createdById: input.editorUserId,
      },
    });

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
      schemaJson: updated.schemaJson as unknown as CircuitDocument,
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
      schemaJson: r.schemaJson as unknown as CircuitDocument,
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
      schemaJson: r.schemaJson as unknown as CircuitDocument,
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
    return rows.map((r) => ({
      ...(r.definitionJson as unknown as CustomICDefinition),
      id: r.id,
    }));
  }

  public async createCustomComponent(
    authorId: string,
    def: Omit<CustomICDefinition, 'id'>,
    isShared: boolean,
  ): Promise<CustomICDefinition> {
    const created = await this.prisma.customComponent.create({
      data: {
        name: def.name,
        code: def.code,
        description: def.description,
        propagationDelayNs: def.propagationDelayNs,
        definitionJson: JSON.parse(JSON.stringify({ ...def, id: 'pending' })),
        isShared,
        authorId,
      },
    });
    const finalDef: CustomICDefinition = { ...def, id: created.id };
    await this.prisma.customComponent.update({
      where: { id: created.id },
      data: { definitionJson: JSON.parse(JSON.stringify(finalDef)) },
    });
    return finalDef;
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
