'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import toast from 'react-hot-toast';

// ─── Dashboard ────────────────────────────────────────────────────────

export function useAdminDashboard() {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => apiClient.get('/admin/dashboard').then(r => r.data.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

// ─── Users ────────────────────────────────────────────────────────────

export function useUsers(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => apiClient.get('/users', { params }).then(r => r.data),
    staleTime: 10_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiClient.post('/users', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('User created / ব্যবহারকারী তৈরি হয়েছে');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to create user');
    },
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiClient.patch(`/users/${id}`, data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('User updated / ব্যবহারকারী আপডেট হয়েছে');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to update user'),
  });
}

export function useToggleUserStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') =>
      apiClient.patch(`/users/${id}/status`, { status }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Status updated / স্ট্যাটাস আপডেট হয়েছে');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

export function useAssignRoles(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { roleIds: string[]; branchId?: string }) =>
      apiClient.post(`/users/${id}/roles`, data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Roles assigned / ভূমিকা নির্ধারিত হয়েছে');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

export function useAdminResetPassword(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { newPassword: string; mustChangePwd?: boolean }) =>
      apiClient.post(`/auth/users/${userId}/reset-password`, data).then(r => r.data.data),
    onSuccess: () => {
      toast.success('Password reset / পাসওয়ার্ড রিসেট হয়েছে');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

export function useDeleteUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/users/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deleted / মুছে ফেলা হয়েছে');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

// ─── Roles ────────────────────────────────────────────────────────────

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => apiClient.get('/roles').then(r => r.data.data),
    staleTime: 30_000,
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: () => apiClient.get('/roles/permissions').then(r => r.data.data),
    staleTime: 60_000,
  });
}

export function useAssignRolePermissions(roleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (permissionIds: string[]) =>
      apiClient.post(`/roles/${roleId}/permissions`, { permissionIds }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Permissions updated / অনুমতি আপডেট হয়েছে');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

// ─── Branches ─────────────────────────────────────────────────────────

export function useBranches() {
  return useQuery({
    queryKey: ['admin', 'branches'],
    queryFn: () => apiClient.get('/admin/branches').then(r => r.data.data),
    staleTime: 30_000,
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiClient.post('/admin/branches', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'branches'] });
      toast.success('Branch created / শাখা তৈরি হয়েছে');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

export function useUpdateBranch(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiClient.patch(`/admin/branches/${id}`, data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'branches'] });
      toast.success('Branch updated / শাখা আপডেট হয়েছে');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

export function useWarehouses(branchId?: string) {
  return useQuery({
    queryKey: ['admin', 'warehouses', branchId],
    queryFn: () => apiClient.get('/admin/warehouses', { params: branchId ? { branchId } : {} }).then(r => r.data.data),
    staleTime: 30_000,
  });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiClient.post('/admin/warehouses', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'warehouses'] });
      toast.success('Warehouse created / গুদাম তৈরি হয়েছে');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

// ─── Settings ─────────────────────────────────────────────────────────

export function useSettings(group?: string) {
  return useQuery({
    queryKey: ['admin', 'settings', group],
    queryFn: () => apiClient.get('/admin/settings', { params: group ? { group } : {} }).then(r => r.data.data),
    staleTime: 60_000,
  });
}

export function useBulkUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: { key: string; value: string }[]) =>
      apiClient.patch('/admin/settings', { settings }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.success('Settings saved / সেটিংস সংরক্ষিত হয়েছে');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

export function useSequences() {
  return useQuery({
    queryKey: ['admin', 'numbering'],
    queryFn: () => apiClient.get('/admin/numbering').then(r => r.data.data),
    staleTime: 60_000,
  });
}

// ─── Audit Logs ────────────────────────────────────────────────────────

export function useAuditLogs(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['admin', 'audit-logs', params],
    queryFn: () => apiClient.get('/admin/audit-logs', { params }).then(r => r.data),
    staleTime: 10_000,
  });
}
