import { Router } from 'express';
import {
  PRESET_CIRCUITS,
  analyzeCircuitGraph,
  generateEngineeringReport,
  stripUnsafeKeys,
  type CircuitDetailDTO,
  type CircuitDocument,
} from '@logicforge/shared-types';
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
import { parseOrThrow } from '../validation/validate';

export const circuitRouter = Router();

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

async function loadAuthorizedCircuit(
  rawId: unknown,
  req: AuthenticatedRequest,
  access: 'read' | 'write',
  messages?: { notFound?: string; forbidden?: string },
): Promise<{ id: string; circuit: CircuitDetailDTO }> {
  const id = parseOrThrow(idParamSchema, rawId, 'Некоректний ідентифікатор схеми.', false);
  const repo = getRepository();
  const circuit = await repo.getCircuitById(id);

  if (!circuit) {
    throw new HttpError(404, messages?.notFound ?? 'Схему не знайдено.');
  }

  const allowed =
    access === 'read'
      ? canReadCircuit(circuit, req.user)
      : Boolean(req.user) && canWriteCircuit(circuit, req.user!);

  if (!allowed) {
    throw new HttpError(
      403,
      messages?.forbidden ??
        (access === 'read'
          ? 'Доступ до приватної схеми обмежено.'
          : 'Змінювати схему може лише її автор або адміністратор.'),
    );
  }

  return { id, circuit };
}

function sanitizeAndAnalyzeSchema(rawSchema: unknown): {
  doc: CircuitDocument;
  timing: ReturnType<typeof analyzeCircuitGraph>;
} {
  const doc = stripUnsafeKeys(rawSchema) as CircuitDocument;
  const timing = analyzeCircuitGraph(doc);
  return { doc, timing };
}

circuitRouter.get('/presets', (_req, res) => {
  res.json({ presets: PRESET_CIRCUITS });
});

circuitRouter.get(
  '/',
  authenticateOptional,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const query = parseOrThrow(
      listCircuitsQuerySchema,
      req.query,
      'Некоректні параметри фільтрації.',
      false,
    );

    if (query.mine === 'true' && !req.user) {
      res.json({ circuits: [] });
      return;
    }

    const repo = getRepository();
    const circuits = await repo.listCircuits({
      search: query.search,
      category: query.category,
      authorId: query.mine === 'true' && req.user ? req.user.sub : undefined,
      viewerUserId: req.user?.sub,
    });
    res.json({ circuits });
  }),
);

circuitRouter.get(
  '/:id',
  authenticateOptional,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { circuit } = await loadAuthorizedCircuit(req.params.id, req, 'read');
    res.json({ circuit });
  }),
);

circuitRouter.post(
  '/',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = parseOrThrow(
      saveCircuitRequestSchema,
      req.body,
      'Некоректна специфікація схеми JSON',
    );
    const repo = getRepository();
    const { doc, timing } = sanitizeAndAnalyzeSchema(data.schemaJson);

    const created = await repo.createCircuit({
      title: data.title,
      description: data.description,
      category: data.category,
      isPublic: data.isPublic,
      tags: data.tags,
      schemaJson: doc,
      criticalPathNs: timing.criticalPathDelayNs,
      maxClockMhz: timing.maxClockFrequencyMhz,
      authorId: req.user!.sub,
      commitMessage: data.commitMessage ?? 'Початкове збереження проєкту',
    });

    res.status(201).json({ circuit: created });
  }),
);

circuitRouter.put(
  '/:id',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = parseOrThrow(
      saveCircuitRequestSchema,
      req.body,
      'Некоректні дані оновлення схеми',
    );
    const { id } = await loadAuthorizedCircuit(req.params.id, req, 'write');
    const repo = getRepository();
    const { doc, timing } = sanitizeAndAnalyzeSchema(data.schemaJson);

    const updated = await repo.updateCircuit(id, {
      title: data.title,
      description: data.description,
      category: data.category,
      isPublic: data.isPublic,
      tags: data.tags,
      schemaJson: doc,
      criticalPathNs: timing.criticalPathDelayNs,
      maxClockMhz: timing.maxClockFrequencyMhz,
      editorUserId: req.user!.sub,
      commitMessage: data.commitMessage,
    });

    res.json({ circuit: updated });
  }),
);

circuitRouter.post(
  '/:id/fork',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { circuit: source } = await loadAuthorizedCircuit(req.params.id, req, 'read', {
      notFound: 'Вихідну схему не знайдено.',
      forbidden: 'Копіювання приватної схеми іншого користувача заборонено.',
    });

    const repo = getRepository();
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
    const { id } = await loadAuthorizedCircuit(req.params.id, req, 'write', {
      forbidden: 'Видаляти схему може лише автор або адміністратор.',
    });
    const repo = getRepository();
    await repo.deleteCircuit(id);
    res.json({ deleted: true });
  }),
);

circuitRouter.get(
  '/:id/revisions',
  authenticateOptional,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = await loadAuthorizedCircuit(req.params.id, req, 'read', {
      forbidden: 'Доступ до ревізій приватної схеми обмежено.',
    });
    const repo = getRepository();
    const revisions = await repo.listRevisions(id);
    res.json({ revisions });
  }),
);

circuitRouter.post(
  '/:id/revisions/:version/restore',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const versionNumber = parseOrThrow(
      versionParamSchema,
      req.params.version,
      'Некоректний номер ревізії.',
      false,
    );
    const { id } = await loadAuthorizedCircuit(req.params.id, req, 'write', {
      forbidden: 'Відновлювати ревізії може лише автор або адміністратор.',
    });

    const repo = getRepository();
    const restored = await repo.restoreRevision(id, versionNumber, req.user!.sub);
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
    const { id, circuit } = await loadAuthorizedCircuit(req.params.id, req, 'read', {
      forbidden: 'Доступ до звіту приватної схеми обмежено.',
    });
    const repo = getRepository();
    const report = generateEngineeringReport(circuit.schemaJson);
    const runs = await repo.listSimulationRuns(id);
    res.json({ circuit, report, runs });
  }),
);
