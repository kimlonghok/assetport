/** Distinct overlay colors cycled across stacked section croppers. */
export const SECTION_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
] as const;

export function sectionColor(index: number): string {
  return SECTION_COLORS[index % SECTION_COLORS.length];
}

/** Smallest fractional height a single section is allowed to keep while dragging. */
export const MIN_SECTION_FRACTION = 0.03;

/** A single section's vertical extent as fractions (0..1) of the image height. */
export interface SectionBand {
  top: number;
  bottom: number;
}

/**
 * `count` evenly-tiled sections covering the whole height. Each section owns an independent
 * top/bottom edge afterwards, so the user can shrink them to leave (ignored) gaps.
 */
export function evenSections(count: number): SectionBand[] {
  const bands: SectionBand[] = [];
  for (let i = 0; i < count; i++) bands.push({ top: i / count, bottom: (i + 1) / count });
  return bands;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load the captured image.'));
    image.src = src;
  });
}

/**
 * Crops one horizontal band [start, end] (fractions of height) from an already-loaded image
 * and returns it as a data URL. Used both for the per-section preview and for export.
 */
export function cropSectionDataUrl(
  image: HTMLImageElement,
  start: number,
  end: number,
  format: 'png' | 'jpeg',
): string {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('The captured image is empty.');

  const y0 = Math.round(start * height);
  const y1 = Math.round(end * height);
  const sliceHeight = Math.max(1, y1 - y0);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = sliceHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is unavailable.');

  // JPEG has no alpha — paint a white backdrop so transparent areas don't turn black.
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, sliceHeight);
  }

  ctx.drawImage(image, 0, y0, width, sliceHeight, 0, 0, width, sliceHeight);
  return canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', format === 'jpeg' ? 0.95 : undefined);
}

/**
 * Crops the given bands (fraction ranges) from the source image and returns one base64
 * PNG/JPEG per band, in order. Callers filter out ignored bands before calling.
 */
export async function cropSections(
  sourceUrl: string,
  ranges: { start: number; end: number }[],
  format: 'png' | 'jpeg',
): Promise<string[]> {
  const image = await loadImage(sourceUrl);
  return ranges.map(({ start, end }) => cropSectionDataUrl(image, start, end, format).split(',')[1] ?? '');
}
