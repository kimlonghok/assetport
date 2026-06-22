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
  | { type: 'save-exporter-settings'; settings: ExporterSettings };

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
  | { type: 'selection-error'; error: string }
  | { type: 'preview-error'; nodeId: string; requestedScale: number; error: string }
  | { type: 'export-error'; error: string }
  | { type: 'settings-error'; error: string };
