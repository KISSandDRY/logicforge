import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'logicforge-dev-jwt-secret-key-2026',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  forceEmbeddedDb: process.env.USE_EMBEDDED_DB === 'true',
};
