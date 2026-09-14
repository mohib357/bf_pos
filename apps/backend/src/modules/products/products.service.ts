import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  GenerateSkuDto,
  BulkStatusUpdateDto,
} from './dto/product.dto';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';

// ─── SKU Generation ───────────────────────────────────────────────────────────

/**
 * Generates a unique SKU. Format: {CAT}-{BRAND}-{YYMMDD}-{NNNN}
 * Falls back to a pure numeric sequence if category/brand codes are absent.
 */
async function generateSku(
  prisma: PrismaService,
  opts: { categoryCode?: string; brandCode?: string } = {},
): Promise<string> {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(2);
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yy}${mm}${dd}`;

  const prefix = [
    opts.categoryCode ? opts.categoryCode.slice(0, 4).toUpperCase() : 'PRD',
    opts.brandCode ? opts.brandCode.slice(0, 3).toUpperCase() : null,
    dateStr,
  ]
    .filter(Boolean)
    .join('-');

  // Find highest numeric suffix for today's prefix
  const existing = await prisma.product.findMany({
    where: { sku: { startsWith: prefix } },
    select: { sku: true },
    orderBy: { sku: 'desc' },
  });

  let next = 1;
  if (existing.length > 0) {
    const last = existing[0].sku;
    const parts = last.split('-');
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) next = num + 1;
  }

  return `${prefix}-${String(next).padStart(4, '0')}`;
}

// ─── Internal Barcode Generation (EAN-13 style) ───────────────────────────────

/**
 * Generates an internal barcode using a 12-digit base + EAN-13 check digit.
 * Prefix 200 = internal (non-retail) range.
 */
function generateInternalBarcode(sequence: number): string {
  const base = `200${String(sequence).padStart(9, '0')}`;
  const digits = base.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += i % 2 === 0 ? digits[i] : digits[i] * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return base + String(check);
}

async function generateUniqueBarcode(prisma: PrismaService): Promise<string> {
  // Count existing products to seed the sequence
  const count = await prisma.product.count();
  let seq = count + 1;
  let barcode: string;
  let attempts = 0;

  do {
    barcode = generateInternalBarcode(seq + attempts);
    const exists = await prisma.product.findFirst({
      where: { OR: [{ barcode }, { barcodes: { some: { barcode } } }] },
    });
    if (!exists) break;
    attempts++;
  } while (attempts < 100);

  return barcode!;
}

// ─── Products Service ─────────────────────────────────────────────────────────

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateProductDto, userId?: string) {
    // Resolve category code for SKU generation
    let categoryCode: string | undefined;
    let brandCode: string | undefined;

    if (dto.categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!cat) throw new NotFoundException('Category not found / ক্যাটাগরি পাওয়া যায়নি');
      categoryCode = cat.code;
    }
    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
      if (!brand) throw new NotFoundException('Brand not found / ব্র্যান্ড পাওয়া যায়নি');
      brandCode = brand.name;
    }

    // Auto-generate SKU if not provided
    const sku = dto.sku?.trim() || (await generateSku(this.prisma, { categoryCode, brandCode }));

    // Check uniqueness
    const existing = await this.prisma.product.findFirst({
      where: {
        OR: [
          { sku },
          ...(dto.barcode ? [{ barcode: dto.barcode }] : []),
        ],
      },
    });
    if (existing) throw new ConflictException('SKU or barcode already exists / SKU বা বারকোড ইতোমধ্যে আছে');

    // Auto-generate barcode if not provided
    const barcode = dto.barcode || (await generateUniqueBarcode(this.prisma));

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          unitId: dto.unitId,
          sku,
          barcode,
          name: dto.name,
          nameBn: dto.nameBn,
          description: dto.description,
          descriptionBn: dto.descriptionBn,
          costPrice: dto.costPrice ?? 0,
          sellingPrice: dto.sellingPrice ?? 0,
          wholesalePrice: dto.wholesalePrice,
          mrp: dto.mrp,
          taxRate: dto.taxRate ?? 0,
          discountRate: dto.discountRate ?? 0,
          minimumStock: dto.minimumStock ?? 0,
          reorderLevel: dto.reorderLevel ?? 0,
          reorderQty: dto.reorderQty ?? 0,
          image: dto.image,
          images: dto.images ?? [],
          status: (dto.status as any) ?? 'ACTIVE',
          createdBy: userId,
          updatedBy: userId,
        },
        include: {
          category: { select: { id: true, name: true, nameBn: true, code: true } },
          brand: { select: { id: true, name: true, nameBn: true } },
          unit: { select: { id: true, name: true, nameBn: true, abbreviation: true } },
          barcodes: true,
        },
      });

      // Record initial price history
      await tx.productPriceHistory.create({
        data: {
          productId: created.id,
          costPrice: dto.costPrice ?? 0,
          sellingPrice: dto.sellingPrice ?? 0,
          wholesalePrice: dto.wholesalePrice,
          mrp: dto.mrp,
          changedBy: userId,
          reason: 'Initial price',
        },
      });

      return created;
    });

    await this.audit.log({
      userId,
      action: AuditAction.CREATE,
      tableName: 'products',
      recordId: product.id,
      newValues: { sku: product.sku, barcode: product.barcode, name: product.name },
    });

    return product;
  }

  // ── List ──────────────────────────────────────────────────────────────────

  async findAll(params: ProductQueryDto) {
    const { skip, take } = getPaginationParams(params);
    const where: any = { deletedAt: null };

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { nameBn: { contains: params.search, mode: 'insensitive' } },
        { sku: { contains: params.search, mode: 'insensitive' } },
        { barcode: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { barcodes: { some: { barcode: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.brandId) where.brandId = params.brandId;
    if (params.unitId) where.unitId = params.unitId;
    if (params.status) where.status = params.status;

    const orderBy: any = params.sortBy
      ? { [params.sortBy]: params.sortOrder || 'asc' }
      : { name: 'asc' };

    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        include: {
          category: { select: { id: true, name: true, nameBn: true, code: true } },
          brand: { select: { id: true, name: true, nameBn: true } },
          unit: { select: { id: true, name: true, nameBn: true, abbreviation: true } },
          productStocks: {
            select: { quantity: true, warehouseId: true, warehouse: { select: { name: true } } },
          },
        },
        orderBy,
      }),
      this.prisma.product.count({ where }),
    ]);

    // Attach total stock to each product
    const enriched = products.map((p) => {
      const totalStock = p.productStocks.reduce(
        (sum, s) => sum.plus(new Decimal(s.quantity.toString())),
        new Decimal(0),
      );
      return {
        ...p,
        totalStock: totalStock.toNumber(),
        stockValue: totalStock.times(new Decimal(p.costPrice.toString())).toNumber(),
        sellingValue: totalStock.times(new Decimal(p.sellingPrice.toString())).toNumber(),
        stockStatus: totalStock.isZero()
          ? 'out'
          : totalStock.lte(new Decimal(p.minimumStock.toString()))
          ? 'low'
          : 'in',
      };
    });

    // Stock status filter (done post-query since it's computed)
    const filtered =
      params.stockStatus
        ? enriched.filter((p) => p.stockStatus === params.stockStatus)
        : enriched;

    return buildPaginatedResult(filtered, total, params.page || 1, take);
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { include: { parent: { select: { id: true, name: true } } } },
        brand: true,
        unit: true,
        variants: true,
        barcodes: true,
        productStocks: { include: { warehouse: true } },
        priceHistory: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!product || product.deletedAt) {
      throw new NotFoundException('Product not found / পণ্য পাওয়া যায়নি');
    }

    // Aggregate stock
    const totalStock = product.productStocks.reduce(
      (sum, s) => sum.plus(new Decimal(s.quantity.toString())),
      new Decimal(0),
    );
    const stockValue = totalStock.times(new Decimal(product.costPrice.toString()));
    const sellingValue = totalStock.times(new Decimal(product.sellingPrice.toString()));

    return {
      ...product,
      totalStock: totalStock.toNumber(),
      stockValue: stockValue.toNumber(),
      sellingValue: sellingValue.toNumber(),
      stockStatus: totalStock.isZero()
        ? 'out'
        : totalStock.lte(new Decimal(product.minimumStock.toString()))
        ? 'low'
        : 'in',
    };
  }

  // ── Detail with full history ───────────────────────────────────────────────

  async findOneWithHistory(id: string) {
    const product = await this.findOne(id);

    const [purchaseHistory, salesHistory, stockMovements, supplierHistory] =
      await this.prisma.$transaction([
        // Purchase history — immutable unit costs preserved
        this.prisma.purchaseItem.findMany({
          where: { productId: id },
          include: {
            purchase: {
              select: {
                invoiceNumber: true,
                purchaseDate: true,
                supplier: { select: { name: true, nameBn: true } },
                status: true,
              },
            },
            unit: { select: { name: true, abbreviation: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        // Sales history — immutable unit prices preserved
        this.prisma.saleItem.findMany({
          where: { productId: id },
          include: {
            sale: {
              select: {
                invoiceNumber: true,
                saleDate: true,
                customer: { select: { name: true, nameBn: true } },
                status: true,
              },
            },
            unit: { select: { name: true, abbreviation: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        // Stock movements
        this.prisma.stockMovement.findMany({
          where: { productId: id },
          include: {
            warehouse: { select: { name: true, nameBn: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        // Supplier history (unique suppliers who supplied this product)
        this.prisma.purchaseItem.findMany({
          where: { productId: id },
          include: {
            purchase: {
              select: {
                supplier: { select: { id: true, name: true, nameBn: true, phone: true } },
                purchaseDate: true,
              },
            },
          },
          distinct: ['purchaseId'],
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    return {
      ...product,
      purchaseHistory,
      salesHistory,
      stockMovements,
      supplierHistory: supplierHistory.map((si) => si.purchase.supplier),
    };
  }

  // ── Barcode / SKU lookup ───────────────────────────────────────────────────

  async findByBarcode(barcode: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [
          { barcode },
          { barcodes: { some: { barcode } } },
        ],
        deletedAt: null,
      },
      include: {
        category: { select: { id: true, name: true, nameBn: true } },
        brand: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, abbreviation: true } },
        barcodes: true,
        productStocks: { select: { quantity: true, warehouse: { select: { name: true } } } },
      },
    });
    if (!product) throw new NotFoundException('Product not found for barcode / বারকোড দিয়ে পণ্য পাওয়া যায়নি');

    const totalStock = product.productStocks.reduce(
      (sum, s) => sum.plus(new Decimal(s.quantity.toString())),
      new Decimal(0),
    );
    return { ...product, totalStock: totalStock.toNumber() };
  }

  async findBySku(sku: string) {
    const product = await this.prisma.product.findUnique({
      where: { sku },
      include: {
        category: true,
        brand: true,
        unit: true,
        barcodes: true,
        productStocks: true,
      },
    });
    if (!product || product.deletedAt) {
      throw new NotFoundException('Product not found for SKU / SKU দিয়ে পণ্য পাওয়া যায়নি');
    }
    return product;
  }

  /** Universal search — by barcode, SKU, name, category name, brand name */
  async search(query: string) {
    if (!query || query.trim().length < 1) return [];

    const q = query.trim();
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        OR: [
          { sku: { contains: q, mode: 'insensitive' } },
          { barcode: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { nameBn: { contains: q, mode: 'insensitive' } },
          { barcodes: { some: { barcode: { contains: q, mode: 'insensitive' } } } },
          { category: { name: { contains: q, mode: 'insensitive' } } },
          { brand: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      include: {
        category: { select: { name: true, nameBn: true } },
        brand: { select: { name: true } },
        unit: { select: { name: true, abbreviation: true } },
        productStocks: { select: { quantity: true } },
      },
      take: 30,
      orderBy: { name: 'asc' },
    });

    return products.map((p) => ({
      ...p,
      totalStock: p.productStocks
        .reduce((sum, s) => sum.plus(new Decimal(s.quantity.toString())), new Decimal(0))
        .toNumber(),
    }));
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateProductDto, userId?: string) {
    const existing = await this.findOne(id);

    // SKU uniqueness check
    if (dto.sku && dto.sku !== existing.sku) {
      const conflict = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
      if (conflict) throw new ConflictException('SKU already exists / SKU ইতোমধ্যে আছে');
    }

    // Barcode uniqueness check
    if (dto.barcode && dto.barcode !== existing.barcode) {
      const conflict = await this.prisma.product.findFirst({
        where: { barcode: dto.barcode, id: { not: id } },
      });
      if (conflict) throw new ConflictException('Barcode already exists / বারকোড ইতোমধ্যে আছে');
    }

    // Detect price changes — record history if any price field changed
    const priceChanged =
      (dto.costPrice !== undefined && !new Decimal(dto.costPrice).equals(new Decimal(existing.costPrice.toString()))) ||
      (dto.sellingPrice !== undefined && !new Decimal(dto.sellingPrice).equals(new Decimal(existing.sellingPrice.toString()))) ||
      (dto.wholesalePrice !== undefined && dto.wholesalePrice !== null &&
        (existing.wholesalePrice === null || !new Decimal(dto.wholesalePrice).equals(new Decimal(existing.wholesalePrice.toString())))) ||
      (dto.mrp !== undefined && dto.mrp !== null &&
        (existing.mrp === null || !new Decimal(dto.mrp).equals(new Decimal(existing.mrp.toString()))));

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.product.update({
        where: { id },
        data: {
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          ...(dto.brandId !== undefined && { brandId: dto.brandId }),
          ...(dto.unitId !== undefined && { unitId: dto.unitId }),
          ...(dto.sku && { sku: dto.sku }),
          ...(dto.barcode !== undefined && { barcode: dto.barcode }),
          ...(dto.name && { name: dto.name }),
          ...(dto.nameBn !== undefined && { nameBn: dto.nameBn }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.descriptionBn !== undefined && { descriptionBn: dto.descriptionBn }),
          ...(dto.costPrice !== undefined && { costPrice: dto.costPrice }),
          ...(dto.sellingPrice !== undefined && { sellingPrice: dto.sellingPrice }),
          ...(dto.wholesalePrice !== undefined && { wholesalePrice: dto.wholesalePrice }),
          ...(dto.mrp !== undefined && { mrp: dto.mrp }),
          ...(dto.taxRate !== undefined && { taxRate: dto.taxRate }),
          ...(dto.discountRate !== undefined && { discountRate: dto.discountRate }),
          ...(dto.minimumStock !== undefined && { minimumStock: dto.minimumStock }),
          ...(dto.reorderLevel !== undefined && { reorderLevel: dto.reorderLevel }),
          ...(dto.reorderQty !== undefined && { reorderQty: dto.reorderQty }),
          ...(dto.image !== undefined && { image: dto.image }),
          ...(dto.images !== undefined && { images: dto.images }),
          ...(dto.status && { status: dto.status as any }),
          updatedBy: userId,
        },
        include: {
          category: { select: { id: true, name: true, nameBn: true, code: true } },
          brand: { select: { id: true, name: true, nameBn: true } },
          unit: { select: { id: true, name: true, nameBn: true, abbreviation: true } },
          barcodes: true,
        },
      });

      // Append-only price history — historical transactions are untouched
      if (priceChanged) {
        await tx.productPriceHistory.create({
          data: {
            productId: id,
            costPrice: result.costPrice,
            sellingPrice: result.sellingPrice,
            wholesalePrice: result.wholesalePrice,
            mrp: result.mrp,
            changedBy: userId,
            reason: dto.priceChangeReason || 'Price update',
          },
        });
      }

      return result;
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      tableName: 'products',
      recordId: id,
      oldValues: {
        name: existing.name,
        costPrice: existing.costPrice,
        sellingPrice: existing.sellingPrice,
        status: existing.status,
      },
      newValues: {
        name: updated.name,
        costPrice: updated.costPrice,
        sellingPrice: updated.sellingPrice,
        status: updated.status,
      },
    });

    return updated;
  }

  // ── Soft Delete ───────────────────────────────────────────────────────────

  async softDelete(id: string, userId?: string) {
    await this.findOne(id);
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE', updatedBy: userId },
    });

    await this.audit.log({
      userId,
      action: AuditAction.DELETE,
      tableName: 'products',
      recordId: id,
    });

    return { message: 'Product deleted / পণ্য মুছে ফেলা হয়েছে' };
  }

  // ── Bulk Status Update ────────────────────────────────────────────────────

  async bulkUpdateStatus(dto: BulkStatusUpdateDto, userId?: string) {
    const result = await this.prisma.product.updateMany({
      where: { id: { in: dto.ids }, deletedAt: null },
      data: { status: dto.status as any, updatedBy: userId },
    });
    return { updated: result.count, message: `${result.count} products updated / ${result.count} টি পণ্য আপডেট হয়েছে` };
  }

  // ── Low Stock ─────────────────────────────────────────────────────────────

  async getLowStockProducts() {
    return this.prisma.$queryRaw<any[]>`
      SELECT p.id, p.name, p.name_bn as "nameBn", p.sku, p.barcode,
             p.reorder_level as "reorderLevel", p.minimum_stock as "minimumStock",
             p.selling_price as "sellingPrice", p.cost_price as "costPrice",
             COALESCE(SUM(ps.quantity), 0) as "totalStock",
             c.name as "categoryName", b.name as "brandName"
      FROM products p
      LEFT JOIN product_stocks ps ON ps.product_id = p.id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN brands b ON b.id = p.brand_id
      WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
      GROUP BY p.id, p.name, p.name_bn, p.sku, p.barcode,
               p.reorder_level, p.minimum_stock, p.selling_price, p.cost_price,
               c.name, b.name
      HAVING COALESCE(SUM(ps.quantity), 0) <= p.reorder_level
      ORDER BY COALESCE(SUM(ps.quantity), 0) ASC
    `;
  }

  // ── SKU Generator (public) ────────────────────────────────────────────────

  async generateSku(dto: GenerateSkuDto) {
    const sku = await generateSku(this.prisma, {
      categoryCode: dto.categoryCode,
      brandCode: dto.brandCode,
    });
    return { sku };
  }

  // ── Barcode Generator ─────────────────────────────────────────────────────

  async generateBarcode() {
    const barcode = await generateUniqueBarcode(this.prisma);
    return { barcode, type: 'EAN13', internal: true };
  }

  // ── Validate Barcode Uniqueness ───────────────────────────────────────────

  async validateBarcode(barcode: string, excludeProductId?: string) {
    const where: any = {
      OR: [{ barcode }, { barcodes: { some: { barcode } } }],
    };
    if (excludeProductId) where.id = { not: excludeProductId };

    const exists = await this.prisma.product.findFirst({ where });
    return { unique: !exists, barcode };
  }

  // ── Price History ─────────────────────────────────────────────────────────

  async getPriceHistory(productId: string) {
    await this.findOne(productId); // ensure it exists
    return this.prisma.productPriceHistory.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats() {
    const [total, active, inactive, discontinued, lowStock, outOfStock] =
      await this.prisma.$transaction([
        this.prisma.product.count({ where: { deletedAt: null } }),
        this.prisma.product.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
        this.prisma.product.count({ where: { deletedAt: null, status: 'INACTIVE' } }),
        this.prisma.product.count({ where: { deletedAt: null, status: 'DISCONTINUED' } }),
        this.prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*)::bigint as count FROM products p
          LEFT JOIN product_stocks ps ON ps.product_id = p.id
          WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
          GROUP BY p.id HAVING COALESCE(SUM(ps.quantity), 0) <= p.reorder_level
            AND COALESCE(SUM(ps.quantity), 0) > 0
        `,
        this.prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*)::bigint as count FROM products p
          LEFT JOIN product_stocks ps ON ps.product_id = p.id
          WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
          GROUP BY p.id HAVING COALESCE(SUM(ps.quantity), 0) = 0
        `,
      ]);

    return {
      total,
      active,
      inactive,
      discontinued,
      lowStock: Number(Array.isArray(lowStock) ? lowStock.length : 0),
      outOfStock: Number(Array.isArray(outOfStock) ? outOfStock.length : 0),
    };
  }
}
