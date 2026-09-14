'use client';
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { useSettings, useBulkUpdateSettings, useSequences } from '@/hooks/useAdmin';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const GROUP_LABELS: Record<string, { label: string; labelBn: string; icon: string }> = {
  business:  { label: 'Business Info',   labelBn: 'ব্যবসার তথ্য',    icon: '🏢' },
  tax:       { label: 'Tax Settings',    labelBn: 'কর সেটিংস',        icon: '📊' },
  inventory: { label: 'Inventory',       labelBn: 'ইনভেন্টরি',        icon: '📦' },
  invoice:   { label: 'Invoice',         labelBn: 'ইনভয়েস',           icon: '📄' },
  pos:       { label: 'POS Settings',    labelBn: 'POS সেটিংস',       icon: '💰' },
  app:       { label: 'App Settings',    labelBn: 'অ্যাপ সেটিংস',     icon: '⚙️' },
};

const KEY_LABELS: Record<string, { label: string; labelBn: string; description?: string }> = {
  business_name:     { label: 'Business Name', labelBn: 'ব্যবসার নাম' },
  business_name_bn:  { label: 'Business Name (Bangla)', labelBn: 'ব্যবসার নাম (বাংলা)' },
  business_address:  { label: 'Address', labelBn: 'ঠিকানা' },
  business_phone:    { label: 'Phone', labelBn: 'ফোন' },
  currency:          { label: 'Currency Code', labelBn: 'মুদ্রা কোড', description: 'e.g. BDT, USD' },
  currency_symbol:   { label: 'Currency Symbol', labelBn: 'মুদ্রা চিহ্ন', description: 'e.g. ৳, $' },
  tax_rate:          { label: 'Default Tax Rate (%)', labelBn: 'ডিফল্ট কর হার (%)', description: '0 for no tax' },
  low_stock_alert:   { label: 'Low Stock Alert', labelBn: 'কম স্টক সতর্কতা', description: 'Enable low stock notifications' },
  default_language:  { label: 'Default Language', labelBn: 'ডিফল্ট ভাষা', description: 'bn or en' },
  invoice_footer:    { label: 'Invoice Footer (Bangla)', labelBn: 'ইনভয়েস ফুটার (বাংলা)' },
  invoice_footer_en: { label: 'Invoice Footer (English)', labelBn: 'ইনভয়েস ফুটার (ইংরেজি)' },
  pos_print_receipt: { label: 'Auto Print Receipt', labelBn: 'স্বয়ংক্রিয় রসিদ প্রিন্ট', description: 'Print receipt after each sale' },
  allow_negative_stock: { label: 'Allow Negative Stock', labelBn: 'নেগেটিভ স্টক অনুমতি', description: 'Allow selling when stock is 0' },
};

type Tab = 'settings' | 'numbering';

export default function SettingsPage() {
  const { hasPermission } = useAuthStore();
  const canEdit = hasPermission('settings:update:settings');

  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: sequences, isLoading: seqLoading } = useSequences();
  const bulkUpdate = useBulkUpdateSettings();

  useEffect(() => {
    if (settings) {
      const initial: Record<string, string> = {};
      settings.forEach((s: any) => { initial[s.key] = s.value; });
      setLocalValues(initial);
    }
  }, [settings]);

  const handleChange = (key: string, value: string) => {
    setLocalValues(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    const updates = Object.entries(localValues).map(([key, value]) => ({ key, value }));
    await bulkUpdate.mutateAsync(updates);
    setIsDirty(false);
  };

  const handleUpdateSequence = async (module: string, field: string, value: string) => {
    try {
      const { default: apiClient } = await import('@/lib/api');
      await apiClient.patch(`/admin/numbering/${module}`, { [field]: value });
      toast.success('Updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed');
    }
  };

  // Group settings
  const grouped: Record<string, any[]> = {};
  (settings ?? []).forEach((s: any) => {
    if (!grouped[s.group]) grouped[s.group] = [];
    grouped[s.group].push(s);
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="System Settings"
        titleBn="সিস্টেম সেটিংস"
        description="Configure business information, numbering, and system behaviour."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Admin' }, { label: 'Settings' }]}
        actions={
          activeTab === 'settings' && canEdit && isDirty && (
            <Button variant="primary" size="sm" loading={bulkUpdate.isPending} onClick={handleSave}>
              Save Changes / পরিবর্তন সংরক্ষণ
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-auto">
        {/* Tabs */}
        <div className="border-b border-gray-200 bg-white px-6">
          <nav className="flex gap-6">
            {(['settings', 'numbering'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'py-3 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab
                    ? 'border-green-600 text-green-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                )}
              >
                {tab === 'settings' ? 'Business Settings / ব্যবসার সেটিংস' : 'Numbering / নম্বরিং'}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6 space-y-6">
          {activeTab === 'settings' && (
            <>
              {settingsLoading ? (
                <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-40 bg-gray-100 animate-pulse rounded-xl" />)}</div>
              ) : (
                Object.entries(grouped).map(([group, items]) => {
                  const meta = GROUP_LABELS[group] ?? { label: group, labelBn: group, icon: '⚙️' };
                  return (
                    <div key={group} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
                        <span className="text-lg">{meta.icon}</span>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-800">{meta.label}</h3>
                          <p className="text-xs text-gray-500">{meta.labelBn}</p>
                        </div>
                      </div>
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                        {items.map((setting: any) => {
                          const meta = KEY_LABELS[setting.key] ?? { label: setting.key, labelBn: setting.key };
                          const value = localValues[setting.key] ?? setting.value;

                          if (setting.type === 'BOOLEAN') {
                            return (
                              <div key={setting.key} className="flex items-start justify-between gap-4 p-3 bg-gray-50 rounded-lg">
                                <div>
                                  <p className="text-sm font-medium text-gray-700">{meta.label}</p>
                                  <p className="text-xs text-gray-500">{meta.labelBn}</p>
                                  {meta.description && <p className="text-xs text-gray-400 mt-0.5">{meta.description}</p>}
                                </div>
                                <button
                                  onClick={() => canEdit && handleChange(setting.key, value === 'true' ? 'false' : 'true')}
                                  disabled={!canEdit}
                                  className={cn(
                                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                                    value === 'true' ? 'bg-green-600' : 'bg-gray-200',
                                    !canEdit && 'cursor-not-allowed opacity-60',
                                  )}
                                >
                                  <span className={cn(
                                    'inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200',
                                    value === 'true' ? 'translate-x-5' : 'translate-x-0',
                                  )} />
                                </button>
                              </div>
                            );
                          }

                          return (
                            <div key={setting.key}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {meta.label}
                                {meta.labelBn && <span className="ml-1 text-gray-400 font-normal text-xs">/ {meta.labelBn}</span>}
                              </label>
                              {meta.description && (
                                <p className="text-xs text-gray-400 mb-1">{meta.description}</p>
                              )}
                              <input
                                value={value}
                                onChange={(e) => handleChange(setting.key, e.target.value)}
                                disabled={!canEdit}
                                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:opacity-70"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}

              {isDirty && canEdit && (
                <div className="sticky bottom-4 flex justify-end">
                  <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
                    <p className="text-sm text-gray-600">Unsaved changes</p>
                    <Button variant="outline" size="sm" onClick={() => {
                      const initial: Record<string, string> = {};
                      (settings ?? []).forEach((s: any) => { initial[s.key] = s.value; });
                      setLocalValues(initial);
                      setIsDirty(false);
                    }}>Discard</Button>
                    <Button variant="primary" size="sm" loading={bulkUpdate.isPending} onClick={handleSave}>
                      Save All Changes
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'numbering' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Configure numbering sequences for invoices, purchase orders, and other documents.
              </p>
              {seqLoading ? (
                <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />)}</div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Module</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Prefix</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Separator</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Padding</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Current No.</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Preview</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(sequences ?? []).map((seq: any) => {
                        const preview = `${seq.prefix}${seq.separator}${String(seq.currentNo + 1).padStart(seq.padding, '0')}${seq.suffix ?? ''}`;
                        return (
                          <tr key={seq.module} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-800">{seq.module}</p>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                defaultValue={seq.prefix}
                                onBlur={(e) => canEdit && handleUpdateSequence(seq.module, 'prefix', e.target.value)}
                                disabled={!canEdit}
                                className="w-20 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                defaultValue={seq.separator}
                                onBlur={(e) => canEdit && handleUpdateSequence(seq.module, 'separator', e.target.value)}
                                disabled={!canEdit}
                                className="w-12 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                defaultValue={seq.padding}
                                onBlur={(e) => canEdit && handleUpdateSequence(seq.module, 'padding', e.target.value)}
                                disabled={!canEdit}
                                className="w-16 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-gray-600 font-mono text-xs">{seq.currentNo}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-mono bg-green-50 text-green-700 px-2 py-1 rounded">
                                {preview}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
