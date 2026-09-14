import { Module } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsNotEmpty, IsString, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// ── Named DTOs (no anonymous types → no Swagger circular-dep risk) ────────────

export class SettingItemDto {
  @ApiProperty({ example: 'business_name' })
  @IsNotEmpty()
  @IsString()
  key: string;

  @ApiProperty({ example: 'Barakah Finance' })
  @IsNotEmpty()
  @IsString()
  value: string;
}

export class BulkUpdateSettingsDto {
  @ApiProperty({ type: [SettingItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingItemDto)
  settings: SettingItemDto[];
}

export class UpdateSettingDto {
  @ApiProperty({ example: 'new_value' })
  @IsNotEmpty()
  @IsString()
  value: string;
}

@Injectable()
class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getAll(isPublic?: boolean) {
    const where: any = {};
    if (isPublic !== undefined) where.isPublic = isPublic;
    return this.prisma.setting.findMany({ where, orderBy: [{ group: 'asc' }, { key: 'asc' }] });
  }

  async get(key: string) {
    return this.prisma.setting.findUnique({ where: { key } });
  }

  async set(key: string, value: string) {
    return this.prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async setMany(settings: { key: string; value: string }[]) {
    return Promise.all(settings.map((s) => this.set(s.key, s.value)));
  }
}

@ApiExcludeController()
@Controller('settings')
class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getAll(@Query('public') isPublic?: string) {
    const settings = await this.settingsService.getAll(isPublic === 'true' ? true : undefined);
    return ApiResponse.success(settings);
  }

  @Get(':key')
  async get(@Param('key') key: string) {
    return ApiResponse.success(await this.settingsService.get(key));
  }

  @Patch(':key')
  @RequirePermissions('settings:update:settings')
  async set(@Param('key') key: string, @Body() body: UpdateSettingDto) {
    return ApiResponse.success(await this.settingsService.set(key, body.value));
  }

  @Post('bulk')
  @RequirePermissions('settings:update:settings')
  async setMany(@Body() dto: BulkUpdateSettingsDto) {
    return ApiResponse.success(await this.settingsService.setMany(dto.settings));
  }
}

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
