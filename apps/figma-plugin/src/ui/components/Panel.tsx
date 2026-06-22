import type { ReactNode } from 'react';

type PanelVariant = 'default' | 'accent' | 'hero' | 'status' | 'tool';

interface Props {
  variant?: PanelVariant;
  className?: string;
  children: ReactNode;
}

export function Panel({ variant = 'default', className = '', children }: Props) {
  const base = 'border border-[color-mix(in_srgb,var(--figma-color-border)_78%,white_6%)] rounded-[18px] bg-[color-mix(in_srgb,var(--figma-color-bg-secondary)_92%,white_2%)] shadow-[0_18px_44px_rgba(15,23,42,0.08)] p-[14px]';

  const variants: Record<PanelVariant, string> = {
    default: '',
    accent: 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--figma-color-bg-brand)_10%,var(--figma-color-bg-secondary)),var(--figma-color-bg-secondary))]',
    hero: '',
    status: 'm-0 p-[12px_14px] leading-6 whitespace-pre-wrap text-[var(--figma-color-text-secondary)]',
    tool: 'cursor-pointer',
  };

  const classes = [base, variants[variant], className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}
