'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import apiClient from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const schema = z.object({
  identifier: z.string().min(1, 'Please enter your username, email, or phone'),
});
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      const res = await apiClient.post('/auth/forgot-password', { identifier: data.identifier });
      setSubmitted(true);
      // In non-production, backend returns the token directly
      if (res.data?.data?.resetToken) {
        setResetToken(res.data.data.resetToken);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Something went wrong. Please try again.');
    }
  };

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
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Forgot Password</h1>
              <p className="text-sm text-gray-500 mt-1">পাসওয়ার্ড ভুলে গেছেন?</p>
            </div>

            {!submitted ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <Input
                  {...register('identifier')}
                  label="Username / Email / Phone"
                  labelBn="ব্যবহারকারীর নাম / ইমেইল / ফোন"
                  placeholder="Enter your username, email or phone"
                  autoFocus
                  error={errors.identifier?.message}
                />

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
                  Send Reset Token / রিসেট টোকেন পাঠান
                </Button>

                <div className="text-center">
                  <Link href="/login" className="text-sm text-green-600 hover:text-green-700">
                    ← Back to Login / লগইনে ফিরুন
                  </Link>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <svg className="w-8 h-8 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-semibold text-green-800">Token Generated!</p>
                  <p className="text-xs text-green-600 mt-1">
                    If a matching account was found, a reset token has been generated.
                  </p>
                </div>

                {resetToken && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-yellow-800 mb-1">
                      Demo Token (development only):
                    </p>
                    <code className="text-xs font-mono text-yellow-700 break-all block bg-yellow-100 px-2 py-1.5 rounded">
                      {resetToken}
                    </code>
                  </div>
                )}

                <Link
                  href={resetToken ? `/reset-password?token=${resetToken}` : '/reset-password'}
                  className="block w-full text-center py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Reset Password →
                </Link>
                <div className="text-center">
                  <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">
                    Back to Login / লগইনে ফিরুন
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
