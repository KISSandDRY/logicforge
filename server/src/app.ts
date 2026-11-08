import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { config } from './config';
import { getRepository } from './repositories';
import { authRouter } from './routes/authRoutes';
import { circuitRouter } from './routes/circuitRoutes';
import { componentRouter } from './routes/componentRoutes';
import { simulationRouter } from './routes/simulationRoutes';
import { logger } from './utils/logger';

export function createApp(): express.Express {
  const app = express();

  const allowedOrigins = config.corsOrigin
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin.trim() === '*' ? true : allowedOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    const repo = getRepository();
    res.json({
      status: 'ok',
      service: 'LogicForge Simulation API',
      storageDriver: repo.driverName,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/circuits', circuitRouter);
  app.use('/api/components', componentRouter);
  app.use('/api/simulate', simulationRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Маршрут REST API не знайдено.' });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Необроблена помилка сервера', { message: err.message, stack: err.stack });
    res.status(500).json({ error: 'Внутрішня помилка сервера.' });
  });

  return app;
}
