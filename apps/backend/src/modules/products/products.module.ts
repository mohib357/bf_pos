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
    // Use memory storage so we can access file.buffer in controllers
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [ProductsController, ProductsImportController],
  providers: [ProductsService, ProductsImportService, ProductsExportService],
  exports: [ProductsService, ProductsImportService, ProductsExportService],
})
export class ProductsModule {}
