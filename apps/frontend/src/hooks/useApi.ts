'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { ApiResponse, PaginationMeta } from '@/types';
import toast from 'react-hot-toast';

// Generic paginated fetch
export function usePaginatedList<T>(
  key: string[],
  url: string,
  params?: Record<string, unknown>,
  enabled = true,
) {
  return useQuery({
    queryKey: [...key, params],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<T[]>>(url, { params });
      return res.data;
    },
    enabled,
  });
}

// Generic single-item fetch
export function useDetail<T>(key: string[], url: string, enabled = true) {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<T>>(url);
      return res.data.data;
    },
    enabled,
  });
}

// Generic mutation with toast feedback
export function useApiMutation<TData, TPayload>(
  url: string,
  method: 'post' | 'patch' | 'delete' = 'post',
  options?: {
    successMessage?: string;
    successMessageBn?: string;
    invalidateKeys?: string[][];
    onSuccess?: (data: TData) => void;
  },
) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: TPayload) => {
      const res = await apiClient[method]<ApiResponse<TData>>(url, payload);
      return res.data.data;
    },
    onSuccess: (data) => {
      if (options?.successMessage) {
        toast.success(options.successMessage);
      }
      options?.invalidateKeys?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      options?.onSuccess?.(data);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.messagebn ||
        'An error occurred';
      toast.error(msg);
    },
  });
}
