import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Public } from '../common/decorators/public.decorator.js';
import {
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';
import {
  ShareService,
  type ShareCreatedDto,
  type ShareListItemDto,
} from './share.service.js';
import type { AnswerSnapshot } from './share.util.js';
import { CreateShareDto } from './dto/create-share.dto.js';

/** Public endpoint is unauthenticated — throttle well below the global 100/min. */
const PUBLIC_SHARE_THROTTLE = { default: { limit: 30, ttl: 60000 } }; // 30 per minute per IP

@Controller('share')
@UseGuards(JwtAuthGuard)
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateShareDto,
  ): Promise<ShareCreatedDto> {
    return this.shareService.create(user.sub, dto);
  }

  @Get('mine')
  async mine(@CurrentUser() user: JwtPayload): Promise<ShareListItemDto[]> {
    return this.shareService.listMine(user.sub);
  }

  @Post(':id/revoke')
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.shareService.revoke(id, user.sub);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.shareService.remove(id, user.sub);
  }

  /**
   * The only unauthenticated data endpoint in the app. Token-format gated,
   * aggressively throttled, never indexed, never cached. Headers are set
   * before the lookup so 404/410 responses carry them too.
   */
  @Public()
  @Throttle(PUBLIC_SHARE_THROTTLE)
  @Get('public/:token')
  async getPublic(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AnswerSnapshot> {
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', 'no-store');
    return this.shareService.getPublic(token);
  }
}
