import {
  IsString, IsOptional, IsUUID, IsNotEmpty, IsNumber,
  IsArray, ValidateNested, IsEnum, Min, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseItemDto {
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
  unitCost: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

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
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  otherCost?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @IsOptional()
  @IsEnum(['CASH', 'BANK_TRANSFER', 'MOBILE_BANKING', 'CARD', 'CHEQUE', 'CREDIT'])
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  paymentReferenceNo?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
