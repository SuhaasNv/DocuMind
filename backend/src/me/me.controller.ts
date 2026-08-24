import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';
import { MeService, type MeStatsDto } from './me.service.js';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get('stats')
  async stats(@CurrentUser() user: JwtPayload): Promise<MeStatsDto> {
    return this.meService.getStats(user.sub);
  }
}
