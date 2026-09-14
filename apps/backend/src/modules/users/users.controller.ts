import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, AssignRolesDto } from './dto/user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions('users:create:users')
  async create(@Body() dto: CreateUserDto, @CurrentUser('id') userId: string) {
    const user = await this.usersService.create(dto, userId);
    return ApiResponse.success(user, 'User created', 'ব্যবহারকারী তৈরি হয়েছে');
  }

  @Get()
  @RequirePermissions('users:read:users')
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
  ) {
    const result = await this.usersService.findAll({ page, limit, search, status, branchId });
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get(':id')
  @RequirePermissions('users:read:users')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findOne(id);
    return ApiResponse.success(user);
  }

  @Patch(':id')
  @RequirePermissions('users:update:users')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const user = await this.usersService.update(id, dto);
    return ApiResponse.success(user, 'User updated', 'ব্যবহারকারী আপডেট হয়েছে');
  }

  @Post(':id/roles')
  @RequirePermissions('users:manage:roles')
  @HttpCode(HttpStatus.OK)
  async assignRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.usersService.assignRoles(id, dto, userId);
    return ApiResponse.success(result, 'Roles assigned', 'ভূমিকা নির্ধারিত হয়েছে');
  }

  @Delete(':id')
  @RequirePermissions('users:delete:users')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.usersService.softDelete(id);
    return ApiResponse.success(result);
  }
}
