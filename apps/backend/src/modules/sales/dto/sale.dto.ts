import {
  IsString, IsOptional, IsUUID, IsNotEmpty, IsNumber,
  IsArray, ValidateNested, IsEnum, Min, IsDateString, IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Sale Item ────────────────────────────────────────────────────────────────

export class SaleItemDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Sale Payment ─────────────────────────────────────────────────────────────

export class SalePaymentDto {
  @IsEnum(['CASH', 'BANK_TRANSFER', 'CARD', 'BKASH', 'NAGAD', 'MOBILE_BANKING', 'DUE', 'CREDIT', 'CHEQUE'])
  method: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Create Sale ──────────────────────────────────────────────────────────────

export class CreateSaleDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  cashRegisterId?: string;

  @IsOptional()
  @IsDateString()
  saleDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments?: SalePaymentDto[];

  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Void Sale ────────────────────────────────────────────────────────────────

export class VoidSaleDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

// ─── Sale Return ──────────────────────────────────────────────────────────────

export class SaleReturnItemDto {
  @IsUUID()
  saleItemId: string;

  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateSaleReturnDto {
  @IsUUID()
  saleId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleReturnItemDto)
  items: SaleReturnItemDto[];

  @IsOptional()
  @IsEnum(['CASH', 'BANK_TRANSFER', 'CARD', 'BKASH', 'NAGAD', 'MOBILE_BANKING', 'DUE', 'CREDIT'])
  refundMethod?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Add Payment ──────────────────────────────────────────────────────────────

export class AddSalePaymentDto {
  @IsEnum(['CASH', 'BANK_TRANSFER', 'CARD', 'BKASH', 'NAGAD', 'MOBILE_BANKING', 'DUE', 'CREDIT'])
  method: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Sale Query ───────────────────────────────────────────────────────────────

export class SaleQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  search?: string;

  @IsOptional()
  branchId?: string;

  @IsOptional()
  customerId?: string;

  @IsOptional()
  cashierId?: string;

  @IsOptional()
  status?: string;

  @IsOptional()
  paymentMethod?: string;

  @IsOptional()
  from?: string;

  @IsOptional()
  to?: string;

  @IsOptional()
  sortBy?: string;

  @IsOptional()
  sortOrder?: 'asc' | 'desc';
}
