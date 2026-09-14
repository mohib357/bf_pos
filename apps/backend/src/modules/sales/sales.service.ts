import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AccountingService } from '../accounting/accounting.service';
import { CreateSaleDto } from './dto/sale.dto';
import { generateSequenceNumber } from '../../common/utils/sequence.util';
import Decimal from 'decimal.js';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private accountingService: AccountingService,
  ) {}

  // ─── STOCK CHECK ─────────────────────────────────────────────────────────────
  /**
   * Checks product stock before sale.
   * Reads the `allow_negative_stock` setting (default: false).
   * Throws BadRequestException if stock is insufficient and negative stock is not allowed.
   */
  private async checkAndReserveStock(
    tx: any,
    warehouseId: string,
    items: Array<{ productId: string; quantity: number | string; name?: string }>,
  ): Promise<void> {
    // Read setting — default false (safe)
    const setting = await tx.setting.findUnique({
      where: { key: 'allow_negative_stock' },
    });
    const allowNegative =
      setting?.value === 'true' || setting?.value === '1';

    if (allowNegative) return; // feature disabled — skip check

    const errors: string[] = [];

    for (const item of items) {
      const qty = new Decimal(item.quantity.toString());

      // Use ORM with select + row-level locking via raw SQL for the balance
      // First get the stock record
      const stockRows = await tx.$queryRaw`
        SELECT ps.quantity, p.name, p.name_bn as "nameBn", p.sku
        FROM product_stocks ps
        JOIN products p ON p.id = ps.product_id
        WHERE ps.product_id::text = ${item.productId}
          AND ps.warehouse_id::text = ${warehouseId}
        FOR UPDATE
      `;

      const stock = Array.isArray(stockRows) ? stockRows[0] : null;
      const available = stock ? new Decimal(stock.quantity.toString()) : new Decimal(0);
      const productLabel = stock
        ? `${stock.name} (${stock.sku})`
        : `Product ID: ${item.productId}`;

      if (available.lessThan(qty)) {
        errors.push(
          `Insufficient stock for "${productLabel}": ` +
          `available ${available.toFixed(2)}, requested ${qty.toFixed(2)}`,
        );
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Insufficient stock / অপর্যাপ্ত স্টক',
        messageBn: 'অপর্যাপ্ত স্টক — বিক্রয় সম্পন্ন হয়নি',
        errors: errors.map((e) => ({ field: 'stock', message: e })),
      });
    }
  }

  // ─── CREATE SALE ─────────────────────────────────────────────────────────────
  async create(dto: CreateSaleDto, createdBy: string) {
    return this.prisma.withTransaction(async (tx) => {
      // Resolve warehouse
      let warehouseId = dto.warehouseId;
      if (!warehouseId) {
        const warehouse = await (tx as any).warehouse.findFirst({
          where: { branchId: dto.branchId, isDefault: true },
        });
        if (!warehouse) {
          throw new BadRequestException('No default warehouse found for branch');
        }
        warehouseId = warehouse.id;
      }

      // ── STOCK CHECK (runs inside transaction — auto-rollback on throw) ──
      await this.checkAndReserveStock(tx, warehouseId, dto.items);

      // Calculate sale totals
      let subtotal = new Decimal(0);
      const itemsData: any[] = [];

      for (const item of dto.items) {
        const product = await (tx as any).product.findUnique({
          where: { id: item.productId },
        });
        if (!product) throw new NotFoundException(`Product not found: ${item.productId}`);

        const qty = new Decimal(item.quantity.toString());
        const unitPrice = new Decimal(item.unitPrice.toString());
        const discountRate = new Decimal(item.discountRate?.toString() || '0');
        const taxRate = new Decimal(item.taxRate?.toString() || product.taxRate.toString());

        const lineAmount = qty.times(unitPrice);
        const discountAmt = lineAmount.times(discountRate.dividedBy(100));
        const afterDiscount = lineAmount.minus(discountAmt);
        const taxAmt = afterDiscount.times(taxRate.dividedBy(100));
        const totalAmount = afterDiscount.plus(taxAmt);

        subtotal = subtotal.plus(lineAmount);

        itemsData.push({
          productId: item.productId,
          unitId: item.unitId,
          quantity: qty.toFixed(4),
          returnedQty: '0',
          unitPrice: unitPrice.toFixed(4),
          unitCost: product.costPrice.toString(),
          discountRate: discountRate.toFixed(2),
          discountAmount: discountAmt.toFixed(4),
          taxRate: taxRate.toFixed(2),
          taxAmount: taxAmt.toFixed(4),
          totalAmount: totalAmount.toFixed(4),
          notes: item.notes,
        });
      }

      const discountAmount = new Decimal(dto.discountAmount?.toString() || '0');
      const afterDiscount = subtotal.minus(discountAmount);
      const totalAmount = afterDiscount;

      let paidAmount = new Decimal(0);
      const paymentsData: any[] = [];

      if (dto.payments?.length) {
        for (const payment of dto.payments) {
          paidAmount = paidAmount.plus(new Decimal(payment.amount.toString()));
          paymentsData.push(payment);
        }
      }

      const dueAmount = totalAmount.minus(paidAmount);
      const changeAmount = paidAmount.greaterThan(totalAmount)
        ? paidAmount.minus(totalAmount)
        : new Decimal(0);

      const paymentStatus =
        paidAmount.isZero() ? 'PENDING' :
        paidAmount.greaterThanOrEqualTo(totalAmount) ? 'PAID' : 'PARTIAL';

      const invoiceNumber = await generateSequenceNumber(this.prisma, 'sale');

      const sale = await (tx as any).sale.create({
        data: {
          branchId: dto.branchId,
          customerId: dto.customerId,
          invoiceNumber,
          saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
          status: 'COMPLETED',
          paymentStatus,
          subtotal: subtotal.toFixed(2),
          discountRate: dto.discountRate?.toString() || '0',
          discountAmount: discountAmount.toFixed(2),
          taxAmount: '0',
          totalAmount: totalAmount.toFixed(2),
          paidAmount: paidAmount.toFixed(2),
          dueAmount: dueAmount.isNegative() ? '0' : dueAmount.toFixed(2),
          changeAmount: changeAmount.toFixed(2),
          cashRegisterId: dto.cashRegisterId,
          notes: dto.notes,
          createdBy,
          items: { create: itemsData },
        },
        include: {
          items: { include: { product: true } },
          customer: true,
          branch: true,
        },
      });

      // Record stock movements
      for (const item of dto.items) {
        await this.inventoryService.recordMovement(
          {
            productId: item.productId,
            warehouseId,
            type: 'SALE',
            quantity: item.quantity,
            saleId: sale.id,
            referenceType: 'sale',
            referenceId: sale.id,
            createdBy,
          },
          tx,
        );
      }

      // Record customer payments
      if (paymentsData.length > 0) {
        for (const payment of paymentsData) {
          const paymentNumber = await generateSequenceNumber(this.prisma, 'customer_payment');
          await (tx as any).customerPayment.create({
            data: {
              customerId: dto.customerId,
              saleId: sale.id,
              paymentNumber,
              paymentDate: new Date(),
              amount: new Decimal(payment.amount.toString()).toFixed(2),
              method: payment.method,
              referenceNo: payment.referenceNo,
              notes: payment.notes,
              createdBy,
            },
          });
        }
      }

      // Update customer balance
      if (dto.customerId && dueAmount.greaterThan(0)) {
        await (tx as any).customer.update({
          where: { id: dto.customerId },
          data: {
            currentBalance: { increment: parseFloat(dueAmount.toFixed(2)) },
            totalPurchases: { increment: parseFloat(totalAmount.toFixed(2)) },
          },
        });
      }

      // Double-entry accounting
      await this.recordSaleJournalEntry(sale, dto, tx, createdBy);

      this.logger.log(`Sale created: ${invoiceNumber} — Total: ${totalAmount.toFixed(2)}`);

      return sale;
    });
  }

  // ─── ACCOUNTING ───────────────────────────────────────────────────────────────
  private async recordSaleJournalEntry(
    sale: any,
    dto: CreateSaleDto,
    tx: any,
    createdBy: string,
  ) {
    const cashAccount = await (tx as any).account.findFirst({
      where: { subType: 'CASH', isSystem: true },
    });
    const arAccount = await (tx as any).account.findFirst({
      where: { subType: 'ACCOUNTS_RECEIVABLE', isSystem: true },
    });
    const revenueAccount = await (tx as any).account.findFirst({
      where: { subType: 'SALES_REVENUE', isSystem: true },
    });
    const cogsAccount = await (tx as any).account.findFirst({
      where: { subType: 'COST_OF_GOODS_SOLD', isSystem: true },
    });
    const inventoryAccount = await (tx as any).account.findFirst({
      where: { subType: 'INVENTORY', isSystem: true },
    });

    if (!revenueAccount) return;

    const totalAmount = new Decimal(sale.totalAmount.toString());
    const paidAmount = new Decimal(sale.paidAmount.toString());
    const dueAmount = new Decimal(sale.dueAmount.toString());

    const lines: any[] = [];

    if (paidAmount.greaterThan(0) && cashAccount) {
      lines.push({
        debitAccountId: cashAccount.id,
        amount: paidAmount.toFixed(2),
        description: `Cash received — ${sale.invoiceNumber}`,
      });
    }

    if (dueAmount.greaterThan(0) && arAccount) {
      lines.push({
        debitAccountId: arAccount.id,
        amount: dueAmount.toFixed(2),
        description: `Credit sale — ${sale.invoiceNumber}`,
      });
    }

    if (lines.length > 0) {
      lines.push({
        creditAccountId: revenueAccount.id,
        amount: totalAmount.toFixed(2),
        description: `Sales revenue — ${sale.invoiceNumber}`,
      });

      await this.accountingService.createJournalEntry(
        {
          entryDate: new Date(sale.saleDate),
          type: 'SALE',
          description: `Sale — Invoice ${sale.invoiceNumber}`,
          lines,
          saleId: sale.id,
          createdBy,
        },
        tx,
      );
    }

    // COGS entry
    if (cogsAccount && inventoryAccount) {
      const totalCogs = sale.items.reduce((sum: Decimal, item: any) => {
        return sum.plus(
          new Decimal(item.quantity.toString()).times(new Decimal(item.unitCost.toString())),
        );
      }, new Decimal(0));

      if (totalCogs.greaterThan(0)) {
        await this.accountingService.createJournalEntry(
          {
            entryDate: new Date(sale.saleDate),
            type: 'SALE',
            description: `COGS — Invoice ${sale.invoiceNumber}`,
            lines: [
              {
                debitAccountId: cogsAccount.id,
                amount: totalCogs.toFixed(2),
                description: 'Cost of goods sold',
              },
              {
                creditAccountId: inventoryAccount.id,
                amount: totalCogs.toFixed(2),
                description: 'Inventory decrease',
              },
            ],
            saleId: sale.id,
            createdBy,
          },
          tx,
        );
      }
    }
  }

  // ─── FIND ALL ─────────────────────────────────────────────────────────────────
  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    branchId?: string;
    customerId?: string;
    status?: string;
    from?: string;
    to?: string;
  }) {
    const { skip, take } = getPaginationParams(params);
    const where: any = { isVoided: false };

    if (params.search) {
      where.OR = [
        { invoiceNumber: { contains: params.search, mode: 'insensitive' } },
        { customer: { name: { contains: params.search, mode: 'insensitive' } } },
        { customer: { phone: { contains: params.search } } },
      ];
    }
    if (params.branchId) where.branchId = params.branchId;
    if (params.customerId) where.customerId = params.customerId;
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.saleDate = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    const [sales, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        skip,
        take,
        include: {
          customer: { select: { id: true, name: true, nameBn: true, phone: true } },
          branch: { select: { id: true, name: true } },
          creator: { select: { id: true, username: true, firstName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { saleDate: 'desc' },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return buildPaginatedResult(sales, total, params.page || 1, take);
  }

  // ─── FIND ONE ─────────────────────────────────────────────────────────────────
  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, nameBn: true, sku: true, barcode: true } },
            unit: true,
          },
        },
        customer: true,
        branch: true,
        payments: true,
        creator: { select: { id: true, username: true, firstName: true } },
      },
    });
    if (!sale) throw new NotFoundException('Sale not found / বিক্রয় পাওয়া যায়নি');
    return sale;
  }

  // ─── VOID SALE ────────────────────────────────────────────────────────────────
  async voidSale(id: string, reason: string, voidedBy: string) {
    const sale = await this.findOne(id);
    if (sale.isVoided) throw new BadRequestException('Sale already voided');

    return this.prisma.withTransaction(async (tx) => {
      // Resolve warehouse from first stock movement
      const firstMovement = await (tx as any).stockMovement.findFirst({
        where: { saleId: id },
      });
      const warehouseId = firstMovement?.warehouseId;

      if (warehouseId) {
        for (const item of sale.items) {
          await this.inventoryService.recordMovement(
            {
              productId: item.productId,
              warehouseId,
              type: 'SALES_RETURN',
              quantity: item.quantity.toString(),
              saleId: id,
              notes: `Void: ${reason}`,
              createdBy: voidedBy,
            },
            tx,
          );
        }
      }

      return (tx as any).sale.update({
        where: { id },
        data: {
          isVoided: true,
          voidedAt: new Date(),
          voidedBy,
          voidReason: reason,
          status: 'CANCELLED',
        },
      });
    });
  }
}
