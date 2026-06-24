import { useEffect, useState } from 'react';
import type { BuilderNodeType } from '@assetport/shared';
import { Button } from '../components/Button.tsx';
import { FloatingAlert } from '../components/FloatingAlert.tsx';
import { Modal } from '../components/Modal.tsx';
import { Panel } from '../components/Panel.tsx';
import { BuilderNodeCard } from '../components/BuilderNodeCard.tsx';
import { fetchWorkspaceRoot } from './assetExporterUtils.ts';
import { BUILDER_DEFAULT_DIR, useBuilder } from './useBuilder.ts';

const ADD_BUTTONS: { type: BuilderNodeType; label: string }[] = [
  { type: 'asset', label: 'Asset' },
  { type: 'text', label: 'Text' },
  { type: 'info', label: 'Info' },
];

export function BuilderTool() {
  const {
    alert,
    confirmAction,
    exportProgress,
    isAdding,
    isExporting,
    nodeCountLabel,
    nodes,
    relativeDir,
    screen,
    selectedCount,
    dismissAlert,
    setConfirmAction,
    handleAddChild,
    handleAddNode,
    handleClear,
    handleExport,
    handleMoveNode,
    handleRemoveNode,
    handleSetScreen,
    handleToggleHidden,
    handleUpdateNode,
  } = useBuilder();

  const [pendingDir, setPendingDir] = useState(relativeDir);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);

  useEffect(() => {
    if (confirmAction === 'export') {
      setPendingDir(relativeDir);
      fetchWorkspaceRoot().then(setWorkspaceRoot);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmAction]);

  const noSelection = selectedCount === 0;

  const exportProgressPercent =
    exportProgress.total > 0
      ? Math.max(8, Math.min(100, Math.round((exportProgress.current / exportProgress.total) * 100)))
      : 8;

  return (
    <div className="flex flex-col gap-3">
      {alert && <FloatingAlert message={alert.message} tone={alert.tone} onDismiss={dismissAlert} />}

      <Panel>
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <p className="m-0 mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">Screen</p>
            {screen ? (
              <h2 className="m-0 truncate text-[14px] font-bold leading-[1.15]" title={screen.name}>
                {screen.name} · {screen.width}×{screen.height}
              </h2>
            ) : (
              <h2 className="m-0 text-[13px] font-semibold leading-[1.2] text-[var(--figma-color-text-secondary)]">Not set</h2>
            )}
          </div>
          <Button variant={screen ? 'ghost' : 'primary'} onClick={handleSetScreen} disabled={noSelection} title="Select the screen frame in Figma first">
            {screen ? 'Change' : 'Set screen'}
          </Button>
        </div>
        {!screen && (
          <p className="m-0 mt-2 text-[11px] leading-[1.5] text-[var(--figma-color-text-tertiary)]">
            Select the screen frame in Figma and set it as the screen. Node positions are measured relative to it.
          </p>
        )}
      </Panel>

      <div className="flex flex-wrap gap-2">
        {ADD_BUTTONS.map(({ type, label }) => (
          <Button key={type} variant="ghost" size="compact" onClick={() => handleAddNode(type)} disabled={isAdding || noSelection}>
            + {label}
          </Button>
        ))}
      </div>
      {noSelection && (
        <p className="m-0 -mt-1 text-[11px] leading-[1.4] text-[var(--figma-color-text-tertiary)]">
          Select a layer in Figma to add it as an Asset, Text, or Info node.
        </p>
      )}

      <Panel>
        <div className="mb-3 flex items-center justify-between gap-2.5">
          <div>
            <p className="m-0 mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">Nodes</p>
            <h2 className="m-0 text-[14px] font-bold leading-[1.15]">{nodeCountLabel}</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirmAction('clear')} disabled={nodes.length === 0}>Clear</Button>
            <Button variant="primary" onClick={() => setConfirmAction('export')} disabled={isExporting || nodes.length === 0}>
              {isExporting ? 'Exporting…' : 'Export'}
            </Button>
          </div>
        </div>

        {nodes.length === 0 ? (
          <p className="m-0 leading-6 text-[var(--figma-color-text-secondary)]">
            Add asset, text, and info nodes. On export you get every node's image inside an assets folder, the screen image, plus a builder.json describing each node.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {nodes.map((node, index) => (
              <BuilderNodeCard
                key={node.id}
                node={node}
                index={index}
                total={nodes.length}
                addChildDisabled={isAdding || noSelection}
                onUpdate={handleUpdateNode}
                onRemove={handleRemoveNode}
                onMove={handleMoveNode}
                onToggleHidden={handleToggleHidden}
                onAddChild={handleAddChild}
              />
            ))}
          </div>
        )}
      </Panel>

      {confirmAction === 'clear' && (
        <Modal>
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[14px] font-bold leading-[1.15]">
              Clear all {nodes.length} node{nodes.length === 1 ? '' : 's'}?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleClear}>Clear</Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmAction === 'export' && (
        <Modal>
          <div className="flex flex-col gap-3">
            <div>
              <p className="m-0 mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">
                Export build to
              </p>
              {workspaceRoot && (
                <p className="m-0 break-all text-[13px] font-semibold leading-snug text-[var(--figma-color-text)]">{workspaceRoot}</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="builder-dir-confirm" className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">
                Subfolder
              </label>
              <input
                id="builder-dir-confirm"
                type="text"
                value={pendingDir}
                onChange={(e) => setPendingDir(e.target.value)}
                className="w-full min-h-[34px] rounded-[10px] border border-[var(--figma-color-border)] bg-[color-mix(in_srgb,var(--figma-color-bg)_94%,white_2%)] px-[11px] text-[12px] outline-none"
                placeholder={BUILDER_DEFAULT_DIR}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  handleExport(pendingDir);
                  setConfirmAction(null);
                }}
              >
                Export
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {isExporting && exportProgress.visible && (
        <Modal>
          <div className="flex flex-col gap-3">
            <div>
              <p className="m-0 mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">Exporting</p>
              <h3 className="m-0 text-[15px] font-bold leading-[1.2]">Building your spec…</h3>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--figma-color-bg-secondary)]">
              <div
                className="h-full rounded-full bg-[var(--figma-color-bg-brand)] transition-[width] duration-200 ease-out"
                style={{ width: `${exportProgressPercent}%` }}
              />
            </div>
            <p className="m-0 text-[11px] leading-[1.4] text-[var(--figma-color-text-secondary)]">{exportProgress.detail}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
