import {
  Controller, Get, Post, Body, Param, Query, Res,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { SalesService } from './sales.service';
import { ReceiptService } from './receipt.service';
import {
  CreateSaleDto,
  CreateSaleReturnDto,
  AddSalePaymentDto,
  VoidSaleDto,
  SaleQueryDto,
} from './dto/sale.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly receiptService: ReceiptService,
  ) {}

  // ── CREATE ──────────────────────────────────────────────────────────────────

  @Post()
  @RequirePermissions('sales:create:sales')
  async create(@Body() dto: CreateSaleDto, @CurrentUser('id') userId: string) {
    const sale = await this.salesService.create(dto, userId);
    return ApiResponse.success(sale, 'Sale created', 'বিক্রয় তৈরি হয়েছে');
  }

  // ── LIST ────────────────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions('sales:read:sales')
  async findAll(@Query() query: SaleQueryDto) {
    const result = await this.salesService.findAll(query);
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  // ── STATIC ROUTES — MUST come before :id ────────────────────────────────────

  @Get('stats')
  @RequirePermissions('sales:read:sales')
  async getStats(@Query('branchId') branchId?: string) {
    const data = await this.salesService.getStats(branchId);
    return ApiResponse.success(data);
  }

  @Get('barcode/:code')
  @RequirePermissions('sales:read:sales')
  async lookupBarcode(@Param('code') code: string) {
    const data = await this.salesService.lookupBarcode(code);
    return ApiResponse.success(data);
  }

  // ── REPORTS ──────────────────────────────────────────────────────────────────

  @Get('reports/daily')
  @RequirePermissions('reports:read:sales_report')
  async reportDaily(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return ApiResponse.success(await this.salesService.getReportDaily({ from, to, branchId }));
  }

  @Get('reports/by-product')
  @RequirePermissions('reports:read:sales_report')
  async reportByProduct(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return ApiResponse.success(await this.salesService.getReportByProduct({ from, to, branchId }));
  }

  @Get('reports/by-cashier')
  @RequirePermissions('reports:read:sales_report')
  async reportByCashier(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return ApiResponse.success(await this.salesService.getReportByCashier({ from, to, branchId }));
  }

  @Get('reports/by-payment-method')
  @RequirePermissions('reports:read:sales_report')
  async reportByPaymentMethod(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return ApiResponse.success(await this.salesService.getReportByPaymentMethod({ from, to, branchId }));
  }

  @Get('reports/voids')
  @RequirePermissions('reports:read:sales_report')
  async reportVoids(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return ApiResponse.success(await this.salesService.getReportVoids({ from, to, branchId }));
  }

  // ── RECEIPT — static before :id ─────────────────────────────────────────────

  @Get('receipt/:id/html')
  @RequirePermissions('sales:read:sales')
  async receiptHtml(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const html = await this.receiptService.generateHtml(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('receipt/:id/pdf')
  @RequirePermissions('sales:read:sales')
  async receiptPdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const buffer = await this.receiptService.generatePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${id}.pdf"`);
    res.send(buffer);
  }

  @Get('receipt/:id')
  @RequirePermissions('sales:read:sales')
  async receiptData(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.salesService.getReceiptData(id);
    return ApiResponse.success(data);
  }

  // ── :id routes — after all static routes ─────────────────────────────────────

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
    @Body() dto: VoidSaleDto,
    @CurrentUser('id') userId: string,
  ) {
    const sale = await this.salesService.voidSale(id, dto.reason, userId);
    return ApiResponse.success(sale, 'Sale voided', 'বিক্রয় বাতিল হয়েছে');
  }

  @Post(':id/return')
  @RequirePermissions('sales:update:sales')
  async createReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSaleReturnDto,
    @CurrentUser('id') userId: string,
  ) {
    const returnDto = { ...dto, saleId: dto.saleId || id };
    const ret = await this.salesService.createReturn(returnDto, userId);
    return ApiResponse.success(ret, 'Sales return created', 'বিক্রয় ফেরত তৈরি হয়েছে');
  }

  @Post(':id/payment')
  @RequirePermissions('sales:update:sales')
  async addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSalePaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    const sale = await this.salesService.addPayment(id, dto, userId);
    return ApiResponse.success(sale, 'Payment recorded', 'পেমেন্ট রেকর্ড হয়েছে');
  }
}
