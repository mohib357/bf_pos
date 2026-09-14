import {
  IsString, IsOptional, IsUUID, IsBoolean, IsNumber,
  IsEnum, IsNotEmpty, Min, IsArray,
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

  @IsNotEmpty()
  @IsString()
  sku: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
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
  reorderLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderQty?: number;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'DISCONTINUED'])
  status?: string;
}

export class UpdateProductDto extends CreateProductDto {}

export class CreateCategoryDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  nameBn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class CreateUnitDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  nameBn?: string;

  @IsNotEmpty()
  @IsString()
  abbreviation: string;

  @IsOptional()
  @IsString()
  abbrevBn?: string;
}

export class CreateBrandDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  nameBn?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
