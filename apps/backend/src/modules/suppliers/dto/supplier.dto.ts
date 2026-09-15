import {
  IsString, IsOptional, IsEmail, IsBoolean, IsNumber,
  IsNotEmpty, Min, MaxLength, IsPhoneNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  nameBn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  mobile?: string;   // maps to phone

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone2?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  addressBn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsString()
  tradeLicense?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  openingDue?: number;   // maps to openingBalance / currentBalance

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  creditLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  creditDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSupplierDto extends CreateSupplierDto {}

export class SupplierQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: string;   // 'true' | 'false'
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
