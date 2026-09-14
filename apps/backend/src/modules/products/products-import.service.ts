/**
 * Product Import Service
 * Supports CSV and Excel (.xlsx) import with:
 *  - Row-level validation
 *  - Duplicate SKU/barcode detection
 *  - Preview before commit
 *  - Import job tracking via ProductImport model
 */
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

export interface ImportRow {
  rowNumber: number;
  sku?: string;
  barcode?: string;
  name?: string;
  nameBn?: string;
  categoryCode?: string;
  brandName?: string;
  unitAbbrev?: string;
  costPrice?: number;
  sellingPrice?: number;
  wholesalePrice?: number;
  mrp?: number;
  minimumStock?: number;
  reorderLevel?: number;
  reorderQty?: number;
  description?: string;
  status?: string;
}

export interface ImportRowError {
  row: number;
  field: string;
  message: string;
}

export interface ImportPreview {
  importId: string;
  filename: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ImportRowError[];
  preview: ImportRow[];   // First 10 valid rows
  canImport: boolean;
}

const EXPECTED_HEADERS = [
  'sku', 'barcode', 'name', 'name_bn',
  'category_code', 'brand_name', 'unit',
  'cost_price', 'selling_price', 'wholesale_price', 'mrp',
  'minimum_stock', 'reorder_level', 'reorder_qty',
  'description', 'status',
];

@Injectable()
export class ProductsImportService {
  constructor(private prisma: PrismaService) {}

  // ── Parse uploaded file buffer → rows ─────────────────────────────────────

  async parseFile(
    buffer: Buffer,
    mimetype: string,
    filename: string,
  ): Promise<ImportRow[]> {
    if (
      mimetype === 'text/csv' ||
      filename.endsWith('.csv')
    ) {
      return this.parseCsv(buffer);
    }
    if (
      mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      filename.endsWith('.xlsx') ||
      filename.endsWith('.xls')
    ) {
      return this.parseExcel(buffer);
    }
    throw new BadRequestException('Unsupported file type. Use CSV or XLSX. / CSV বা XLSX ফাইল ব্যবহার করুন।');
  }

  private parseCsv(buffer: Buffer): ImportRow[] {
    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new BadRequestException('CSV has no data rows');

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/['"]/g, ''));
    const rows: ImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = this.parseCsvLine(lines[i]);
      const row: any = { rowNumber: i + 1 };
      headers.forEach((h, idx) => {
        row[this.mapHeader(h)] = cells[idx]?.trim().replace(/^["']|["']$/g, '') || undefined;
      });
      rows.push(this.castTypes(row));
    }
    return rows;
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuotes) { inQuotes = true; continue; }
      if (ch === '"' && inQuotes && line[i + 1] === '"') { current += '"'; i++; continue; }
      if (ch === '"' && inQuotes) { inQuotes = false; continue; }
      if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
      current += ch;
    }
    result.push(current);
    return result;
  }

  private async parseExcel(buffer: Buffer): Promise<ImportRow[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Excel file has no worksheet');

    const rows: ImportRow[] = [];
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell) => {
      headers.push(String(cell.value || '').toLowerCase().replace(/\s+/g, '_'));
    });

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: any = { rowNumber };
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          const mapped = this.mapHeader(header);
          obj[mapped] = cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : undefined;
        }
      });
      if (obj.name || obj.sku) {
        rows.push(this.castTypes(obj));
      }
    });

    return rows;
  }

  private mapHeader(h: string): string {
    const map: Record<string, string> = {
      sku: 'sku',
      barcode: 'barcode',
      name: 'name',
      name_bn: 'nameBn',
      'name (bangla)': 'nameBn',
      category_code: 'categoryCode',
      category: 'categoryCode',
      brand_name: 'brandName',
      brand: 'brandName',
      unit: 'unitAbbrev',
      unit_abbrev: 'unitAbbrev',
      cost_price: 'costPrice',
      buying_price: 'costPrice',
      purchase_price: 'costPrice',
      selling_price: 'sellingPrice',
      sale_price: 'sellingPrice',
      wholesale_price: 'wholesalePrice',
      mrp: 'mrp',
      minimum_stock: 'minimumStock',
      min_stock: 'minimumStock',
      reorder_level: 'reorderLevel',
      reorder_qty: 'reorderQty',
      description: 'description',
      status: 'status',
    };
    return map[h] || h;
  }

  private castTypes(row: any): ImportRow {
    const toNum = (v: any) => {
      const n = parseFloat(String(v || '').replace(/[^\d.]/g, ''));
      return isNaN(n) ? undefined : n;
    };
    return {
      ...row,
      costPrice: toNum(row.costPrice),
      sellingPrice: toNum(row.sellingPrice),
      wholesalePrice: toNum(row.wholesalePrice),
      mrp: toNum(row.mrp),
      minimumStock: toNum(row.minimumStock),
      reorderLevel: toNum(row.reorderLevel),
      reorderQty: toNum(row.reorderQty),
      status: row.status?.toUpperCase() || 'ACTIVE',
    };
  }

  // ── Validate rows ─────────────────────────────────────────────────────────

  async validateRows(rows: ImportRow[]): Promise<{ valid: ImportRow[]; errors: ImportRowError[] }> {
    const errors: ImportRowError[] = [];
    const valid: ImportRow[] = [];
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();

    // Load existing SKUs/barcodes for conflict detection
    const existingSkus = new Set(
      (await this.prisma.product.findMany({ select: { sku: true }, where: { deletedAt: null } }))
        .map((p) => p.sku),
    );
    const existingBarcodes = new Set(
      (await this.prisma.product.findMany({ select: { barcode: true }, where: { deletedAt: null } }))
        .map((p) => p.barcode)
        .filter(Boolean) as string[],
    );

    for (const row of rows) {
      const rowErrors: ImportRowError[] = [];

      if (!row.name?.trim()) {
        rowErrors.push({ row: row.rowNumber, field: 'name', message: 'Product name is required' });
      }

      if (row.sku) {
        if (existingSkus.has(row.sku)) {
          rowErrors.push({ row: row.rowNumber, field: 'sku', message: `SKU "${row.sku}" already exists in database` });
        }
        if (seenSkus.has(row.sku)) {
          rowErrors.push({ row: row.rowNumber, field: 'sku', message: `SKU "${row.sku}" duplicated in import file` });
        }
        seenSkus.add(row.sku);
      }

      if (row.barcode) {
        if (existingBarcodes.has(row.barcode)) {
          rowErrors.push({ row: row.rowNumber, field: 'barcode', message: `Barcode "${row.barcode}" already exists in database` });
        }
        if (seenBarcodes.has(row.barcode)) {
          rowErrors.push({ row: row.rowNumber, field: 'barcode', message: `Barcode "${row.barcode}" duplicated in import file` });
        }
        seenBarcodes.add(row.barcode);
      }

      if (row.costPrice !== undefined && row.costPrice < 0) {
        rowErrors.push({ row: row.rowNumber, field: 'costPrice', message: 'Cost price must be ≥ 0' });
      }
      if (row.sellingPrice !== undefined && row.sellingPrice < 0) {
        rowErrors.push({ row: row.rowNumber, field: 'sellingPrice', message: 'Selling price must be ≥ 0' });
      }
      if (row.status && !['ACTIVE', 'INACTIVE', 'DISCONTINUED'].includes(row.status)) {
        rowErrors.push({ row: row.rowNumber, field: 'status', message: `Invalid status "${row.status}". Use ACTIVE/INACTIVE/DISCONTINUED` });
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
      } else {
        valid.push(row);
      }
    }

    return { valid, errors };
  }

  // ── Upload & Preview ──────────────────────────────────────────────────────

  async preview(
    buffer: Buffer,
    mimetype: string,
    filename: string,
    userId?: string,
  ): Promise<ImportPreview> {
    const rows = await this.parseFile(buffer, mimetype, filename);
    const { valid, errors } = await this.validateRows(rows);

    // Store import job
    const job = await this.prisma.productImport.create({
      data: {
        filename,
        totalRows: rows.length,
        validRows: valid.length,
        errorRows: errors.length,
        status: 'PENDING',
        errors: errors as any,
        preview: valid.slice(0, 10) as any,
        createdBy: userId,
      },
    });

    return {
      importId: job.id,
      filename,
      totalRows: rows.length,
      validRows: valid.length,
      errorRows: errors.length,
      errors,
      preview: valid.slice(0, 10),
      canImport: valid.length > 0,
    };
  }

  // ── Confirm & Execute Import ───────────────────────────────────────────────

  async executeImport(
    importId: string,
    buffer: Buffer,
    mimetype: string,
    filename: string,
    options: { skipDuplicates?: boolean; updateExisting?: boolean } = {},
    userId?: string,
  ) {
    const job = await this.prisma.productImport.findUnique({ where: { id: importId } });
    if (!job) throw new NotFoundException('Import job not found / আমদানি কাজ পাওয়া যায়নি');
    if (job.status === 'DONE') throw new BadRequestException('Import already completed');

    // Re-parse and re-validate (file is re-uploaded for confirmation)
    const rows = await this.parseFile(buffer, mimetype, filename);
    const { valid, errors } = await this.validateRows(rows);

    await this.prisma.productImport.update({
      where: { id: importId },
      data: { status: 'PROCESSING' },
    });

    let imported = 0;
    const importErrors: ImportRowError[] = [...errors];

    // Resolve reference lookups once
    const categories = await this.prisma.category.findMany({ select: { id: true, code: true } });
    const brands = await this.prisma.brand.findMany({ select: { id: true, name: true } });
    const units = await this.prisma.unit.findMany({ select: { id: true, abbreviation: true } });

    const catMap = Object.fromEntries(categories.map((c) => [c.code.toUpperCase(), c.id]));
    const brandMap = Object.fromEntries(brands.map((b) => [b.name.toLowerCase(), b.id]));
    const unitMap = Object.fromEntries(units.map((u) => [u.abbreviation.toLowerCase(), u.id]));

    for (const row of valid) {
      try {
        // Auto-generate SKU if missing
        const sku = row.sku || await this.autoSku(row);

        // Auto-generate barcode if missing
        const barcode = row.barcode || await this.autoBarcode();

        await this.prisma.product.create({
          data: {
            sku,
            barcode,
            name: row.name!,
            nameBn: row.nameBn,
            categoryId: row.categoryCode ? catMap[row.categoryCode.toUpperCase()] : undefined,
            brandId: row.brandName ? brandMap[row.brandName.toLowerCase()] : undefined,
            unitId: row.unitAbbrev ? unitMap[row.unitAbbrev.toLowerCase()] : undefined,
            costPrice: row.costPrice ?? 0,
            sellingPrice: row.sellingPrice ?? 0,
            wholesalePrice: row.wholesalePrice,
            mrp: row.mrp,
            minimumStock: row.minimumStock ?? 0,
            reorderLevel: row.reorderLevel ?? 0,
            reorderQty: row.reorderQty ?? 0,
            description: row.description,
            status: (row.status as any) || 'ACTIVE',
            createdBy: userId,
            updatedBy: userId,
          },
        });

        imported++;
      } catch (err: any) {
        importErrors.push({
          row: row.rowNumber,
          field: 'general',
          message: err?.message || 'Import failed for this row',
        });
      }
    }

    await this.prisma.productImport.update({
      where: { id: importId },
      data: {
        status: importErrors.length > errors.length ? 'DONE' : 'DONE',
        importedRows: imported,
        errorRows: importErrors.length,
        errors: importErrors as any,
        completedAt: new Date(),
      },
    });

    return {
      importId,
      totalRows: rows.length,
      importedRows: imported,
      errorRows: importErrors.length,
      errors: importErrors,
      message: `${imported} products imported successfully / ${imported} টি পণ্য আমদানি হয়েছে`,
    };
  }

  private async autoSku(row: ImportRow): Promise<string> {
    const prefix = row.categoryCode ? row.categoryCode.slice(0, 4).toUpperCase() : 'PRD';
    const today = new Date();
    const dateStr = `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const count = await this.prisma.product.count();
    return `${prefix}-${dateStr}-${String(count + 1).padStart(4, '0')}`;
  }

  private async autoBarcode(): Promise<string> {
    const count = await this.prisma.product.count();
    const base = `200${String(count + 1).padStart(9, '0')}`;
    const arr = base.split('').map(Number);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += i % 2 === 0 ? arr[i] : arr[i] * 3;
    return base + String((10 - (sum % 10)) % 10);
  }

  // ── Get import job status ──────────────────────────────────────────────────

  async getImportJob(id: string) {
    const job = await this.prisma.productImport.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Import job not found');
    return job;
  }

  // ── Download Template ──────────────────────────────────────────────────────

  async getTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Products');

    ws.columns = [
      { header: 'sku', key: 'sku', width: 20 },
      { header: 'barcode', key: 'barcode', width: 18 },
      { header: 'name', key: 'name', width: 35 },
      { header: 'name_bn', key: 'name_bn', width: 30 },
      { header: 'category_code', key: 'category_code', width: 18 },
      { header: 'brand_name', key: 'brand_name', width: 18 },
      { header: 'unit', key: 'unit', width: 10 },
      { header: 'cost_price', key: 'cost_price', width: 14 },
      { header: 'selling_price', key: 'selling_price', width: 14 },
      { header: 'wholesale_price', key: 'wholesale_price', width: 16 },
      { header: 'mrp', key: 'mrp', width: 12 },
      { header: 'minimum_stock', key: 'minimum_stock', width: 14 },
      { header: 'reorder_level', key: 'reorder_level', width: 14 },
      { header: 'reorder_qty', key: 'reorder_qty', width: 12 },
      { header: 'description', key: 'description', width: 40 },
      { header: 'status', key: 'status', width: 14 },
    ];

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A56DB' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add sample rows
    ws.addRow({
      sku: 'BOOK-SCH-999',
      barcode: '',
      name: 'Sample Book',
      name_bn: 'নমুনা বই',
      category_code: 'SCHOOL-BOOKS',
      brand_name: '',
      unit: 'pc',
      cost_price: 80,
      selling_price: 120,
      wholesale_price: 100,
      mrp: 130,
      minimum_stock: 5,
      reorder_level: 10,
      reorder_qty: 50,
      description: 'A sample product description',
      status: 'ACTIVE',
    });

    ws.addRow({
      sku: '',
      barcode: '',
      name: 'Ball Pen Blue (Pack)',
      name_bn: 'বল পেন নীল (প্যাক)',
      category_code: 'PENS-PENCILS',
      brand_name: '',
      unit: 'pk',
      cost_price: 55,
      selling_price: 80,
      wholesale_price: '',
      mrp: '',
      minimum_stock: 10,
      reorder_level: 20,
      reorder_qty: 100,
      description: '',
      status: 'ACTIVE',
    });

    // Add instructions sheet
    const infoWs = wb.addWorksheet('Instructions');
    infoWs.getCell('A1').value = 'Product Import Template — Instructions';
    infoWs.getCell('A1').font = { bold: true, size: 14 };
    const instructions = [
      ['Column', 'Required', 'Notes'],
      ['sku', 'No', 'Auto-generated if blank. Must be unique.'],
      ['barcode', 'No', 'Auto-generated EAN-13 if blank. Must be unique.'],
      ['name', 'YES', 'English product name'],
      ['name_bn', 'No', 'Bangla product name'],
      ['category_code', 'No', 'Category code (e.g. SCHOOL-BOOKS, STATIONERY)'],
      ['brand_name', 'No', 'Brand name (must match existing brand)'],
      ['unit', 'No', 'Unit abbreviation: pc, dz, box, pk, rm, set, copy, bndl, kg, g, L, m'],
      ['cost_price', 'No', 'Purchase/cost price (numeric)'],
      ['selling_price', 'No', 'Retail selling price (numeric)'],
      ['wholesale_price', 'No', 'Wholesale price (numeric, optional)'],
      ['mrp', 'No', 'Maximum retail price (numeric, optional)'],
      ['minimum_stock', 'No', 'Minimum stock level'],
      ['reorder_level', 'No', 'Trigger reorder when stock falls to this level'],
      ['reorder_qty', 'No', 'Quantity to reorder'],
      ['description', 'No', 'Product description'],
      ['status', 'No', 'ACTIVE / INACTIVE / DISCONTINUED (default: ACTIVE)'],
    ];
    instructions.forEach((row, i) => {
      const r = infoWs.getRow(i + 3);
      row.forEach((val, j) => { r.getCell(j + 1).value = val; });
      if (i === 0) {
        r.font = { bold: true };
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5EDFF' } };
      }
    });
    infoWs.columns = [{ width: 22 }, { width: 12 }, { width: 60 }];

    return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
  }
}
