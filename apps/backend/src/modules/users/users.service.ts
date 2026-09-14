import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';
import { CreateUserDto, UpdateUserDto, AssignRolesDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, createdBy?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: dto.username },
          ...(dto.email ? [{ email: dto.email }] : []),
          ...(dto.phone ? [{ phone: dto.phone }] : []),
        ],
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictException('Username, email, or phone already in use / ব্যবহারকারীর নাম, ইমেইল বা ফোন ইতিমধ্যে ব্যবহৃত');
    }

    const rounds = this.config.get<number>('bcrypt.rounds') || 12;
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        firstNameBn: dto.firstNameBn,
        lastNameBn: dto.lastNameBn,
        gender: dto.gender as any,
        branchId: dto.branchId,
        createdBy,
        userRoles: dto.roleIds?.length
          ? {
              create: dto.roleIds.map((roleId) => ({
                roleId,
                branchId: dto.branchId,
                assignedBy: createdBy,
              })),
            }
          : undefined,
      },
      include: {
        userRoles: { include: { role: true } },
        branch: true,
      },
    });

    await this.audit.log({
      userId: createdBy,
      action: AuditAction.CREATE,
      tableName: 'users',
      recordId: user.id,
      newValues: {
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    branchId?: string;
  }) {
    const { skip, take } = getPaginationParams(params);
    const where: any = { deletedAt: null };

    if (params.search) {
      where.OR = [
        { username: { contains: params.search, mode: 'insensitive' } },
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.status) where.status = params.status;
    if (params.branchId) where.branchId = params.branchId;

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        include: {
          userRoles: { include: { role: { select: { id: true, name: true, nameBn: true } } } },
          branch: { select: { id: true, name: true, nameBn: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const safeUsers = users.map(({ passwordHash: _, pwdResetToken: __, pwdResetExpiry: ___, ...u }) => u);
    return buildPaginatedResult(safeUsers, total, params.page || 1, take);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
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
        branch: true,
      },
    });
    if (!user || user.deletedAt) throw new NotFoundException('User not found / ব্যবহারকারী পাওয়া যায়নি');
    const { passwordHash: _, pwdResetToken: __, pwdResetExpiry: ___, ...safeUser } = user;
    return safeUser;
  }

  async update(id: string, dto: UpdateUserDto, updatedBy?: string) {
    const existing = await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email,
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        firstNameBn: dto.firstNameBn,
        lastNameBn: dto.lastNameBn,
        gender: dto.gender as any,
        status: dto.status as any,
        branchId: dto.branchId,
        mustChangePwd: dto.mustChangePwd,
      },
      include: { branch: true },
    });

    await this.audit.log({
      userId: updatedBy,
      action: AuditAction.UPDATE,
      tableName: 'users',
      recordId: id,
      oldValues: {
        firstName:   (existing as any).firstName,
        lastName:    (existing as any).lastName,
        firstNameBn: (existing as any).firstNameBn,
        lastNameBn:  (existing as any).lastNameBn,
        email:       (existing as any).email,
        phone:       (existing as any).phone,
        status:      (existing as any).status,
        branchId:    (existing as any).branchId,
      },
      newValues: dto,
    });

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  async toggleStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED', updatedBy?: string) {
    const existing = await this.findOne(id);
    await this.prisma.user.update({
      where: { id },
      data: { status },
    });

    await this.audit.log({
      userId: updatedBy,
      action: AuditAction.UPDATE,
      tableName: 'users',
      recordId: id,
      oldValues: { status: (existing as any).status },
      newValues: { status },
    });

    return { message: `User status updated to ${status}`, status };
  }

  async assignRoles(userId: string, dto: AssignRolesDto, assignedBy?: string) {
    const existing = await this.findOne(userId);

    // Get current roles for audit
    const oldRoleIds = ((existing as any).userRoles || []).map((ur: any) => ur.roleId);

    await this.prisma.userRole.deleteMany({ where: { userId } });

    if (dto.roleIds.length > 0) {
      await this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({
          userId,
          roleId,
          branchId: dto.branchId,
          assignedBy,
        })),
      });
    }

    await this.audit.log({
      userId: assignedBy,
      action: AuditAction.UPDATE,
      tableName: 'user_roles',
      recordId: userId,
      oldValues: { roleIds: oldRoleIds },
      newValues: { roleIds: dto.roleIds },
    });

    return this.findOne(userId);
  }

  async softDelete(id: string, deletedBy?: string) {
    await this.findOne(id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });

    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId: id },
      data: { isRevoked: true },
    });

    await this.audit.log({
      userId: deletedBy,
      action: AuditAction.DELETE,
      tableName: 'users',
      recordId: id,
      newValues: { action: 'soft_delete' },
    });

    return { message: 'User deleted / ব্যবহারকারী মুছে ফেলা হয়েছে' };
  }
}
