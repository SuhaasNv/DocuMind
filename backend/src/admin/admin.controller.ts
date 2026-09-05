import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import {
  AdminUsersQueryDto,
  AdminDocumentsQueryDto,
  AdminEvalRunsQueryDto,
} from './dto/list-query.dto.js';
import { PagePaginationDto } from '../common/dto/pagination.dto.js';

/** BullMQ job ids are short opaque strings; reject garbage before hitting Redis. */
export function validJobId(id: string): string {
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    throw new BadRequestException('Invalid job id');
  }
  return id;
}

@Controller('admin')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── System Metrics ────────────────────────────────────────────────────────

  @Get('metrics')
  async getMetrics() {
    return this.adminService.getMetrics();
  }

  // ── System Health ─────────────────────────────────────────────────────────

  @Get('health')
  async getHealth() {
    return this.adminService.getSystemHealth();
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  @Get('users/online')
  async getOnlineUsers() {
    return this.adminService.getOnlineUsers();
  }

  @Get('users')
  async getAllUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.getAllUsers(query.page, query.limit, query.search);
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.adminService.updateUserRole(user.sub, id, dto.role);
  }

  @Delete('users/:id')
  async deleteUser(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.adminService.deleteUser(user.sub, id);
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  @Get('documents')
  async getAllDocuments(@Query() query: AdminDocumentsQueryDto) {
    return this.adminService.getAllDocuments(
      query.page,
      query.limit,
      query.status,
      query.search,
    );
  }

  // ── Job Queue ─────────────────────────────────────────────────────────────

  @Get('jobs')
  async getJobs(@Query() query: PagePaginationDto) {
    return this.adminService.getJobStats(query.page, query.limit);
  }

  @Post('jobs/retry-failed')
  async retryAllFailedJobs(@CurrentUser() user: JwtPayload) {
    return this.adminService.retryAllFailedJobs(user.sub);
  }

  @Post('jobs/clean')
  async cleanCompletedJobs(@CurrentUser() user: JwtPayload) {
    return this.adminService.cleanCompletedJobs(user.sub);
  }

  @Post('jobs/:id/retry')
  async retryJob(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.adminService.retryJob(user.sub, validJobId(id));
  }

  @Delete('jobs/:id')
  async removeJob(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.adminService.removeJob(user.sub, validJobId(id));
  }

  // ── Document operations ───────────────────────────────────────────────────

  @Delete('documents/:id')
  async deleteDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.adminService.deleteDocument(user.sub, id);
  }

  @Post('documents/:id/reprocess')
  async reprocessDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.adminService.reprocessDocument(user.sub, id);
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  // Read-only by design: audit entries are written by the service on every
  // mutating admin action; there are no create/update/delete routes for them.

  @Get('audit')
  async getAuditLog(@Query() query: PagePaginationDto) {
    return this.adminService.getAuditLog(query.page, query.limit);
  }

  // ── Eval harness runs ─────────────────────────────────────────────────────
  // Read-only: rows are written directly to the DB by backend/eval/run-*.ts,
  // not through this API.

  @Get('eval-runs')
  async getEvalRuns(@Query() query: AdminEvalRunsQueryDto) {
    return this.adminService.getEvalRuns(query.page, query.limit, query.kind);
  }

  @Get('eval-runs/:id')
  async getEvalRun(@Param('id') id: string) {
    return this.adminService.getEvalRun(id);
  }

  // ── RAG Analytics ─────────────────────────────────────────────────────────

  @Get('rag-stats')
  async getRagStats() {
    return this.adminService.getRagStats();
  }
}
