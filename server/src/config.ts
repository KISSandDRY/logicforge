import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const INSECURE_PLACEHOLDER_SECRETS = new Set([
  'change-in-production',
  'logicforge-dev-jwt-secret-key-2026',
  'logicforge-super-secret-jwt-key-change-in-production',
  'secret',
]);

function resolveJwtSecret(nodeEnv: string): string {
  const envSecret = process.env.JWT_SECRET?.trim() ?? '';
  if (nodeEnv === 'production') {
    if (envSecret.length < 32 || INSECURE_PLACEHOLDER_SECRETS.has(envSecret)) {
      throw new Error(
        'SECURITY CONFIG ERROR: JWT_SECRET must be set to a strong secret (>= 32 chars) in production.',
      );
    }
    return envSecret;
  }
  if (envSecret.length >= 16) {
    return envSecret;
  }
  // Ephemeral random secret per dev/test process instead of hardcoded credential string
  return crypto.randomBytes(48).toString('hex');
}

function resolveCorsOrigins(nodeEnv: string): string {
  const raw = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173').trim();
  if (nodeEnv === 'production' && raw === '*') {
    throw new Error(
      'SECURITY CONFIG ERROR: Wildcard CORS_ORIGIN="*" is disallowed in production. Specify explicit origin allowlist.',
    );
  }
  return raw;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv,
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: resolveJwtSecret(nodeEnv),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
  bcryptCost: Math.max(12, Number(process.env.BCRYPT_COST ?? 12) || 12),
  corsOrigin: resolveCorsOrigins(nodeEnv),
  forceEmbeddedDb: process.env.USE_EMBEDDED_DB === 'true',
  enableDemoAuth: nodeEnv !== 'production' || process.env.ENABLE_DEMO_AUTH === 'true',
};
