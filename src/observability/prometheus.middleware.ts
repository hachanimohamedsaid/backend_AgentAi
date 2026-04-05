import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import {
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
  register,
} from 'prom-client';

type RequestWithId = Request & { requestId?: string };

let defaultMetricsStarted = false;

if (!defaultMetricsStarted) {
  collectDefaultMetrics({ register });
  defaultMetricsStarted = true;
}

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests by method, route, and status code',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const processResidentMemoryBytes = new Gauge({
  name: 'app_process_resident_memory_bytes',
  help: 'Application resident memory in bytes',
  registers: [register],
  collect() {
    this.set(process.memoryUsage().rss);
  },
});

export const processHeapUsedBytes = new Gauge({
  name: 'app_process_heap_used_bytes',
  help: 'Application heap memory used in bytes',
  registers: [register],
  collect() {
    this.set(process.memoryUsage().heapUsed);
  },
});

export const databaseConnectionPoolSize = new Gauge({
  name: 'db_connection_pool_size',
  help: 'Number of active database connections',
  labelNames: ['pool_name'],
  registers: [register],
});

@Injectable()
export class PrometheusMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
      const statusCode = String(res.statusCode);
      const routePath = req.route?.path ?? req.path;
      const method = req.method;

      httpRequestsTotal.inc({
        method,
        route: routePath,
        status_code: statusCode,
      });

      httpRequestDurationSeconds.observe(
        {
          method,
          route: routePath,
          status_code: statusCode,
        },
        durationSeconds,
      );

      const requestId = req.requestId ?? 'unknown';
      console.log(
        `[${requestId}] ${method} ${routePath} - ${statusCode} (${(durationSeconds * 1000).toFixed(2)}ms)`,
      );
    });

    next();
  }
}
