import { Router } from 'express';
import {
  CircuitSimulator,
  analyzeCircuitGraph,
  generateEngineeringReport,
  stripUnsafeKeys,
  synthesizeTruthTable,
  type CircuitDocument,
} from '@logicforge/shared-types';
import { getRepository } from '../repositories';
import { asyncHandler, HttpError } from '../utils/asyncHandler';
import { authenticateOptional, type AuthenticatedRequest } from '../utils/auth';
import { simulateRequestSchema } from '../validation/schemas';
import { parseOrThrow } from '../validation/validate';

export const simulationRouter = Router();

function parseSimulationPayload(body: unknown, errorMessage: string) {
  const params = parseOrThrow(simulateRequestSchema, body, errorMessage);
  const doc = stripUnsafeKeys(params.document) as CircuitDocument;
  return { params, doc };
}

simulationRouter.post(
  '/run',
  authenticateOptional,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { params, doc } = parseSimulationPayload(
      req.body,
      'Некоректні вхідні дані для симуляції',
    );
    const repo = getRepository();

    let targetCircuitAuthorId: string | null = null;
    if (params.circuitId) {
      const existing = await repo.getCircuitById(params.circuitId);
      if (existing) {
        if (
          !existing.isPublic &&
          existing.authorId !== req.user?.sub &&
          req.user?.role !== 'ADMIN'
        ) {
          throw new HttpError(403, 'Доступ до приватної схеми обмежено.');
        }
        targetCircuitAuthorId = existing.authorId;
      }
    }

    const timing = analyzeCircuitGraph(doc);
    const sim = new CircuitSimulator(doc);
    const snapshot = sim.advanceBy(params.durationNs);
    const waveforms = sim.getWaveformHistory();

    if (
      params.circuitId &&
      targetCircuitAuthorId &&
      req.user &&
      (targetCircuitAuthorId === req.user.sub || req.user.role === 'ADMIN')
    ) {
      await repo.recordSimulationRun({
        circuitId: params.circuitId,
        executedById: req.user.sub,
        durationSimNs: params.durationNs,
        processedEvents: snapshot.processedEventsCount,
        criticalPathNs: timing.criticalPathDelayNs,
        status: snapshot.status,
      });
    }

    res.json({
      timing,
      snapshot,
      waveforms,
    });
  }),
);

simulationRouter.post('/analyze', (req, res) => {
  const { doc } = parseSimulationPayload(req.body, 'Помилка валідації схеми для аналізу');
  const report = generateEngineeringReport(doc);
  res.json({ report });
});

simulationRouter.post('/truth-table', (req, res) => {
  const { params, doc } = parseSimulationPayload(req.body, 'Некоректні дані схеми');
  const truthTable = synthesizeTruthTable(doc, params.maxTruthTableInputs);
  res.json({ truthTable });
});
