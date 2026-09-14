import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductDto, createdBy?: string) {
    const existing = await this.prisma.product.findFirst({
      where: { OR: [{ sku: dto.sku }, ...(dto.barcode ? [{ barcode: dto.barcode }] : [])] },
    });
    if (existing) throw new ConflictException('SKU or barcode already exists');

    return this.prisma.product.create({
      data: {
        ...dto,
        costPrice: dto.costPrice ?? 0,
        sellingPrice: dto.sellingPrice ?? 0,
        taxRate: dto.taxRate ?? 0,
        discountRate: dto.discountRate ?? 0,
        reorderLevel: dto.reorderLevel ?? 0,
        reorderQty: dto.reorderQty ?? 0,
        status: dto.status as any ?? 'ACTIVE',
        createdBy,
      },
      include: { category: true, brand: true, unit: true },
    });
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    brandId?: string;
    status?: string;
    lowStock?: boolean;
  }) {
    const { skip, take } = getPaginationParams(params);
    const where: any = { deletedAt: null };

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { nameBn: { contains: params.search, mode: 'insensitive' } },
        { sku: { contains: params.search, mode: 'insensitive' } },
        { barcode: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.brandId) where.brandId = params.brandId;
    if (params.status) where.status = params.status;

    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        include: {
          category: { select: { id: true, name: true, nameBn: true } },
          brand: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true, abbreviation: true } },
          productStocks: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return buildPaginatedResult(products, total, params.page || 1, take);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        brand: true,
        unit: true,
        variants: true,
        barcodes: true,
        productStocks: { include: { warehouse: true } },
      },
    });
    if (!product || product.deletedAt) throw new NotFoundException('Product not found / পণ্য পাওয়া যায়নি');
    return product;
  }

  async findByBarcode(barcode: string) {
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ barcode }, { barcodes: { some: { barcode } } }], deletedAt: null },
      include: {
        category: true,
        unit: true,
        productStocks: true,
      },
    });
    if (!product) throw new NotFoundException('Product not found for barcode');
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: { ...dto, status: dto.status as any },
      include: { category: true, brand: true, unit: true },
    });
  }

  async softDelete(id: string) {
    await this.findOne(id);
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    return { message: 'Product deleted / পণ্য মুছে ফেলা হয়েছে' };
  }

  async getLowStockProducts(threshold?: number) {
    return this.prisma.$queryRaw`
      SELECT p.id, p.name, p.name_bn, p.sku, p.reorder_level,
             COALESCE(SUM(ps.quantity), 0) as total_stock
      FROM products p
      LEFT JOIN product_stocks ps ON ps.product_id = p.id
      WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
      GROUP BY p.id, p.name, p.name_bn, p.sku, p.reorder_level
      HAVING COALESCE(SUM(ps.quantity), 0) <= p.reorder_level
      ORDER BY total_stock ASC
    `;
  }
}
