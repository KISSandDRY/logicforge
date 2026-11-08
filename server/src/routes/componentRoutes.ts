import { Router } from 'express';
import {
  COMPONENT_CATALOG,
  CATEGORY_LABELS,
  type CircuitEdgeData,
  type CircuitNodeData,
} from '@logicforge/shared-types';
import { getRepository } from '../repositories';
import {
  authenticateOptional,
  authenticateRequired,
  type AuthenticatedRequest,
} from '../utils/auth';
import { createCustomIcRequestSchema } from '../validation/schemas';

export const componentRouter = Router();

componentRouter.get('/catalog', (_req, res) => {
  res.json({
    categories: CATEGORY_LABELS,
    components: COMPONENT_CATALOG,
  });
});

componentRouter.get('/custom', authenticateOptional, async (req: AuthenticatedRequest, res) => {
  const repo = getRepository();
  const customComponents = await repo.listCustomComponents(req.user?.sub);
  res.json({ customComponents });
});

componentRouter.post('/custom', authenticateRequired, async (req: AuthenticatedRequest, res) => {
  const parsed = createCustomIcRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Некоректна специфікація користувацької ІМС',
      details: parsed.error.flatten(),
    });
    return;
  }

  const repo = getRepository();
  const created = await repo.createCustomComponent(
    req.user!.sub,
    {
      name: parsed.data.name,
      code: parsed.data.code,
      description: parsed.data.description,
      propagationDelayNs: parsed.data.propagationDelayNs,
      inputPins: parsed.data.inputPins,
      outputPins: parsed.data.outputPins,
      internalCircuit: {
        nodes: parsed.data.internalCircuit.nodes as CircuitNodeData[],
        edges: parsed.data.internalCircuit.edges as CircuitEdgeData[],
      },
    },
    parsed.data.isShared,
  );

  res.status(201).json({ customComponent: created });
});

componentRouter.delete(
  '/custom/:id',
  authenticateRequired,
  async (req: AuthenticatedRequest, res) => {
    const repo = getRepository();
    const ok = await repo.deleteCustomComponent(String(req.params.id), req.user!.sub);
    if (!ok) {
      res.status(404).json({ error: 'Користувацький компонент не знайдено або немає прав.' });
      return;
    }
    res.json({ deleted: true });
  },
);
