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

  // CORS: allow frontend (http://localhost:8080) with credentials for auth/SSE.
  // Default to http://localhost:8080 so local dev works without setting CORS_ORIGIN in .env.
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:8080';
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  console.log('[CORS] Allowed origin:', corsOrigin);

  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log('[API] GET /health (connectivity check), POST /auth/register, POST /auth/login');
}

// Fail loudly on DB/startup errors: log and exit with code 1 (no silent catch).
bootstrap().catch((err) => {
  console.error('Application failed to start:', err);
  process.exit(1);
});
