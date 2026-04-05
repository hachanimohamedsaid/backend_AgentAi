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

function normalizeRouteForMetrics(path: string, statusCode: number): string {
  // Keep route cardinality low by grouping dynamic/missing routes.
  if (statusCode === 404) {
    return '/not-found';
  }
  return path || 'unknown';
}

function resolveRequestSource(req: Request): string {
  const explicitSource = req.headers['x-client-source'];
  if (typeof explicitSource === 'string' && explicitSource.trim().length > 0) {
    return explicitSource.trim().toLowerCase();
  }

  const userAgent = String(req.headers['user-agent'] ?? '').toLowerCase();
  if (userAgent.includes('flutter') || userAgent.includes('dart')) {
    return 'flutter-unknown';
  }
  if (userAgent.includes('mozilla')) {
    return 'web-unknown';
  }
  return 'unknown';
}

let defaultMetricsStarted = false;

if (!defaultMetricsStarted) {
  collectDefaultMetrics({ register });
  defaultMetricsStarted = true;
}

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests by method, route, status code, and source',
  labelNames: ['method', 'route', 'status_code', 'source'],
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds by source',
  labelNames: ['method', 'route', 'status_code', 'source'],
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
      const statusCodeNumber = res.statusCode;
      const statusCode = String(statusCodeNumber);
      const rawPath = req.route?.path ?? req.path;
      const routePath = normalizeRouteForMetrics(rawPath, statusCodeNumber);
      const method = req.method;
      const source = resolveRequestSource(req);

      httpRequestsTotal.inc({
        method,
        route: routePath,
        status_code: statusCode,
        source,
      });

      httpRequestDurationSeconds.observe(
        {
          method,
          route: routePath,
          status_code: statusCode,
          source,
        },
        durationSeconds,
      );

      const requestId = req.requestId ?? 'unknown';
      console.log(
        `[${requestId}] [${source}] ${method} ${rawPath} - ${statusCode} (${(durationSeconds * 1000).toFixed(2)}ms)`,
      );
    });

    next();
  }
}
