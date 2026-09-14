import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';

@Injectable()
export class UnitsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateUnitDto, userId?: string) {
    const existing = await this.prisma.unit.findFirst({
      where: {
        OR: [
          { name: { equals: dto.name, mode: 'insensitive' } },
          { abbreviation: { equals: dto.abbreviation, mode: 'insensitive' } },
        ],
      },
    });
    if (existing) throw new ConflictException('Unit name or abbreviation already exists / ইউনিট নাম বা সংক্ষেপ ইতোমধ্যে আছে');

    const unit = await this.prisma.unit.create({
      data: {
        name: dto.name,
        nameBn: dto.nameBn,
        abbreviation: dto.abbreviation.toLowerCase(),
        abbrevBn: dto.abbrevBn,
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit.log({
      userId,
      action: AuditAction.CREATE,
      tableName: 'units',
      recordId: unit.id,
      newValues: { name: unit.name, abbreviation: unit.abbreviation },
    });

    return unit;
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
  }) {
    const { skip, take } = getPaginationParams(params);
    const where: any = {};

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { nameBn: { contains: params.search, mode: 'insensitive' } },
        { abbreviation: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.isActive !== undefined) where.isActive = params.isActive;

    const [units, total] = await this.prisma.$transaction([
      this.prisma.unit.findMany({
        where,
        skip,
        take,
        include: { _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.unit.count({ where }),
    ]);

    return buildPaginatedResult(units, total, params.page || 1, take);
  }

  async findOne(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!unit) throw new NotFoundException('Unit not found / ইউনিট পাওয়া যায়নি');
    return unit;
  }

  async update(id: string, dto: UpdateUnitDto, userId?: string) {
    const existing = await this.findOne(id);

    if (dto.name && dto.name !== existing.name) {
      const conflict = await this.prisma.unit.findFirst({
        where: { name: { equals: dto.name, mode: 'insensitive' } },
      });
      if (conflict) throw new ConflictException('Unit name already exists / ইউনিট নাম ইতোমধ্যে আছে');
    }

    if (dto.abbreviation && dto.abbreviation !== existing.abbreviation) {
      const conflict = await this.prisma.unit.findFirst({
        where: { abbreviation: { equals: dto.abbreviation, mode: 'insensitive' } },
      });
      if (conflict) throw new ConflictException('Unit abbreviation already exists / সংক্ষেপ ইতোমধ্যে আছে');
    }

    const updated = await this.prisma.unit.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.nameBn !== undefined && { nameBn: dto.nameBn }),
        ...(dto.abbreviation && { abbreviation: dto.abbreviation.toLowerCase() }),
        ...(dto.abbrevBn !== undefined && { abbrevBn: dto.abbrevBn }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { _count: { select: { products: true } } },
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      tableName: 'units',
      recordId: id,
      oldValues: { name: existing.name },
      newValues: { name: updated.name },
    });

    return updated;
  }

  async remove(id: string, userId?: string) {
    const unit = await this.findOne(id);

    if ((unit._count as any).products > 0) {
      throw new ConflictException(
        `Cannot delete unit with ${(unit._count as any).products} product(s) assigned. / পণ্য আছে, ইউনিট মুছা যাবে না।`,
      );
    }

    await this.prisma.unit.delete({ where: { id } });

    await this.audit.log({
      userId,
      action: AuditAction.DELETE,
      tableName: 'units',
      recordId: id,
      oldValues: { name: unit.name },
    });

    return { message: 'Unit deleted / ইউনিট মুছে ফেলা হয়েছে' };
  }

  async getAll() {
    return this.prisma.unit.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, nameBn: true, abbreviation: true, abbrevBn: true },
    });
  }
}
