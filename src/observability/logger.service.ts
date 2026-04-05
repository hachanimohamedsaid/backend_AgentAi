import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import * as winston from 'winston';

type RequestWithId = Request & { requestId?: string };

@Injectable({ scope: Scope.REQUEST })
export class LoggerService {
  private readonly logger: winston.Logger;

  constructor(@Inject(REQUEST) private readonly request: RequestWithId) {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: {
        service: 'nestjs-backend',
        environment: process.env.NODE_ENV || 'development',
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(
              ({ level, message, requestId, timestamp, ...meta }) => {
                const reqId = (requestId as string | undefined) || 'none';
                const metaStr = Object.keys(meta).length
                  ? JSON.stringify(meta)
                  : '';
                return `[${reqId}] [${level}] ${String(message)} ${metaStr}`;
              },
            ),
          ),
        }),
      ],
    });
  }

  private getMeta() {
    const requestId = this.request?.requestId;
    return requestId ? { requestId } : {};
  }

  log(message: string, meta?: Record<string, unknown>) {
    this.logger.info(message, { ...this.getMeta(), ...meta });
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>) {
    this.logger.error(message, {
      ...this.getMeta(),
      ...meta,
      error: {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      },
    });
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.logger.warn(message, { ...this.getMeta(), ...meta });
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.logger.debug(message, { ...this.getMeta(), ...meta });
  }
}
