import { encode as encodeJpeg } from '@jsquash/jpeg';
import { png as pngCodec } from 'icodec';
import pngEncoderWasmUrl from 'icodec/png-enc.wasm?url';
import type { ExportRequest } from '@assetport/shared';

const JPEG_QUALITY = 82;
const PNG_OPTIONS = {
  quality: 60,
  colors: 128,
  dithering: 1,
  speed: 3,
  level: 4,
  interlace: false,
  quantize: true,
};

let pngEncoderLoadPromise: Promise<void> | null = null;

export async function compressQueuedAssetForExport(asset: ExportRequest): Promise<ExportRequest> {
  const ext = String(asset?.extension ?? '').toLowerCase().trim();
  if (ext === 'png') return compressPngAsset(asset);
  if (ext === 'jpeg' || ext === 'jpg') return compressJpegAsset(asset);
  return asset;
}

async function compressPngAsset(asset: ExportRequest): Promise<ExportRequest> {
  const sourceBlob = base64ToBlob(asset.base64Data, 'image/png');
  const imageData = await blobToImageData(sourceBlob);
  await ensurePngEncoderLoaded();
  const compressed = pngCodec.encode(imageData, PNG_OPTIONS);
  const original = base64ByteLength(asset.base64Data);
  if (compressed.byteLength >= original) return asset;
  return { ...asset, base64Data: uint8ArrayToBase64(compressed) };
}

async function compressJpegAsset(asset: ExportRequest): Promise<ExportRequest> {
  const sourceBlob = base64ToBlob(asset.base64Data, 'image/jpeg');
  const imageData = await blobToImageData(sourceBlob);
  const compressed = await encodeJpeg(imageData, { quality: JPEG_QUALITY });
  return { ...asset, base64Data: arrayBufferToBase64(compressed) };
}

function base64ToArrayBuffer(base64Value: string): ArrayBuffer {
  const binary = atob(String(base64Value ?? ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return uint8ArrayToBase64(new Uint8Array(buffer));
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ByteLength(base64Value: string): number {
  return atob(String(base64Value ?? '')).length;
}

function base64ToBlob(base64Value: string, mimeType: string): Blob {
  return new Blob([base64ToArrayBuffer(base64Value)], { type: mimeType });
}

async function blobToImageData(blob: Blob): Promise<ImageData> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      return drawToImageData(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  }

  const dataUrl = await blobToDataUrl(blob);
  const image = await loadImage(dataUrl);
  return drawToImageData(image, image.naturalWidth || image.width, image.naturalHeight || image.height);
}

function drawToImageData(source: CanvasImageSource, width: number, height: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas rendering is unavailable for export compression.');
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Unable to read image for compression.'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to decode image for compression.'));
    img.src = src;
  });
}

function ensurePngEncoderLoaded(): Promise<void> {
  if (!pngEncoderLoadPromise) {
    pngEncoderLoadPromise = pngCodec.loadEncoder(pngEncoderWasmUrl);
  }
  return pngEncoderLoadPromise;
}
