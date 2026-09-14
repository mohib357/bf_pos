import {
  IsString, IsOptional, IsUUID, IsNotEmpty, IsNumber,
  IsArray, ValidateNested, IsEnum, Min, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  taxRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SalePaymentDto {
  @IsEnum(['CASH', 'BANK_TRANSFER', 'MOBILE_BANKING', 'CARD', 'CHEQUE', 'CREDIT'])
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
  @IsString()
  notes?: string;
}
