import { useRef, useState } from 'react';
import { LARGE_FILE_WARNING_BYTES } from '../types';

type VideoUploadProps = {
  file: File | null;
  generating: boolean;
  thumbnailUrl: string | null;
  videoDimensions: { width: number; height: number } | null;
  onFileSelected: (file: File, source: 'picker' | 'drop') => void;
};

export function VideoUpload({ file, generating, thumbnailUrl, videoDimensions, onFileSelected }: VideoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const handleFile = (nextFile: File, source: 'picker' | 'drop') => {
    setWarning(null);
    if (!nextFile.type.startsWith('video/')) {
      setWarning('Please provide a video file.');
      return;
    }
    if (generating) {
      setWarning('Cancel current render before loading another file.');
      return;
    }
    if (nextFile.size > LARGE_FILE_WARNING_BYTES) {
      setWarning(
        `Large file (${(nextFile.size / (1024 * 1024)).toFixed(0)} MB). ` +
        'Processing may be slow or cause the browser tab to run out of memory.'
      );
    }
    onFileSelected(nextFile, source);
  };

  return (
    <div>
      <label
        htmlFor="video-file-input"
        className="mb-2 block text-sm font-medium text-[var(--secondary)]"
      >
        Video file
      </label>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a video by browsing, dragging and dropping, or pasting from clipboard"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          const dropped = Array.from(event.dataTransfer.files).find((c) =>
            c.type.startsWith('video/')
          );
          if (dropped) handleFile(dropped, 'drop');
        }}
        className={`rounded-xl border-2 border-dashed p-3 transition ${
          dragActive
            ? 'border-[var(--link)] bg-[var(--teal-50)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface-muted)]'
        }`}
      >
        <input
          id="video-file-input"
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={(e) => {
            const nextFile = e.target.files?.[0];
            if (nextFile) handleFile(nextFile, 'picker');
          }}
          className="sr-only"
        />
        <p className="text-sm text-[var(--text)]">
          Click to browse, drag and drop, or paste a video.
        </p>
      </div>
      {file && (
        <div className="mt-3 flex items-start gap-3">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt="Video thumbnail"
              className="h-16 w-auto flex-shrink-0 rounded-lg border border-[var(--color-border)] object-cover"
            />
          ) : (
            <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)]">
              <span className="text-xs text-[var(--text-muted)]">No preview</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--text)]">{file.name}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {(file.size / (1024 * 1024)).toFixed(1)} MB
              {videoDimensions && videoDimensions.width > 0 && (
                <span> &middot; {videoDimensions.width}&times;{videoDimensions.height}</span>
              )}
            </p>
          </div>
        </div>
      )}
      {warning && (
        <p className="mt-2 text-xs font-medium text-[var(--orange-500)]" role="alert">
          {warning}
        </p>
      )}
    </div>
  );
}
