import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

function validateEnv(): void {
  const required = ['JWT_SECRET', 'DATABASE_URL'] as const;
  const missing = required.filter((key) => {
    const v = process.env[key];
    return v === undefined || v === '';
  });
  if (missing.length > 0) {
    console.error(
      `[FATAL] Missing required environment variables: ${missing.join(', ')}. Set them in .env (see .env.example).`,
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL?.includes('5432')) {
    console.warn(
      '[WARN] DATABASE_URL does not use port 5432. If using docker-compose Postgres, use postgresql://...@localhost:5432/...',
    );
  }
}

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS: allow frontend with credentials for auth/SSE.
  // CORS_ORIGIN can be a single origin or comma-separated list (e.g. "https://app.railway.app,http://localhost:8080").
  const corsOriginEnv = process.env.CORS_ORIGIN ?? 'http://localhost:8080';
  const corsOrigins = corsOriginEnv.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : ['http://localhost:8080'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  console.log('[CORS] Allowed origins:', corsOrigins);

  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(
    '[API] GET /health (connectivity check), POST /auth/register, POST /auth/login',
  );
}

// Fail loudly on DB/startup errors: log and exit with code 1 (no silent catch).
bootstrap().catch((err) => {
  console.error('Application failed to start:', err);
  process.exit(1);
});
