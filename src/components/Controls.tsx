import {
  type PresetKey,
  type PlatformKey,
  type DitherKey,
  PRESETS,
  PLATFORM_PROFILES,
  FPS_MIN,
  FPS_MAX,
  WIDTH_MIN,
  WIDTH_MAX,
  COLORS_MIN,
  COLORS_MAX,
  SPEED_MIN,
  SPEED_MAX,
  TARGET_SIZE_MIN,
  TARGET_SIZE_MAX,
  MIN_TRIM_DURATION,
} from '../types';
import { clamp } from '../utils';

const fieldClass =
  'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 text-[var(--text)]';

type ControlsProps = {
  preset: PresetKey;
  fps: number;
  width: number;
  colors: number;
  dither: DitherKey;
  speed: number;
  startSec: number;
  durationSec: number;
  loopCount: number;
  platform: PlatformKey;
  targetSizeMb: number;
  targetSizeMode: boolean;
  videoDuration: number;
  onPresetChange: (key: PresetKey) => void;
  onFpsChange: (v: number) => void;
  onWidthChange: (v: number) => void;
  onColorsChange: (v: number) => void;
  onDitherChange: (v: DitherKey) => void;
  onSpeedChange: (v: number) => void;
  onTrimChange: (start: number, duration: number) => void;
  onLoopCountChange: (v: number) => void;
  onPlatformChange: (v: PlatformKey) => void;
  onTargetSizeMbChange: (v: number) => void;
  onTargetSizeModeToggle: () => void;
  onRestoreDefaults: () => void;
};

const TARGET_SIZE_MODE_HELP =
  'Target size mode runs up to 8 optimization attempts. ' +
  'After each render, output size is checked against your MB target. ' +
  'If over target, the next attempt reduces width (~12%), FPS (-1), and colors (step-down) with minimum quality floors. ' +
  'Processing stops as soon as the file is within target; otherwise the final best-effort result is returned.';

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function Controls(props: ControlsProps) {
  const {
    preset, fps, width, colors, dither, speed,
    startSec, durationSec, loopCount, platform,
    targetSizeMb, targetSizeMode, videoDuration,
    onPresetChange, onFpsChange, onWidthChange, onColorsChange,
    onDitherChange, onSpeedChange, onTrimChange, onLoopCountChange,
    onPlatformChange, onTargetSizeMbChange, onTargetSizeModeToggle,
    onRestoreDefaults,
  } = props;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        <span className="mb-1 block font-medium text-[var(--secondary)]">Preset</span>
        <select
          value={preset}
          onChange={(e) => onPresetChange(e.target.value as PresetKey)}
          className={fieldClass}
        >
          <option value="ultra">Ultra quality</option>
          <option value="balanced">Balanced</option>
          <option value="compact">Compact</option>
        </select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-[var(--secondary)]">Dither</span>
        <select
          value={dither}
          onChange={(e) => onDitherChange(e.target.value as DitherKey)}
          className={fieldClass}
        >
          <option value="sierra2_4a">sierra2_4a</option>
          <option value="sierra2">sierra2</option>
          <option value="floyd_steinberg">floyd_steinberg</option>
          <option value="bayer">bayer</option>
          <option value="none">none</option>
        </select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-[var(--secondary)]">FPS</span>
        <input
          type="number"
          min={FPS_MIN}
          max={FPS_MAX}
          value={fps}
          onChange={(e) => onFpsChange(Number(e.target.value))}
          onBlur={() => onFpsChange(clamp(fps, FPS_MIN, FPS_MAX, PRESETS.balanced.fps))}
          className={fieldClass}
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-[var(--secondary)]">Platform target</span>
        <select
          value={platform}
          onChange={(e) => onPlatformChange(e.target.value as PlatformKey)}
          className={fieldClass}
          disabled={!targetSizeMode}
        >
          <option value="linkedin">{PLATFORM_PROFILES.linkedin.label}</option>
          <option value="instagram">{PLATFORM_PROFILES.instagram.label}</option>
          <option value="facebook">{PLATFORM_PROFILES.facebook.label}</option>
          <option value="custom">{PLATFORM_PROFILES.custom.label}</option>
        </select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-[var(--secondary)]">Target size (MB)</span>
        <input
          type="number"
          min={TARGET_SIZE_MIN}
          max={TARGET_SIZE_MAX}
          step={0.5}
          value={targetSizeMb}
          onChange={(e) => {
            onPlatformChange('custom');
            onTargetSizeMbChange(Number(e.target.value));
          }}
          onBlur={() =>
            onTargetSizeMbChange(clamp(targetSizeMb, TARGET_SIZE_MIN, TARGET_SIZE_MAX, 7))
          }
          className={fieldClass}
          disabled={!targetSizeMode}
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-[var(--secondary)]">Width (px)</span>
        <input
          type="number"
          min={WIDTH_MIN}
          max={WIDTH_MAX}
          step={10}
          value={width}
          onChange={(e) => onWidthChange(Number(e.target.value))}
          onBlur={() => onWidthChange(clamp(width, WIDTH_MIN, WIDTH_MAX, PRESETS.balanced.width))}
          className={fieldClass}
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-[var(--secondary)]">Colors</span>
        <input
          type="number"
          min={COLORS_MIN}
          max={COLORS_MAX}
          value={colors}
          onChange={(e) => onColorsChange(Number(e.target.value))}
          onBlur={() =>
            onColorsChange(clamp(colors, COLORS_MIN, COLORS_MAX, PRESETS.balanced.colors))
          }
          className={fieldClass}
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-[var(--secondary)]">Speed</span>
        <input
          type="number"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={0.05}
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          onBlur={() => onSpeedChange(clamp(speed, SPEED_MIN, SPEED_MAX, 1))}
          className={fieldClass}
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-[var(--secondary)]">
          Start (sec)
          {videoDuration > 0 && (
            <span className="ml-2 font-normal text-[var(--text-muted)]">
              of {formatDuration(videoDuration)}
            </span>
          )}
        </span>
        <input
          type="number"
          min={0}
          step={0.1}
          value={startSec}
          onChange={(e) => onTrimChange(Number(e.target.value), durationSec)}
          className={fieldClass}
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-[var(--secondary)]">
          Duration (sec)
          {videoDuration > 0 && (
            <span className="ml-2 font-normal text-[var(--text-muted)]">
              max {formatDuration(Math.max(0, videoDuration - startSec))}
            </span>
          )}
        </span>
        <input
          type="number"
          min={MIN_TRIM_DURATION}
          step={0.1}
          value={durationSec}
          onChange={(e) => onTrimChange(startSec, Number(e.target.value))}
          className={fieldClass}
        />
      </label>

      <label className="text-sm sm:col-span-2">
        <span className="mb-1 block font-medium text-[var(--secondary)]">
          Loop count (0 = infinite)
        </span>
        <input
          type="number"
          min={0}
          value={loopCount}
          onChange={(e) => onLoopCountChange(Number(e.target.value))}
          className={fieldClass}
        />
      </label>

      <p className="text-xs text-[var(--text-muted)] sm:col-span-2">
        {targetSizeMode
          ? PLATFORM_PROFILES[platform].note
          : 'Target size mode is off. Output uses your exact settings in a single pass.'}
      </p>

      <label className="text-sm sm:col-span-2">
        <span className="mb-1 flex items-center gap-2 font-medium text-[var(--secondary)]">
          Target size mode
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--surface-2)] text-[11px] font-semibold text-[var(--secondary)]"
            title={TARGET_SIZE_MODE_HELP}
            aria-label={TARGET_SIZE_MODE_HELP}
          >
            i
          </button>
        </span>
        <button
          type="button"
          onClick={onTargetSizeModeToggle}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--secondary)]"
        >
          {targetSizeMode
            ? `On (aim for \u2264 ${targetSizeMb} MB)`
            : 'Off (single pass quality)'}
        </button>
      </label>

      <div className="sm:col-span-2">
        <button
          type="button"
          onClick={onRestoreDefaults}
          className="text-xs text-[var(--text-muted)] underline hover:text-[var(--secondary)]"
        >
          Restore default settings
        </button>
      </div>
    </div>
  );
}
