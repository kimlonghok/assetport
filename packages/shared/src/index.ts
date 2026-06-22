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

export interface SelectionStub {
  nodeId: string;
  name: string;
  width: number;
  height: number;
}

export interface QueuedAsset {
  nodeId: string;
  name: string;
  type: AssetFormat;
  scale: AssetScale;
}

export type UiToMainMessage =
  | { type: 'capture-selection'; scale?: number }
  | { type: 'refresh-selection-context'; nodeId: string; scale: number; assetType?: string }
  | { type: 'request-selection-state' }
  | { type: 'export-queue'; assets: QueuedAsset[]; relativeDir: string; compressionQuality?: number }
  | { type: 'load-gemini-key' }
  | { type: 'load-exporter-settings' }
  | { type: 'save-gemini-key'; apiKey: string }
  | { type: 'save-exporter-settings'; settings: ExporterSettings };

export type MainToUiMessage =
  | { type: 'selection-captured'; assets: SelectionStub[]; selectedCount: number }
  | { type: 'selection-context-refreshed'; nodeId: string; name: string; previewUrl: string; previewUrl2x: string; requestedScale: number; width: number; height: number }
  | { type: 'selection-state-updated'; selectedCount: number; exportableCount: number }
  | { type: 'asset-queue-ready'; assets: ExportRequest[] }
  | { type: 'gemini-key-loaded'; apiKey: string }
  | { type: 'exporter-settings-loaded'; settings: ExporterSettings }
  | { type: 'exporter-settings-saved'; settings: ExporterSettings }
  | { type: 'selection-error'; error: string }
  | { type: 'preview-error'; nodeId: string; requestedScale: number; error: string }
  | { type: 'export-error'; error: string }
  | { type: 'settings-error'; error: string };
