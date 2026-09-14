import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StockMovementType } from '@prisma/client';
import Decimal from 'decimal.js';

export interface RecordMovementDto {
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  quantity: number | string;
  unitCost?: number | string;
  referenceType?: string;
  referenceId?: string;
  purchaseId?: string;
  saleId?: string;
  notes?: string;
  createdBy?: string;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Core method: records a stock movement and updates product_stocks atomically
   * Must be called inside a transaction for sale/purchase operations
   */
  async recordMovement(dto: RecordMovementDto, tx?: any): Promise<void> {
    const db = tx || this.prisma;
    const qty = new Decimal(dto.quantity.toString());

    if (qty.isZero()) return;

    // Get or create product stock record
    let productStock = await db.productStock.findUnique({
      where: {
        productId_warehouseId: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
        },
      },
    });

    if (!productStock) {
      productStock = await db.productStock.create({
        data: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantity: 0,
          reservedQty: 0,
        },
      });
    }

    const balanceBefore = new Decimal(productStock.quantity.toString());
    let balanceAfter: Decimal;

    // Determine if this is an IN or OUT movement
    const isInward = this.isInwardMovement(dto.type);

    if (isInward) {
      balanceAfter = balanceBefore.plus(qty);
    } else {
      balanceAfter = balanceBefore.minus(qty);
      if (balanceAfter.lessThan(0)) {
        this.logger.warn(
          `Stock going negative for product ${dto.productId} in warehouse ${dto.warehouseId}`,
        );
      }
    }

    const totalCost = dto.unitCost
      ? qty.times(new Decimal(dto.unitCost.toString())).toFixed(4)
      : undefined;

    // Create movement record
    await db.stockMovement.create({
      data: {
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        type: dto.type,
        quantity: qty.toFixed(4),
        unitCost: dto.unitCost ? new Decimal(dto.unitCost.toString()).toFixed(4) : undefined,
        totalCost,
        balanceBefore: balanceBefore.toFixed(4),
        balanceAfter: balanceAfter.toFixed(4),
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        purchaseId: dto.purchaseId,
        saleId: dto.saleId,
        notes: dto.notes,
        createdBy: dto.createdBy,
      },
    });

    // Update product stock
    await db.productStock.update({
      where: {
        productId_warehouseId: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
        },
      },
      data: { quantity: balanceAfter.toFixed(4) },
    });
  }

  private isInwardMovement(type: StockMovementType): boolean {
    const inward: StockMovementType[] = [
      StockMovementType.OPENING_STOCK,
      StockMovementType.PURCHASE,
      StockMovementType.SALES_RETURN,
      StockMovementType.ADJUSTMENT_IN,
      StockMovementType.TRANSFER_IN,
    ];
    return inward.includes(type);
  }

  async getStockBalance(productId: string, warehouseId?: string) {
    const where: any = { productId };
    if (warehouseId) where.warehouseId = warehouseId;

    const stocks = await this.prisma.productStock.findMany({
      where,
      include: { warehouse: { select: { id: true, name: true, nameBn: true } } },
    });

    const total = stocks.reduce(
      (sum, s) => sum.plus(new Decimal(s.quantity.toString())),
      new Decimal(0),
    );

    return { stocks, totalQuantity: total.toFixed(4) };
  }

  async getMovementHistory(
    productId: string,
    params: { page?: number; limit?: number; type?: string },
  ) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;
    const where: any = { productId };
    if (params.type) where.type = params.type;

    const [movements, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          warehouse: { select: { id: true, name: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { data: movements, total, page, limit };
  }
}
