import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { ReceiptService } from './receipt.service';
import { InventoryModule } from '../inventory/inventory.module';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [InventoryModule, AccountingModule, AuditModule],
  controllers: [SalesController],
  providers: [SalesService, ReceiptService],
  exports: [SalesService, ReceiptService],
})
export class SalesModule {}
