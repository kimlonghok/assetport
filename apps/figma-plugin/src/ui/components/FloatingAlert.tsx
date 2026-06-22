type AlertTone = 'info' | 'success' | 'warning' | 'error';

interface Props {
  message: string;
  tone?: AlertTone;
  onDismiss: () => void;
}

export function FloatingAlert({ message, tone = 'info', onDismiss }: Props) {
  const toneClasses: Record<AlertTone, string> = {
    info: 'border-[color-mix(in_srgb,var(--figma-color-border)_70%,var(--figma-color-bg-brand)_30%)] bg-[color-mix(in_srgb,var(--figma-color-bg)_86%,var(--figma-color-bg-brand)_14%)] text-[var(--figma-color-text)]',
    success: 'border-[color-mix(in_srgb,#1f9d55_45%,var(--figma-color-border))] bg-[color-mix(in_srgb,#1f9d55_10%,var(--figma-color-bg))] text-[var(--figma-color-text)]',
    warning: 'border-[color-mix(in_srgb,#f59e0b_50%,var(--figma-color-border))] bg-[color-mix(in_srgb,#f59e0b_16%,var(--figma-color-bg))] text-[var(--figma-color-text)]',
    error: 'border-[color-mix(in_srgb,#dc2626_50%,var(--figma-color-border))] bg-[color-mix(in_srgb,#dc2626_12%,var(--figma-color-bg))] text-[var(--figma-color-text)]',
  };

  return (
    <div className="fixed left-1/2 top-4 z-[70] w-[calc(100%-24px)] max-w-sm -translate-x-1/2 animate-[float-in_180ms_ease-out]">
      <div className={`rounded-[14px] border px-3 py-2 shadow-[0_18px_44px_rgba(15,23,42,0.16)] backdrop-blur ${toneClasses[tone]}`}>
        <div className="flex items-center gap-2">
          <p className="m-0 flex-1 text-[11px] leading-[1.45] whitespace-pre-wrap">{message}</p>
          <button
            type="button"
            className="inline-flex min-h-[24px] min-w-[24px] items-center justify-center rounded-full text-[var(--figma-color-text-secondary)] transition-colors hover:bg-black/5 hover:text-[var(--figma-color-text)]"
            onClick={onDismiss}
            aria-label="Dismiss alert"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
