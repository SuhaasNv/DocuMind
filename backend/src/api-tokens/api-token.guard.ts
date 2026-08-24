import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTokensService } from './api-tokens.service.js';

/** Per-token rate limit for /mcp: 60 calls per sliding minute. */
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

export interface ApiTokenRequest extends Request {
  apiToken?: { tokenId: string; userId: string };
}

/**
 * Bearer `dm_...` token auth for the MCP endpoint. Every failure mode
 * (missing, malformed, unknown, revoked) returns the SAME 401 body so the
 * response is not an oracle for token existence or state.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  /** In-memory sliding window: tokenId → request timestamps (ms). */
  private readonly windows = new Map<string, number[]>();

  constructor(private readonly apiTokens: ApiTokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApiTokenRequest>();
    const header = req.headers.authorization;
    const uniform = () => new UnauthorizedException('Invalid API token');

    if (!header || !header.startsWith('Bearer ')) throw uniform();
    const plaintext = header.slice('Bearer '.length).trim();
    if (!plaintext.startsWith('dm_')) throw uniform();

    const verified = await this.apiTokens.verify(plaintext);
    if (!verified) throw uniform();

    this.enforceRateLimit(verified.tokenId);
    req.apiToken = verified;
    return true;
  }

  private enforceRateLimit(tokenId: string): void {
    const now = Date.now();
    const window = (this.windows.get(tokenId) ?? []).filter(
      (t) => now - t < RATE_WINDOW_MS,
    );
    if (window.length >= RATE_LIMIT) {
      this.windows.set(tokenId, window);
      throw new HttpException(
        `Rate limit exceeded — at most ${RATE_LIMIT} MCP calls per minute per token. Try again shortly.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    window.push(now);
    this.windows.set(tokenId, window);
  }
}
