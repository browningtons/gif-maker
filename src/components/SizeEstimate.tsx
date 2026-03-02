import { ESTIMATE_CONFIDENCE_LOW, ESTIMATE_CONFIDENCE_HIGH } from '../types';

type SizeEstimateProps = {
  estimatedMb: number;
  targetSizeMode: boolean;
  targetSizeMb: number;
};

export function SizeEstimate({ estimatedMb, targetSizeMode, targetSizeMb }: SizeEstimateProps) {
  const estimatedMinMb = estimatedMb * ESTIMATE_CONFIDENCE_LOW;
  const estimatedMaxMb = estimatedMb * ESTIMATE_CONFIDENCE_HIGH;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-muted)] sm:col-span-2">
      <p>
        Estimated output: <strong>{estimatedMb.toFixed(2)} MB</strong> (likely range{' '}
        {estimatedMinMb.toFixed(2)}\u2013{estimatedMaxMb.toFixed(2)} MB)
      </p>
      {targetSizeMode ? (
        <p className="mt-1">
          {estimatedMaxMb <= targetSizeMb
            ? 'Likely under target size.'
            : estimatedMinMb > targetSizeMb
              ? 'Likely over target size. Reduce duration, width, or FPS.'
              : 'Close to target; actual output may vary by scene complexity.'}
        </p>
      ) : (
        <p className="mt-1">
          Target mode is off. This is an estimate for your current settings.
        </p>
      )}
    </div>
  );
}
