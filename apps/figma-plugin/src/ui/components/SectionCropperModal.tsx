import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './Button.tsx';
import { Modal } from './Modal.tsx';
import { sanitizeDraftName } from '../tools/assetExporterUtils.ts';
import {
  MIN_SECTION_FRACTION,
  cropSectionDataUrl,
  cropSections,
  evenSections,
  loadImage,
  sectionColor,
  type SectionBand,
} from '../tools/exportSectionUtils.ts';

export interface SectionSource {
  url: string;
  width: number;
  height: number;
  name: string;
}

export interface CroppedSection {
  name: string;
  type: 'png' | 'jpeg';
  imageData: string;
  previewUrl: string;
  width: number;
  height: number;
}

interface Props {
  source: SectionSource;
  defaultFormat: 'png' | 'jpeg';
  onCancel: () => void;
  onAdd: (sections: CroppedSection[]) => void;
}

const MIN_SECTIONS = 1;
const MAX_SECTIONS = 12;

type DragHandle = { index: number; edge: 'top' | 'bottom' };

export function SectionCropperModal({ source, defaultFormat, onCancel, onAdd }: Props) {
  const [bands, setBands] = useState<SectionBand[]>(() => evenSections(2));
  const count = bands.length;
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [prefix, setPrefix] = useState('');
  const [format, setFormat] = useState<'png' | 'jpeg'>(defaultFormat);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cropperRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragHandle | null>(null);

  const effectivePrefix = sanitizeDraftName(prefix) || 'section';

  // Load the screenshot once so previews/crops are synchronous while dragging.
  useEffect(() => {
    let cancelled = false;
    loadImage(source.url)
      .then((img) => { if (!cancelled) setImageEl(img); })
      .catch(() => { if (!cancelled) setError('Could not load the captured image.'); });
    return () => { cancelled = true; };
  }, [source.url]);

  // Live preview of the hovered band — recomputes synchronously as edges move.
  const previewUrl = useMemo(() => {
    if (previewIndex === null || !imageEl || !bands[previewIndex]) return null;
    try {
      return cropSectionDataUrl(imageEl, bands[previewIndex].top, bands[previewIndex].bottom, format);
    } catch {
      return null;
    }
  }, [previewIndex, imageEl, bands, format]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const container = cropperRef.current;
      if (!drag || !container) return;

      const rect = container.getBoundingClientRect();
      if (rect.height === 0) return;
      const fraction = (event.clientY - rect.top) / rect.height;

      setBands((cur) => {
        const band = cur[drag.index];
        if (!band) return cur;
        let value: number;
        if (drag.edge === 'top') {
          // Can't cross the section above, nor its own bottom.
          const lower = cur[drag.index - 1]?.bottom ?? 0;
          const upper = band.bottom - MIN_SECTION_FRACTION;
          value = Math.min(Math.max(fraction, lower), upper);
          if (!Number.isFinite(value) || value === band.top) return cur;
          return cur.map((b, i) => (i === drag.index ? { ...b, top: value } : b));
        }
        // bottom edge — can't cross its own top, nor the section below.
        const lower = band.top + MIN_SECTION_FRACTION;
        const upper = cur[drag.index + 1]?.top ?? 1;
        value = Math.min(Math.max(fraction, lower), upper);
        if (!Number.isFinite(value) || value === band.bottom) return cur;
        return cur.map((b, i) => (i === drag.index ? { ...b, bottom: value } : b));
      });
    };

    const handleUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, []);

  const handleEdgeDown = (index: number, edge: 'top' | 'bottom') => (event: React.PointerEvent) => {
    event.preventDefault();
    dragRef.current = { index, edge };
  };

  // Snap an edge out until it meets the neighbouring section (or the image edge).
  const expandTop = (index: number) => {
    setBands((cur) => cur.map((b, i) => (i === index ? { ...b, top: cur[index - 1]?.bottom ?? 0 } : b)));
  };
  const expandBottom = (index: number) => {
    setBands((cur) => cur.map((b, i) => (i === index ? { ...b, bottom: cur[index + 1]?.top ?? 1 } : b)));
  };

  const sortBands = (list: SectionBand[]) => [...list].sort((a, b) => a.top - b.top);

  // Adds a section in the empty space below `index`. If there's no gap, splits that section in
  // half. Existing sections keep their positions — adding never re-tiles the whole image.
  const addSectionBelow = (index: number) => {
    setBands((cur) => {
      if (cur.length >= MAX_SECTIONS) return cur;
      const gapTop = cur[index].bottom;
      const gapBottom = cur[index + 1]?.top ?? 1;
      if (gapBottom - gapTop >= MIN_SECTION_FRACTION) {
        return sortBands([...cur, { top: gapTop, bottom: gapBottom }]);
      }
      // No room below — split this section into two halves.
      const band = cur[index];
      if (band.bottom - band.top < MIN_SECTION_FRACTION * 2) return cur;
      const mid = (band.top + band.bottom) / 2;
      const rest = cur.filter((_, i) => i !== index);
      return sortBands([...rest, { top: band.top, bottom: mid }, { top: mid, bottom: band.bottom }]);
    });
  };

  // Adds a section in the largest uncovered gap anywhere in the image (or splits the tallest).
  const addSection = () => {
    setBands((cur) => {
      if (cur.length >= MAX_SECTIONS) return cur;
      const sorted = sortBands(cur);
      let best: { top: number; bottom: number } | null = null;
      let prevBottom = 0;
      for (const band of sorted) {
        if (band.top - prevBottom > (best ? best.bottom - best.top : MIN_SECTION_FRACTION - 1e-9)) {
          best = { top: prevBottom, bottom: band.top };
        }
        prevBottom = Math.max(prevBottom, band.bottom);
      }
      if (1 - prevBottom > (best ? best.bottom - best.top : MIN_SECTION_FRACTION - 1e-9)) {
        best = { top: prevBottom, bottom: 1 };
      }
      if (best && best.bottom - best.top >= MIN_SECTION_FRACTION) {
        return sortBands([...cur, best]);
      }
      // Fully tiled — split the tallest section.
      let tallest = 0;
      sorted.forEach((b, i) => { if (b.bottom - b.top > sorted[tallest].bottom - sorted[tallest].top) tallest = i; });
      const band = sorted[tallest];
      if (band.bottom - band.top < MIN_SECTION_FRACTION * 2) return cur;
      const mid = (band.top + band.bottom) / 2;
      const rest = sorted.filter((_, i) => i !== tallest);
      return sortBands([...rest, { top: band.top, bottom: mid }, { top: mid, bottom: band.bottom }]);
    });
  };

  const removeSection = (index: number) => {
    setBands((cur) => (cur.length <= MIN_SECTIONS ? cur : cur.filter((_, i) => i !== index)));
    setPreviewIndex(null);
  };

  const handleAdd = async () => {
    setIsAdding(true);
    setError(null);
    try {
      const ranges = bands.map((b) => ({ start: b.top, end: b.bottom }));
      const slices = await cropSections(source.url, ranges, format);
      const sections: CroppedSection[] = slices.map((base64, index) => ({
        name: `${effectivePrefix}${index + 1}`,
        type: format,
        imageData: base64,
        previewUrl: `data:image/${format};base64,${base64}`,
        width: source.width,
        height: Math.max(1, Math.round((ranges[index].end - ranges[index].start) * source.height)),
      }));
      onAdd(sections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not slice the image.');
      setIsAdding(false);
    }
  };

  return (
    <Modal>
      <div className="flex flex-col gap-3 max-h-[80vh] overflow-y-auto pr-0.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="m-0 mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">Split into sections</p>
            <h2 className="m-0 text-[14px] font-bold leading-[1.15] break-all">{source.name}</h2>
          </div>
          <button
            className="min-h-[28px] px-2 rounded-full cursor-pointer transition-colors inline-flex items-center justify-center text-[var(--figma-color-text-secondary)] hover:bg-[var(--figma-color-bg-tertiary)] hover:text-[var(--figma-color-text)]"
            onClick={onCancel}
            title="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">
            {count} section{count === 1 ? '' : 's'}
          </span>
          <button
            onClick={addSection}
            disabled={count >= MAX_SECTIONS}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-full border border-[var(--figma-color-border)] bg-[var(--figma-color-bg)] px-2.5 text-[11px] font-bold text-[var(--figma-color-text)] disabled:opacity-50"
            title="Add a section in the largest empty space"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            Add section
          </button>
        </div>

        {/* No height cap / clipping here: the container height must equal the rendered image
            height so the edge fractions map 1:1 onto the pixels we crop. */}
        <div
          ref={cropperRef}
          className="relative w-full select-none rounded-lg bg-[var(--figma-color-bg-secondary)]"
        >
          <img src={source.url} alt="Section source" draggable={false} className="block w-full h-auto rounded-lg" />

          {bands.map((band, index) => {
            const color = sectionColor(index);
            const heightPct = (band.bottom - band.top) * 100;
            return (
              <div
                key={index}
                className="absolute left-0 right-0 box-border border-2"
                style={{ top: `${band.top * 100}%`, height: `${heightPct}%`, borderColor: color, backgroundColor: `${color}1f` }}
              >
                {/* Hover the tag to preview just this band. */}
                <div
                  className="absolute left-1 top-1 flex items-center gap-1"
                  onMouseEnter={() => setPreviewIndex(index)}
                  onMouseLeave={() => setPreviewIndex((cur) => (cur === index ? null : cur))}
                >
                  <span className="block rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: color }}>
                    Section {index + 1}
                  </span>
                  <button
                    onClick={() => expandTop(index)}
                    className="inline-flex h-[18px] w-[18px] items-center justify-center rounded bg-black/45 text-white hover:bg-black/65"
                    title="Expand the top edge up to the section above"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none"><path d="M8 13V4M4 7l4-3 4 3M3 2.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <button
                    onClick={() => expandBottom(index)}
                    className="inline-flex h-[18px] w-[18px] items-center justify-center rounded bg-black/45 text-white hover:bg-black/65"
                    title="Expand the bottom edge down to the section below"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none"><path d="M8 3v9M4 9l4 3 4-3M3 13.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <button
                    onClick={() => addSectionBelow(index)}
                    disabled={count >= MAX_SECTIONS}
                    className="inline-flex h-[18px] w-[18px] items-center justify-center rounded bg-black/45 text-white hover:bg-black/65 disabled:opacity-40"
                    title="Add a section below this one"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                  </button>
                  {count > MIN_SECTIONS && (
                    <button
                      onClick={() => removeSection(index)}
                      className="inline-flex h-[18px] w-[18px] items-center justify-center rounded bg-black/45 text-white hover:bg-[#c2410c]"
                      title="Remove this section"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                    </button>
                  )}

                  {previewIndex === index && previewUrl && (
                    <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-[var(--figma-color-border)] bg-[var(--figma-color-bg-secondary)] p-1.5 shadow-xl">
                      <img src={previewUrl} alt="Section preview" className="block max-h-80 w-full rounded-md object-contain" />
                    </div>
                  )}
                </div>

                {/* Top + bottom resize handles for this section. */}
                <div
                  onPointerDown={handleEdgeDown(index, 'top')}
                  className="absolute inset-x-0 top-0 z-10 flex h-3 -translate-y-1/2 cursor-row-resize items-center justify-center touch-none"
                >
                  <div className="h-1 w-10 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" />
                </div>
                <div
                  onPointerDown={handleEdgeDown(index, 'bottom')}
                  className="absolute inset-x-0 bottom-0 z-10 flex h-3 translate-y-1/2 cursor-row-resize items-center justify-center touch-none"
                >
                  <div className="h-1 w-10 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" />
                </div>
              </div>
            );
          })}
        </div>

        <p className="m-0 text-[11px] leading-[1.5] text-[var(--figma-color-text-tertiary)]">
          Drag each section's top/bottom edge to resize it — gaps you leave uncovered aren't exported.
          Hover a tag to preview; use the arrows to snap an edge to the neighbour.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">Name prefix</span>
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="section"
              className="min-h-[34px] w-full rounded-[10px] border border-[var(--figma-color-border)] bg-[var(--figma-color-bg)] px-[11px] text-[12px] outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--figma-color-text-secondary)]">Format</span>
            <div className="inline-flex h-[34px] overflow-hidden rounded-[10px] border border-[var(--figma-color-border)]">
              {(['png', 'jpeg'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setFormat(option)}
                  className={`flex-1 text-[12px] font-bold uppercase ${format === option ? 'bg-[var(--figma-color-bg-brand)] text-[var(--figma-color-text-onbrand)]' : 'bg-[var(--figma-color-bg)] text-[var(--figma-color-text-secondary)]'}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </label>
        </div>

        <p className="m-0 text-[11px] leading-[1.5] text-[var(--figma-color-text-tertiary)]">
          Adds {count} asset{count === 1 ? '' : 's'}: {effectivePrefix}1 … {effectivePrefix}{count}.{format}
        </p>

        {error && <p className="m-0 text-[12px] leading-[1.4] text-[#c2410c]">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={isAdding}>Cancel</Button>
          <Button variant="primary" onClick={handleAdd} disabled={isAdding}>
            {isAdding ? 'Adding...' : `Add ${count} section${count === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
