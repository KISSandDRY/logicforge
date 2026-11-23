import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config } from './config';
import { getRepository } from './repositories';
import { authRouter } from './routes/authRoutes';
import { circuitRouter } from './routes/circuitRoutes';
import { componentRouter } from './routes/componentRoutes';
import { simulationRouter } from './routes/simulationRoutes';
import { HttpError } from './utils/asyncHandler';
import { logger } from './utils/logger';

export interface AppOptions {
  authRateLimitMax?: number;
  writeRateLimitMax?: number;
}

export function createApp(options?: AppOptions): express.Express {
  const app = express();
  app.disable('x-powered-by');

  const allowedOrigins = config.corsOrigin
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const allowedOriginSet = new Set(allowedOrigins);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", ...allowedOrigins],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      xContentTypeOptions: true,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        const normalized = origin.trim().replace(/\/$/, '');
        if (allowedOriginSet.has(normalized)) {
          callback(null, true);
          return;
        }
        callback(new HttpError(403, 'Запит заблоковано політикою CORS: недозволене джерело.'));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    }),
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options?.authRateLimitMax ?? 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Забагато спроб автентифікації. Спробуйте повторно через 15 хвилин.' },
  });

  const writeRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options?.writeRateLimitMax ?? 120,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
    message: { error: 'Перевищено ліміт запитів на зміну даних. Повторіть пізніше.' },
  });

  app.get('/api/health', (_req, res) => {
    const repo = getRepository();
    res.json({
      status: 'ok',
      service: 'LogicForge Simulation API',
      storageDriver: repo.driverName,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth/login', authRateLimiter);
  app.use('/api/auth/register', authRateLimiter);
  app.use('/api/auth/demo', authRateLimiter);
  app.use('/api/auth', authRouter);

  app.use('/api/circuits', writeRateLimiter, circuitRouter);
  app.use('/api/components', writeRateLimiter, componentRouter);
  app.use('/api/simulate', writeRateLimiter, simulationRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Маршрут REST API не знайдено.' });
  });

  app.use(
    (
      err: Error & { status?: number; type?: string },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      if (err instanceof HttpError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Помилка валідації вхідних параметрів запиту.' });
        return;
      }
      if (err.type === 'entity.too.large' || err.status === 413) {
        res
          .status(413)
          .json({ error: 'Перевищено максимальний допустимий розмір тіла запиту (1 MB).' });
        return;
      }
      if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({ error: 'Некоректний синтаксис JSON у тілі запиту.' });
        return;
      }

      logger.error('Необроблена помилка сервера', {
        message: err.message,
        ...(config.nodeEnv !== 'production' ? { stack: err.stack } : {}),
      });
      res.status(500).json({ error: 'Внутрішня помилка сервера.' });
    },
  );

  return app;
}
