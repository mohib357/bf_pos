'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { useBranches, useCreateBranch, useUpdateBranch, useWarehouses, useCreateWarehouse } from '@/hooks/useAdmin';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

const branchSchema = z.object({
  name: z.string().min(1, 'Required'),
  nameBn: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  isMain: z.boolean().optional(),
});

const warehouseSchema = z.object({
  name: z.string().min(1, 'Required'),
  nameBn: z.string().optional(),
  address: z.string().optional(),
  isDefault: z.boolean().optional(),
});

type BranchForm = z.infer<typeof branchSchema>;
type WarehouseForm = z.infer<typeof warehouseSchema>;

export default function BranchesPage() {
  const { hasPermission } = useAuthStore();
  const canCreate = hasPermission('branches:create:branches');
  const canEdit = hasPermission('branches:update:branches');

  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [editBranchOpen, setEditBranchOpen] = useState(false);
  const [createWhOpen, setCreateWhOpen] = useState(false);

  const { data: branches, isLoading } = useBranches();
  const { data: warehouses } = useWarehouses(selectedBranch?.id);
  const createBranch = useCreateBranch();
  const createWarehouse = useCreateWarehouse();

  const branchForm = useForm<BranchForm>({ resolver: zodResolver(branchSchema) });
  const editBranchForm = useForm<BranchForm>({ resolver: zodResolver(branchSchema) });
  const whForm = useForm<WarehouseForm>({ resolver: zodResolver(warehouseSchema) });

  const handleCreateBranch = async (data: BranchForm) => {
    try {
      await createBranch.mutateAsync(data);
      setCreateBranchOpen(false);
      branchForm.reset();
    } catch {}
  };

  const handleEditBranch = async (data: BranchForm) => {
    if (!editBranchOpen || !selectedBranch) return;
    try {
      const { default: apiClient } = await import('@/lib/api');
      await apiClient.patch(`/admin/branches/${selectedBranch.id}`, data);
      const toast = (await import('react-hot-toast')).default;
      toast.success('Branch updated');
      setEditBranchOpen(false);
    } catch (err: any) {
      const toast = (await import('react-hot-toast')).default;
      toast.error(err?.response?.data?.message || 'Failed');
    }
  };

  const handleCreateWarehouse = async (data: WarehouseForm) => {
    if (!selectedBranch) return;
    try {
      await createWarehouse.mutateAsync({ ...data, branchId: selectedBranch.id });
      setCreateWhOpen(false);
      whForm.reset();
    } catch {}
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Branches & Warehouses"
        titleBn="শাখা ও গুদাম"
        description="Manage business branches and their warehouses."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Admin' }, { label: 'Branches' }]}
        actions={
          canCreate && (
            <Button variant="primary" size="sm" onClick={() => setCreateBranchOpen(true)}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Branch
            </Button>
          )
        }
      />

      <div className="p-6 flex-1 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Branches list */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Branches / শাখা</h2>
            {isLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />)}</div>
            ) : (
              <div className="space-y-3">
                {(branches ?? []).map((branch: any) => (
                  <div
                    key={branch.id}
                    onClick={() => setSelectedBranch(branch)}
                    className={cn(
                      'bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all',
                      selectedBranch?.id === branch.id ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-200',
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900">{branch.name}</h3>
                          {branch.isMain && <Badge variant="green">Main</Badge>}
                          <Badge variant={branch.status === 'ACTIVE' ? 'green' : 'gray'}>
                            {branch.status}
                          </Badge>
                        </div>
                        {branch.nameBn && <p className="text-xs text-gray-500">{branch.nameBn}</p>}
                        <p className="text-xs text-gray-400 mt-1">Code: {branch.code}</p>
                        {branch.address && <p className="text-xs text-gray-400">{branch.address}</p>}
                      </div>
                      <div className="text-right text-xs text-gray-500 shrink-0">
                        <p>{branch._count?.users ?? 0} users</p>
                        <p>{branch.warehouses?.length ?? 0} warehouses</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      {branch.phone && (
                        <span className="text-xs text-gray-500">📞 {branch.phone}</span>
                      )}
                      {branch.email && (
                        <span className="text-xs text-gray-500">✉️ {branch.email}</span>
                      )}
                      {canEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBranch(branch);
                            editBranchForm.reset({ name: branch.name, nameBn: branch.nameBn, address: branch.address, city: branch.city, phone: branch.phone, email: branch.email });
                            setEditBranchOpen(true);
                          }}
                          className="ml-auto text-xs text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {(branches ?? []).length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
                    No branches yet
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Warehouses */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">
                Warehouses / গুদাম
                {selectedBranch && <span className="text-green-600 ml-1">— {selectedBranch.name}</span>}
              </h2>
              {selectedBranch && canCreate && (
                <Button variant="outline" size="sm" onClick={() => setCreateWhOpen(true)}>
                  + Add Warehouse
                </Button>
              )}
            </div>

            {!selectedBranch ? (
              <div className="flex items-center justify-center h-40 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <p className="text-sm text-gray-400">Select a branch to view warehouses</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(warehouses ?? []).map((wh: any) => (
                  <div key={wh.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900">{wh.name}</h3>
                          {wh.isDefault && <Badge variant="green">Default</Badge>}
                          {!wh.isActive && <Badge variant="gray">Inactive</Badge>}
                        </div>
                        {wh.nameBn && <p className="text-xs text-gray-500">{wh.nameBn}</p>}
                        <p className="text-xs text-gray-400">Code: {wh.code}</p>
                        {wh.address && <p className="text-xs text-gray-400">{wh.address}</p>}
                      </div>
                      <span className="text-xs text-gray-400">{wh._count?.productStocks ?? 0} products</span>
                    </div>
                  </div>
                ))}
                {(warehouses ?? []).length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
                    No warehouses in this branch
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Branch Modal */}
      <Modal
        open={createBranchOpen}
        onClose={() => { setCreateBranchOpen(false); branchForm.reset(); }}
        title="Create Branch" titleBn="নতুন শাখা তৈরি"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateBranchOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={createBranch.isPending} onClick={branchForm.handleSubmit(handleCreateBranch)}>
              Create Branch
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input {...branchForm.register('name')} label="Branch Name" labelBn="শাখার নাম" error={branchForm.formState.errors.name?.message} />
          <Input {...branchForm.register('nameBn')} label="Name (Bangla)" labelBn="নাম (বাংলা)" />
          <Input {...branchForm.register('address')} label="Address" labelBn="ঠিকানা" />
          <Input {...branchForm.register('city')} label="City" labelBn="শহর" />
          <Input {...branchForm.register('phone')} label="Phone" labelBn="ফোন" />
          <Input {...branchForm.register('email')} type="email" label="Email" labelBn="ইমেইল" />
        </div>
      </Modal>

      {/* Edit Branch Modal */}
      <Modal
        open={editBranchOpen}
        onClose={() => setEditBranchOpen(false)}
        title="Edit Branch" titleBn="শাখা সম্পাদনা"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditBranchOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={editBranchForm.handleSubmit(handleEditBranch)}>Save</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input {...editBranchForm.register('name')} label="Branch Name" labelBn="শাখার নাম" />
          <Input {...editBranchForm.register('nameBn')} label="Name (Bangla)" labelBn="নাম (বাংলা)" />
          <Input {...editBranchForm.register('address')} label="Address" labelBn="ঠিকানা" />
          <Input {...editBranchForm.register('city')} label="City" labelBn="শহর" />
          <Input {...editBranchForm.register('phone')} label="Phone" labelBn="ফোন" />
          <Input {...editBranchForm.register('email')} type="email" label="Email" labelBn="ইমেইল" />
        </div>
      </Modal>

      {/* Create Warehouse Modal */}
      <Modal
        open={createWhOpen}
        onClose={() => { setCreateWhOpen(false); whForm.reset(); }}
        title="Add Warehouse" titleBn="গুদাম যোগ"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateWhOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={createWarehouse.isPending} onClick={whForm.handleSubmit(handleCreateWarehouse)}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input {...whForm.register('name')} label="Warehouse Name" labelBn="গুদামের নাম" error={whForm.formState.errors.name?.message} />
          <Input {...whForm.register('nameBn')} label="Name (Bangla)" labelBn="নাম (বাংলা)" />
          <Input {...whForm.register('address')} label="Address" labelBn="ঠিকানা" />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" {...whForm.register('isDefault')} className="rounded" />
            Set as default warehouse
          </label>
        </div>
      </Modal>
    </div>
  );
}
