import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ipAddress = ((req.headers['x-forwarded-for'] as string) || req.ip || '').split(',')[0].trim();
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.login(dto, ipAddress, userAgent);
    return ApiResponse.success(result, 'Login successful', 'লগইন সফল হয়েছে');
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.refreshToken(dto.refreshToken);
    return ApiResponse.success(result, 'Token refreshed', 'টোকেন রিফ্রেশ হয়েছে');
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('id') userId: string,
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
  ) {
    const ip = ((req.headers['x-forwarded-for'] as string) || req.ip || '').split(',')[0].trim();
    const ua = req.headers['user-agent'];
    const result = await this.authService.logout(userId, body.refreshToken, ip, ua);
    return ApiResponse.success(result, 'Logged out', 'লগআউট হয়েছে');
  }

  @Get('profile')
  async getProfile(@CurrentUser('id') userId: string) {
    const profile = await this.authService.getProfile(userId);
    return ApiResponse.success(profile, 'Profile retrieved', 'প্রোফাইল পাওয়া গেছে');
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    const ip = ((req.headers['x-forwarded-for'] as string) || req.ip || '').split(',')[0].trim();
    const ua = req.headers['user-agent'];
    const result = await this.authService.changePassword(userId, dto, ip, ua);
    return ApiResponse.success(result);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const ip = ((req.headers['x-forwarded-for'] as string) || req.ip || '').split(',')[0].trim();
    const result = await this.authService.forgotPassword(dto, ip);
    return ApiResponse.success(result);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    const ip = ((req.headers['x-forwarded-for'] as string) || req.ip || '').split(',')[0].trim();
    const ua = req.headers['user-agent'];
    const result = await this.authService.resetPassword(dto, ip, ua);
    return ApiResponse.success(result);
  }

  // Super Admin / Manager: Reset another user's password
  @Post('users/:id/reset-password')
  @RequirePermissions('users:update:users')
  @HttpCode(HttpStatus.OK)
  async adminResetPassword(
    @Param('id', ParseUUIDPipe) targetId: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser('id') adminId: string,
    @Req() req: Request,
  ) {
    const ip = ((req.headers['x-forwarded-for'] as string) || req.ip || '').split(',')[0].trim();
    const ua = req.headers['user-agent'];
    const result = await this.authService.adminResetPassword(targetId, dto, adminId, ip, ua);
    return ApiResponse.success(result, 'Password reset', 'পাসওয়ার্ড রিসেট হয়েছে');
  }

  // Get own login history
  @Get('login-history')
  async getLoginHistory(@CurrentUser('id') userId: string) {
    const history = await this.authService.getLoginHistory(userId);
    return ApiResponse.success(history);
  }
}
