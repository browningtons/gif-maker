type PreviewProps = {
  gifUrl: string | null;
  gifName: string;
};

export function Preview({ gifUrl, gifName }: PreviewProps) {
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
        <a
          href={gifUrl}
          download={gifName}
          className="mt-4 inline-block rounded-xl bg-[var(--secondary)] px-4 py-2 text-sm font-semibold text-[var(--secondary-contrast)]"
        >
          Download GIF
        </a>
      )}
    </aside>
  );
}
