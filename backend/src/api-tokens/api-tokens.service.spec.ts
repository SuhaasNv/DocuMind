import { createHash } from 'node:crypto';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  ApiTokensService,
  generateToken,
  hashToken,
} from './api-tokens.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

interface ApiTokenRow {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  last4: string;
  lastUsedAt: Date | null;
  revoked: boolean;
  createdAt: Date;
}

function makePrismaMock(rows: ApiTokenRow[]) {
  return {
    apiToken: {
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<
            ApiTokenRow,
            'id' | 'createdAt' | 'lastUsedAt' | 'revoked'
          >;
        }) => {
          const row: ApiTokenRow = {
            id: `tok_${rows.length + 1}`,
            lastUsedAt: null,
            revoked: false,
            createdAt: new Date(),
            ...data,
          };
          rows.push(row);
          return Promise.resolve(row);
        },
      ),
      findUnique: jest.fn(
        ({ where }: { where: { id?: string; tokenHash?: string } }) => {
          const row = rows.find(
            (r) =>
              (where.id !== undefined && r.id === where.id) ||
              (where.tokenHash !== undefined &&
                r.tokenHash === where.tokenHash),
          );
          return Promise.resolve(row ?? null);
        },
      ),
      findMany: jest.fn(() => Promise.resolve(rows)),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<ApiTokenRow>;
        }) => {
          const row = rows.find((r) => r.id === where.id);
          if (row) Object.assign(row, data);
          return Promise.resolve(row);
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const idx = rows.findIndex((r) => r.id === where.id);
        if (idx >= 0) rows.splice(idx, 1);
        return Promise.resolve();
      }),
    },
  };
}

describe('token generation', () => {
  it('produces dm_-prefixed base64url tokens with 256-bit entropy', () => {
    const token = generateToken();
    expect(token.startsWith('dm_')).toBe(true);
    const body = token.slice(3);
    // 32 bytes → 43 base64url chars, charset [A-Za-z0-9_-], no padding.
    expect(body).toHaveLength(43);
    expect(/^[A-Za-z0-9_-]+$/.test(body)).toBe(true);
  });

  it('generates 1000 unique tokens', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateToken());
    expect(seen.size).toBe(1000);
  });

  it('hashToken is sha256 hex', () => {
    const token = 'dm_test-token';
    expect(hashToken(token)).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(/^[0-9a-f]{64}$/.test(hashToken(token))).toBe(true);
  });
});

describe('ApiTokensService', () => {
  let rows: ApiTokenRow[];
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: ApiTokensService;

  beforeEach(() => {
    rows = [];
    prisma = makePrismaMock(rows);
    service = new ApiTokensService(prisma as unknown as PrismaService);
  });

  it('create stores only the sha256 hash plus last4, returns plaintext once', async () => {
    const created = await service.create('user-1', 'My token');
    expect(created.token.startsWith('dm_')).toBe(true);
    expect(created.last4).toBe(created.token.slice(-4));
    const stored = rows[0];
    expect(stored.tokenHash).toBe(hashToken(created.token));
    // Plaintext must never be persisted.
    expect(JSON.stringify(stored)).not.toContain(created.token);
  });

  it('list shows only the safe display hint, never a hash or plaintext', async () => {
    const created = await service.create('user-1', 'My token');
    const [item] = await service.list('user-1');
    expect(item.display).toBe(`dm_...${created.last4}`);
    expect(JSON.stringify(item)).not.toContain(rows[0].tokenHash);
  });

  it('verify resolves a valid token and returns null after revocation', async () => {
    const created = await service.create('user-1', 'My token');
    const verified = await service.verify(created.token);
    expect(verified).toEqual({ tokenId: created.id, userId: 'user-1' });

    await service.revoke(created.id, 'user-1');
    expect(await service.verify(created.token)).toBeNull();
  });

  it('verify returns null for unknown and malformed tokens', async () => {
    expect(await service.verify('dm_' + 'a'.repeat(43))).toBeNull();
    expect(await service.verify('not-a-token')).toBeNull();
  });

  it('revoke/remove enforce ownership', async () => {
    const created = await service.create('user-1', 'My token');
    await expect(service.revoke(created.id, 'user-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.remove('missing', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('writes lastUsedAt at most once per minute per token', async () => {
    const created = await service.create('user-1', 'My token');
    prisma.apiToken.update.mockClear();
    await service.verify(created.token);
    await service.verify(created.token);
    await service.verify(created.token);
    expect(prisma.apiToken.update).toHaveBeenCalledTimes(1);
  });
});
