import { useState } from 'react';
import type { AssetFormat, BuilderFillStyle, BuilderNodeType, BuilderTextStyle } from '@assetport/shared';
import type { BuilderNodeItem } from '../tools/useBuilder.ts';
import { Chip, ChipList } from './Chip.tsx';
import { Modal } from './Modal.tsx';

/** Light/dark checkerboard so transparent areas of a preview are visible. */
const CHECKER_BG =
  'repeating-conic-gradient(var(--figma-color-bg-secondary) 0% 25%, transparent 0% 50%) 50% / 16px 16px';

interface Props {
  node: BuilderNodeItem;
  index: number;
  total: number;
  addChildDisabled: boolean;
  onUpdate: (id: string, patch: Partial<BuilderNodeItem>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onToggleHidden: (nodeItemId: string, childNodeId: string) => void;
  onAddChild: (nodeItemId: string) => void;
}

const TYPE_LABEL: Record<BuilderNodeType, string> = {
  asset: 'Asset',
  text: 'Text',
  info: 'Info',
};

const TYPE_TONE: Record<BuilderNodeType, string> = {
  asset: 'text-[#0369a1] bg-[rgba(3,105,161,0.12)]',
  text: 'text-[#047857] bg-[rgba(4,120,87,0.12)]',
  info: 'text-[#b45309] bg-[rgba(180,83,9,0.12)]',
};

const ASSET_TYPES: AssetFormat[] = ['png', 'jpeg', 'svg'];

export function BuilderNodeCard({ node, index, total, addChildDisabled, onUpdate, onRemove, onMove, onToggleHidden, onAddChild }: Props) {
  const isText = node.type === 'text';
  const isInfo = node.type === 'info';
  const textLayers = node.textLayers ?? [];
  const fillLayers = node.fillLayers ?? [];
  const children = node.children ?? [];
  const ignored = node.ignoredNodeIds ?? [];
  const [layersOpen, setLayersOpen] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--figma-color-border)] bg-[var(--figma-color-bg)] p-2.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--figma-color-bg-secondary)] text-[10px] font-bold text-[var(--figma-color-text-secondary)]">
          {index + 1}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] ${TYPE_TONE[node.type]}`}>
          {TYPE_LABEL[node.type]}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton title="Move up" disabled={index === 0} onClick={() => onMove(node.id, -1)}>
            <path d="M8 3.5l4 4M8 3.5l-4 4M8 3.5v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </IconButton>
          <IconButton title="Move down" disabled={index === total - 1} onClick={() => onMove(node.id, 1)}>
            <path d="M8 12.5l4-4M8 12.5l-4-4M8 12.5v-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </IconButton>
          <button
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#c2410c] transition-colors hover:bg-[rgba(194,65,12,0.1)]"
            onClick={() => onRemove(node.id)}
            title="Remove node"
          >
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex gap-2.5">
        {node.previewUrl ? (
          <button
            type="button"
            onClick={() => setPreview({ url: node.previewUrl!, name: node.name })}
            title="Click to preview"
            className="group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md"
            style={{ background: CHECKER_BG }}
          >
            <img src={node.previewUrl} alt="" className="h-full w-full object-contain" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
              <svg className="h-4 w-4 text-white" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          </button>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--figma-color-bg-secondary)]">
            <svg className="h-4 w-4 text-[var(--figma-color-text-tertiary)]" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <input
            type="text"
            value={node.name}
            onChange={(e) => onUpdate(node.id, { name: e.target.value })}
            className="w-full min-h-[28px] rounded-[8px] border border-[var(--figma-color-border)] bg-[var(--figma-color-bg-secondary)] px-2 text-[12px] font-semibold outline-none"
            placeholder="nodeName"
          />

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--figma-color-text-secondary)]">
            {node.rect && (
              <span title="x, y, width, height (px, screen-relative)">
                {node.rect.x}, {node.rect.y} · {node.rect.width}×{node.rect.height}
              </span>
            )}
          </div>

          {isText && textLayers.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {textLayers.map((layer, i) => (
                <TextStyleRow key={i} layer={layer} />
              ))}
            </div>
          )}

          {isInfo && fillLayers.length > 0 && (
            <div className="flex flex-col gap-1">
              {fillLayers.map((layer, i) => (
                <FillStyleRow key={i} layer={layer} />
              ))}
            </div>
          )}

          <ChipList>
            {ASSET_TYPES.map((type) => (
              <Chip
                key={type}
                label={type.toUpperCase()}
                active={node.assetType === type}
                onClick={() => onUpdate(node.id, { assetType: type })}
              />
            ))}
          </ChipList>
        </div>
      </div>

      <div className="rounded-[8px] border border-[var(--figma-color-border)] bg-[var(--figma-color-bg-secondary)]">
        <div className="flex w-full items-center justify-between gap-2 px-2 py-1.5">
          <button
            type="button"
            onClick={() => setLayersOpen((o) => !o)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-semibold text-[var(--figma-color-text-secondary)]"
          >
            <svg className={`h-2.5 w-2.5 shrink-0 transition-transform ${layersOpen ? 'rotate-90' : ''}`} viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Layers
            {children.length > 0 && <span className="text-[var(--figma-color-text-tertiary)]">({children.length})</span>}
          </button>
          <div className="flex items-center gap-1.5">
            {ignored.length > 0 && (
              <span className="rounded-full bg-[var(--figma-color-bg)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--figma-color-text-tertiary)]">
                {ignored.length} hidden
              </span>
            )}
            <button
              type="button"
              onClick={() => onAddChild(node.id)}
              disabled={addChildDisabled}
              title="Add the selected Figma layer to this node"
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${addChildDisabled ? 'text-[var(--figma-color-text-tertiary)] opacity-50' : 'text-[var(--figma-color-text)] hover:bg-[var(--figma-color-bg)]'}`}
            >
              + Add layer
            </button>
          </div>
        </div>

        {layersOpen && (
          <div className="flex flex-col gap-0.5 px-1.5 pb-1.5">
            {children.length === 0 ? (
              <p className="m-0 px-1.5 py-1 text-[11px] text-[var(--figma-color-text-tertiary)]">
                Select a layer in Figma and click “+ Add layer” to include it.
              </p>
            ) : (
              children.map((child) => {
                const isHidden = ignored.includes(child.nodeId);
                return (
                  <div
                    key={child.nodeId}
                    className={`flex items-center gap-2 rounded-[6px] px-1.5 py-1 ${isHidden ? 'opacity-45' : ''}`}
                  >
                    {child.previewUrl ? (
                      <button
                        type="button"
                        onClick={() => setPreview({ url: child.previewUrl!, name: child.name })}
                        title="Click to preview"
                        className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded"
                        style={{ background: CHECKER_BG }}
                      >
                        <img src={child.previewUrl} alt="" className="h-full w-full object-contain" />
                      </button>
                    ) : (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--figma-color-bg)]">
                        <svg className="h-3 w-3 text-[var(--figma-color-text-tertiary)]" viewBox="0 0 16 16" fill="none">
                          <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--figma-color-text)]" title={child.name}>
                      {child.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleHidden(node.id, child.nodeId)}
                      title={isHidden ? 'Show in export' : 'Hide from export'}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--figma-color-text-secondary)] transition-colors hover:bg-[var(--figma-color-bg)] hover:text-[var(--figma-color-text)]"
                    >
                      {isHidden ? (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                          <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          <path d="M6.7 6.7a1.8 1.8 0 002.6 2.6M4.2 4.6C2.9 5.5 2 8 2 8s2 4 6 4a6 6 0 002.6-.6M8 4c4 0 6 4 6 4a11 11 0 01-1.3 1.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                          <path d="M2 8s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {preview && (
        <Modal>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="m-0 min-w-0 truncate text-[13px] font-bold" title={preview.name}>{preview.name}</p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                title="Close"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--figma-color-text-secondary)] transition-colors hover:bg-[var(--figma-color-bg-secondary)] hover:text-[var(--figma-color-text)]"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex max-h-[60vh] items-center justify-center overflow-auto rounded-lg p-2" style={{ background: CHECKER_BG }}>
              <img src={preview.url} alt={preview.name} className="max-h-[56vh] max-w-full object-contain" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TextStyleRow({ layer }: { layer: BuilderTextStyle }) {
  const { font } = layer;
  const sizeLabel = font.size === 'mixed' ? 'mixed' : `${font.size}px`;
  const weightLabel = font.weight ? ` · ${font.weight}` : '';
  return (
    <div className="flex flex-col gap-0.5 rounded-[6px] border border-[var(--figma-color-border)] bg-[var(--figma-color-bg-secondary)] px-2 py-1">
      <p className="m-0 truncate text-[11px] italic text-[var(--figma-color-text-tertiary)]" title={layer.text}>
        “{layer.text}”
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--figma-color-text-secondary)]">
        <span title="size · family style · weight">
          {sizeLabel} · {font.family} {font.style}{weightLabel}
        </span>
        {layer.color && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-[3px] border border-[var(--figma-color-border)]" style={{ backgroundColor: layer.color }} />
            {layer.color}
          </span>
        )}
        {layer.gradient && (
          <span className="inline-flex items-center gap-1" title={layer.gradient.stops.map((s) => s.color).join(' → ')}>
            <span
              className="inline-block h-3 w-5 rounded-[3px] border border-[var(--figma-color-border)]"
              style={{ background: gradientPreview(layer.gradient.stops) }}
            />
            {layer.gradient.type}
          </span>
        )}
      </div>
    </div>
  );
}

function FillStyleRow({ layer }: { layer: BuilderFillStyle }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--figma-color-text-secondary)]">
      <span className="min-w-0 max-w-[40%] truncate text-[var(--figma-color-text-tertiary)]" title={layer.name}>
        {layer.name}
      </span>
      {layer.color && (
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-[3px] border border-[var(--figma-color-border)]" style={{ backgroundColor: layer.color }} />
          {layer.color}
        </span>
      )}
      {layer.gradient && (
        <span className="inline-flex items-center gap-1" title={layer.gradient.stops.map((s) => s.color).join(' → ')}>
          <span
            className="inline-block h-3 w-5 rounded-[3px] border border-[var(--figma-color-border)]"
            style={{ background: gradientPreview(layer.gradient.stops) }}
          />
          {layer.gradient.type}
        </span>
      )}
      {layer.rect && (
        <span title="width × height (px)">
          {layer.rect.width}×{layer.rect.height}
        </span>
      )}
    </div>
  );
}

function gradientPreview(stops: { position: number; color: string }[]): string {
  if (stops.length === 0) return 'transparent';
  const parts = stops.map((s) => `${s.color} ${Math.round(s.position * 100)}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

function IconButton({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--figma-color-text-secondary)] transition-colors ${disabled ? 'opacity-30' : 'hover:bg-[var(--figma-color-bg-secondary)] hover:text-[var(--figma-color-text)]'}`}
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">{children}</svg>
    </button>
  );
}
