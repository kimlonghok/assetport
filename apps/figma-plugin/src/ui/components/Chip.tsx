import type { ReactNode } from 'react';

interface ChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Chip({ label, active, onClick, className = '' }: ChipProps) {
  const base = 'px-[10px] py-1.5 rounded-full bg-[var(--figma-color-bg)] border border-[var(--figma-color-border)] cursor-pointer text-[10px] leading-[1.4] transition-all duration-100';
  const activeClass = 'bg-[var(--figma-color-bg-brand)] text-[var(--figma-color-text-onbrand)] border-[var(--figma-color-bg-brand)] font-bold';
  const classes = [base, active ? activeClass : '', className].filter(Boolean).join(' ');
  return <button className={classes} onClick={onClick}>{label}</button>;
}

interface ChipListProps {
  children: ReactNode;
  className?: string;
}

export function ChipList({ children, className = '' }: ChipListProps) {
  return <div className={`flex flex-wrap gap-2 ${className}`}>{children}</div>;
}
