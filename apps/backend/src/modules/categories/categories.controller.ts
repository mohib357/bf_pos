import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermissions('categories:create:categories')
  async create(@Body() dto: CreateCategoryDto, @CurrentUser('id') userId: string) {
    const data = await this.categoriesService.create(dto, userId);
    return ApiResponse.success(data, 'Category created', 'ক্যাটাগরি তৈরি হয়েছে');
  }

  @Get()
  @RequirePermissions('categories:read:categories')
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('parentId') parentId?: string,
    @Query('isActive') isActive?: string,
    @Query('flat') flat?: string,
  ) {
    const result = await this.categoriesService.findAll({
      page,
      limit,
      search,
      parentId,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      flat: flat === 'false' ? false : true,
    });

    // Tree returns an array, paginated returns PaginatedResult
    if (Array.isArray(result)) {
      return ApiResponse.success(result, 'Categories', 'ক্যাটাগরিসমূহ');
    }
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get('tree')
  @RequirePermissions('categories:read:categories')
  async getTree() {
    const data = await this.categoriesService.getTree();
    return ApiResponse.success(data, 'Category tree', 'ক্যাটাগরি ট্রি');
  }

  @Get('stats')
  @RequirePermissions('categories:read:categories')
  async getStats() {
    const data = await this.categoriesService.getStats();
    return ApiResponse.success(data);
  }

  @Get('code/:code')
  @RequirePermissions('categories:read:categories')
  async findByCode(@Param('code') code: string) {
    const data = await this.categoriesService.findByCode(code);
    return ApiResponse.success(data);
  }

  @Get(':id')
  @RequirePermissions('categories:read:categories')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.categoriesService.findOne(id);
    return ApiResponse.success(data);
  }

  @Patch(':id')
  @RequirePermissions('categories:update:categories')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.categoriesService.update(id, dto, userId);
    return ApiResponse.success(data, 'Category updated', 'ক্যাটাগরি আপডেট হয়েছে');
  }

  @Delete(':id')
  @RequirePermissions('categories:delete:categories')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    const data = await this.categoriesService.remove(id, userId);
    return ApiResponse.success(data);
  }
}
