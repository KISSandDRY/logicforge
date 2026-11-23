import { Router } from 'express';
import {
  CATEGORY_LABELS,
  COMPONENT_CATALOG,
  stripUnsafeKeys,
  type CircuitEdgeData,
  type CircuitNodeData,
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
  createCustomIcRequestSchema,
  idParamSchema,
  updateCustomIcRequestSchema,
} from '../validation/schemas';

export const componentRouter = Router();

componentRouter.get('/catalog', (_req, res) => {
  res.json({
    categories: CATEGORY_LABELS,
    components: COMPONENT_CATALOG,
  });
});

componentRouter.get(
  '/custom',
  authenticateOptional,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const repo = getRepository();
    const customComponents = await repo.listCustomComponents(req.user?.sub);
    res.json({ customComponents });
  }),
);

componentRouter.post(
  '/custom',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = createCustomIcRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Некоректна специфікація користувацької ІМС',
        details: z.flattenError(parsed.error),
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
          nodes: stripUnsafeKeys(parsed.data.internalCircuit.nodes) as CircuitNodeData[],
          edges: stripUnsafeKeys(parsed.data.internalCircuit.edges) as CircuitEdgeData[],
        },
      },
      parsed.data.isShared,
    );

    res.status(201).json({ customComponent: created });
  }),
);

componentRouter.put(
  '/custom/:id',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      throw new HttpError(400, 'Некоректний ідентифікатор мікросхеми.');
    }

    const parsed = updateCustomIcRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Некоректні параметри для оновлення користувацької ІМС',
        details: z.flattenError(parsed.error),
      });
      return;
    }

    const repo = getRepository();
    const updated = await repo.updateCustomComponent(parsedId.data, req.user!.sub, {
      ...parsed.data,
      internalCircuit: parsed.data.internalCircuit
        ? {
            nodes: stripUnsafeKeys(parsed.data.internalCircuit.nodes) as CircuitNodeData[],
            edges: stripUnsafeKeys(parsed.data.internalCircuit.edges) as CircuitEdgeData[],
          }
        : undefined,
    });

    if (!updated) {
      res.status(404).json({ error: 'Користувацький компонент не знайдено або немає прав.' });
      return;
    }

    res.json({ customComponent: updated });
  }),
);

componentRouter.delete(
  '/custom/:id',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsedId = idParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      throw new HttpError(400, 'Некоректний ідентифікатор мікросхеми.');
    }

    const repo = getRepository();
    const ok = await repo.deleteCustomComponent(parsedId.data, req.user!.sub);
    if (!ok) {
      res.status(404).json({ error: 'Користувацький компонент не знайдено або немає прав.' });
      return;
    }
    res.json({ deleted: true });
  }),
);
