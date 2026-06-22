import type { ReactNode } from 'react';

interface Props {
  label?: string;
  htmlFor?: string;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
  children: ReactNode;
}

export function FieldStack({ label, htmlFor, className = '', orientation = 'vertical', children }: Props) {
  const isHorizontal = orientation === 'horizontal';
  return (
    <div className={`flex ${isHorizontal ? 'flex-row items-center justify-between' : 'flex-col'} gap-1.5 ${className}`}>
      {label && (
        <label className="text-[10px] font-bold text-[var(--figma-color-text-secondary)] uppercase tracking-[0.06em]" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}
