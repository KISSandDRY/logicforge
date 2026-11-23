import fs from 'node:fs';
import path from 'node:path';

const logsDir = path.resolve(process.cwd(), 'logs');

function appendToLogFile(level: string, message: string, meta?: unknown): void {
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const safeMeta =
      process.env.NODE_ENV === 'production' && meta && typeof meta === 'object' && 'stack' in meta
        ? { ...(meta as Record<string, unknown>), stack: undefined }
        : meta;
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(safeMeta !== undefined ? { meta: safeMeta } : {}),
    });
    fs.appendFileSync(path.join(logsDir, 'app.log'), `${line}\n`, 'utf8');
  } catch {
    // Безпечне ігнорування помилок запису у read-only контейнерних середовиств
  }
}

export const logger = {
  info(message: string, meta?: unknown): void {
    if (process.env.NODE_ENV !== 'test') {
      console.info(`[INFO] ${message}`, meta ?? '');
    }
    appendToLogFile('INFO', message, meta);
  },
  warn(message: string, meta?: unknown): void {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[WARN] ${message}`, meta ?? '');
    }
    appendToLogFile('WARN', message, meta);
  },
  error(message: string, meta?: unknown): void {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[ERROR] ${message}`, meta ?? '');
    }
    appendToLogFile('ERROR', message, meta);
  },
};
