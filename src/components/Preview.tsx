import { useState, useCallback } from 'react';

type PreviewProps = {
  gifUrl: string | null;
  gifName: string;
  onGifNameChange: (name: string) => void;
};

export function Preview({ gifUrl, gifName, onGifNameChange }: PreviewProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopyToClipboard = useCallback(async () => {
    if (!gifUrl) return;
    try {
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
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      setCopyStatus('failed');
      setTimeout(() => setCopyStatus('idle'), 2000);
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
        Your generated GIF will appear here.
      </p>
      <div className="mt-4 flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
        {gifUrl ? (
          <img
            src={gifUrl}
            alt="Generated GIF"
            className="max-h-[420px] w-full rounded-lg object-contain"
          />
        ) : (
          <span className="text-sm text-[var(--text-muted)]">No GIF yet</span>
        )}
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--secondary)] px-4 py-2 text-sm font-semibold text-[var(--secondary-contrast)]"
            >
              Download
            </a>
            <button
              type="button"
              onClick={handleCopyToClipboard}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--secondary)]"
            >
              {copyStatus === 'copied'
                ? 'Copied!'
                : copyStatus === 'failed'
                  ? 'Copy failed'
                  : 'Copy to clipboard'}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
