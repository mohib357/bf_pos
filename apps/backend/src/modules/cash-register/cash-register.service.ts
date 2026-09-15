import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';
import Decimal from 'decimal.js';

function d(v: any): Decimal { return new Decimal(v?.toString() ?? '0'); }

@Injectable()
export class CashRegisterService {
  private readonly logger = new Logger(CashRegisterService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // OPEN REGISTER
  // ═══════════════════════════════════════════════════════════════════════════

  async open(dto: {
    branchId: string;
    userId: string;
    name: string;
    openingBalance: number;
    notes?: string;
  }) {
    // Check if user already has an open register today
    const existing = await this.prisma.cashRegister.findFirst({
      where: {
        branchId: dto.branchId,
        userId: dto.userId,
        status: 'OPEN',
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Register already open: ${existing.name} — please close it first / ক্যাশ রেজিস্টার ইতোমধ্যে খোলা আছে`,
      );
    }

    const register = await this.prisma.cashRegister.create({
      data: {
        branchId: dto.branchId,
        userId: dto.userId,
        name: dto.name,
        openingBalance: d(dto.openingBalance).toFixed(2),
        cashSales: '0',
        cashRefunds: '0',
        cashExpenses: '0',
        cashAdjustments: '0',
        status: 'OPEN',
        notes: dto.notes,
        openedAt: new Date(),
      },
    });

    // Record opening cash movement
    await this.prisma.cashMovement.create({
      data: {
        cashRegisterId: register.id,
        type: 'IN',
        amount: d(dto.openingBalance).toFixed(2),
        description: 'Opening balance',
        referenceType: 'opening',
        createdBy: dto.userId,
      },
    });

    await this.audit.log({
      userId: dto.userId,
      action: AuditAction.CREATE,
      tableName: 'cash_registers',
      recordId: register.id,
      newValues: { name: dto.name, openingBalance: dto.openingBalance },
    });

    this.logger.log(`Cash register opened: ${register.name} by user ${dto.userId}`);
    return register;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOSE REGISTER
  // ═══════════════════════════════════════════════════════════════════════════

  async close(
    id: string,
    dto: { actualCash: number; notes?: string },
    userId: string,
  ) {
    const register = await this.prisma.cashRegister.findUnique({ where: { id } });
    if (!register) throw new NotFoundException('Cash register not found');
    if (register.status !== 'OPEN') throw new BadRequestException('Register is already closed');

    const opening = d(register.openingBalance);
    const cashSales = d(register.cashSales);
    const cashRefunds = d(register.cashRefunds);
    const cashExpenses = d(register.cashExpenses);
    const cashAdj = d(register.cashAdjustments);

    const expectedCash = opening.plus(cashSales).minus(cashRefunds).minus(cashExpenses).plus(cashAdj);
    const actualCash = d(dto.actualCash);
    const difference = actualCash.minus(expectedCash);

    const updated = await this.prisma.cashRegister.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedBy: userId,
        expectedCash: expectedCash.toFixed(2),
        actualCash: actualCash.toFixed(2),
        difference: difference.toFixed(2),
        closingBalance: actualCash.toFixed(2),
        notes: dto.notes
          ? `${register.notes ?? ''}\n[Closed] ${dto.notes}`.trim()
          : register.notes,
      },
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      tableName: 'cash_registers',
      recordId: id,
      oldValues: { status: 'OPEN' },
      newValues: { status: 'CLOSED', expectedCash: expectedCash.toFixed(2), actualCash: actualCash.toFixed(2), difference: difference.toFixed(2) },
    });

    this.logger.log(`Cash register closed: ${register.name}, difference=${difference.toFixed(2)}`);
    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET CURRENT (open register for user/branch)
  // ═══════════════════════════════════════════════════════════════════════════

  async getCurrent(branchId: string, userId: string) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { branchId, userId, status: 'OPEN' },
      include: {
        cashMovements: { orderBy: { createdAt: 'desc' }, take: 20 },
        user: { select: { id: true, username: true, firstName: true } },
      },
    });

    if (!register) return null;

    // Compute live expected
    const opening = d(register.openingBalance);
    const cashSales = d(register.cashSales);
    const cashRefunds = d(register.cashRefunds);
    const cashExpenses = d(register.cashExpenses);
    const cashAdj = d(register.cashAdjustments);
    const expectedCash = opening.plus(cashSales).minus(cashRefunds).minus(cashExpenses).plus(cashAdj);

    return {
      ...register,
      currentBalance: expectedCash.toFixed(2),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORY
  // ═══════════════════════════════════════════════════════════════════════════

  async getHistory(params: {
    branchId?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (params.branchId) where.branchId = params.branchId;
    if (params.userId) where.userId = params.userId;

    const [registers, total] = await this.prisma.$transaction([
      this.prisma.cashRegister.findMany({
        where,
        skip,
        take: limit,
        include: { user: { select: { id: true, username: true, firstName: true } } },
        orderBy: { openedAt: 'desc' },
      }),
      this.prisma.cashRegister.count({ where }),
    ]);

    return { data: registers, total, page, limit };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADD EXPENSE (cash out)
  // ═══════════════════════════════════════════════════════════════════════════

  async addExpense(
    registerId: string,
    dto: { amount: number; description: string },
    userId: string,
  ) {
    const register = await this.prisma.cashRegister.findUnique({ where: { id: registerId } });
    if (!register) throw new NotFoundException('Register not found');
    if (register.status !== 'OPEN') throw new BadRequestException('Register is closed');

    await this.prisma.cashRegister.update({
      where: { id: registerId },
      data: { cashExpenses: { increment: parseFloat(d(dto.amount).toFixed(2)) } },
    });

    return this.prisma.cashMovement.create({
      data: {
        cashRegisterId: registerId,
        type: 'OUT',
        amount: d(dto.amount).toFixed(2),
        description: dto.description,
        referenceType: 'expense',
        createdBy: userId,
      },
    });
  }
}
