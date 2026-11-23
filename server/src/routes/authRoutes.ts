import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import type { UserDTO } from '@logicforge/shared-types';
import { config, DEMO_USER_CONFIG } from '../config';
import { getRepository } from '../repositories';
import type { StoredUserRecord } from '../repositories/types';
import { asyncHandler } from '../utils/asyncHandler';
import {
  authenticateRequired,
  clearSessionCookie,
  hashPassword,
  setSessionCookie,
  signToken,
  verifyPassword,
  type AuthenticatedRequest,
} from '../utils/auth';
import { logger } from '../utils/logger';
import { loginSchema, registerSchema } from '../validation/schemas';
import { parseOrThrow } from '../validation/validate';

export const authRouter = Router();

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  crypto.randomBytes(24).toString('hex'),
  config.bcryptCost,
);

function toPublicUserDto(record: StoredUserRecord): UserDTO {
  return {
    id: record.id,
    email: record.email,
    username: record.username,
    fullName: record.fullName,
    role: record.role,
    createdAt: record.createdAt,
  };
}

function issueAuthSession(res: Response, record: StoredUserRecord, statusCode = 200): void {
  const token = signToken({
    sub: record.id,
    email: record.email,
    username: record.username,
    role: record.role,
  });
  setSessionCookie(res, token);
  res.status(statusCode).json({ token, user: toPublicUserDto(record) });
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(registerSchema, req.body, 'Помилка валідації реєстраційних даних');
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedUsername = data.username.trim();

    const repo = getRepository();
    if (await repo.findUserByEmail(normalizedEmail)) {
      res.status(409).json({ error: 'Користувач із таким email вже зареєстрований.' });
      return;
    }

    if (await repo.findUserByUsername(normalizedUsername)) {
      res.status(409).json({ error: 'Це ім’я користувача вже зайняте.' });
      return;
    }

    const passwordHash = await hashPassword(data.password);
    const created = await repo.createUser({
      email: normalizedEmail,
      username: normalizedUsername,
      fullName: data.fullName.trim(),
      passwordHash,
      role: 'STUDENT',
    });

    logger.info(`Зареєстровано нового користувача: ${created.email}`);
    issueAuthSession(res, created, 201);
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(loginSchema, req.body, 'Некоректні облікові дані.', false);
    const normalizedEmail = data.email.trim().toLowerCase();

    const repo = getRepository();
    const found = await repo.findUserByEmail(normalizedEmail);
    if (!found) {
      // Вирівнюємо час виконання перевірки для запобігання email enumeration через timing attack
      await verifyPassword(data.password, DUMMY_PASSWORD_HASH);
      res.status(401).json({ error: 'Невірний email або пароль.' });
      return;
    }

    const valid = await verifyPassword(data.password, found.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Невірний email або пароль.' });
      return;
    }

    issueAuthSession(res, found);
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.post(
  '/demo',
  asyncHandler(async (_req, res) => {
    if (!config.enableDemoAuth) {
      res.status(403).json({ error: 'Демо-вхід вимкнено у промисловій конфігурації.' });
      return;
    }

    const repo = getRepository();
    let demo = await repo.findUserByEmail(DEMO_USER_CONFIG.email);
    if (!demo) {
      const passwordHash = await hashPassword(DEMO_USER_CONFIG.password);
      demo = await repo.createUser({
        email: DEMO_USER_CONFIG.email,
        username: DEMO_USER_CONFIG.username,
        fullName: DEMO_USER_CONFIG.fullName,
        passwordHash,
        role: DEMO_USER_CONFIG.role,
      });
    }

    issueAuthSession(res, demo);
  }),
);

authRouter.get(
  '/me',
  authenticateRequired,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const repo = getRepository();
    const found = req.user ? await repo.findUserById(req.user.sub) : null;
    if (!found) {
      res.status(404).json({ error: 'Профіль користувача не знайдено.' });
      return;
    }
    res.json({ user: toPublicUserDto(found) });
  }),
);
