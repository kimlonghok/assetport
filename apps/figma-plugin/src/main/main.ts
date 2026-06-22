import type {
  ExportRequest,
  ExporterSettings,
  MainToUiMessage,
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

      if (message.type === 'refresh-selection-context') {
        const preview = await getSelectionContextByNodeId(message.nodeId, message.scale);
        send({ type: 'selection-context-refreshed', ...preview, requestedScale: message.scale });
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

async function getSelectionContextByNodeId(nodeId: string, scale = 2) {
  const node = await getExportableNode(nodeId);
  return buildSelectionContext(node, scale);
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
  assets: { nodeId: string; name: string; type: string; scale: number }[],
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
      const node = await getExportableNode(asset.nodeId);
      const format = normalizeFormat(asset.type);
      const bytes = await node.exportAsync({
        format,
        constraint: { type: 'SCALE', value: normalizeScale(asset.scale) },
      });

      exportedAssets.push({
        fileName: sanitizeFileName(asset.name || node.name || 'figma-asset'),
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
  if (actionType === 'capture-selection') return 'selection-error';
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
