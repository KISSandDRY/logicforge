import { config } from '../config';
import { logger } from '../utils/logger';
import { EmbeddedRepository } from './embeddedRepository';
import { PrismaRepository } from './prismaRepository';
import type { IStorageRepository } from './types';

let activeRepo: IStorageRepository | null = null;

export async function initializeRepository(): Promise<IStorageRepository> {
  if (activeRepo) {
    return activeRepo;
  }

  if (config.nodeEnv === 'test' || config.forceEmbeddedDb || !config.databaseUrl) {
    activeRepo = new EmbeddedRepository({ inMemoryOnly: config.nodeEnv === 'test' });
    logger.info(`Ініціалізовано вбудоване сховище (${activeRepo.driverName}).`);
    return activeRepo;
  }

  const prismaRepo = new PrismaRepository();
  const ok = await prismaRepo.checkConnection();
  if (ok) {
    activeRepo = prismaRepo;
    logger.info('Успішно підключено до СУБД PostgreSQL через Prisma ORM.');
    return activeRepo;
  }

  logger.warn(
    'СУБД PostgreSQL недоступна за DATABASE_URL — активовано локальне резервне сховище EmbeddedRepository.',
  );
  activeRepo = new EmbeddedRepository();
  return activeRepo;
}

export function getRepository(): IStorageRepository {
  if (!activeRepo) {
    activeRepo = new EmbeddedRepository({ inMemoryOnly: config.nodeEnv === 'test' });
  }
  return activeRepo;
}
