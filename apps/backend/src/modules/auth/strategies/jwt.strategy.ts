import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.module';
import { JwtPayload } from '../dto/auth.dto';

/**
 * Extract JWT from:
 *  1. HttpOnly cookie `access_token`  (browser / primary)
 *  2. Authorization: Bearer header    (API clients / mobile)
 */
const cookieOrHeaderExtractor = (req: Request): string | null => {
  // Cookie first (HttpOnly — XSS-safe)
  const fromCookie = req?.cookies?.access_token;
  if (fromCookie) return fromCookie;
  // Fallback: Bearer header (API clients, curl, mobile)
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private cache: CacheService,
  ) {
    super({
      jwtFromRequest: cookieOrHeaderExtractor,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
      passReqToCallback: true,   // we need the raw token for blacklist check
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    // ── Blacklist check — reject if this specific access token was revoked ──
    const rawToken: string | null = cookieOrHeaderExtractor(req);
    if (rawToken) {
      const blacklisted = await this.cache.get(`blacklist:at:${rawToken}`);
      if (blacklisted) {
        throw new UnauthorizedException('Token has been revoked / টোকেন বাতিল করা হয়েছে');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active / অ্যাকাউন্ট নিষ্ক্রিয়');
    }

    // Build permissions array: "module:action:resource"
    const permissions = new Set<string>();
    let isSuperAdmin = false;

    for (const userRole of user.userRoles) {
      if (userRole.role.name === 'SUPER_ADMIN' || userRole.role.name === 'OWNER') {
        isSuperAdmin = true;
      }
      for (const rp of userRole.role.rolePermissions) {
        const { module, action, resource } = rp.permission;
        permissions.add(`${module}:${action}:${resource}`);
      }
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      branchId: user.branchId,
      isSuperAdmin,
      permissions: Array.from(permissions),
    };
  }
}
