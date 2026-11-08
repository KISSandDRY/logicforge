import { Router } from 'express';
import {
  PRESET_CIRCUITS,
  analyzeCircuitGraph,
  generateEngineeringReport,
  type CircuitDocument,
} from '@logicforge/shared-types';
import { getRepository } from '../repositories';
import {
  authenticateOptional,
  authenticateRequired,
  type AuthenticatedRequest,
} from '../utils/auth';
import { saveCircuitRequestSchema } from '../validation/schemas';

export const circuitRouter = Router();

circuitRouter.get('/presets', (_req, res) => {
  res.json({ presets: PRESET_CIRCUITS });
});

circuitRouter.get('/', authenticateOptional, async (req: AuthenticatedRequest, res) => {
  const repo = getRepository();
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const mine = req.query.mine === 'true';

  const circuits = await repo.listCircuits({
    search,
    category,
    authorId: mine && req.user ? req.user.sub : undefined,
    viewerUserId: req.user?.sub,
  });
  res.json({ circuits });
});

circuitRouter.get('/:id', authenticateOptional, async (req: AuthenticatedRequest, res) => {
  const repo = getRepository();
  const circuit = await repo.getCircuitById(String(req.params.id));
  if (!circuit) {
    res.status(404).json({ error: 'Схему не знайдено.' });
    return;
  }
  if (!circuit.isPublic && circuit.authorId !== req.user?.sub) {
    res.status(403).json({ error: 'Доступ до приватної схеми обмежено.' });
    return;
  }
  res.json({ circuit });
});

circuitRouter.post('/', authenticateRequired, async (req: AuthenticatedRequest, res) => {
  const parsed = saveCircuitRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Некоректна специфікація схеми JSON',
      details: parsed.error.flatten(),
    });
    return;
  }

  const repo = getRepository();
  const doc = parsed.data.schemaJson as CircuitDocument;
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
});

circuitRouter.put('/:id', authenticateRequired, async (req: AuthenticatedRequest, res) => {
  const parsed = saveCircuitRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Некоректні дані оновлення схеми',
      details: parsed.error.flatten(),
    });
    return;
  }

  const repo = getRepository();
  const id = String(req.params.id);
  const existing = await repo.getCircuitById(id);
  if (!existing) {
    res.status(404).json({ error: 'Схему не знайдено.' });
    return;
  }

  const doc = parsed.data.schemaJson as CircuitDocument;
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
});

circuitRouter.post('/:id/fork', authenticateRequired, async (req: AuthenticatedRequest, res) => {
  const repo = getRepository();
  const source = await repo.getCircuitById(String(req.params.id));
  if (!source) {
    res.status(404).json({ error: 'Вихідну схему не знайдено.' });
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
    isPublic: true,
    tags: source.tags,
    schemaJson: forkedDoc,
    criticalPathNs: timing.criticalPathDelayNs,
    maxClockMhz: timing.maxClockFrequencyMhz,
    authorId: req.user!.sub,
    forkedFromId: source.id,
    commitMessage: `Форк проєкту "${source.title}"`,
  });

  res.status(201).json({ circuit: forked });
});

circuitRouter.delete('/:id', authenticateRequired, async (req: AuthenticatedRequest, res) => {
  const repo = getRepository();
  const id = String(req.params.id);
  const existing = await repo.getCircuitById(id);
  if (!existing) {
    res.status(404).json({ error: 'Схему не знайдено.' });
    return;
  }
  if (existing.authorId !== req.user!.sub && req.user!.role !== 'ADMIN') {
    res.status(403).json({ error: 'Видаляти схему може лише автор або адміністратор.' });
    return;
  }
  await repo.deleteCircuit(id);
  res.json({ deleted: true });
});

circuitRouter.get('/:id/revisions', authenticateOptional, async (req, res) => {
  const repo = getRepository();
  const revisions = await repo.listRevisions(String(req.params.id));
  res.json({ revisions });
});

circuitRouter.post(
  '/:id/revisions/:version/restore',
  authenticateRequired,
  async (req: AuthenticatedRequest, res) => {
    const repo = getRepository();
    const version = Number(req.params.version);
    if (!Number.isInteger(version) || version < 1) {
      res.status(400).json({ error: 'Некоректний номер ревізії.' });
      return;
    }

    const restored = await repo.restoreRevision(String(req.params.id), version, req.user!.sub);
    if (!restored) {
      res.status(404).json({ error: 'Ревізію або схему не знайдено.' });
      return;
    }
    res.json({ circuit: restored });
  },
);

circuitRouter.get('/:id/report', authenticateOptional, async (req, res) => {
  const repo = getRepository();
  const id = String(req.params.id);
  const circuit = await repo.getCircuitById(id);
  if (!circuit) {
    res.status(404).json({ error: 'Схему не знайдено.' });
    return;
  }
  const report = generateEngineeringReport(circuit.schemaJson);
  const runs = await repo.listSimulationRuns(id);
  res.json({ circuit, report, runs });
});
