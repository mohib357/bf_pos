import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, StockMovementType } from '@prisma/client';
import {
  CreateSaleDto,
  CreateSaleReturnDto,
  AddSalePaymentDto,
  SaleQueryDto,
} from './dto/sale.dto';
import { generateSequenceNumber } from '../../common/utils/sequence.util';
import Decimal from 'decimal.js';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';

// ─── helpers ─────────────────────────────────────────────────────────────────

function d(v: any): Decimal {
  return new Decimal(v?.toString() ?? '0');
}

/** Maps a payment method string to the correct chart-of-accounts code */
const PAYMENT_ACCOUNT_CODE: Record<string, string> = {
  CASH: '1010',
  BANK_TRANSFER: '1020',
  BKASH: '1021',
  NAGAD: '1022',
  MOBILE_BANKING: '1021', // fallback to bKash account
  CARD: '1024',
  DUE: '1100',
  CREDIT: '1100',
  CHEQUE: '1020',
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private accountingService: AccountingService,
    private audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // WEIGHTED AVERAGE COST
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Computes current weighted-average cost per unit for a product in a warehouse.
   * Formula: totalValue / totalQty from all inward movements.
   * Falls back to product.costPrice if no movements exist.
   */
  private async getWeightedAvgCost(
    tx: any,
    productId: string,
    warehouseId: string,
  ): Promise<Decimal> {
    // Sum all INWARD movements (PURCHASE, OPENING_STOCK, SALES_RETURN, ADJUSTMENT_IN)
    const inwardTypes = ['PURCHASE', 'OPENING_STOCK', 'SALES_RETURN', 'ADJUSTMENT_IN', 'TRANSFER_IN'];
    const outwardTypes = ['SALE', 'PURCHASE_RETURN', 'DAMAGE', 'LOST', 'ADJUSTMENT_OUT', 'TRANSFER_OUT'];

    // Get all movements in order
    const movements = await tx.stockMovement.findMany({
      where: { productId, warehouseId },
      orderBy: { createdAt: 'asc' },
    });

    let runningQty = new Decimal(0);
    let runningValue = new Decimal(0);

    for (const m of movements) {
      const qty = d(m.quantity);
      const cost = d(m.unitCost ?? '0');

      if (inwardTypes.includes(m.type)) {
        runningValue = runningValue.plus(qty.times(cost));
        runningQty = runningQty.plus(qty);
      } else if (outwardTypes.includes(m.type)) {
        // Use running WAC for outward
        const wac = runningQty.isZero() ? cost : runningValue.dividedBy(runningQty);
        runningValue = Decimal.max(0, runningValue.minus(qty.times(wac)));
        runningQty = Decimal.max(0, runningQty.minus(qty));
      }
    }

    if (runningQty.greaterThan(0)) {
      return runningValue.dividedBy(runningQty);
    }

    // Fallback: use product.costPrice
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { costPrice: true },
    });
    return d(product?.costPrice ?? '0');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STOCK CHECK — with row-level lock (FOR UPDATE)
  // ═══════════════════════════════════════════════════════════════════════════

  private async checkStock(
    tx: any,
    warehouseId: string,
    items: Array<{ productId: string; quantity: number | string }>,
  ): Promise<void> {
    const setting = await tx.setting.findUnique({
      where: { key: 'allow_negative_stock' },
    });
    const allowNegative = setting?.value === 'true' || setting?.value === '1';
    if (allowNegative) return;

    const errors: string[] = [];

    for (const item of items) {
      const qty = d(item.quantity);

      // Validate UUID format first — must be done BEFORE any DB query
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(item.productId)) {
        throw new BadRequestException(`Invalid product ID format: ${item.productId}`);
      }

      // ORM-based stock lookup (no raw SQL — avoids UUID casting issues)
      // Row-level locking for race conditions is handled by transaction isolation
      const stockRecord = await tx.productStock.findUnique({
        where: {
          productId_warehouseId: {
            productId: item.productId,
            warehouseId,
          },
        },
        include: {
          product: { select: { name: true, nameBn: true, sku: true } },
        },
      });

      const available = stockRecord ? d(stockRecord.quantity) : new Decimal(0);
      const label = stockRecord
        ? `${stockRecord.product.name} (${stockRecord.product.sku})`
        : `Product ID: ${item.productId}`;

      if (available.lessThan(qty)) {
        errors.push(
          `Insufficient stock for "${label}": available ${available.toFixed(2)}, requested ${qty.toFixed(2)}`,
        );
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: `Insufficient stock / অপর্যাপ্ত স্টক`,
        messageBn: 'অপর্যাপ্ত স্টক — বিক্রয় সম্পন্ন হয়নি',
        errors: errors.map((e) => ({ field: 'stock', message: e })),
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOLVE PAYMENT ACCOUNT
  // ═══════════════════════════════════════════════════════════════════════════

  private async resolvePaymentAccount(tx: any, method: string): Promise<any> {
    const code = PAYMENT_ACCOUNT_CODE[method] ?? PAYMENT_ACCOUNT_CODE['CASH'];
    const account = await tx.account.findFirst({ where: { code } });
    if (!account) {
      // Fallback: find by subType
      const subTypeMap: Record<string, string> = {
        CASH: 'CASH',
        BANK_TRANSFER: 'BANK',
        CARD: 'BANK',
        BKASH: 'BANK',
        NAGAD: 'BANK',
        MOBILE_BANKING: 'BANK',
        DUE: 'ACCOUNTS_RECEIVABLE',
        CREDIT: 'ACCOUNTS_RECEIVABLE',
      };
      return tx.account.findFirst({ where: { subType: subTypeMap[method] ?? 'CASH', isSystem: true } });
    }
    return account;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE SALE — FULLY ATOMIC
  // ═══════════════════════════════════════════════════════════════════════════

  async create(dto: CreateSaleDto, createdBy: string) {
    return this.prisma.withTransaction(async (tx) => {
      // ── 1. Resolve warehouse ──────────────────────────────────────────────
      let warehouseId = dto.warehouseId;
      if (!warehouseId) {
        const warehouse = await (tx as any).warehouse.findFirst({
          where: { branchId: dto.branchId, isDefault: true },
        });
        if (!warehouse) throw new BadRequestException('No default warehouse found for branch');
        warehouseId = warehouse.id;
      }

      // ── 2. Validate stock (with row lock) ─────────────────────────────────
      await this.checkStock(tx, warehouseId, dto.items);

      // ── 3. Calculate line items with weighted-avg cost ─────────────────────
      let subtotal = new Decimal(0);
      let taxTotal = new Decimal(0);
      const itemsData: any[] = [];

      for (const item of dto.items) {
        // Validate UUID format before querying
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(item.productId)) {
          throw new BadRequestException(`Invalid product ID format: ${item.productId}`);
        }

        const product = await (tx as any).product.findUnique({
          where: { id: item.productId },
          select: { id: true, name: true, nameBn: true, sku: true, barcode: true, taxRate: true, costPrice: true, unitId: true },
        });
        if (!product) throw new NotFoundException(`Product not found: ${item.productId}`);

        const qty = d(item.quantity);
        const unitPrice = d(item.unitPrice);
        const discountRate = d(item.discountRate ?? '0');
        const taxRate = d(item.taxRate ?? product.taxRate.toString());

        const lineAmount = qty.times(unitPrice);
        const discountAmt = item.discountAmount
          ? d(item.discountAmount)
          : lineAmount.times(discountRate.dividedBy(100));
        const afterDiscount = lineAmount.minus(discountAmt);
        const taxAmt = afterDiscount.times(taxRate.dividedBy(100));
        const totalAmount = afterDiscount.plus(taxAmt);

        // Weighted average cost
        const unitCost = await this.getWeightedAvgCost(tx, item.productId, warehouseId!);

        subtotal = subtotal.plus(lineAmount);
        taxTotal = taxTotal.plus(taxAmt);

        itemsData.push({
          productId: item.productId,
          unitId: item.unitId ?? product.unitId,
          quantity: qty.toFixed(4),
          returnedQty: '0',
          unitPrice: unitPrice.toFixed(4),
          unitCost: unitCost.toFixed(4),
          discountRate: discountRate.toFixed(2),
          discountAmount: discountAmt.toFixed(4),
          taxRate: taxRate.toFixed(2),
          taxAmount: taxAmt.toFixed(4),
          totalAmount: totalAmount.toFixed(4),
          notes: item.notes,
          // Snapshots for receipt
          _productName: product.name,
          _productNameBn: product.nameBn,
          _sku: product.sku,
          _barcode: product.barcode,
        });
      }

      // ── 4. Sale-level discount & totals ───────────────────────────────────
      const saleDiscountAmt = d(dto.discountAmount ?? '0');
      const totalBeforeDiscount = subtotal.plus(taxTotal);
      const totalAmount = totalBeforeDiscount.minus(saleDiscountAmt);

      // ── 5. Process payments ───────────────────────────────────────────────
      const payments = dto.payments ?? [];
      let paidAmount = new Decimal(0);

      // Validate payment total (if payments provided) — DUE is allowed
      if (payments.length > 0) {
        const nonDuePayments = payments.filter((p) => p.method !== 'DUE' && p.method !== 'CREDIT');
        const duePayments = payments.filter((p) => p.method === 'DUE' || p.method === 'CREDIT');
        const nonDuePaid = nonDuePayments.reduce((s, p) => s.plus(d(p.amount)), new Decimal(0));
        const duePaid = duePayments.reduce((s, p) => s.plus(d(p.amount)), new Decimal(0));
        paidAmount = nonDuePaid;

        // Total must equal sum of all payment methods (including DUE)
        // Allow cash overpay (customer gives more cash, gets change) but reject non-cash overpay
        const totalPaymentsSum = nonDuePaid.plus(duePaid);
        const isOnlyCashPayment = nonDuePayments.length > 0 && nonDuePayments.every((p) => p.method === 'CASH');
        if (!isOnlyCashPayment && totalPaymentsSum.greaterThan(totalAmount.plus(new Decimal('0.01')))) {
          throw new BadRequestException(
            `Payment total (${totalPaymentsSum.toFixed(2)}) exceeds sale total (${totalAmount.toFixed(2)})`,
          );
        }
      }

      const dueAmount = Decimal.max(0, totalAmount.minus(paidAmount));
      const changeAmount = paidAmount.greaterThan(totalAmount)
        ? paidAmount.minus(totalAmount)
        : new Decimal(0);
      const effectivePaid = paidAmount.plus(
        payments.filter((p) => p.method === 'DUE' || p.method === 'CREDIT')
          .reduce((s, p) => s.plus(d(p.amount)), new Decimal(0))
      );
      const paymentStatus =
        payments.length === 0 ? 'PENDING' :
        effectivePaid.greaterThanOrEqualTo(totalAmount) ? 'PAID' :
        effectivePaid.greaterThan(0) ? 'PARTIAL' : 'PENDING';

      // ── 6. Create sale record ─────────────────────────────────────────────
      const invoiceNumber = await generateSequenceNumber(this.prisma, 'sale');
      const isDraft = dto.isDraft === true;

      const sale = await (tx as any).sale.create({
        data: {
          branchId: dto.branchId,
          customerId: dto.customerId,
          invoiceNumber,
          saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
          status: isDraft ? 'DRAFT' : 'COMPLETED',
          paymentStatus,
          subtotal: subtotal.toFixed(2),
          discountRate: d(dto.discountRate ?? '0').toFixed(2),
          discountAmount: saleDiscountAmt.toFixed(2),
          taxAmount: taxTotal.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          paidAmount: effectivePaid.toFixed(2),
          dueAmount: dueAmount.toFixed(2),
          changeAmount: changeAmount.toFixed(2),
          cashRegisterId: dto.cashRegisterId,
          notes: dto.notes,
          createdBy,
          items: {
            create: itemsData.map(({ _productName, _productNameBn, _sku, _barcode, ...rest }) => rest),
          },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, nameBn: true, sku: true } } } },
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      if (isDraft) return sale;

      // ── 7. Inventory movements + update product_stocks ────────────────────
      for (const item of dto.items) {
        const unitCost = d(itemsData.find((i) => i.productId === item.productId)?.unitCost ?? '0');
        await this.inventoryService.recordMovement(
          {
            productId: item.productId,
            warehouseId: warehouseId!,
            type: StockMovementType.SALE,
            quantity: item.quantity,
            unitCost: unitCost.toFixed(4),
            saleId: sale.id,
            referenceType: 'sale',
            referenceId: sale.id,
            notes: `Sale ${invoiceNumber}`,
            createdBy,
          },
          tx,
        );
      }

      // ── 8. Create customer payment records ────────────────────────────────
      for (const payment of payments) {
        const paymentNumber = await generateSequenceNumber(this.prisma, 'customer_payment');
        await (tx as any).customerPayment.create({
          data: {
            customerId: dto.customerId,
            saleId: sale.id,
            paymentNumber,
            paymentDate: new Date(),
            amount: d(payment.amount).toFixed(2),
            method: payment.method,
            referenceNo: payment.referenceNo,
            notes: payment.notes,
            createdBy,
          },
        });
      }

      // ── 9. Update customer AR if due > 0 ──────────────────────────────────
      if (dto.customerId && dueAmount.greaterThan(0)) {
        await (tx as any).customer.update({
          where: { id: dto.customerId },
          data: {
            currentBalance: { increment: parseFloat(dueAmount.toFixed(2)) },
            totalPurchases: { increment: parseFloat(totalAmount.toFixed(2)) },
          },
        });
      }

      // ── 10. Cash register update ──────────────────────────────────────────
      const cashPaymentTotal = payments
        .filter((p) => p.method === 'CASH')
        .reduce((s, p) => s.plus(d(p.amount)), new Decimal(0));

      if (dto.cashRegisterId && cashPaymentTotal.greaterThan(0)) {
        await (tx as any).cashRegister.update({
          where: { id: dto.cashRegisterId },
          data: { cashSales: { increment: parseFloat(cashPaymentTotal.toFixed(2)) } },
        });
        await (tx as any).cashMovement.create({
          data: {
            cashRegisterId: dto.cashRegisterId,
            type: 'IN',
            amount: cashPaymentTotal.toFixed(2),
            description: `Sale ${invoiceNumber}`,
            referenceType: 'sale',
            referenceId: sale.id,
            createdBy,
          },
        });
      }

      // ── 11. Double-entry journal ──────────────────────────────────────────
      await this.recordSaleJournalEntry(tx, sale, payments, createdBy);

      this.logger.log(`Sale created: ${invoiceNumber} total=${totalAmount.toFixed(2)}`);

      await this.audit.log({
        userId: createdBy,
        action: AuditAction.CREATE,
        tableName: 'sales',
        recordId: sale.id,
        newValues: { invoiceNumber, totalAmount: totalAmount.toFixed(2), paymentStatus },
      });

      return sale;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOUBLE-ENTRY JOURNAL FOR SALE
  // ═══════════════════════════════════════════════════════════════════════════

  private async recordSaleJournalEntry(
    tx: any,
    sale: any,
    payments: { method: string; amount: number | string }[],
    createdBy: string,
  ) {
    const revenueAccount = await tx.account.findFirst({
      where: { subType: 'SALES_REVENUE', isSystem: true },
    });
    const cogsAccount = await tx.account.findFirst({
      where: { subType: 'COST_OF_GOODS_SOLD', isSystem: true },
    });
    const inventoryAccount = await tx.account.findFirst({
      where: { subType: 'INVENTORY', isSystem: true },
    });

    if (!revenueAccount) return;

    const totalAmount = d(sale.totalAmount);

    // Build debit lines — one per payment method
    const lines: any[] = [];
    let totalDebited = new Decimal(0);

    if (payments.length === 0) {
      // No payment info — debit cash by default
      const cashAccount = await this.resolvePaymentAccount(tx, 'CASH');
      if (cashAccount) {
        lines.push({
          debitAccountId: cashAccount.id,
          amount: totalAmount.toFixed(2),
          description: `Payment — ${sale.invoiceNumber}`,
        });
        totalDebited = totalAmount;
      }
    } else {
      for (const p of payments) {
        const acct = await this.resolvePaymentAccount(tx, p.method);
        if (acct) {
          const amt = d(p.amount);
          lines.push({
            debitAccountId: acct.id,
            amount: amt.toFixed(2),
            description: `${p.method} — ${sale.invoiceNumber}`,
          });
          totalDebited = totalDebited.plus(amt);
        }
      }
    }

    if (lines.length > 0 && totalDebited.greaterThan(0)) {
      lines.push({
        creditAccountId: revenueAccount.id,
        amount: totalDebited.toFixed(2),
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

    // COGS journal: Dr COGS / Cr Inventory
    if (cogsAccount && inventoryAccount && sale.items) {
      const totalCogs = sale.items.reduce((sum: Decimal, item: any) => {
        return sum.plus(d(item.quantity).times(d(item.unitCost)));
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

  // ═══════════════════════════════════════════════════════════════════════════
  // VOID SALE
  // ═══════════════════════════════════════════════════════════════════════════

  async voidSale(id: string, reason: string, voidedBy: string) {
    const existing = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: true,
        payments: { where: { isVoided: false } },
      },
    });
    if (!existing) throw new NotFoundException('Sale not found');
    if (existing.isVoided) throw new BadRequestException('Sale already voided / বিক্রয় ইতোমধ্যে বাতিল');

    return this.prisma.withTransaction(async (tx) => {
      // Mark sale voided
      const sale = await (tx as any).sale.update({
        where: { id },
        data: {
          isVoided: true,
          voidedAt: new Date(),
          voidedBy,
          voidReason: reason,
          status: 'CANCELLED',
        },
        include: {
          items: true,
          payments: { where: { isVoided: false } },
          journalEntries: { include: { lines: true }, where: { isVoided: false } },
        },
      });

      // Reverse inventory — restore stock
      const firstMovement = await (tx as any).stockMovement.findFirst({
        where: { saleId: id, type: 'SALE' },
        select: { warehouseId: true },
      });
      const warehouseId = firstMovement?.warehouseId;

      if (warehouseId) {
        for (const item of existing.items) {
          await this.inventoryService.recordMovement(
            {
              productId: item.productId,
              warehouseId,
              type: StockMovementType.SALES_RETURN,
              quantity: item.quantity.toString(),
              unitCost: item.unitCost.toString(),
              saleId: id,
              referenceType: 'sale_void',
              referenceId: id,
              notes: `Void: ${reason}`,
              createdBy: voidedBy,
            },
            tx,
          );
        }
      }

      // Reverse journal entries — create reversal entries (originals untouched)
      const revenueAccount = await (tx as any).account.findFirst({
        where: { subType: 'SALES_REVENUE', isSystem: true },
      });
      const cogsAccount = await (tx as any).account.findFirst({
        where: { subType: 'COST_OF_GOODS_SOLD', isSystem: true },
      });
      const inventoryAccount = await (tx as any).account.findFirst({
        where: { subType: 'INVENTORY', isSystem: true },
      });

      const totalAmount = d(existing.totalAmount);
      const payments = existing.payments;

      // Reversal: Dr Revenue / Cr each payment account
      if (revenueAccount) {
        const reversalLines: any[] = [];
        reversalLines.push({
          debitAccountId: revenueAccount.id,
          amount: totalAmount.toFixed(2),
          description: `Void reversal — ${existing.invoiceNumber}`,
        });

        if (payments.length > 0) {
          for (const p of payments) {
            const acct = await this.resolvePaymentAccount(tx, p.method);
            if (acct) {
              reversalLines.push({
                creditAccountId: acct.id,
                amount: d(p.amount).toFixed(2),
                description: `Refund ${p.method} — void ${existing.invoiceNumber}`,
              });
            }
          }
        } else {
          const cashAcct = await this.resolvePaymentAccount(tx, 'CASH');
          if (cashAcct) {
            reversalLines.push({
              creditAccountId: cashAcct.id,
              amount: totalAmount.toFixed(2),
              description: `Cash reversal — void ${existing.invoiceNumber}`,
            });
          }
        }

        await this.accountingService.createJournalEntry(
          {
            entryDate: new Date(),
            type: 'VOID',
            description: `Void reversal — Invoice ${existing.invoiceNumber}. Reason: ${reason}`,
            lines: reversalLines,
            saleId: id,
            createdBy: voidedBy,
          },
          tx,
        );
      }

      // COGS reversal: Dr Inventory / Cr COGS
      if (cogsAccount && inventoryAccount) {
        const totalCogs = existing.items.reduce((sum: Decimal, item: any) => {
          return sum.plus(d(item.quantity).times(d(item.unitCost)));
        }, new Decimal(0));

        if (totalCogs.greaterThan(0)) {
          await this.accountingService.createJournalEntry(
            {
              entryDate: new Date(),
              type: 'VOID',
              description: `COGS reversal — void ${existing.invoiceNumber}`,
              lines: [
                {
                  debitAccountId: inventoryAccount.id,
                  amount: totalCogs.toFixed(2),
                  description: 'Inventory restored',
                },
                {
                  creditAccountId: cogsAccount.id,
                  amount: totalCogs.toFixed(2),
                  description: 'COGS reversed',
                },
              ],
              saleId: id,
              createdBy: voidedBy,
            },
            tx,
          );
        }
      }

      // Reverse customer AR
      const dueAmount = d(existing.dueAmount);
      if (existing.customerId && dueAmount.greaterThan(0)) {
        await (tx as any).customer.update({
          where: { id: existing.customerId },
          data: {
            currentBalance: { decrement: parseFloat(dueAmount.toFixed(2)) },
            totalPurchases: { decrement: parseFloat(totalAmount.toFixed(2)) },
          },
        });
      }

      // Reverse cash register
      const cashPayments = payments.filter((p) => p.method === 'CASH');
      const cashTotal = cashPayments.reduce((s, p) => s.plus(d(p.amount)), new Decimal(0));
      if (existing.cashRegisterId && cashTotal.greaterThan(0)) {
        await (tx as any).cashRegister.update({
          where: { id: existing.cashRegisterId },
          data: { cashRefunds: { increment: parseFloat(cashTotal.toFixed(2)) } },
        });
        await (tx as any).cashMovement.create({
          data: {
            cashRegisterId: existing.cashRegisterId,
            type: 'OUT',
            amount: cashTotal.toFixed(2),
            description: `Void — ${existing.invoiceNumber}. Reason: ${reason}`,
            referenceType: 'sale_void',
            referenceId: id,
            createdBy: voidedBy,
          },
        });
      }

      await this.audit.log({
        userId: voidedBy,
        action: AuditAction.VOID,
        tableName: 'sales',
        recordId: id,
        oldValues: { status: existing.status },
        newValues: { status: 'CANCELLED', voidReason: reason, voidedAt: new Date() },
      });

      return sale;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SALE RETURN
  // ═══════════════════════════════════════════════════════════════════════════

  async createReturn(dto: CreateSaleReturnDto, createdBy: string) {
    return this.prisma.withTransaction(async (tx) => {
      const sale = await (tx as any).sale.findUnique({
        where: { id: dto.saleId },
        include: {
          items: { include: { product: true } },
          payments: { where: { isVoided: false } },
        },
      });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.isVoided) throw new BadRequestException('Cannot return a voided sale');
      if (sale.status === 'DRAFT') throw new BadRequestException('Cannot return a draft sale');

      // Validate return quantities
      const itemMap = new Map(sale.items.map((i: any) => [i.id, i]));
      const returnItemsData: any[] = [];
      let subtotal = new Decimal(0);
      let taxTotal = new Decimal(0);

      for (const ri of dto.items) {
        const original = itemMap.get(ri.saleItemId) as any;
        if (!original) throw new BadRequestException(`Sale item not found: ${ri.saleItemId}`);

        const alreadyReturned = d(original.returnedQty);
        const maxReturn = d(original.quantity).minus(alreadyReturned);
        const returnQty = d(ri.quantity);

        if (returnQty.greaterThan(maxReturn)) {
          throw new BadRequestException(
            `Return qty (${returnQty}) exceeds returnable qty (${maxReturn}) for ${original.product.name}`,
          );
        }

        const unitPrice = d(original.unitPrice);
        const discountRate = d(original.discountRate);
        const taxRate = d(original.taxRate);
        const lineAmount = returnQty.times(unitPrice);
        const discountAmt = lineAmount.times(discountRate.dividedBy(100));
        const afterDiscount = lineAmount.minus(discountAmt);
        const taxAmt = afterDiscount.times(taxRate.dividedBy(100));
        const totalAmount = afterDiscount.plus(taxAmt);

        subtotal = subtotal.plus(afterDiscount);
        taxTotal = taxTotal.plus(taxAmt);

        returnItemsData.push({
          saleItemId: ri.saleItemId,
          productId: ri.productId,
          unitId: ri.unitId ?? original.unitId,
          quantity: returnQty.toFixed(4),
          unitPrice: unitPrice.toFixed(4),
          unitCost: d(original.unitCost).toFixed(4),
          discountRate: discountRate.toFixed(2),
          discountAmount: discountAmt.toFixed(4),
          taxRate: taxRate.toFixed(2),
          taxAmount: taxAmt.toFixed(4),
          totalAmount: totalAmount.toFixed(4),
          reason: ri.reason,
        });
      }

      const totalAmount = subtotal.plus(taxTotal);
      const returnNumber = await generateSequenceNumber(this.prisma, 'sale_return');

      const saleReturn = await (tx as any).saleReturn.create({
        data: {
          saleId: dto.saleId,
          customerId: sale.customerId,
          returnNumber,
          returnDate: new Date(),
          reason: dto.reason,
          notes: dto.notes,
          subtotal: subtotal.toFixed(2),
          taxAmount: taxTotal.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          refundMethod: dto.refundMethod ?? 'CASH',
          refundAmount: totalAmount.toFixed(2),
          status: 'CONFIRMED',
          createdBy,
          items: { create: returnItemsData },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, nameBn: true } } } },
        },
      });

      // Update returnedQty on each sale item
      for (const ri of dto.items) {
        await (tx as any).saleItem.update({
          where: { id: ri.saleItemId },
          data: { returnedQty: { increment: parseFloat(d(ri.quantity).toFixed(4)) } },
        });
      }

      // Resolve warehouse
      const firstMovement = await (tx as any).stockMovement.findFirst({
        where: { saleId: dto.saleId, type: 'SALE' },
        select: { warehouseId: true },
      });
      const warehouseId = firstMovement?.warehouseId;

      // Increase stock
      if (warehouseId) {
        for (const ri of returnItemsData) {
          await this.inventoryService.recordMovement(
            {
              productId: ri.productId,
              warehouseId,
              type: StockMovementType.SALES_RETURN,
              quantity: ri.quantity,
              unitCost: ri.unitCost,
              saleId: dto.saleId,
              referenceType: 'sale_return',
              referenceId: saleReturn.id,
              notes: `Return ${returnNumber}`,
              createdBy,
            },
            tx,
          );
        }
      }

      // Journal: Dr Revenue / Cr Refund-account; Dr Inventory / Cr COGS
      const revenueAccount = await (tx as any).account.findFirst({
        where: { subType: 'SALES_REVENUE', isSystem: true },
      });
      const refundAccount = await this.resolvePaymentAccount(tx, dto.refundMethod ?? 'CASH');
      const cogsAccount = await (tx as any).account.findFirst({
        where: { subType: 'COST_OF_GOODS_SOLD', isSystem: true },
      });
      const inventoryAccount = await (tx as any).account.findFirst({
        where: { subType: 'INVENTORY', isSystem: true },
      });

      if (revenueAccount && refundAccount) {
        await this.accountingService.createJournalEntry(
          {
            entryDate: new Date(),
            type: 'RETURN',
            description: `Sales return — ${returnNumber} (Invoice ${sale.invoiceNumber})`,
            lines: [
              {
                debitAccountId: revenueAccount.id,
                amount: totalAmount.toFixed(2),
                description: `Returned amount — ${returnNumber}`,
              },
              {
                creditAccountId: refundAccount.id,
                amount: totalAmount.toFixed(2),
                description: `Refund via ${dto.refundMethod ?? 'CASH'} — ${returnNumber}`,
              },
            ],
            saleId: dto.saleId,
            createdBy,
          },
          tx,
        );
      }

      if (cogsAccount && inventoryAccount) {
        const totalCogs = returnItemsData.reduce((sum: Decimal, ri: any) => {
          return sum.plus(d(ri.quantity).times(d(ri.unitCost)));
        }, new Decimal(0));

        if (totalCogs.greaterThan(0)) {
          await this.accountingService.createJournalEntry(
            {
              entryDate: new Date(),
              type: 'RETURN',
              description: `Inventory restore — return ${returnNumber}`,
              lines: [
                {
                  debitAccountId: inventoryAccount.id,
                  amount: totalCogs.toFixed(2),
                  description: 'Inventory restored on return',
                },
                {
                  creditAccountId: cogsAccount.id,
                  amount: totalCogs.toFixed(2),
                  description: 'COGS reversed on return',
                },
              ],
              saleId: dto.saleId,
              createdBy,
            },
            tx,
          );
        }
      }

      // Adjust customer AR if it was a credit sale
      if (sale.customerId) {
        const dueAmount = d(sale.dueAmount);
        if (dueAmount.greaterThan(0)) {
          const adjustAmt = Decimal.min(totalAmount, dueAmount);
          await (tx as any).customer.update({
            where: { id: sale.customerId },
            data: {
              currentBalance: { decrement: parseFloat(adjustAmt.toFixed(2)) },
            },
          });
        }
      }

      // Cash register: if refunded in cash
      if (sale.cashRegisterId && (dto.refundMethod === 'CASH' || !dto.refundMethod)) {
        await (tx as any).cashRegister.update({
          where: { id: sale.cashRegisterId },
          data: { cashRefunds: { increment: parseFloat(totalAmount.toFixed(2)) } },
        });
      }

      // Check if fully returned → update sale status
      const updatedItems = await (tx as any).saleItem.findMany({
        where: { saleId: dto.saleId },
        select: { quantity: true, returnedQty: true },
      });
      const allReturned = updatedItems.every((i: any) =>
        d(i.returnedQty).greaterThanOrEqualTo(d(i.quantity))
      );
      if (allReturned) {
        await (tx as any).sale.update({
          where: { id: dto.saleId },
          data: { status: 'RETURNED' },
        });
      }

      await this.audit.log({
        userId: createdBy,
        action: AuditAction.CREATE,
        tableName: 'sale_returns',
        recordId: saleReturn.id,
        newValues: { returnNumber, saleId: dto.saleId, totalAmount: totalAmount.toFixed(2) },
      });

      return saleReturn;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADD PAYMENT TO DUE SALE
  // ═══════════════════════════════════════════════════════════════════════════

  async addPayment(id: string, dto: AddSalePaymentDto, userId: string) {
    return this.prisma.withTransaction(async (tx) => {
      const sale = await (tx as any).sale.findUnique({ where: { id } });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.isVoided) throw new BadRequestException('Sale is voided');

      const payAmount = d(dto.amount);
      const currentDue = d(sale.dueAmount);
      if (payAmount.greaterThan(currentDue.plus(new Decimal('0.01')))) {
        throw new BadRequestException(
          `Payment (${payAmount}) exceeds due amount (${currentDue})`,
        );
      }

      const paymentNumber = await generateSequenceNumber(this.prisma, 'customer_payment');
      await (tx as any).customerPayment.create({
        data: {
          customerId: sale.customerId,
          saleId: id,
          paymentNumber,
          paymentDate: new Date(),
          amount: payAmount.toFixed(2),
          method: dto.method,
          referenceNo: dto.referenceNo,
          notes: dto.notes,
          createdBy: userId,
        },
      });

      const newPaid = d(sale.paidAmount).plus(payAmount);
      const newDue = Decimal.max(0, d(sale.totalAmount).minus(newPaid));
      const paymentStatus =
        newDue.isZero() ? 'PAID' : newPaid.greaterThan(0) ? 'PARTIAL' : 'PENDING';

      await (tx as any).sale.update({
        where: { id },
        data: {
          paidAmount: newPaid.toFixed(2),
          dueAmount: newDue.toFixed(2),
          paymentStatus,
        },
      });

      // Reduce customer AR
      if (sale.customerId) {
        await (tx as any).customer.update({
          where: { id: sale.customerId },
          data: { currentBalance: { decrement: parseFloat(payAmount.toFixed(2)) } },
        });
      }

      // Journal: Dr payment account / Cr AR
      const payAccount = await this.resolvePaymentAccount(tx, dto.method);
      const arAccount = await (tx as any).account.findFirst({
        where: { subType: 'ACCOUNTS_RECEIVABLE', isSystem: true },
      });
      if (payAccount && arAccount) {
        await this.accountingService.createJournalEntry(
          {
            entryDate: new Date(),
            type: 'PAYMENT_RECEIVED',
            description: `Payment received — Sale ${sale.invoiceNumber}`,
            lines: [
              { debitAccountId: payAccount.id, amount: payAmount.toFixed(2), description: `Payment ${dto.method}` },
              { creditAccountId: arAccount.id, amount: payAmount.toFixed(2), description: 'AR settled' },
            ],
            saleId: id,
            createdBy: userId,
          },
          tx,
        );
      }

      return this.findOne(id);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BARCODE LOOKUP (fast — for POS)
  // ═══════════════════════════════════════════════════════════════════════════

  async lookupBarcode(barcode: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ barcode }, { barcodes: { some: { barcode } } }],
        deletedAt: null,
        status: 'ACTIVE',
      },
      include: {
        category: { select: { id: true, name: true, nameBn: true } },
        brand: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, abbreviation: true, abbrevBn: true } },
        productStocks: { select: { quantity: true, warehouse: { select: { id: true, name: true } } } },
      },
    });

    if (!product) return { found: false, barcode };

    const totalStock = product.productStocks.reduce(
      (sum, s) => sum.plus(d(s.quantity)),
      new Decimal(0),
    );

    return {
      found: true,
      product: {
        id: product.id,
        name: product.name,
        nameBn: product.nameBn,
        sku: product.sku,
        barcode: product.barcode,
        sellingPrice: product.sellingPrice,
        costPrice: product.costPrice,
        taxRate: product.taxRate,
        discountRate: product.discountRate,
        totalStock: totalStock.toNumber(),
        category: product.category,
        brand: product.brand,
        unit: product.unit,
        productStocks: product.productStocks,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS — today's totals
  // ═══════════════════════════════════════════════════════════════════════════

  async getStats(branchId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const where: any = { isVoided: false };
    if (branchId) where.branchId = branchId;

    const todayWhere: any = {
      ...where,
      saleDate: { gte: today, lt: tomorrow },
    };

    const [
      totalCount, todaySales, completedSales, draftSales,
    ] = await this.prisma.$transaction([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where: todayWhere,
        select: { totalAmount: true, paidAmount: true, dueAmount: true, payments: { select: { method: true, amount: true } } },
      }),
      this.prisma.sale.count({ where: { ...where, status: 'COMPLETED' } }),
      this.prisma.sale.count({ where: { ...where, status: 'DRAFT' } }),
    ]);

    let todayTotal = new Decimal(0);
    let todayPaid = new Decimal(0);
    let todayDue = new Decimal(0);
    let cashTotal = new Decimal(0);
    let cardTotal = new Decimal(0);
    let bkashTotal = new Decimal(0);
    let nagadTotal = new Decimal(0);
    let bankTotal = new Decimal(0);

    for (const s of todaySales) {
      todayTotal = todayTotal.plus(d(s.totalAmount));
      todayPaid = todayPaid.plus(d(s.paidAmount));
      todayDue = todayDue.plus(d(s.dueAmount));
      for (const p of s.payments) {
        const amt = d(p.amount);
        if (p.method === 'CASH') cashTotal = cashTotal.plus(amt);
        else if (p.method === 'CARD') cardTotal = cardTotal.plus(amt);
        else if (p.method === 'BKASH') bkashTotal = bkashTotal.plus(amt);
        else if (p.method === 'NAGAD') nagadTotal = nagadTotal.plus(amt);
        else if (p.method === 'BANK_TRANSFER') bankTotal = bankTotal.plus(amt);
      }
    }

    return {
      totalCount,
      completedSales,
      draftSales,
      todayCount: todaySales.length,
      todayTotal: todayTotal.toFixed(2),
      todayPaid: todayPaid.toFixed(2),
      todayDue: todayDue.toFixed(2),
      paymentBreakdown: {
        cash: cashTotal.toFixed(2),
        card: cardTotal.toFixed(2),
        bkash: bkashTotal.toFixed(2),
        nagad: nagadTotal.toFixed(2),
        bank: bankTotal.toFixed(2),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND ALL
  // ═══════════════════════════════════════════════════════════════════════════

  async findAll(params: SaleQueryDto) {
    const { skip, take } = getPaginationParams(params as any);
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
    if (params.cashierId) where.createdBy = params.cashierId;
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.saleDate = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    const orderBy: any = params.sortBy
      ? { [params.sortBy]: params.sortOrder || 'desc' }
      : { saleDate: 'desc' };

    const [sales, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        skip,
        take,
        include: {
          customer: { select: { id: true, name: true, nameBn: true, phone: true } },
          branch: { select: { id: true, name: true } },
          creator: { select: { id: true, username: true, firstName: true } },
          payments: { where: { isVoided: false }, select: { method: true, amount: true } },
          _count: { select: { items: true } },
        },
        orderBy,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return buildPaginatedResult(sales, total, params.page || 1, take);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND ONE
  // ═══════════════════════════════════════════════════════════════════════════

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, nameBn: true, sku: true, barcode: true } },
            unit: { select: { id: true, name: true, abbreviation: true } },
          },
        },
        customer: true,
        branch: true,
        payments: {
          where: { isVoided: false },
          orderBy: { paymentDate: 'asc' },
        },
        creator: { select: { id: true, username: true, firstName: true, lastName: true } },
        saleReturns: {
          where: { isVoided: false },
          include: {
            items: { include: { product: { select: { id: true, name: true, nameBn: true } } } },
          },
        },
        journalEntries: {
          where: { isVoided: false },
          include: { lines: { include: { debitAccount: true, creditAccount: true } } },
          orderBy: { entryDate: 'desc' },
        },
      },
    });
    if (!sale) throw new NotFoundException('Sale not found / বিক্রয় পাওয়া যায়নি');
    return sale;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECEIPT DATA
  // ═══════════════════════════════════════════════════════════════════════════

  async getReceiptData(id: string) {
    const sale = await this.findOne(id);

    // Get business settings
    const settings = await this.prisma.setting.findMany({
      where: { key: { in: ['business_name', 'business_name_bn', 'business_address', 'business_phone', 'receipt_footer', 'business_logo'] } },
    });
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    return { sale, settings: settingsMap };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  async getReportDaily(params: { from?: string; to?: string; branchId?: string }) {
    const where: any = { isVoided: false, status: { in: ['COMPLETED', 'RETURNED', 'PARTIAL'] } };
    if (params.branchId) where.branchId = params.branchId;
    if (params.from || params.to) {
      where.saleDate = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    const sales = await this.prisma.sale.findMany({
      where,
      select: { saleDate: true, totalAmount: true, paidAmount: true, dueAmount: true, discountAmount: true },
      orderBy: { saleDate: 'asc' },
    });

    const dateMap = new Map<string, any>();
    for (const s of sales) {
      const key = new Date(s.saleDate).toISOString().split('T')[0];
      if (!dateMap.has(key)) {
        dateMap.set(key, { date: key, totalSales: new Decimal(0), totalPaid: new Decimal(0), totalDue: new Decimal(0), totalDiscount: new Decimal(0), count: 0 });
      }
      const row = dateMap.get(key);
      row.totalSales = row.totalSales.plus(d(s.totalAmount));
      row.totalPaid = row.totalPaid.plus(d(s.paidAmount));
      row.totalDue = row.totalDue.plus(d(s.dueAmount));
      row.totalDiscount = row.totalDiscount.plus(d(s.discountAmount));
      row.count++;
    }
    return Array.from(dateMap.values()).map((r) => ({
      ...r,
      totalSales: r.totalSales.toFixed(2),
      totalPaid: r.totalPaid.toFixed(2),
      totalDue: r.totalDue.toFixed(2),
      totalDiscount: r.totalDiscount.toFixed(2),
    }));
  }

  async getReportByProduct(params: { from?: string; to?: string; branchId?: string }) {
    const where: any = {
      sale: {
        isVoided: false,
        status: { in: ['COMPLETED', 'RETURNED', 'PARTIAL'] },
        ...(params.branchId ? { branchId: params.branchId } : {}),
        ...(params.from || params.to ? { saleDate: { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lte: new Date(params.to) } : {}) } } : {}),
      },
    };

    const items = await this.prisma.saleItem.findMany({
      where,
      include: { product: { select: { id: true, name: true, nameBn: true, sku: true } }, unit: { select: { abbreviation: true } } },
    });

    const productMap = new Map<string, any>();
    for (const item of items) {
      if (!productMap.has(item.productId)) {
        productMap.set(item.productId, { productId: item.productId, name: item.product.name, nameBn: item.product.nameBn, sku: item.product.sku, unit: item.unit?.abbreviation, totalQty: new Decimal(0), totalRevenue: new Decimal(0), totalCogs: new Decimal(0), count: 0 });
      }
      const row = productMap.get(item.productId);
      row.totalQty = row.totalQty.plus(d(item.quantity));
      row.totalRevenue = row.totalRevenue.plus(d(item.totalAmount));
      row.totalCogs = row.totalCogs.plus(d(item.quantity).times(d(item.unitCost)));
      row.count++;
    }
    return Array.from(productMap.values()).map((r) => ({
      ...r,
      totalQty: r.totalQty.toFixed(4),
      totalRevenue: r.totalRevenue.toFixed(2),
      totalCogs: r.totalCogs.toFixed(2),
      grossProfit: r.totalRevenue.minus(r.totalCogs).toFixed(2),
    }));
  }

  async getReportByCashier(params: { from?: string; to?: string; branchId?: string }) {
    const where: any = { isVoided: false, status: { in: ['COMPLETED', 'PARTIAL'] } };
    if (params.branchId) where.branchId = params.branchId;
    if (params.from || params.to) {
      where.saleDate = { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lte: new Date(params.to) } : {}) };
    }

    const sales = await this.prisma.sale.findMany({
      where,
      select: { createdBy: true, totalAmount: true, paidAmount: true, creator: { select: { username: true, firstName: true, lastName: true } } },
    });

    const cashierMap = new Map<string, any>();
    for (const s of sales) {
      const key = s.createdBy ?? 'unknown';
      if (!cashierMap.has(key)) {
        cashierMap.set(key, { cashierId: key, username: s.creator?.username ?? 'unknown', name: `${s.creator?.firstName ?? ''} ${s.creator?.lastName ?? ''}`.trim(), totalSales: new Decimal(0), totalPaid: new Decimal(0), count: 0 });
      }
      const row = cashierMap.get(key);
      row.totalSales = row.totalSales.plus(d(s.totalAmount));
      row.totalPaid = row.totalPaid.plus(d(s.paidAmount));
      row.count++;
    }
    return Array.from(cashierMap.values()).map((r) => ({ ...r, totalSales: r.totalSales.toFixed(2), totalPaid: r.totalPaid.toFixed(2) }));
  }

  async getReportByPaymentMethod(params: { from?: string; to?: string; branchId?: string }) {
    const where: any = {
      isVoided: false,
      sale: {
        isVoided: false,
        ...(params.branchId ? { branchId: params.branchId } : {}),
        ...(params.from || params.to ? { saleDate: { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lte: new Date(params.to) } : {}) } } : {}),
      },
    };

    const payments = await this.prisma.customerPayment.findMany({
      where,
      select: { method: true, amount: true },
    });

    const methodMap = new Map<string, Decimal>();
    for (const p of payments) {
      const existing = methodMap.get(p.method) ?? new Decimal(0);
      methodMap.set(p.method, existing.plus(d(p.amount)));
    }
    return Array.from(methodMap.entries()).map(([method, total]) => ({ method, total: total.toFixed(2) }));
  }

  async getReportVoids(params: { from?: string; to?: string; branchId?: string }) {
    const where: any = { isVoided: true };
    if (params.branchId) where.branchId = params.branchId;
    if (params.from || params.to) {
      where.voidedAt = { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lte: new Date(params.to) } : {}) };
    }
    return this.prisma.sale.findMany({
      where,
      include: { customer: { select: { id: true, name: true } }, creator: { select: { username: true } } },
      orderBy: { voidedAt: 'desc' },
    });
  }
}
