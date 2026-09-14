import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class ConfirmImportDto {
  @IsString()
  importId: string;
}

export class ImportOptionsDto {
  @IsOptional()
  @IsBoolean()
  skipDuplicates?: boolean;

  @IsOptional()
  @IsBoolean()
  updateExisting?: boolean;
}
