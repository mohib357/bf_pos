'use client';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function useRequireAuth() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  return isAuthenticated;
}

export function usePermission(permission: string): boolean {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  return hasPermission(permission);
}
