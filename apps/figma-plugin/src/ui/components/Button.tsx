import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'danger';
type ButtonSize = 'compact' | 'large' | 'wide';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'primary', size, disabled, onClick, children, className = '', ...rest }: Props) {
  const base = 'inline-flex items-center justify-center min-h-[34px] px-3 rounded-full font-bold cursor-pointer transition-all duration-[120ms]';

  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-[var(--figma-color-bg-brand)] text-[var(--figma-color-text-onbrand)]',
    ghost: 'bg-[var(--figma-color-bg)] text-[var(--figma-color-text)] border border-[var(--figma-color-border)]',
    danger: 'bg-[rgba(194,65,12,0.1)] text-[#c2410c] border border-[rgba(194,65,12,0.26)]',
  };

  const sizes: Record<ButtonSize, string> = {
    compact: 'min-h-[28px] px-[10px]',
    large: 'w-full min-h-[42px] text-[13px]',
    wide: 'min-w-[92px]',
  };

  const state = disabled ? 'opacity-60 cursor-default' : 'hover:translate-y-[-1px]';
  const classes = [base, variants[variant], size ? sizes[size] : '', state, className].filter(Boolean).join(' ');

  return (
    <button className={classes} onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
