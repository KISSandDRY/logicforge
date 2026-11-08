import { Router } from 'express';
import {
  CircuitSimulator,
  analyzeCircuitGraph,
  generateEngineeringReport,
  synthesizeTruthTable,
  type CircuitDocument,
} from '@logicforge/shared-types';
import { getRepository } from '../repositories';
import { authenticateOptional, type AuthenticatedRequest } from '../utils/auth';
import { simulateRequestSchema } from '../validation/schemas';

export const simulationRouter = Router();

simulationRouter.post('/run', authenticateOptional, async (req: AuthenticatedRequest, res) => {
  const parsed = simulateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Некоректні вхідні дані для симуляції',
      details: parsed.error.flatten(),
    });
    return;
  }

  const doc = parsed.data.document as CircuitDocument;
  const timing = analyzeCircuitGraph(doc);
  const sim = new CircuitSimulator(doc);
  const snapshot = sim.advanceBy(parsed.data.durationNs);
  const waveforms = sim.getWaveformHistory();

  if (parsed.data.circuitId) {
    const repo = getRepository();
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
});

simulationRouter.post('/analyze', (req, res) => {
  const parsed = simulateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Помилка валідації схеми для аналізу',
      details: parsed.error.flatten(),
    });
    return;
  }

  const doc = parsed.data.document as CircuitDocument;
  const report = generateEngineeringReport(doc);
  res.json({ report });
});

simulationRouter.post('/truth-table', (req, res) => {
  const parsed = simulateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Некоректні дані схеми',
      details: parsed.error.flatten(),
    });
    return;
  }

  const doc = parsed.data.document as CircuitDocument;
  const truthTable = synthesizeTruthTable(doc, parsed.data.maxTruthTableInputs);
  res.json({ truthTable });
});
