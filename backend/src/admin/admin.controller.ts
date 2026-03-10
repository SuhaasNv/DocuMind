import {
  Controller,
  Get,
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
import { Role, DocumentStatus } from '../../generated/prisma/client.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';

const VALID_STATUSES = Object.values(DocumentStatus);

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

  /** Legacy – keep for backward compat with existing frontend */
  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
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
  async getAllUsers(
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    return this.adminService.getAllUsers(
      parseInt(page) || 1,
      parseInt(limit) || 20,
    );
  }

  @Patch('users/:id/role')
  async updateUserRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.adminService.updateUserRole(id, dto.role);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  @Get('documents')
  async getAllDocuments(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('status') status?: string,
  ) {
    let docStatus: DocumentStatus | undefined;
    if (status) {
      if (!VALID_STATUSES.includes(status as DocumentStatus)) {
        throw new BadRequestException(
          `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        );
      }
      docStatus = status as DocumentStatus;
    }
    return this.adminService.getAllDocuments(
      parseInt(page) || 1,
      parseInt(limit) || 20,
      docStatus,
    );
  }

  // ── Job Queue ─────────────────────────────────────────────────────────────

  @Get('jobs')
  async getJobs() {
    return this.adminService.getJobStats();
  }

  // ── RAG Analytics ─────────────────────────────────────────────────────────

  @Get('rag-stats')
  async getRagStats() {
    return this.adminService.getRagStats();
  }
}
