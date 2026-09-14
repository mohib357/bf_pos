'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

// ── Validation schema ────────────────────────────────────────────────────────
const loginSchema = z.object({
  username: z
    .string()
    .min(1, 'Username is required / ব্যবহারকারীর নাম প্রয়োজন'),
  password: z
    .string()
    .min(1, 'Password is required / পাসওয়ার্ড প্রয়োজন')
    .min(6, 'Password must be at least 6 characters'),
  remember: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

// ── Component ────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: { username: '', password: '', remember: false },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setServerError('');
    try {
      await login(data.username, data.password);
      router.push('/dashboard');
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.messagebn ||
        err?.message ||
        'Login failed. Please check your credentials.';
      setServerError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}
      />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header strip */}
          <div className="h-1.5 bg-gradient-to-r from-green-400 via-green-500 to-emerald-600" />

          <div className="px-8 py-8">
            {/* Logo area */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-700 rounded-2xl shadow-lg mb-4">
                <span className="text-white text-3xl font-bold leading-none select-none">ب</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Barakah Finance</h1>
              <p className="text-sm text-gray-500 mt-1">
                বারাকাহ ফাইন্যান্স — Library &amp; Stationery
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-medium px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
                POS &amp; Business Management System
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              {/* Username */}
              <Input
                {...register('username')}
                label="Username / Phone / Email"
                labelBn="ব্যবহারকারীর নাম / ফোন / ইমেইল"
                placeholder="admin"
                autoComplete="username"
                autoFocus
                error={errors.username?.message}
                aria-invalid={!!errors.username}
              />

              {/* Password */}
              <div>
                <div className="relative">
                  <Input
                    {...register('password')}
                    label="Password"
                    labelBn="পাসওয়ার্ড"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    error={errors.password?.message}
                    aria-invalid={!!errors.password}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-[2.1rem] text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Remember me + Forgot password */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    {...register('remember')}
                    id="remember"
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                  />
                  <label htmlFor="remember" className="ml-2 text-sm text-gray-600 cursor-pointer">
                    Remember me / মনে রাখুন
                  </label>
                </div>
                <a href="/forgot-password" className="text-sm text-green-600 hover:text-green-700 font-medium">
                  Forgot password?
                </a>
              </div>

              {/* Server error */}
              {serverError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm"
                >
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{serverError}</span>
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isLoading}
                disabled={!isValid && !isLoading}
                className="w-full mt-1"
              >
                {isLoading ? 'Logging in...' : 'Login / লগইন'}
              </Button>
            </form>

            {/* Demo credentials hint */}
            <div className="mt-5 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 font-medium mb-1">Demo credentials:</p>
              <p className="text-xs text-gray-600 font-mono">
                Username: <span className="text-green-700 font-semibold">admin</span>
                &nbsp;&nbsp;Password: <span className="text-green-700 font-semibold">Admin@123456</span>
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} Barakah Finance POS &nbsp;|&nbsp;
              Powered by <span className="text-green-600">Kiro AI</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
