import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import type { JwtPayload } from '../common/decorators/current-user.decorator.js';

/**
 * Extract JWT from Authorization header first, then from query.token (for SSE
 * when some proxies strip headers). Prefer header; query is fallback only.
 */
function jwtFromRequest(req: Request): string | null {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;
  const token = (req.query?.token as string) ?? undefined;
  return token && typeof token === 'string' ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET must be set in .env');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([jwtFromRequest]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.authService.validateUser(payload);
    if (!user) {
      throw new UnauthorizedException();
    }
    return { sub: user.id, email: user.email, name: user.name };
  }
}
