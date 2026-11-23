import { Router } from 'express';
import {
  PRESET_CIRCUITS,
  analyzeCircuitGraph,
  generateEngineeringReport,
  stripUnsafeKeys,
  type CircuitDocument,
} from '@logicforge/shared-types';
import { z } from 'zod';
import { getRepository } from '../repositories';
import { asyncHandler, HttpError } from '../utils/asyncHandler';
import {
  authenticateOptional,
  authenticateRequired,
  type AuthenticatedRequest,
} from '../utils/auth';
import {
  idParamSchema,
  listCircuitsQuerySchema,
  saveCircuitRequestSchema,
  versionParamSchema,
} from '../validation/schemas';

export const circuitRouter = Router();

function parseValidIdParam(rawId: unknown): string {
  const parsed = idParamSchema.safeParse(rawId);
  if (!parsed.success) {
    throw new HttpError(400, 'Некоректний ідентифікатор схеми.');
  }
  return parsed.data;
}

function canReadCircuit(
  circuit: { isPublic: boolean; authorId: string },
  user?: AuthenticatedRequest['user'],
): boolean {
  return (
    circuit.isPublic ||
    (Boolean(user) && (circuit.authorId === user!.sub || user!.role === 'ADMIN'))
  );
}

function canWriteCircuit(
  circuit: { authorId: string },
  user: NonNullable<AuthenticatedRequest['user']>,
): boolean {
  return circuit.authorId === user.sub || user.role === 'ADMIN';
}

circuitRouter.get('/presets', (_req, res) => {
  res.json({ presets: PRESET_CIRCUITS });
});

circuitRouter.get(
  '/',
  authenticateOptional,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsedQuery = listCircuitsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({ error: 'Некоректні параметри фільтрації.' });
      return;
    }

    const repo = getRepository();
    const { search, category, mine } = parsedQuery.data;

    const circuits = await repo.listCircuits({
      search,
      category,
      authorId: mine === 'true' && req.user ? req.user.sub : undefined,
      viewerUserId: req.user?.sub,
    });
    res.json({ circuits });
  }),
);

circuitRouter.get(
  '/:id',
  authenticateOptional,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = parseValidIdParam(req.params.id);
    const repo = getRepository();
    const circuit = await repo.getCircuitById(id);
    if (!circuit) {
      res.status(404).json({ error: 'Схему не знайдено.' });
      return;
    }
    if (!canReadCircuit(circuit, req.user)) {
      res.status(403).json({ error: 'Доступ до приватної схеми обмежено.' });
      return;
    }
    res.json({ circuit });
  }),
);

circuitRouter.post(
  '/',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = saveCircuitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Некоректна специфікація схеми JSON',
        details: z.flattenError(parsed.error),
      });
      return;
    }

    const repo = getRepository();
    const doc = stripUnsafeKeys(parsed.data.schemaJson) as CircuitDocument;
    const timing = analyzeCircuitGraph(doc);

    const created = await repo.createCircuit({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      isPublic: parsed.data.isPublic,
      tags: parsed.data.tags,
      schemaJson: doc,
      criticalPathNs: timing.criticalPathDelayNs,
      maxClockMhz: timing.maxClockFrequencyMhz,
      authorId: req.user!.sub,
      commitMessage: parsed.data.commitMessage ?? 'Початкове збереження проєкту',
    });

    res.status(201).json({ circuit: created });
  }),
);

circuitRouter.put(
  '/:id',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = parseValidIdParam(req.params.id);
    const parsed = saveCircuitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Некоректні дані оновлення схеми',
        details: z.flattenError(parsed.error),
      });
      return;
    }

    const repo = getRepository();
    const existing = await repo.getCircuitById(id);
    if (!existing) {
      res.status(404).json({ error: 'Схему не знайдено.' });
      return;
    }
    if (!canWriteCircuit(existing, req.user!)) {
      res.status(403).json({ error: 'Змінювати схему може лише її автор або адміністратор.' });
      return;
    }

    const doc = stripUnsafeKeys(parsed.data.schemaJson) as CircuitDocument;
    const timing = analyzeCircuitGraph(doc);

    const updated = await repo.updateCircuit(id, {
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      isPublic: parsed.data.isPublic,
      tags: parsed.data.tags,
      schemaJson: doc,
      criticalPathNs: timing.criticalPathDelayNs,
      maxClockMhz: timing.maxClockFrequencyMhz,
      editorUserId: req.user!.sub,
      commitMessage: parsed.data.commitMessage,
    });

    res.json({ circuit: updated });
  }),
);

circuitRouter.post(
  '/:id/fork',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = parseValidIdParam(req.params.id);
    const repo = getRepository();
    const source = await repo.getCircuitById(id);
    if (!source) {
      res.status(404).json({ error: 'Вихідну схему не знайдено.' });
      return;
    }
    if (!canReadCircuit(source, req.user)) {
      res.status(403).json({ error: 'Копіювання приватної схеми іншого користувача заборонено.' });
      return;
    }

    const timing = analyzeCircuitGraph(source.schemaJson);
    const forkedDoc: CircuitDocument = {
      ...source.schemaJson,
      metadata: {
        ...source.schemaJson.metadata,
        title: `${source.title} (Копія)`,
        updatedAt: new Date().toISOString(),
      },
    };

    const forked = await repo.createCircuit({
      title: `${source.title} (Копія)`,
      description: source.description,
      category: source.category,
      isPublic: source.isPublic,
      tags: source.tags,
      schemaJson: forkedDoc,
      criticalPathNs: timing.criticalPathDelayNs,
      maxClockMhz: timing.maxClockFrequencyMhz,
      authorId: req.user!.sub,
      forkedFromId: source.id,
      commitMessage: `Форк проєкту "${source.title}"`,
    });

    res.status(201).json({ circuit: forked });
  }),
);

circuitRouter.delete(
  '/:id',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = parseValidIdParam(req.params.id);
    const repo = getRepository();
    const existing = await repo.getCircuitById(id);
    if (!existing) {
      res.status(404).json({ error: 'Схему не знайдено.' });
      return;
    }
    if (!canWriteCircuit(existing, req.user!)) {
      res.status(403).json({ error: 'Видаляти схему може лише автор або адміністратор.' });
      return;
    }
    await repo.deleteCircuit(id);
    res.json({ deleted: true });
  }),
);

circuitRouter.get(
  '/:id/revisions',
  authenticateOptional,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = parseValidIdParam(req.params.id);
    const repo = getRepository();
    const circuit = await repo.getCircuitById(id);
    if (!circuit) {
      res.status(404).json({ error: 'Схему не знайдено.' });
      return;
    }
    if (!canReadCircuit(circuit, req.user)) {
      res.status(403).json({ error: 'Доступ до ревізій приватної схеми обмежено.' });
      return;
    }
    const revisions = await repo.listRevisions(id);
    res.json({ revisions });
  }),
);

circuitRouter.post(
  '/:id/revisions/:version/restore',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = parseValidIdParam(req.params.id);
    const parsedVer = versionParamSchema.safeParse(req.params.version);
    if (!parsedVer.success) {
      res.status(400).json({ error: 'Некоректний номер ревізії.' });
      return;
    }

    const repo = getRepository();
    const circuit = await repo.getCircuitById(id);
    if (!circuit) {
      res.status(404).json({ error: 'Схему не знайдено.' });
      return;
    }
    if (!canWriteCircuit(circuit, req.user!)) {
      res.status(403).json({ error: 'Відновлювати ревізії може лише автор або адміністратор.' });
      return;
    }

    const restored = await repo.restoreRevision(id, parsedVer.data, req.user!.sub);
    if (!restored) {
      res.status(404).json({ error: 'Ревізію не знайдено.' });
      return;
    }
    res.json({ circuit: restored });
  }),
);

circuitRouter.get(
  '/:id/report',
  authenticateOptional,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = parseValidIdParam(req.params.id);
    const repo = getRepository();
    const circuit = await repo.getCircuitById(id);
    if (!circuit) {
      res.status(404).json({ error: 'Схему не знайдено.' });
      return;
    }
    if (!canReadCircuit(circuit, req.user)) {
      res.status(403).json({ error: 'Доступ до звіту приватної схеми обмежено.' });
      return;
    }
    const report = generateEngineeringReport(circuit.schemaJson);
    const runs = await repo.listSimulationRuns(id);
    res.json({ circuit, report, runs });
  }),
);
