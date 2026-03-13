import { useState, useCallback } from 'react';

type PreviewProps = {
  gifUrl: string | null;
  sourcePreviewUrl: string | null;
  gifName: string;
  onGifNameChange: (name: string) => void;
  overlayTextEnabled: boolean;
  overlayText: string;
  overlayTextSizePx: number;
  onOverlayTextEnabledChange: (enabled: boolean) => void;
  onOverlayTextChange: (text: string) => void;
  onOverlayTextSizePxChange: (sizePx: number) => void;
};

export function Preview({
  gifUrl,
  sourcePreviewUrl,
  gifName,
  onGifNameChange,
  overlayTextEnabled,
  overlayText,
  overlayTextSizePx,
  onOverlayTextEnabledChange,
  onOverlayTextChange,
  onOverlayTextSizePxChange,
}: PreviewProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const previewUrl = gifUrl ?? sourcePreviewUrl;
  const hasPreview = Boolean(previewUrl);
  const showOverlayPreview = Boolean(!gifUrl && sourcePreviewUrl && overlayTextEnabled && overlayText.trim());

  const handleCopyToClipboard = useCallback(async (silent = false) => {
    if (!gifUrl) return;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Clipboard API not available');
      }
      const response = await fetch(gifUrl);
      const blob = await response.blob();
      if (blob.type === 'image/gif') {
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

  return (
    <aside className="rounded-[var(--radius)] border border-[var(--color-border-subtle)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
      <h2 className="text-lg font-semibold text-[var(--secondary)]">Preview</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {gifUrl ? 'Your generated GIF is shown below.' : 'Use quick preview to validate before full render.'}
      </p>
      <div className="mt-4 flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
        {hasPreview ? (
          <div className="relative w-full">
            <img
              src={previewUrl ?? undefined}
              alt={gifUrl ? 'Generated GIF' : 'Source preview frame'}
              className="max-h-[420px] w-full rounded-lg object-contain"
            />
            {showOverlayPreview && (
              <div className="pointer-events-none absolute inset-x-[6%] bottom-[5.5%]">
                <div
                  className="text-center font-black uppercase tracking-tight text-white [text-shadow:0_2px_0_rgba(0,0,0,0.95),0_-2px_0_rgba(0,0,0,0.95),2px_0_0_rgba(0,0,0,0.95),-2px_0_0_rgba(0,0,0,0.95),2px_2px_0_rgba(0,0,0,0.95),-2px_2px_0_rgba(0,0,0,0.95)]"
                  style={{
                    fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
                    fontSize: `${overlayTextSizePx}px`,
                    lineHeight: 1.05,
                  }}
                >
                  {overlayText}
                </div>
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-[var(--text-muted)]">No GIF yet</span>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--secondary)]">Text overlay</h3>
          <button
            type="button"
            onClick={() => onOverlayTextEnabledChange(!overlayTextEnabled)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              overlayTextEnabled
                ? 'border-[var(--teal-700)] bg-[var(--teal-50)] text-[var(--teal-700)]'
                : 'border-[var(--color-border)] bg-[var(--surface)] text-[var(--text-muted)]'
            }`}
          >
            {overlayTextEnabled ? 'On' : 'Off'}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Beta test: bottom-center caption only. This pass is focused on export stability.
        </p>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--secondary)]">Caption</span>
            <textarea
              value={overlayText}
              onChange={(event) => onOverlayTextChange(event.target.value)}
              rows={3}
              placeholder="Add a short caption to test text overlay."
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 text-sm text-[var(--text)]"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--secondary)]">
              Text size ({overlayTextSizePx}px)
            </span>
            <input
              type="range"
              min={18}
              max={72}
              step={1}
              value={overlayTextSizePx}
              onChange={(event) => onOverlayTextSizePxChange(Number(event.target.value))}
              className="w-full accent-[var(--link)]"
            />
          </label>
        </div>
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
