import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetFormat, AssetScale, CombinedMember, ExportRequest, ExporterSettings, IgnoredNode, MainToUiMessage } from '@assetport/shared';
import type { CroppedSection, SectionSource } from '../components/SectionCropperModal.tsx';
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
  /** Source layers merged into a single asset. Present only for "combined" assets (length >= 2). */
  nodeIds?: string[];
  /** Per-source metadata for editing a combined asset's members. */
  members?: CombinedMember[];
  name: string;
  type: AssetFormat;
  scale: AssetScale;
  status: 'processing' | 'renaming' | 'ready' | 'preview-failed' | 'rename-failed';
  previews: Record<number, string>;
  previewUrl: string;
  width?: number;
  height?: number;
  nameSuggestions?: string[];
  /** Descendant layers hidden when this asset is exported. */
  ignoredNodes?: IgnoredNode[];
  /**
   * Pre-cropped base64 image bytes (no data-URL prefix). Present only for "section" assets sliced
   * from a screenshot. These have no Figma node, so preview refresh / ignore / combine don't apply.
   */
  imageData?: string;
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
  const [isCapturingSection, setIsCapturingSection] = useState(false);
  const [sectionSource, setSectionSource] = useState<SectionSource | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'clear' | 'export' | null>(null);
  const [assets, setAssets] = useState<QueuedAssetItem[]>([]);
  const assetsRef = useRef<QueuedAssetItem[]>([]);
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [ignoreEditorAssetId, setIgnoreEditorAssetId] = useState<string | null>(null);
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

      if (message.type === 'section-source-captured') {
        setIsCapturingSection(false);
        setSectionSource({ url: message.previewUrl, width: message.width, height: message.height, name: message.name });
        return;
      }

      if (message.type === 'section-error') {
        setIsCapturingSection(false);
        showAlert(message.error, 'error', 6000);
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
          const previewUrl = captured.previewUrl ?? '';
          const hasPreview = Boolean(previewUrl);
          const noGemini = !geminiApiKey.trim() || exporterSettings.autoAIRename !== true;
          nextAssets.push({
            nodeId: captured.nodeId,
            nodeIds: captured.nodeIds,
            members: captured.members,
            name: uniqueName,
            type: defaultAssetType,
            scale: normalizeAssetScale(defaultAssetScale, defaultAssetType),
            previews: hasPreview ? { 2: previewUrl } : {},
            previewUrl,
            width: captured.width,
            height: captured.height,
            id: `${captured.nodeId}-${Date.now()}-${index}`,
            status: hasPreview && noGemini ? 'ready' : 'processing',
          });
          existingNodeIds.add(captured.nodeId);
        });

        if (!nextAssets.length) {
          if (duplicateCount > 0) showAlert('Asset already existed', 'error');
          return;
        }

        setAssets((cur) => [...nextAssets, ...cur]);
        if (duplicateCount > 0) showAlert('Asset already existed', 'error');

        nextAssets.forEach((a) => {
          if (!a.previewUrl) {
            // Preview export failed — retry via the normal refresh path.
            refreshPreviewAtScale(a);
          } else if (geminiApiKey.trim() && exporterSettings.autoAIRename === true) {
            queueGeminiRename(a.id, { apiKey: geminiApiKey.trim(), model: exporterSettings.aiModel, nodeName: a.name, assetType: a.type, previewUrl: a.previewUrl });
          }
        });
        return;
      }

      if (message.type === 'selection-context-refreshed') {
        const { nodeId, previewUrl, requestedScale } = message;
        const asset = assetsRef.current.find((a) => a.nodeId === nodeId);
        if (!asset) return;

        const hasExisting = Object.keys(asset.previews).length > 0;

        setAssets((cur) =>
          cur.map((a) => {
            if (a.nodeId !== nodeId) return a;
            const nextPreviews = { ...a.previews, [requestedScale]: previewUrl };
            // Prefer the scale we just re-rendered so ignore-layer changes are reflected;
            // assets are captured at 2x, so falling back to previews[2] would show a stale, ignore-less image.
            const nextPreviewUrl = nextPreviews[requestedScale] ?? nextPreviews[2] ?? nextPreviews[1] ?? previewUrl;
            const nextStatus = !geminiApiKey.trim() || exporterSettings.autoAIRename !== true ? 'ready' as const : a.status;
            return { ...a, previews: nextPreviews, previewUrl: nextPreviewUrl, status: nextStatus };
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
        const { assets: exportedAssets, failures = [] } = message;
        setExportProgress((p) => ({ ...p, detail: 'Uploading assets to VS Code...' }));
        await uploadAssetQueue(exportedAssets, failures);
        return;
      }

      if (message.type === 'ignore-selection-captured') {
        const { assetId, nodes, invalidCount } = message;
        const asset = assetsRef.current.find((a) => a.id === assetId);
        if (!asset) return;

        const existing = asset.ignoredNodes ?? [];
        const existingIds = new Set(existing.map((n) => n.nodeId));
        const added = nodes.filter((n) => !existingIds.has(n.nodeId));

        if (added.length) {
          const nextIgnored = [...existing, ...added];
          setAssets((cur) => cur.map((a) => (a.id === assetId ? { ...a, ignoredNodes: nextIgnored } : a)));
          // Re-render the thumbnail with the ignored layers hidden so the user sees the result.
          refreshPreviewAtScale({ ...asset, ignoredNodes: nextIgnored });
          showAlert(`Added ${added.length} layer${added.length === 1 ? '' : 's'} to the ignore list.`, 'success');
        } else if (invalidCount > 0) {
          showAlert('Select a layer that lives inside this asset.', 'warning');
        } else {
          showAlert('Those layers are already in the ignore list.', 'info');
        }
        return;
      }

      if (message.type === 'preview-error') {
        setAssets((cur) => cur.map((a) => (a.nodeId === message.nodeId ? { ...a, status: 'preview-failed' } : a)));
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
        setAssets((cur) => {
          const target = cur.find((a) => a.id === assetId);
          if (!target) return cur;
          const baseName = suggestions[0] || params.nodeName;
          const newName = makeUniqueName(baseName, cur.filter((a) => a.id !== assetId).map((a) => a.name));
          return cur.map((a) => (a.id === assetId ? { ...a, name: newName, status: 'ready', nameSuggestions: suggestions } : a));
        });
      })
      .catch(() => {
        setAssets((cur) => {
          if (!cur.some((a) => a.id === assetId)) return cur;
          return cur.map((a) => (a.id === assetId ? { ...a, status: 'rename-failed' } : a));
        });
      });
  };

  const handleAIRename = (assetId: string, lastAttemptedName: string | null = null) => {
    const asset = assetsRef.current.find((a) => a.id === assetId);
    if (!asset) return;
    const bestPreview = asset.previews[2] ?? asset.previews[1] ?? asset.previewUrl;
    if (!bestPreview) return;
    const effectiveKey = geminiApiKey.trim();
    if (!effectiveKey) return;

    setAssets((cur) => cur.map((a) => (a.id === assetId ? { ...a, status: 'renaming' } : a)));

    preparePreviewForGemini(bestPreview)
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
        setAssets((cur) => {
          const target = cur.find((a) => a.id === assetId);
          if (!target) return cur;
          const newName = makeUniqueName(suggestions[0] || asset.name, cur.filter((a) => a.id !== assetId).map((a) => a.name));
          return cur.map((a) => (a.id === assetId ? { ...a, name: newName, status: 'ready', nameSuggestions: suggestions } : a));
        });
      })
      .catch(() => {
        setAssets((cur) => {
          if (!cur.some((a) => a.id === assetId)) return cur;
          return cur.map((a) => (a.id === assetId ? { ...a, status: 'rename-failed' } : a));
        });
      });
  };

  const handleAddAsset = () => {
    setIsAdding(true);
    window.parent.postMessage({ pluginMessage: { type: 'capture-selection', scale: 2 } }, '*');
  };

  const handleCombineAssets = () => {
    setIsAdding(true);
    window.parent.postMessage({ pluginMessage: { type: 'capture-combined-selection', scale: 2 } }, '*');
  };

  /** Screenshots the current selection so it can be sliced into sections in the cropper modal. */
  const handleStartSection = () => {
    setIsCapturingSection(true);
    window.parent.postMessage({ pluginMessage: { type: 'capture-section-source', scale: 2 } }, '*');
  };

  const handleCancelSection = () => setSectionSource(null);

  /** Adds each cropped section to the queue as an image-backed asset, then closes the cropper. */
  const handleAddSections = (sections: CroppedSection[]) => {
    if (!sections.length) {
      setSectionSource(null);
      return;
    }

    const existingNames = assetsRef.current.map((a) => a.name);
    const stamp = Date.now();
    const newItems: QueuedAssetItem[] = sections.map((section, index) => {
      const uniqueName = makeUniqueName(section.name, existingNames);
      existingNames.push(uniqueName);
      return {
        id: `section-${stamp}-${index}`,
        // Synthetic id — section assets have no Figma node. Export keys off imageData, not this.
        nodeId: `section:${stamp}-${index}`,
        name: uniqueName,
        type: section.type,
        scale: 2,
        previews: { 2: section.previewUrl },
        previewUrl: section.previewUrl,
        width: section.width,
        height: section.height,
        status: 'ready',
        imageData: section.imageData,
      };
    });

    setAssets((cur) => [...newItems, ...cur]);
    setSectionSource(null);
    showAlert(`Added ${newItems.length} section${newItems.length === 1 ? '' : 's'} to the queue.`, 'success');
  };

  const handleSaveAssetEdit = (updated: QueuedAssetItem) => {
    const existingNames = assetsRef.current.filter((a) => a.id !== updated.id).map((a) => a.name);
    const uniqueName = makeUniqueName(updated.name, existingNames);
    setAssets((cur) => cur.map((a) => (a.id === updated.id ? { ...a, name: uniqueName, type: updated.type, scale: updated.scale } : a)));
    setEditingAssetId(null);
  };

  const handleCancelAssetEdit = () => setEditingAssetId(null);

  const handlePreviewAsset = (asset: QueuedAssetItem) => {
    setPreviewAsset({ ...asset, currentPreviewUrl: getCachedPreviewForScale(asset), zoom: 1 });
    // Section assets are static crops with no backing node — nothing to re-render.
    if (!asset.imageData) refreshPreviewAtScale(asset);
  };

  const handleRemoveAsset = (assetId: string) => {
    setAssets((cur) => cur.filter((a) => a.id !== assetId));
    setIgnoreEditorAssetId((cur) => (cur === assetId ? null : cur));
  };

  const handleOpenIgnoreEditor = (assetId: string) => setIgnoreEditorAssetId(assetId);
  const handleCloseIgnoreEditor = () => setIgnoreEditorAssetId(null);

  const handleAddIgnoreSelection = (assetId: string) => {
    const asset = assetsRef.current.find((a) => a.id === assetId);
    if (!asset) return;
    window.parent.postMessage(
      { pluginMessage: { type: 'capture-ignore-selection', assetId, parentNodeId: asset.nodeId, parentNodeIds: asset.nodeIds } },
      '*',
    );
  };

  /** Removes one source layer from a combined asset. Dropping to a single layer turns it back into a normal asset. */
  const handleRemoveMergeMember = (assetId: string, nodeId: string) => {
    const asset = assetsRef.current.find((a) => a.id === assetId);
    if (!asset || !asset.nodeIds) return;

    const nextIds = asset.nodeIds.filter((id) => id !== nodeId);
    const nextMembers = (asset.members ?? []).filter((m) => m.nodeId !== nodeId);
    // Keep ignored layers only if they still belong to a remaining member's subtree is hard to know here;
    // dropping a member rarely invalidates them, and stale ids are simply skipped on export.
    const nextIgnored = asset.ignoredNodes;

    if (nextIds.length <= 1) {
      const remainingId = nextIds[0] ?? asset.nodeId;
      const single = {
        ...asset,
        nodeId: remainingId,
        nodeIds: undefined,
        members: undefined,
        ignoredNodes: nextIgnored,
        status: 'processing' as const,
      };
      setAssets((cur) => cur.map((a) => (a.id === assetId ? single : a)));
      setIgnoreEditorAssetId((cur) => (cur === assetId ? null : cur));
      refreshPreviewAtScale(single);
      return;
    }

    const updated = { ...asset, nodeIds: nextIds, members: nextMembers, ignoredNodes: nextIgnored, status: 'processing' as const };
    setAssets((cur) => cur.map((a) => (a.id === assetId ? updated : a)));
    refreshPreviewAtScale(updated);
  };

  const handleRemoveIgnoreNode = (assetId: string, nodeId: string) => {
    const asset = assetsRef.current.find((a) => a.id === assetId);
    if (!asset) return;
    const nextIgnored = (asset.ignoredNodes ?? []).filter((n) => n.nodeId !== nodeId);
    setAssets((cur) => cur.map((a) => (a.id === assetId ? { ...a, ignoredNodes: nextIgnored } : a)));
    refreshPreviewAtScale({ ...asset, ignoredNodes: nextIgnored });
  };

  const handleRetryPreview = (assetId: string) => {
    const asset = assetsRef.current.find((a) => a.id === assetId);
    if (!asset) return;
    setAssets((cur) => cur.map((a) => (a.id === assetId ? { ...a, status: 'processing' } : a)));
    refreshPreviewAtScale(asset);
  };

  const handleClearQueue = () => {
    setAssets([]);
    setConfirmAction(null);
  };

  const handleExportQueue = (dir: string) => {
    if (!assetsRef.current.length) {
      showAlert('Add at least one asset before exporting.', 'warning');
      return;
    }

    const effectiveDir = dir.trim() || DEFAULT_DIR;
    if (effectiveDir !== relativeDir) {
      setRelativeDir(effectiveDir);
      window.parent.postMessage(
        { pluginMessage: { type: 'save-exporter-settings', settings: { ...exporterSettings, relativeDir: effectiveDir } } },
        '*',
      );
    }

    const total = assetsRef.current.length;
    setIsExporting(true);
    setExportProgress({ current: 0, detail: `Preparing ${total} asset${total === 1 ? '' : 's'} for export...`, total, visible: true });
    window.parent.postMessage(
      {
        pluginMessage: {
          type: 'export-queue',
          relativeDir: effectiveDir,
          compressionQuality: exporterSettings.compressionQuality,
          assets: assetsRef.current.map((a) => ({
            nodeId: a.nodeId,
            nodeIds: a.nodeIds,
            name: a.name,
            type: a.type,
            scale: a.scale,
            ignoredNodeIds: (a.ignoredNodes ?? []).map((n) => n.nodeId),
            imageData: a.imageData,
          })),
        },
      },
      '*',
    );
  };

  const uploadAssetQueue = async (queuedAssets: ExportRequest[], figmaFailures: { name: string; error: string }[] = []) => {
    try {
      const savedPaths: string[] = [];
      const total = queuedAssets.length;

      for (const [index, asset] of queuedAssets.entries()) {
        setExportProgress({ current: index, detail: `Uploading ${asset.fileName}.${asset.extension}...`, total, visible: true });

        let lastError: Error | null = null;
        let saved = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const response = await fetch(SERVER_EXPORT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(asset),
            });
            const result = await response.json() as { ok?: boolean; relativePath?: string; error?: string };
            if (!response.ok) throw new Error(result.error ?? `VS Code rejected ${asset.fileName}.${asset.extension}.`);
            savedPaths.push(result.relativePath ?? '');
            saved = true;
            break;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error('Upload failed.');
            if (attempt < 3) await wait(1000);
          }
        }

        if (!saved) throw lastError ?? new Error('Upload failed.');

        setExportProgress({ current: index + 1, detail: `Saved ${index + 1} of ${total} asset${total === 1 ? '' : 's'}.`, total, visible: true });
      }

      const successCount = savedPaths.length;
      const skipCount = figmaFailures.length;

      if (skipCount > 0) {
        const skippedNames = figmaFailures.map((f) => f.name).join(', ');
        showAlert(
          `Exported ${successCount} asset${successCount === 1 ? '' : 's'}. Skipped ${skipCount} (${skippedNames}): layer${skipCount === 1 ? '' : 's'} no longer available in Figma.`,
          'warning',
          8000,
        );
      } else {
        showAlert(`Exported ${successCount} asset${successCount === 1 ? '' : 's'} to "${relativeDir}".`, 'success', 5000);
      }
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
    ignoreEditorAssetId,
    isAdding,
    isCapturingSection,
    isExporting,
    previewAsset,
    relativeDir,
    sectionSource,
    currentSelectionLabel,
    selectedCountLabel,
    selectionState,
    setConfirmAction,
    setEditingAssetId,
    setPreviewAsset,
    handleAIRename,
    handleAddAsset,
    handleAddSections,
    handleCancelSection,
    handleCombineAssets,
    handleStartSection,
    handleAddIgnoreSelection,
    handleCancelAssetEdit,
    handleClearQueue,
    handleCloseIgnoreEditor,
    handleExportQueue,
    handleOpenIgnoreEditor,
    handlePreviewAsset,
    handleRemoveAsset,
    handleRemoveIgnoreNode,
    handleRemoveMergeMember,
    handleRetryPreview,
    handleSaveAssetEdit,
  };
}
