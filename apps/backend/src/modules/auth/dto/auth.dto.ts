import { IsNotEmpty, IsString, MinLength, IsOptional, IsEmail, Matches } from 'class-validator';

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
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase and a number',
  })
  newPassword: string;
}

export class ForgotPasswordDto {
  @IsNotEmpty({ message: 'Email or username is required' })
  @IsString()
  identifier: string;
}

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase and a number',
  })
  newPassword: string;
}

export class AdminResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword: string;

  @IsOptional()
  mustChangePwd?: boolean;
}

export class JwtPayload {
  sub: string;       // userId
  username: string;
  email?: string;
  branchId?: string;
  isSuperAdmin: boolean;
  permissions: string[];
  pwdChangedAt?: number; // ms timestamp — used to invalidate tokens after password change
  iat?: number;
  exp?: number;
}
