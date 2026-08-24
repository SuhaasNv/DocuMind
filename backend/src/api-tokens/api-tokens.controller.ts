import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTokensService,
  type CreatedApiTokenDto,
  type ApiTokenListItemDto,
} from './api-tokens.service.js';
import { CreateApiTokenDto } from './dto/create-api-token.dto.js';
import {
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';

/** Token creation is rare; keep it tightly throttled. */
const CREATE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/** JWT-guarded by the global APP_GUARD (deny-by-default). */
@Controller('api-tokens')
export class ApiTokensController {
  constructor(private readonly apiTokens: ApiTokensService) {}

  @Post()
  @Throttle(CREATE_THROTTLE)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateApiTokenDto,
  ): Promise<CreatedApiTokenDto> {
    return this.apiTokens.create(user.sub, dto.name);
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload): Promise<ApiTokenListItemDto[]> {
    return this.apiTokens.list(user.sub);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ revoked: true }> {
    await this.apiTokens.revoke(id, user.sub);
    return { revoked: true };
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.apiTokens.remove(id, user.sub);
  }
}
