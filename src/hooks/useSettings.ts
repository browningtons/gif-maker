import { useEffect, useRef, useState } from 'react';
import {
  type PresetKey,
  type PlatformKey,
  type DitherKey,
  type PersistedSettings,
  PRESETS,
  PLATFORM_PROFILES,
  SETTINGS_STORAGE_KEY,
  MIN_TRIM_DURATION,
  DEFAULT_PRESET,
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
  LOOP_MAX,
  MEME_TEXT_SCALE_MIN,
  MEME_TEXT_SCALE_MAX,
} from '../types';
import { clamp, readPersistedSettings } from '../utils';

export function useSettings() {
  const persistedRef = useRef<Partial<PersistedSettings> | null>(null);
  if (persistedRef.current === null) {
    persistedRef.current = readPersistedSettings();
  }
  const persisted = persistedRef.current;

  const [preset, setPreset] = useState<PresetKey>(persisted.preset ?? DEFAULT_PRESET);
  const [fps, setFps] = useState(
    clamp(persisted.fps ?? PRESETS[DEFAULT_PRESET].fps, FPS_MIN, FPS_MAX, PRESETS[DEFAULT_PRESET].fps)
  );
  const [width, setWidth] = useState(
    clamp(persisted.width ?? PRESETS[DEFAULT_PRESET].width, WIDTH_MIN, WIDTH_MAX, PRESETS[DEFAULT_PRESET].width)
  );
  const [colors, setColors] = useState(
    clamp(persisted.colors ?? PRESETS[DEFAULT_PRESET].colors, COLORS_MIN, COLORS_MAX, PRESETS[DEFAULT_PRESET].colors)
  );
  const [dither, setDither] = useState<DitherKey>(persisted.dither ?? PRESETS[DEFAULT_PRESET].dither);
  const [startSec, setStartSec] = useState(
    clamp(persisted.startSec ?? 0, 0, 3600, 0)
  );
  const [durationSec, setDurationSec] = useState(
    clamp(persisted.durationSec ?? 5, MIN_TRIM_DURATION, 3600, 5)
  );
  const [loopCount, setLoopCount] = useState(
    clamp(persisted.loopCount ?? 0, 0, LOOP_MAX, 0)
  );
  const [speed, setSpeed] = useState(
    clamp(persisted.speed ?? 1, SPEED_MIN, SPEED_MAX, 1)
  );
  const [isDark, setIsDark] = useState(persisted.isDark ?? false);
  const [platform, setPlatform] = useState<PlatformKey>(persisted.platform ?? 'linkedin');
  const [targetSizeMb, setTargetSizeMb] = useState(
    clamp(
      persisted.targetSizeMb ?? PLATFORM_PROFILES.linkedin.targetMb,
      TARGET_SIZE_MIN,
      TARGET_SIZE_MAX,
      PLATFORM_PROFILES.linkedin.targetMb
    )
  );
  const [targetSizeMode, setTargetSizeMode] = useState(persisted.targetSizeMode ?? true);
  const [memeEnabled, setMemeEnabled] = useState(persisted.memeEnabled ?? false);
  const [memeTopText, setMemeTopText] = useState(persisted.memeTopText ?? '');
  const [memeBottomText, setMemeBottomText] = useState(persisted.memeBottomText ?? '');
  const [memeTextScale, setMemeTextScale] = useState(
    clamp(persisted.memeTextScale ?? 0.09, MEME_TEXT_SCALE_MIN, MEME_TEXT_SCALE_MAX, 0.09)
  );

  // Persist settings to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const snapshot: PersistedSettings = {
      preset,
      fps: clamp(fps, FPS_MIN, FPS_MAX, PRESETS[DEFAULT_PRESET].fps),
      width: clamp(width, WIDTH_MIN, WIDTH_MAX, PRESETS[DEFAULT_PRESET].width),
      colors: clamp(colors, COLORS_MIN, COLORS_MAX, PRESETS[DEFAULT_PRESET].colors),
      dither,
      startSec: clamp(startSec, 0, 3600, 0),
      durationSec: clamp(durationSec, MIN_TRIM_DURATION, 3600, 5),
      loopCount: clamp(loopCount, 0, LOOP_MAX, 0),
      speed: clamp(speed, SPEED_MIN, SPEED_MAX, 1),
      isDark,
      platform,
      targetSizeMb: clamp(
        targetSizeMb,
        TARGET_SIZE_MIN,
        TARGET_SIZE_MAX,
        PLATFORM_PROFILES.linkedin.targetMb
      ),
      targetSizeMode,
      memeEnabled,
      memeTopText,
      memeBottomText,
      memeTextScale: clamp(memeTextScale, MEME_TEXT_SCALE_MIN, MEME_TEXT_SCALE_MAX, 0.09),
    };
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
  }, [
    colors, dither, durationSec, fps, isDark, loopCount,
    memeBottomText, memeEnabled, memeTextScale, memeTopText,
    platform, preset, speed, startSec, targetSizeMb, targetSizeMode, width,
  ]);

  // Sync platform selection to target size
  useEffect(() => {
    if (platform !== 'custom') {
      setTargetSizeMb(PLATFORM_PROFILES[platform].targetMb);
    }
  }, [platform]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const applyPreset = (next: PresetKey) => {
    setPreset(next);
    setFps(PRESETS[next].fps);
    setWidth(PRESETS[next].width);
    setColors(PRESETS[next].colors);
    setDither(PRESETS[next].dither);
  };

  const restoreDefaults = () => {
    applyPreset(DEFAULT_PRESET);
    setStartSec(0);
    setDurationSec(5);
    setLoopCount(0);
    setSpeed(1);
    setPlatform('linkedin');
    setTargetSizeMb(PLATFORM_PROFILES.linkedin.targetMb);
    setTargetSizeMode(true);
    setMemeEnabled(false);
    setMemeTopText('');
    setMemeBottomText('');
    setMemeTextScale(0.09);
  };

  const clampTrim = (nextStart: number, nextDuration: number, videoDuration: number) => {
    if (videoDuration <= 0) {
      setStartSec(Math.max(0, nextStart));
      setDurationSec(Math.max(MIN_TRIM_DURATION, nextDuration));
      return;
    }
    const maxStart = Math.max(0, videoDuration - MIN_TRIM_DURATION);
    const safeStart = Math.min(Math.max(0, nextStart), maxStart);
    const maxDuration = Math.max(MIN_TRIM_DURATION, videoDuration - safeStart);
    const safeDuration = Math.min(Math.max(MIN_TRIM_DURATION, nextDuration), maxDuration);
    setStartSec(Number(safeStart.toFixed(2)));
    setDurationSec(Number(safeDuration.toFixed(2)));
  };

  return {
    preset, setPreset, applyPreset,
    fps, setFps,
    width, setWidth,
    colors, setColors,
    dither, setDither,
    startSec, setStartSec,
    durationSec, setDurationSec,
    loopCount, setLoopCount,
    speed, setSpeed,
    isDark, setIsDark,
    platform, setPlatform,
    targetSizeMb, setTargetSizeMb,
    targetSizeMode, setTargetSizeMode,
    memeEnabled, setMemeEnabled,
    memeTopText, setMemeTopText,
    memeBottomText, setMemeBottomText,
    memeTextScale, setMemeTextScale,
    restoreDefaults,
    clampTrim,
  };
}
