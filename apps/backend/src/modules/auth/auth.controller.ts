import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RefreshTokenDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  AdminResetPasswordDto,
} from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

// Access token TTL in ms  (matches JWT_EXPIRES_IN=15m)
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
// Refresh token TTL in ms (matches JWT_REFRESH_EXPIRES_IN=7d)
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Set HttpOnly, Secure (production), SameSite=Lax cookies.
 * Tokens are NOT readable by JavaScript — XSS-safe.
 */
function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
) {
  const isProduction = process.env.NODE_ENV === 'production';
  const base = {
    httpOnly: true,       // Not accessible via document.cookie
    secure: isProduction, // HTTPS-only in production
    sameSite: 'lax' as const,
    path: '/',
  };
  res.cookie('access_token',  accessToken,  { ...base, maxAge: ACCESS_TOKEN_TTL_MS  });
  res.cookie('refresh_token', refreshToken, { ...base, maxAge: REFRESH_TOKEN_TTL_MS });
}

function clearAuthCookies(res: Response) {
  res.clearCookie('access_token',  { httpOnly: true, path: '/' });
  res.clearCookie('refresh_token', { httpOnly: true, path: '/' });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   * Rate limited: 5 requests / 60s per IP (login tier).
   * Sets HttpOnly access_token + refresh_token cookies.
   */
  @Public()
  @Throttle({ login: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipAddress = ((req.headers['x-forwarded-for'] as string) || req.ip || '')
      .split(',')[0].trim();
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.login(dto, ipAddress, userAgent);

    // Set HttpOnly cookies — primary auth for browser
    setAuthCookies(res, result.accessToken, result.refreshToken);

    return ApiResponse.success(result, 'Login successful', 'লগইন সফল হয়েছে');
  }

  /**
   * POST /auth/refresh
   * Reads refresh token from cookie (browser) or body (API clients).
   * Issues new access_token + rotated refresh_token.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: Partial<RefreshTokenDto>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = (req.cookies as any)?.refresh_token ?? body.refreshToken;
    if (!token) {
      return ApiResponse.error('Refresh token required', 'রিফ্রেশ টোকেন প্রয়োজন');
    }
    const result = await this.authService.refreshToken(token);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return ApiResponse.success(result, 'Token refreshed', 'টোকেন রিফ্রেশ হয়েছে');
  }

  /**
   * POST /auth/logout
   * Revokes the refresh token DB row and clears both cookies.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('id') userId: string,
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = ((req.headers['x-forwarded-for'] as string) || req.ip || '')
      .split(',')[0].trim();
    const ua = req.headers['user-agent'];
    // Accept token from cookie (browser) or body (API clients)
    const refreshToken = (req.cookies as any)?.refresh_token ?? body.refreshToken;
    const result = await this.authService.logout(userId, refreshToken, ip, ua);
    clearAuthCookies(res);
    return ApiResponse.success(result, 'Logged out', 'লগআউট হয়েছে');
  }

  @Get('profile')
  async getProfile(@CurrentUser('id') userId: string) {
    const profile = await this.authService.getProfile(userId);
    return ApiResponse.success(profile, 'Profile retrieved', 'প্রোফাইল পাওয়া গেছে');
  }

  /**
   * POST /auth/change-password
   * Changes password and clears all cookies — forces re-login on all devices.
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = ((req.headers['x-forwarded-for'] as string) || req.ip || '')
      .split(',')[0].trim();
    const ua = req.headers['user-agent'];
    const result = await this.authService.changePassword(userId, dto, ip, ua);
    // Clear cookies on the responding device; DB revokes all refresh tokens
    clearAuthCookies(res);
    return ApiResponse.success(result);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const ip = ((req.headers['x-forwarded-for'] as string) || req.ip || '')
      .split(',')[0].trim();
    const result = await this.authService.forgotPassword(dto, ip);
    return ApiResponse.success(result);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    const ip = ((req.headers['x-forwarded-for'] as string) || req.ip || '')
      .split(',')[0].trim();
    const ua = req.headers['user-agent'];
    const result = await this.authService.resetPassword(dto, ip, ua);
    return ApiResponse.success(result);
  }

  @Post('users/:id/reset-password')
  @RequirePermissions('users:update:users')
  @HttpCode(HttpStatus.OK)
  async adminResetPassword(
    @Param('id', ParseUUIDPipe) targetId: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser('id') adminId: string,
    @Req() req: Request,
  ) {
    const ip = ((req.headers['x-forwarded-for'] as string) || req.ip || '')
      .split(',')[0].trim();
    const ua = req.headers['user-agent'];
    const result = await this.authService.adminResetPassword(targetId, dto, adminId, ip, ua);
    return ApiResponse.success(result, 'Password reset', 'পাসওয়ার্ড রিসেট হয়েছে');
  }

  @Get('login-history')
  async getLoginHistory(@CurrentUser('id') userId: string) {
    const history = await this.authService.getLoginHistory(userId);
    return ApiResponse.success(history);
  }
}
