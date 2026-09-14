/**
 * Product Export Service
 * Exports products to Excel (.xlsx) or CSV with full product data
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

export interface ExportOptions {
  format?: 'xlsx' | 'csv';
  categoryId?: string;
  brandId?: string;
  status?: string;
  includeStock?: boolean;
}

@Injectable()
export class ProductsExportService {
  constructor(private prisma: PrismaService) {}

  async exportProducts(options: ExportOptions = {}): Promise<{ buffer: Buffer; filename: string; mimetype: string }> {
    const where: any = { deletedAt: null };
    if (options.categoryId) where.categoryId = options.categoryId;
    if (options.brandId) where.brandId = options.brandId;
    if (options.status) where.status = options.status;

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true, nameBn: true, code: true } },
        brand: { select: { name: true } },
        unit: { select: { name: true, abbreviation: true } },
        productStocks: { select: { quantity: true } },
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });

    const rows = products.map((p) => {
      const totalStock = p.productStocks.reduce(
        (sum, s) => sum + parseFloat(s.quantity.toString()),
        0,
      );
      return {
        sku: p.sku,
        barcode: p.barcode || '',
        name: p.name,
        nameBn: p.nameBn || '',
        categoryCode: p.category?.code || '',
        categoryName: p.category?.name || '',
        brandName: p.brand?.name || '',
        unit: p.unit?.abbreviation || '',
        costPrice: parseFloat(p.costPrice.toString()),
        sellingPrice: parseFloat(p.sellingPrice.toString()),
        wholesalePrice: p.wholesalePrice ? parseFloat(p.wholesalePrice.toString()) : '',
        mrp: p.mrp ? parseFloat(p.mrp.toString()) : '',
        minimumStock: parseFloat(p.minimumStock.toString()),
        reorderLevel: parseFloat(p.reorderLevel.toString()),
        reorderQty: parseFloat(p.reorderQty.toString()),
        status: p.status,
        totalStock: totalStock,
        stockValue: +(totalStock * parseFloat(p.costPrice.toString())).toFixed(2),
        description: p.description || '',
        createdAt: p.createdAt.toISOString().slice(0, 10),
      };
    });

    if (options.format === 'csv') {
      return this.toCsv(rows);
    }
    return this.toExcel(rows, options.includeStock !== false);
  }

  private async toExcel(
    rows: any[],
    includeStock: boolean,
  ): Promise<{ buffer: Buffer; filename: string; mimetype: string }> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Barakah Finance POS';
    wb.created = new Date();

    const ws = wb.addWorksheet('Products', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    type ColDef = Partial<ExcelJS.Column> & { header: string; key: string; width: number };
    const columns: ColDef[] = [
      { header: 'SKU', key: 'sku', width: 22 },
      { header: 'Barcode', key: 'barcode', width: 18 },
      { header: 'Name (English)', key: 'name', width: 40 },
      { header: 'Name (Bangla)', key: 'nameBn', width: 35 },
      { header: 'Category Code', key: 'categoryCode', width: 18 },
      { header: 'Category', key: 'categoryName', width: 22 },
      { header: 'Brand', key: 'brandName', width: 18 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Cost Price', key: 'costPrice', width: 14 },
      { header: 'Selling Price', key: 'sellingPrice', width: 14 },
      { header: 'Wholesale Price', key: 'wholesalePrice', width: 16 },
      { header: 'MRP', key: 'mrp', width: 12 },
      { header: 'Min Stock', key: 'minimumStock', width: 12 },
      { header: 'Reorder Level', key: 'reorderLevel', width: 14 },
      { header: 'Reorder Qty', key: 'reorderQty', width: 12 },
      { header: 'Status', key: 'status', width: 14 },
      ...(includeStock
        ? [
            { header: 'Total Stock', key: 'totalStock', width: 14 } as ColDef,
            { header: 'Stock Value', key: 'stockValue', width: 14 } as ColDef,
          ]
        : []),
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Created Date', key: 'createdAt', width: 14 },
    ];

    ws.columns = columns as ExcelJS.Column[];

    // Style header
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A56DB' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 20;

    // Add data rows
    rows.forEach((row, idx) => {
      const r = ws.addRow(row);
      r.height = 16;

      // Alternate row color
      if (idx % 2 === 1) {
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFF' } };
      }

      // Color-code status
      const statusCell = r.getCell('status');
      if (row.status === 'ACTIVE') {
        statusCell.font = { color: { argb: 'FF15803D' } };
      } else if (row.status === 'INACTIVE') {
        statusCell.font = { color: { argb: 'FFB91C1C' } };
      } else {
        statusCell.font = { color: { argb: 'FF6B7280' } };
      }

      // Number formatting
      ['costPrice', 'sellingPrice', 'wholesalePrice', 'mrp', 'stockValue'].forEach((col) => {
        const cell = r.getCell(col);
        if (cell.value !== '' && cell.value !== null) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right' };
        }
      });
    });

    // Auto-filter
    ws.autoFilter = { from: 'A1', to: { row: 1, column: columns.length } };

    // Summary sheet
    const sumWs = wb.addWorksheet('Summary');
    const totalCostValue = rows.reduce((s, r) => s + (r.stockValue || 0), 0);
    const totalSellingValue = rows.reduce(
      (s, r) => s + r.totalStock * r.sellingPrice,
      0,
    );

    const summaryData = [
      ['Report', 'Product Export'],
      ['Generated', new Date().toISOString().slice(0, 19).replace('T', ' ')],
      ['Total Products', rows.length],
      ['Active', rows.filter((r) => r.status === 'ACTIVE').length],
      ['Inactive', rows.filter((r) => r.status === 'INACTIVE').length],
      ['Discontinued', rows.filter((r) => r.status === 'DISCONTINUED').length],
      ['Total Stock Value (Cost)', totalCostValue.toFixed(2)],
      ['Total Selling Value', totalSellingValue.toFixed(2)],
    ];

    summaryData.forEach(([label, value]) => {
      const r = sumWs.addRow([label, value]);
      r.getCell(1).font = { bold: true };
    });
    sumWs.columns = [{ width: 28 }, { width: 22 }];

    const dateSuffix = new Date().toISOString().slice(0, 10);
    const filename = `products-export-${dateSuffix}.xlsx`;
    const buffer = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);

    return {
      buffer,
      filename,
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private toCsv(rows: any[]): { buffer: Buffer; filename: string; mimetype: string } {
    if (rows.length === 0) {
      return {
        buffer: Buffer.from('No data'),
        filename: 'products-export.csv',
        mimetype: 'text/csv',
      };
    }

    const headers = Object.keys(rows[0]);
    const escape = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const lines = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
    ];

    const dateSuffix = new Date().toISOString().slice(0, 10);
    return {
      buffer: Buffer.from(lines.join('\n'), 'utf-8'),
      filename: `products-export-${dateSuffix}.csv`,
      mimetype: 'text/csv',
    };
  }
}
