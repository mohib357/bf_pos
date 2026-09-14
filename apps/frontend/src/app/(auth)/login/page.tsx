'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required / ব্যবহারকারীর নাম প্রয়োজন'),
  password: z.string().min(1, 'Password is required / পাসওয়ার্ড প্রয়োজন'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError('');
    try {
      await login(data.username, data.password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed / লগইন ব্যর্থ হয়েছে');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-800 to-brand-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-full mb-4">
            <span className="text-white text-2xl font-bold">ب</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Barakah Finance</h1>
          <p className="text-gray-500 text-sm mt-1">বারাকাহ ফাইন্যান্স — Library & Stationery</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username / ব্যবহারকারীর নাম
            </label>
            <input
              {...register('username')}
              type="text"
              autoComplete="username"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
              placeholder="admin"
            />
            {errors.username && (
              <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password / পাসওয়ার্ড
            </label>
            <input
              {...register('password')}
              type="password"
              autoComplete="current-password"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? 'লগইন হচ্ছে...' : 'Login / লগইন'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          &copy; 2026 Barakah Finance POS System
        </p>
      </div>
    </div>
  );
}
