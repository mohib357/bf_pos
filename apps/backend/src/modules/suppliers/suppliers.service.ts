import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';
import { CreateSupplierDto, UpdateSupplierDto, SupplierQueryDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ── Code generation ───────────────────────────────────────────────────────
  private async generateCode(): Promise<string> {
    const count = await this.prisma.supplier.count({ where: { deletedAt: null } });
    let code: string;
    let attempts = 0;
    do {
      code = `SUP-${String(count + 1 + attempts).padStart(5, '0')}`;
      const exists = await this.prisma.supplier.findFirst({ where: { code } });
      if (!exists) break;
      attempts++;
    } while (attempts < 100);
    return code!;
  }

  // ── Create ────────────────────────────────────────────────────────────────
  async create(dto: CreateSupplierDto, userId?: string) {
    if (dto.email) {
      const existing = await this.prisma.supplier.findFirst({
        where: { email: dto.email, deletedAt: null },
      });
      if (existing) throw new ConflictException('Email already in use / ইমেইল ইতোমধ্যে ব্যবহৃত');
    }

    const code = await this.generateCode();
    const openingBalance = new Decimal(dto.openingDue?.toString() || '0');

    const supplier = await this.prisma.supplier.create({
      data: {
        code,
        name: dto.name,
        nameBn: dto.nameBn,
        company: dto.company,
        phone: dto.mobile,
        phone2: dto.phone2,
        email: dto.email,
        address: dto.address,
        addressBn: dto.addressBn,
        city: dto.city,
        taxNumber: dto.taxNumber,
        tradeLicense: dto.tradeLicense,
        openingBalance: openingBalance.toFixed(2),
        currentBalance: openingBalance.toFixed(2),
        creditLimit: dto.creditLimit ?? 0,
        creditDays: dto.creditDays ?? 0,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit.log({
      userId,
      action: AuditAction.CREATE,
      tableName: 'suppliers',
      recordId: supplier.id,
      newValues: { code, name: dto.name, phone: dto.mobile, email: dto.email },
    });

    return supplier;
  }

  // ── List ──────────────────────────────────────────────────────────────────
  async findAll(params: SupplierQueryDto) {
    const { skip, take } = getPaginationParams(params);
    const where: any = { deletedAt: null };

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { nameBn: { contains: params.search, mode: 'insensitive' } },
        { company: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { code: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.isActive !== undefined) {
      where.isActive = params.isActive === 'true';
    }

    const orderBy: any = params.sortBy
      ? { [params.sortBy]: params.sortOrder || 'asc' }
      : { name: 'asc' };

    const [suppliers, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({ where, skip, take, orderBy }),
      this.prisma.supplier.count({ where }),
    ]);

    return buildPaginatedResult(suppliers, total, params.page || 1, take);
  }

  // ── Single ────────────────────────────────────────────────────────────────
  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier || supplier.deletedAt) {
      throw new NotFoundException('Supplier not found / সরবরাহকারী পাওয়া যায়নি');
    }
    return supplier;
  }

  // ── Update ────────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateSupplierDto, userId?: string) {
    const existing = await this.findOne(id);

    if (dto.email && dto.email !== existing.email) {
      const conflict = await this.prisma.supplier.findFirst({
        where: { email: dto.email, deletedAt: null, id: { not: id } },
      });
      if (conflict) throw new ConflictException('Email already in use');
    }

    const data: any = {
      name: dto.name ?? existing.name,
      nameBn: dto.nameBn ?? existing.nameBn,
      company: dto.company,
      phone: dto.mobile ?? existing.phone,
      phone2: dto.phone2 ?? existing.phone2,
      email: dto.email ?? existing.email,
      address: dto.address,
      addressBn: dto.addressBn,
      city: dto.city,
      taxNumber: dto.taxNumber,
      tradeLicense: dto.tradeLicense,
      creditLimit: dto.creditLimit ?? existing.creditLimit,
      creditDays: dto.creditDays ?? existing.creditDays,
      notes: dto.notes,
      isActive: dto.isActive ?? existing.isActive,
    };

    const updated = await this.prisma.supplier.update({ where: { id }, data });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      tableName: 'suppliers',
      recordId: id,
      oldValues: { name: existing.name, phone: existing.phone },
      newValues: { name: data.name, phone: data.phone },
    });

    return updated;
  }

  // ── Soft delete ───────────────────────────────────────────────────────────
  async remove(id: string, userId?: string) {
    const existing = await this.findOne(id);

    // Block if supplier has unpaid balance
    if (new Decimal(existing.currentBalance.toString()).greaterThan(0)) {
      throw new ConflictException(
        'Cannot delete supplier with outstanding balance / বকেয়া আছে — মুছতে পারবেন না',
      );
    }

    await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.log({
      userId,
      action: AuditAction.DELETE,
      tableName: 'suppliers',
      recordId: id,
      oldValues: { name: existing.name },
    });

    return { message: 'Supplier deleted' };
  }

  // ── Purchase history ──────────────────────────────────────────────────────
  async getPurchaseHistory(
    supplierId: string,
    params: { page?: number; limit?: number; from?: string; to?: string },
  ) {
    await this.findOne(supplierId);
    const { skip, take } = getPaginationParams(params);
    const where: any = { supplierId, isVoided: false };
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
          items: { select: { id: true, quantity: true, unitCost: true, totalAmount: true } },
          _count: { select: { items: true } },
        },
        orderBy: { purchaseDate: 'desc' },
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return buildPaginatedResult(purchases, total, params.page || 1, take);
  }

  // ── Payment history ───────────────────────────────────────────────────────
  async getPaymentHistory(
    supplierId: string,
    params: { page?: number; limit?: number; from?: string; to?: string },
  ) {
    await this.findOne(supplierId);
    const { skip, take } = getPaginationParams(params);
    const where: any = { supplierId, isVoided: false };
    if (params.from || params.to) {
      where.paymentDate = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    const [payments, total] = await this.prisma.$transaction([
      this.prisma.supplierPayment.findMany({
        where,
        skip,
        take,
        include: {
          purchase: { select: { invoiceNumber: true, purchaseDate: true } },
        },
        orderBy: { paymentDate: 'desc' },
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);

    return buildPaginatedResult(payments, total, params.page || 1, take);
  }

  // ── Supplier statement ────────────────────────────────────────────────────
  async getStatement(
    supplierId: string,
    params: { from?: string; to?: string },
  ) {
    const supplier = await this.findOne(supplierId);

    const from = params.from ? new Date(params.from) : undefined;
    const to = params.to ? new Date(params.to) : undefined;

    // All purchases in date range
    const purchases = await this.prisma.purchase.findMany({
      where: {
        supplierId,
        isVoided: false,
        status: { in: ['RECEIVED', 'PARTIAL', 'ORDERED'] },
        ...(from || to
          ? { purchaseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      select: {
        id: true,
        invoiceNumber: true,
        purchaseDate: true,
        totalAmount: true,
        paidAmount: true,
        dueAmount: true,
        status: true,
        paymentStatus: true,
      },
      orderBy: { purchaseDate: 'asc' },
    });

    // All payments in date range
    const payments = await this.prisma.supplierPayment.findMany({
      where: {
        supplierId,
        isVoided: false,
        ...(from || to
          ? { paymentDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      select: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        method: true,
        referenceNo: true,
        purchaseId: true,
      },
      orderBy: { paymentDate: 'asc' },
    });

    // All returns in date range
    const returns = await this.prisma.purchaseReturn.findMany({
      where: {
        supplierId,
        isVoided: false,
        ...(from || to
          ? { returnDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      select: {
        id: true,
        returnNumber: true,
        returnDate: true,
        totalAmount: true,
        status: true,
      },
      orderBy: { returnDate: 'asc' },
    });

    const totalPurchases = purchases.reduce(
      (s, p) => s.plus(new Decimal(p.totalAmount.toString())),
      new Decimal(0),
    );
    const totalPayments = payments.reduce(
      (s, p) => s.plus(new Decimal(p.amount.toString())),
      new Decimal(0),
    );
    const totalReturns = returns.reduce(
      (s, r) => s.plus(new Decimal(r.totalAmount.toString())),
      new Decimal(0),
    );

    return {
      supplier: {
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        nameBn: supplier.nameBn,
        company: supplier.company,
        phone: supplier.phone,
        email: supplier.email,
      },
      openingBalance: supplier.openingBalance,
      totalPurchases: totalPurchases.toFixed(2),
      totalPayments: totalPayments.toFixed(2),
      totalReturns: totalReturns.toFixed(2),
      currentPayable: supplier.currentBalance,
      purchases,
      payments,
      returns,
      dateRange: { from: params.from, to: params.to },
    };
  }

  // ── Summary (payable / due) ───────────────────────────────────────────────
  async getPayable() {
    const suppliers = await this.prisma.supplier.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true, code: true, name: true, nameBn: true, phone: true,
        openingBalance: true, currentBalance: true,
      },
      orderBy: { currentBalance: 'desc' },
    });

    const total = suppliers.reduce(
      (s, sup) => s.plus(new Decimal(sup.currentBalance.toString())),
      new Decimal(0),
    );

    return {
      suppliers: suppliers.filter(
        (s) => new Decimal(s.currentBalance.toString()).greaterThan(0),
      ),
      totalPayable: total.toFixed(2),
    };
  }
}
