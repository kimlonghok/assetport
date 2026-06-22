import type { ReactNode } from 'react';

type PreviewSize = 'compact' | 'mini' | 'inline' | 'parent';

interface Props {
  src?: string;
  alt?: string;
  size?: PreviewSize;
  className?: string;
  children?: ReactNode;
}

export function PreviewFrame({ src, alt = '', size, className = '', children }: Props) {
  const base = 'flex items-center justify-center rounded-[10px] bg-[var(--figma-color-bg-secondary)] overflow-hidden';

  const sizes: Record<PreviewSize, string> = {
    compact: 'min-h-[110px]',
    mini: 'min-h-[80px]',
    inline: 'min-h-[72px]',
    parent: 'relative min-h-[80px] flex-1',
  };

  const classes = [base, size ? sizes[size] : 'min-h-[144px]', className].filter(Boolean).join(' ');

  if (src) {
    return (
      <div className={classes}>
        <img src={src} alt={alt} className="block w-full h-full object-contain" />
      </div>
    );
  }

  return (
    <div className={classes}>
      {children ?? <p className="m-0 text-[var(--figma-color-text-secondary)]">No preview yet.</p>}
    </div>
  );
}
