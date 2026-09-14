import {
  IsString, IsOptional, IsUUID, IsBoolean, IsNumber,
  IsEnum, IsNotEmpty, Min, IsArray, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  /** Leave empty to auto-generate */
  @IsOptional()
  @IsString()
  sku?: string;

  /** Leave empty to auto-generate internal barcode */
  @IsOptional()
  @IsString()
  barcode?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  nameBn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionBn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  wholesalePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mrp?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderQty?: number;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'DISCONTINUED'])
  status?: string;

  @IsOptional()
  @IsString()
  priceChangeReason?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  nameBn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionBn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  wholesalePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mrp?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderQty?: number;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'DISCONTINUED'])
  status?: string;

  @IsOptional()
  @IsString()
  priceChangeReason?: string;
}

export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsString()
  stockStatus?: string; // 'low' | 'out' | 'in'
}

export class GenerateSkuDto {
  @IsOptional()
  @IsString()
  categoryCode?: string;

  @IsOptional()
  @IsString()
  brandCode?: string;
}

export class BarcodeSearchDto {
  @IsNotEmpty()
  @IsString()
  query: string;
}

export class BulkStatusUpdateDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];

  @IsEnum(['ACTIVE', 'INACTIVE', 'DISCONTINUED'])
  status: string;
}
