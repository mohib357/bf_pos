import {
  Controller, Get, Post, Body, Param, Query,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/sale.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @RequirePermissions('sales:create:sales')
  async create(@Body() dto: CreateSaleDto, @CurrentUser('id') userId: string) {
    const sale = await this.salesService.create(dto, userId);
    return ApiResponse.success(sale, 'Sale created', 'বিক্রয় তৈরি হয়েছে');
  }

  @Get()
  @RequirePermissions('sales:read:sales')
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('branchId') branchId?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.salesService.findAll({ page, limit, search, branchId, customerId, status, from, to });
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get(':id')
  @RequirePermissions('sales:read:sales')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const sale = await this.salesService.findOne(id);
    return ApiResponse.success(sale);
  }

  @Post(':id/void')
  @RequirePermissions('sales:void:sales')
  @HttpCode(HttpStatus.OK)
  async voidSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
    @CurrentUser('id') userId: string,
  ) {
    const sale = await this.salesService.voidSale(id, body.reason, userId);
    return ApiResponse.success(sale, 'Sale voided', 'বিক্রয় বাতিল হয়েছে');
  }
}
