'use client';
import { useState, useRef } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import apiClient from '@/lib/api';
import toast from 'react-hot-toast';

interface ImportError { row: number; field: string; message: string; }
interface ImportPreview {
  importId: string;
  filename: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ImportError[];
  preview: any[];
  canImport: boolean;
}

export default function ProductImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(csv|xlsx|xls)$/i)) {
      toast.error('Only CSV or Excel files allowed / শুধু CSV বা Excel ফাইল');
      return;
    }
    setFile(f);
    setPreview(null);
    setResult(null);
  };

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post('/products/import/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(res.data.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!file || !preview?.importId) return;
    setExecuting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post(
        `/products/import/execute?importId=${preview.importId}`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setResult(res.data.data);
      setPreview(null);
      toast.success(res.data.data.message);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Import failed');
    } finally {
      setExecuting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await apiClient.get('/products/import/template', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = 'product-import-template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Import Products"
        titleBn="পণ্য আমদানি করুন"
        description="Upload CSV or Excel to bulk import products."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Products', href: '/products' },
          { label: 'Import' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Template / টেমপ্লেট ডাউনলোড
          </Button>
        }
      />

      <div className="p-6 flex-1 overflow-auto space-y-6">
        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
          <p className="font-semibold">Import Instructions / আমদানি নির্দেশিকা</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-blue-700">
            <li>Download the template above and fill in your product data.</li>
            <li>Required column: <strong>name</strong>. All others are optional.</li>
            <li>SKU and barcode auto-generated if left blank.</li>
            <li>Upload, preview errors, then confirm import.</li>
            <li>Duplicate SKU or barcode rows will be flagged as errors.</li>
          </ul>
        </div>

        {/* Drop zone */}
        <div
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragging ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'}`}
        >
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {file ? (
            <div>
              <p className="text-sm font-medium text-green-700">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-gray-600">Drop CSV or Excel file here</p>
              <p className="text-xs text-gray-400 mt-1">or click to browse / বা ক্লিক করুন</p>
            </div>
          )}
        </div>

        {file && !preview && !result && (
          <div className="flex gap-3">
            <Button variant="primary" loading={loading} onClick={handlePreview}>
              Validate & Preview / যাচাই এবং প্রিভিউ
            </Button>
            <Button variant="outline" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
              Clear
            </Button>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Rows', labelBn: 'মোট সারি', value: preview.totalRows, color: 'text-gray-700' },
                { label: 'Valid', labelBn: 'বৈধ', value: preview.validRows, color: 'text-green-700' },
                { label: 'Errors', labelBn: 'ত্রুটি', value: preview.errorRows, color: 'text-red-600' },
                { label: 'Can Import', labelBn: 'আমদানি সম্ভব', value: preview.canImport ? 'Yes' : 'No', color: preview.canImport ? 'text-green-700' : 'text-red-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-xs text-gray-400 font-bn">{s.labelBn}</p>
                </div>
              ))}
            </div>

            {/* Errors */}
            {preview.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-red-800 mb-2">
                  {preview.errors.length} validation error(s) / {preview.errors.length} টি ত্রুটি
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {preview.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-700">
                      <span className="font-medium">Row {e.row}</span> [{e.field}]: {e.message}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Preview table */}
            {preview.preview.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Preview (first {preview.preview.length} valid rows)</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Name', 'SKU', 'Category', 'Cost', 'Selling', 'Status'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.preview.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">{row.name ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-gray-600">{row.sku ?? 'auto'}</td>
                          <td className="px-3 py-2 text-gray-500">{row.categoryCode ?? '—'}</td>
                          <td className="px-3 py-2 text-right">{row.costPrice ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-green-700 font-medium">{row.sellingPrice ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${row.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {row.status ?? 'ACTIVE'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              {preview.canImport && (
                <Button variant="primary" loading={executing} onClick={handleExecute}>
                  Confirm Import ({preview.validRows} rows) / আমদানি নিশ্চিত করুন
                </Button>
              )}
              <Button variant="outline" onClick={() => { setPreview(null); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
            <p className="text-base font-semibold text-green-800">✅ Import Complete / আমদানি সম্পন্ন</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center"><p className="text-xl font-bold text-green-700">{result.importedRows}</p><p className="text-xs text-gray-500">Imported</p></div>
              <div className="text-center"><p className="text-xl font-bold text-yellow-600">{result.errorRows}</p><p className="text-xs text-gray-500">Errors</p></div>
              <div className="text-center"><p className="text-xl font-bold text-gray-600">{result.totalRows}</p><p className="text-xs text-gray-500">Total</p></div>
            </div>
            {result.errors?.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-xs font-medium text-yellow-800 mb-1">Row-level errors:</p>
                {result.errors.map((e: ImportError, i: number) => (
                  <p key={i} className="text-xs text-yellow-700">Row {e.row} [{e.field}]: {e.message}</p>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => { setResult(null); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
              Import Another File
            </Button>
            <a href="/products" className="inline-block ml-2 text-sm text-green-700 underline hover:no-underline">
              View Products →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
