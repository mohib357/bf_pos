import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../dto/auth.dto';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload) {
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
