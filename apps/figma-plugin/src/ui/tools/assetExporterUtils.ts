import type { AssetFormat, AssetScale } from '@assetport/shared';

const GEMINI_PREVIEW_MAX_SIZE = 128;
const GEMINI_PREVIEW_QUALITY = 0.72;

export const SERVER_BASE_URL = 'http://localhost:32123';
export const DEFAULT_DIR = 'figma-exports';
export const DEFAULT_TYPE: AssetFormat = 'png';
export const DEFAULT_SCALE: AssetScale = 2;
export const SERVER_EXPORT_URL = `${SERVER_BASE_URL}/export`;

/** Default lossy compression quality (0–100) for PNG/JPEG exports; 100 keeps PNGs lossless. */
export const DEFAULT_COMPRESSION_QUALITY = 75;

/** Single source of truth for the AI rename model. */
export const DEFAULT_MODEL = 'gemma-4-31b-it';

/** Vision-capable presets offered in Settings; users may type any model id. */
export const MODEL_PRESETS = [
  'gemma-4-31b-it',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
] as const;

export function normalizeAssetModel(value: unknown): string {
  const m = String(value ?? '').trim();
  return m || DEFAULT_MODEL;
}

export function normalizeCompressionQuality(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_COMPRESSION_QUALITY;
  return Math.min(100, Math.max(0, n));
}

export function normalizeAssetType(value: unknown): AssetFormat {
  const t = String(value ?? '').toLowerCase().trim();
  if (t === 'svg' || t === 'jpeg') return t;
  return DEFAULT_TYPE;
}

export function getAvailableScalesForType(assetType: AssetFormat): AssetScale[] {
  return normalizeAssetType(assetType) === 'svg' ? [1] : [1, 2, 3, 4];
}

export function normalizeAssetScale(value: unknown, assetType: AssetFormat = DEFAULT_TYPE): AssetScale {
  const n = Number(value) as AssetScale;
  const available = getAvailableScalesForType(assetType);
  return (available as number[]).includes(n) ? n : (available.includes(DEFAULT_SCALE) ? DEFAULT_SCALE : available[0]);
}

export async function preparePreviewForGemini(dataUrl: string): Promise<{ mimeType: string; base64: string }> {
  try {
    const resized = await resizeImageDataUrl(dataUrl, GEMINI_PREVIEW_MAX_SIZE, GEMINI_PREVIEW_QUALITY);
    return parseImageDataUrl(resized);
  } catch {
    return parseImageDataUrl(dataUrl);
  }
}

function resizeImageDataUrl(dataUrl: string, maxDimension: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;

      if (!width || !height) {
        reject(new Error('Preview image is empty.'));
        return;
      }

      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas rendering is unavailable.'));
        return;
      }

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    image.onerror = () => reject(new Error('Unable to resize preview image.'));
    image.src = dataUrl;
  });
}

function parseImageDataUrl(value: string): { mimeType: string; base64: string } {
  const match = String(value ?? '').match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/);
  if (!match) throw new Error('Preview image format is not supported.');
  return {
    mimeType: match[1] === 'image/jpg' ? 'image/jpeg' : match[1],
    base64: match[2],
  };
}

export function sanitizeDraftName(value: unknown): string {
  const t = String(value ?? '').trim();
  if (!t) return 'assetName';
  return (
    t
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
      .replace(/^[A-Z]/, (c) => c.toLowerCase())
      .replace(/[^a-zA-Z0-9]/g, '') || 'assetName'
  );
}

export function makeUniqueName(baseName: string, existingNames: string[]): string {
  const name = String(baseName ?? 'asset').trim() || 'assetName';
  if (!existingNames.includes(name)) return name;

  let counter = 1;
  let unique = `${name}-${counter}`;
  while (existingNames.includes(unique)) {
    counter++;
    unique = `${name}-${counter}`;
  }
  return unique;
}

export interface AssetWithPreviews {
  type: AssetFormat;
  scale: AssetScale;
  previewUrl?: string;
  previewUrl1x?: string;
  previewUrl2x?: string;
  [key: string]: unknown;
}

export function getCachedPreviewForScale(asset: AssetWithPreviews): string {
  if (asset.type === 'svg') return (asset.previewUrl1x ?? asset.previewUrl2x ?? asset.previewUrl) as string;
  if (asset.scale === 1) return (asset.previewUrl1x ?? asset.previewUrl2x ?? asset.previewUrl) as string;
  if (asset.scale === 2) return (asset.previewUrl2x ?? asset.previewUrl) as string;
  if (asset.scale >= 3) return (asset[`previewUrl${asset.scale}x`] ?? asset.previewUrl2x ?? asset.previewUrl) as string;
  return (asset.previewUrl2x ?? asset.previewUrl) as string;
}

export function refreshPreviewAtScale(asset: { nodeId: string; scale: AssetScale; type: AssetFormat }): void {
  window.parent.postMessage(
    { pluginMessage: { type: 'refresh-selection-context', nodeId: asset.nodeId, scale: asset.scale, assetType: asset.type } },
    '*',
  );
}

export interface GeminiNameSuggestionsParams {
  apiKey: string;
  model?: string;
  nodeName: string;
  assetType: AssetFormat;
  nodePreview: { mimeType: string; base64: string };
  existingNames?: string[];
  lastAttemptedName?: string | null;
}

export async function requestGeminiNameSuggestions(params: GeminiNameSuggestionsParams): Promise<{ suggestions: string[] }> {
  const { apiKey, model, nodeName, assetType, nodePreview, existingNames = [], lastAttemptedName = null } = params;
  const geminiModel = normalizeAssetModel(model);

  const contextParts: string[] = [];
  if (existingNames.length > 0) contextParts.push(`Existing asset names in queue (do NOT use these): ${existingNames.join(', ')}`);
  if (lastAttemptedName) contextParts.push(`Last attempted name (do NOT use this again): ${lastAttemptedName}`);
  const contextText = contextParts.length > 0 ? '\n\n' + contextParts.join('\n') : '';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: [
                  'You are naming a selected Figma layer.',
                  'Use the image to name the asset.',
                  'Suggestions must be distinct, concise, descriptive, lowercase camelCase, and must not include file extensions.',
                  'Provide 3 different suggestions.',
                ].join(' ') + contextText,
              },
              { text: `Asset type: ${assetType ?? DEFAULT_TYPE}. Current node name: ${nodeName ?? 'unnamedAsset'}.` },
              { inline_data: { mime_type: nodePreview.mimeType, data: nodePreview.base64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: { suggestions: { type: 'array', items: { type: 'string' } } },
            required: ['suggestions'],
          },
        },
      }),
    },
  );

  const result = await response.json() as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  if (!response.ok) {
    throw new Error(result.error?.message ?? 'Gemini rename failed.');
  }

  const text = result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('\n').trim() ?? '';
  return { suggestions: parseGeminiSuggestions(text) };
}

function parseGeminiSuggestions(text: string): string[] {
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as { suggestions?: unknown[] };
    if (Array.isArray(parsed?.suggestions)) {
      return parsed.suggestions.map(sanitizeDraftName).filter(Boolean);
    }
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as { suggestions?: unknown[] };
        if (Array.isArray(parsed?.suggestions)) {
          return parsed.suggestions.map(sanitizeDraftName).filter(Boolean);
        }
      } catch {
        // fall through
      }
    }
  }

  return text
    .split('\n')
    .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map(sanitizeDraftName)
    .filter(Boolean);
}
