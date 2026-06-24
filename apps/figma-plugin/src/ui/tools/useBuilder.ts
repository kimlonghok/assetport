import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AssetFormat,
  BuilderChildLayer,
  BuilderExportNode,
  BuilderFillStyle,
  BuilderFont,
  BuilderGradient,
  BuilderNodeType,
  BuilderRect,
  BuilderScreen,
  BuilderTextStyle,
  ExportRequest,
  MainToUiMessage,
} from '@assetport/shared';
import {
  SERVER_EXPORT_URL,
  SERVER_MANIFEST_URL,
  makeUniqueName,
  sanitizeDraftName,
} from './assetExporterUtils.ts';

export const BUILDER_DEFAULT_DIR = 'figma-build';

export interface BuilderNodeItem {
  id: string;
  type: BuilderNodeType;
  name: string;
  nodeId?: string;
  /** Image format the node is exported as. */
  assetType: AssetFormat;
  previewUrl?: string;
  /** Child layers the user can hide before export, plus any manually added ones. */
  children?: BuilderChildLayer[];
  /** Child node ids hidden from this node's exported image. */
  ignoredNodeIds?: string[];
  rect?: BuilderRect;
  text?: string;
  font?: BuilderFont;
  color?: string;
  gradient?: BuilderGradient;
  textAlign?: string;
  lineHeight?: number | 'auto';
  letterSpacing?: number;
  /** Every text layer in the node tree (text type only). */
  textLayers?: BuilderTextStyle[];
  /** Every painted layer (colour/gradient + size) in the node tree (info type only). */
  fillLayers?: BuilderFillStyle[];
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

export function useBuilder() {
  const [screen, setScreen] = useState<BuilderScreen | null>(null);
  const [nodes, setNodes] = useState<BuilderNodeItem[]>([]);
  const nodesRef = useRef<BuilderNodeItem[]>([]);
  const screenRef = useRef<BuilderScreen | null>(null);
  const [relativeDir, setRelativeDir] = useState(BUILDER_DEFAULT_DIR);
  const [selectedCount, setSelectedCount] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'clear' | 'export' | null>(null);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress>({ current: 0, detail: '', total: 0, visible: false });
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodeCountLabel = useMemo(() => (nodes.length === 1 ? '1 node' : `${nodes.length} nodes`), [nodes.length]);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => () => { if (alertTimeoutRef.current) window.clearTimeout(alertTimeoutRef.current); }, []);

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

  useEffect(() => {
    const handleMessage = async (event: MessageEvent<{ pluginMessage?: MainToUiMessage }>) => {
      const message = event.data?.pluginMessage;
      if (!message) return;

      if (message.type === 'selection-state-updated') {
        setSelectedCount(Number(message.selectedCount) || 0);
        return;
      }

      if (message.type === 'builder-screen-set') {
        setScreen(message.screen);
        showAlert(`Screen set to "${message.screen.name}" (${message.screen.width}×${message.screen.height}).`, 'success');
        return;
      }

      if (message.type === 'builder-node-captured') {
        setIsAdding(false);
        const captured = message.node;
        if (nodesRef.current.some((n) => n.nodeId === captured.nodeId)) {
          showAlert('That layer is already a node.', 'warning');
          return;
        }
        const baseName = sanitizeDraftName(captured.name);
        const uniqueName = makeUniqueName(baseName, nodesRef.current.map((n) => n.name));
        const item: BuilderNodeItem = {
          id: `${captured.nodeId}-${Date.now()}`,
          type: captured.type,
          name: uniqueName,
          nodeId: captured.nodeId,
          assetType: 'png',
          previewUrl: captured.previewUrl,
          children: captured.children,
          ignoredNodeIds: [],
          rect: captured.rect,
          text: captured.text,
          font: captured.font,
          color: captured.color,
          gradient: captured.gradient,
          textAlign: captured.textAlign,
          lineHeight: captured.lineHeight,
          letterSpacing: captured.letterSpacing,
          textLayers: captured.textLayers,
          fillLayers: captured.fillLayers,
        };
        setNodes((cur) => [...cur, item]);
        return;
      }

      if (message.type === 'builder-child-captured') {
        setIsAdding(false);
        const { nodeItemId, child } = message;
        setNodes((cur) =>
          cur.map((n) => {
            if (n.id !== nodeItemId) return n;
            const existing = n.children ?? [];
            if (existing.some((c) => c.nodeId === child.nodeId) || n.nodeId === child.nodeId) {
              showAlert('That layer is already in this node.', 'warning');
              return n;
            }
            return { ...n, children: [...existing, child] };
          }),
        );
        return;
      }

      if (message.type === 'builder-preview-refreshed') {
        setNodes((cur) => cur.map((n) => (n.id === message.nodeItemId ? { ...n, previewUrl: message.previewUrl } : n)));
        return;
      }

      if (message.type === 'builder-export-ready') {
        const { images, manifest, failures = [] } = message;
        await uploadBuilder(images, manifest, failures);
        return;
      }

      if (message.type === 'builder-error') {
        setIsAdding(false);
        setIsExporting(false);
        setExportProgress({ current: 0, detail: '', total: 0, visible: false });
        showAlert(message.error, 'error', 6000);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.parent.postMessage({ pluginMessage: { type: 'request-selection-state' } }, '*');
  }, []);

  const handleSetScreen = () => {
    window.parent.postMessage({ pluginMessage: { type: 'set-builder-screen' } }, '*');
  };

  const handleAddNode = (nodeType: BuilderNodeType) => {
    setIsAdding(true);
    window.parent.postMessage(
      { pluginMessage: { type: 'capture-builder-node', nodeType, screenNodeId: screenRef.current?.nodeId } },
      '*',
    );
  };

  const handleAddChild = (nodeItemId: string) => {
    setIsAdding(true);
    window.parent.postMessage({ pluginMessage: { type: 'capture-builder-child', nodeItemId } }, '*');
  };

  const handleUpdateNode = (id: string, patch: Partial<BuilderNodeItem>) => {
    setNodes((cur) =>
      cur.map((n) => {
        if (n.id !== id) return n;
        const next = { ...n, ...patch };
        if (patch.name !== undefined) {
          const base = sanitizeDraftName(patch.name) || n.name;
          next.name = makeUniqueName(base, cur.filter((o) => o.id !== id).map((o) => o.name));
        }
        return next;
      }),
    );
  };

  const handleRemoveNode = (id: string) => setNodes((cur) => cur.filter((n) => n.id !== id));

  const handleToggleHidden = (nodeItemId: string, childNodeId: string) => {
    const item = nodesRef.current.find((n) => n.id === nodeItemId);
    if (!item || !item.nodeId) return;
    const current = item.ignoredNodeIds ?? [];
    const ignoredNodeIds = current.includes(childNodeId)
      ? current.filter((id) => id !== childNodeId)
      : [...current, childNodeId];

    setNodes((cur) => cur.map((n) => (n.id === nodeItemId ? { ...n, ignoredNodeIds } : n)));
    window.parent.postMessage(
      { pluginMessage: { type: 'refresh-builder-preview', nodeItemId, nodeId: item.nodeId, ignoredNodeIds } },
      '*',
    );
  };

  const handleMoveNode = (id: string, direction: -1 | 1) => {
    setNodes((cur) => {
      const index = cur.findIndex((n) => n.id === id);
      if (index < 0) return cur;
      const target = index + direction;
      if (target < 0 || target >= cur.length) return cur;
      const next = [...cur];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleClear = () => {
    setNodes([]);
    setConfirmAction(null);
  };

  const handleExport = (dir: string) => {
    if (!nodesRef.current.length) {
      showAlert('Add at least one node before exporting.', 'warning');
      return;
    }
    const effectiveDir = dir.trim() || BUILDER_DEFAULT_DIR;
    setRelativeDir(effectiveDir);

    const exportNodes: BuilderExportNode[] = nodesRef.current.map((n) => ({
      id: n.id,
      type: n.type,
      name: n.name,
      nodeId: n.nodeId,
      assetType: n.assetType,
      ignoredNodeIds: n.ignoredNodeIds,
      rect: n.rect,
      text: n.text,
      font: n.font,
      color: n.color,
      gradient: n.gradient,
      textAlign: n.textAlign,
      lineHeight: n.lineHeight,
      letterSpacing: n.letterSpacing,
      textLayers: n.textLayers,
      fillLayers: n.fillLayers,
    }));

    setIsExporting(true);
    setExportProgress({ current: 0, detail: 'Preparing build…', total: exportNodes.length, visible: true });
    window.parent.postMessage(
      {
        pluginMessage: {
          type: 'export-builder',
          relativeDir: effectiveDir,
          screen: screenRef.current,
          nodes: exportNodes,
        },
      },
      '*',
    );
  };

  const postWithRetry = async (url: string, payload: unknown, label: string): Promise<string> => {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = (await response.json()) as { ok?: boolean; relativePath?: string; error?: string };
        if (!response.ok) throw new Error(result.error ?? `VS Code rejected ${label}.`);
        return result.relativePath ?? '';
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Upload failed.');
        if (attempt < 3) await wait(1000);
      }
    }
    throw lastError ?? new Error('Upload failed.');
  };

  const uploadBuilder = async (
    images: ExportRequest[],
    manifest: { fileName: string; content: string },
    figmaFailures: { name: string; error: string }[],
  ) => {
    try {
      const total = images.length + 1;
      let done = 0;

      for (const image of images) {
        setExportProgress({ current: done, detail: `Uploading ${image.fileName}.${image.extension}…`, total, visible: true });
        await postWithRetry(SERVER_EXPORT_URL, image, `${image.fileName}.${image.extension}`);
        done++;
      }

      setExportProgress({ current: done, detail: 'Writing builder.json…', total, visible: true });
      await postWithRetry(
        SERVER_MANIFEST_URL,
        { relativeDir: relativeDir, fileName: manifest.fileName, content: manifest.content },
        'builder.json',
      );
      done++;

      const skipCount = figmaFailures.length;
      if (skipCount > 0) {
        const skipped = figmaFailures.map((f) => f.name).join(', ');
        showAlert(`Exported build with ${images.length} asset${images.length === 1 ? '' : 's'}. Skipped ${skipCount} (${skipped}).`, 'warning', 8000);
      } else {
        showAlert(`Exported build to "${relativeDir}" — ${images.length} asset${images.length === 1 ? '' : 's'} + builder.json.`, 'success', 6000);
      }
    } catch (error) {
      showAlert(
        error instanceof Error
          ? `${error.message}\nMake sure the VS Code extension is running and a workspace folder is open.`
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
  };
}
