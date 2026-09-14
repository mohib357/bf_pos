import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';

@Injectable()
export class BrandsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateBrandDto, userId?: string) {
    const existing = await this.prisma.brand.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Brand name already exists / ব্র্যান্ড নাম ইতোমধ্যে আছে');

    const brand = await this.prisma.brand.create({
      data: {
        name: dto.name,
        nameBn: dto.nameBn,
        description: dto.description,
        logo: dto.logo,
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit.log({
      userId,
      action: AuditAction.CREATE,
      tableName: 'brands',
      recordId: brand.id,
      newValues: { name: brand.name },
    });

    return brand;
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
      ];
    }
    if (params.isActive !== undefined) where.isActive = params.isActive;

    const [brands, total] = await this.prisma.$transaction([
      this.prisma.brand.findMany({
        where,
        skip,
        take,
        include: { _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.brand.count({ where }),
    ]);

    return buildPaginatedResult(brands, total, params.page || 1, take);
  }

  async findOne(id: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) throw new NotFoundException('Brand not found / ব্র্যান্ড পাওয়া যায়নি');
    return brand;
  }

  async update(id: string, dto: UpdateBrandDto, userId?: string) {
    const existing = await this.findOne(id);

    if (dto.name && dto.name !== existing.name) {
      const conflict = await this.prisma.brand.findUnique({ where: { name: dto.name } });
      if (conflict) throw new ConflictException('Brand name already exists / ব্র্যান্ড নাম ইতোমধ্যে আছে');
    }

    const updated = await this.prisma.brand.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.nameBn !== undefined && { nameBn: dto.nameBn }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.logo !== undefined && { logo: dto.logo }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { _count: { select: { products: true } } },
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      tableName: 'brands',
      recordId: id,
      oldValues: { name: existing.name, isActive: existing.isActive },
      newValues: { name: updated.name, isActive: updated.isActive },
    });

    return updated;
  }

  async remove(id: string, userId?: string) {
    const brand = await this.findOne(id);

    if ((brand._count as any).products > 0) {
      throw new ConflictException(
        `Cannot delete brand with ${(brand._count as any).products} product(s). Reassign products first. / পণ্য আছে, আগে পণ্য সরান।`,
      );
    }

    await this.prisma.brand.delete({ where: { id } });

    await this.audit.log({
      userId,
      action: AuditAction.DELETE,
      tableName: 'brands',
      recordId: id,
      oldValues: { name: brand.name },
    });

    return { message: 'Brand deleted / ব্র্যান্ড মুছে ফেলা হয়েছে' };
  }

  async getAll() {
    return this.prisma.brand.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, nameBn: true, logo: true },
    });
  }
}
