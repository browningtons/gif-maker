type SizeEstimateProps = {
  estimatedMb: number;
  targetSizeMode: boolean;
  targetSizeMb: number;
};

export function SizeEstimate({ estimatedMb, targetSizeMode, targetSizeMb }: SizeEstimateProps) {
  const deltaMb = estimatedMb - targetSizeMb;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-muted)] sm:col-span-2">
      <p>
        Estimated output: <strong>{estimatedMb.toFixed(2)} MB</strong>
      </p>
      {targetSizeMode ? (
        <p className="mt-1">
          {deltaMb <= 0
            ? `Current estimate is ${(Math.abs(deltaMb)).toFixed(2)} MB under your target.`
            : `Current estimate is ${deltaMb.toFixed(2)} MB over target. Target Size Mode will step quality down automatically.`}
        </p>
      ) : (
        <p className="mt-1">
          Target mode is off. This is an estimate for your current settings.
        </p>
      )}
    </div>
  );
}
