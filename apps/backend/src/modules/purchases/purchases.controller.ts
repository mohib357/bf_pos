import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import {
  CreatePurchaseDto,
  ReceivePurchaseDto,
  AddPaymentDto,
  CreatePurchaseReturnDto,
  PurchaseQueryDto,
} from './dto/purchase.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  // ── Create ─────────────────────────────────────────────────────────────

  @Post()
  @RequirePermissions('purchases:create:purchases')
  async create(@Body() dto: CreatePurchaseDto, @CurrentUser('id') userId: string) {
    const purchase = await this.purchasesService.create(dto, userId);
    return ApiResponse.success(purchase, 'Purchase created', 'ক্রয় তৈরি হয়েছে');
  }

  // ── List ────────────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions('purchases:read:purchases')
  async findAll(@Query() query: PurchaseQueryDto) {
    const result = await this.purchasesService.findAll(query);
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  // ── Static routes before :id ────────────────────────────────────────────

  @Get('stats')
  @RequirePermissions('purchases:read:purchases')
  async getStats(@Query('branchId') branchId?: string) {
    const data = await this.purchasesService.getStats(branchId);
    return ApiResponse.success(data);
  }

  @Get('reports/by-supplier')
  @RequirePermissions('reports:read:purchase_report')
  async reportBySupplier(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.purchasesService.getReportBySupplier({ from, to });
    return ApiResponse.success(data, 'Supplier-wise purchase report', 'সরবরাহকারী অনুযায়ী ক্রয় রিপোর্ট');
  }

  @Get('reports/by-date')
  @RequirePermissions('reports:read:purchase_report')
  async reportByDate(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: 'day' | 'month',
  ) {
    const data = await this.purchasesService.getReportByDate({ from, to, groupBy });
    return ApiResponse.success(data, 'Date-wise purchase report', 'তারিখ অনুযায়ী ক্রয় রিপোর্ট');
  }

  @Get('reports/by-product')
  @RequirePermissions('reports:read:purchase_report')
  async reportByProduct(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    const data = await this.purchasesService.getReportByProduct({ from, to, supplierId });
    return ApiResponse.success(data, 'Product-wise purchase report', 'পণ্য অনুযায়ী ক্রয় রিপোর্ট');
  }

  @Get('reports/due')
  @RequirePermissions('reports:read:purchase_report')
  async reportDue(@Query('branchId') branchId?: string) {
    const data = await this.purchasesService.getReportDue({ branchId });
    return ApiResponse.success(data, 'Purchase due report', 'বাকি ক্রয় রিপোর্ট');
  }

  @Get('barcode/:barcode')
  @RequirePermissions('purchases:read:purchases')
  async lookupBarcode(@Param('barcode') barcode: string) {
    const data = await this.purchasesService.lookupBarcode(barcode);
    return ApiResponse.success(data);
  }

  // ── Returns list ─────────────────────────────────────────────────────────

  @Get('returns')
  @RequirePermissions('purchases:read:purchases')
  async findAllReturns(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('supplierId') supplierId?: string,
    @Query('purchaseId') purchaseId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.purchasesService.findAllReturns({
      page, limit, supplierId, purchaseId, from, to,
    });
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  // ── :id routes — MUST come after all static routes ──────────────────────

  @Get(':id')
  @RequirePermissions('purchases:read:purchases')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const purchase = await this.purchasesService.findOne(id);
    return ApiResponse.success(purchase);
  }

  @Post(':id/receive')
  @RequirePermissions('purchases:update:purchases')
  async receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceivePurchaseDto,
    @CurrentUser('id') userId: string,
  ) {
    const purchase = await this.purchasesService.receive(id, dto, userId);
    return ApiResponse.success(purchase, 'Purchase received — stock updated', 'পণ্য গৃহীত হয়েছে — স্টক আপডেট হয়েছে');
  }

  @Post(':id/payment')
  @RequirePermissions('purchases:update:purchases')
  async addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    const purchase = await this.purchasesService.addPayment(id, dto, userId);
    return ApiResponse.success(purchase, 'Payment recorded', 'পেমেন্ট রেকর্ড হয়েছে');
  }

  @Post(':id/return')
  @RequirePermissions('purchases:update:purchases')
  async createReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePurchaseReturnDto,
    @CurrentUser('id') userId: string,
  ) {
    // Bind purchaseId from URL if not in body
    const returnDto = { ...dto, purchaseId: dto.purchaseId || id };
    const ret = await this.purchasesService.createReturn(returnDto, userId);
    return ApiResponse.success(ret, 'Purchase return created', 'ক্রয় ফেরত তৈরি হয়েছে');
  }

  @Get(':id/returns/:returnId')
  @RequirePermissions('purchases:read:purchases')
  async findOneReturn(
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('returnId', ParseUUIDPipe) returnId: string,
  ) {
    const ret = await this.purchasesService.findOneReturn(returnId);
    return ApiResponse.success(ret);
  }
}
