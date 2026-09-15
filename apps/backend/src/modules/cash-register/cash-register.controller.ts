import {
  Controller, Get, Post, Body, Param, Query,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { CashRegisterService } from './cash-register.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('cash-register')
export class CashRegisterController {
  constructor(private readonly cashRegisterService: CashRegisterService) {}

  @Post('open')
  @RequirePermissions('cash:open:register')
  async open(
    @Body() body: { branchId: string; name: string; openingBalance: number; notes?: string },
    @CurrentUser('id') userId: string,
  ) {
    const register = await this.cashRegisterService.open({ ...body, userId });
    return ApiResponse.success(register, 'Cash register opened', 'ক্যাশ রেজিস্টার খোলা হয়েছে');
  }

  @Post(':id/close')
  @RequirePermissions('cash:close:register')
  @HttpCode(HttpStatus.OK)
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { actualCash: number; notes?: string },
    @CurrentUser('id') userId: string,
  ) {
    const register = await this.cashRegisterService.close(id, body, userId);
    return ApiResponse.success(register, 'Cash register closed', 'ক্যাশ রেজিস্টার বন্ধ হয়েছে');
  }

  @Post(':id/expense')
  @RequirePermissions('cash:open:register')
  async addExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { amount: number; description: string },
    @CurrentUser('id') userId: string,
  ) {
    const movement = await this.cashRegisterService.addExpense(id, body, userId);
    return ApiResponse.success(movement, 'Expense recorded', 'খরচ রেকর্ড হয়েছে');
  }

  @Get('current')
  @RequirePermissions('cash:read:register')
  async getCurrent(
    @Query('branchId') branchId: string,
    @CurrentUser('id') userId: string,
  ) {
    const register = await this.cashRegisterService.getCurrent(branchId, userId);
    return ApiResponse.success(register);
  }

  @Get('history')
  @RequirePermissions('cash:read:register')
  async getHistory(
    @Query('branchId') branchId?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.cashRegisterService.getHistory({ branchId, userId, page, limit });
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get(':id')
  @RequirePermissions('cash:read:register')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const register = await this.cashRegisterService.getCurrent('', '');
    return ApiResponse.success(register);
  }
}
