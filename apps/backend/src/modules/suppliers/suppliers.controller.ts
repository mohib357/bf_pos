import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto, SupplierQueryDto } from './dto/supplier.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @RequirePermissions('suppliers:create:suppliers')
  async create(@Body() dto: CreateSupplierDto, @CurrentUser('id') userId: string) {
    const supplier = await this.suppliersService.create(dto, userId);
    return ApiResponse.success(supplier, 'Supplier created', 'সরবরাহকারী তৈরি হয়েছে');
  }

  @Get()
  @RequirePermissions('suppliers:read:suppliers')
  async findAll(@Query() query: SupplierQueryDto) {
    const result = await this.suppliersService.findAll(query);
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  // ── Static routes before :id ───────────────────────────────────────────

  @Get('payable')
  @RequirePermissions('suppliers:read:suppliers')
  async getPayable() {
    const data = await this.suppliersService.getPayable();
    return ApiResponse.success(data, 'Supplier payable', 'সরবরাহকারী বাকি');
  }

  // ── :id routes ─────────────────────────────────────────────────────────

  @Get(':id')
  @RequirePermissions('suppliers:read:suppliers')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const supplier = await this.suppliersService.findOne(id);
    return ApiResponse.success(supplier);
  }

  @Patch(':id')
  @RequirePermissions('suppliers:update:suppliers')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser('id') userId: string,
  ) {
    const supplier = await this.suppliersService.update(id, dto, userId);
    return ApiResponse.success(supplier, 'Supplier updated', 'সরবরাহকারী আপডেট হয়েছে');
  }

  @Delete(':id')
  @RequirePermissions('suppliers:update:suppliers')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    const result = await this.suppliersService.remove(id, userId);
    return ApiResponse.success(result);
  }

  @Get(':id/purchases')
  @RequirePermissions('suppliers:read:suppliers')
  async getPurchaseHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.suppliersService.getPurchaseHistory(id, { page, limit, from, to });
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get(':id/payments')
  @RequirePermissions('suppliers:read:suppliers')
  async getPaymentHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.suppliersService.getPaymentHistory(id, { page, limit, from, to });
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get(':id/statement')
  @RequirePermissions('suppliers:read:suppliers')
  async getStatement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.suppliersService.getStatement(id, { from, to });
    return ApiResponse.success(data, 'Supplier statement', 'সরবরাহকারী স্টেটমেন্ট');
  }
}
