import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

const TOKEN_PREFIX = 'dm_';
/** Write lastUsedAt at most once per minute per token. */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

/** Returned once, on creation only. The plaintext is never stored or logged. */
export interface CreatedApiTokenDto {
  id: string;
  name: string;
  /** Full plaintext token — shown to the user exactly once. */
  token: string;
  last4: string;
  createdAt: Date;
}

export interface ApiTokenListItemDto {
  id: string;
  name: string;
  /** Safe display hint, e.g. "dm_...ab3d". */
  display: string;
  lastUsedAt: Date | null;
  revoked: boolean;
  createdAt: Date;
}

export interface VerifiedApiToken {
  tokenId: string;
  userId: string;
}

/** sha256 hex of a plaintext token. Exported for tests. */
export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** `dm_` + base64url(32 random bytes) — 256 bits of entropy. */
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

@Injectable()
export class ApiTokensService {
  /** In-memory throttle: tokenId → last lastUsedAt write (ms epoch). */
  private readonly lastUsedWrites = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, name: string): Promise<CreatedApiTokenDto> {
    const token = generateToken();
    const row = await this.prisma.apiToken.create({
      data: {
        userId,
        name,
        tokenHash: hashToken(token),
        last4: token.slice(-4),
      },
    });
    return {
      id: row.id,
      name: row.name,
      token,
      last4: row.last4,
      createdAt: row.createdAt,
    };
  }

  async list(userId: string): Promise<ApiTokenListItemDto[]> {
    const rows = await this.prisma.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      display: `${TOKEN_PREFIX}...${r.last4}`,
      lastUsedAt: r.lastUsedAt,
      revoked: r.revoked,
      createdAt: r.createdAt,
    }));
  }

  async revoke(id: string, userId: string): Promise<void> {
    await this.findOwned(id, userId);
    await this.prisma.apiToken.update({
      where: { id },
      data: { revoked: true },
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOwned(id, userId);
    await this.prisma.apiToken.delete({ where: { id } });
  }

  /**
   * Verify a plaintext token by sha256 lookup. Returns null for unknown or
   * revoked tokens — callers must respond with one uniform 401 (no oracle).
   * Updates lastUsedAt at most once per minute per token (fire-and-forget).
   */
  async verify(plaintext: string): Promise<VerifiedApiToken | null> {
    if (!plaintext.startsWith(TOKEN_PREFIX)) return null;
    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash: hashToken(plaintext) },
      select: { id: true, userId: true, revoked: true },
    });
    if (!row || row.revoked) return null;
    this.touchLastUsed(row.id);
    return { tokenId: row.id, userId: row.userId };
  }

  private touchLastUsed(tokenId: string): void {
    const now = Date.now();
    const last = this.lastUsedWrites.get(tokenId) ?? 0;
    if (now - last < LAST_USED_WRITE_INTERVAL_MS) return;
    this.lastUsedWrites.set(tokenId, now);
    void this.prisma.apiToken
      .update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } })
      .catch(() => {
        /* best-effort; token may have been deleted concurrently */
      });
  }

  private async findOwned(id: string, userId: string): Promise<void> {
    const row = await this.prisma.apiToken.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!row) throw new NotFoundException('Token not found');
    if (row.userId !== userId) throw new ForbiddenException('Access denied');
  }
}
