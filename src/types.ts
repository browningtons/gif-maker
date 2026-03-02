export type PresetKey = 'ultra' | 'balanced' | 'compact';
export type PlatformKey = 'linkedin' | 'instagram' | 'facebook' | 'custom';
export type DitherKey = 'none' | 'bayer' | 'floyd_steinberg' | 'sierra2' | 'sierra2_4a';

export type Settings = {
  fps: number;
  width: number;
  colors: number;
  dither: DitherKey;
};

export type PersistedSettings = {
  preset: PresetKey;
  fps: number;
  width: number;
  colors: number;
  dither: DitherKey;
  startSec: number;
  durationSec: number;
  loopCount: number;
  speed: number;
  isDark: boolean;
  platform: PlatformKey;
  targetSizeMb: number;
  targetSizeMode: boolean;
};

export type VideoMeta = {
  duration: number;
  width: number;
  height: number;
};

export const PRESETS: Record<PresetKey, Settings> = {
  ultra: { fps: 20, width: 1280, colors: 256, dither: 'sierra2_4a' },
  balanced: { fps: 15, width: 960, colors: 256, dither: 'sierra2_4a' },
  compact: { fps: 12, width: 720, colors: 128, dither: 'bayer' },
};

export const PLATFORM_PROFILES: Record<
  PlatformKey,
  { label: string; targetMb: number; note: string }
> = {
  linkedin: {
    label: 'LinkedIn post (7 MB limit)',
    targetMb: 7,
    note: 'Set to the assumed LinkedIn upper limit of 7 MB.',
  },
  instagram: {
    label: 'Instagram (prefer MP4; GIF target 8 MB)',
    targetMb: 8,
    note: 'Instagram is video-first. GIFs may be converted by tools before upload.',
  },
  facebook: {
    label: 'Facebook (roomier target 12 MB)',
    targetMb: 12,
    note: 'Facebook allows larger media, but smaller GIFs still load faster.',
  },
  custom: {
    label: 'Custom target',
    targetMb: 8,
    note: 'Set your own output cap in MB.',
  },
};

export const FFMPEG_CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
export const MIN_TRIM_DURATION = 0.2;
export const SETTINGS_STORAGE_KEY = 'gif-maker:settings:v2';

export const DITHER_FACTORS: Record<DitherKey, number> = {
  none: 0.85,
  bayer: 1.0,
  floyd_steinberg: 1.08,
  sierra2: 1.1,
  sierra2_4a: 1.12,
};

// Estimation model constants
export const BASE_BYTES_PER_PIXEL_FRAME = 0.055;
export const ESTIMATE_COLOR_FLOOR = 0.75;
export const ESTIMATE_COLOR_RANGE = 0.5;
export const ESTIMATE_CONFIDENCE_LOW = 0.65;
export const ESTIMATE_CONFIDENCE_HIGH = 1.35;

// Rendering limits
export const FPS_MIN = 1;
export const FPS_MAX = 60;
export const WIDTH_MIN = 120;
export const WIDTH_MAX = 2560;
export const COLORS_MIN = 2;
export const COLORS_MAX = 256;
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4;
export const TARGET_SIZE_MIN = 1;
export const TARGET_SIZE_MAX = 100;
export const LOOP_MAX = 1000;

// Target size optimization limits
export const TARGET_MAX_ATTEMPTS = 8;
export const TARGET_MIN_WIDTH = 320;
export const TARGET_MIN_FPS = 6;
export const TARGET_MIN_COLORS = 32;
export const TARGET_WIDTH_SHRINK = 0.88;

// FFmpeg retry settings
export const FFMPEG_MAX_RETRIES = 3;
export const FFMPEG_RETRY_DELAY_MS = 2000;

// File size warning threshold (100 MB)
export const LARGE_FILE_WARNING_BYTES = 100 * 1024 * 1024;

export const DEFAULT_PRESET: PresetKey = 'balanced';
