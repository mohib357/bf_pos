import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductsImportService } from './products-import.service';
import { ProductsExportService } from './products-export.service';
import { ProductsImportController } from './products-import.controller';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
  ],
  // IMPORTANT: ProductsImportController MUST be listed before ProductsController.
  // NestJS registers routes in controller declaration order.  The import controller
  // owns all static /products/export and /products/import/* routes.  If it were
  // listed after ProductsController, NestJS would try to match those paths against
  // the :id wildcard in ProductsController first and fail with a 400 UUID error.
  controllers: [ProductsImportController, ProductsController],
  providers: [ProductsService, ProductsImportService, ProductsExportService],
  exports: [ProductsService, ProductsImportService, ProductsExportService],
})
export class ProductsModule {}
