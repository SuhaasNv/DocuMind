import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';

/**
 * Health check for frontend connectivity verification.
 * No auth required. Frontend calls GET /health on app boot.
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
