import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'win95-button font-bold text-win-ink ring-1 ring-inset ring-win-darker',
  secondary: 'win95-button font-medium text-win-ink',
  outline: 'win95-button font-medium text-win-ink',
  ghost:
    'bg-transparent text-win-ink font-medium hover:win95-outset active:win95-inset rounded-none',
  danger: 'win95-button font-bold text-logic-x',
  success: 'win95-button font-bold text-logic-high',
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 px-2 py-1 text-[11px] gap-1',
  sm: 'min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 px-2.5 py-1 text-xs gap-1.5',
  md: 'min-h-8 min-w-8 coarse:min-h-9 coarse:min-w-9 px-3.5 py-1.5 text-xs font-bold gap-1.5',
  lg: 'min-h-9 min-w-9 px-5 py-2 text-sm font-bold gap-2',
};

export function getButtonClassName(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className = '',
): string {
  return `inline-flex items-center justify-center select-none touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
}

/**
 * Універсальний компонент кнопки у класичному тактильному стилі Windows 95 (.win95-button).
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}) => {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={getButtonClassName(variant, size, className)}
      {...rest}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin motion-reduce:hidden border-2 border-current border-t-transparent"
          />
          <span
            aria-hidden="true"
            className="hidden motion-reduce:inline-block font-mono text-xs leading-none"
          >
            ...
          </span>
          <span className="sr-only">Виконання...</span>
        </>
      ) : (
        icon
      )}
      {children}
    </button>
  );
};
