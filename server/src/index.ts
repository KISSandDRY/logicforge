import { createApp } from './app';
import { config } from './config';
import { initializeRepository } from './repositories';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  await initializeRepository();
  const app = createApp();

  app.listen(config.port, () => {
    logger.info(`Сервер LogicForge REST API запущено на порту http://localhost:${config.port}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Критична помилка запуску сервера', err);
  process.exit(1);
});
