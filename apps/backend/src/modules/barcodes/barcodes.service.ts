import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';
import { AddBarcodeDto, BarcodeLabelOptionsDto, BulkLabelRequestDto } from './dto/barcode.dto';

// ─── EAN-13 check digit ───────────────────────────────────────────────────────
function ean13CheckDigit(digits12: string): string {
  if (digits12.length !== 12) throw new BadRequestException('EAN-13 requires exactly 12 digits');
  const arr = digits12.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += i % 2 === 0 ? arr[i] : arr[i] * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

function validateEan13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) return false;
  const computed = ean13CheckDigit(barcode.slice(0, 12));
  return computed === barcode[12];
}

function generateInternalBarcode(sequence: number): string {
  const base = `200${String(sequence).padStart(9, '0')}`;
  return base + ean13CheckDigit(base);
}

@Injectable()
export class BarcodesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ── Add extra barcode to a product ────────────────────────────────────────

  async addBarcode(dto: AddBarcodeDto, userId?: string) {
    // Check product exists
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found / পণ্য পাওয়া যায়নি');

    // Check uniqueness across products table and barcodes table
    const conflict = await this.prisma.$transaction([
      this.prisma.product.findFirst({ where: { barcode: dto.barcode } }),
      this.prisma.barcode.findUnique({ where: { barcode: dto.barcode } }),
    ]);
    if (conflict[0] || conflict[1]) {
      throw new ConflictException('Barcode already exists / বারকোড ইতোমধ্যে আছে');
    }

    const barcode = await this.prisma.barcode.create({
      data: {
        productId: dto.productId,
        barcode: dto.barcode,
        type: dto.type || 'EAN13',
      },
    });

    await this.audit.log({
      userId,
      action: AuditAction.CREATE,
      tableName: 'barcodes',
      recordId: barcode.id,
      newValues: { barcode: barcode.barcode, productId: barcode.productId },
    });

    return barcode;
  }

  // ── Remove extra barcode ───────────────────────────────────────────────────

  async removeBarcode(barcodeId: string, userId?: string) {
    const barcode = await this.prisma.barcode.findUnique({ where: { id: barcodeId } });
    if (!barcode) throw new NotFoundException('Barcode not found / বারকোড পাওয়া যায়নি');

    await this.prisma.barcode.delete({ where: { id: barcodeId } });

    await this.audit.log({
      userId,
      action: AuditAction.DELETE,
      tableName: 'barcodes',
      recordId: barcodeId,
      oldValues: { barcode: barcode.barcode },
    });

    return { message: 'Barcode removed / বারকোড সরানো হয়েছে' };
  }

  // ── Lookup ────────────────────────────────────────────────────────────────

  async lookup(barcode: string) {
    // 1. Check primary barcode
    const byPrimary = await this.prisma.product.findFirst({
      where: { barcode, deletedAt: null },
      include: {
        category: { select: { id: true, name: true, nameBn: true } },
        brand: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, abbreviation: true } },
        productStocks: {
          select: { quantity: true, warehouse: { select: { name: true } } },
        },
      },
    });
    if (byPrimary) return { ...byPrimary, lookupType: 'primary' };

    // 2. Check barcodes relation
    const byExtra = await this.prisma.barcode.findUnique({
      where: { barcode },
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true, nameBn: true } },
            brand: { select: { id: true, name: true } },
            unit: { select: { id: true, name: true, abbreviation: true } },
            productStocks: {
              select: { quantity: true, warehouse: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (byExtra && !byExtra.product.deletedAt) {
      return { ...byExtra.product, lookupType: 'alternate', barcodeType: byExtra.type };
    }

    throw new NotFoundException(`No product found for barcode: ${barcode} / বারকোডের জন্য পণ্য পাওয়া যায়নি`);
  }

  // ── Generate new internal barcode ─────────────────────────────────────────

  async generateNew(): Promise<{ barcode: string; type: string; isValid: boolean }> {
    const count = await this.prisma.product.count();
    let seq = count + 1;
    let barcode: string;
    let attempts = 0;

    do {
      barcode = generateInternalBarcode(seq + attempts);
      const exists = await this.prisma.product.findFirst({
        where: { OR: [{ barcode }, { barcodes: { some: { barcode } } }] },
      });
      if (!exists) break;
      attempts++;
    } while (attempts < 200);

    return { barcode: barcode!, type: 'EAN13', isValid: validateEan13(barcode!) };
  }

  // ── Validate ──────────────────────────────────────────────────────────────

  async validate(barcode: string, excludeProductId?: string) {
    const isValidFormat = /^\d{13}$/.test(barcode)
      ? validateEan13(barcode)
      : barcode.length >= 4; // allow CODE128 / custom

    const where: any = { OR: [{ barcode }, { barcodes: { some: { barcode } } }] };
    if (excludeProductId) where.id = { not: excludeProductId };

    const exists = await this.prisma.product.findFirst({ where, select: { id: true, sku: true, name: true } });

    return {
      barcode,
      isValidFormat,
      isUnique: !exists,
      conflict: exists || null,
    };
  }

  // ── Label Data ────────────────────────────────────────────────────────────
  // Returns structured data for frontend label rendering / PDF generation

  async getLabelData(productId: string, copies = 1) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, deletedAt: null },
      include: {
        category: { select: { name: true, nameBn: true } },
        unit: { select: { abbreviation: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found / পণ্য পাওয়া যায়নি');

    const setting = await this.prisma.setting.findMany({
      where: { key: { in: ['business_name', 'business_name_bn', 'currency_symbol'] } },
    });
    const settings = Object.fromEntries(setting.map((s) => [s.key, s.value]));

    return {
      productId: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      nameBn: product.nameBn,
      sellingPrice: product.sellingPrice,
      mrp: product.mrp,
      categoryName: product.category?.name,
      unitAbbrev: product.unit?.abbreviation,
      businessName: settings['business_name'] || 'Barakah Finance',
      businessNameBn: settings['business_name_bn'] || 'বারাকাহ ফাইন্যান্স',
      currencySymbol: settings['currency_symbol'] || '৳',
      copies,
    };
  }

  // ── Bulk Label Data ───────────────────────────────────────────────────────

  async getBulkLabelData(
    items: Array<{ productId: string; copies?: number }>,
    options?: BarcodeLabelOptionsDto,
  ) {
    const results = await Promise.all(
      items.map(async (item) => {
        try {
          const data = await this.getLabelData(item.productId, item.copies || 1);
          return { ...data, options };
        } catch {
          return null;
        }
      }),
    );
    return results.filter(Boolean);
  }

  // ── Product barcodes list ──────────────────────────────────────────────────

  async getProductBarcodes(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, deletedAt: null },
      include: { barcodes: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    return {
      primaryBarcode: { barcode: product.barcode, type: 'primary', id: null },
      additionalBarcodes: product.barcodes,
    };
  }
}
