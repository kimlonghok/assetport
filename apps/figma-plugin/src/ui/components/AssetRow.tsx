import { useEffect, useRef, useState } from 'react';
import type { AssetFormat, AssetScale } from '@assetport/shared';
import type { QueuedAssetItem } from '../tools/useAssetExporter.ts';

interface Props {
  asset: QueuedAssetItem;
  onUpdate: (updated: QueuedAssetItem) => void;
  onRemove: (assetId: string) => void;
  onAIRename: (assetId: string, lastAttemptedName: string) => void;
  onRetryPreview: (assetId: string) => void;
  onOpenIgnore: (assetId: string) => void;
  aiRenameEnabled: boolean;
  onPreview?: () => void;
}

const fieldClasses =
  'min-h-[28px] px-2 border border-[var(--figma-color-border)] rounded-[8px] bg-[var(--figma-color-bg)] outline-none text-[11px] font-[inherit] focus:border-[var(--figma-color-bg-brand)] focus:shadow-[0_0_0_1px_var(--figma-color-bg-brand)]';

const iconButtonClasses =
  'h-7 w-7 shrink-0 rounded-full cursor-pointer transition-colors inline-flex items-center justify-center text-[var(--figma-color-text-secondary)] hover:bg-[var(--figma-color-bg-tertiary)] hover:text-[var(--figma-color-text)]';

const aiButtonClasses =
  'h-7 shrink-0 px-2 rounded-full transition-colors inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--figma-color-bg-brand)] hover:bg-[color-mix(in_srgb,var(--figma-color-bg-brand)_14%,transparent)]';

export function AssetRow({ asset, onUpdate, onRemove, onAIRename, onRetryPreview, onOpenIgnore, aiRenameEnabled, onPreview }: Props) {
  const isRenaming = asset.status === 'renaming';
  const isProcessing = asset.status === 'processing';
  const isPreviewFailed = asset.status === 'preview-failed';
  const availableScales: AssetScale[] = asset.type === 'svg' ? [1] : [1, 2, 3, 4];
  const ignoreCount = asset.ignoredNodes?.length ?? 0;
  const combinedCount = asset.nodeIds?.length ?? 0;
  const isCombined = combinedCount > 1;

  const [nameDraft, setNameDraft] = useState(asset.name);
  const isFocusedRef = useRef(false);

  // Keep the field in sync when the name changes elsewhere (e.g. AI rename),
  // but never clobber what the user is actively typing.
  useEffect(() => {
    if (!isFocusedRef.current) setNameDraft(asset.name);
  }, [asset.name]);

  const commitName = () => {
    const next = nameDraft.trim();
    if (!next || next === asset.name) {
      setNameDraft(asset.name);
      return;
    }
    onUpdate({ ...asset, name: next });
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextType = e.target.value as AssetFormat;
    onUpdate({ ...asset, type: nextType, scale: nextType === 'svg' ? 1 : asset.scale });
  };

  const handleScaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ ...asset, scale: Number(e.target.value) as AssetScale });
  };

  return (
    <div className="flex gap-2.5 p-[10px] rounded-[12px] bg-[color-mix(in_srgb,var(--figma-color-bg)_96%,white_1%)] border border-[color-mix(in_srgb,var(--figma-color-border)_60%,white_4%)] hover:border-[var(--figma-color-border)] transition-colors">
      <div
        className="mt-[1px] h-9 w-9 shrink-0 rounded-md bg-[var(--figma-color-bg-secondary)] flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-[var(--figma-color-bg-brand)] transition-all"
        onClick={onPreview}
        title="View full size"
      >
        {asset.previewUrl ? (
          <img src={asset.previewUrl} alt="" className="w-full h-full object-contain pointer-events-none" />
        ) : (
          <svg className="w-4 h-4 text-[var(--figma-color-text-tertiary)]" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <input
            className={`${fieldClasses} flex-1 min-w-0 disabled:opacity-60`}
            value={nameDraft}
            aria-label="Asset name"
            placeholder="assetName"
            disabled={isRenaming}
            onFocus={() => { isFocusedRef.current = true; }}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => { isFocusedRef.current = false; commitName(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') { setNameDraft(asset.name); (e.target as HTMLInputElement).blur(); }
            }}
          />

          {isRenaming ? (
            <span
              className="h-7 shrink-0 px-2 rounded-full inline-flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap text-[var(--figma-color-bg-brand)] bg-[color-mix(in_srgb,var(--figma-color-bg-brand)_14%,transparent)]"
              title="Renaming with AI…"
            >
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="24" strokeDashoffset="8" />
              </svg>
              AI
            </span>
          ) : isProcessing ? (
            <span className={`${iconButtonClasses} pointer-events-none`} title="Loading preview…">
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="24" strokeDashoffset="8" />
              </svg>
            </span>
          ) : isPreviewFailed ? (
            <button
              className={iconButtonClasses}
              onClick={() => onRetryPreview(asset.id)}
              title="Preview failed — click to retry"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : aiRenameEnabled ? (
            <button
              className={`${aiButtonClasses} cursor-pointer`}
              onClick={() => onAIRename(asset.id, asset.name)}
              title="Rename with AI"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5l1.2 2.6 2.8.3-2.1 1.9.6 2.8L8 7.7 5.5 9.1l.6-2.8L4 4.4l2.8-.3L8 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                <path d="M12.5 10.5l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5.5-1.1z" fill="currentColor"/>
              </svg>
              AI
            </button>
          ) : null}

          {isCombined ? (
            <button
              className={`${iconButtonClasses} relative text-[var(--figma-color-bg-brand)]`}
              onClick={() => onOpenIgnore(asset.id)}
              title={`Merged from ${combinedCount} layers — click to manage`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                <rect x="6" y="6" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-[var(--figma-color-bg-brand)] text-[var(--figma-color-text-onbrand)] text-[9px] font-bold leading-[14px] text-center">
                {combinedCount}
              </span>
            </button>
          ) : (
            <button
              className={`${iconButtonClasses} relative ${ignoreCount > 0 ? 'text-[var(--figma-color-bg-brand)]' : ''}`}
              onClick={() => onOpenIgnore(asset.id)}
              title={ignoreCount > 0 ? `${ignoreCount} ignored layer${ignoreCount === 1 ? '' : 's'}` : 'Ignore layers on export'}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M2.5 2.5l11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {ignoreCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-[var(--figma-color-bg-brand)] text-[var(--figma-color-text-onbrand)] text-[9px] font-bold leading-[14px] text-center">
                  {ignoreCount}
                </span>
              )}
            </button>
          )}

          <button
            className="h-7 w-7 shrink-0 rounded-full cursor-pointer transition-colors inline-flex items-center justify-center text-[#c2410c] hover:bg-[rgba(194,65,12,0.1)]"
            onClick={() => onRemove(asset.id)}
            title="Remove asset"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M12 4v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2">
          <select className={`${fieldClasses} flex-1`} value={asset.type} onChange={handleTypeChange} aria-label="Export type">
            <option value="png">png</option>
            <option value="svg">svg</option>
            <option value="jpeg">jpeg</option>
          </select>
          <select
            className={`${fieldClasses} flex-1`}
            value={asset.scale}
            onChange={handleScaleChange}
            disabled={asset.type === 'svg'}
            aria-label="Resolution"
          >
            {availableScales.map((scale) => (
              <option key={scale} value={scale}>{scale}x</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
