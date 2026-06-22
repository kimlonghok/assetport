import { useEffect, useState } from 'react';
import type { ExporterSettings } from '@assetport/shared';
import { Button } from '../components/Button.tsx';
import { FloatingAlert } from '../components/FloatingAlert.tsx';
import { Modal } from '../components/Modal.tsx';
import { Panel } from '../components/Panel.tsx';
import { AssetRow } from '../components/AssetRow.tsx';
import { useAssetExporter } from './useAssetExporter.ts';
import { DEFAULT_DIR, fetchWorkspaceRoot } from './assetExporterUtils.ts';

interface Props {
  onOpenSettings: () => void;
  geminiApiKey: string;
  exporterSettings: ExporterSettings;
}

export function AssetExporterTool({ onOpenSettings, geminiApiKey, exporterSettings }: Props) {
  const {
    alert,
    assets,
    confirmAction,
    dismissAlert,
    exportProgress,
    isAdding,
    isExporting,
    previewAsset,
    relativeDir,
    selectedCountLabel,
    selectionState,
    setConfirmAction,
    setPreviewAsset,
    handleAIRename,
    handleAddAsset,
    handleClearQueue,
    handleExportQueue,
    handlePreviewAsset,
    handleRemoveAsset,
    handleRetryPreview,
    handleSaveAssetEdit,
  } = useAssetExporter({ geminiApiKey, exporterSettings });

  const [pendingDir, setPendingDir] = useState(relativeDir);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);

  useEffect(() => {
    if (confirmAction === 'export') {
      setPendingDir(relativeDir);
      fetchWorkspaceRoot().then(setWorkspaceRoot);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmAction]);

  const aiRenameEnabled = geminiApiKey.trim().length > 0;

  const exportProgressPercent =
    exportProgress.total > 0
      ? Math.max(8, Math.min(100, Math.round((exportProgress.current / exportProgress.total) * 100)))
      : 8;

  return (
    <div className="flex flex-col gap-3">
      {alert && (
        <FloatingAlert message={alert.message} tone={alert.tone} onDismiss={dismissAlert} />
      )}

      <div className="flex items-center justify-between gap-2.5">
        <button
          onClick={onOpenSettings}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border-none bg-transparent p-0 text-[var(--figma-color-text-secondary)] transition-colors hover:bg-[var(--figma-color-bg-secondary)] hover:text-[var(--figma-color-text)]"
          aria-label="Settings"
        >
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" stroke="currentColor"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor"/>
          </svg>
        </button>
        <Button variant="primary" onClick={handleAddAsset} disabled={isAdding || selectionState.exportableCount === 0}>
          {isAdding ? 'Adding...' : selectionState.exportableCount > 0 ? `Add ${selectionState.exportableCount}` : 'Add'}
        </Button>
      </div>

      <Panel>
        <div className="flex items-center justify-between gap-2.5 mb-3">
          <div>
            <p className="m-0 mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">Assets</p>
            <h2 className="m-0 text-[14px] font-bold leading-[1.15]">{selectedCountLabel}</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirmAction('clear')} disabled={assets.length === 0}>Clear</Button>
            <Button variant="primary" onClick={() => setConfirmAction('export')} disabled={isExporting || assets.length === 0}>
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>
          </div>
        </div>

        {assets.length === 0 ? (
          <p className="m-0 text-[var(--figma-color-text-secondary)] leading-6">
            Added assets will show up here with inline editing and hover preview.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {assets.map((asset) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                onUpdate={handleSaveAssetEdit}
                onRemove={handleRemoveAsset}
                onAIRename={handleAIRename}
                onRetryPreview={handleRetryPreview}
                aiRenameEnabled={aiRenameEnabled}
                onPreview={() => handlePreviewAsset(asset)}
              />
            ))}
          </div>
        )}
      </Panel>

      {confirmAction === 'clear' && (
        <Modal>
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[14px] font-bold leading-[1.15]">
              Clear all {assets.length} asset{assets.length === 1 ? '' : 's'}?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleClearQueue}>Clear</Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmAction === 'export' && (
        <Modal>
          <div className="flex flex-col gap-3">
            <div>
              <p className="m-0 mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">
                Export {assets.length} asset{assets.length === 1 ? '' : 's'} to
              </p>
              {workspaceRoot && (
                <p className="m-0 text-[13px] font-semibold leading-snug break-all text-[var(--figma-color-text)]">
                  {workspaceRoot}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="export-dir-confirm" className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">
                Subfolder
              </label>
              <input
                id="export-dir-confirm"
                type="text"
                value={pendingDir}
                onChange={(e) => setPendingDir(e.target.value)}
                className="w-full min-h-[34px] px-[11px] border border-[var(--figma-color-border)] rounded-[10px] bg-[color-mix(in_srgb,var(--figma-color-bg)_94%,white_2%)] outline-none text-[inherit] font-[inherit] text-[12px]"
                placeholder={DEFAULT_DIR}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  handleExportQueue(pendingDir);
                  setConfirmAction(null);
                }}
              >
                Export
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {previewAsset && (
        <Modal>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="m-0 text-[14px] font-bold leading-[1.15]">{previewAsset.name}</p>
              <button
                className="min-h-[28px] px-2 rounded-full cursor-pointer transition-colors inline-flex items-center justify-center text-[var(--figma-color-text-secondary)] hover:bg-[var(--figma-color-bg-tertiary)] hover:text-[var(--figma-color-text)]"
                onClick={() => setPreviewAsset(null)}
                title="Close"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="relative min-h-[200px] max-h-[70vh] overflow-auto rounded-lg bg-[var(--figma-color-bg-secondary)]">
              {previewAsset.currentPreviewUrl ? (
                <div className="flex min-h-[200px] min-w-full items-center justify-center p-3">
                  <img
                    src={previewAsset.currentPreviewUrl}
                    alt="Asset preview"
                    className="block h-auto w-auto max-w-full object-contain"
                    style={{ maxHeight: 'calc(70vh - 120px)', transform: `scale(${previewAsset.zoom || 1})`, transformOrigin: 'center center' }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center text-[var(--figma-color-text-secondary)] text-[12px]">
                  Loading preview...
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-2">
              {[
                { title: 'Zoom out', onClick: () => setPreviewAsset((a) => a ? { ...a, zoom: Math.max(0.5, (a.zoom || 1) - 0.25) } : a), icon: <><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 7h4M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></> },
                { title: 'Zoom in', onClick: () => setPreviewAsset((a) => a ? { ...a, zoom: Math.min(4, (a.zoom || 1) + 0.25) } : a), icon: <><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 7h4M7 5v4M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></> },
                { title: 'Reset zoom', onClick: () => setPreviewAsset((a) => a ? { ...a, zoom: 1 } : a), icon: <><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></> },
              ].map(({ title, onClick, icon }) => (
                <button
                  key={title}
                  className="min-h-[28px] px-2 rounded-full cursor-pointer transition-colors inline-flex items-center justify-center text-[var(--figma-color-text-secondary)] hover:bg-[var(--figma-color-bg-tertiary)] hover:text-[var(--figma-color-text)] border border-[var(--figma-color-border)]"
                  onClick={onClick}
                  title={title}
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">{icon}</svg>
                </button>
              ))}
              <span className="text-[11px] text-[var(--figma-color-text-secondary)] min-w-[40px] text-center">
                {Math.round((previewAsset.zoom || 1) * 100)}%
              </span>
            </div>
          </div>
        </Modal>
      )}

      {isExporting && exportProgress.visible && (
        <Modal>
          <div className="flex flex-col gap-3">
            <div>
              <p className="m-0 mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">Exporting</p>
              <h3 className="m-0 text-[15px] font-bold leading-[1.2]">
                {exportProgress.current >= exportProgress.total && exportProgress.total > 0
                  ? 'Finishing export...'
                  : `Exporting ${exportProgress.total} asset${exportProgress.total === 1 ? '' : 's'}`}
              </h3>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--figma-color-bg-secondary)]">
              <div
                className="h-full rounded-full bg-[var(--figma-color-bg-brand)] transition-[width] duration-200 ease-out"
                style={{ width: `${exportProgressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] leading-[1.4] text-[var(--figma-color-text-secondary)]">
              <p className="m-0">{exportProgress.detail}</p>
              <p className="m-0 whitespace-nowrap">{Math.min(exportProgress.current, exportProgress.total)} / {exportProgress.total}</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
