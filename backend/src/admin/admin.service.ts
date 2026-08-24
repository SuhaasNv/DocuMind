import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatCacheService } from '../rag/chat-cache.service.js';
import { collectionCacheScope } from '../collections/collections.service.js';
import { DocumentStatus, Role } from '../../generated/prisma/client.js';

const QUEUE_NAME = 'document-processing';
const JOB_STATES = [
  'active',
  'waiting',
  'failed',
  'completed',
  'delayed',
] as const;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatCache: ChatCacheService,
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

  async getAllUsers(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const trimmed = search?.trim();
    const where = trimmed
      ? {
          OR: [
            { name: { contains: trimmed, mode: 'insensitive' as const } },
            { email: { contains: trimmed, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
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
      this.prisma.user.count({ where }),
    ]);
    return { users, total, page, limit };
  }

  async updateUserRole(actingUserId: string, targetId: string, role: Role) {
    if (actingUserId === targetId && role !== Role.ADMIN) {
      throw new ConflictException('You cannot demote your own account');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === Role.ADMIN && role !== Role.ADMIN) {
      await this.assertNotLastAdmin('demote');
    }

    return this.prisma.user.update({
      where: { id: targetId },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  /**
   * Complete user deletion: DB rows (one delete — every user-owned table's
   * FK is ON DELETE CASCADE, including shared_answers, verified in
   * schema.prisma), uploaded files on disk (best-effort unlink), and chat
   * cache scopes (per document + per owned collection).
   */
  async deleteUser(actingUserId: string, targetId: string) {
    if (actingUserId === targetId) {
      throw new ConflictException('You cannot delete your own account');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: {
        documents: { select: { id: true, filePath: true } },
        collections: {
          select: {
            id: true,
            documents: { select: { documentId: true } },
          },
        },
      },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === Role.ADMIN) {
      await this.assertNotLastAdmin('delete');
    }

    await this.prisma.user.delete({ where: { id: targetId } });

    for (const doc of target.documents) {
      if (!doc.filePath) continue;
      try {
        await unlink(path.join(process.cwd(), doc.filePath));
      } catch (err) {
        this.logger.warn(
          `Failed to delete file for document ${doc.id} at ${doc.filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    for (const doc of target.documents) {
      void this.chatCache.invalidateScope(doc.id);
    }
    for (const col of target.collections) {
      void this.chatCache.invalidateScope(
        collectionCacheScope(
          col.id,
          col.documents.map((d) => d.documentId),
        ),
      );
    }
    return { success: true };
  }

  /** 409 when the system has a single ADMIN left (demoting/deleting it would lock everyone out). */
  private async assertNotLastAdmin(action: 'demote' | 'delete'): Promise<void> {
    const admins = await this.prisma.user.count({
      where: { role: Role.ADMIN },
    });
    if (admins <= 1) {
      throw new ConflictException(
        `Cannot ${action} the only remaining admin account`,
      );
    }
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  async getAllDocuments(
    page = 1,
    limit = 20,
    status?: DocumentStatus,
    search?: string,
  ) {
    const skip = (page - 1) * limit;
    const trimmed = search?.trim();
    const where = {
      ...(status ? { status } : {}),
      ...(trimmed
        ? {
            OR: [
              { name: { contains: trimmed, mode: 'insensitive' as const } },
              {
                user: {
                  email: { contains: trimmed, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    };

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

  async getJobStats(page = 1, limit = 20) {
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    try {
      const counts = await this.docQueue.getJobCounts(...JOB_STATES);
      const [active, waiting, failed, completed, delayed] = await Promise.all(
        JOB_STATES.map((state) => this.docQueue.getJobs([state], start, end)),
      );

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
          active: counts.active ?? 0,
          waiting: counts.waiting ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
          delayed: counts.delayed ?? 0,
        },
        jobs: {
          active: active.map(mapJob),
          waiting: waiting.map(mapJob),
          failed: failed.map(mapJob),
          completed: completed.map(mapJob),
          delayed: delayed.map(mapJob),
        },
        page,
        limit,
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
        page,
        limit,
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
