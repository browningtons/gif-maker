import { useState } from 'react';
import {
  type PresetKey,
  type PlatformKey,
  type DitherKey,
  type PlaybackMode,
  type FilterKey,
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
  playbackMode: PlaybackMode;
  filter: FilterKey;
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
  onPlaybackModeChange: (v: PlaybackMode) => void;
  onFilterChange: (v: FilterKey) => void;
  onRestoreDefaults: () => void;
};

const TARGET_SIZE_MODE_HELP =
  'Target Size Mode uses iterative compression: each pass measures the file and only steps down width, frame rate, and color count when needed. ' +
  'Rendering stops immediately once the target is met, or returns the closest best-effort result within quality floors.';

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function Controls(props: ControlsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const {
    preset, fps, width, colors, dither, speed,
    startSec, durationSec, loopCount, platform,
    targetSizeMb, targetSizeMode, playbackMode, filter, videoDuration,
    onPresetChange, onFpsChange, onWidthChange, onColorsChange,
    onDitherChange, onSpeedChange, onTrimChange, onLoopCountChange,
    onPlatformChange, onTargetSizeMbChange, onTargetSizeModeToggle,
    onPlaybackModeChange, onFilterChange, onRestoreDefaults,
  } = props;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--surface-2)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--secondary)]">Target profile</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              LinkedIn and X are tuned first. Recommended targets use 95% of each platform cap.
            </p>
          </div>
          <button
            type="button"
            onClick={onTargetSizeModeToggle}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              targetSizeMode
                ? 'border-[var(--teal-700)] bg-[var(--teal-50)] text-[var(--teal-700)]'
                : 'border-[var(--color-border)] bg-[var(--surface)] text-[var(--text-muted)]'
            }`}
            title={TARGET_SIZE_MODE_HELP}
            aria-label={TARGET_SIZE_MODE_HELP}
          >
            {targetSizeMode ? `Target Size Mode: On (<= ${targetSizeMb} MB)` : 'Target Size Mode: Off'}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-[var(--secondary)]">Platform</span>
            <select
              value={platform}
              onChange={(e) => onPlatformChange(e.target.value as PlatformKey)}
              className={fieldClass}
              disabled={!targetSizeMode}
            >
              <option value="linkedin">
                {PLATFORM_PROFILES.linkedin.label} (limit {PLATFORM_PROFILES.linkedin.limitMb} MB)
              </option>
              <option value="x">
                {PLATFORM_PROFILES.x.label} (limit {PLATFORM_PROFILES.x.limitMb} MB)
              </option>
              <option value="instagram">
                {PLATFORM_PROFILES.instagram.label} (limit {PLATFORM_PROFILES.instagram.limitMb} MB)
              </option>
              <option value="facebook">
                {PLATFORM_PROFILES.facebook.label} (limit {PLATFORM_PROFILES.facebook.limitMb} MB)
              </option>
              <option value="tiktok">
                {PLATFORM_PROFILES.tiktok.label} (limit {PLATFORM_PROFILES.tiktok.limitMb} MB)
              </option>
              <option value="custom">{PLATFORM_PROFILES.custom.label}</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-[var(--secondary)]">Target size (MB)</span>
            <input
              type="number"
              min={TARGET_SIZE_MIN}
              max={TARGET_SIZE_MAX}
              step={0.05}
              value={targetSizeMb}
              onChange={(e) => {
                onPlatformChange('custom');
                onTargetSizeMbChange(Number(e.target.value));
              }}
              onBlur={() =>
                onTargetSizeMbChange(clamp(targetSizeMb, TARGET_SIZE_MIN, TARGET_SIZE_MAX, 6.65))
              }
              className={fieldClass}
              disabled={!targetSizeMode}
            />
          </label>
        </div>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-[var(--secondary)]">Preset</span>
          <select
            value={preset}
            onChange={(e) => onPresetChange(e.target.value as PresetKey)}
            className={fieldClass}
          >
            <option value="ultra">Ultra quality</option>
            <option value="balanced">Balanced (recommended)</option>
            <option value="compact">Compact</option>
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-[var(--secondary)]">Playback</span>
            <select
              value={playbackMode}
              onChange={(e) => onPlaybackModeChange(e.target.value as PlaybackMode)}
              className={fieldClass}
            >
              <option value="normal">Normal</option>
              <option value="boomerang">Boomerang (ping-pong)</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-[var(--secondary)]">Filter</span>
            <select
              value={filter}
              onChange={(e) => onFilterChange(e.target.value as FilterKey)}
              className={fieldClass}
            >
              <option value="none">None</option>
              <option value="grayscale">Grayscale</option>
              <option value="sepia">Sepia</option>
              <option value="contrast">Contrast boost</option>
              <option value="blur">Blur</option>
              <option value="vignette">Vignette</option>
              <option value="pixelate">Pixelate</option>
            </select>
          </label>
        </div>

        {playbackMode === 'boomerang' && (
          <p className="text-xs text-[var(--text-muted)]">
            Boomerang plays forward then backward, doubling the clip length. Keep clips short to avoid memory issues.
          </p>
        )}

        <p className="text-xs text-[var(--text-muted)]">
          {targetSizeMode
            ? PLATFORM_PROFILES[platform].note
            : 'Target Size Mode is off. LoopForge will render one pass with your exact settings.'}
        </p>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--secondary)]">Advanced controls</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Fine-tune frame density, palette, and playback behavior.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--secondary)]"
            aria-expanded={showAdvanced}
            aria-controls="advanced-controls"
          >
            {showAdvanced ? 'Hide advanced' : 'Show advanced'}
          </button>
        </div>

        {showAdvanced && (
          <div id="advanced-controls" className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[var(--secondary)]">FPS</span>
              <p className="mb-1 text-xs text-[var(--text-muted)]">Higher FPS is smoother but larger.</p>
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
              <span className="mb-1 block font-medium text-[var(--secondary)]">Width (px)</span>
              <p className="mb-1 text-xs text-[var(--text-muted)]">Lower width reduces size fastest.</p>
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
              <p className="mb-1 text-xs text-[var(--text-muted)]">Fewer colors compress better.</p>
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
              <span className="mb-1 block font-medium text-[var(--secondary)]">Dither</span>
              <p className="mb-1 text-xs text-[var(--text-muted)]">Controls color blending and texture.</p>
              <select
                value={dither}
                onChange={(e) => onDitherChange(e.target.value as DitherKey)}
                className={fieldClass}
              >
                <option value="sierra2_4a">sierra2_4a (balanced detail)</option>
                <option value="sierra2">sierra2</option>
                <option value="floyd_steinberg">floyd_steinberg</option>
                <option value="bayer">bayer (smaller files)</option>
                <option value="none">none (cleanest compression)</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-[var(--secondary)]">Speed</span>
              <p className="mb-1 text-xs text-[var(--text-muted)]">1.0 is original speed.</p>
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
              <p className="mb-1 text-xs text-[var(--text-muted)]">Optional trim start point.</p>
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
              <p className="mb-1 text-xs text-[var(--text-muted)]">Shorter clips always compress faster.</p>
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
              <span className="mb-1 block font-medium text-[var(--secondary)]">Loop count (0 = infinite)</span>
              <input
                type="number"
                min={0}
                value={loopCount}
                onChange={(e) => onLoopCountChange(Number(e.target.value))}
                className={fieldClass}
              />
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
        )}
      </section>
    </div>
  );
}
