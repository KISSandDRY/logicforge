import { Router } from 'express';
import type { UserDTO } from '@logicforge/shared-types';
import { z } from 'zod';
import { config } from '../config';
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

export const authRouter = Router();

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

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Помилка валідації реєстраційних даних',
        details: z.flattenError(parsed.error),
      });
      return;
    }

    const repo = getRepository();
    const { email, username, fullName, password } = parsed.data;

    const existingEmail = await repo.findUserByEmail(email);
    if (existingEmail) {
      res.status(409).json({ error: 'Користувач із таким email вже зареєстрований.' });
      return;
    }

    const existingUsername = await repo.findUserByUsername(username);
    if (existingUsername) {
      res.status(409).json({ error: 'Це ім’я користувача вже зайняте.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const created = await repo.createUser({
      email,
      username,
      fullName,
      passwordHash,
      role: 'STUDENT',
    });

    const token = signToken({
      sub: created.id,
      email: created.email,
      username: created.username,
      role: created.role,
    });

    setSessionCookie(res, token);
    logger.info(`Зареєстровано нового користувача: ${created.email}`);
    res.status(201).json({ token, user: toPublicUserDto(created) });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Некоректні облікові дані.' });
      return;
    }

    const repo = getRepository();
    const found = await repo.findUserByEmail(parsed.data.email);
    if (!found) {
      res.status(401).json({ error: 'Невірний email або пароль.' });
      return;
    }

    const valid = await verifyPassword(parsed.data.password, found.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Невірний email або пароль.' });
      return;
    }

    const token = signToken({
      sub: found.id,
      email: found.email,
      username: found.username,
      role: found.role,
    });

    setSessionCookie(res, token);
    res.json({ token, user: toPublicUserDto(found) });
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
    let demo = await repo.findUserByEmail('student@lpnu.ua');
    if (!demo) {
      const passwordHash = await hashPassword('DemoPass123!');
      demo = await repo.createUser({
        email: 'student@lpnu.ua',
        username: 'lpnu_engineer',
        fullName: 'Інженер-схемотехнік',
        passwordHash,
        role: 'STUDENT',
      });
    }

    const token = signToken({
      sub: demo.id,
      email: demo.email,
      username: demo.username,
      role: demo.role,
    });
    setSessionCookie(res, token);
    res.json({ token, user: toPublicUserDto(demo) });
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
