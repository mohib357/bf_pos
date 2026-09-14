/**
 * Product Import / Export Controller — base: /products
 *
 * All routes here are static paths and MUST be registered BEFORE
 * the parameterised @Get(':id') in ProductsController.
 *
 * NestJS resolves routes in declaration order within a module; because
 * ProductsImportController is listed FIRST in the module's controllers
 * array, its static routes always win over the :id wildcard.
 *
 * Routes:
 *   GET  /products/export              — Export products (xlsx/csv)
 *   GET  /products/import/template     — Download import template
 *   POST /products/import/preview      — Upload, validate, preview
 *   POST /products/import/execute      — Execute confirmed import
 *   GET  /products/import/:id          — Import job status
 */
import {
  Controller, Get, Post, Param, Query, Res,
  UseInterceptors, UploadedFile, ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ProductsImportService } from './products-import.service';
import { ProductsExportService } from './products-export.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('products')
export class ProductsImportController {
  constructor(
    private readonly importService: ProductsImportService,
    private readonly exportService: ProductsExportService,
  ) {}

  // ── Export ────────────────────────────────────────────────────────────────
  // Declared first so NestJS registers 'export' before ':id'

  @Get('export')
  @RequirePermissions('products:read:products')
  async exportProducts(
    @Res() res: Response,
    @Query('format') format: 'xlsx' | 'csv' = 'xlsx',
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('status') status?: string,
    @Query('includeStock') includeStock?: string,
  ) {
    const result = await this.exportService.exportProducts({
      format,
      categoryId,
      brandId,
      status,
      includeStock: includeStock !== 'false',
    });
    res.setHeader('Content-Type', result.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  // ── Import template ───────────────────────────────────────────────────────

  @Get('import/template')
  @RequirePermissions('products:create:products')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.importService.getTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.xlsx"');
    res.send(buffer);
  }

  // ── Upload & preview ──────────────────────────────────────────────────────

  @Post('import/preview')
  @RequirePermissions('products:create:products')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async preview(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) {
      return ApiResponse.error('No file uploaded / ফাইল আপলোড করা হয়নি', 'ফাইল আপলোড করুন');
    }
    const result = await this.importService.preview(
      file.buffer, file.mimetype, file.originalname, userId,
    );
    return ApiResponse.success(
      result,
      `Preview ready: ${result.validRows} valid, ${result.errorRows} errors`,
      `প্রিভিউ প্রস্তুত: ${result.validRows} বৈধ, ${result.errorRows} ত্রুটি`,
    );
  }

  // ── Execute import ────────────────────────────────────────────────────────

  @Post('import/execute')
  @RequirePermissions('products:create:products')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async execute(
    @UploadedFile() file: Express.Multer.File,
    @Query('importId') importId: string,
    @Query('skipDuplicates') skipDuplicates?: string,
    @Query('updateExisting') updateExisting?: string,
    @CurrentUser('id') userId: string = '',
  ) {
    if (!file) return ApiResponse.error('No file uploaded / ফাইল আপলোড করা হয়নি');
    if (!importId) return ApiResponse.error('importId is required. Call import/preview first.');

    const result = await this.importService.executeImport(
      importId, file.buffer, file.mimetype, file.originalname,
      { skipDuplicates: skipDuplicates === 'true', updateExisting: updateExisting === 'true' },
      userId,
    );
    return ApiResponse.success(result, result.message, result.message);
  }

  // ── Import job status ─────────────────────────────────────────────────────

  @Get('import/:id')
  @RequirePermissions('products:read:products')
  async getImportJob(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.importService.getImportJob(id);
    return ApiResponse.success(data);
  }
}
