import { Injectable, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';
import Decimal from 'decimal.js';

function d(v: any): Decimal { return new Decimal(v?.toString() ?? '0'); }

@Injectable()
export class ReceiptService {
  constructor(private salesService: SalesService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // HTML RECEIPT — 80mm thermal printer format
  // ═══════════════════════════════════════════════════════════════════════════

  async generateHtml(id: string): Promise<string> {
    const { sale, settings } = await this.salesService.getReceiptData(id);

    const businessName = settings['business_name'] ?? 'Barakah Finance';
    const businessNameBn = settings['business_name_bn'] ?? 'বারাকাহ ফাইন্যান্স';
    const address = settings['business_address'] ?? '';
    const phone = settings['business_phone'] ?? '';
    const footer = settings['receipt_footer'] ?? 'ধন্যবাদ আমাদের সাথে থাকার জন্য / Thank you for your purchase';

    const saleDate = new Date(sale.saleDate);
    const dateStr = saleDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = saleDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const itemRows = sale.items.map((item: any) => {
      const name = item.product.nameBn || item.product.name;
      const qty = d(item.quantity).toFixed(2);
      const price = d(item.unitPrice).toFixed(2);
      const disc = d(item.discountAmount).greaterThan(0)
        ? `<div style="font-size:9px;color:#666">বাট্টা: ৳${d(item.discountAmount).toFixed(2)}</div>` : '';
      const total = d(item.totalAmount).toFixed(2);
      return `
        <tr>
          <td style="padding:2px 1px;border-bottom:1px dashed #ddd;">
            <div style="font-size:11px;font-weight:600;">${name}</div>
            <div style="font-size:10px;color:#555">${item.product.name}</div>
            ${disc}
          </td>
          <td style="text-align:right;padding:2px 1px;border-bottom:1px dashed #ddd;font-size:10px;white-space:nowrap;">${qty} × ৳${price}</td>
          <td style="text-align:right;padding:2px 1px;border-bottom:1px dashed #ddd;font-size:11px;font-weight:600;white-space:nowrap;">৳${total}</td>
        </tr>`;
    }).join('');

    const paymentRows = sale.payments.map((p: any) => {
      const methodBn: Record<string, string> = {
        CASH: 'নগদ', CARD: 'কার্ড', BKASH: 'বিকাশ', NAGAD: 'নগদ মোবাইল',
        BANK_TRANSFER: 'ব্যাংক', DUE: 'বাকি', CREDIT: 'বাকি', MOBILE_BANKING: 'মোবাইল ব্যাংকিং',
      };
      return `<tr><td style="font-size:10px">${methodBn[p.method] ?? p.method}</td><td style="text-align:right;font-size:10px">৳${d(p.amount).toFixed(2)}</td></tr>`;
    }).join('');

    const cashierName = sale.creator
      ? `${sale.creator.firstName ?? ''} ${sale.creator.lastName ?? ''}`.trim() || sale.creator.username
      : 'N/A';

    return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="UTF-8">
<title>Receipt — ${sale.invoiceNumber}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  @media print {
    body { margin: 0; }
    .no-print { display: none !important; }
    button { display: none !important; }
  }
  * { box-sizing: border-box; font-family: 'SolaimanLipi', 'Bangla', 'Noto Sans Bengali', Arial, sans-serif; }
  body { width: 80mm; max-width: 80mm; margin: 0 auto; padding: 4mm 3mm; font-size: 11px; color: #111; background: #fff; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .divider { border-top: 1px dashed #999; margin: 4px 0; }
  .divider-solid { border-top: 1px solid #333; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  .summary-row td { padding: 2px 0; font-size: 11px; }
  .total-row td { padding: 3px 0; font-size: 13px; font-weight: 700; }
  .footer-text { font-size: 10px; text-align: center; color: #555; margin-top: 6px; }
  .print-btn { display: block; margin: 10px auto; padding: 8px 20px; background: #16a34a; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
</style>
</head>
<body>

<!-- Business Header -->
<div class="center">
  <div style="font-size:15px;font-weight:700;">${businessNameBn}</div>
  <div style="font-size:12px;font-weight:600;">${businessName}</div>
  ${address ? `<div style="font-size:10px;color:#555">${address}</div>` : ''}
  ${phone ? `<div style="font-size:10px;">☎ ${phone}</div>` : ''}
</div>

<div class="divider-solid"></div>

<!-- Invoice Info -->
<table>
  <tr>
    <td style="font-size:10px;">চালান নং:</td>
    <td style="text-align:right;font-size:10px;font-weight:600;">${sale.invoiceNumber}</td>
  </tr>
  <tr>
    <td style="font-size:10px;">তারিখ:</td>
    <td style="text-align:right;font-size:10px;">${dateStr} ${timeStr}</td>
  </tr>
  <tr>
    <td style="font-size:10px;">ক্যাশিয়ার:</td>
    <td style="text-align:right;font-size:10px;">${cashierName}</td>
  </tr>
  ${sale.customer ? `<tr><td style="font-size:10px;">গ্রাহক:</td><td style="text-align:right;font-size:10px;">${sale.customer.name}${sale.customer.phone ? ' / ' + sale.customer.phone : ''}</td></tr>` : ''}
</table>

<div class="divider"></div>

<!-- Items -->
<table>
  <thead>
    <tr>
      <th style="text-align:left;font-size:10px;font-weight:600;">পণ্য</th>
      <th style="text-align:right;font-size:10px;font-weight:600;">পরিমাণ×মূল্য</th>
      <th style="text-align:right;font-size:10px;font-weight:600;">মোট</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>

<div class="divider"></div>

<!-- Summary -->
<table>
  <tr class="summary-row">
    <td>সাবটোটাল / Subtotal</td>
    <td style="text-align:right;">৳${d(sale.subtotal).toFixed(2)}</td>
  </tr>
  ${d(sale.discountAmount).greaterThan(0) ? `<tr class="summary-row"><td>বাট্টা / Discount</td><td style="text-align:right;">-৳${d(sale.discountAmount).toFixed(2)}</td></tr>` : ''}
  ${d(sale.taxAmount).greaterThan(0) ? `<tr class="summary-row"><td>ভ্যাট / VAT</td><td style="text-align:right;">৳${d(sale.taxAmount).toFixed(2)}</td></tr>` : ''}
</table>

<div class="divider-solid"></div>

<table>
  <tr class="total-row">
    <td>মোট / Total</td>
    <td style="text-align:right;">৳${d(sale.totalAmount).toFixed(2)}</td>
  </tr>
</table>

<div class="divider"></div>

<!-- Payments -->
<table>
  ${paymentRows}
</table>

<div class="divider"></div>

<table>
  <tr class="summary-row">
    <td>পরিশোধিত / Paid</td>
    <td style="text-align:right;font-weight:600;">৳${d(sale.paidAmount).toFixed(2)}</td>
  </tr>
  ${d(sale.dueAmount).greaterThan(0) ? `<tr class="summary-row"><td style="color:#dc2626">বাকি / Due</td><td style="text-align:right;color:#dc2626;font-weight:600;">৳${d(sale.dueAmount).toFixed(2)}</td></tr>` : ''}
  ${d(sale.changeAmount).greaterThan(0) ? `<tr class="summary-row"><td>ফেরত / Change</td><td style="text-align:right;">৳${d(sale.changeAmount).toFixed(2)}</td></tr>` : ''}
</table>

<div class="divider-solid"></div>

<!-- Footer -->
<div class="footer-text">${footer}</div>
<div class="footer-text" style="margin-top:4px;">Powered by Barakah Finance POS</div>

<!-- Print Button (hidden on print) -->
<button class="print-btn no-print" onclick="window.print()">🖨️ প্রিন্ট করুন / Print</button>

</body>
</html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PDF RECEIPT
  // ═══════════════════════════════════════════════════════════════════════════

  async generatePdf(id: string): Promise<Buffer> {
    // We use puppeteer if available, otherwise fall back to html-pdf-node
    // Check for puppeteer first
    let puppeteer: any;
    try {
      puppeteer = require('puppeteer');
    } catch {
      // Try puppeteer-core
      try {
        puppeteer = require('puppeteer-core');
      } catch {
        // Generate a minimal PDF using raw PDF syntax as last resort
        return this.generateMinimalPdf(id);
      }
    }

    const html = await this.generateHtml(id);

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        width: '80mm',
        printBackground: true,
        margin: { top: '4mm', bottom: '4mm', left: '3mm', right: '3mm' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  /** Minimal fallback PDF — plain text in raw PDF format */
  private async generateMinimalPdf(id: string): Promise<Buffer> {
    const { sale, settings } = await this.salesService.getReceiptData(id);
    const businessName = settings['business_name'] ?? 'Barakah Finance';

    // Build minimal valid PDF
    const text = [
      businessName,
      `Invoice: ${sale.invoiceNumber}`,
      `Date: ${new Date(sale.saleDate).toLocaleString()}`,
      `Total: ${sale.totalAmount}`,
      `Paid: ${sale.paidAmount}`,
      `Due: ${sale.dueAmount}`,
    ].join('\n');

    // Minimal PDF structure
    const pdfContent = `%PDF-1.4
1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj
2 0 obj<</Type /Pages /Kids [3 0 R] /Count 1>>endobj
3 0 obj<</Type /Page /Parent 2 0 R /MediaBox [0 0 226 400] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${text.length + 30}>>
stream
BT /F1 10 Tf 10 380 Td (${text.replace(/\n/g, ') Tj T* (')}) Tj ET
endstream
endobj
5 0 obj<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>endobj
xref 0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000${400 + text.length} 00000 n
trailer<</Size 6 /Root 1 0 R>>
startxref ${500 + text.length}
%%EOF`;

    return Buffer.from(pdfContent);
  }
}
