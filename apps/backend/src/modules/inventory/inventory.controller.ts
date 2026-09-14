/**
 * Inventory Controller
 * Endpoints: stock levels, stock movements, manual adjustments, stock count, valuation
 * RBAC: inventory:read:inventory, inventory:adjust:inventory
 */
import {
  Controller, Get, Post, Body, Param, Query,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';
import { IsNotEmpty, IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { StockMovementType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import Decimal from 'decimal.js';

// ── DTOs ──────────────────────────────────────────────────────────────────────

export class ManualAdjustDto {
  @ApiProperty({ description: 'Product UUID' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ description: 'Warehouse UUID' })
  @IsNotEmpty()
  @IsString()
  warehouseId: string;

  @ApiProperty({ description: 'Positive = IN, Negative = OUT', example: 10 })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({ description: 'Unit cost for valuation' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class StockCountItemDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  warehouseId: string;

  @ApiProperty({ description: 'Physical counted quantity', minimum: 0 })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedQuantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class StockCountDto {
  @ApiProperty({ type: [StockCountItemDto] })
  @IsNotEmpty()
  items: StockCountItemDto[];
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /inventory/stock
   * All products with their current stock across warehouses.
   * Requires: inventory:read:inventory
   */
  @Get('stock')
  @RequirePermissions('inventory:read:inventory')
  async getAllStock(
    @Query('warehouseId') warehouseId?: string,
    @Query('lowStock') lowStock?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const take = Math.min(Number(limit) || 50, 200);
    const skip = ((Number(page) || 1) - 1) * take;

    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;

    const [stocks, total] = await this.prisma.$transaction([
      this.prisma.productStock.findMany({
        where,
        skip,
        take,
        include: {
          product: {
            select: {
              id: true, sku: true, name: true, nameBn: true,
              sellingPrice: true, costPrice: true, reorderLevel: true,
              status: true,
              category: { select: { id: true, name: true, nameBn: true } },
            },
          },
          warehouse: { select: { id: true, name: true, nameBn: true } },
        },
        orderBy: { product: { name: 'asc' } },
      }),
      this.prisma.productStock.count({ where }),
    ]);

    // Optionally filter low-stock items
    const data = lowStock === 'true'
      ? stocks.filter(s => {
          const qty   = new Decimal(s.quantity.toString());
          const level = new Decimal((s.product.reorderLevel ?? 0).toString());
          return qty.lte(level);
        })
      : stocks;

    return ApiResponse.paginated(data, total, Number(page), take,
      'Stock retrieved / স্টক পাওয়া গেছে');
  }

  /**
   * GET /inventory/stock/:productId
   * Stock of a specific product, broken down by warehouse.
   * Requires: inventory:read:inventory
   */
  @Get('stock/:productId')
  @RequirePermissions('inventory:read:inventory')
  async getProductStock(@Param('productId', ParseUUIDPipe) productId: string) {
    const result = await this.inventoryService.getStockBalance(productId);
    return ApiResponse.success(result, 'Product stock retrieved');
  }

  /**
   * GET /inventory/movements
   * Paginated stock movement history.
   * Requires: inventory:read:inventory
   */
  @Get('movements')
  @RequirePermissions('inventory:read:inventory')
  async getMovements(
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('type') type?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const skip = ((Number(page) || 1) - 1) * take;

    const where: any = {};
    if (productId)   where.productId   = productId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (type && Object.values(StockMovementType).includes(type as StockMovementType)) {
      where.type = type;
    }

    const [movements, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        include: {
          product:   { select: { id: true, sku: true, name: true, nameBn: true } },
          warehouse: { select: { id: true, name: true, nameBn: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return ApiResponse.paginated(movements, total, Number(page), take,
      'Movements retrieved / স্টক মুভমেন্ট পাওয়া গেছে');
  }

  /**
   * POST /inventory/adjust
   * Manual stock adjustment (IN or OUT).
   * Requires: inventory:adjust:inventory
   */
  @Post('adjust')
  @RequirePermissions('inventory:adjust:inventory')
  @HttpCode(HttpStatus.OK)
  async adjust(
    @Body() dto: ManualAdjustDto,
    @CurrentUser('id') userId: string,
  ) {
    const qty = dto.quantity;
    const type: StockMovementType = qty >= 0
      ? StockMovementType.ADJUSTMENT_IN
      : StockMovementType.ADJUSTMENT_OUT;

    await this.inventoryService.recordMovement({
      productId:   dto.productId,
      warehouseId: dto.warehouseId,
      type,
      quantity:    Math.abs(qty),
      unitCost:    dto.unitCost,
      referenceType: 'MANUAL_ADJUSTMENT',
      notes:       dto.notes,
      createdBy:   userId,
    });

    // Return updated stock
    const updated = await this.inventoryService.getStockBalance(dto.productId, dto.warehouseId);
    return ApiResponse.success(
      updated,
      `Stock adjusted (${qty >= 0 ? '+' : ''}${qty}) / স্টক সমন্বয় হয়েছে`,
    );
  }

  /**
   * POST /inventory/count
   * Stock count session — reconcile counted vs system quantities.
   * Requires: inventory:adjust:inventory
   */
  @Post('count')
  @RequirePermissions('inventory:adjust:inventory')
  @HttpCode(HttpStatus.OK)
  async stockCount(
    @Body() dto: StockCountDto,
    @CurrentUser('id') userId: string,
  ) {
    const results: any[] = [];

    for (const item of dto.items) {
      const balance = await this.inventoryService.getStockBalance(item.productId, item.warehouseId);
      const systemQty  = balance.stocks[0]
        ? new Decimal(balance.stocks[0].quantity.toString())
        : new Decimal(0);
      const countedQty = new Decimal(item.countedQuantity.toString());
      const diff = countedQty.minus(systemQty);

      if (!diff.isZero()) {
        const type: StockMovementType = diff.isPositive()
          ? StockMovementType.ADJUSTMENT_IN
          : StockMovementType.ADJUSTMENT_OUT;

        await this.inventoryService.recordMovement({
          productId:     item.productId,
          warehouseId:   item.warehouseId,
          type,
          quantity:      diff.abs().toNumber(),
          referenceType: 'STOCK_COUNT',
          notes:         item.notes ?? 'Stock count reconciliation / স্টক কাউন্ট সমন্বয়',
          createdBy:     userId,
        });
      }

      results.push({
        productId:   item.productId,
        warehouseId: item.warehouseId,
        systemQty:   systemQty.toFixed(4),
        countedQty:  countedQty.toFixed(4),
        difference:  diff.toFixed(4),
        adjusted:    !diff.isZero(),
      });
    }

    return ApiResponse.success(results,
      `Stock count complete: ${results.filter(r => r.adjusted).length} adjustment(s) made`);
  }

  /**
   * GET /inventory/valuation
   * Current stock valuation = quantity × costPrice per product.
   * Requires: inventory:read:inventory
   */
  @Get('valuation')
  @RequirePermissions('inventory:read:inventory')
  async valuation(@Query('warehouseId') warehouseId?: string) {
    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;

    const stocks = await this.prisma.productStock.findMany({
      where,
      include: {
        product:   { select: { id: true, sku: true, name: true, nameBn: true, costPrice: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    let totalValue = new Decimal(0);
    const lines = stocks.map(s => {
      const qty   = new Decimal(s.quantity.toString());
      const cost  = new Decimal((s.product.costPrice ?? 0).toString());
      const value = qty.times(cost);
      totalValue  = totalValue.plus(value);
      return {
        productId:   s.productId,
        sku:         s.product.sku,
        name:        s.product.name,
        nameBn:      s.product.nameBn,
        warehouse:   s.warehouse.name,
        quantity:    qty.toFixed(4),
        costPrice:   cost.toFixed(2),
        totalValue:  value.toFixed(2),
      };
    });

    return ApiResponse.success(
      { lines, totalValue: totalValue.toFixed(2), lineCount: lines.length },
      'Valuation complete / মূল্যায়ন সম্পন্ন',
    );
  }
}
