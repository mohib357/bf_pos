import { IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @IsNotEmpty({ message: 'Username is required / ব্যবহারকারীর নাম প্রয়োজন' })
  @IsString()
  username: string;

  @IsNotEmpty({ message: 'Password is required / পাসওয়ার্ড প্রয়োজন' })
  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;
}

export class RefreshTokenDto {
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  newPassword: string;
}

export class JwtPayload {
  sub: string;       // userId
  username: string;
  email?: string;
  branchId?: string;
  isSuperAdmin: boolean;
  permissions: string[];
  iat?: number;
  exp?: number;
}
