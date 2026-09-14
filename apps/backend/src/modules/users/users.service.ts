import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, AssignRolesDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async create(dto: CreateUserDto, createdBy?: string) {
    // Check uniqueness
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
      throw new ConflictException('Username, email, or phone already in use');
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
          userRoles: { include: { role: true } },
          branch: { select: { id: true, name: true, nameBn: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const safeUsers = users.map(({ passwordHash: _, ...u }) => u);
    return buildPaginatedResult(safeUsers, total, params.page || 1, take);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: { include: { role: true } },
        branch: true,
      },
    });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
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
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  async assignRoles(userId: string, dto: AssignRolesDto, assignedBy?: string) {
    await this.findOne(userId);

    // Remove existing roles and reassign
    await this.prisma.userRole.deleteMany({ where: { userId } });

    const userRoles = await this.prisma.userRole.createMany({
      data: dto.roleIds.map((roleId) => ({
        userId,
        roleId,
        branchId: dto.branchId,
        assignedBy,
      })),
    });

    return userRoles;
  }

  async softDelete(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    return { message: 'User deleted / ব্যবহারকারী মুছে ফেলা হয়েছে' };
  }
}
