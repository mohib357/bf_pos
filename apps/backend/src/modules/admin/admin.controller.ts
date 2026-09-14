import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import {
  CreateBranchDto, UpdateBranchDto,
  CreateWarehouseDto, UpdateWarehouseDto,
  UpdateSettingDto, BulkUpdateSettingsDto,
  UpdateNumberingDto,
} from './dto/admin.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Dashboard Stats ───────────────────────────────────────────────

  @Get('dashboard')
  @RequirePermissions('reports:read:sales_report')
  async getDashboard() {
    const stats = await this.adminService.getDashboardStats();
    return ApiResponse.success(stats);
  }

  // ─── Branches ─────────────────────────────────────────────────────

  @Get('branches')
  @RequirePermissions('branches:read:branches')
  async findBranches() {
    const data = await this.adminService.findAllBranches();
    return ApiResponse.success(data);
  }

  @Get('branches/:id')
  @RequirePermissions('branches:read:branches')
  async findOneBranch(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.adminService.findOneBranch(id);
    return ApiResponse.success(data);
  }

  @Post('branches')
  @RequirePermissions('branches:create:branches')
  async createBranch(@Body() dto: CreateBranchDto, @CurrentUser('id') userId: string) {
    const data = await this.adminService.createBranch(dto, userId);
    return ApiResponse.success(data, 'Branch created', 'শাখা তৈরি হয়েছে');
  }

  @Patch('branches/:id')
  @RequirePermissions('branches:update:branches')
  async updateBranch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.adminService.updateBranch(id, dto, userId);
    return ApiResponse.success(data, 'Branch updated', 'শাখা আপডেট হয়েছে');
  }

  // ─── Warehouses ───────────────────────────────────────────────────

  @Get('warehouses')
  @RequirePermissions('branches:read:branches')
  async findWarehouses(@Query('branchId') branchId?: string) {
    const data = await this.adminService.findAllWarehouses(branchId);
    return ApiResponse.success(data);
  }

  @Post('warehouses')
  @RequirePermissions('branches:create:branches')
  async createWarehouse(@Body() dto: CreateWarehouseDto, @CurrentUser('id') userId: string) {
    const data = await this.adminService.createWarehouse(dto, userId);
    return ApiResponse.success(data, 'Warehouse created', 'গুদাম তৈরি হয়েছে');
  }

  @Patch('warehouses/:id')
  @RequirePermissions('branches:update:branches')
  async updateWarehouse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.adminService.updateWarehouse(id, dto, userId);
    return ApiResponse.success(data, 'Warehouse updated', 'গুদাম আপডেট হয়েছে');
  }

  // ─── Settings ─────────────────────────────────────────────────────

  @Get('settings')
  @RequirePermissions('settings:read:settings')
  async findSettings(@Query('group') group?: string) {
    const data = await this.adminService.findAllSettings(group);
    return ApiResponse.success(data);
  }

  @Patch('settings/:key')
  @RequirePermissions('settings:update:settings')
  async updateSetting(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.adminService.updateSetting(key, dto, userId);
    return ApiResponse.success(data, 'Setting updated', 'সেটিং আপডেট হয়েছে');
  }

  @Patch('settings')
  @RequirePermissions('settings:update:settings')
  @HttpCode(HttpStatus.OK)
  async bulkUpdateSettings(
    @Body() dto: BulkUpdateSettingsDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.adminService.bulkUpdateSettings(dto, userId);
    return ApiResponse.success(data, 'Settings updated', 'সেটিংস আপডেট হয়েছে');
  }

  // ─── Numbering Sequences ──────────────────────────────────────────

  @Get('numbering')
  @RequirePermissions('settings:read:settings')
  async findSequences() {
    const data = await this.adminService.findAllSequences();
    return ApiResponse.success(data);
  }

  @Patch('numbering/:module')
  @RequirePermissions('settings:update:settings')
  async updateSequence(
    @Param('module') module: string,
    @Body() dto: UpdateNumberingDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.adminService.updateSequence(module, dto, userId);
    return ApiResponse.success(data, 'Sequence updated', 'নম্বরিং আপডেট হয়েছে');
  }

  // ─── Audit Logs ────────────────────────────────────────────────────

  @Get('audit-logs')
  @RequirePermissions('settings:read:settings')
  async getAuditLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('tableName') tableName?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.adminService.getAuditLogs({ page, limit, userId, action, tableName, from, to });
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get('users/:id/activity')
  @RequirePermissions('users:read:users')
  async getUserActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.adminService.getUserActivityLog(id, page, limit);
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }
}
