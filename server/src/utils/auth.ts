import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';

export const SESSION_COOKIE_NAME = 'lf_session';
const JWT_ISSUER = 'logicforge-api';
const JWT_AUDIENCE = 'logicforge-client';

export interface JwtPayloadData {
  sub: string;
  email: string;
  username: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayloadData;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, Math.max(12, config.bcryptCost));
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: JwtPayloadData): string {
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function verifyToken(token: string): JwtPayloadData {
  return jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as JwtPayloadData;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

function extractRequestToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  const cookieToken = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }
  return null;
}

export function authenticateOptional(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const token = extractRequestToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      // Невалідний токен ігнорується для публічних маршрутів
    }
  }
  next();
}

export function authenticateRequired(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const token = extractRequestToken(req);
  if (!token) {
    res.status(401).json({ error: 'Необхідна авторизація (відсутній JWT-токен).' });
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Недійсний або прострочений JWT-токен.' });
  }
}
