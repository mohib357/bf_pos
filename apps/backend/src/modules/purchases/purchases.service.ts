import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, StockMovementType } from '@prisma/client';
import {
  CreatePurchaseDto,
  ReceivePurchaseDto,
  AddPaymentDto,
  CreatePurchaseReturnDto,
  PurchaseQueryDto,
  PurchasePaymentLineDto,
} from './dto/purchase.dto';
import { generateSequenceNumber } from '../../common/utils/sequence.util';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';

// ─── helpers ─────────────────────────────────────────────────────────────────

function toDecimal(v: any): Decimal {
  return new Decimal(v?.toString() ?? '0');
}

function paymentStatusFromAmounts(paid: Decimal, total: Decimal): string {
  if (paid.isZero()) return 'PENDING';
  if (paid.greaterThanOrEqualTo(total)) return 'PAID';
  return 'PARTIAL';
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private accountingService: AccountingService,
    private audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE DRAFT PURCHASE
  // ═══════════════════════════════════════════════════════════════════════════

  async create(dto: CreatePurchaseDto, createdBy: string) {
    return this.prisma.$transaction(async (tx) => {
      // ── Resolve warehouse ─────────────────────────────────────────────────
      const warehouseId = await this.resolveWarehouse(tx, dto.branchId, dto.warehouseId);

      // ── Validate supplier ─────────────────────────────────────────────────
      const supplier = await (tx as any).supplier.findUnique({
        where: { id: dto.supplierId },
      });
      if (!supplier || supplier.deletedAt) {
        throw new NotFoundException('Supplier not found / সরবরাহকারী পাওয়া যায়নি');
      }

      // ── Calculate line items ──────────────────────────────────────────────
      const { itemsData, subtotal, taxTotal } = this.calculateItems(dto.items);

      // ── Calculate totals ──────────────────────────────────────────────────
      const discountAmount = toDecimal(dto.discountAmount);
      const shippingCost = toDecimal(dto.shippingCost);
      const otherCost = toDecimal(dto.otherCost);
      const totalAmount = subtotal
        .minus(discountAmount)
        .plus(taxTotal)
        .plus(shippingCost)
        .plus(otherCost);

      // ── Consolidate payments ──────────────────────────────────────────────
      const paymentLines = this.buildPaymentLines(dto);
      const paidAmount = paymentLines.reduce((s, p) => s.plus(toDecimal(p.amount)), new Decimal(0));
      const dueAmount = Decimal.max(0, totalAmount.minus(paidAmount));
      const paymentStatus = paymentStatusFromAmounts(paidAmount, totalAmount);

      const invoiceNumber = await generateSequenceNumber(this.prisma, 'purchase');

      // ── Determine status ──────────────────────────────────────────────────
      const status = dto.receiveImmediately ? 'RECEIVED' : 'DRAFT';

      const purchase = await (tx as any).purchase.create({
        data: {
          branchId: dto.branchId,
          supplierId: dto.supplierId,
          invoiceNumber,
          referenceNo: dto.referenceNo,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          status,
          paymentStatus,
          subtotal: subtotal.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          taxAmount: taxTotal.toFixed(2),
          shippingCost: shippingCost.toFixed(2),
          otherCost: otherCost.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          paidAmount: paidAmount.toFixed(2),
          dueAmount: dueAmount.toFixed(2),
          notes: dto.notes,
          createdBy,
          items: { create: itemsData },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, sku: true } }, unit: true } },
          supplier: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      // ── If receiving immediately, do stock + accounting ───────────────────
      if (dto.receiveImmediately) {
        await this.performReceive(tx, purchase, warehouseId, createdBy);
      }

      // ── Record payment(s) ─────────────────────────────────────────────────
      if (paymentLines.length > 0) {
        await this.recordPayments(tx, purchase, paymentLines, createdBy);
      }

      // ── Update supplier balance (due only) ────────────────────────────────
      if (dto.receiveImmediately && dueAmount.greaterThan(0)) {
        await (tx as any).supplier.update({
          where: { id: dto.supplierId },
          data: { currentBalance: { increment: parseFloat(dueAmount.toFixed(2)) } },
        });
      }

      // ── Accounting journal for payments ───────────────────────────────────
      if (dto.receiveImmediately && paidAmount.greaterThan(0)) {
        await this.recordPaymentJournalEntries(
          tx, purchase, paymentLines, createdBy,
        );
      }

      this.logger.log(`Purchase created: ${invoiceNumber} status=${status}`);

      await this.audit.log({
        userId: createdBy,
        action: AuditAction.CREATE,
        tableName: 'purchases',
        recordId: purchase.id,
        newValues: { invoiceNumber, supplierId: dto.supplierId, status, totalAmount: totalAmount.toFixed(2) },
      });

      return purchase;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECEIVE A DRAFT PURCHASE (stock comes in)
  // ═══════════════════════════════════════════════════════════════════════════

  async receive(id: string, dto: ReceivePurchaseDto, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const purchase = await (tx as any).purchase.findUnique({
        where: { id },
        include: {
          items: { include: { product: true, unit: true } },
          supplier: true,
        },
      });

      if (!purchase) throw new NotFoundException('Purchase not found');
      if (purchase.isVoided) throw new BadRequestException('Purchase is voided');
      if (purchase.status === 'RECEIVED') {
        throw new ConflictException('Purchase already received / ক্রয় ইতোমধ্যে গৃহীত হয়েছে');
      }
      if (purchase.status === 'CANCELLED') {
        throw new BadRequestException('Cannot receive a cancelled purchase');
      }

      const warehouseId = await this.resolveWarehouse(tx, purchase.branchId, dto.warehouseId);

      // ── Receive stock ─────────────────────────────────────────────────────
      await this.performReceive(tx, purchase, warehouseId, userId);

      // ── Handle new payments ───────────────────────────────────────────────
      const paymentLines: PurchasePaymentLineDto[] = dto.payments || [];
      const newPaid = paymentLines.reduce((s, p) => s.plus(toDecimal(p.amount)), new Decimal(0));
      const previousPaid = toDecimal(purchase.paidAmount);
      const totalPaid = previousPaid.plus(newPaid);
      const totalAmount = toDecimal(purchase.totalAmount);
      const dueAmount = Decimal.max(0, totalAmount.minus(totalPaid));
      const paymentStatus = paymentStatusFromAmounts(totalPaid, totalAmount);

      // ── Update purchase status ─────────────────────────────────────────────
      await (tx as any).purchase.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          paymentStatus,
          paidAmount: totalPaid.toFixed(2),
          dueAmount: dueAmount.toFixed(2),
          notes: dto.notes ? `${purchase.notes ?? ''}\n[Received] ${dto.notes}`.trim() : purchase.notes,
        },
      });

      // ── Record new payments ───────────────────────────────────────────────
      if (paymentLines.length > 0) {
        await this.recordPayments(tx, purchase, paymentLines, userId);
        await this.recordPaymentJournalEntries(tx, purchase, paymentLines, userId);
      }

      // ── Update supplier payable ───────────────────────────────────────────
      if (dueAmount.greaterThan(0)) {
        const netNewDue = totalAmount.minus(previousPaid).minus(newPaid);
        if (netNewDue.greaterThan(0)) {
          await (tx as any).supplier.update({
            where: { id: purchase.supplierId },
            data: { currentBalance: { increment: parseFloat(netNewDue.toFixed(2)) } },
          });
        }
      }

      this.logger.log(`Purchase received: ${purchase.invoiceNumber}`);

      await this.audit.log({
        userId,
        action: AuditAction.UPDATE,
        tableName: 'purchases',
        recordId: id,
        oldValues: { status: purchase.status },
        newValues: { status: 'RECEIVED', paymentStatus },
      });
    });

    // ── Return fresh data AFTER transaction commits ──────────────────────────
    return this.findOne(id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADD PAYMENT TO EXISTING PURCHASE
  // ═══════════════════════════════════════════════════════════════════════════

  async addPayment(id: string, dto: AddPaymentDto, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const purchase = await (tx as any).purchase.findUnique({ where: { id } });
      if (!purchase) throw new NotFoundException('Purchase not found');
      if (purchase.isVoided) throw new BadRequestException('Purchase is voided');
      if (purchase.status !== 'RECEIVED') {
        throw new BadRequestException('Can only pay a received purchase / প্রথমে গ্রহণ করুন');
      }

      const payAmount = toDecimal(dto.amount);
      const currentDue = toDecimal(purchase.dueAmount);
      if (payAmount.greaterThan(currentDue)) {
        throw new BadRequestException(
          `Payment (${payAmount}) exceeds due amount (${currentDue})`,
        );
      }

      const paymentLine: PurchasePaymentLineDto = {
        method: dto.method,
        amount: dto.amount,
        referenceNo: dto.referenceNo,
        bankName: dto.bankName,
        notes: dto.notes,
      };

      await this.recordPayments(tx, purchase, [paymentLine], userId);
      await this.recordPaymentJournalEntries(tx, purchase, [paymentLine], userId);

      const newPaid = toDecimal(purchase.paidAmount).plus(payAmount);
      const newDue = toDecimal(purchase.totalAmount).minus(newPaid);
      const paymentStatus = paymentStatusFromAmounts(newPaid, toDecimal(purchase.totalAmount));

      await (tx as any).purchase.update({
        where: { id },
        data: {
          paidAmount: newPaid.toFixed(2),
          dueAmount: Decimal.max(0, newDue).toFixed(2),
          paymentStatus,
        },
      });

      await (tx as any).supplier.update({
        where: { id: purchase.supplierId },
        data: { currentBalance: { decrement: parseFloat(payAmount.toFixed(2)) } },
      });

      this.logger.log(`Payment added to purchase ${purchase.invoiceNumber}: ${payAmount.toFixed(2)}`);

      await this.audit.log({
        userId,
        action: AuditAction.UPDATE,
        tableName: 'purchases',
        recordId: id,
        newValues: { paymentAdded: payAmount.toFixed(2), paymentStatus },
      });
    });

    return this.findOne(id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PURCHASE RETURN
  // ═══════════════════════════════════════════════════════════════════════════

  async createReturn(dto: CreatePurchaseReturnDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await (tx as any).purchase.findUnique({
        where: { id: dto.purchaseId },
        include: {
          items: { include: { product: true, unit: true } },
          supplier: true,
          branch: true,
        },
      });

      if (!purchase) throw new NotFoundException('Purchase not found');
      if (purchase.isVoided) throw new BadRequestException('Purchase is voided');
      if (purchase.status !== 'RECEIVED') {
        throw new BadRequestException(
          'Can only return items from a received purchase / প্রথমে গ্রহণ করতে হবে',
        );
      }

      // ── Validate return quantities ─────────────────────────────────────────
      const itemMap = new Map(purchase.items.map((i: any) => [i.id, i]));
      const returnItemsData: any[] = [];
      let subtotal = new Decimal(0);
      let taxTotal = new Decimal(0);

      for (const ri of dto.items) {
        const original = itemMap.get(ri.purchaseItemId) as any;
        if (!original) {
          throw new BadRequestException(`Purchase item not found: ${ri.purchaseItemId}`);
        }

        const alreadyReturned = toDecimal(original.returnedQty);
        const maxReturn = toDecimal(original.receivedQty).minus(alreadyReturned);
        const returnQty = toDecimal(ri.quantity);

        if (returnQty.greaterThan(maxReturn)) {
          throw new BadRequestException(
            `Return qty (${returnQty}) exceeds returnable qty (${maxReturn}) for product ${original.product.name}`,
          );
        }

        const unitCost = toDecimal(ri.unitCost);
        const taxRate = toDecimal(ri.taxRate);
        const lineAmount = returnQty.times(unitCost);
        const taxAmount = lineAmount.times(taxRate.dividedBy(100));
        const totalAmount = lineAmount.plus(taxAmount);

        subtotal = subtotal.plus(lineAmount);
        taxTotal = taxTotal.plus(taxAmount);

        returnItemsData.push({
          purchaseItemId: ri.purchaseItemId,
          productId: ri.productId,
          unitId: ri.unitId,
          quantity: returnQty.toFixed(4),
          unitCost: unitCost.toFixed(4),
          taxRate: taxRate.toFixed(2),
          taxAmount: taxAmount.toFixed(4),
          totalAmount: totalAmount.toFixed(4),
          reason: ri.reason,
        });
      }

      const totalAmount = subtotal.plus(taxTotal);
      const returnNumber = await generateSequenceNumber(this.prisma, 'purchase_return');

      const purchaseReturn = await (tx as any).purchaseReturn.create({
        data: {
          purchaseId: dto.purchaseId,
          supplierId: purchase.supplierId,
          returnNumber,
          returnDate: dto.returnDate ? new Date(dto.returnDate) : new Date(),
          reason: dto.reason,
          notes: dto.notes,
          subtotal: subtotal.toFixed(2),
          taxAmount: taxTotal.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          refundMethod: dto.refundMethod || 'CREDIT',
          status: 'CONFIRMED',
          createdBy: userId,
          items: { create: returnItemsData },
        },
        include: {
          items: { include: { product: true } },
          purchase: { select: { invoiceNumber: true } },
        },
      });

      // ── Update returnedQty on each purchase item ───────────────────────────
      for (const ri of dto.items) {
        const returnQty = toDecimal(ri.quantity);
        await (tx as any).purchaseItem.update({
          where: { id: ri.purchaseItemId },
          data: { returnedQty: { increment: parseFloat(returnQty.toFixed(4)) } },
        });
      }

      // ── Resolve default warehouse ──────────────────────────────────────────
      const warehouse = await (tx as any).warehouse.findFirst({
        where: { branchId: purchase.branchId, isDefault: true },
      });
      if (!warehouse) throw new BadRequestException('No default warehouse found');

      // ── Decrease stock for each returned item ──────────────────────────────
      for (const ri of returnItemsData) {
        await this.inventoryService.recordMovement(
          {
            productId: ri.productId,
            warehouseId: warehouse.id,
            type: StockMovementType.PURCHASE_RETURN,
            quantity: ri.quantity,
            unitCost: ri.unitCost,
            purchaseId: dto.purchaseId,
            referenceType: 'purchase_return',
            referenceId: purchaseReturn.id,
            notes: `Purchase return ${returnNumber}`,
            createdBy: userId,
          },
          tx,
        );
      }

      // ── Reverse supplier payable ───────────────────────────────────────────
      // Return reduces what we owe (or if already paid, supplier owes us)
      await (tx as any).supplier.update({
        where: { id: purchase.supplierId },
        data: { currentBalance: { decrement: parseFloat(totalAmount.toFixed(2)) } },
      });

      // ── Accounting reversal journal ────────────────────────────────────────
      await this.recordReturnJournalEntry(
        tx, purchaseReturn, purchase, dto.refundMethod || 'CREDIT', userId,
      );

      // ── Update purchase returnedStatus if fully returned ───────────────────
      const allReturned = await this.checkAllItemsReturned(tx, dto.purchaseId);
      if (allReturned) {
        await (tx as any).purchase.update({
          where: { id: dto.purchaseId },
          data: { status: 'RETURNED' },
        });
      }

      this.logger.log(`Purchase return created: ${returnNumber} total=${totalAmount.toFixed(2)}`);

      await this.audit.log({
        userId,
        action: AuditAction.CREATE,
        tableName: 'purchase_returns',
        recordId: purchaseReturn.id,
        newValues: {
          returnNumber,
          purchaseId: dto.purchaseId,
          totalAmount: totalAmount.toFixed(2),
        },
      });

      return purchaseReturn;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BARCODE SCAN / PRODUCT LOOKUP
  // ═══════════════════════════════════════════════════════════════════════════

  async lookupBarcode(barcode: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ barcode }, { barcodes: { some: { barcode } } }],
        deletedAt: null,
      },
      include: {
        category: { select: { id: true, name: true, nameBn: true } },
        brand: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, abbreviation: true } },
        productStocks: { select: { quantity: true, warehouse: { select: { name: true } } } },
      },
    });

    if (!product) {
      return { found: false, barcode };
    }

    const totalStock = product.productStocks.reduce(
      (sum, s) => sum.plus(toDecimal(s.quantity)),
      new Decimal(0),
    );

    return {
      found: true,
      product: {
        ...product,
        totalStock: totalStock.toNumber(),
        suggestedCost: product.costPrice,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERY
  // ═══════════════════════════════════════════════════════════════════════════

  async findAll(params: PurchaseQueryDto) {
    const { skip, take } = getPaginationParams(params);
    const where: any = { isVoided: false };

    if (params.search) {
      where.OR = [
        { invoiceNumber: { contains: params.search, mode: 'insensitive' } },
        { referenceNo: { contains: params.search, mode: 'insensitive' } },
        { supplier: { name: { contains: params.search, mode: 'insensitive' } } },
      ];
    }
    if (params.branchId) where.branchId = params.branchId;
    if (params.supplierId) where.supplierId = params.supplierId;
    if (params.status) where.status = params.status;
    if (params.paymentStatus) where.paymentStatus = params.paymentStatus;
    if (params.from || params.to) {
      where.purchaseDate = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    const orderBy: any = params.sortBy
      ? { [params.sortBy]: params.sortOrder || 'desc' }
      : { purchaseDate: 'desc' };

    const [purchases, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where,
        skip,
        take,
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
          _count: { select: { items: true, payments: true } },
        },
        orderBy,
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
            product: { select: { id: true, name: true, nameBn: true, sku: true, barcode: true } },
            unit: true,
          },
        },
        supplier: true,
        branch: true,
        payments: {
          where: { isVoided: false },
          orderBy: { paymentDate: 'desc' },
        },
        purchaseReturns: {
          where: { isVoided: false },
          include: { items: { include: { product: { select: { id: true, name: true } } } } },
        },
        journalEntries: {
          where: { isVoided: false },
          include: { lines: true },
          take: 10,
          orderBy: { entryDate: 'desc' },
        },
      },
    });
    if (!purchase) throw new NotFoundException('Purchase not found');
    return purchase;
  }

  async findOneReturn(returnId: string) {
    const ret = await this.prisma.purchaseReturn.findUnique({
      where: { id: returnId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, nameBn: true, sku: true } },
            unit: true,
            purchaseItem: { select: { quantity: true, receivedQty: true, returnedQty: true } },
          },
        },
        purchase: { select: { invoiceNumber: true, purchaseDate: true } },
        supplier: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!ret) throw new NotFoundException('Purchase return not found');
    return ret;
  }

  async findAllReturns(params: {
    page?: number; limit?: number; supplierId?: string; purchaseId?: string;
    from?: string; to?: string;
  }) {
    const { skip, take } = getPaginationParams(params);
    const where: any = { isVoided: false };
    if (params.supplierId) where.supplierId = params.supplierId;
    if (params.purchaseId) where.purchaseId = params.purchaseId;
    if (params.from || params.to) {
      where.returnDate = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    const [returns, total] = await this.prisma.$transaction([
      this.prisma.purchaseReturn.findMany({
        where,
        skip,
        take,
        include: {
          supplier: { select: { id: true, name: true } },
          purchase: { select: { invoiceNumber: true } },
          _count: { select: { items: true } },
        },
        orderBy: { returnDate: 'desc' },
      }),
      this.prisma.purchaseReturn.count({ where }),
    ]);

    return buildPaginatedResult(returns, total, params.page || 1, take);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  async getReportBySupplier(params: { from?: string; to?: string }) {
    const where: any = { isVoided: false, status: { in: ['RECEIVED', 'PARTIAL'] } };
    if (params.from || params.to) {
      where.purchaseDate = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    const purchases = await this.prisma.purchase.findMany({
      where,
      select: {
        supplierId: true,
        supplier: { select: { name: true, nameBn: true, phone: true } },
        totalAmount: true,
        paidAmount: true,
        dueAmount: true,
        discountAmount: true,
        taxAmount: true,
      },
    });

    const supplierMap = new Map<string, any>();
    for (const p of purchases) {
      if (!supplierMap.has(p.supplierId)) {
        supplierMap.set(p.supplierId, {
          supplierId: p.supplierId,
          supplierName: p.supplier.name,
          supplierNameBn: p.supplier.nameBn,
          phone: p.supplier.phone,
          totalPurchases: new Decimal(0),
          totalPaid: new Decimal(0),
          totalDue: new Decimal(0),
          count: 0,
        });
      }
      const row = supplierMap.get(p.supplierId);
      row.totalPurchases = row.totalPurchases.plus(toDecimal(p.totalAmount));
      row.totalPaid = row.totalPaid.plus(toDecimal(p.paidAmount));
      row.totalDue = row.totalDue.plus(toDecimal(p.dueAmount));
      row.count++;
    }

    return Array.from(supplierMap.values()).map((r) => ({
      ...r,
      totalPurchases: r.totalPurchases.toFixed(2),
      totalPaid: r.totalPaid.toFixed(2),
      totalDue: r.totalDue.toFixed(2),
    }));
  }

  async getReportByDate(params: { from?: string; to?: string; groupBy?: 'day' | 'month' }) {
    const where: any = { isVoided: false, status: { in: ['RECEIVED', 'PARTIAL'] } };
    if (params.from || params.to) {
      where.purchaseDate = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    const purchases = await this.prisma.purchase.findMany({
      where,
      select: {
        purchaseDate: true,
        totalAmount: true,
        paidAmount: true,
        dueAmount: true,
        taxAmount: true,
        discountAmount: true,
      },
      orderBy: { purchaseDate: 'asc' },
    });

    const dateMap = new Map<string, any>();
    for (const p of purchases) {
      const d = new Date(p.purchaseDate);
      const key =
        params.groupBy === 'month'
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          : d.toISOString().split('T')[0];

      if (!dateMap.has(key)) {
        dateMap.set(key, {
          date: key,
          totalPurchases: new Decimal(0),
          totalPaid: new Decimal(0),
          totalDue: new Decimal(0),
          count: 0,
        });
      }
      const row = dateMap.get(key);
      row.totalPurchases = row.totalPurchases.plus(toDecimal(p.totalAmount));
      row.totalPaid = row.totalPaid.plus(toDecimal(p.paidAmount));
      row.totalDue = row.totalDue.plus(toDecimal(p.dueAmount));
      row.count++;
    }

    return Array.from(dateMap.values()).map((r) => ({
      ...r,
      totalPurchases: r.totalPurchases.toFixed(2),
      totalPaid: r.totalPaid.toFixed(2),
      totalDue: r.totalDue.toFixed(2),
    }));
  }

  async getReportByProduct(params: { from?: string; to?: string; supplierId?: string }) {
    const where: any = {
      purchase: {
        isVoided: false,
        status: { in: ['RECEIVED', 'PARTIAL'] },
        ...(params.from || params.to
          ? {
              purchaseDate: {
                ...(params.from ? { gte: new Date(params.from) } : {}),
                ...(params.to ? { lte: new Date(params.to) } : {}),
              },
            }
          : {}),
        ...(params.supplierId ? { supplierId: params.supplierId } : {}),
      },
    };

    const items = await this.prisma.purchaseItem.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, nameBn: true, sku: true } },
        unit: { select: { name: true, abbreviation: true } },
      },
    });

    const productMap = new Map<string, any>();
    for (const item of items) {
      const key = item.productId;
      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: key,
          productName: item.product.name,
          productNameBn: item.product.nameBn,
          sku: item.product.sku,
          unit: item.unit?.abbreviation,
          totalQty: new Decimal(0),
          totalCost: new Decimal(0),
          avgCost: new Decimal(0),
          count: 0,
        });
      }
      const row = productMap.get(key);
      row.totalQty = row.totalQty.plus(toDecimal(item.quantity));
      row.totalCost = row.totalCost.plus(toDecimal(item.totalAmount));
      row.count++;
    }

    return Array.from(productMap.values()).map((r) => ({
      ...r,
      totalQty: r.totalQty.toFixed(4),
      totalCost: r.totalCost.toFixed(2),
      avgCost: r.totalQty.greaterThan(0)
        ? r.totalCost.dividedBy(r.totalQty).toFixed(4)
        : '0',
    }));
  }

  async getReportDue(params: { branchId?: string }) {
    const where: any = {
      isVoided: false,
      status: { in: ['RECEIVED', 'PARTIAL'] },
      paymentStatus: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      dueAmount: { gt: 0 },
    };
    if (params.branchId) where.branchId = params.branchId;

    const purchases = await this.prisma.purchase.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    return purchases.map((p) => ({
      ...p,
      isOverdue: p.dueDate ? new Date() > new Date(p.dueDate) : false,
    }));
  }

  async getStats(branchId?: string) {
    const base: any = { isVoided: false };
    if (branchId) base.branchId = branchId;

    const [total, received, due, draft, thisMonth] = await this.prisma.$transaction([
      this.prisma.purchase.count({ where: base }),
      this.prisma.purchase.count({ where: { ...base, status: 'RECEIVED' } }),
      this.prisma.purchase.count({
        where: { ...base, paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
      }),
      this.prisma.purchase.count({ where: { ...base, status: 'DRAFT' } }),
      this.prisma.purchase.aggregate({
        where: {
          ...base,
          status: { in: ['RECEIVED', 'PARTIAL'] },
          purchaseDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
        _sum: { totalAmount: true, dueAmount: true },
      }),
    ]);

    return {
      total, received, due, draft,
      thisMonthTotal: thisMonth._sum.totalAmount?.toFixed(2) ?? '0',
      thisMonthDue: thisMonth._sum.dueAmount?.toFixed(2) ?? '0',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private calculateItems(items: any[]) {
    let subtotal = new Decimal(0);
    let taxTotal = new Decimal(0);
    const itemsData: any[] = [];

    for (const item of items) {
      const qty = toDecimal(item.quantity);
      const unitCost = toDecimal(item.unitCost);
      const discountRate = toDecimal(item.discountRate ?? 0);
      const taxRate = toDecimal(item.taxRate ?? 0);

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
        notes: item.notes,
      });
    }

    return { itemsData, subtotal, taxTotal };
  }

  private buildPaymentLines(dto: CreatePurchaseDto): PurchasePaymentLineDto[] {
    if (dto.payments && dto.payments.length > 0) {
      return dto.payments;
    }
    if (dto.paidAmount && dto.paidAmount > 0 && dto.paymentMethod) {
      return [{
        method: dto.paymentMethod,
        amount: dto.paidAmount,
        referenceNo: dto.paymentReferenceNo,
      }];
    }
    return [];
  }

  private async resolveWarehouse(tx: any, branchId: string, warehouseId?: string): Promise<string> {
    if (warehouseId) return warehouseId;
    const warehouse = await tx.warehouse.findFirst({
      where: { branchId, isDefault: true },
    });
    if (!warehouse) throw new BadRequestException('No default warehouse found / ডিফল্ট গুদাম পাওয়া যায়নি');
    return warehouse.id;
  }

  private async performReceive(tx: any, purchase: any, warehouseId: string, userId: string) {
    // ── Inventory movements ───────────────────────────────────────────────
    for (const item of purchase.items) {
      await this.inventoryService.recordMovement(
        {
          productId: item.productId,
          warehouseId,
          type: StockMovementType.PURCHASE,
          quantity: item.receivedQty ?? item.quantity,
          unitCost: item.unitCost,
          purchaseId: purchase.id,
          referenceType: 'purchase',
          referenceId: purchase.id,
          notes: `Purchase ${purchase.invoiceNumber}`,
          createdBy: userId,
        },
        tx,
      );

      // Update product's cost price to latest purchase cost
      await tx.product.update({
        where: { id: item.productId },
        data: { costPrice: toDecimal(item.unitCost).toFixed(4) },
      });
    }

    // ── Inventory purchase journal (Dr Inventory / Cr AP + Cash) ─────────
    await this.recordPurchaseJournalEntry(tx, purchase, userId);
  }

  private async recordPurchaseJournalEntry(tx: any, purchase: any, userId: string) {
    const [inventoryAccount, apAccount] = await Promise.all([
      tx.account.findFirst({ where: { subType: 'INVENTORY', isSystem: true } }),
      tx.account.findFirst({ where: { subType: 'ACCOUNTS_PAYABLE', isSystem: true } }),
    ]);

    if (!inventoryAccount || !apAccount) return;

    const totalAmount = toDecimal(purchase.totalAmount);

    // Always: Dr Inventory / Cr AP (full amount)
    // Separate PAYMENT_MADE journals then reduce AP with correct cash/bank/mobile account
    const lines: any[] = [
      {
        debitAccountId: inventoryAccount.id,
        amount: totalAmount.toFixed(2),
        description: `Inventory purchase - ${purchase.invoiceNumber}`,
      },
      {
        creditAccountId: apAccount.id,
        amount: totalAmount.toFixed(2),
        description: `Accounts payable - ${purchase.invoiceNumber}`,
      },
    ];

    await this.accountingService.createJournalEntry(
      {
        entryDate: new Date(purchase.purchaseDate),
        type: 'PURCHASE',
        description: `Purchase - ${purchase.invoiceNumber}`,
        lines,
        purchaseId: purchase.id,
        createdBy: userId,
      },
      tx,
    );
  }

  private async recordPayments(
    tx: any,
    purchase: any,
    paymentLines: PurchasePaymentLineDto[],
    userId: string,
  ) {
    for (const line of paymentLines) {
      const paymentNumber = await generateSequenceNumber(this.prisma, 'supplier_payment');
      await tx.supplierPayment.create({
        data: {
          supplierId: purchase.supplierId,
          purchaseId: purchase.id,
          paymentNumber,
          paymentDate: new Date(),
          amount: toDecimal(line.amount).toFixed(2),
          method: line.method,
          referenceNo: line.referenceNo,
          bankName: line.bankName,
          notes: line.notes,
          createdBy: userId,
        },
      });
    }
  }

  /**
   * Resolve the correct ledger account for a given payment method.
   * CASH       → 1010 Cash in Hand  (falls back to 1000 Cash)
   * BANK_TRANSFER → 1020 Bank Account
   * MOBILE_BANKING + mobileProvider 'bKash'  → 1021
   * MOBILE_BANKING + mobileProvider 'Nagad'  → 1022
   * MOBILE_BANKING + mobileProvider 'Rocket' → 1023
   * MOBILE_BANKING (generic)                 → 1030 Mobile Banking
   * CARD       → 1024 Card Account
   * CHEQUE     → 1025 Cheque Account
   * CREDIT     → 2000 Accounts Payable (deferred)
   */
  private async resolvePaymentAccount(tx: any, method: string, mobileProvider?: string) {
    const tryCode = async (code: string) =>
      tx.account.findUnique({ where: { code } });

    switch (method) {
      case 'CASH':
        return (await tryCode('1010')) ?? (await tryCode('1000'));
      case 'BANK_TRANSFER':
        return (await tryCode('1020')) ?? (await tryCode('1000'));
      case 'MOBILE_BANKING': {
        const provider = (mobileProvider ?? '').toLowerCase();
        if (provider.includes('bkash') || provider.includes('বিকাশ'))
          return (await tryCode('1021')) ?? (await tryCode('1030'));
        if (provider.includes('nagad') || provider.includes('নগদ'))
          return (await tryCode('1022')) ?? (await tryCode('1030'));
        if (provider.includes('rocket') || provider.includes('রকেট'))
          return (await tryCode('1023')) ?? (await tryCode('1030'));
        return (await tryCode('1030')) ?? (await tryCode('1000'));
      }
      case 'CARD':
        return (await tryCode('1024')) ?? (await tryCode('1020'));
      case 'CHEQUE':
        return (await tryCode('1025')) ?? (await tryCode('1020'));
      default:
        return (await tryCode('1000'));
    }
  }

  private async recordPaymentJournalEntries(
    tx: any,
    purchase: any,
    paymentLines: PurchasePaymentLineDto[],
    userId: string,
  ) {
    const apAccount = await tx.account.findFirst({
      where: { subType: 'ACCOUNTS_PAYABLE', isSystem: true },
    });
    if (!apAccount) return;

    for (const line of paymentLines) {
      const amount = toDecimal(line.amount);
      if (amount.isZero()) continue;

      // Derive mobile provider from referenceNo if not explicitly set
      const provider = line.mobileProvider
        ?? (line.referenceNo?.toLowerCase().includes('bkash') ? 'bkash'
          : line.referenceNo?.toLowerCase().includes('nagad') ? 'nagad'
          : line.referenceNo?.toLowerCase().includes('rocket') ? 'rocket'
          : undefined);

      const payAccount = await this.resolvePaymentAccount(tx, line.method, provider);
      if (!payAccount) continue;

      await this.accountingService.createJournalEntry(
        {
          entryDate: new Date(),
          type: 'PAYMENT_MADE',
          description: `Supplier payment - ${purchase.invoiceNumber} via ${line.method}${provider ? ' (' + provider + ')' : ''}`,
          lines: [
            {
              debitAccountId: apAccount.id,
              amount: amount.toFixed(2),
              description: `Reduce payable - ${purchase.invoiceNumber}`,
            },
            {
              creditAccountId: payAccount.id,
              amount: amount.toFixed(2),
              description: `${payAccount.name} out - ${line.method}`,
            },
          ],
          purchaseId: purchase.id,
          createdBy: userId,
        },
        tx,
      );
    }
  }

  private async recordReturnJournalEntry(
    tx: any,
    purchaseReturn: any,
    purchase: any,
    refundMethod: string,
    userId: string,
  ) {
    const [inventoryAccount, cashAccount, apAccount] = await Promise.all([
      tx.account.findFirst({ where: { subType: 'INVENTORY', isSystem: true } }),
      tx.account.findFirst({ where: { subType: 'CASH', isSystem: true } }),
      tx.account.findFirst({ where: { subType: 'ACCOUNTS_PAYABLE', isSystem: true } }),
    ]);

    if (!inventoryAccount || !apAccount) return;

    const totalAmount = toDecimal(purchaseReturn.totalAmount);
    const lines: any[] = [];

    // Credit Inventory (reduce asset) — always
    lines.push({
      creditAccountId: inventoryAccount.id,
      amount: totalAmount.toFixed(2),
      description: `Purchase return - ${purchaseReturn.returnNumber}`,
    });

    if (refundMethod === 'CASH' && cashAccount) {
      // Dr Cash (receive cash back)
      lines.push({
        debitAccountId: cashAccount.id,
        amount: totalAmount.toFixed(2),
        description: `Cash refund received - ${purchaseReturn.returnNumber}`,
      });
    } else {
      // Dr AP (reduce what we owe)
      lines.push({
        debitAccountId: apAccount.id,
        amount: totalAmount.toFixed(2),
        description: `Reduce payable - ${purchaseReturn.returnNumber}`,
      });
    }

    await this.accountingService.createJournalEntry(
      {
        entryDate: new Date(purchaseReturn.returnDate),
        type: 'RETURN',
        description: `Purchase return - ${purchaseReturn.returnNumber}`,
        lines,
        purchaseId: purchase.id,
        purchaseReturnId: purchaseReturn.id,
        createdBy: userId,
      },
      tx,
    );
  }

  private async checkAllItemsReturned(tx: any, purchaseId: string): Promise<boolean> {
    const items = await tx.purchaseItem.findMany({ where: { purchaseId } });
    return items.every(
      (item: any) => toDecimal(item.returnedQty).greaterThanOrEqualTo(toDecimal(item.receivedQty)),
    );
  }
}
