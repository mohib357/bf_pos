import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';

export class CreateSupplierDto {
  name: string;
  nameBn?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  creditLimit?: number;
  creditDays?: number;
  openingBalance?: number;
  notes?: string;
}

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  private async generateCode(): Promise<string> {
    const count = await this.prisma.supplier.count();
    return `SUP-${String(count + 1).padStart(5, '0')}`;
  }

  async create(dto: CreateSupplierDto) {
    const code = await this.generateCode();
    return this.prisma.supplier.create({
      data: { ...dto, code, creditLimit: dto.creditLimit || 0, creditDays: dto.creditDays || 0, openingBalance: dto.openingBalance || 0, currentBalance: dto.openingBalance || 0 },
    });
  }

  async findAll(params: { page?: number; limit?: number; search?: string }) {
    const { skip, take } = getPaginationParams(params);
    const where: any = { deletedAt: null };
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search } },
        { code: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    const [suppliers, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.supplier.count({ where }),
    ]);
    return buildPaginatedResult(suppliers, total, params.page || 1, take);
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier || supplier.deletedAt) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(id: string, dto: Partial<CreateSupplierDto>) {
    await this.findOne(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }
}
