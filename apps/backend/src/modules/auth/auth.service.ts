import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, ChangePasswordDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

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

    if (!user) {
      throw new UnauthorizedException('Invalid credentials / ভুল তথ্য');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is suspended / অ্যাকাউন্ট স্থগিত');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials / ভুল তথ্য');
    }

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

    // Generate tokens
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        username: user.username,
        email: user.email,
        branchId: user.branchId,
        isSuperAdmin,
        permissions: permissionsArray,
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

    // Store refresh token
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: refreshExpiresAt,
        ipAddress,
        userAgent,
      },
    });

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
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
        branchId: user.branchId,
        isSuperAdmin,
        roles: roleNames,
        permissions: permissionsArray,
        mustChangePwd: user.mustChangePwd,
      },
    };
  }

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

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    // Issue new login
    return this.login(
      { username: stored.user.username, password: '' } as any,
      stored.ipAddress,
      stored.userAgent,
    ).catch(() => {
      throw new UnauthorizedException('Unable to refresh token');
    });
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, token: refreshToken },
        data: { isRevoked: true },
      });
    } else {
      // Revoke all tokens for user
      await this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { isRevoked: true },
      });
    }
    this.logger.log(`User logged out: ${userId}`);
    return { message: 'Logged out successfully / সফলভাবে লগআউট হয়েছে' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
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

    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });

    return { message: 'Password changed successfully / পাসওয়ার্ড পরিবর্তন হয়েছে' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        branch: true,
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user) throw new UnauthorizedException('User not found');

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }
}
