import { Module } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { Controller, Get, Post, Patch, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';
import { CreateSupplierDto } from './suppliers.service';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller('suppliers')
class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @RequirePermissions('suppliers:create:suppliers')
  async create(@Body() dto: CreateSupplierDto) {
    const supplier = await this.suppliersService.create(dto);
    return ApiResponse.success(supplier, 'Supplier created', 'সরবরাহকারী তৈরি হয়েছে');
  }

  @Get()
  @RequirePermissions('suppliers:read:suppliers')
  async findAll(@Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string) {
    const result = await this.suppliersService.findAll({ page, limit, search });
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get(':id')
  @RequirePermissions('suppliers:read:suppliers')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.suppliersService.findOne(id));
  }

  @Patch(':id')
  @RequirePermissions('suppliers:update:suppliers')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<CreateSupplierDto>) {
    return ApiResponse.success(await this.suppliersService.update(id, dto), 'Updated', 'আপডেট হয়েছে');
  }
}

@Module({
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
