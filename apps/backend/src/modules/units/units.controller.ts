import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { UnitsService } from './units.service';
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @RequirePermissions('products:create:products')
  async create(@Body() dto: CreateUnitDto, @CurrentUser('id') userId: string) {
    const data = await this.unitsService.create(dto, userId);
    return ApiResponse.success(data, 'Unit created', 'ইউনিট তৈরি হয়েছে');
  }

  @Get()
  @RequirePermissions('products:read:products')
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    const result = await this.unitsService.findAll({
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
    const data = await this.unitsService.getAll();
    return ApiResponse.success(data);
  }

  @Get(':id')
  @RequirePermissions('products:read:products')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.unitsService.findOne(id);
    return ApiResponse.success(data);
  }

  @Patch(':id')
  @RequirePermissions('products:update:products')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.unitsService.update(id, dto, userId);
    return ApiResponse.success(data, 'Unit updated', 'ইউনিট আপডেট হয়েছে');
  }

  @Delete(':id')
  @RequirePermissions('products:delete:products')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    const data = await this.unitsService.remove(id, userId);
    return ApiResponse.success(data);
  }
}
