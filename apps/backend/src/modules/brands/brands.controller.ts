import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { BrandsService } from './brands.service';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Post()
  @RequirePermissions('products:create:products')
  async create(@Body() dto: CreateBrandDto, @CurrentUser('id') userId: string) {
    const data = await this.brandsService.create(dto, userId);
    return ApiResponse.success(data, 'Brand created', 'ব্র্যান্ড তৈরি হয়েছে');
  }

  @Get()
  @RequirePermissions('products:read:products')
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    const result = await this.brandsService.findAll({
      page,
      limit,
      search,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get('all')
  @RequirePermissions('products:read:products')
  async getAll() {
    const data = await this.brandsService.getAll();
    return ApiResponse.success(data);
  }

  @Get(':id')
  @RequirePermissions('products:read:products')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.brandsService.findOne(id);
    return ApiResponse.success(data);
  }

  @Patch(':id')
  @RequirePermissions('products:update:products')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrandDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.brandsService.update(id, dto, userId);
    return ApiResponse.success(data, 'Brand updated', 'ব্র্যান্ড আপডেট হয়েছে');
  }

  @Delete(':id')
  @RequirePermissions('products:delete:products')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    const data = await this.brandsService.remove(id, userId);
    return ApiResponse.success(data);
  }
}
