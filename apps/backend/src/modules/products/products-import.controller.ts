/**
 * Product Import / Export Controller
 * POST /products/import/preview   — Upload file, validate, return preview
 * POST /products/import/execute   — Execute a previously previewed import
 * GET  /products/import/:id       — Import job status
 * GET  /products/import/template  — Download import template
 * GET  /products/export           — Export products to Excel/CSV
 */
import {
  Controller, Get, Post, Param, Query, Res,
  UseInterceptors, UploadedFile, ParseUUIDPipe, Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ProductsImportService } from './products-import.service';
import { ProductsExportService } from './products-export.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';
import { ConfirmImportDto } from './dto/import.dto';

@Controller('products')
export class ProductsImportController {
  constructor(
    private readonly importService: ProductsImportService,
    private readonly exportService: ProductsExportService,
  ) {}

  // ── Import Template ───────────────────────────────────────────────────────

  @Get('import/template')
  @RequirePermissions('products:create:products')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.importService.getTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.xlsx"');
    res.send(buffer);
  }

  // ── Upload & Preview ──────────────────────────────────────────────────────

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
      file.buffer,
      file.mimetype,
      file.originalname,
      userId,
    );

    return ApiResponse.success(
      result,
      `Preview ready: ${result.validRows} valid, ${result.errorRows} errors`,
      `প্রিভিউ প্রস্তুত: ${result.validRows} বৈধ, ${result.errorRows} ত্রুটি`,
    );
  }

  // ── Execute Import ────────────────────────────────────────────────────────

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
    if (!file) {
      return ApiResponse.error('No file uploaded / ফাইল আপলোড করা হয়নি');
    }
    if (!importId) {
      return ApiResponse.error('importId is required. Call /import/preview first.');
    }

    const result = await this.importService.executeImport(
      importId,
      file.buffer,
      file.mimetype,
      file.originalname,
      {
        skipDuplicates: skipDuplicates === 'true',
        updateExisting: updateExisting === 'true',
      },
      userId,
    );

    return ApiResponse.success(result, result.message, result.message);
  }

  // ── Import Job Status ─────────────────────────────────────────────────────

  @Get('import/:id')
  @RequirePermissions('products:read:products')
  async getImportJob(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.importService.getImportJob(id);
    return ApiResponse.success(data);
  }

  // ── Export ────────────────────────────────────────────────────────────────

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
}
