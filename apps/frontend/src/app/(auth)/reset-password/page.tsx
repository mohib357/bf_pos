'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Suspense } from 'react';

const schema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Must contain uppercase, lowercase and number'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((d) => d.newPassword === d.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match',
});
type FormData = z.infer<typeof schema>;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') ?? '';
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { token: tokenFromUrl },
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      await apiClient.post('/auth/reset-password', { token: data.token, newPassword: data.newPassword });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid or expired token. Please request a new one.');
    }
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Password Reset!</h2>
        <p className="text-sm text-gray-500">
          Your password has been reset successfully. Redirecting to login...
        </p>
        <p className="text-xs text-gray-400">পাসওয়ার্ড সফলভাবে রিসেট হয়েছে। লগইন পেজে যাচ্ছেন...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Input
        {...register('token')}
        label="Reset Token"
        labelBn="রিসেট টোকেন"
        placeholder="Paste your reset token here"
        error={errors.token?.message}
      />

      <div className="relative">
        <Input
          {...register('newPassword')}
          type={showPwd ? 'text' : 'password'}
          label="New Password"
          labelBn="নতুন পাসওয়ার্ড"
          placeholder="Minimum 8 characters"
          autoComplete="new-password"
          error={errors.newPassword?.message}
        />
        <button
          type="button"
          onClick={() => setShowPwd(v => !v)}
          className="absolute right-3 top-[2.1rem] text-gray-400 hover:text-gray-600"
          tabIndex={-1}
        >
          {showPwd ? '🙈' : '👁️'}
        </button>
      </div>

      <Input
        {...register('confirmPassword')}
        type={showPwd ? 'text' : 'password'}
        label="Confirm Password"
        labelBn="পাসওয়ার্ড নিশ্চিত করুন"
        placeholder="Repeat your new password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
      />

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        Password requirements: Minimum 8 characters, at least one uppercase, one lowercase, one number.
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
        Reset Password / পাসওয়ার্ড রিসেট করুন
      </Button>

      <div className="text-center">
        <Link href="/forgot-password" className="text-sm text-gray-500 hover:text-gray-700">
          ← Request new token
        </Link>
        <span className="mx-2 text-gray-300">|</span>
        <Link href="/login" className="text-sm text-green-600 hover:text-green-700">
          Back to Login
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 opacity-5 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-green-400 via-green-500 to-emerald-600" />
          <div className="px-8 py-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-700 rounded-2xl shadow-lg mb-4">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Reset Password</h1>
              <p className="text-sm text-gray-500 mt-1">নতুন পাসওয়ার্ড সেট করুন</p>
            </div>
            <Suspense fallback={<div className="h-40 animate-pulse bg-gray-50 rounded-xl" />}>
              <ResetPasswordForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
