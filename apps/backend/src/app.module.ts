import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import {
  appConfig, databaseConfig, jwtConfig, bcryptConfig, redisConfig, seedConfig,
} from './config/app.config';

import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { AdminModule } from './modules/admin/admin.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { BrandsModule } from './modules/brands/brands.module';
import { UnitsModule } from './modules/units/units.module';
import { BarcodesModule } from './modules/barcodes/barcodes.module';
import { SalesModule } from './modules/sales/sales.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { CustomersModule } from './modules/customers/customers.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AppCacheModule } from './modules/cache/cache.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, bcryptConfig, redisConfig, seedConfig],
      envFilePath: ['.env', '.env.local'],
    }),

    /**
     * Rate Limiting — in-memory storage (Redis-backed version requires
     * nestjs-throttler-storage-redis compatible with @nestjs/throttler v5).
     * The in-memory store is process-local but fully functional for single-instance deploys.
     * For multi-instance Redis integration, upgrade storage when the package ships v5 support.
     *
     * Two tiers:
     *  - "default": 100 req / 60s — all routes
     *  - "login":     5 req / 60s — POST /auth/login (via @Throttle decorator)
     */
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      { name: 'login',   ttl: 60_000, limit: 5   },
    ]),

    // Core
    PrismaModule,

    // Audit (global — provides AuditService everywhere)
    AuditModule,

    // Feature modules
    AuthModule,
    UsersModule,
    RolesModule,
    AdminModule,
    ProductsModule,
    CategoriesModule,
    BrandsModule,
    UnitsModule,
    BarcodesModule,
    SalesModule,
    PurchasesModule,
    SuppliersModule,
    CustomersModule,
    InventoryModule,
    AccountingModule,
    SettingsModule,
    AppCacheModule,
    HealthModule,
    NotificationsModule,
  ],
  providers: [
    // Global throttle guard — applies "default" tier to all routes
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global JWT guard — all routes require auth unless @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global RBAC guard
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Global response transform
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    // Global HTTP logging
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
