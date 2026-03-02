import {
  type DitherKey,
  type PersistedSettings,
  type PresetKey,
  type PlatformKey,
  DITHER_FACTORS,
  BASE_BYTES_PER_PIXEL_FRAME,
  ESTIMATE_COLOR_FLOOR,
  ESTIMATE_COLOR_RANGE,
  SETTINGS_STORAGE_KEY,
} from './types';

export function isPresetKey(value: unknown): value is PresetKey {
  return value === 'ultra' || value === 'balanced' || value === 'compact';
}

export function isPlatformKey(value: unknown): value is PlatformKey {
  return (
    value === 'linkedin' ||
    value === 'instagram' ||
    value === 'facebook' ||
    value === 'custom'
  );
}

export function isDitherKey(value: unknown): value is DitherKey {
  return (
    value === 'none' ||
    value === 'bayer' ||
    value === 'floyd_steinberg' ||
    value === 'sierra2' ||
    value === 'sierra2_4a'
  );
}

export function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function readPersistedSettings(): Partial<PersistedSettings> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const data = parsed as Record<string, unknown>;
    return {
      preset: isPresetKey(data.preset) ? data.preset : undefined,
      fps: typeof data.fps === 'number' ? data.fps : undefined,
      width: typeof data.width === 'number' ? data.width : undefined,
      colors: typeof data.colors === 'number' ? data.colors : undefined,
      dither: isDitherKey(data.dither) ? data.dither : undefined,
      startSec: typeof data.startSec === 'number' ? data.startSec : undefined,
      durationSec:
        typeof data.durationSec === 'number' ? data.durationSec : undefined,
      loopCount: typeof data.loopCount === 'number' ? data.loopCount : undefined,
      speed: typeof data.speed === 'number' ? data.speed : undefined,
      isDark: typeof data.isDark === 'boolean' ? data.isDark : undefined,
      platform: isPlatformKey(data.platform) ? data.platform : undefined,
      targetSizeMb:
        typeof data.targetSizeMb === 'number' ? data.targetSizeMb : undefined,
      targetSizeMode:
        typeof data.targetSizeMode === 'boolean' ? data.targetSizeMode : undefined,
    };
  } catch {
    return {};
  }
}

export function estimateGifBytes(params: {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  colors: number;
  dither: DitherKey;
  bias: number;
}): number {
  const colorFactor =
    ESTIMATE_COLOR_FLOOR +
    (Math.max(2, Math.min(256, params.colors)) / 256) * ESTIMATE_COLOR_RANGE;
  const ditherFactor = DITHER_FACTORS[params.dither];
  const frames = Math.max(1, params.fps * params.durationSec);
  const pixelFrames = Math.max(1, params.width * params.height * frames);
  return pixelFrames * BASE_BYTES_PER_PIXEL_FRAME * colorFactor * ditherFactor * params.bias;
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

export function estimateHeightForWidth(
  candidateWidth: number,
  videoWidth: number,
  videoHeight: number
): number {
  if (videoWidth > 0 && videoHeight > 0) {
    return Math.max(2, Math.round((candidateWidth * (videoHeight / videoWidth)) / 2) * 2);
  }
  return Math.max(2, Math.round((candidateWidth * 9) / 16 / 2) * 2);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
