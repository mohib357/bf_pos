import {
  IsString, IsOptional, IsUUID, IsNotEmpty, IsNumber, IsArray,
  ValidateNested, IsEnum, Min, IsDateString, IsBoolean, Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Purchase Item ────────────────────────────────────────────────────────────
export class PurchaseItemDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  quantity: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitCost: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  discountRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  taxRate?: number;

  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Payment line within purchase creation ────────────────────────────────────
export class PurchasePaymentLineDto {
  @IsEnum(['CASH', 'BANK_TRANSFER', 'MOBILE_BANKING', 'CARD', 'CHEQUE', 'CREDIT'])
  method: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  /** bKash | Nagad — stored as referenceNo sub-field */
  @IsOptional()
  @IsString()
  mobileProvider?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Create Draft Purchase ────────────────────────────────────────────────────
export class CreatePurchaseDto {
  @IsUUID()
  supplierId: string;

  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  shippingCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  otherCost?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchasePaymentLineDto)
  payments?: PurchasePaymentLineDto[];

  /** Legacy single-payment support */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  paidAmount?: number;

  @IsOptional()
  @IsEnum(['CASH', 'BANK_TRANSFER', 'MOBILE_BANKING', 'CARD', 'CHEQUE', 'CREDIT'])
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  paymentReferenceNo?: string;

  /** If true, immediately receive the purchase (move stock) */
  @IsOptional()
  @IsBoolean()
  receiveImmediately?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Receive a Draft Purchase ─────────────────────────────────────────────────
export class ReceivePurchaseDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchasePaymentLineDto)
  payments?: PurchasePaymentLineDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Add Payment to Existing Purchase ────────────────────────────────────────
export class AddPaymentDto {
  @IsEnum(['CASH', 'BANK_TRANSFER', 'MOBILE_BANKING', 'CARD', 'CHEQUE', 'CREDIT'])
  method: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Purchase Return ──────────────────────────────────────────────────────────
export class PurchaseReturnItemDto {
  @IsUUID()
  purchaseItemId: string;

  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  quantity: number;

  /** Must match historical unit cost from the purchase item */
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitCost: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  taxRate?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreatePurchaseReturnDto {
  @IsUUID()
  purchaseId: string;

  @IsOptional()
  @IsDateString()
  returnDate?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnItemDto)
  items: PurchaseReturnItemDto[];

  /** CASH = refund cash to us; CREDIT = reduce payable only */
  @IsOptional()
  @IsEnum(['CASH', 'CREDIT'])
  refundMethod?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Purchase Query ───────────────────────────────────────────────────────────
export class PurchaseQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  branchId?: string;
  supplierId?: string;
  status?: string;
  paymentStatus?: string;
  from?: string;
  to?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
