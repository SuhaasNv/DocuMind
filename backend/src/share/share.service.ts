import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CreateShareDto } from './dto/create-share.dto.js';
import {
  AnswerSnapshot,
  SHARE_TOKEN_RE,
  buildSnapshot,
  generateShareToken,
  shareState,
} from './share.util.js';

export interface ShareCreatedDto {
  token: string;
  /** Frontend route path for the public page (host-relative). */
  url: string;
}

export interface ShareListItemDto {
  id: string;
  token: string;
  createdAt: Date;
  revoked: boolean;
  expiresAt: Date | null;
  questionExcerpt: string;
}

// Security note: error messages below are static — never echo tokens/ids back.
const NOT_FOUND_MSG = 'Share link not found';
const GONE_MSG = 'This share link is no longer available';

@Injectable()
export class ShareService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateShareDto): Promise<ShareCreatedDto> {
    const snapshot = buildSnapshot({
      question: dto.question,
      answer: dto.answer,
      sources: dto.sources,
    });
    const row = await this.prisma.sharedAnswer.create({
      data: {
        userId,
        token: generateShareToken(),
        messageSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    return { token: row.token, url: `/s/${row.token}` };
  }

  async listMine(userId: string): Promise<ShareListItemDto[]> {
    const rows = await this.prisma.sharedAnswer.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => {
      const snap = row.messageSnapshot as unknown as Partial<AnswerSnapshot>;
      return {
        id: row.id,
        token: row.token,
        createdAt: row.createdAt,
        revoked: row.revoked,
        expiresAt: row.expiresAt,
        questionExcerpt:
          typeof snap.question === 'string' ? snap.question.slice(0, 120) : '',
      };
    });
  }

  async revoke(id: string, userId: string): Promise<void> {
    await this.findOwned(id, userId);
    await this.prisma.sharedAnswer.update({
      where: { id },
      data: { revoked: true },
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOwned(id, userId);
    await this.prisma.sharedAnswer.delete({ where: { id } });
  }

  /**
   * Public lookup: strict token format gate (bad shape -> 404, constant
   * message), revoked/expired -> 410. Returns only the frozen snapshot.
   */
  async getPublic(token: string): Promise<AnswerSnapshot> {
    if (!SHARE_TOKEN_RE.test(token)) {
      throw new NotFoundException(NOT_FOUND_MSG);
    }
    const row = await this.prisma.sharedAnswer.findUnique({
      where: { token },
    });
    if (!row) throw new NotFoundException(NOT_FOUND_MSG);
    if (shareState(row) === 'gone') throw new GoneException(GONE_MSG);
    return row.messageSnapshot as unknown as AnswerSnapshot;
  }

  /** Ownership check for revoke/delete: scoped by userId so another user's id is a plain 404 (no existence oracle). */
  private async findOwned(id: string, userId: string): Promise<void> {
    const row = await this.prisma.sharedAnswer.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException(NOT_FOUND_MSG);
  }
}
