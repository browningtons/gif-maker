import { useState, useCallback, useEffect, useRef } from 'react';
import { OVERLAY_TEXT_SIZE_MAX, OVERLAY_TEXT_SIZE_MIN, type OverlayFontKey, OVERLAY_FONT_PROFILES } from '../types';

type PreviewProps = {
  gifUrl: string | null;
  sourcePreviewUrl: string | null;
  gifName: string;
  onGifNameChange: (name: string) => void;
  overlayEnabled: boolean;
  overlayText: string;
  overlayX: number;
  overlayY: number;
  overlayFontSizePx: number;
  overlayFont: OverlayFontKey;
  onOverlayEnabledChange: (value: boolean) => void;
  onOverlayTextChange: (value: string) => void;
  onOverlayPositionChange: (x: number, y: number) => void;
  onOverlayFontSizeChange: (value: number) => void;
  onOverlayFontChange: (value: OverlayFontKey) => void;
};

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export function Preview({
  gifUrl,
  sourcePreviewUrl,
  gifName,
  onGifNameChange,
  overlayEnabled,
  overlayText,
  overlayX,
  overlayY,
  overlayFontSizePx,
  overlayFont,
  onOverlayEnabledChange,
  onOverlayTextChange,
  onOverlayPositionChange,
  onOverlayFontSizeChange,
  onOverlayFontChange,
}: PreviewProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [isDraggingOverlay, setIsDraggingOverlay] = useState(false);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);

  const previewUrl = gifUrl ?? sourcePreviewUrl;
  const hasPreview = Boolean(previewUrl);

  useEffect(() => {
    if (!isDraggingOverlay) return;
    const handlePointerMove = (event: PointerEvent) => {
      const frame = previewFrameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = clampUnit((event.clientX - rect.left) / rect.width);
      const y = clampUnit((event.clientY - rect.top) / rect.height);
      onOverlayPositionChange(x, y);
    };
    const handlePointerUp = () => setIsDraggingOverlay(false);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDraggingOverlay, onOverlayPositionChange]);

  const handleCopyToClipboard = useCallback(async (silent = false) => {
    if (!gifUrl) return;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Clipboard API not available');
      }
      const response = await fetch(gifUrl);
      const blob = await response.blob();
      // ClipboardItem requires specific MIME types; try image/png fallback
      // since many apps don't support image/gif on the clipboard
      if (blob.type === 'image/gif') {
        // Convert to PNG for wider clipboard compatibility
        const img = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load GIF for copy'));
        });
        img.src = gifUrl;
        await loaded;

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas not available');
        ctx.drawImage(img, 0, 0);

        const pngBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('PNG conversion failed'))),
            'image/png'
          );
        });

        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob }),
        ]);
      } else {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
      }
      if (!silent) {
        setCopyStatus('copied');
        setTimeout(() => setCopyStatus('idle'), 2000);
      }
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      if (!silent) {
        setCopyStatus('failed');
        setTimeout(() => setCopyStatus('idle'), 2000);
      }
    }
  }, [gifUrl]);

  const ensureGifExtension = (name: string) => {
    if (!name) return 'output.gif';
    return name.endsWith('.gif') ? name : `${name}.gif`;
  };

  const clampedOverlaySize = Math.max(
    OVERLAY_TEXT_SIZE_MIN,
    Math.min(OVERLAY_TEXT_SIZE_MAX, Math.round(overlayFontSizePx))
  );

  return (
    <aside className="rounded-[var(--radius)] border border-[var(--color-border-subtle)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
      <h2 className="text-lg font-semibold text-[var(--secondary)]">Preview</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {gifUrl ? 'Your generated GIF is shown below.' : 'Use quick preview to validate before full render.'}
      </p>
      <div className="mt-4 flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
        {hasPreview ? (
          <div ref={previewFrameRef} className="relative inline-block w-full">
            <img
              src={previewUrl ?? undefined}
              alt={gifUrl ? 'Generated GIF' : 'Source preview frame'}
              className="max-h-[420px] w-full rounded-lg object-contain"
            />
            {overlayEnabled && overlayText.trim() && (
              <div
                role="button"
                tabIndex={0}
                aria-label="Drag text overlay"
                onPointerDown={(event) => {
                  event.preventDefault();
                  setIsDraggingOverlay(true);
                  if (previewFrameRef.current) {
                    const rect = previewFrameRef.current.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                      onOverlayPositionChange(
                        clampUnit((event.clientX - rect.left) / rect.width),
                        clampUnit((event.clientY - rect.top) / rect.height)
                      );
                    }
                  }
                }}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 0.04 : 0.015;
                  if (event.key === 'ArrowLeft') onOverlayPositionChange(clampUnit(overlayX - step), overlayY);
                  if (event.key === 'ArrowRight') onOverlayPositionChange(clampUnit(overlayX + step), overlayY);
                  if (event.key === 'ArrowUp') onOverlayPositionChange(overlayX, clampUnit(overlayY - step));
                  if (event.key === 'ArrowDown') onOverlayPositionChange(overlayX, clampUnit(overlayY + step));
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-center text-white shadow-[0_1px_2px_rgba(0,0,0,0.7)] ${
                  isDraggingOverlay ? 'cursor-grabbing' : 'cursor-grab'
                }`}
                style={{
                  left: `${clampUnit(overlayX) * 100}%`,
                  top: `${clampUnit(overlayY) * 100}%`,
                  fontFamily: OVERLAY_FONT_PROFILES[overlayFont].cssFamily,
                  fontSize: `${clampedOverlaySize}px`,
                  lineHeight: 1.1,
                  fontWeight: overlayFont === 'mono' ? 700 : 800,
                  textShadow: '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000',
                }}
              >
                {overlayText}
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-[var(--text-muted)]">No GIF yet</span>
        )}
      </div>
      <div className="mt-4 space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--secondary)]">Draggable text box</h3>
          <button
            type="button"
            onClick={() => onOverlayEnabledChange(!overlayEnabled)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              overlayEnabled
                ? 'border-[var(--teal-700)] bg-[var(--teal-50)] text-[var(--teal-700)]'
                : 'border-[var(--color-border)] bg-[var(--surface)] text-[var(--secondary)]'
            }`}
          >
            {overlayEnabled ? 'On' : 'Off'}
          </button>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--secondary)]">Text</span>
          <input
            type="text"
            value={overlayText}
            onChange={(event) => onOverlayTextChange(event.target.value)}
            placeholder="Type something funny..."
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--surface)] p-2 text-sm text-[var(--text)]"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--secondary)]">Font</span>
            <select
              value={overlayFont}
              onChange={(event) => onOverlayFontChange(event.target.value as OverlayFontKey)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--surface)] p-2 text-sm text-[var(--text)]"
            >
              <option value="meme">{OVERLAY_FONT_PROFILES.meme.label}</option>
              <option value="sans">{OVERLAY_FONT_PROFILES.sans.label}</option>
              <option value="serif">{OVERLAY_FONT_PROFILES.serif.label}</option>
              <option value="mono">{OVERLAY_FONT_PROFILES.mono.label}</option>
              <option value="display">{OVERLAY_FONT_PROFILES.display.label}</option>
              <option value="rounded">{OVERLAY_FONT_PROFILES.rounded.label}</option>
              <option value="comic">{OVERLAY_FONT_PROFILES.comic.label}</option>
              <option value="elegant">{OVERLAY_FONT_PROFILES.elegant.label}</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--secondary)]">
              Font size ({clampedOverlaySize}px)
            </span>
            <input
              type="range"
              min={OVERLAY_TEXT_SIZE_MIN}
              max={OVERLAY_TEXT_SIZE_MAX}
              step={1}
              value={clampedOverlaySize}
              onChange={(event) => onOverlayFontSizeChange(Number(event.target.value))}
              className="w-full accent-[var(--link)]"
            />
          </label>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Drag the text directly on the preview to position it.
        </p>
      </div>
      {gifUrl && (
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--secondary)]">
              Filename
            </span>
            <input
              type="text"
              value={gifName}
              onChange={(e) => onGifNameChange(e.target.value)}
              onBlur={(e) => onGifNameChange(ensureGifExtension(e.target.value.trim()))}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 text-sm text-[var(--text)]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <a
              href={gifUrl}
              download={gifName}
              onClick={() => {
                void handleCopyToClipboard(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--secondary)] px-4 py-2 text-sm font-semibold text-[var(--secondary-contrast)]"
            >
              Download
            </a>
            <button
              type="button"
              onClick={() => {
                void handleCopyToClipboard();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--secondary)]"
            >
              {copyStatus === 'copied'
                ? 'Copied!'
                : copyStatus === 'failed'
                  ? 'Copy failed'
                  : 'Copy GIF'}
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Download also attempts automatic clipboard copy for faster posting.
          </p>
        </div>
      )}
    </aside>
  );
}
