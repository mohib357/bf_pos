import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @RequirePermissions('products:create:products')
  async create(@Body() dto: CreateProductDto, @CurrentUser('id') userId: string) {
    const product = await this.productsService.create(dto, userId);
    return ApiResponse.success(product, 'Product created', 'পণ্য তৈরি হয়েছে');
  }

  @Get()
  @RequirePermissions('products:read:products')
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.productsService.findAll({ page, limit, search, categoryId, brandId, status });
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get('low-stock')
  @RequirePermissions('products:read:products')
  async getLowStock() {
    const products = await this.productsService.getLowStockProducts();
    return ApiResponse.success(products, 'Low stock products', 'কম স্টকের পণ্য');
  }

  @Get('barcode/:barcode')
  @RequirePermissions('products:read:products')
  async findByBarcode(@Param('barcode') barcode: string) {
    const product = await this.productsService.findByBarcode(barcode);
    return ApiResponse.success(product);
  }

  @Get(':id')
  @RequirePermissions('products:read:products')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const product = await this.productsService.findOne(id);
    return ApiResponse.success(product);
  }

  @Patch(':id')
  @RequirePermissions('products:update:products')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const product = await this.productsService.update(id, dto);
    return ApiResponse.success(product, 'Product updated', 'পণ্য আপডেট হয়েছে');
  }

  @Delete(':id')
  @RequirePermissions('products:delete:products')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.productsService.softDelete(id);
    return ApiResponse.success(result);
  }
}
