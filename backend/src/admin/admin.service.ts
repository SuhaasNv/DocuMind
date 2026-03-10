import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { DocumentStatus, Role } from '../../generated/prisma/client.js';

const QUEUE_NAME = 'document-processing';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAME) private readonly docQueue: Queue,
  ) {}

  // ── Metrics ──────────────────────────────────────────────────────────────

  async getMetrics() {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [
      totalUsers,
      totalDocuments,
      totalChunks,
      onlineUsers,
      pendingDocuments,
      processingDocuments,
      failedDocuments,
      doneDocuments,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.document.count(),
      this.prisma.documentChunk.count(),
      this.prisma.user.count({ where: { lastActiveAt: { gte: fiveMinsAgo } } }),
      this.prisma.document.count({ where: { status: 'PENDING' } }),
      this.prisma.document.count({ where: { status: 'PROCESSING' } }),
      this.prisma.document.count({ where: { status: 'FAILED' } }),
      this.prisma.document.count({ where: { status: 'DONE' } }),
    ]);

    let activeJobs = 0;
    let waitingJobs = 0;
    let failedJobs = 0;
    let completedJobs = 0;

    try {
      const [active, waiting, failed, completed] = await Promise.all([
        this.docQueue.getActiveCount(),
        this.docQueue.getWaitingCount(),
        this.docQueue.getFailedCount(),
        this.docQueue.getCompletedCount(),
      ]);
      activeJobs = active;
      waitingJobs = waiting;
      failedJobs = failed;
      completedJobs = completed;
    } catch {
      // Redis may be unavailable in some environments
    }

    return {
      totalUsers,
      totalDocuments,
      totalChunks,
      onlineUsers,
      documentsByStatus: {
        pending: pendingDocuments,
        processing: processingDocuments,
        done: doneDocuments,
        failed: failedDocuments,
      },
      jobs: {
        active: activeJobs,
        waiting: waitingJobs,
        failed: failedJobs,
        completed: completedJobs,
      },
    };
  }

  // ── Legacy stats (kept for backward compat) ───────────────────────────────

  async getStats() {
    const metrics = await this.getMetrics();
    return {
      totalUsers: metrics.totalUsers,
      totalDocuments: metrics.totalDocuments,
      onlineUsers: metrics.onlineUsers,
      pendingDocuments: metrics.documentsByStatus.pending,
      processingDocuments: metrics.documentsByStatus.processing,
    };
  }

  // ── Online users ──────────────────────────────────────────────────────────

  async getOnlineUsers() {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.prisma.user.findMany({
      where: { lastActiveAt: { gte: fiveMinsAgo } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        lastActiveAt: true,
        _count: { select: { documents: true } },
      },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async getAllUsers(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          lastActiveAt: true,
          createdAt: true,
          _count: { select: { documents: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);
    return { users, total, page, limit };
  }

  async updateUserRole(targetId: string, role: Role) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    return updated;
  }

  async deleteUser(targetId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === Role.ADMIN) {
      throw new ForbiddenException('Cannot delete admin accounts');
    }
    await this.prisma.user.delete({ where: { id: targetId } });
    return { success: true };
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  async getAllDocuments(page = 1, limit = 20, status?: DocumentStatus) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          status: true,
          progress: true,
          size: true,
          uploadedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { uploadedAt: 'desc' },
      }),
      this.prisma.document.count({ where }),
    ]);
    return { documents, total, page, limit };
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────

  async getJobStats() {
    try {
      const [active, waiting, failed, completed, delayed] = await Promise.all([
        this.docQueue.getJobs(['active']),
        this.docQueue.getJobs(['waiting']),
        this.docQueue.getJobs(['failed']),
        this.docQueue.getJobs(['completed']),
        this.docQueue.getJobs(['delayed']),
      ]);

      const mapJob = (j: import('bullmq').Job) => {
        const job = j as import('bullmq').Job & { failedReason?: string };
        return {
          id: j.id,
          name: j.name,
          data: j.data as Record<string, unknown>,
          attemptsMade: j.attemptsMade,
          failedReason: job.failedReason ?? null,
          timestamp: j.timestamp,
          processedOn: j.processedOn ?? null,
          finishedOn: j.finishedOn ?? null,
        };
      };

      return {
        counts: {
          active: active.length,
          waiting: waiting.length,
          failed: failed.length,
          completed: completed.length,
          delayed: delayed.length,
        },
        jobs: {
          active: active.map(mapJob),
          waiting: waiting.map(mapJob),
          failed: failed.map(mapJob).slice(0, 20),
          completed: completed.map(mapJob).slice(0, 20),
          delayed: delayed.map(mapJob),
        },
      };
    } catch {
      return {
        counts: { active: 0, waiting: 0, failed: 0, completed: 0, delayed: 0 },
        jobs: {
          active: [],
          waiting: [],
          failed: [],
          completed: [],
          delayed: [],
        },
        error: 'Queue unavailable',
      };
    }
  }

  // ── RAG Analytics ─────────────────────────────────────────────────────────

  async getRagStats() {
    // Derive query volume from document chunks as a proxy for RAG activity.
    // A full production system would persist per-query latency rows.
    const [totalChunks, totalDocuments, recentDocuments] = await Promise.all([
      this.prisma.documentChunk.count(),
      this.prisma.document.count({ where: { status: 'DONE' } }),
      this.prisma.document.findMany({
        where: { status: 'DONE' },
        select: { uploadedAt: true },
        orderBy: { uploadedAt: 'desc' },
        take: 30,
      }),
    ]);

    // Build a simple daily activity histogram from document processing dates
    const dailyCounts: Record<string, number> = {};
    const now = Date.now();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      dailyCounts[d.toISOString().slice(0, 10)] = 0;
    }
    for (const doc of recentDocuments) {
      const key = doc.uploadedAt.toISOString().slice(0, 10);
      if (key in dailyCounts) dailyCounts[key]++;
    }

    return {
      totalProcessedDocuments: totalDocuments,
      totalChunks,
      avgChunksPerDocument:
        totalDocuments > 0 ? Math.round(totalChunks / totalDocuments) : 0,
      // Placeholder latency metrics — replace with real DB table when instrumenting
      avgRetrievalMs: null,
      avgFirstTokenMs: null,
      avgResponseMs: null,
      dailyDocumentActivity: Object.entries(dailyCounts).map(
        ([date, count]) => ({
          date,
          count,
        }),
      ),
    };
  }

  // ── System Health ─────────────────────────────────────────────────────────

  async getSystemHealth() {
    const checks = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'ok' as const),
      this.docQueue.getActiveCount().then(() => 'ok' as const),
    ]);

    const [dbResult, redisResult] = checks;

    return {
      database: dbResult.status === 'fulfilled' ? 'ok' : 'error',
      redis: redisResult.status === 'fulfilled' ? 'ok' : 'error',
      queue: redisResult.status === 'fulfilled' ? 'ok' : 'error',
      llm:
        (process.env.GEMINI_API_KEY?.length ?? 0) > 0 ||
        (process.env.OPENAI_API_KEY?.length ?? 0) > 0 ||
        process.env.LLM_PROVIDER === 'ollama'
          ? 'configured'
          : 'not_configured',
      timestamp: new Date().toISOString(),
    };
  }
}
