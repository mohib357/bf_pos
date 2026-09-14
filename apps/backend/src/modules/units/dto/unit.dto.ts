import { IsString, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nameBn?: string;

  @IsOptional()
  @IsString()
  abbreviation?: string;

  @IsOptional()
  @IsString()
  abbrevBn?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
