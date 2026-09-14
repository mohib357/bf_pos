import {
  IsString, IsOptional, IsBoolean, IsNotEmpty, IsArray,
  IsUUID, IsNumber, Min, IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddBarcodeDto {
  @IsNotEmpty()
  @IsString()
  productId: string;

  @IsNotEmpty()
  @IsString()
  barcode: string;

  @IsOptional()
  @IsEnum(['EAN13', 'EAN8', 'CODE128', 'QR', 'INTERNAL'])
  type?: string;
}

export class BarcodeLabelOptionsDto {
  @IsOptional()
  @IsBoolean()
  showBusinessName?: boolean;

  @IsOptional()
  @IsBoolean()
  showProductName?: boolean;

  @IsOptional()
  @IsBoolean()
  showPrice?: boolean;

  @IsOptional()
  @IsBoolean()
  showSku?: boolean;

  @IsOptional()
  @IsBoolean()
  showBarcode?: boolean;

  @IsOptional()
  @IsBoolean()
  showMrp?: boolean;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  copies?: number;
}

export class BulkLabelRequestDto {
  @IsArray()
  items: Array<{
    productId: string;
    copies?: number;
  }>;

  @IsOptional()
  options?: BarcodeLabelOptionsDto;
}

export class SingleLabelRequestDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  copies?: number;

  @IsOptional()
  options?: BarcodeLabelOptionsDto;
}
