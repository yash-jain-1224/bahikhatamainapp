import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${service || 'app'}] ${level}: ${message} ${metaStr}`;
  }),
);

export function createLogger(service: string): winston.Logger {
  // In containerized/cloud-native environments, write only to stdout/stderr
  // (the container runtime collects logs). Opt in to file logging via LOG_TO_FILE=true.
  const useFileLogs =
    process.env.LOG_TO_FILE === 'true' || process.env.NODE_ENV === 'development-file';

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service },
    format: logFormat,
    transports: [
      new winston.transports.Console({
        format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
      }),
      ...(useFileLogs
        ? [
            new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
            new winston.transports.File({ filename: 'logs/combined.log' }),
          ]
        : []),
    ],
  });
}

export const logger = createLogger('bahi-khata');
