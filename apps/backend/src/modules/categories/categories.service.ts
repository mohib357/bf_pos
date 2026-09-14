import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateCategoryDto, userId?: string) {
    const existing = await this.prisma.category.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Category code "${dto.code}" already exists / ক্যাটাগরি কোড ইতোমধ্যে আছে`);

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent category not found / মূল ক্যাটাগরি পাওয়া যায়নি');
    }

    const category = await this.prisma.category.create({
      data: {
        parentId: dto.parentId,
        code: dto.code.toUpperCase().replace(/\s+/g, '-'),
        name: dto.name,
        nameBn: dto.nameBn,
        description: dto.description,
        image: dto.image,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      include: { parent: { select: { id: true, name: true, nameBn: true } } },
    });

    await this.audit.log({
      userId,
      action: AuditAction.CREATE,
      tableName: 'categories',
      recordId: category.id,
      newValues: { code: category.code, name: category.name },
    });

    return category;
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    parentId?: string;
    isActive?: boolean;
    flat?: boolean;
  }) {
    // flat=false returns full tree; flat=true (or paginated) returns list
    if (params.flat === false && !params.search && params.parentId === undefined) {
      return this.getTree();
    }

    const { skip, take } = getPaginationParams(params);
    const where: any = {};

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { nameBn: { contains: params.search, mode: 'insensitive' } },
        { code: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.parentId !== undefined) {
      where.parentId = params.parentId === 'null' ? null : params.parentId;
    }
    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    const [categories, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        skip,
        take,
        include: {
          parent: { select: { id: true, name: true, nameBn: true } },
          children: {
            select: { id: true, name: true, nameBn: true, code: true, isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          _count: { select: { products: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.category.count({ where }),
    ]);

    return buildPaginatedResult(categories, total, params.page || 1, take);
  }

  async getTree() {
    const all = await this.prisma.category.findMany({
      include: {
        _count: { select: { products: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Build tree
    const map: Record<string, any> = {};
    all.forEach((c) => { map[c.id] = { ...c, children: [] }; });
    const roots: any[] = [];
    all.forEach((c) => {
      if (c.parentId && map[c.parentId]) {
        map[c.parentId].children.push(map[c.id]);
      } else {
        roots.push(map[c.id]);
      }
    });
    return roots;
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          include: { _count: { select: { products: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { products: true } },
      },
    });
    if (!category) throw new NotFoundException('Category not found / ক্যাটাগরি পাওয়া যায়নি');
    return category;
  }

  async findByCode(code: string) {
    const category = await this.prisma.category.findUnique({
      where: { code: code.toUpperCase() },
      include: { parent: true, children: true },
    });
    if (!category) throw new NotFoundException('Category not found / ক্যাটাগরি পাওয়া যায়নি');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, userId?: string) {
    const existing = await this.findOne(id);

    if (dto.code && dto.code !== existing.code) {
      const conflict = await this.prisma.category.findUnique({ where: { code: dto.code.toUpperCase().replace(/\s+/g, '-') } });
      if (conflict) throw new ConflictException(`Category code already exists / ক্যাটাগরি কোড ইতোমধ্যে আছে`);
    }

    // Prevent circular parent reference
    if (dto.parentId && dto.parentId === id) {
      throw new ConflictException('Category cannot be its own parent / ক্যাটাগরি নিজেই নিজের মূল হতে পারে না');
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.code && { code: dto.code.toUpperCase().replace(/\s+/g, '-') }),
        ...(dto.name && { name: dto.name }),
        ...(dto.nameBn !== undefined && { nameBn: dto.nameBn }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.image !== undefined && { image: dto.image }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        parent: { select: { id: true, name: true, nameBn: true } },
        _count: { select: { products: true } },
      },
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      tableName: 'categories',
      recordId: id,
      oldValues: { name: existing.name, isActive: existing.isActive },
      newValues: { name: updated.name, isActive: updated.isActive },
    });

    return updated;
  }

  async remove(id: string, userId?: string) {
    const category = await this.findOne(id);

    // Check children
    if ((category.children as any[]).length > 0) {
      throw new ConflictException(
        'Cannot delete category with subcategories. Remove subcategories first. / সাবক্যাটাগরি আছে, আগে সেগুলো মুছুন।',
      );
    }

    // Check products
    if (category._count.products > 0) {
      throw new ConflictException(
        `Cannot delete category with ${category._count.products} product(s). Reassign products first. / পণ্য আছে, আগে পণ্য সরান।`,
      );
    }

    await this.prisma.category.delete({ where: { id } });

    await this.audit.log({
      userId,
      action: AuditAction.DELETE,
      tableName: 'categories',
      recordId: id,
      oldValues: { name: category.name, code: category.code },
    });

    return { message: 'Category deleted / ক্যাটাগরি মুছে ফেলা হয়েছে' };
  }

  async getStats() {
    const [total, active, withProducts] = await this.prisma.$transaction([
      this.prisma.category.count(),
      this.prisma.category.count({ where: { isActive: true } }),
      this.prisma.category.count({ where: { products: { some: {} } } }),
    ]);
    return { total, active, inactive: total - active, withProducts };
  }
}
