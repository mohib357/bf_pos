import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AccountingService } from '../accounting/accounting.service';
import { CreatePurchaseDto } from './dto/purchase.dto';
import { generateSequenceNumber } from '../../common/utils/sequence.util';
import Decimal from 'decimal.js';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private accountingService: AccountingService,
  ) {}

  async create(dto: CreatePurchaseDto, createdBy: string) {
    return this.prisma.withTransaction(async (tx) => {
      let warehouseId = dto.warehouseId;
      if (!warehouseId) {
        const warehouse = await (tx as any).warehouse.findFirst({
          where: { branchId: dto.branchId, isDefault: true },
        });
        if (!warehouse) throw new BadRequestException('No default warehouse found');
        warehouseId = warehouse.id;
      }

      let subtotal = new Decimal(0);
      let taxTotal = new Decimal(0);
      const itemsData: any[] = [];

      for (const item of dto.items) {
        const product = await (tx as any).product.findUnique({ where: { id: item.productId } });
        if (!product) throw new NotFoundException(`Product not found: ${item.productId}`);

        const qty = new Decimal(item.quantity.toString());
        const unitCost = new Decimal(item.unitCost.toString());
        const discountRate = new Decimal(item.discountRate?.toString() || '0');
        const taxRate = new Decimal(item.taxRate?.toString() || '0');

        const lineAmount = qty.times(unitCost);
        const discountAmt = lineAmount.times(discountRate.dividedBy(100));
        const afterDiscount = lineAmount.minus(discountAmt);
        const taxAmt = afterDiscount.times(taxRate.dividedBy(100));
        const totalAmount = afterDiscount.plus(taxAmt);

        subtotal = subtotal.plus(lineAmount);
        taxTotal = taxTotal.plus(taxAmt);

        itemsData.push({
          productId: item.productId,
          unitId: item.unitId,
          quantity: qty.toFixed(4),
          receivedQty: qty.toFixed(4),
          unitCost: unitCost.toFixed(4),
          discountRate: discountRate.toFixed(2),
          discountAmount: discountAmt.toFixed(4),
          taxRate: taxRate.toFixed(2),
          taxAmount: taxAmt.toFixed(4),
          totalAmount: totalAmount.toFixed(4),
          batchNo: item.batchNo,
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
        });
      }

      const discountAmount = new Decimal(dto.discountAmount?.toString() || '0');
      const shippingCost = new Decimal(dto.shippingCost?.toString() || '0');
      const otherCost = new Decimal(dto.otherCost?.toString() || '0');
      const totalAmount = subtotal.minus(discountAmount).plus(taxTotal).plus(shippingCost).plus(otherCost);
      const paidAmount = new Decimal(dto.paidAmount?.toString() || '0');
      const dueAmount = totalAmount.minus(paidAmount);

      const paymentStatus =
        paidAmount.isZero() ? 'PENDING' :
        paidAmount.greaterThanOrEqualTo(totalAmount) ? 'PAID' : 'PARTIAL';

      const invoiceNumber = await generateSequenceNumber(this.prisma, 'purchase');

      const purchase = await (tx as any).purchase.create({
        data: {
          branchId: dto.branchId,
          supplierId: dto.supplierId,
          invoiceNumber,
          referenceNo: dto.referenceNo,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          status: 'RECEIVED',
          paymentStatus,
          subtotal: subtotal.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          taxAmount: taxTotal.toFixed(2),
          shippingCost: shippingCost.toFixed(2),
          otherCost: otherCost.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          paidAmount: paidAmount.toFixed(2),
          dueAmount: dueAmount.isNegative() ? '0' : dueAmount.toFixed(2),
          notes: dto.notes,
          createdBy,
          items: { create: itemsData },
        },
        include: { items: { include: { product: true } }, supplier: true },
      });

      // Record stock movements
      for (const item of dto.items) {
        await this.inventoryService.recordMovement(
          {
            productId: item.productId,
            warehouseId,
            type: 'PURCHASE',
            quantity: item.quantity,
            unitCost: item.unitCost,
            purchaseId: purchase.id,
            referenceType: 'purchase',
            referenceId: purchase.id,
            createdBy,
          },
          tx,
        );

        // Update product cost price
        await (tx as any).product.update({
          where: { id: item.productId },
          data: { costPrice: new Decimal(item.unitCost.toString()).toFixed(4) },
        });
      }

      // Record payment if any
      if (paidAmount.greaterThan(0) && dto.paymentMethod) {
        const paymentNumber = await generateSequenceNumber(this.prisma, 'supplier_payment');
        await (tx as any).supplierPayment.create({
          data: {
            supplierId: dto.supplierId,
            purchaseId: purchase.id,
            paymentNumber,
            paymentDate: new Date(),
            amount: paidAmount.toFixed(2),
            method: dto.paymentMethod,
            referenceNo: dto.paymentReferenceNo,
            createdBy,
          },
        });
      }

      // Update supplier balance
      if (dueAmount.greaterThan(0)) {
        await (tx as any).supplier.update({
          where: { id: dto.supplierId },
          data: { currentBalance: { increment: parseFloat(dueAmount.toFixed(2)) } },
        });
      }

      // Double-entry accounting
      await this.recordPurchaseJournalEntry(purchase, dto, tx, createdBy);

      this.logger.log(`Purchase created: ${invoiceNumber} - Total: ${totalAmount.toFixed(2)}`);
      return purchase;
    });
  }

  private async recordPurchaseJournalEntry(purchase: any, dto: CreatePurchaseDto, tx: any, createdBy: string) {
    const inventoryAccount = await (tx as any).account.findFirst({
      where: { subType: 'INVENTORY', isSystem: true },
    });
    const cashAccount = await (tx as any).account.findFirst({
      where: { subType: 'CASH', isSystem: true },
    });
    const apAccount = await (tx as any).account.findFirst({
      where: { subType: 'ACCOUNTS_PAYABLE', isSystem: true },
    });

    if (!inventoryAccount) return;

    const totalAmount = new Decimal(purchase.totalAmount.toString());
    const paidAmount = new Decimal(purchase.paidAmount.toString());
    const dueAmount = new Decimal(purchase.dueAmount.toString());

    const lines: any[] = [
      {
        debitAccountId: inventoryAccount.id,
        amount: totalAmount.toFixed(2),
        description: `Inventory purchase - ${purchase.invoiceNumber}`,
      },
    ];

    if (paidAmount.greaterThan(0) && cashAccount) {
      lines.push({
        creditAccountId: cashAccount.id,
        amount: paidAmount.toFixed(2),
        description: `Cash paid - ${purchase.invoiceNumber}`,
      });
    }

    if (dueAmount.greaterThan(0) && apAccount) {
      lines.push({
        creditAccountId: apAccount.id,
        amount: dueAmount.toFixed(2),
        description: `Accounts payable - ${purchase.invoiceNumber}`,
      });
    }

    if (lines.length >= 2) {
      await this.accountingService.createJournalEntry(
        {
          entryDate: new Date(purchase.purchaseDate),
          type: 'PURCHASE',
          description: `Purchase - ${purchase.invoiceNumber}`,
          lines,
          purchaseId: purchase.id,
          createdBy,
        },
        tx,
      );
    }
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    branchId?: string;
    supplierId?: string;
    status?: string;
    from?: string;
    to?: string;
  }) {
    const { skip, take } = getPaginationParams(params);
    const where: any = { isVoided: false };

    if (params.search) {
      where.OR = [
        { invoiceNumber: { contains: params.search, mode: 'insensitive' } },
        { referenceNo: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.branchId) where.branchId = params.branchId;
    if (params.supplierId) where.supplierId = params.supplierId;
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.purchaseDate = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    const [purchases, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where,
        skip,
        take,
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { purchaseDate: 'desc' },
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return buildPaginatedResult(purchases, total, params.page || 1, take);
  }

  async findOne(id: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, nameBn: true, sku: true } },
            unit: true,
          },
        },
        supplier: true,
        branch: true,
        payments: true,
      },
    });
    if (!purchase) throw new NotFoundException('Purchase not found');
    return purchase;
  }
}
