import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  LoginDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  AdminResetPasswordDto,
} from './dto/auth.dto';
import { AuditAction } from '@prisma/client';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async buildUserPayload(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const permissions = new Set<string>();
    let isSuperAdmin = false;
    const roleNames: string[] = [];

    for (const ur of user.userRoles) {
      roleNames.push(ur.role.name);
      if (ur.role.name === 'SUPER_ADMIN' || ur.role.name === 'OWNER') {
        isSuperAdmin = true;
      }
      for (const rp of ur.role.rolePermissions) {
        const { module, action, resource } = rp.permission;
        permissions.add(`${module}:${action}:${resource}`);
      }
    }

    return { user, permissions: Array.from(permissions), isSuperAdmin, roleNames };
  }

  private async issueTokens(
    user: any,
    permissions: string[],
    isSuperAdmin: boolean,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        username: user.username,
        email: user.email,
        branchId: user.branchId,
        isSuperAdmin,
        permissions,
      },
      {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: this.config.get<string>('jwt.expiresIn'),
      },
    );

    const refreshToken = uuidv4();
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn') || '7d';
    const refreshExpiresAt = new Date();
    const days = parseInt(refreshExpiresIn) || 7;
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + days);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: refreshExpiresAt,
        ipAddress,
        userAgent,
      },
    });

    return { accessToken, refreshToken };
  }

  // ─── Login ───────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    // Find user by username, email, or phone
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: dto.username },
          { email: dto.username },
          { phone: dto.username },
        ],
        deletedAt: null,
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    // Generic message to avoid user enumeration
    if (!user) {
      throw new UnauthorizedException('Invalid credentials / ভুল তথ্য');
    }

    // Account lock check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Account is temporarily locked. Try again in ${minutesLeft} minute(s). / অ্যাকাউন্ট ${minutesLeft} মিনিটের জন্য লক আছে।`,
      );
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Account is suspended. Contact administrator. / অ্যাকাউন্ট স্থগিত করা হয়েছে।');
    }

    if (user.status === 'INACTIVE') {
      throw new ForbiddenException('Account is inactive. Contact administrator. / অ্যাকাউন্ট নিষ্ক্রিয়।');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      // Increment login attempts
      const newAttempts = (user.loginAttempts || 0) + 1;
      const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
        : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: newAttempts,
          lockedUntil: lockedUntil ?? undefined,
        },
      });

      await this.audit.log({
        userId: user.id,
        action: AuditAction.LOGIN,
        tableName: 'users',
        recordId: user.id,
        newValues: { success: false, attempts: newAttempts, locked: shouldLock },
        ipAddress,
        userAgent,
      });

      if (shouldLock) {
        throw new ForbiddenException(
          `Too many failed attempts. Account locked for ${LOCK_DURATION_MINUTES} minutes. / ${MAX_LOGIN_ATTEMPTS} বার ব্যর্থ প্রচেষ্টা। অ্যাকাউন্ট ${LOCK_DURATION_MINUTES} মিনিটের জন্য লক করা হয়েছে।`,
        );
      }

      const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
      throw new UnauthorizedException(
        `Invalid credentials. ${remaining} attempt(s) remaining before lock. / ভুল তথ্য। আরও ${remaining} বার ব্যর্থ হলে লক হবে।`,
      );
    }

    // Successful login — reset attempts
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });

    // Build permissions
    const permissions = new Set<string>();
    let isSuperAdmin = false;
    const roleNames: string[] = [];

    for (const ur of user.userRoles) {
      roleNames.push(ur.role.name);
      if (ur.role.name === 'SUPER_ADMIN' || ur.role.name === 'OWNER') {
        isSuperAdmin = true;
      }
      for (const rp of ur.role.rolePermissions) {
        const { module, action, resource } = rp.permission;
        permissions.add(`${module}:${action}:${resource}`);
      }
    }

    const permissionsArray = Array.from(permissions);
    const { accessToken, refreshToken } = await this.issueTokens(
      user,
      permissionsArray,
      isSuperAdmin,
      ipAddress,
      userAgent,
    );

    // Audit log
    await this.audit.log({
      userId: user.id,
      action: AuditAction.LOGIN,
      tableName: 'users',
      recordId: user.id,
      newValues: { success: true, ipAddress, roles: roleNames },
      ipAddress,
      userAgent,
    });

    this.logger.log(`User logged in: ${user.username} from ${ipAddress}`);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get<string>('jwt.expiresIn'),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        firstNameBn: user.firstNameBn,
        lastNameBn: user.lastNameBn,
        avatar: user.avatar,
        branchId: user.branchId,
        isSuperAdmin,
        roles: roleNames,
        permissions: permissionsArray,
        mustChangePwd: user.mustChangePwd,
      },
    };
  }

  // ─── Refresh Token ───────────────────────────────────────────────────────

  async refreshToken(token: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.user.status !== 'ACTIVE' || stored.user.deletedAt) {
      throw new UnauthorizedException('Account is not active');
    }

    // Revoke old token (token rotation)
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    const { user, permissions, isSuperAdmin, roleNames } = await this.buildUserPayload(stored.userId);
    const tokens = await this.issueTokens(user, permissions, isSuperAdmin, stored.ipAddress, stored.userAgent);

    return {
      ...tokens,
      expiresIn: this.config.get<string>('jwt.expiresIn'),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        firstNameBn: user.firstNameBn,
        lastNameBn: user.lastNameBn,
        avatar: user.avatar,
        branchId: user.branchId,
        isSuperAdmin,
        roles: roleNames,
        permissions,
        mustChangePwd: user.mustChangePwd,
      },
    };
  }

  // ─── Logout ──────────────────────────────────────────────────────────────

  async logout(userId: string, refreshToken?: string, ipAddress?: string, userAgent?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, token: refreshToken },
        data: { isRevoked: true },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { isRevoked: true },
      });
    }

    await this.audit.log({
      userId,
      action: AuditAction.LOGOUT,
      tableName: 'users',
      recordId: userId,
      ipAddress,
      userAgent,
    });

    this.logger.log(`User logged out: ${userId}`);
    return { message: 'Logged out successfully / সফলভাবে লগআউট হয়েছে' };
  }

  // ─── Change Password ─────────────────────────────────────────────────────

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect / বর্তমান পাসওয়ার্ড ভুল');
    }

    const rounds = this.config.get<number>('bcrypt.rounds') || 12;
    const newHash = await bcrypt.hash(dto.newPassword, rounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, mustChangePwd: false },
    });

    // Revoke all refresh tokens (force re-login everywhere)
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      tableName: 'users',
      recordId: userId,
      newValues: { action: 'change_password' },
      ipAddress,
      userAgent,
    });

    return { message: 'Password changed successfully / পাসওয়ার্ড পরিবর্তন হয়েছে' };
  }

  // ─── Forgot Password ─────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto, ipAddress?: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: dto.identifier },
          { email: dto.identifier },
          { phone: dto.identifier },
        ],
        deletedAt: null,
      },
    });

    // Always return the same message to prevent user enumeration
    const genericMsg = {
      message: 'If a matching account is found, a password reset token has been generated. / যদি অ্যাকাউন্ট থাকে, রিসেট টোকেন তৈরি হয়েছে।',
    };

    if (!user || user.status !== 'ACTIVE') {
      return genericMsg;
    }

    // Generate secure token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        pwdResetToken: resetTokenHash,
        pwdResetExpiry: expiry,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: AuditAction.UPDATE,
      tableName: 'users',
      recordId: user.id,
      newValues: { action: 'forgot_password_requested' },
      ipAddress,
    });

    this.logger.log(`Password reset requested for: ${user.username}`);

    // In production this would send an email. Return token directly for demo.
    return {
      ...genericMsg,
      // Only expose token in non-production (for demo/testing)
      ...(this.config.get<string>('app.nodeEnv') !== 'production'
        ? { resetToken, expiresIn: '1 hour' }
        : {}),
    };
  }

  // ─── Reset Password ──────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto, ipAddress?: string, userAgent?: string) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        pwdResetToken: tokenHash,
        pwdResetExpiry: { gt: new Date() },
        deletedAt: null,
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Invalid or expired password reset token / অবৈধ বা মেয়াদোত্তীর্ণ টোকেন',
      );
    }

    const rounds = this.config.get<number>('bcrypt.rounds') || 12;
    const newHash = await bcrypt.hash(dto.newPassword, rounds);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        pwdResetToken: null,
        pwdResetExpiry: null,
        mustChangePwd: false,
        loginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { isRevoked: true },
    });

    await this.audit.log({
      userId: user.id,
      action: AuditAction.UPDATE,
      tableName: 'users',
      recordId: user.id,
      newValues: { action: 'password_reset' },
      ipAddress,
      userAgent,
    });

    return { message: 'Password reset successfully / পাসওয়ার্ড রিসেট হয়েছে' };
  }

  // ─── Admin: Reset user password ──────────────────────────────────────────

  async adminResetPassword(
    targetUserId: string,
    dto: AdminResetPasswordDto,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user || user.deletedAt) throw new BadRequestException('User not found');

    const rounds = this.config.get<number>('bcrypt.rounds') || 12;
    const newHash = await bcrypt.hash(dto.newPassword, rounds);

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        passwordHash: newHash,
        mustChangePwd: dto.mustChangePwd ?? true,
        loginAttempts: 0,
        lockedUntil: null,
      },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId: targetUserId },
      data: { isRevoked: true },
    });

    await this.audit.log({
      userId: adminId,
      action: AuditAction.UPDATE,
      tableName: 'users',
      recordId: targetUserId,
      newValues: { action: 'admin_password_reset', mustChangePwd: dto.mustChangePwd ?? true },
      ipAddress,
      userAgent,
    });

    return { message: 'Password reset by admin / অ্যাডমিন কর্তৃক পাসওয়ার্ড রিসেট হয়েছে' };
  }

  // ─── Get Profile ─────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        branch: { select: { id: true, name: true, nameBn: true } },
        userRoles: {
          include: {
            role: {
              select: { id: true, name: true, nameBn: true },
            },
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('User not found');

    const { passwordHash: _, pwdResetToken: __, pwdResetExpiry: ___, ...safeUser } = user;
    return safeUser;
  }

  // ─── Login history ───────────────────────────────────────────────────────

  async getLoginHistory(userId: string, limit = 20) {
    return this.prisma.auditLog.findMany({
      where: {
        userId,
        action: { in: ['LOGIN', 'LOGOUT'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
