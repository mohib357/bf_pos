import {
  Controller, Get, Post, Delete,
  Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { BarcodesService } from './barcodes.service';
import {
  AddBarcodeDto,
  BulkLabelRequestDto,
  SingleLabelRequestDto,
} from './dto/barcode.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('barcodes')
export class BarcodesController {
  constructor(private readonly barcodesService: BarcodesService) {}

  // ── Lookup ────────────────────────────────────────────────────────────────

  @Get('lookup/:barcode')
  @RequirePermissions('products:read:products')
  async lookup(@Param('barcode') barcode: string) {
    const data = await this.barcodesService.lookup(barcode);
    return ApiResponse.success(data);
  }

  // ── Generate ──────────────────────────────────────────────────────────────

  @Get('generate')
  @RequirePermissions('products:create:products')
  async generate() {
    const data = await this.barcodesService.generateNew();
    return ApiResponse.success(data);
  }

  // ── Validate ──────────────────────────────────────────────────────────────

  @Get('validate/:barcode')
  @RequirePermissions('products:read:products')
  async validate(
    @Param('barcode') barcode: string,
    @Query('excludeId') excludeId?: string,
  ) {
    const data = await this.barcodesService.validate(barcode, excludeId);
    return ApiResponse.success(data);
  }

  // ── Add barcode to product ────────────────────────────────────────────────

  @Post()
  @RequirePermissions('products:update:products')
  async addBarcode(@Body() dto: AddBarcodeDto, @CurrentUser('id') userId: string) {
    const data = await this.barcodesService.addBarcode(dto, userId);
    return ApiResponse.success(data, 'Barcode added', 'বারকোড যোগ হয়েছে');
  }

  // ── Remove barcode ────────────────────────────────────────────────────────

  @Delete(':id')
  @RequirePermissions('products:update:products')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    const data = await this.barcodesService.removeBarcode(id, userId);
    return ApiResponse.success(data);
  }

  // ── Product barcodes ──────────────────────────────────────────────────────

  @Get('product/:productId')
  @RequirePermissions('products:read:products')
  async getProductBarcodes(@Param('productId', ParseUUIDPipe) productId: string) {
    const data = await this.barcodesService.getProductBarcodes(productId);
    return ApiResponse.success(data);
  }

  // ── Label Data ────────────────────────────────────────────────────────────
  // Returns JSON for frontend to render labels (works with any label printing lib)

  @Post('labels/single')
  @RequirePermissions('products:read:products')
  async getSingleLabelData(@Body() dto: SingleLabelRequestDto) {
    const data = await this.barcodesService.getLabelData(dto.productId, dto.copies || 1);
    return ApiResponse.success({ ...data, options: dto.options });
  }

  @Post('labels/bulk')
  @RequirePermissions('products:read:products')
  async getBulkLabelData(@Body() dto: BulkLabelRequestDto) {
    const data = await this.barcodesService.getBulkLabelData(dto.items, dto.options);
    return ApiResponse.success(data, `${data.length} label(s) ready`, `${data.length} টি লেবেল প্রস্তুত`);
  }

  // ── Label HTML ────────────────────────────────────────────────────────────
  // Returns a printable HTML page for bulk labels

  @Post('labels/print')
  @RequirePermissions('products:read:products')
  async printLabels(@Body() dto: BulkLabelRequestDto, @Res() res: Response) {
    const labels = await this.barcodesService.getBulkLabelData(dto.items, dto.options);
    const opts = dto.options || {};

    const labelCards = labels.flatMap((label: any) => {
      const cards: string[] = [];
      for (let i = 0; i < (label.copies || 1); i++) {
        cards.push(`
          <div class="label">
            ${opts.showBusinessName !== false ? `<div class="biz-name">${label.businessName}</div>` : ''}
            ${opts.showProductName !== false ? `<div class="prod-name">${label.name}${label.nameBn ? `<br><span class="bn">${label.nameBn}</span>` : ''}</div>` : ''}
            ${opts.showSku !== false ? `<div class="sku">SKU: ${label.sku}</div>` : ''}
            <div class="barcode-area">
              <svg class="barcode" data-barcode="${label.barcode}"></svg>
              ${opts.showBarcode !== false ? `<div class="barcode-num">${label.barcode}</div>` : ''}
            </div>
            ${opts.showPrice !== false ? `<div class="price">${label.currencySymbol} ${Number(label.sellingPrice).toFixed(2)}</div>` : ''}
            ${opts.showMrp === true && label.mrp ? `<div class="mrp">MRP: ${label.currencySymbol} ${Number(label.mrp).toFixed(2)}</div>` : ''}
          </div>
        `);
      }
      return cards;
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Barcode Labels</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #fff; padding: 8px; }
    .labels-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .label {
      width: 90mm; border: 1px solid #ddd; border-radius: 3px;
      padding: 6px 8px; text-align: center; page-break-inside: avoid;
    }
    .biz-name { font-size: 9pt; font-weight: bold; color: #333; margin-bottom: 2px; }
    .prod-name { font-size: 8pt; font-weight: 600; margin-bottom: 2px; line-height: 1.3; }
    .bn { font-size: 7pt; color: #555; }
    .sku { font-size: 7pt; color: #666; margin-bottom: 3px; }
    .barcode-area { margin: 4px 0; }
    .barcode { width: 100%; height: 40px; }
    .barcode-num { font-size: 7pt; color: #444; letter-spacing: 2px; }
    .price { font-size: 12pt; font-weight: bold; color: #000; margin-top: 3px; }
    .mrp { font-size: 7pt; color: #888; text-decoration: line-through; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="padding:12px; background:#f5f5f5; margin-bottom:12px; display:flex; gap:12px; align-items:center;">
    <strong>Barakah Finance — Barcode Labels</strong>
    <button onclick="window.print()" style="padding:6px 16px; background:#1a56db; color:#fff; border:none; border-radius:4px; cursor:pointer;">🖨️ Print Labels</button>
    <span style="color:#666; font-size:12px;">${labelCards.length} label(s)</span>
  </div>
  <div class="labels-grid">
    ${labelCards.join('\n')}
  </div>
  <script>
    document.querySelectorAll('[data-barcode]').forEach(function(el) {
      try {
        JsBarcode(el, el.getAttribute('data-barcode'), {
          format: 'EAN13', displayValue: false, width: 1.5, height: 40, margin: 0
        });
      } catch(e) {
        JsBarcode(el, el.getAttribute('data-barcode'), {
          format: 'CODE128', displayValue: false, width: 1.5, height: 40, margin: 0
        });
      }
    });
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}
