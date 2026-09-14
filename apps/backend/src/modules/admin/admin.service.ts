import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';
import {
  CreateBranchDto, UpdateBranchDto,
  CreateWarehouseDto, UpdateWarehouseDto,
  UpdateSettingDto, BulkUpdateSettingsDto,
  UpdateNumberingDto,
} from './dto/admin.dto';
// sequence util imported if needed in future

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ─── Dashboard Stats ───────────────────────────────────────────────

  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const [
      todaySalesAgg,
      todayExpenseAgg,
      totalProducts,
      lowStockItems,
      outOfStockItems,
      customerDue,
      supplierPayable,
      inventoryValueAgg,
      recentSales,
      recentAuditLogs,
      openCashRegisters,
    ] = await this.prisma.$transaction([
      // Today's sales
      this.prisma.sale.aggregate({
        where: {
          saleDate: { gte: today, lte: todayEnd },
          isVoided: false,
          status: { in: ['CONFIRMED', 'COMPLETED', 'PARTIAL'] },
        },
        _sum: { totalAmount: true, dueAmount: true },
        _count: { id: true },
      }),
      // Today's expenses
      this.prisma.expense.aggregate({
        where: {
          expenseDate: { gte: today, lte: todayEnd },
          isVoided: false,
          status: { in: ['APPROVED', 'PAID'] },
        },
        _sum: { amount: true },
      }),
      // Total active products
      this.prisma.product.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      // Low stock (quantity <= reorderLevel and > 0)
      this.prisma.productStock.count({
        where: {
          quantity: { gt: 0 },
          product: {
            status: 'ACTIVE',
            deletedAt: null,
            reorderLevel: { gt: 0 },
          },
        },
      }),
      // Out of stock
      this.prisma.productStock.count({
        where: {
          quantity: { lte: 0 },
          product: { status: 'ACTIVE', deletedAt: null },
        },
      }),
      // Customer due (sum of dueAmount from unpaid sales)
      this.prisma.sale.aggregate({
        where: {
          paymentStatus: { in: ['PENDING', 'PARTIAL'] },
          isVoided: false,
        },
        _sum: { dueAmount: true },
      }),
      // Supplier payable
      this.prisma.purchase.aggregate({
        where: {
          paymentStatus: { in: ['PENDING', 'PARTIAL'] },
          isVoided: false,
        },
        _sum: { dueAmount: true },
      }),
      // Inventory value (sum of quantity * costPrice via product stock)
      this.prisma.$queryRaw<{ total: string }[]>`
        SELECT COALESCE(SUM(ps.quantity::NUMERIC * p.cost_price::NUMERIC), 0)::TEXT AS total
        FROM product_stocks ps
        JOIN products p ON ps.product_id = p.id
        WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
      `,
      // Recent 10 sales
      this.prisma.sale.findMany({
        where: { isVoided: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          customer: { select: { name: true, nameBn: true } },
          creator: { select: { username: true, firstName: true } },
        },
      }),
      // Recent audit logs
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: {
          user: { select: { username: true, firstName: true, firstNameBn: true } },
        },
      }),
      // Open cash registers
      this.prisma.cashRegister.count({ where: { status: 'OPEN' } }),
    ]);

    // 7-day sales chart
    const salesChart = await this.get7DaySalesChart();

    return {
      today: {
        sales: Number(todaySalesAgg._sum.totalAmount ?? 0),
        transactions: todaySalesAgg._count.id,
        expenses: Number(todayExpenseAgg._sum.amount ?? 0),
        grossProfit: Number(todaySalesAgg._sum.totalAmount ?? 0) - Number(todayExpenseAgg._sum.amount ?? 0),
      },
      inventory: {
        totalProducts,
        lowStockCount: lowStockItems,
        outOfStockCount: outOfStockItems,
        inventoryValue: Number((inventoryValueAgg as any[])[0]?.total ?? 0),
      },
      financial: {
        customerDue: Number(customerDue._sum.dueAmount ?? 0),
        supplierPayable: Number(supplierPayable._sum.dueAmount ?? 0),
        openCashRegisters,
      },
      recentSales: recentSales.map((s) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        customerName: s.customer?.name,
        totalAmount: Number(s.totalAmount),
        paidAmount: Number(s.paidAmount),
        dueAmount: Number(s.dueAmount),
        paymentStatus: s.paymentStatus,
        saleDate: s.saleDate,
      })),
      recentActivity: recentAuditLogs,
      salesChart,
    };
  }

  private async get7DaySalesChart() {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);

      const agg = await this.prisma.sale.aggregate({
        where: {
          saleDate: { gte: d, lte: end },
          isVoided: false,
          status: { in: ['CONFIRMED', 'COMPLETED', 'PARTIAL'] },
        },
        _sum: { totalAmount: true },
        _count: { id: true },
      });

      result.push({
        date: d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
        sales: Number(agg._sum.totalAmount ?? 0),
        transactions: agg._count.id,
      });
    }
    return result;
  }

  // ─── Branches ─────────────────────────────────────────────────────

  async findAllBranches() {
    return this.prisma.branch.findMany({
      include: {
        warehouses: { select: { id: true, name: true, isDefault: true, isActive: true } },
        _count: { select: { users: true, sales: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOneBranch(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        warehouses: true,
        _count: { select: { users: true, sales: true } },
      },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async createBranch(dto: CreateBranchDto, createdBy?: string) {
    const count = await this.prisma.branch.count();
    const code = `BR${String(count + 1).padStart(3, '0')}`;

    const branch = await this.prisma.branch.create({
      data: {
        code,
        name: dto.name,
        nameBn: dto.nameBn,
        address: dto.address,
        addressBn: dto.addressBn,
        city: dto.city,
        phone: dto.phone,
        email: dto.email,
        isMain: dto.isMain ?? false,
      },
    });

    // Create default warehouse for new branch
    const whCount = await this.prisma.warehouse.count();
    await this.prisma.warehouse.create({
      data: {
        branchId: branch.id,
        code: `WH${String(whCount + 1).padStart(3, '0')}`,
        name: `${dto.name} - Main Warehouse`,
        nameBn: dto.nameBn ? `${dto.nameBn} - প্রধান গুদাম` : undefined,
        isDefault: true,
      },
    });

    await this.audit.log({
      userId: createdBy,
      action: AuditAction.CREATE,
      tableName: 'branches',
      recordId: branch.id,
      newValues: { name: branch.name, code: branch.code },
    });

    return branch;
  }

  async updateBranch(id: string, dto: UpdateBranchDto, updatedBy?: string) {
    const branch = await this.findOneBranch(id);
    const updated = await this.prisma.branch.update({
      where: { id },
      data: {
        name: dto.name,
        nameBn: dto.nameBn,
        address: dto.address,
        addressBn: dto.addressBn,
        city: dto.city,
        phone: dto.phone,
        email: dto.email,
        status: dto.status as any,
      },
    });

    await this.audit.log({
      userId: updatedBy,
      action: AuditAction.UPDATE,
      tableName: 'branches',
      recordId: id,
      oldValues: { name: branch.name, status: branch.status },
      newValues: dto,
    });

    return updated;
  }

  // ─── Warehouses ───────────────────────────────────────────────────

  async findAllWarehouses(branchId?: string) {
    return this.prisma.warehouse.findMany({
      where: branchId ? { branchId } : {},
      include: {
        branch: { select: { id: true, name: true, nameBn: true } },
        _count: { select: { productStocks: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createWarehouse(dto: CreateWarehouseDto, createdBy?: string) {
    const count = await this.prisma.warehouse.count();
    const code = `WH${String(count + 1).padStart(3, '0')}`;

    const warehouse = await this.prisma.warehouse.create({
      data: {
        branchId: dto.branchId,
        code,
        name: dto.name,
        nameBn: dto.nameBn,
        address: dto.address,
        isDefault: dto.isDefault ?? false,
      },
    });

    await this.audit.log({
      userId: createdBy,
      action: AuditAction.CREATE,
      tableName: 'warehouses',
      recordId: warehouse.id,
      newValues: { name: warehouse.name, code },
    });

    return warehouse;
  }

  async updateWarehouse(id: string, dto: UpdateWarehouseDto, updatedBy?: string) {
    const wh = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!wh) throw new NotFoundException('Warehouse not found');

    const updated = await this.prisma.warehouse.update({
      where: { id },
      data: {
        name: dto.name,
        nameBn: dto.nameBn,
        address: dto.address,
        isActive: dto.isActive,
        isDefault: dto.isDefault,
      },
    });

    await this.audit.log({
      userId: updatedBy,
      action: AuditAction.UPDATE,
      tableName: 'warehouses',
      recordId: id,
      oldValues: { name: wh.name, isActive: wh.isActive },
      newValues: dto,
    });

    return updated;
  }

  // ─── Settings ─────────────────────────────────────────────────────

  async findAllSettings(group?: string) {
    return this.prisma.setting.findMany({
      where: group ? { group } : {},
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
  }

  async updateSetting(key: string, dto: UpdateSettingDto, updatedBy?: string) {
    const existing = await this.prisma.setting.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException(`Setting key "${key}" not found`);

    const updated = await this.prisma.setting.update({
      where: { key },
      data: { value: dto.value },
    });

    await this.audit.log({
      userId: updatedBy,
      action: AuditAction.UPDATE,
      tableName: 'settings',
      recordId: key,
      oldValues: { value: existing.value },
      newValues: { value: dto.value },
    });

    return updated;
  }

  async bulkUpdateSettings(dto: BulkUpdateSettingsDto, updatedBy?: string) {
    const results = await Promise.all(
      dto.settings.map((s) => this.updateSetting(s.key, { value: s.value }, updatedBy)),
    );
    return results;
  }

  // ─── Numbering Sequences ──────────────────────────────────────────

  async findAllSequences() {
    return this.prisma.numberingSequence.findMany({
      orderBy: { module: 'asc' },
    });
  }

  async updateSequence(module: string, dto: UpdateNumberingDto, updatedBy?: string) {
    const seq = await this.prisma.numberingSequence.findUnique({ where: { module } });
    if (!seq) throw new NotFoundException(`Sequence for module "${module}" not found`);

    const updated = await this.prisma.numberingSequence.update({
      where: { module },
      data: {
        prefix: dto.prefix,
        suffix: dto.suffix,
        separator: dto.separator,
        padding: dto.padding,
        resetPeriod: dto.resetPeriod,
      },
    });

    await this.audit.log({
      userId: updatedBy,
      action: AuditAction.UPDATE,
      tableName: 'numbering_sequences',
      recordId: module,
      oldValues: { prefix: seq.prefix, suffix: seq.suffix },
      newValues: dto,
    });

    return updated;
  }

  // ─── Audit Logs ────────────────────────────────────────────────────

  async getAuditLogs(params: {
    page?: number;
    limit?: number;
    userId?: string;
    action?: string;
    tableName?: string;
    from?: string;
    to?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, params.limit || 20);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.tableName) where.tableName = params.tableName;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from);
      if (params.to) {
        const to = new Date(params.to);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              firstNameBn: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data: logs, total, page, limit };
  }

  // ─── User activity ─────────────────────────────────────────────────

  async getUserActivityLog(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where: { userId } }),
    ]);
    return { data: logs, total, page, limit };
  }
}
