import { Module } from '@nestjs/common';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getPaginationParams, buildPaginatedResult } from '../../common/utils/pagination.util';
import { Controller, Get, Post, Patch, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

export class CreateCustomerDto {
  name: string;
  nameBn?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  gender?: string;
  creditLimit?: number;
  creditDays?: number;
  openingBalance?: number;
  notes?: string;
}

@Injectable()
class CustomersService {
  constructor(private prisma: PrismaService) {}

  private async generateCode(): Promise<string> {
    const count = await this.prisma.customer.count();
    return `CUS-${String(count + 1).padStart(5, '0')}`;
  }

  async create(dto: CreateCustomerDto) {
    const code = await this.generateCode();
    return this.prisma.customer.create({
      data: { ...dto, code, gender: dto.gender as any, creditLimit: dto.creditLimit || 0, creditDays: dto.creditDays || 0, openingBalance: dto.openingBalance || 0, currentBalance: dto.openingBalance || 0 },
    });
  }

  async findAll(params: { page?: number; limit?: number; search?: string }) {
    const { skip, take } = getPaginationParams(params);
    const where: any = { deletedAt: null };
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search } },
        { code: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    const [customers, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.customer.count({ where }),
    ]);
    return buildPaginatedResult(customers, total, params.page || 1, take);
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { sales: { take: 10, orderBy: { saleDate: 'desc' } } },
    });
    if (!customer || customer.deletedAt) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(id: string, dto: Partial<CreateCustomerDto>) {
    await this.findOne(id);
    return this.prisma.customer.update({ where: { id }, data: { ...dto, gender: dto.gender as any } });
  }
}

@Controller('customers')
class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @RequirePermissions('customers:create:customers')
  async create(@Body() dto: CreateCustomerDto) {
    return ApiResponse.success(await this.customersService.create(dto), 'Customer created', 'গ্রাহক তৈরি হয়েছে');
  }

  @Post('quick')
  @RequirePermissions('customers:create:customers')
  async createQuick(@Body() dto: { name: string; phone?: string; nameBn?: string }) {
    return ApiResponse.success(
      await this.customersService.create({ name: dto.name, phone: dto.phone, nameBn: dto.nameBn }),
      'Customer created',
      'গ্রাহক তৈরি হয়েছে',
    );
  }

  @Get()
  @RequirePermissions('customers:read:customers')
  async findAll(@Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string) {
    const result = await this.customersService.findAll({ page, limit, search });
    return ApiResponse.paginated(result.data, result.total, result.page, result.limit);
  }

  @Get(':id/due')
  @RequirePermissions('customers:read:customers')
  async getDue(@Param('id', ParseUUIDPipe) id: string) {
    const customer = await this.customersService.findOne(id);
    return ApiResponse.success({
      id: customer.id,
      name: customer.name,
      currentBalance: customer.currentBalance,
      creditLimit: customer.creditLimit,
    });
  }

  @Get(':id')
  @RequirePermissions('customers:read:customers')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.customersService.findOne(id));
  }

  @Patch(':id')
  @RequirePermissions('customers:update:customers')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<CreateCustomerDto>) {
    return ApiResponse.success(await this.customersService.update(id, dto));
  }
}

@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
