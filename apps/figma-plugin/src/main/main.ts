import type {
  ExportRequest,
  ExporterSettings,
  MainToUiMessage,
  SelectionStub,
  UiToMainMessage,
} from '@assetport/shared';

export default function (): void {
  figma.showUI(__html__, { width: 420, height: 720, themeColors: true });
  postSelectionState();
  figma.on('selectionchange', postSelectionState);

  figma.ui.onmessage = async (message: UiToMainMessage) => {
    try {
      if (message.type === 'capture-selection') {
        const selection = await getCurrentSelectionAssets();
        send({ type: 'selection-captured', ...selection });
        return;
      }

      if (message.type === 'capture-combined-selection') {
        const asset = await getCombinedSelectionAsset(message.scale ?? 2);
        send({ type: 'selection-captured', assets: [asset], selectedCount: figma.currentPage.selection.length });
        return;
      }

      if (message.type === 'capture-section-source') {
        const source = await getSectionSourceImage(message.scale ?? 2);
        send({ type: 'section-source-captured', ...source });
        return;
      }

      if (message.type === 'refresh-selection-context') {
        if (Array.isArray(message.nodeIds) && message.nodeIds.length > 1) {
          const preview = await getCombinedSelectionContext(message.nodeId, message.nodeIds, message.scale, message.ignoredNodeIds);
          send({ type: 'selection-context-refreshed', ...preview, requestedScale: message.scale });
          return;
        }
        const preview = await getSelectionContextByNodeId(message.nodeId, message.scale, message.ignoredNodeIds);
        send({ type: 'selection-context-refreshed', ...preview, requestedScale: message.scale });
        return;
      }

      if (message.type === 'capture-ignore-selection') {
        const parentNodeIds = Array.isArray(message.parentNodeIds) && message.parentNodeIds.length
          ? message.parentNodeIds
          : [message.parentNodeId];
        const result = await captureIgnoreSelection(parentNodeIds);
        send({ type: 'ignore-selection-captured', assetId: message.assetId, ...result });
        return;
      }

      if (message.type === 'request-selection-state') {
        postSelectionState();
        return;
      }

      if (message.type === 'export-queue') {
        const result = await exportQueuedAssets(message.assets, message.relativeDir, message.compressionQuality);
        send({ type: 'asset-queue-ready', ...result });
        return;
      }

      if (message.type === 'load-gemini-key') {
        const storedKey = await figma.clientStorage.getAsync('geminiApiKey');
        send({ type: 'gemini-key-loaded', apiKey: (storedKey as string) || '' });
        return;
      }

      if (message.type === 'load-exporter-settings') {
        const stored = await figma.clientStorage.getAsync('assetExporterSettings');
        send({ type: 'exporter-settings-loaded', settings: sanitizeExporterSettings(stored) });
        return;
      }

      if (message.type === 'save-gemini-key') {
        await figma.clientStorage.setAsync('geminiApiKey', message.apiKey);
        send({ type: 'gemini-key-saved' });
        return;
      }

      if (message.type === 'save-exporter-settings') {
        const nextSettings = sanitizeExporterSettings(message.settings);
        await figma.clientStorage.setAsync('assetExporterSettings', nextSettings);
        send({ type: 'exporter-settings-saved', settings: nextSettings });
        return;
      }

    } catch (error) {
      if (message.type === 'refresh-selection-context') {
        send({
          type: 'preview-error',
          nodeId: message.nodeId,
          requestedScale: message.scale,
          error: toErrorMessage(error),
        });
        return;
      }

      send({ type: mapErrorType(message.type), error: toErrorMessage(error) } as MainToUiMessage);
    }
  };
}


function send(message: MainToUiMessage): void {
  figma.ui.postMessage(message);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Plugin action failed.';
}

async function getCurrentSelectionAssets(): Promise<{ assets: (ReturnType<typeof buildSelectionStub> & { previewUrl: string })[]; selectedCount: number }> {
  const selectedNodes = getSelectedExportableNodes();
  const assets = await Promise.all(
    selectedNodes.map(async (node) => {
      const stub = buildSelectionStub(node);
      try {
        const { previewUrl } = await exportNodePreview(node, 2);
        return { ...stub, previewUrl };
      } catch {
        return { ...stub, previewUrl: '' };
      }
    }),
  );
  return { assets, selectedCount: figma.currentPage.selection.length };
}

type ExportableSceneNode = SceneNode & { exportAsync: ExportableNode['exportAsync'] };

/** Builds a single "combined" asset stub from the current selection, merging all exportable layers. */
async function getCombinedSelectionAsset(scale: number): Promise<SelectionStub & { previewUrl: string }> {
  const nodes = getSelectedExportableNodes();
  if (nodes.length < 2) throw new Error('Select at least two layers to combine into one asset.');

  const nodeIds = nodes.map((n) => n.id);
  const { bytes, width, height } = await exportCombinedNodes(nodes, 'PNG', scale);
  const members = await Promise.all(
    nodes.map(async (node) => {
      let previewUrl = '';
      try {
        previewUrl = (await exportNodePreview(node, 1)).previewUrl;
      } catch {
        // Thumbnail is best-effort — the UI falls back to a placeholder icon.
      }
      return { nodeId: node.id, name: node.name || 'layer', previewUrl };
    }),
  );

  return {
    nodeId: `combined:${nodeIds.join('+')}`,
    nodeIds,
    members,
    name: nodes[0].name || 'combinedAsset',
    width: getRoundedDimension(width, 1),
    height: getRoundedDimension(height, 1),
    previewUrl: `data:image/png;base64,${bytesToBase64(bytes)}`,
  };
}

/**
 * Renders the current selection as a single PNG to be sliced into sections in the UI.
 * One layer exports directly; multiple layers are merged into one image via the same
 * temp-frame approach used for combined assets.
 */
async function getSectionSourceImage(scale: number): Promise<{ previewUrl: string; width: number; height: number; name: string }> {
  const nodes = getSelectedExportableNodes();

  if (nodes.length === 1) {
    const node = nodes[0];
    const { previewUrl, width, height } = await exportNodePreview(node, scale);
    return { previewUrl, width, height, name: node.name || 'section' };
  }

  const { bytes, width, height } = await exportCombinedNodes(nodes, 'PNG', scale);
  return {
    previewUrl: `data:image/png;base64,${bytesToBase64(bytes)}`,
    width: getRoundedDimension(width, scale),
    height: getRoundedDimension(height, scale),
    name: nodes[0].name || 'section',
  };
}

async function getCombinedSelectionContext(nodeId: string, nodeIds: string[], scale = 2, ignoredNodeIds?: string[]) {
  const nodes = await Promise.all(nodeIds.map(getExportableNode));
  const { bytes, width, height } = await exportCombinedNodes(nodes, 'PNG', scale, ignoredNodeIds);
  return {
    nodeId,
    name: '',
    previewUrl: `data:image/png;base64,${bytesToBase64(bytes)}`,
    width: getRoundedDimension(width, scale),
    height: getRoundedDimension(height, scale),
  };
}

/**
 * Renders several layers as a single image by cloning them into a temporary frame
 * sized to their combined bounds, then exporting the frame. The originals are never
 * touched and the frame is removed afterwards.
 */
async function exportCombinedNodes(
  nodes: ExportableSceneNode[],
  format: 'PNG' | 'SVG' | 'JPEG',
  scale: number | string,
  ignoredNodeIds?: string[],
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  // Hide ignored descendants on the originals first; the clones below inherit
  // that hidden state, so they're excluded from the merged image.
  const restore = await hideNodes(ignoredNodeIds);
  try {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      const bounds = node.absoluteRenderBounds ?? node.absoluteBoundingBox;
      if (!bounds) continue;
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      throw new Error('Unable to determine the bounds of the selected layers.');
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    const frame = figma.createFrame();
    frame.name = 'assetport-combine-temp';
    frame.fills = [];
    frame.clipsContent = false;
    frame.resize(width, height);

    try {
      for (const node of nodes) {
        const clone = node.clone();
        frame.appendChild(clone);
        // Re-anchor the clone so the combined bounds' top-left maps to the frame origin,
        // preserving each layer's relative position, rotation and scale.
        const m = node.absoluteTransform;
        clone.relativeTransform = [
          [m[0][0], m[0][1], m[0][2] - minX],
          [m[1][0], m[1][1], m[1][2] - minY],
        ];
      }

      const bytes = await frame.exportAsync({ format, constraint: { type: 'SCALE', value: normalizeScale(scale) } });
      return { bytes, width, height };
    } finally {
      frame.remove();
    }
  } finally {
    restore();
  }
}

async function getSelectionContextByNodeId(nodeId: string, scale = 2, ignoredNodeIds?: string[]) {
  const node = await getExportableNode(nodeId);
  const restore = await hideNodes(ignoredNodeIds);
  try {
    return await buildSelectionContext(node, scale);
  } finally {
    restore();
  }
}

async function captureIgnoreSelection(
  parentNodeIds: string[],
): Promise<{ nodes: { nodeId: string; name: string; previewUrl: string }[]; invalidCount: number }> {
  const selected = figma.currentPage.selection;
  if (!selected.length) {
    throw new Error('Select a layer inside the asset to add it to the ignore list.');
  }

  const parents = await Promise.all(parentNodeIds.map((id) => figma.getNodeByIdAsync(id)));
  const validParentIds = parentNodeIds.filter((_, i) => parents[i] != null);
  if (!validParentIds.length) throw new Error('The asset layer is no longer available.');

  const nodes: { nodeId: string; name: string; previewUrl: string }[] = [];
  let invalidCount = 0;

  for (const node of selected) {
    const isParent = validParentIds.includes(node.id);
    const isDescendant = validParentIds.some((parentId) => isDescendantOf(node, parentId));
    if (isParent || !isDescendant) {
      invalidCount++;
      continue;
    }

    let previewUrl = '';
    if (typeof (node as ExportableNode).exportAsync === 'function') {
      try {
        const preview = await exportNodePreview(node as SceneNode & { exportAsync: ExportableNode['exportAsync'] }, 1);
        previewUrl = preview.previewUrl;
      } catch {
        // Thumbnail is best-effort — fall back to the placeholder icon in the UI.
      }
    }

    nodes.push({ nodeId: node.id, name: node.name || 'layer', previewUrl });
  }

  return { nodes, invalidCount };
}

function isDescendantOf(node: BaseNode, ancestorId: string): boolean {
  let current: BaseNode | null = node.parent;
  while (current) {
    if (current.id === ancestorId) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Temporarily hides the given nodes and returns a function that restores their
 * original visibility. Nodes that are already hidden or missing are left untouched.
 */
async function hideNodes(nodeIds?: string[]): Promise<() => void> {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) return () => {};

  const restores: (() => void)[] = [];
  for (const id of nodeIds) {
    try {
      const node = await figma.getNodeByIdAsync(id);
      if (node && 'visible' in node) {
        const sceneNode = node as SceneNode;
        if (sceneNode.visible) {
          sceneNode.visible = false;
          restores.push(() => {
            sceneNode.visible = true;
          });
        }
      }
    } catch {
      // Node no longer exists — nothing to hide or restore.
    }
  }

  return () => {
    for (const restore of restores) {
      try {
        restore();
      } catch {
        // Best-effort restore.
      }
    }
  };
}

function buildSelectionStub(node: SceneNode & { exportAsync: unknown }) {
  return {
    nodeId: node.id,
    name: node.name || 'figmaAsset',
    width: getRoundedDimension('width' in node ? (node.width as number) : 0, 1),
    height: getRoundedDimension('height' in node ? (node.height as number) : 0, 1),
  };
}

async function buildSelectionContext(node: SceneNode & { exportAsync: ExportableNode['exportAsync'] }, scale = 2) {
  const { previewUrl, width, height } = await exportNodePreview(node, scale);
  return { nodeId: node.id, name: node.name || 'figmaAsset', previewUrl, width, height };
}

async function exportQueuedAssets(
  assets: { nodeId: string; name: string; type: string; scale: number; ignoredNodeIds?: string[]; nodeIds?: string[]; imageData?: string }[],
  relativeDir: string,
  compressionQuality?: number,
): Promise<{ assets: ExportRequest[]; failures: { name: string; error: string }[] }> {
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error('Add at least one asset before exporting.');
  }

  const quality = normalizeCompressionQuality(compressionQuality);
  const exportedAssets: ExportRequest[] = [];
  const failures: { name: string; error: string }[] = [];

  for (const asset of assets) {
    try {
      // Section assets carry their own pre-cropped bytes — there's no node to export.
      if (typeof asset.imageData === 'string' && asset.imageData) {
        exportedAssets.push({
          fileName: sanitizeFileName(asset.name || 'section'),
          extension: asset.type as ExportRequest['extension'],
          relativeDir: buildRelativeDir(relativeDir),
          base64Data: asset.imageData,
          compressionQuality: quality,
        });
        continue;
      }

      const format = normalizeFormat(asset.type);
      let bytes: Uint8Array;
      let fallbackName: string;

      if (Array.isArray(asset.nodeIds) && asset.nodeIds.length > 1) {
        const nodes = await Promise.all(asset.nodeIds.map(getExportableNode));
        ({ bytes } = await exportCombinedNodes(nodes, format, asset.scale, asset.ignoredNodeIds));
        fallbackName = 'combined-asset';
      } else {
        const node = await getExportableNode(asset.nodeId);
        const restore = await hideNodes(asset.ignoredNodeIds);
        try {
          bytes = await node.exportAsync({
            format,
            constraint: { type: 'SCALE', value: normalizeScale(asset.scale) },
          });
        } finally {
          restore();
        }
        fallbackName = node.name || 'figma-asset';
      }

      exportedAssets.push({
        fileName: sanitizeFileName(asset.name || fallbackName),
        extension: asset.type as ExportRequest['extension'],
        relativeDir: buildRelativeDir(relativeDir),
        base64Data: bytesToBase64(bytes),
        compressionQuality: quality,
      });
    } catch (error) {
      failures.push({ name: asset.name || 'unknown', error: toErrorMessage(error) });
    }
  }

  if (exportedAssets.length === 0) {
    throw new Error(`All assets failed to export: ${failures.map((f) => f.name).join(', ')}`);
  }

  return { assets: exportedAssets, failures };
}


async function exportNodePreview(
  node: SceneNode & { exportAsync: ExportableNode['exportAsync'] },
  scale = 2,
): Promise<{ previewUrl: string; width: number; height: number }> {
  const bytes = await node.exportAsync({
    format: 'PNG',
    constraint: { type: 'SCALE', value: normalizeScale(scale) },
  });

  const width = getRoundedDimension('width' in node ? (node.width as number) : 0, scale);
  const height = getRoundedDimension('height' in node ? (node.height as number) : 0, scale);

  return { previewUrl: `data:image/png;base64,${bytesToBase64(bytes)}`, width, height };
}

function getSelectedExportableNodes() {
  const selected = figma.currentPage.selection;
  if (!selected.length) throw new Error('Select at least one layer in Figma to continue.');
  const exportable = selected.filter((n): n is SceneNode & { exportAsync: ExportableNode['exportAsync'] } =>
    typeof (n as ExportableNode).exportAsync === 'function',
  );
  if (!exportable.length) throw new Error('None of the selected layers can be exported as images.');
  return exportable;
}

async function getExportableNode(nodeId: string) {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error('The referenced Figma layer is no longer available.');
  if (typeof (node as ExportableNode).exportAsync !== 'function') throw new Error('This Figma layer cannot be exported as an image.');
  return node as SceneNode & { exportAsync: ExportableNode['exportAsync'] };
}

function buildRelativeDir(relativeDir: string): string {
  return typeof relativeDir === 'string' && relativeDir.trim() ? relativeDir.trim() : 'figma-exports';
}

function sanitizeFileName(value: string): string {
  return (
    String(value)
      .trim()
      .replace(/[<>:"/\\|?*]+/g, '')
      .replace(/\s+/g, '_')
      .replace(/-{2,}/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '') || 'figma-asset'
  );
}

function normalizeScale(value: number | string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

function normalizeFormat(type: string): 'PNG' | 'SVG' | 'JPEG' {
  const t = String(type ?? '').toLowerCase().trim();
  if (t === 'svg') return 'SVG';
  if (t === 'jpeg' || t === 'jpg') return 'JPEG';
  return 'PNG';
}

function getRoundedDimension(value: number, scale: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(1, Math.round(value * normalizeScale(scale)));
}

function sanitizeExporterSettings(raw: unknown): ExporterSettings {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const defaultType = normalizeExporterType(s['defaultType'] as string);
  return {
    relativeDir: typeof s['relativeDir'] === 'string' && (s['relativeDir'] as string).trim()
      ? (s['relativeDir'] as string).trim()
      : 'figma-exports',
    defaultType,
    defaultScale: normalizeExporterScale(s['defaultScale'] as number, defaultType),
    autoAIRename: s['autoAIRename'] === true,
    aiModel: typeof s['aiModel'] === 'string' && (s['aiModel'] as string).trim()
      ? (s['aiModel'] as string).trim()
      : 'gemini-2.5-flash',
    compressionQuality: normalizeCompressionQuality(s['compressionQuality']),
  };
}

function normalizeCompressionQuality(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 75;
  return Math.min(100, Math.max(0, n));
}

function normalizeExporterType(value: string): ExporterSettings['defaultType'] {
  const t = String(value ?? '').toLowerCase().trim();
  if (t === 'svg' || t === 'jpeg') return t;
  return 'png';
}

function normalizeExporterScale(value: number, assetType: string): ExporterSettings['defaultScale'] {
  const n = Number(value) as 1 | 2 | 3 | 4;
  const available: number[] = assetType === 'svg' ? [1] : [1, 2, 3, 4];
  return available.includes(n) ? n : (assetType === 'svg' ? 1 : 2);
}

function mapErrorType(actionType: string): MainToUiMessage['type'] {
  if (actionType === 'capture-selection' || actionType === 'capture-ignore-selection') return 'selection-error';
  if (actionType === 'capture-section-source') return 'section-error';
  if (actionType === 'refresh-selection-context') return 'preview-error';
  if (actionType === 'load-exporter-settings' || actionType === 'save-exporter-settings') return 'settings-error';
  if (actionType === 'load-gemini-key' || actionType === 'save-gemini-key') return 'settings-error';
  return 'export-error';
}

function postSelectionState(): void {
  const selected = figma.currentPage.selection;
  const exportableCount = selected.filter((n) => typeof (n as ExportableNode).exportAsync === 'function').length;

  send({
    type: 'selection-state-updated',
    selectedCount: selected.length,
    exportableCount,
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
