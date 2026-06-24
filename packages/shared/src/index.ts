// HTTP wire types — shared between the VS Code extension (server) and Figma plugin (client)

export type AssetFormat = 'png' | 'jpeg' | 'svg';
export type AssetScale = 1 | 2 | 3 | 4;

export interface ExportRequest {
  fileName: string;
  extension: AssetFormat;
  relativeDir: string;
  base64Data: string;
  /** Lossy compression quality target (0–100). When omitted, the server falls back to its own setting. 100 keeps PNGs lossless. */
  compressionQuality?: number;
}

export interface ExportResponse {
  ok: true;
  relativePath: string;
  bytes: number;
}

export interface HealthResponse {
  ok: boolean;
  host: string;
  port: number;
}

export interface SettingsResponse {
  geminiApiKey: string;
}

export interface ErrorResponse {
  error: string;
}

/** Writes an arbitrary text file (e.g. the Builder's manifest) inside the workspace. */
export interface ExportManifestRequest {
  relativeDir: string;
  fileName: string;
  content: string;
}

export interface ExporterSettings {
  relativeDir: string;
  defaultType: AssetFormat;
  defaultScale: AssetScale;
  autoAIRename: boolean;
  /** Gemini model id used for AI rename suggestions. */
  aiModel: string;
  /** Lossy compression quality target (0–100) applied to PNG/JPEG exports. 100 keeps PNGs lossless; SVGs are never compressed. */
  compressionQuality: number;
}

// postMessage protocol — Figma plugin UI ↔ main thread

/** One source layer that makes up a "combined" asset. */
export interface CombinedMember {
  nodeId: string;
  name: string;
  /** Small 1x PNG data-URL preview of the source layer. */
  previewUrl: string;
}

export interface SelectionStub {
  nodeId: string;
  name: string;
  width: number;
  height: number;
  previewUrl?: string;
  /** Source layers merged into a single asset. Present only for "combined" assets (length >= 2). */
  nodeIds?: string[];
  /** Per-source metadata for editing a combined asset's members. */
  members?: CombinedMember[];
}

/** A descendant layer that should be hidden when its parent asset is exported. */
export interface IgnoredNode {
  nodeId: string;
  name: string;
  /** Small 1x PNG data-URL preview of the ignored layer. */
  previewUrl?: string;
}

export interface QueuedAsset {
  nodeId: string;
  name: string;
  type: AssetFormat;
  scale: AssetScale;
  /** Descendant node ids to hide before exporting this asset. */
  ignoredNodeIds?: string[];
  /** Source layers merged into a single asset. Present only for "combined" assets (length >= 2). */
  nodeIds?: string[];
}

// Builder — a layout spec (a list of nodes) the AI can rebuild pixel-perfect.

/** What a Builder node represents. Every type is backed by a Figma layer and exports an image. */
export type BuilderNodeType = 'asset' | 'text' | 'info';

/** Position/size of a captured layer, in screen-relative pixels (1x). */
export interface BuilderRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BuilderFont {
  /** `'mixed'` when a text layer uses more than one size. */
  size: number | 'mixed';
  family: string;
  /** Figma style name, e.g. `Regular`, `Bold`, `SemiBold Italic`. */
  style: string;
  /** Numeric font weight (e.g. 400, 700). Omitted when the layer mixes weights. */
  weight?: number;
}

export interface BuilderGradientStop {
  /** 0–1 position of the stop along the gradient. */
  position: number;
  /** Stop colour as `#rrggbb` or `#rrggbbaa`. */
  color: string;
}

/** A gradient fill read off a layer. */
export interface BuilderGradient {
  type: 'linear' | 'radial' | 'angular' | 'diamond';
  stops: BuilderGradientStop[];
}

/** Typography read off one text layer — the node itself or a nested descendant. */
export interface BuilderTextStyle {
  /** Layer name, useful when a text node nests several text layers. */
  name: string;
  /** The layer's text content. */
  text: string;
  font: BuilderFont;
  /** Text colour as `#rrggbb`, when painted with a solid fill. */
  color?: string;
  /** Gradient text fill, when the layer is painted with one. */
  gradient?: BuilderGradient;
  textAlign?: string;
  /** Resolved line height in px, or `'auto'`. */
  lineHeight?: number | 'auto';
  letterSpacing?: number;
  /** Position/size of the text layer, in screen-relative pixels (1x). */
  rect?: BuilderRect;
}

/** A single fill (solid colour or gradient) read off an info layer or a nested descendant. */
export interface BuilderFillStyle {
  /** Layer name, useful when an info node nests several painted layers. */
  name: string;
  /** Fill colour as `#rrggbb`, when the layer has a solid fill. */
  color?: string;
  /** Gradient fill, when the layer is painted with one. */
  gradient?: BuilderGradient;
  /** Position/size of the layer, in screen-relative pixels (1x). */
  rect?: BuilderRect;
}

/** The frame that defines the Builder's coordinate space; all rects are relative to it. */
export interface BuilderScreen {
  nodeId: string;
  name: string;
  width: number;
  height: number;
}

/** A child layer of a captured Builder node, which the user can toggle off to exclude from the exported image. */
export interface BuilderChildLayer {
  nodeId: string;
  name: string;
  /** Figma node type, e.g. `TEXT`, `RECTANGLE`, `GROUP`. */
  type: string;
  /** Small 1x PNG data-URL preview of the child layer. */
  previewUrl?: string;
}

/** Data read off a Figma layer when a node is captured. */
export interface BuilderNodeCapture {
  nodeId: string;
  type: BuilderNodeType;
  name: string;
  /** Small PNG data-URL thumbnail for the node list. */
  previewUrl?: string;
  /** Immediate child layers the user can hide before export, plus any manually added layers. */
  children?: BuilderChildLayer[];
  rect?: BuilderRect;
  /** Text content (text type only). */
  text?: string;
  font?: BuilderFont;
  /** Solid fill / text colour as `#rrggbb`. */
  color?: string;
  /** Gradient fill, when the layer is painted with one. */
  gradient?: BuilderGradient;
  textAlign?: string;
  /** Resolved line height in px, or `'auto'`. */
  lineHeight?: number | 'auto';
  letterSpacing?: number;
  /** Every text layer found in the node and its descendants (text type only). */
  textLayers?: BuilderTextStyle[];
  /** Every painted layer (colour/gradient) found in the node and its descendants (info type only). */
  fillLayers?: BuilderFillStyle[];
}

/** A node as sent back to the main thread for export. */
export interface BuilderExportNode {
  id: string;
  type: BuilderNodeType;
  name: string;
  nodeId?: string;
  /** Image format for the exported asset. */
  assetType?: AssetFormat;
  /** Descendant node ids to hide before exporting this node's image. */
  ignoredNodeIds?: string[];
  rect?: BuilderRect;
  text?: string;
  font?: BuilderFont;
  color?: string;
  gradient?: BuilderGradient;
  textAlign?: string;
  lineHeight?: number | 'auto';
  letterSpacing?: number;
  /** Every text layer found in the node and its descendants (text type only). */
  textLayers?: BuilderTextStyle[];
  /** Every painted layer (colour/gradient) found in the node and its descendants (info type only). */
  fillLayers?: BuilderFillStyle[];
}

export interface BuilderManifestNode {
  order: number;
  type: BuilderNodeType;
  name: string;
  /** Workspace-relative path to the exported asset. */
  asset?: string;
  rect?: BuilderRect;
  color?: string;
  gradient?: BuilderGradient;
  text?: string;
  font?: BuilderFont;
  textAlign?: string;
  lineHeight?: number | 'auto';
  letterSpacing?: number;
  /** Every text layer found in the node and its descendants (text type only). */
  textLayers?: BuilderTextStyle[];
  /** Every painted layer (colour/gradient) found in the node and its descendants (info type only). */
  fillLayers?: BuilderFillStyle[];
}

export interface BuilderManifest {
  version: number;
  generatedAt: string;
  screen: { name: string; width: number; height: number; asset?: string } | null;
  nodes: BuilderManifestNode[];
}

export type UiToMainMessage =
  | { type: 'capture-selection'; scale?: number }
  | { type: 'capture-combined-selection'; scale?: number }
  | { type: 'refresh-selection-context'; nodeId: string; scale: number; assetType?: string; ignoredNodeIds?: string[]; nodeIds?: string[] }
  | { type: 'capture-ignore-selection'; assetId: string; parentNodeId: string; parentNodeIds?: string[] }
  | { type: 'request-selection-state' }
  | { type: 'export-queue'; assets: QueuedAsset[]; relativeDir: string; compressionQuality?: number }
  | { type: 'load-gemini-key' }
  | { type: 'load-exporter-settings' }
  | { type: 'save-gemini-key'; apiKey: string }
  | { type: 'save-exporter-settings'; settings: ExporterSettings }
  | { type: 'set-builder-screen' }
  | { type: 'capture-builder-node'; nodeType: BuilderNodeType; screenNodeId?: string }
  | { type: 'capture-builder-child'; nodeItemId: string }
  | { type: 'refresh-builder-preview'; nodeItemId: string; nodeId: string; ignoredNodeIds?: string[] }
  | { type: 'export-builder'; relativeDir: string; screen: BuilderScreen | null; nodes: BuilderExportNode[]; compressionQuality?: number };

export type MainToUiMessage =
  | { type: 'selection-captured'; assets: SelectionStub[]; selectedCount: number }
  | { type: 'selection-context-refreshed'; nodeId: string; name: string; previewUrl: string; requestedScale: number; width: number; height: number }
  | { type: 'ignore-selection-captured'; assetId: string; nodes: IgnoredNode[]; invalidCount: number }
  | { type: 'selection-state-updated'; selectedCount: number; exportableCount: number }
  | { type: 'asset-queue-ready'; assets: ExportRequest[]; failures?: { name: string; error: string }[] }
  | { type: 'gemini-key-loaded'; apiKey: string }
  | { type: 'gemini-key-saved' }
  | { type: 'exporter-settings-loaded'; settings: ExporterSettings }
  | { type: 'exporter-settings-saved'; settings: ExporterSettings }
  | { type: 'builder-screen-set'; screen: BuilderScreen }
  | { type: 'builder-node-captured'; node: BuilderNodeCapture }
  | { type: 'builder-child-captured'; nodeItemId: string; child: BuilderChildLayer }
  | { type: 'builder-preview-refreshed'; nodeItemId: string; previewUrl: string }
  | { type: 'builder-export-ready'; images: ExportRequest[]; manifest: { fileName: string; content: string }; failures?: { name: string; error: string }[] }
  | { type: 'selection-error'; error: string }
  | { type: 'preview-error'; nodeId: string; requestedScale: number; error: string }
  | { type: 'export-error'; error: string }
  | { type: 'builder-error'; error: string }
  | { type: 'settings-error'; error: string };
