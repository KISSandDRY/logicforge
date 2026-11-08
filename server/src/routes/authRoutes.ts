import { Router } from 'express';
import { getRepository } from '../repositories';
import {
  authenticateRequired,
  hashPassword,
  signToken,
  verifyPassword,
  type AuthenticatedRequest,
} from '../utils/auth';
import { logger } from '../utils/logger';
import { loginSchema, registerSchema } from '../validation/schemas';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Помилка валідації реєстраційних даних',
      details: parsed.error.flatten(),
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

  logger.info(`Зареєстровано нового користувача: ${created.email}`);
  const { passwordHash: _ph, ...userDto } = created;
  res.status(201).json({ token, user: userDto });
});

authRouter.post('/login', async (req, res) => {
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

  const { passwordHash: _ph, ...userDto } = found;
  res.json({ token, user: userDto });
});

authRouter.post('/demo', async (_req, res) => {
  const repo = getRepository();
  let demo = await repo.findUserByEmail('student@lpnu.ua');
  if (!demo) {
    const passwordHash = await hashPassword('DemoPass123!');
    demo = await repo.createUser({
      email: 'student@lpnu.ua',
      username: 'lpnu_engineer',
      fullName: 'Студент Кафедри АСУ',
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
  const { passwordHash: _ph, ...userDto } = demo;
  res.json({ token, user: userDto });
});

authRouter.get('/me', authenticateRequired, async (req: AuthenticatedRequest, res) => {
  const repo = getRepository();
  const found = req.user ? await repo.findUserById(req.user.sub) : null;
  if (!found) {
    res.status(404).json({ error: 'Профіль користувача не знайдено.' });
    return;
  }
  const { passwordHash: _ph, ...userDto } = found;
  res.json({ user: userDto });
});
