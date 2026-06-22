import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetFormat, AssetScale, ExportRequest, ExporterSettings, MainToUiMessage } from '@assetport/shared';
import {
  DEFAULT_DIR,
  SERVER_EXPORT_URL,
  getCachedPreviewForScale,
  makeUniqueName,
  normalizeAssetScale,
  normalizeAssetType,
  preparePreviewForGemini,
  refreshPreviewAtScale,
  requestGeminiNameSuggestions,
  sanitizeDraftName,
} from './assetExporterUtils.ts';

export interface QueuedAssetItem {
  id: string;
  nodeId: string;
  name: string;
  type: AssetFormat;
  scale: AssetScale;
  status: 'processing' | 'renaming' | 'ready' | 'failed';
  previewUrl?: string;
  previewUrl1x?: string;
  previewUrl2x?: string;
  width?: number;
  height?: number;
  nameSuggestions?: string[];
  [key: string]: unknown;
}

interface PreviewAsset extends QueuedAssetItem {
  currentPreviewUrl: string;
  zoom: number;
}

interface ExportProgress {
  current: number;
  detail: string;
  total: number;
  visible: boolean;
}

interface Alert {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export function useAssetExporter({ geminiApiKey, exporterSettings }: { geminiApiKey: string; exporterSettings: ExporterSettings }) {
  const [relativeDir, setRelativeDir] = useState(() => exporterSettings.relativeDir || DEFAULT_DIR);
  const [defaultAssetType, setDefaultAssetType] = useState<AssetFormat>(() => normalizeAssetType(exporterSettings.defaultType));
  const [defaultAssetScale, setDefaultAssetScale] = useState<AssetScale>(() =>
    normalizeAssetScale(exporterSettings.defaultScale, exporterSettings.defaultType),
  );
  const [isAdding, setIsAdding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'clear' | 'export' | null>(null);
  const [assets, setAssets] = useState<QueuedAssetItem[]>([]);
  const assetsRef = useRef<QueuedAssetItem[]>([]);
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<PreviewAsset | null>(null);
  const [selectionState, setSelectionState] = useState({ selectedCount: 0, exportableCount: 0 });
  const [alert, setAlert] = useState<Alert | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress>({ current: 0, detail: '', total: 0, visible: false });

  const selectedCountLabel = useMemo(() => (assets.length === 1 ? '1 asset' : `${assets.length} assets`), [assets.length]);
  const currentSelectionLabel = useMemo(() => {
    if (selectionState.selectedCount === 0) return 'No layers selected';
    if (selectionState.selectedCount === 1) return '1 layer selected';
    return `${selectionState.selectedCount} layers selected`;
  }, [selectionState.selectedCount]);

  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => () => { if (alertTimeoutRef.current) window.clearTimeout(alertTimeoutRef.current); }, []);

  useEffect(() => {
    const nextType = normalizeAssetType(exporterSettings.defaultType);
    setRelativeDir(exporterSettings.relativeDir || DEFAULT_DIR);
    setDefaultAssetType(nextType);
    setDefaultAssetScale(normalizeAssetScale(exporterSettings.defaultScale, nextType));
  }, [exporterSettings]);

  useEffect(() => {
    window.parent.postMessage({ pluginMessage: { type: 'request-selection-state' } }, '*');
  }, []);

  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  const dismissAlert = () => {
    if (alertTimeoutRef.current) {
      window.clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = null;
    }
    setAlert(null);
  };

  const showAlert = (message: string, tone: Alert['tone'] = 'info', duration = 4200) => {
    dismissAlert();
    setAlert({ id: `${Date.now()}`, message, tone });
    if (duration > 0) {
      alertTimeoutRef.current = window.setTimeout(() => {
        setAlert(null);
        alertTimeoutRef.current = null;
      }, duration);
    }
  };

  const requestGeminiNameSuggestionsWithRetry = async (
    params: Parameters<typeof requestGeminiNameSuggestions>[0],
    maxAttempts = 3,
  ): Promise<{ suggestions: string[] }> => {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await requestGeminiNameSuggestions(params);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('AI rename failed.');
        if (attempt < maxAttempts) await wait(1000);
      }
    }
    throw lastError ?? new Error('AI rename failed.');
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent<{ pluginMessage?: MainToUiMessage }>) => {
      const message = event.data?.pluginMessage;
      if (!message) return;

      if (message.type === 'selection-state-updated') {
        setSelectionState({
          selectedCount: Number(message.selectedCount) || 0,
          exportableCount: Number(message.exportableCount) || 0,
        });
        return;
      }

      if (message.type === 'selection-captured') {
        setIsAdding(false);
        const incoming = Array.isArray(message.assets) ? message.assets : [];
        if (!incoming.length) return;

        const existingNodeIds = new Set(assetsRef.current.map((a) => a.nodeId));
        const existingNames = assetsRef.current.map((a) => a.name);
        const nextAssets: QueuedAssetItem[] = [];
        let duplicateCount = 0;

        incoming.forEach((captured, index) => {
          if (existingNodeIds.has(captured.nodeId)) {
            duplicateCount++;
            return;
          }
          const baseName = sanitizeDraftName(captured.name);
          const uniqueName = makeUniqueName(baseName, existingNames.concat(nextAssets.map((a) => a.name)));
          nextAssets.push({
            nodeId: captured.nodeId,
            name: uniqueName,
            type: defaultAssetType,
            scale: normalizeAssetScale(defaultAssetScale, defaultAssetType),
            previewUrl: '',
            previewUrl2x: '',
            width: captured.width,
            height: captured.height,
            id: `${captured.nodeId}-${Date.now()}-${index}`,
            status: 'processing',
          });
          existingNodeIds.add(captured.nodeId);
        });

        if (!nextAssets.length) {
          if (duplicateCount > 0) showAlert('Asset already existed', 'error');
          return;
        }

        setAssets((cur) => [...nextAssets, ...cur]);
        if (duplicateCount > 0) showAlert('Asset already existed', 'error');
        nextAssets.forEach((a) => refreshPreviewAtScale(a));
        return;
      }

      if (message.type === 'selection-context-refreshed') {
        const { nodeId, previewUrl, requestedScale } = message;
        const asset = assetsRef.current.find((a) => a.nodeId === nodeId);
        if (!asset) return;

        const hasExisting = Boolean(
          asset.previewUrl || asset.previewUrl1x || asset.previewUrl2x || asset[`previewUrl${requestedScale}x`],
        );

        setAssets((cur) =>
          cur.map((a) => {
            if (a.nodeId !== nodeId) return a;
            const updated = { ...a };
            if (requestedScale === 1) updated.previewUrl1x = previewUrl;
            else if (requestedScale === 2) updated.previewUrl2x = previewUrl;
            else updated[`previewUrl${requestedScale}x`] = previewUrl;
            updated.previewUrl = updated.previewUrl2x ?? updated.previewUrl1x ?? updated.previewUrl ?? previewUrl;
            if (!geminiApiKey.trim() || exporterSettings.autoAIRename !== true) updated.status = 'ready';
            return updated;
          }),
        );

        setPreviewAsset((cur) => {
          if (cur?.nodeId === nodeId) return { ...cur, currentPreviewUrl: previewUrl };
          return cur;
        });

        if (!hasExisting && geminiApiKey.trim() && exporterSettings.autoAIRename === true) {
          queueGeminiRename(asset.id, { apiKey: geminiApiKey.trim(), model: exporterSettings.aiModel, nodeName: asset.name, assetType: asset.type, previewUrl });
        }
        return;
      }

      if (message.type === 'asset-queue-ready') {
        setExportProgress((p) => ({ ...p, detail: 'Uploading assets to VS Code...' }));
        await uploadAssetQueue(message.assets);
        return;
      }

      if (message.type === 'preview-error') {
        setAssets((cur) => cur.map((a) => (a.nodeId === message.nodeId ? { ...a, status: 'failed' } : a)));
        showAlert(message.error, 'error', 6000);
        return;
      }

      if (message.type === 'selection-error' || message.type === 'export-error') {
        setIsAdding(false);
        setIsExporting(false);
        setExportProgress({ current: 0, detail: '', total: 0, visible: false });
        showAlert(message.error, 'error', 6000);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [defaultAssetScale, defaultAssetType, geminiApiKey, exporterSettings]);

  const queueGeminiRename = (assetId: string, params: { apiKey: string; model?: string; nodeName: string; assetType: AssetFormat; previewUrl: string }) => {
    setAssets((cur) => cur.map((a) => (a.id === assetId ? { ...a, status: 'renaming' } : a)));

    preparePreviewForGemini(params.previewUrl)
      .then((nodePreview) =>
        requestGeminiNameSuggestionsWithRetry({
          ...params,
          nodePreview,
          existingNames: assetsRef.current.filter((a) => a.id !== assetId).map((a) => a.name),
          lastAttemptedName: null,
        }),
      )
      .then(({ suggestions }) => {
        const baseName = suggestions[0] || params.nodeName;
        const newName = makeUniqueName(baseName, assetsRef.current.filter((a) => a.id !== assetId).map((a) => a.name));
        setAssets((cur) => cur.map((a) => (a.id === assetId ? { ...a, name: newName, status: 'ready', nameSuggestions: suggestions } : a)));
      })
      .catch(() => {
        setAssets((cur) => cur.map((a) => (a.id === assetId ? { ...a, status: 'failed' } : a)));
      });
  };

  const handleAIRename = (assetId: string, lastAttemptedName: string | null = null) => {
    const asset = assetsRef.current.find((a) => a.id === assetId);
    if (!asset?.previewUrl2x && !asset?.previewUrl) return;
    const effectiveKey = geminiApiKey.trim();
    if (!effectiveKey) return;

    setAssets((cur) => cur.map((a) => (a.id === assetId ? { ...a, status: 'renaming' } : a)));

    preparePreviewForGemini((asset.previewUrl2x ?? asset.previewUrl) as string)
      .then((nodePreview) =>
        requestGeminiNameSuggestionsWithRetry({
          apiKey: effectiveKey,
          model: exporterSettings.aiModel,
          nodeName: asset.name,
          assetType: asset.type,
          nodePreview,
          existingNames: assetsRef.current.filter((a) => a.id !== assetId).map((a) => a.name),
          lastAttemptedName,
        }),
      )
      .then(({ suggestions }) => {
        const newName = makeUniqueName(suggestions[0] || asset.name, assetsRef.current.filter((a) => a.id !== assetId).map((a) => a.name));
        setAssets((cur) => cur.map((a) => (a.id === assetId ? { ...a, name: newName, status: 'ready', nameSuggestions: suggestions } : a)));
      })
      .catch(() => {
        setAssets((cur) => cur.map((a) => (a.id === assetId ? { ...a, status: 'failed' } : a)));
      });
  };

  const handleAddAsset = () => {
    setIsAdding(true);
    window.parent.postMessage({ pluginMessage: { type: 'capture-selection', scale: 2 } }, '*');
  };

  const handleSaveAssetEdit = (updated: QueuedAssetItem) => {
    const existingNames = assetsRef.current.filter((a) => a.id !== updated.id).map((a) => a.name);
    const uniqueName = makeUniqueName(updated.name, existingNames);
    setAssets((cur) => cur.map((a) => (a.id === updated.id ? { ...a, name: uniqueName, type: updated.type, scale: updated.scale } : a)));
    setEditingAssetId(null);
  };

  const handleCancelAssetEdit = () => setEditingAssetId(null);

  const handlePreviewAsset = (asset: QueuedAssetItem) => {
    setPreviewAsset({ ...asset, currentPreviewUrl: getCachedPreviewForScale(asset) as string, zoom: 1 });
    refreshPreviewAtScale(asset);
  };

  const handleRemoveAsset = (assetId: string) => {
    setAssets((cur) => cur.filter((a) => a.id !== assetId));
  };

  const handleClearQueue = () => {
    setAssets([]);
    setConfirmAction(null);
  };

  const handleExportQueue = () => {
    if (!assetsRef.current.length) {
      showAlert('Add at least one asset before exporting.', 'warning');
      return;
    }

    const total = assetsRef.current.length;
    setIsExporting(true);
    setExportProgress({ current: 0, detail: `Preparing ${total} asset${total === 1 ? '' : 's'} for export...`, total, visible: true });
    window.parent.postMessage(
      {
        pluginMessage: {
          type: 'export-queue',
          relativeDir,
          compressionQuality: exporterSettings.compressionQuality,
          assets: assetsRef.current.map((a) => ({ nodeId: a.nodeId, name: a.name, type: a.type, scale: a.scale })),
        },
      },
      '*',
    );
  };

  const uploadAssetQueue = async (queuedAssets: ExportRequest[]) => {
    try {
      const savedPaths: string[] = [];
      const total = queuedAssets.length;

      for (const [index, asset] of queuedAssets.entries()) {
        setExportProgress({ current: index, detail: `Saving ${asset.fileName}.${asset.extension} to VS Code...`, total, visible: true });

        const response = await fetch(SERVER_EXPORT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(asset),
        });
        const result = await response.json() as { ok?: boolean; relativePath?: string; error?: string };

        if (!response.ok) throw new Error(result.error ?? `VS Code rejected ${asset.fileName}.${asset.extension}.`);

        savedPaths.push(result.relativePath ?? '');
        setExportProgress({ current: index + 1, detail: `Saved ${index + 1} of ${total} asset${total === 1 ? '' : 's'}.`, total, visible: true });
      }

      showAlert(`Exported ${savedPaths.length} asset${savedPaths.length === 1 ? '' : 's'} to "${relativeDir}".`, 'success', 5000);
    } catch (error) {
      showAlert(
        error instanceof Error
          ? `${error.message}\nMake sure the VS Code extension is running and the workspace folder is open.`
          : 'Export failed.',
        'error',
        7000,
      );
    } finally {
      setIsExporting(false);
      setExportProgress({ current: 0, detail: '', total: 0, visible: false });
    }
  };

  return {
    DEFAULT_DIR,
    alert,
    assets,
    confirmAction,
    defaultAssetScale,
    defaultAssetType,
    dismissAlert,
    editingAssetId,
    exportProgress,
    isAdding,
    isExporting,
    previewAsset,
    relativeDir,
    currentSelectionLabel,
    selectedCountLabel,
    selectionState,
    setConfirmAction,
    setEditingAssetId,
    setPreviewAsset,
    handleAIRename,
    handleAddAsset,
    handleCancelAssetEdit,
    handleClearQueue,
    handleExportQueue,
    handlePreviewAsset,
    handleRemoveAsset,
    handleSaveAssetEdit,
  };
}
