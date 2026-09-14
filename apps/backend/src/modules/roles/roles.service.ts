import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAllRoles() {
    return this.prisma.role.findMany({
      where: { isActive: true },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
        _count: { select: { userRoles: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOneRole(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async createRole(dto: CreateRoleDto, createdBy?: string) {
    const existing = await this.prisma.role.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Role name already exists');

    const role = await this.prisma.role.create({
      data: {
        name: dto.name.toUpperCase().replace(/\s+/g, '_'),
        nameBn: dto.nameBn,
        description: dto.description,
        isSystem: false,
        rolePermissions: dto.permissionIds?.length
          ? {
              create: dto.permissionIds.map((permissionId) => ({ permissionId })),
            }
          : undefined,
      },
      include: { rolePermissions: { include: { permission: true } } },
    });

    await this.audit.log({
      userId: createdBy,
      action: AuditAction.CREATE,
      tableName: 'roles',
      recordId: role.id,
      newValues: { name: role.name },
    });

    return role;
  }

  async updateRole(id: string, dto: UpdateRoleDto, updatedBy?: string) {
    const role = await this.findOneRole(id);
    if (role.isSystem) {
      // System roles can only have description/nameBn updated
      const updated = await this.prisma.role.update({
        where: { id },
        data: {
          nameBn: dto.nameBn,
          description: dto.description,
        },
      });
      return updated;
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        nameBn: dto.nameBn,
        description: dto.description,
        isActive: dto.isActive,
      },
    });

    await this.audit.log({
      userId: updatedBy,
      action: AuditAction.UPDATE,
      tableName: 'roles',
      recordId: id,
      oldValues: { nameBn: role.nameBn, description: role.description, isActive: role.isActive },
      newValues: dto,
    });

    return updated;
  }

  async assignPermissions(roleId: string, dto: AssignPermissionsDto, updatedBy?: string) {
    const role = await this.findOneRole(roleId);

    // Get current permission ids for audit
    const oldPermIds = role.rolePermissions.map((rp: any) => rp.permissionId);

    // Replace all permissions
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
    if (dto.permissionIds.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      });
    }

    await this.audit.log({
      userId: updatedBy,
      action: AuditAction.UPDATE,
      tableName: 'role_permissions',
      recordId: roleId,
      oldValues: { permissionIds: oldPermIds },
      newValues: { permissionIds: dto.permissionIds },
    });

    return this.findOneRole(roleId);
  }

  async findAllPermissions() {
    return this.prisma.permission.findMany({
      where: { isActive: true },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  async getPermissionsGrouped() {
    const perms = await this.findAllPermissions();
    const grouped: Record<string, typeof perms> = {};
    for (const p of perms) {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push(p);
    }
    return grouped;
  }
}
