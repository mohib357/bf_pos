import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, ChangePasswordDto } from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;
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
  ) {
    const result = await this.authService.logout(userId, body.refreshToken);
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
  ) {
    const result = await this.authService.changePassword(userId, dto);
    return ApiResponse.success(result);
  }
}
