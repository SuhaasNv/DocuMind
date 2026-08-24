import {
  UnauthorizedException,
  HttpException,
  type ExecutionContext,
} from '@nestjs/common';
import { ApiTokenGuard, type ApiTokenRequest } from './api-token.guard.js';
import type {
  ApiTokensService,
  VerifiedApiToken,
} from './api-tokens.service.js';

function contextFor(authorization?: string): {
  ctx: ExecutionContext;
  req: ApiTokenRequest;
} {
  const req = { headers: { authorization } } as unknown as ApiTokenRequest;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('ApiTokenGuard', () => {
  let verify: jest.Mock<Promise<VerifiedApiToken | null>, [string]>;
  let guard: ApiTokenGuard;

  beforeEach(() => {
    verify = jest.fn<Promise<VerifiedApiToken | null>, [string]>();
    guard = new ApiTokenGuard({ verify } as unknown as ApiTokensService);
  });

  async function expectUniform401(authorization?: string): Promise<void> {
    const { ctx } = contextFor(authorization);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      constructor: UnauthorizedException,
      message: 'Invalid API token',
    });
  }

  it('rejects a missing Authorization header', async () => {
    await expectUniform401(undefined);
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects malformed headers and non-dm_ tokens with the same 401', async () => {
    await expectUniform401('Token abc');
    await expectUniform401('Bearer not-a-dm-token');
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects unknown or revoked tokens with the same 401 (no oracle)', async () => {
    verify.mockResolvedValue(null);
    await expectUniform401('Bearer dm_unknown-or-revoked');
    expect(verify).toHaveBeenCalledWith('dm_unknown-or-revoked');
  });

  it('accepts a valid token and attaches tokenId + userId to the request', async () => {
    verify.mockResolvedValue({ tokenId: 't1', userId: 'user-1' });
    const { ctx, req } = contextFor('Bearer dm_valid');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.apiToken).toEqual({ tokenId: 't1', userId: 'user-1' });
  });

  it('rate limits per token: 61st call within a minute is a 429', async () => {
    verify.mockResolvedValue({ tokenId: 't1', userId: 'user-1' });
    const { ctx } = contextFor('Bearer dm_valid');
    for (let i = 0; i < 60; i++) {
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      constructor: HttpException,
      status: 429,
    });
  });

  it('rate limit is per token, not global', async () => {
    verify.mockResolvedValue({ tokenId: 't1', userId: 'user-1' });
    const { ctx } = contextFor('Bearer dm_valid');
    for (let i = 0; i < 60; i++) {
      await guard.canActivate(ctx);
    }
    verify.mockResolvedValue({ tokenId: 't2', userId: 'user-2' });
    const other = contextFor('Bearer dm_other');
    await expect(guard.canActivate(other.ctx)).resolves.toBe(true);
  });
});
