import { cn } from '@/lib/utils';
import { SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  labelBn?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, labelBn, error, hint, id, options, placeholder, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1">
        {(label || labelBn) && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
            {label}
            {labelBn && <span className="ml-1 text-gray-500 font-normal">/ {labelBn}</span>}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={cn(
            'w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 bg-white',
            'focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent',
            'transition duration-150 cursor-pointer',
            error ? 'border-red-400' : 'border-gray-300 hover:border-gray-400',
            props.disabled && 'opacity-60 cursor-not-allowed',
            className,
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    );
  },
);
Select.displayName = 'Select';
