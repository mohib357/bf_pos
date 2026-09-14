import {
  Controller, Get, Post, Patch, Body, Param, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from './dto/role.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('users:manage:roles')
  async findAll() {
    const roles = await this.rolesService.findAllRoles();
    return ApiResponse.success(roles, 'Roles retrieved', 'ভূমিকা পাওয়া গেছে');
  }

  @Get('permissions')
  @RequirePermissions('users:manage:roles')
  async getPermissions() {
    const grouped = await this.rolesService.getPermissionsGrouped();
    return ApiResponse.success(grouped, 'Permissions retrieved', 'অনুমতি পাওয়া গেছে');
  }

  @Get(':id')
  @RequirePermissions('users:manage:roles')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const role = await this.rolesService.findOneRole(id);
    return ApiResponse.success(role);
  }

  @Post()
  @RequirePermissions('users:manage:roles')
  async create(@Body() dto: CreateRoleDto, @CurrentUser('id') userId: string) {
    const role = await this.rolesService.createRole(dto, userId);
    return ApiResponse.success(role, 'Role created', 'ভূমিকা তৈরি হয়েছে');
  }

  @Patch(':id')
  @RequirePermissions('users:manage:roles')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser('id') userId: string,
  ) {
    const role = await this.rolesService.updateRole(id, dto, userId);
    return ApiResponse.success(role, 'Role updated', 'ভূমিকা আপডেট হয়েছে');
  }

  @Post(':id/permissions')
  @RequirePermissions('users:manage:roles')
  @HttpCode(HttpStatus.OK)
  async assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser('id') userId: string,
  ) {
    const role = await this.rolesService.assignPermissions(id, dto, userId);
    return ApiResponse.success(role, 'Permissions updated', 'অনুমতি আপডেট হয়েছে');
  }
}
