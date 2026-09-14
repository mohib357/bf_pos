'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { PageHeader, SearchBar } from '@/components/ui/PageHeader';
import { Table, Pagination } from '@/components/ui/Table';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge, UserStatusBadge, RoleBadge } from '@/components/ui/Badge';
import {
  useUsers, useCreateUser, useUpdateUser, useToggleUserStatus,
  useAssignRoles, useAdminResetPassword, useDeleteUser, useRoles,
} from '@/hooks/useAdmin';
import { useAuthStore } from '@/store/auth.store';
import { formatDateTime } from '@/lib/utils';

const createSchema = z.object({
  username: z.string().min(3, 'Min 3 characters'),
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  password: z.string().min(8, 'Min 8 characters').regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Needs upper, lower, number'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
});

const editSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
});

const resetPwdSchema = z.object({
  newPassword: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Needs upper, lower, number'),
  mustChangePwd: z.boolean().optional(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;
type ResetForm = z.infer<typeof resetPwdSchema>;

export default function UsersPage() {
  const { hasPermission } = useAuthStore();
  const canCreate = hasPermission('users:create:users');
  const canEdit = hasPermission('users:update:users');
  const canManageRoles = hasPermission('users:manage:roles');
  const canDelete = hasPermission('users:delete:users');

  // Filter state
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [rolesUser, setRolesUser] = useState<any>(null);
  const [resetPwdUser, setResetPwdUser] = useState<any>(null);
  const [deleteUser, setDeleteUser] = useState<any>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  // Queries
  const { data, isLoading } = useUsers({ page, limit: 15, search, status: statusFilter || undefined });
  const { data: rolesData } = useRoles();
  const roles: any[] = rolesData ?? [];

  const users: any[] = data?.data ?? [];
  const meta = data?.meta;

  // Mutations
  const createUser = useCreateUser();
  const deleteUserMut = useDeleteUser(deleteUser?.id ?? '');

  // Forms
  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) });
  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });
  const resetForm = useForm<ResetForm>({ resolver: zodResolver(resetPwdSchema) });

  const handleCreate = async (data: CreateForm) => {
    try {
      await createUser.mutateAsync(data);
      setCreateOpen(false);
      createForm.reset();
    } catch {}
  };

  const handleEdit = async (data: EditForm) => {
    if (!editUser) return;
    try {
      const mut = useUpdateUser(editUser.id);
      // We can't call hooks conditionally so we use apiClient directly here
      const apiClient = (await import('@/lib/api')).default;
      await apiClient.patch(`/users/${editUser.id}`, data);
      const { useQueryClient } = await import('@tanstack/react-query');
      // invalidate via toast-driven refresh
      toast.success('User updated');
      setEditUser(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed');
    }
  };

  const handleResetPwd = async (data: ResetForm) => {
    if (!resetPwdUser) return;
    try {
      const apiClient = (await import('@/lib/api')).default;
      await apiClient.post(`/auth/users/${resetPwdUser.id}/reset-password`, data);
      toast.success('Password reset');
      setResetPwdUser(null);
      resetForm.reset();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed');
    }
  };

  const handleAssignRoles = async () => {
    if (!rolesUser) return;
    try {
      const apiClient = (await import('@/lib/api')).default;
      await apiClient.post(`/users/${rolesUser.id}/roles`, { roleIds: selectedRoleIds });
      toast.success('Roles assigned');
      setRolesUser(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed');
    }
  };

  const handleToggleStatus = async (user: any, status: string) => {
    try {
      const apiClient = (await import('@/lib/api')).default;
      await apiClient.patch(`/users/${user.id}/status`, { status });
      toast.success('Status updated');
      // Refetch by changing page
      setPage(p => p);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed');
    }
  };

  const columns = [
    {
      key: 'user',
      header: 'User', headerBn: 'ব্যবহারকারী',
      render: (row: any) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {row.firstName?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{row.firstName} {row.lastName}</p>
            <p className="text-xs text-gray-500">@{row.username}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact', headerBn: 'যোগাযোগ',
      render: (row: any) => (
        <div>
          <p className="text-xs text-gray-600">{row.email ?? '—'}</p>
          <p className="text-xs text-gray-400">{row.phone ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles', headerBn: 'ভূমিকা',
      render: (row: any) => (
        <div className="flex flex-wrap gap-1">
          {row.userRoles?.slice(0, 2).map((ur: any) => (
            <RoleBadge key={ur.id} role={ur.role.name} />
          ))}
          {row.userRoles?.length > 2 && (
            <Badge variant="gray">+{row.userRoles.length - 2}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status', headerBn: 'স্ট্যাটাস',
      render: (row: any) => <UserStatusBadge status={row.status} />,
    },
    {
      key: 'lastLogin',
      header: 'Last Login', headerBn: 'শেষ লগইন',
      render: (row: any) => (
        <span className="text-xs text-gray-500">
          {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions', headerBn: 'কার্যক্রম',
      align: 'right' as const,
      render: (row: any) => (
        <div className="flex items-center justify-end gap-1">
          {canEdit && (
            <button
              onClick={() => { setEditUser(row); editForm.reset({ firstName: row.firstName, lastName: row.lastName, email: row.email, phone: row.phone, status: row.status }); }}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
              title="Edit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
          )}
          {canManageRoles && (
            <button
              onClick={() => { setRolesUser(row); setSelectedRoleIds(row.userRoles?.map((ur: any) => ur.roleId) ?? []); }}
              className="p-1.5 rounded hover:bg-blue-50 text-blue-500"
              title="Assign Roles"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => { setResetPwdUser(row); resetForm.reset(); }}
              className="p-1.5 rounded hover:bg-yellow-50 text-yellow-600"
              title="Reset Password"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
            </button>
          )}
          {canEdit && row.status === 'ACTIVE' && (
            <button
              onClick={() => handleToggleStatus(row, 'SUSPENDED')}
              className="p-1.5 rounded hover:bg-red-50 text-red-500"
              title="Suspend"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            </button>
          )}
          {canEdit && row.status !== 'ACTIVE' && (
            <button
              onClick={() => handleToggleStatus(row, 'ACTIVE')}
              className="p-1.5 rounded hover:bg-green-50 text-green-500"
              title="Activate"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setDeleteUser(row)}
              className="p-1.5 rounded hover:bg-red-50 text-red-500"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="User Management"
        titleBn="ব্যবহারকারী ব্যবস্থাপনা"
        description="Manage all system users, roles and access."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users' }]}
        actions={
          canCreate && (
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add User / ব্যবহারকারী যোগ
            </Button>
          )
        }
      />

      <div className="p-6 flex-1 overflow-auto space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search by name, username, email..."
            className="w-64"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
          <div className="ml-auto text-xs text-gray-500">
            {meta?.total ?? 0} users total
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <Table columns={columns} data={users} keyField="id" loading={isLoading} />
          {meta && meta.totalPages > 1 && (
            <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPageChange={setPage} />
          )}
        </div>
      </div>

      {/* Create User Modal */}
      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); createForm.reset(); }}
        title="Create New User"
        titleBn="নতুন ব্যবহারকারী তৈরি করুন"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={createUser.isPending} onClick={createForm.handleSubmit(handleCreate)}>
              Create User
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input {...createForm.register('username')} label="Username" labelBn="ব্যবহারকারীর নাম" placeholder="e.g. john_doe" error={createForm.formState.errors.username?.message} />
          <Input {...createForm.register('password')} type="password" label="Password" labelBn="পাসওয়ার্ড" placeholder="Min 8 chars" error={createForm.formState.errors.password?.message} />
          <Input {...createForm.register('firstName')} label="First Name" labelBn="প্রথম নাম" error={createForm.formState.errors.firstName?.message} />
          <Input {...createForm.register('lastName')} label="Last Name" labelBn="শেষ নাম" />
          <Input {...createForm.register('email')} type="email" label="Email" labelBn="ইমেইল" placeholder="optional" />
          <Input {...createForm.register('phone')} label="Phone" labelBn="ফোন" placeholder="optional" />
          <Select
            {...createForm.register('gender')}
            label="Gender" labelBn="লিঙ্গ"
            options={[{ value: 'MALE', label: 'Male / পুরুষ' }, { value: 'FEMALE', label: 'Female / মহিলা' }, { value: 'OTHER', label: 'Other' }]}
            placeholder="Select gender"
          />
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title="Edit User"
        titleBn="ব্যবহারকারী সম্পাদনা"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button variant="primary" onClick={editForm.handleSubmit(handleEdit)}>Save Changes</Button>
          </>
        }
      >
        {editUser && (
          <div className="grid grid-cols-2 gap-4">
            <Input {...editForm.register('firstName')} label="First Name" labelBn="প্রথম নাম" error={editForm.formState.errors.firstName?.message} />
            <Input {...editForm.register('lastName')} label="Last Name" labelBn="শেষ নাম" />
            <Input {...editForm.register('email')} type="email" label="Email" labelBn="ইমেইল" />
            <Input {...editForm.register('phone')} label="Phone" labelBn="ফোন" />
            <Select
              {...editForm.register('status')}
              label="Status" labelBn="স্ট্যাটাস"
              options={[
                { value: 'ACTIVE', label: 'Active / সক্রিয়' },
                { value: 'INACTIVE', label: 'Inactive / নিষ্ক্রিয়' },
                { value: 'SUSPENDED', label: 'Suspended / স্থগিত' },
              ]}
            />
          </div>
        )}
      </Modal>

      {/* Assign Roles Modal */}
      <Modal
        open={!!rolesUser}
        onClose={() => setRolesUser(null)}
        title="Assign Roles"
        titleBn="ভূমিকা নির্ধারণ করুন"
        footer={
          <>
            <Button variant="outline" onClick={() => setRolesUser(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleAssignRoles}>Save Roles</Button>
          </>
        }
      >
        {rolesUser && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Assigning roles to: <strong>{rolesUser.firstName} {rolesUser.lastName}</strong> (@{rolesUser.username})
            </p>
            <div className="space-y-2">
              {roles.map((role: any) => (
                <label key={role.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRoleIds.includes(role.id)}
                    onChange={(e) => {
                      setSelectedRoleIds(prev =>
                        e.target.checked ? [...prev, role.id] : prev.filter(id => id !== role.id)
                      );
                    }}
                    className="w-4 h-4 rounded text-green-600 border-gray-300 focus:ring-green-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{role.name.replace(/_/g, ' ')}</p>
                    {role.nameBn && <p className="text-xs text-gray-500">{role.nameBn}</p>}
                    {role.description && <p className="text-xs text-gray-400">{role.description}</p>}
                  </div>
                  <span className="ml-auto text-xs text-gray-400">{role._count?.userRoles ?? 0} users</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        open={!!resetPwdUser}
        onClose={() => { setResetPwdUser(null); resetForm.reset(); }}
        title="Reset User Password"
        titleBn="পাসওয়ার্ড রিসেট করুন"
        footer={
          <>
            <Button variant="outline" onClick={() => setResetPwdUser(null)}>Cancel</Button>
            <Button variant="danger" onClick={resetForm.handleSubmit(handleResetPwd)}>Reset Password</Button>
          </>
        }
      >
        {resetPwdUser && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Resetting password for: <strong>{resetPwdUser.firstName} {resetPwdUser.lastName}</strong>
            </p>
            <Input {...resetForm.register('newPassword')} type="password" label="New Password" labelBn="নতুন পাসওয়ার্ড" error={resetForm.formState.errors.newPassword?.message} />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" {...resetForm.register('mustChangePwd')} defaultChecked className="rounded" />
              Force user to change password on next login / পরবর্তী লগইনে পরিবর্তন বাধ্যতামূলক
            </label>
          </div>
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        onConfirm={async () => { await deleteUserMut.mutateAsync(); setDeleteUser(null); }}
        title="Delete User"
        message={`Are you sure you want to delete user "${deleteUser?.username}"? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteUserMut.isPending}
      />
    </div>
  );
}
