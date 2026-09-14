import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, className, padding = 'md' }: CardProps) {
  const paddings = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' };
  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm', paddings[padding], className)}>
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  labelBn: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  color: 'green' | 'blue' | 'yellow' | 'red' | 'purple' | 'indigo';
  trend?: { value: number; label: string };
  loading?: boolean;
}

const colorMap = {
  green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600',  border: 'border-l-green-500',  text: 'text-green-700' },
  blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',    border: 'border-l-blue-500',   text: 'text-blue-700' },
  yellow: { bg: 'bg-yellow-50', icon: 'bg-yellow-100 text-yellow-600',border: 'border-l-yellow-500', text: 'text-yellow-700' },
  red:    { bg: 'bg-red-50',    icon: 'bg-red-100 text-red-600',      border: 'border-l-red-500',    text: 'text-red-700' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600',border: 'border-l-purple-500', text: 'text-purple-700' },
  indigo: { bg: 'bg-indigo-50', icon: 'bg-indigo-100 text-indigo-600',border: 'border-l-indigo-500', text: 'text-indigo-700' },
};

export function StatCard({ label, labelBn, value, subValue, icon, color, trend, loading }: StatCardProps) {
  const c = colorMap[color];
  return (
    <div className={cn('rounded-xl border border-gray-200 shadow-sm border-l-4 p-5', c.border, c.bg)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
          <p className="text-xs text-gray-400 truncate">{labelBn}</p>
          {loading ? (
            <div className="mt-2 h-7 w-24 bg-gray-200 animate-pulse rounded" />
          ) : (
            <p className="mt-1.5 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
          )}
          {subValue && !loading && (
            <p className="text-xs text-gray-500 mt-0.5">{subValue}</p>
          )}
          {trend && !loading && (
            <div className={cn('flex items-center gap-1 mt-1.5 text-xs font-medium', trend.value >= 0 ? 'text-green-600' : 'text-red-600')}>
              <span>{trend.value >= 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}% {trend.label}</span>
            </div>
          )}
        </div>
        <div className={cn('p-2.5 rounded-xl shrink-0 ml-3', c.icon)}>
          {icon}
        </div>
      </div>
    </div>
  );
}
