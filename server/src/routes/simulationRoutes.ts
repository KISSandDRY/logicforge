import { Router } from 'express';
import {
  CircuitSimulator,
  analyzeCircuitGraph,
  generateEngineeringReport,
  stripUnsafeKeys,
  synthesizeTruthTable,
  type CircuitDocument,
} from '@logicforge/shared-types';
import { z } from 'zod';
import { getRepository } from '../repositories';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticateOptional, type AuthenticatedRequest } from '../utils/auth';
import { simulateRequestSchema } from '../validation/schemas';

export const simulationRouter = Router();

simulationRouter.post(
  '/run',
  authenticateOptional,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = simulateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Некоректні вхідні дані для симуляції',
        details: z.flattenError(parsed.error),
      });
      return;
    }

    const repo = getRepository();
    if (parsed.data.circuitId) {
      const exists = await repo.getCircuitById(parsed.data.circuitId);
      if (exists) {
        if (!exists.isPublic && exists.authorId !== req.user?.sub && req.user?.role !== 'ADMIN') {
          res.status(403).json({ error: 'Доступ до приватної схеми обмежено.' });
          return;
        }
      }
    }

    const doc = stripUnsafeKeys(parsed.data.document) as CircuitDocument;
    const timing = analyzeCircuitGraph(doc);
    const sim = new CircuitSimulator(doc);
    const snapshot = sim.advanceBy(parsed.data.durationNs);
    const waveforms = sim.getWaveformHistory();

    if (parsed.data.circuitId) {
      const exists = await repo.getCircuitById(parsed.data.circuitId);
      if (exists) {
        await repo.recordSimulationRun({
          circuitId: parsed.data.circuitId,
          executedById: req.user?.sub,
          durationSimNs: parsed.data.durationNs,
          processedEvents: snapshot.processedEventsCount,
          criticalPathNs: timing.criticalPathDelayNs,
          status: snapshot.status,
        });
      }
    }

    res.json({
      timing,
      snapshot,
      waveforms,
    });
  }),
);

simulationRouter.post('/analyze', (req, res) => {
  const parsed = simulateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Помилка валідації схеми для аналізу',
      details: z.flattenError(parsed.error),
    });
    return;
  }

  const doc = stripUnsafeKeys(parsed.data.document) as CircuitDocument;
  const report = generateEngineeringReport(doc);
  res.json({ report });
});

simulationRouter.post('/truth-table', (req, res) => {
  const parsed = simulateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Некоректні дані схеми',
      details: z.flattenError(parsed.error),
    });
    return;
  }

  const doc = stripUnsafeKeys(parsed.data.document) as CircuitDocument;
  const truthTable = synthesizeTruthTable(doc, parsed.data.maxTruthTableInputs);
  res.json({ truthTable });
});
