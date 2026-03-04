import { type RenderStage } from '../hooks/useFFmpeg';

type ActionBarProps = {
  file: File | null;
  generating: boolean;
  progress: number;
  stage: RenderStage;
  status: string;
  timeToFirstGifMs: number | null;
  onGenerate: () => void;
  onCancel: () => void;
};

const STAGE_LABELS: Record<RenderStage, string> = {
  idle: '',
  loading: 'Loading ffmpeg',
  preparing: 'Preparing',
  palette: 'Building palette',
  rendering: 'Rendering frames',
  optimizing: 'Optimizing',
  done: 'Complete',
};

export function ActionBar(props: ActionBarProps) {
  const {
    file, generating, progress, stage, status, timeToFirstGifMs,
    onGenerate, onCancel,
  } = props;

  const stageLabel = STAGE_LABELS[stage];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3" aria-busy={generating}>
        <button
          onClick={onGenerate}
          disabled={!file || generating}
          className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-contrast)] hover:bg-[var(--orange-700)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? 'Forging GIF...' : 'Forge Great GIF'}
        </button>
        <button
          onClick={onCancel}
          disabled={!generating}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--secondary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <span className="text-xs text-[var(--text-muted)]" role="status" aria-live="polite">
          {status}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]"
          role="progressbar"
          aria-label="Conversion progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div
            className="h-full bg-[var(--link)] transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        {generating && stageLabel && (
          <span className="shrink-0 text-xs text-[var(--text-muted)]">{stageLabel}</span>
        )}
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        {timeToFirstGifMs !== null && (
          <>
            Time to first GIF: <strong>{(timeToFirstGifMs / 1000).toFixed(1)}s</strong>{' \u00B7 '}
          </>
        )}
        <kbd className="rounded border border-[var(--color-border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px]">
          Ctrl+Enter
        </kbd>{' '}
        generate{' \u00B7 '}
        <kbd className="rounded border border-[var(--color-border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px]">
          Esc
        </kbd>{' '}
        cancel
      </p>
    </div>
  );
}
