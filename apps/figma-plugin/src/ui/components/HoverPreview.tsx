import { useState, type ReactNode } from 'react';

type PreviewSize = 'default' | 'large';

interface Props {
  previewUrl?: string;
  alt?: string;
  size?: PreviewSize;
  className?: string;
  children: ReactNode;
}

export function HoverPreview({ previewUrl, alt = '', size = 'default', className = '', children }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverClasses = size === 'large' ? 'w-64 max-h-72' : 'w-44';

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => { if (previewUrl) setIsOpen(true); }}
      onMouseLeave={() => setIsOpen(false)}
    >
      {children}
      {previewUrl && isOpen && (
        <div className={`absolute left-0 top-full mt-1 p-2 rounded-lg bg-[var(--figma-color-bg-secondary)] border border-[var(--figma-color-border)] shadow-lg z-50 ${popoverClasses}`}>
          <img src={previewUrl} alt={alt} className="w-full h-full object-contain rounded-md" />
        </div>
      )}
    </div>
  );
}
