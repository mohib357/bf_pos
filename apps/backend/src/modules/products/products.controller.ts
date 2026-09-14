import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  GenerateSkuDto,
  BulkStatusUpdateDto,
} from './dto/product.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ── CRUD ────────────────────────────────────────────────────────────────

  @Post()
  @RequirePermissions('products:create:products')
  async create(@Body() dto: CreateProductDto, @CurrentUser('id') userId: string) {
    const product = await this.productsService.create(dto, userId);
    return ApiResponse.success(product, 'Product created', 'পণ্য তৈরি হয়েছে');
  }

  @Get()
  @RequirePermissions('products:read:products')
  async findAll(@Query() query: ProductQueryDto) {
    const result = await this.productsService.findAll(query);
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get('stats')
  @RequirePermissions('products:read:products')
  async getStats() {
    const data = await this.productsService.getStats();
    return ApiResponse.success(data);
  }

  @Get('low-stock')
  @RequirePermissions('products:read:products')
  async getLowStock() {
    const products = await this.productsService.getLowStockProducts();
    return ApiResponse.success(products, 'Low stock products', 'কম স্টকের পণ্য');
  }

  @Get('search')
  @RequirePermissions('products:read:products')
  async search(@Query('q') q: string) {
    const data = await this.productsService.search(q || '');
    return ApiResponse.success(data);
  }

  @Get('barcode/:barcode')
  @RequirePermissions('products:read:products')
  async findByBarcode(@Param('barcode') barcode: string) {
    const product = await this.productsService.findByBarcode(barcode);
    return ApiResponse.success(product);
  }

  @Get('sku/:sku')
  @RequirePermissions('products:read:products')
  async findBySku(@Param('sku') sku: string) {
    const product = await this.productsService.findBySku(sku);
    return ApiResponse.success(product);
  }

  @Get(':id/history')
  @RequirePermissions('products:read:products')
  async getHistory(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.productsService.findOneWithHistory(id);
    return ApiResponse.success(data);
  }

  @Get(':id/price-history')
  @RequirePermissions('products:read:products')
  async getPriceHistory(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.productsService.getPriceHistory(id);
    return ApiResponse.success(data, 'Price history', 'মূল্যের ইতিহাস');
  }

  @Get(':id')
  @RequirePermissions('products:read:products')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const product = await this.productsService.findOne(id);
    return ApiResponse.success(product);
  }

  @Patch('bulk-status')
  @RequirePermissions('products:update:products')
  async bulkUpdateStatus(@Body() dto: BulkStatusUpdateDto, @CurrentUser('id') userId: string) {
    const data = await this.productsService.bulkUpdateStatus(dto, userId);
    return ApiResponse.success(data);
  }

  @Patch(':id')
  @RequirePermissions('products:update:products')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('id') userId: string,
  ) {
    const product = await this.productsService.update(id, dto, userId);
    return ApiResponse.success(product, 'Product updated', 'পণ্য আপডেট হয়েছে');
  }

  @Delete(':id')
  @RequirePermissions('products:delete:products')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    const result = await this.productsService.softDelete(id, userId);
    return ApiResponse.success(result);
  }

  // ── SKU / Barcode utilities ─────────────────────────────────────────────

  @Post('generate-sku')
  @RequirePermissions('products:create:products')
  async generateSku(@Body() dto: GenerateSkuDto) {
    const data = await this.productsService.generateSku(dto);
    return ApiResponse.success(data);
  }

  @Get('generate-barcode')
  @RequirePermissions('products:create:products')
  async generateBarcode() {
    const data = await this.productsService.generateBarcode();
    return ApiResponse.success(data);
  }

  @Get('validate-barcode/:barcode')
  @RequirePermissions('products:read:products')
  async validateBarcode(
    @Param('barcode') barcode: string,
    @Query('excludeId') excludeId?: string,
  ) {
    const data = await this.productsService.validateBarcode(barcode, excludeId);
    return ApiResponse.success(data);
  }
}
