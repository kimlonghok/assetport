import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function Modal({ children }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-[var(--figma-color-bg)] rounded-xl shadow-2xl border border-[var(--figma-color-border)] p-5 max-w-sm w-full">
        {children}
      </div>
    </div>
  );
}
