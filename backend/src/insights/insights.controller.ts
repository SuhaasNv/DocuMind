import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';
import { InsightsService } from './insights.service.js';
import { CreateInsightDto } from './dto/create-insight.dto.js';
import { UpdateInsightDto } from './dto/update-insight.dto.js';
import {
  InsightExportQueryDto,
  InsightQueryDto,
} from './dto/insight-query.dto.js';
import type {
  InsightListResponseDto,
  InsightResponseDto,
} from './dto/insight-response.dto.js';
import { EXPORT_FILENAME, insightsToMarkdown } from './insight-export.js';

/** Limit pin creation to prevent DB abuse. */
const PIN_THROTTLE = { default: { limit: 30, ttl: 60000 } }; // 30 per minute
/** Exports are heavier (up to 500 rows serialized). */
const EXPORT_THROTTLE = { default: { limit: 10, ttl: 60000 } }; // 10 per minute

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Post()
  @Throttle(PIN_THROTTLE)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateInsightDto,
  ): Promise<InsightResponseDto> {
    return this.insightsService.create(user.sub, dto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: InsightQueryDto,
  ): Promise<InsightListResponseDto> {
    return this.insightsService.findAll(user.sub, query);
  }

  /** Markdown download of the (filtered) garden. Declared before :id routes. */
  @Get('export')
  @Throttle(EXPORT_THROTTLE)
  async export(
    @CurrentUser() user: JwtPayload,
    @Query() query: InsightExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const insights = await this.insightsService.findForExport(user.sub, {
      query: query.query,
      tag: query.tag,
    });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${EXPORT_FILENAME}"`,
    );
    return insightsToMarkdown(insights);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateInsightDto,
  ): Promise<InsightResponseDto> {
    return this.insightsService.update(id, user.sub, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.insightsService.remove(id, user.sub);
  }
}
