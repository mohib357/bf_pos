import {
  Controller, Get, Post, Body, Param, Query, ParseUUIDPipe,
} from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/purchase.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  @RequirePermissions('purchases:create:purchases')
  async create(@Body() dto: CreatePurchaseDto, @CurrentUser('id') userId: string) {
    const purchase = await this.purchasesService.create(dto, userId);
    return ApiResponse.success(purchase, 'Purchase created', 'ক্রয় তৈরি হয়েছে');
  }

  @Get()
  @RequirePermissions('purchases:read:purchases')
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('branchId') branchId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.purchasesService.findAll({ page, limit, search, branchId, supplierId, status, from, to });
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get(':id')
  @RequirePermissions('purchases:read:purchases')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const purchase = await this.purchasesService.findOne(id);
    return ApiResponse.success(purchase);
  }
}
