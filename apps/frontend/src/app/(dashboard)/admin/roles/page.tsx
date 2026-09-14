'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useRoles, usePermissions, useAssignRolePermissions } from '@/hooks/useAdmin';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const MODULE_LABELS: Record<string, { label: string; labelBn: string; color: string }> = {
  users:      { label: 'Users',       labelBn: 'ব্যবহারকারী', color: 'bg-purple-50 border-purple-200' },
  products:   { label: 'Products',    labelBn: 'পণ্য',         color: 'bg-blue-50 border-blue-200' },
  categories: { label: 'Categories',  labelBn: 'ক্যাটাগরি',    color: 'bg-indigo-50 border-indigo-200' },
  sales:      { label: 'Sales',       labelBn: 'বিক্রয়',       color: 'bg-green-50 border-green-200' },
  purchases:  { label: 'Purchases',   labelBn: 'ক্রয়',          color: 'bg-teal-50 border-teal-200' },
  suppliers:  { label: 'Suppliers',   labelBn: 'সরবরাহকারী',   color: 'bg-cyan-50 border-cyan-200' },
  customers:  { label: 'Customers',   labelBn: 'গ্রাহক',        color: 'bg-sky-50 border-sky-200' },
  inventory:  { label: 'Inventory',   labelBn: 'ইনভেন্টরি',    color: 'bg-lime-50 border-lime-200' },
  accounting: { label: 'Accounting',  labelBn: 'হিসাব',         color: 'bg-yellow-50 border-yellow-200' },
  expenses:   { label: 'Expenses',    labelBn: 'খরচ',           color: 'bg-orange-50 border-orange-200' },
  reports:    { label: 'Reports',     labelBn: 'রিপোর্ট',       color: 'bg-red-50 border-red-200' },
  investments:{ label: 'Investments', labelBn: 'বিনিয়োগ',      color: 'bg-rose-50 border-rose-200' },
  settings:   { label: 'Settings',    labelBn: 'সেটিংস',        color: 'bg-gray-50 border-gray-200' },
  branches:   { label: 'Branches',    labelBn: 'শাখা',           color: 'bg-slate-50 border-slate-200' },
  cash:       { label: 'Cash Register',labelBn: 'ক্যাশ রেজিস্টার',color: 'bg-emerald-50 border-emerald-200' },
};

export default function RolesPage() {
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('users:manage:roles');

  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: permissionsGrouped } = usePermissions();

  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [editPermsOpen, setEditPermsOpen] = useState(false);
  const [editingPermIds, setEditingPermIds] = useState<string[]>([]);

  const assignPerms = useAssignRolePermissions(selectedRole?.id ?? '');

  const openEditPerms = (role: any) => {
    setSelectedRole(role);
    setEditingPermIds(role.rolePermissions?.map((rp: any) => rp.permissionId) ?? []);
    setEditPermsOpen(true);
  };

  const handleSavePerms = async () => {
    try {
      await assignPerms.mutateAsync(editingPermIds);
      setEditPermsOpen(false);
    } catch {}
  };

  const togglePerm = (permId: string) => {
    setEditingPermIds(prev =>
      prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
    );
  };

  const toggleModule = (module: string, perms: any[]) => {
    const modulePermIds = perms.map((p: any) => p.id);
    const allSelected = modulePermIds.every((id: string) => editingPermIds.includes(id));
    if (allSelected) {
      setEditingPermIds(prev => prev.filter(id => !modulePermIds.includes(id)));
    } else {
      const merged = [...editingPermIds, ...modulePermIds];
      const unique = merged.filter((v, i) => merged.indexOf(v) === i);
      setEditingPermIds(unique);
    }
  };

  const ROLE_COLORS: Record<string, string> = {
    SUPER_ADMIN: 'from-purple-500 to-purple-700',
    OWNER: 'from-blue-500 to-blue-700',
    MANAGER: 'from-indigo-500 to-indigo-700',
    CASHIER: 'from-green-500 to-green-700',
    INVENTORY_STAFF: 'from-yellow-500 to-yellow-700',
    ACCOUNTANT: 'from-orange-500 to-orange-700',
    VIEWER: 'from-gray-400 to-gray-600',
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Roles & Permissions"
        titleBn="ভূমিকা ও অনুমতি"
        description="Manage system roles and their permission assignments."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Roles' }]}
      />

      <div className="p-6 space-y-6 flex-1 overflow-auto">
        {rolesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6,7].map(i => <div key={i} className="h-48 bg-gray-100 animate-pulse rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(roles ?? []).map((role: any) => {
              const permCount = role.rolePermissions?.length ?? 0;
              const userCount = role._count?.userRoles ?? 0;
              const gradient = ROLE_COLORS[role.name] ?? 'from-gray-500 to-gray-700';

              return (
                <div key={role.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className={cn('h-2 bg-gradient-to-r', gradient)} />
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">
                          {role.name.replace(/_/g, ' ')}
                        </h3>
                        {role.nameBn && <p className="text-xs text-gray-500">{role.nameBn}</p>}
                        {role.description && <p className="text-xs text-gray-400 mt-1">{role.description}</p>}
                      </div>
                      {role.isSystem && (
                        <Badge variant="blue" size="sm">System</Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-4">
                      <div className="text-center">
                        <p className="text-lg font-bold text-gray-900">{permCount}</p>
                        <p className="text-xs text-gray-500">Permissions</p>
                      </div>
                      <div className="w-px h-8 bg-gray-200" />
                      <div className="text-center">
                        <p className="text-lg font-bold text-gray-900">{userCount}</p>
                        <p className="text-xs text-gray-500">Users</p>
                      </div>
                    </div>

                    {/* Permission preview */}
                    <div className="mt-3 flex flex-wrap gap-1">
                      {role.rolePermissions?.slice(0, 4).map((rp: any) => (
                        <span key={rp.id} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {rp.permission.module}:{rp.permission.action}
                        </span>
                      ))}
                      {permCount > 4 && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          +{permCount - 4} more
                        </span>
                      )}
                    </div>

                    {canManage && (
                      <button
                        onClick={() => openEditPerms(role)}
                        className="mt-4 w-full text-sm text-center py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
                      >
                        Edit Permissions / অনুমতি সম্পাদনা
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Permissions Modal */}
      <Modal
        open={editPermsOpen}
        onClose={() => setEditPermsOpen(false)}
        title={`Permissions — ${selectedRole?.name?.replace(/_/g, ' ')}`}
        titleBn="অনুমতি সম্পাদনা"
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditPermsOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={assignPerms.isPending} onClick={handleSavePerms}>
              Save Permissions
            </Button>
          </>
        }
      >
        {selectedRole && permissionsGrouped && (
          <div className="space-y-4">
            {selectedRole.isSystem && ['SUPER_ADMIN', 'OWNER'].includes(selectedRole.name) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                ⚠️ This is a system-level role with full access. Changes will affect all users with this role.
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Selected: <strong>{editingPermIds.length}</strong> permissions
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingPermIds(Object.values(permissionsGrouped).flat().map((p: any) => p.id))}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Select All
                </button>
                <button onClick={() => setEditingPermIds([])} className="text-xs text-gray-500 hover:underline">
                  Clear All
                </button>
              </div>
            </div>
            {Object.entries(permissionsGrouped).map(([module, perms]: [string, any]) => {
              const meta = MODULE_LABELS[module] ?? { label: module, labelBn: module, color: 'bg-gray-50 border-gray-200' };
              const allSelected = (perms as any[]).every((p: any) => editingPermIds.includes(p.id));
              const someSelected = (perms as any[]).some((p: any) => editingPermIds.includes(p.id));
              return (
                <div key={module} className={cn('rounded-lg border p-4', meta.color)}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                        onChange={() => toggleModule(module, perms)}
                        className="w-4 h-4 rounded text-green-600"
                      />
                      <h4 className="text-sm font-semibold text-gray-800">{meta.label}</h4>
                      <span className="text-xs text-gray-500">/ {meta.labelBn}</span>
                    </div>
                    <span className="text-xs text-gray-400">{(perms as any[]).length} permissions</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(perms as any[]).map((perm: any) => (
                      <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingPermIds.includes(perm.id)}
                          onChange={() => togglePerm(perm.id)}
                          className="w-3.5 h-3.5 rounded text-green-600"
                        />
                        <span className="text-xs text-gray-700 font-mono">
                          {perm.action}:{perm.resource}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
