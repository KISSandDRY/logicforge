import { Router } from 'express';
import {
  CATEGORY_LABELS,
  COMPONENT_CATALOG,
  stripUnsafeKeys,
  type CircuitEdgeData,
  type CircuitNodeData,
} from '@logicforge/shared-types';
import { getRepository } from '../repositories';
import { asyncHandler } from '../utils/asyncHandler';
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
import { parseOrThrow } from '../validation/validate';

export const componentRouter = Router();

function sanitizeInternalCircuit(raw: { nodes: unknown[]; edges: unknown[] }): {
  nodes: CircuitNodeData[];
  edges: CircuitEdgeData[];
} {
  return {
    nodes: stripUnsafeKeys(raw.nodes) as CircuitNodeData[],
    edges: stripUnsafeKeys(raw.edges) as CircuitEdgeData[],
  };
}

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
    const data = parseOrThrow(
      createCustomIcRequestSchema,
      req.body,
      'Некоректна специфікація користувацької ІМС',
    );

    const repo = getRepository();
    const created = await repo.createCustomComponent(
      req.user!.sub,
      {
        name: data.name,
        code: data.code,
        description: data.description,
        propagationDelayNs: data.propagationDelayNs,
        inputPins: data.inputPins,
        outputPins: data.outputPins,
        internalCircuit: sanitizeInternalCircuit(data.internalCircuit),
      },
      data.isShared,
    );

    res.status(201).json({ customComponent: created });
  }),
);

componentRouter.put(
  '/custom/:id',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = parseOrThrow(
      idParamSchema,
      req.params.id,
      'Некоректний ідентифікатор мікросхеми.',
      false,
    );
    const data = parseOrThrow(
      updateCustomIcRequestSchema,
      req.body,
      'Некоректні параметри для оновлення користувацької ІМС',
    );

    const repo = getRepository();
    const updated = await repo.updateCustomComponent(id, req.user!.sub, {
      ...data,
      internalCircuit: data.internalCircuit
        ? sanitizeInternalCircuit(data.internalCircuit)
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
    const id = parseOrThrow(
      idParamSchema,
      req.params.id,
      'Некоректний ідентифікатор мікросхеми.',
      false,
    );

    const repo = getRepository();
    const ok = await repo.deleteCustomComponent(id, req.user!.sub);
    if (!ok) {
      res.status(404).json({ error: 'Користувацький компонент не знайдено або немає прав.' });
      return;
    }
    res.json({ deleted: true });
  }),
);
