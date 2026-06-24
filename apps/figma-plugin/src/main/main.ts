import type {
  BuilderChildLayer,
  BuilderExportNode,
  BuilderFillStyle,
  BuilderFont,
  BuilderGradient,
  BuilderManifest,
  BuilderManifestNode,
  BuilderNodeCapture,
  BuilderNodeType,
  BuilderRect,
  BuilderScreen,
  BuilderTextStyle,
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

      if (message.type === 'set-builder-screen') {
        const screen = captureBuilderScreen();
        send({ type: 'builder-screen-set', screen });
        return;
      }

      if (message.type === 'capture-builder-node') {
        const node = await captureBuilderNode(message.nodeType, message.screenNodeId);
        send({ type: 'builder-node-captured', node });
        return;
      }

      if (message.type === 'capture-builder-child') {
        const child = await captureBuilderChild();
        send({ type: 'builder-child-captured', nodeItemId: message.nodeItemId, child });
        return;
      }

      if (message.type === 'refresh-builder-preview') {
        const previewUrl = await renderBuilderPreview(message.nodeId, message.ignoredNodeIds);
        send({ type: 'builder-preview-refreshed', nodeItemId: message.nodeItemId, previewUrl });
        return;
      }

      if (message.type === 'export-builder') {
        const result = await exportBuilder(message.nodes, message.screen, message.relativeDir, message.compressionQuality);
        send({ type: 'builder-export-ready', ...result });
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
  assets: { nodeId: string; name: string; type: string; scale: number; ignoredNodeIds?: string[]; nodeIds?: string[] }[],
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


// --- Builder ---------------------------------------------------------------

/** Captures the first selected layer as the Builder's screen/coordinate root. */
function captureBuilderScreen(): BuilderScreen {
  const node = figma.currentPage.selection[0];
  if (!node) throw new Error('Select the screen frame in Figma, then set it as the screen.');
  const rect = getAbsoluteRect(node);
  return {
    nodeId: node.id,
    name: node.name || 'screen',
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

/** Reads geometry, text, colour and gradient off the selected layer for one Builder node. */
async function captureBuilderNode(
  type: BuilderNodeType,
  screenNodeId?: string,
): Promise<BuilderNodeCapture> {
  const node = figma.currentPage.selection[0];
  if (!node) throw new Error('Select a layer in Figma to add it as a node.');

  const origin = await getScreenOrigin(screenNodeId);
  const rect = getRelativeRect(node, origin);

  const capture: BuilderNodeCapture = {
    nodeId: node.id,
    type,
    name: node.name || type,
    rect,
  };

  if (typeof (node as ExportableNode).exportAsync === 'function') {
    try {
      capture.previewUrl = (await exportNodePreview(node as ExportableSceneNode, 1)).previewUrl;
    } catch {
      // Thumbnail is best-effort.
    }
  }

  if (type !== 'text' && 'children' in node) {
    capture.children = await collectBuilderChildren(node as ChildrenMixin & SceneNode);
  }

  if (type === 'asset') {
    // Assets are about the image only — no typography or fill metadata is captured.
    return capture;
  }

  if (type === 'text') {
    // Pull every text layer in the node tree: content, font (family/style/weight/size) and colour.
    const textLayers = collectTextStyles(node, origin);
    if (textLayers.length) {
      capture.textLayers = textLayers;
      // Mirror the first layer onto the top-level fields so the card has a quick summary.
      const primary = textLayers[0];
      capture.text = primary.text;
      capture.font = primary.font;
      capture.color = primary.color;
      capture.gradient = primary.gradient;
      capture.textAlign = primary.textAlign;
      capture.lineHeight = primary.lineHeight;
      capture.letterSpacing = primary.letterSpacing;
    }
    return capture;
  }

  // info — pull every painted layer in the node tree: colour, gradient and size.
  const fillLayers = collectFillStyles(node, origin);
  if (fillLayers.length) {
    capture.fillLayers = fillLayers;
    const primary = fillLayers[0];
    capture.color = primary.color;
    capture.gradient = primary.gradient;
  }

  return capture;
}

/** Walks a node tree and reads the typography off every visible text layer it contains. */
function collectTextStyles(root: SceneNode, origin: { x: number; y: number }): BuilderTextStyle[] {
  const styles: BuilderTextStyle[] = [];
  const visit = (node: SceneNode) => {
    if (node.visible === false) return;
    if (node.type === 'TEXT') styles.push(readTextStyle(node as TextNode, origin));
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) visit(child as SceneNode);
    }
  };
  visit(root);
  return styles;
}

function readTextStyle(node: TextNode, origin: { x: number; y: number }): BuilderTextStyle {
  return {
    name: node.name || 'text',
    text: node.characters,
    font: readBuilderFont(node),
    color: getSolidFillHex(node.fills),
    gradient: readBuilderGradient(node.fills),
    textAlign: String(node.textAlignHorizontal),
    lineHeight: readLineHeight(node),
    letterSpacing: readLetterSpacing(node),
    rect: getRelativeRect(node, origin),
  };
}

/** Walks a node tree and reads the colour/gradient + size off every visible painted layer it contains. */
function collectFillStyles(root: SceneNode, origin: { x: number; y: number }): BuilderFillStyle[] {
  const styles: BuilderFillStyle[] = [];
  const visit = (node: SceneNode) => {
    if (node.visible === false) return;
    if ('fills' in node) {
      const color = getSolidFillHex((node as GeometryMixin).fills);
      const gradient = readBuilderGradient((node as GeometryMixin).fills);
      if (color || gradient) {
        styles.push({ name: node.name || node.type, color, gradient, rect: getRelativeRect(node, origin) });
      }
    }
    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) visit(child as SceneNode);
    }
  };
  visit(root);
  return styles;
}

/** Captures the currently selected layer as a child entry to add to a node's Layers list. */
async function captureBuilderChild(): Promise<BuilderChildLayer> {
  const node = figma.currentPage.selection[0];
  if (!node) throw new Error('Select a layer in Figma to add it to this node.');
  const entry: BuilderChildLayer = { nodeId: node.id, name: node.name || node.type, type: node.type };
  if (typeof (node as ExportableNode).exportAsync === 'function') {
    try {
      entry.previewUrl = (await exportNodePreview(node as ExportableSceneNode, 1)).previewUrl;
    } catch {
      // Thumbnail is best-effort — the UI falls back to a type icon.
    }
  }
  return entry;
}

/** Lists a node layer's immediate children so the user can toggle which ones to bake into the image. */
async function collectBuilderChildren(node: ChildrenMixin & SceneNode): Promise<BuilderChildLayer[]> {
  const children: BuilderChildLayer[] = [];
  for (const child of node.children) {
    const entry: BuilderChildLayer = { nodeId: child.id, name: child.name || child.type, type: child.type };
    if (typeof (child as ExportableNode).exportAsync === 'function') {
      try {
        entry.previewUrl = (await exportNodePreview(child as ExportableSceneNode, 1)).previewUrl;
      } catch {
        // Thumbnail is best-effort — the UI falls back to a type icon.
      }
    }
    children.push(entry);
  }
  return children;
}

/** Re-renders a step's image preview with the given descendants hidden. */
async function renderBuilderPreview(nodeId: string, ignoredNodeIds?: string[]): Promise<string> {
  const node = await getExportableNode(nodeId);
  const restore = await hideNodes(ignoredNodeIds);
  try {
    return (await exportNodePreview(node, 1)).previewUrl;
  } finally {
    restore();
  }
}

/** Exports every Builder node's image (plus the screen) into an `assets/` folder and assembles the manifest. */
async function exportBuilder(
  nodes: BuilderExportNode[],
  screen: BuilderScreen | null,
  relativeDir: string,
  compressionQuality?: number,
): Promise<{ images: ExportRequest[]; manifest: { fileName: string; content: string }; failures: { name: string; error: string }[] }> {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('Add at least one node before exporting.');
  }

  const quality = normalizeCompressionQuality(compressionQuality);
  const dir = buildRelativeDir(relativeDir);
  const assetsDir = `${dir}/assets`;
  const images: ExportRequest[] = [];
  const failures: { name: string; error: string }[] = [];
  const manifestNodes: BuilderManifestNode[] = [];
  const usedNames = new Set<string>();

  // The screen frame itself, so the AI has the full composition to work from.
  let screenAsset: string | undefined;
  if (screen?.nodeId) {
    try {
      const node = await getExportableNode(screen.nodeId);
      const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
      const fileName = uniqueFileName(sanitizeFileName(screen.name) || 'screen', usedNames);
      images.push({ fileName, extension: 'png', relativeDir: assetsDir, base64Data: bytesToBase64(bytes), compressionQuality: quality });
      screenAsset = `${assetsDir}/${fileName}.png`;
    } catch (error) {
      failures.push({ name: screen.name || 'screen', error: toErrorMessage(error) });
    }
  }

  for (const [index, item] of nodes.entries()) {
    const manifestNode: BuilderManifestNode = {
      order: index + 1,
      type: item.type,
      name: item.name,
    };
    if (item.rect) manifestNode.rect = item.rect;
    if (item.type === 'text') {
      // Text nodes carry typography for every text layer; assets stay image-only.
      if (item.textLayers?.length) manifestNode.textLayers = item.textLayers;
      if (item.text !== undefined) manifestNode.text = item.text;
      if (item.font) manifestNode.font = item.font;
      if (item.color) manifestNode.color = item.color;
      if (item.gradient) manifestNode.gradient = item.gradient;
      if (item.textAlign) manifestNode.textAlign = item.textAlign;
      if (item.lineHeight !== undefined) manifestNode.lineHeight = item.lineHeight;
      if (item.letterSpacing !== undefined) manifestNode.letterSpacing = item.letterSpacing;
    } else if (item.type === 'info') {
      // Info nodes carry colour/gradient/size for every painted layer.
      if (item.fillLayers?.length) manifestNode.fillLayers = item.fillLayers;
      if (item.color) manifestNode.color = item.color;
      if (item.gradient) manifestNode.gradient = item.gradient;
    }

    if (item.nodeId) {
      try {
        const format = normalizeFormat(item.assetType ?? 'png');
        const node = await getExportableNode(item.nodeId);
        const restore = await hideNodes(item.ignoredNodeIds);
        let bytes: Uint8Array;
        try {
          bytes = await node.exportAsync({
            format,
            constraint: { type: 'SCALE', value: format === 'SVG' ? 1 : 2 },
          });
        } finally {
          restore();
        }
        const extension = (item.assetType ?? 'png') as ExportRequest['extension'];
        const fileName = uniqueFileName(sanitizeFileName(item.name), usedNames);
        images.push({ fileName, extension, relativeDir: assetsDir, base64Data: bytesToBase64(bytes), compressionQuality: quality });
        manifestNode.asset = `${assetsDir}/${fileName}.${extension}`;
      } catch (error) {
        failures.push({ name: item.name, error: toErrorMessage(error) });
      }
    }

    manifestNodes.push(manifestNode);
  }

  const manifest: BuilderManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    screen: screen ? { name: screen.name, width: screen.width, height: screen.height, asset: screenAsset } : null,
    nodes: manifestNodes,
  };

  return {
    images,
    manifest: { fileName: 'builder', content: JSON.stringify(manifest, null, 2) },
    failures,
  };
}

/** Ensures every exported file lands at a distinct path even when node names collide. */
function uniqueFileName(base: string, used: Set<string>): string {
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) name = `${base}-${n++}`;
  used.add(name.toLowerCase());
  return name;
}

async function getScreenOrigin(screenNodeId?: string): Promise<{ x: number; y: number }> {
  if (!screenNodeId) return { x: 0, y: 0 };
  try {
    const node = await figma.getNodeByIdAsync(screenNodeId);
    if (node && 'absoluteBoundingBox' in node) {
      const rect = getAbsoluteRect(node as SceneNode);
      return { x: rect.x, y: rect.y };
    }
  } catch {
    // Screen layer is gone — fall back to absolute coordinates.
  }
  return { x: 0, y: 0 };
}

function getAbsoluteRect(node: BaseNode): BuilderRect {
  const box = 'absoluteBoundingBox' in node ? (node as SceneNode).absoluteBoundingBox : null;
  if (box) return { x: box.x, y: box.y, width: box.width, height: box.height };
  const w = 'width' in node ? (node as LayoutMixin).width : 0;
  const h = 'height' in node ? (node as LayoutMixin).height : 0;
  return { x: 0, y: 0, width: w, height: h };
}

function getRelativeRect(node: BaseNode, origin: { x: number; y: number }): BuilderRect {
  const rect = getAbsoluteRect(node);
  return {
    x: Math.round(rect.x - origin.x),
    y: Math.round(rect.y - origin.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function readBuilderFont(node: TextNode): BuilderFont {
  const fontName = node.fontName;
  const family = fontName !== figma.mixed ? fontName.family : 'Mixed';
  const style = fontName !== figma.mixed ? fontName.style : 'Mixed';
  const size = node.fontSize === figma.mixed ? 'mixed' : Math.round(node.fontSize);
  const weight = node.fontWeight === figma.mixed ? undefined : node.fontWeight;
  return { size, family, style, weight };
}

function readLineHeight(node: TextNode): number | 'auto' {
  const lh = node.lineHeight;
  if (lh === figma.mixed || lh.unit === 'AUTO') return 'auto';
  if (lh.unit === 'PIXELS') return Math.round(lh.value);
  // PERCENT — resolve against the font size when it isn't mixed.
  if (node.fontSize !== figma.mixed) return Math.round((node.fontSize * lh.value) / 100);
  return 'auto';
}

function readLetterSpacing(node: TextNode): number | undefined {
  const ls = node.letterSpacing;
  if (ls === figma.mixed) return undefined;
  if (ls.unit === 'PIXELS') return Math.round(ls.value * 100) / 100;
  if (node.fontSize !== figma.mixed) return Math.round(((node.fontSize * ls.value) / 100) * 100) / 100;
  return undefined;
}

function getSolidFillHex(fills: TextNode['fills']): string | undefined {
  if (fills === figma.mixed || !Array.isArray(fills)) return undefined;
  const solid = fills.find((p): p is SolidPaint => p.type === 'SOLID' && p.visible !== false);
  if (!solid) return undefined;
  return rgbToHex(solid.color);
}

const GRADIENT_TYPES: Record<string, BuilderGradient['type']> = {
  GRADIENT_LINEAR: 'linear',
  GRADIENT_RADIAL: 'radial',
  GRADIENT_ANGULAR: 'angular',
  GRADIENT_DIAMOND: 'diamond',
};

function readBuilderGradient(fills: TextNode['fills']): BuilderGradient | undefined {
  if (fills === figma.mixed || !Array.isArray(fills)) return undefined;
  const paint = fills.find((p): p is GradientPaint => p.type in GRADIENT_TYPES && p.visible !== false);
  if (!paint) return undefined;
  return {
    type: GRADIENT_TYPES[paint.type],
    stops: paint.gradientStops.map((s) => ({
      position: Math.round(s.position * 1000) / 1000,
      color: gradientStopHex(s.color),
    })),
  };
}

function gradientStopHex(color: RGBA): string {
  const base = rgbToHex(color);
  if (color.a >= 0.999) return base;
  const alpha = Math.max(0, Math.min(255, Math.round(color.a * 255))).toString(16).padStart(2, '0');
  return `${base}${alpha}`;
}

function rgbToHex(color: RGB): string {
  const toHex = (c: number) => Math.max(0, Math.min(255, Math.round(c * 255))).toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
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
  if (actionType === 'refresh-selection-context') return 'preview-error';
  if (actionType === 'load-exporter-settings' || actionType === 'save-exporter-settings') return 'settings-error';
  if (actionType === 'load-gemini-key' || actionType === 'save-gemini-key') return 'settings-error';
  if (actionType === 'set-builder-screen' || actionType === 'capture-builder-node' || actionType === 'capture-builder-child' || actionType === 'refresh-builder-preview' || actionType === 'export-builder') return 'builder-error';
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
