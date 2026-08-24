import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
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
} from './dto/list-query.dto.js';
import { PagePaginationDto } from '../common/dto/pagination.dto.js';

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

  // ── RAG Analytics ─────────────────────────────────────────────────────────

  @Get('rag-stats')
  async getRagStats() {
    return this.adminService.getRagStats();
  }
}
