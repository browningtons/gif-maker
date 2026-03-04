type HeaderProps = {
  isDark: boolean;
  onToggleTheme: () => void;
};

export function Header({ isDark, onToggleTheme }: HeaderProps) {
  return (
    <header className="rounded-[var(--radius)] border border-[var(--color-border-subtle)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--secondary)]">
            LoopForge
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Convert screen recordings into platform-ready GIFs in your browser with no server upload.
          </p>
        </div>
        <button
          onClick={onToggleTheme}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--secondary)]"
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {isDark ? 'Light theme' : 'Dark theme'}
        </button>
      </div>
    </header>
  );
}
