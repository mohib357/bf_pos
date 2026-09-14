import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JournalEntryType } from '@prisma/client';
import Decimal from 'decimal.js';
import { generateSequenceNumber } from '../../common/utils/sequence.util';

export interface JournalLineInput {
  debitAccountId?: string;
  creditAccountId?: string;
  amount: number | string;
  description?: string;
}

export interface CreateJournalEntryInput {
  entryDate: Date;
  type: JournalEntryType;
  description: string;
  lines: JournalLineInput[];
  referenceType?: string;
  referenceId?: string;
  purchaseId?: string;
  saleId?: string;
  expenseId?: string;
  incomeId?: string;
  supplierPaymentId?: string;
  customerPaymentId?: string;
  createdBy?: string;
}

@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a double-entry journal entry
   * Validates that total debits == total credits
   */
  async createJournalEntry(
    input: CreateJournalEntryInput,
    tx?: any,
  ) {
    const db = tx || this.prisma;

    const totalDebit = input.lines
      .filter((l) => l.debitAccountId)
      .reduce((sum, l) => sum.plus(new Decimal(l.amount.toString())), new Decimal(0));

    const totalCredit = input.lines
      .filter((l) => l.creditAccountId)
      .reduce((sum, l) => sum.plus(new Decimal(l.amount.toString())), new Decimal(0));

    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(
        `Journal entry is not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`,
      );
    }

    const entryNumber = await generateSequenceNumber(this.prisma, 'journal_entry');

    const entry = await db.journalEntry.create({
      data: {
        entryNumber,
        entryDate: input.entryDate,
        type: input.type,
        status: 'POSTED',
        description: input.description,
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        purchaseId: input.purchaseId,
        saleId: input.saleId,
        expenseId: input.expenseId,
        incomeId: input.incomeId,
        supplierPaymentId: input.supplierPaymentId,
        customerPaymentId: input.customerPaymentId,
        createdBy: input.createdBy,
        lines: {
          create: input.lines.map((line) => ({
            debitAccountId: line.debitAccountId,
            creditAccountId: line.creditAccountId,
            amount: new Decimal(line.amount.toString()).toFixed(2),
            description: line.description,
          })),
        },
      },
      include: { lines: true },
    });

    // Update account balances
    for (const line of input.lines) {
      const amount = new Decimal(line.amount.toString());
      if (line.debitAccountId) {
        await this.updateAccountBalance(db, line.debitAccountId, amount, 'debit');
      }
      if (line.creditAccountId) {
        await this.updateAccountBalance(db, line.creditAccountId, amount, 'credit');
      }
    }

    return entry;
  }

  private async updateAccountBalance(
    db: any,
    accountId: string,
    amount: Decimal,
    side: 'debit' | 'credit',
  ) {
    const account = await db.account.findUnique({ where: { id: accountId } });
    if (!account) return;

    // Normal balance rules:
    // ASSET, EXPENSE: debit increases, credit decreases
    // LIABILITY, EQUITY, REVENUE: credit increases, debit decreases
    const normalDebitAccounts = ['ASSET', 'EXPENSE'];
    const isNormalDebit = normalDebitAccounts.includes(account.type);

    let delta: Decimal;
    if (side === 'debit') {
      delta = isNormalDebit ? amount : amount.negated();
    } else {
      delta = isNormalDebit ? amount.negated() : amount;
    }

    const currentBalance = new Decimal(account.currentBalance.toString());
    const newBalance = currentBalance.plus(delta);

    await db.account.update({
      where: { id: accountId },
      data: { currentBalance: newBalance.toFixed(2) },
    });
  }

  async voidJournalEntry(entryId: string, reason: string, voidedBy: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true },
    });

    if (!entry) throw new BadRequestException('Journal entry not found');
    if (entry.isVoided) throw new BadRequestException('Entry already voided');

    // Reverse all account balance changes
    for (const line of entry.lines) {
      const amount = new Decimal(line.amount.toString());
      if (line.debitAccountId) {
        await this.updateAccountBalance(this.prisma, line.debitAccountId, amount, 'credit');
      }
      if (line.creditAccountId) {
        await this.updateAccountBalance(this.prisma, line.creditAccountId, amount, 'debit');
      }
    }

    return this.prisma.journalEntry.update({
      where: { id: entryId },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidedBy,
        voidReason: reason,
        status: 'VOIDED',
      },
    });
  }

  async getAccountLedger(
    accountId: string,
    params: { from?: Date; to?: Date; page?: number; limit?: number },
  ) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [{ debitAccountId: accountId }, { creditAccountId: accountId }],
      journalEntry: {
        isVoided: false,
        ...(params.from || params.to
          ? {
              entryDate: {
                ...(params.from ? { gte: params.from } : {}),
                ...(params.to ? { lte: params.to } : {}),
              },
            }
          : {}),
      },
    };

    const [lines, total] = await this.prisma.$transaction([
      this.prisma.journalLine.findMany({
        where,
        skip,
        take: limit,
        include: { journalEntry: true },
        orderBy: { journalEntry: { entryDate: 'desc' } },
      }),
      this.prisma.journalLine.count({ where }),
    ]);

    return { data: lines, total, page, limit };
  }

  async getTrialBalance(asOf?: Date) {
    return this.prisma.account.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        nameBn: true,
        type: true,
        subType: true,
        currentBalance: true,
      },
    });
  }
}
