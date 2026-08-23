import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService, AuthResponse } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator.js';

/** Stricter rate limit for auth to prevent brute force and spam signups. */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60000 } }; // 10 per minute per IP

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  @Post('ping')
  async ping(@CurrentUser() user: JwtPayload): Promise<{ success: boolean }> {
    await this.authService.ping(user.sub);
    return { success: true };
  }

  @Throttle(AUTH_THROTTLE)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: boolean }> {
    await this.authService.changePassword(user.sub, dto);
    return { success: true };
  }
}
