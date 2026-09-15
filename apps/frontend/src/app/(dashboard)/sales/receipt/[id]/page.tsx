'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useSaleDetail } from '@/hooks/useSales';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import apiClient from '@/lib/api';

const PAYMENT_LABELS_BN: Record<string, string> = {
  CASH: 'নগদ', CARD: 'কার্ড', BKASH: 'বিকাশ', NAGAD: 'নগদ মোবাইল',
  BANK_TRANSFER: 'ব্যাংক ট্রান্সফার', DUE: 'বাকি', CREDIT: 'বাকি',
};

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data: sale, isLoading } = useSaleDetail(id);
  const [businessName, setBusinessName] = useState('Barakah Finance');
  const [businessNameBn, setBusinessNameBn] = useState('বারাকাহ ফাইন্যান্স');
  const [footer, setFooter] = useState('ধন্যবাদ আমাদের সাথে থাকার জন্য');

  useEffect(() => {
    apiClient.get('/settings', { params: { group: 'business' } }).then(r => {
      const settings: any[] = r.data?.data ?? [];
      settings.forEach((s: any) => {
        if (s.key === 'business_name') setBusinessName(s.value);
        if (s.key === 'business_name_bn') setBusinessNameBn(s.value);
        if (s.key === 'receipt_footer') setFooter(s.value);
      });
    }).catch(() => {});
  }, []);

  function printReceipt() {
    window.print();
  }

  async function downloadPdf() {
    try {
      const r = await apiClient.get(`/sales/receipt/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open HTML receipt and let user print as PDF
      window.open(`/api/v1/sales/receipt/${id}/html`, '_blank');
    }
  }

  async function openHtml() {
    const r = await apiClient.get(`/sales/receipt/${id}/html`);
    const win = window.open('', '_blank');
    if (win) { win.document.write(r.data); win.document.close(); }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!sale) return <div className="p-6 text-gray-500">Sale not found</div>;

  const cashierName = sale.creator
    ? `${sale.creator.firstName ?? ''} ${(sale.creator as any).lastName ?? ''}`.trim() || sale.creator.username
    : 'N/A';

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4">

      {/* Action buttons — hidden on print */}
      <div className="no-print max-w-sm mx-auto mb-4 flex gap-2 justify-center">
        <Button variant="primary" onClick={printReceipt}>🖨️ প্রিন্ট / Print</Button>
        <Button variant="outline" onClick={downloadPdf}>⬇️ PDF</Button>
        <Button variant="ghost" onClick={openHtml}>🔍 Preview</Button>
        <Button variant="ghost" onClick={() => window.history.back()}>← Back</Button>
      </div>

      {/* Receipt — 80mm width */}
      <div
        className="receipt-paper mx-auto bg-white shadow-lg"
        style={{ width: '80mm', fontFamily: "'SolaimanLipi', 'Noto Sans Bengali', Arial, sans-serif" }}
        data-testid="receipt"
      >
        {/* Header */}
        <div style={{ textAlign: 'center', padding: '8px 6px 4px' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{businessNameBn}</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{businessName}</div>
        </div>

        <div style={{ borderTop: '1px solid #333', margin: '4px 0' }} />

        {/* Invoice info */}
        <table style={{ width: '100%', fontSize: 11, padding: '0 6px', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={{ color: '#666' }}>চালান নং:</td><td style={{ textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{sale.invoiceNumber}</td></tr>
            <tr><td style={{ color: '#666' }}>তারিখ:</td><td style={{ textAlign: 'right' }}>{formatDateTime(sale.saleDate)}</td></tr>
            <tr><td style={{ color: '#666' }}>ক্যাশিয়ার:</td><td style={{ textAlign: 'right' }}>{cashierName}</td></tr>
            {sale.customer && <tr><td style={{ color: '#666' }}>গ্রাহক:</td><td style={{ textAlign: 'right' }}>{sale.customer.name}</td></tr>}
          </tbody>
        </table>

        <div style={{ borderTop: '1px dashed #aaa', margin: '4px 0' }} />

        {/* Items */}
        <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse', padding: '0 6px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th style={{ textAlign: 'left', padding: '2px 4px', fontWeight: 600, color: '#555' }}>পণ্য</th>
              <th style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 600, color: '#555' }}>পরিমাণ×মূল্য</th>
              <th style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 600, color: '#555' }}>মোট</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px dashed #eee' }}>
                <td style={{ padding: '3px 4px' }}>
                  <div style={{ fontWeight: 600, fontSize: 11 }}>{item.product.nameBn ?? item.product.name}</div>
                  <div style={{ color: '#888', fontSize: 10 }}>{item.product.name}</div>
                  {parseFloat(item.discountAmount) > 0 && (
                    <div style={{ color: '#16a34a', fontSize: 9 }}>বাট্টা: {formatCurrency(parseFloat(item.discountAmount) * parseFloat(item.quantity))}</div>
                  )}
                </td>
                <td style={{ textAlign: 'right', padding: '3px 4px', whiteSpace: 'nowrap', fontSize: 10 }}>
                  {parseFloat(item.quantity).toFixed(0)} × {formatCurrency(item.unitPrice)}
                </td>
                <td style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                  {formatCurrency(item.totalAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: '1px dashed #aaa', margin: '4px 0' }} />

        {/* Summary */}
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', padding: '0 6px' }}>
          <tbody>
            <tr>
              <td style={{ color: '#666' }}>সাবটোটাল</td>
              <td style={{ textAlign: 'right' }}>{formatCurrency(sale.subtotal)}</td>
            </tr>
            {parseFloat(sale.discountAmount) > 0 && (
              <tr>
                <td style={{ color: '#16a34a' }}>বাট্টা</td>
                <td style={{ textAlign: 'right', color: '#16a34a' }}>-{formatCurrency(sale.discountAmount)}</td>
              </tr>
            )}
            {parseFloat(sale.taxAmount) > 0 && (
              <tr>
                <td style={{ color: '#666' }}>ভ্যাট</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(sale.taxAmount)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ borderTop: '1px solid #333', margin: '4px 0' }} />

        <table style={{ width: '100%', fontSize: 13, fontWeight: 700, borderCollapse: 'collapse', padding: '2px 6px' }}>
          <tbody>
            <tr>
              <td>মোট / Total</td>
              <td style={{ textAlign: 'right', color: '#16a34a', fontSize: 14 }}>{formatCurrency(sale.totalAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ borderTop: '1px dashed #aaa', margin: '4px 0' }} />

        {/* Payments */}
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', padding: '0 6px' }}>
          <tbody>
            {sale.payments.map((p, i) => (
              <tr key={i}>
                <td style={{ color: '#555' }}>{PAYMENT_LABELS_BN[p.method] ?? p.method}</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: '1px dashed #aaa', margin: '4px 0' }} />

        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', padding: '0 6px' }}>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600 }}>পরিশোধিত / Paid</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(sale.paidAmount)}</td>
            </tr>
            {parseFloat(sale.dueAmount) > 0 && (
              <tr>
                <td style={{ color: '#dc2626', fontWeight: 600 }}>বাকি / Due</td>
                <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{formatCurrency(sale.dueAmount)}</td>
              </tr>
            )}
            {parseFloat(sale.changeAmount) > 0 && (
              <tr>
                <td style={{ color: '#2563eb' }}>ফেরত / Change</td>
                <td style={{ textAlign: 'right', color: '#2563eb' }}>{formatCurrency(sale.changeAmount)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ borderTop: '1px solid #333', margin: '4px 0' }} />

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 10, color: '#555', padding: '4px 6px 8px' }}>
          {footer}
          <div style={{ marginTop: 4, fontSize: 9 }}>Powered by Barakah Finance POS</div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .receipt-paper, .receipt-paper * { visibility: visible; }
          .receipt-paper { position: fixed; left: 50%; transform: translateX(-50%); top: 0; }
          .no-print { display: none !important; }
          @page { size: 80mm auto; margin: 0; }
        }
      `}</style>
    </div>
  );
}
