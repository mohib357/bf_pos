import { cn } from '@/lib/utils';

type BadgeVariant = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'purple' | 'orange';

const variantMap: Record<BadgeVariant, string> = {
  green:  'bg-green-100 text-green-700 ring-green-600/20',
  red:    'bg-red-100 text-red-700 ring-red-600/20',
  yellow: 'bg-yellow-100 text-yellow-700 ring-yellow-600/20',
  blue:   'bg-blue-100 text-blue-700 ring-blue-600/20',
  gray:   'bg-gray-100 text-gray-700 ring-gray-600/20',
  purple: 'bg-purple-100 text-purple-700 ring-purple-600/20',
  orange: 'bg-orange-100 text-orange-700 ring-orange-600/20',
};

const variantMap: Record<BadgeVariant, string> = {
  green:  'bg-green-100 text-green-700 ring-green-600/20',
  red:    'bg-red-100 text-red-700 ring-red-600/20',
  yellow: 'bg-yellow-100 text-yellow-700 ring-yellow-600/20',
  blue:   'bg-blue-100 text-blue-700 ring-blue-600/20',
  gray:   'bg-gray-100 text-gray-700 ring-gray-600/20',
  purple: 'bg-purple-100 text-purple-700 ring-purple-600/20',
  orange: 'bg-orange-100 text-orange-700 ring-orange-600/20',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'gray', size = 'sm', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium ring-1 ring-inset',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
      variantMap[variant],
      className,
    )}>
      {children}
    </span>
  );
}

export function UserStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    ACTIVE:    { label: 'Active / সক্রিয়',    variant: 'green' },
    INACTIVE:  { label: 'Inactive / নিষ্ক্রিয়', variant: 'gray' },
    SUSPENDED: { label: 'Suspended / স্থগিত',  variant: 'red' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'gray' };
  return <Badge variant={variant}>{label}</Badge>;
}

export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, BadgeVariant> = {
    SUPER_ADMIN:     'purple',
    OWNER:           'blue',
    MANAGER:         'indigo' as any,
    CASHIER:         'green',
    INVENTORY_STAFF: 'yellow',
    ACCOUNTANT:      'orange',
    VIEWER:          'gray',
  };
  return <Badge variant={map[role] ?? 'gray'}>{role.replace(/_/g, ' ')}</Badge>;
}
