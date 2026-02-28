import { useEffect, useMemo, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

type PresetKey = 'ultra' | 'balanced' | 'compact';
type PlatformKey = 'linkedin' | 'instagram' | 'facebook' | 'custom';

type Settings = {
  fps: number;
  width: number;
  colors: number;
  dither: 'none' | 'bayer' | 'floyd_steinberg' | 'sierra2' | 'sierra2_4a';
};

type DitherKey = Settings['dither'];

const PRESETS: Record<PresetKey, Settings> = {
  ultra: { fps: 20, width: 1280, colors: 256, dither: 'sierra2_4a' },
  balanced: { fps: 15, width: 960, colors: 256, dither: 'sierra2_4a' },
  compact: { fps: 12, width: 720, colors: 128, dither: 'bayer' }
};

const PLATFORM_PROFILES: Record<
  PlatformKey,
  { label: string; targetMb: number; note: string }
> = {
  linkedin: {
    label: 'LinkedIn post (7 MB limit)',
    targetMb: 7,
    note: 'Set to the assumed LinkedIn upper limit of 7 MB.'
  },
  instagram: {
    label: 'Instagram (prefer MP4; GIF target 8 MB)',
    targetMb: 8,
    note: 'Instagram is video-first. GIFs may be converted by tools before upload.'
  },
  facebook: {
    label: 'Facebook (roomier target 12 MB)',
    targetMb: 12,
    note: 'Facebook allows larger media, but smaller GIFs still load faster.'
  },
  custom: {
    label: 'Custom target',
    targetMb: 8,
    note: 'Set your own output cap in MB.'
  }
};

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
const MIN_TRIM_DURATION = 0.2;

const DITHER_FACTORS: Record<DitherKey, number> = {
  none: 0.85,
  bayer: 1.0,
  floyd_steinberg: 1.08,
  sierra2: 1.1,
  sierra2_4a: 1.12
};

function estimateGifBytes(params: {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  colors: number;
  dither: DitherKey;
  bias: number;
}) {
  const baseBytesPerPixelFrame = 0.055;
  const colorFactor = 0.75 + (Math.max(2, Math.min(256, params.colors)) / 256) * 0.5;
  const ditherFactor = DITHER_FACTORS[params.dither];
  const frames = Math.max(1, params.fps * params.durationSec);
  const pixelFrames = Math.max(1, params.width * params.height * frames);
  return pixelFrames * baseBytesPerPixelFrame * colorFactor * ditherFactor * params.bias;
}

function formatTime(seconds: number) {
  const s = Math.max(0, seconds);
  const minutes = Math.floor(s / 60);
  const remainder = s - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, '0')}`;
}

function App() {
  const ffmpegRef = useRef(new FFmpeg());
  const [loaded, setLoaded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<PresetKey>('balanced');
  const [fps, setFps] = useState(PRESETS.balanced.fps);
  const [width, setWidth] = useState(PRESETS.balanced.width);
  const [colors, setColors] = useState(PRESETS.balanced.colors);
  const [dither, setDither] = useState<Settings['dither']>(PRESETS.balanced.dither);
  const [startSec, setStartSec] = useState(0);
  const [durationSec, setDurationSec] = useState(5);
  const [loopCount, setLoopCount] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Load ffmpeg and drop a video to begin.');
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [platform, setPlatform] = useState<PlatformKey>('linkedin');
  const [targetSizeMb, setTargetSizeMb] = useState(PLATFORM_PROFILES.linkedin.targetMb);
  const [targetSizeMode, setTargetSizeMode] = useState(true);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);
  const [estimateBias, setEstimateBias] = useState(1);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    if (platform !== 'custom') {
      setTargetSizeMb(PLATFORM_PROFILES[platform].targetMb);
    }
  }, [platform]);

  useEffect(() => {
    if (!file) {
      setVideoDuration(0);
      setVideoWidth(0);
      setVideoHeight(0);
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = objectUrl;

    const onLoadedMetadata = () => {
      const duration = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 0;
      const sourceWidth = probe.videoWidth || 0;
      const sourceHeight = probe.videoHeight || 0;
      setVideoDuration(duration);
      setVideoWidth(sourceWidth);
      setVideoHeight(sourceHeight);
      setStartSec(0);
      setDurationSec(duration > 0 ? Math.min(5, Math.max(MIN_TRIM_DURATION, duration)) : 5);
    };

    probe.addEventListener('loadedmetadata', onLoadedMetadata);
    probe.load();

    return () => {
      probe.removeEventListener('loadedmetadata', onLoadedMetadata);
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const gifName = useMemo(() => {
    if (!file) return 'output.gif';
    const base = file.name.replace(/\.[^.]+$/, '');
    return `${base}.gif`;
  }, [file]);

  const applyPreset = (next: PresetKey) => {
    setPreset(next);
    setFps(PRESETS[next].fps);
    setWidth(PRESETS[next].width);
    setColors(PRESETS[next].colors);
    setDither(PRESETS[next].dither);
  };

  const clampTrim = (nextStart: number, nextDuration: number) => {
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

  const effectiveDuration = useMemo(
    () => Math.max(MIN_TRIM_DURATION, durationSec) / Math.max(0.25, speed),
    [durationSec, speed]
  );

  const endSec = useMemo(() => {
    if (videoDuration <= 0) return startSec + durationSec;
    return Math.min(videoDuration, startSec + durationSec);
  }, [durationSec, startSec, videoDuration]);

  const outputHeight = useMemo(() => {
    if (videoWidth > 0 && videoHeight > 0) {
      return Math.max(2, Math.round((width * (videoHeight / videoWidth)) / 2) * 2);
    }
    return Math.max(2, Math.round((width * 9 / 16) / 2) * 2);
  }, [videoHeight, videoWidth, width]);

  const estimatedBytes = useMemo(
    () =>
      estimateGifBytes({
        width: Math.max(120, width),
        height: outputHeight,
        fps: Math.max(1, fps),
        durationSec: effectiveDuration,
        colors,
        dither,
        bias: estimateBias
      }),
    [colors, dither, effectiveDuration, estimateBias, fps, outputHeight, width]
  );

  const estimatedMb = estimatedBytes / (1024 * 1024);
  const estimatedMinMb = estimatedMb * 0.65;
  const estimatedMaxMb = estimatedMb * 1.35;
  const startPct = videoDuration > 0 ? (startSec / videoDuration) * 100 : 0;
  const endPct = videoDuration > 0 ? (endSec / videoDuration) * 100 : 0;

  const onStartHandleChange = (value: number) => {
    const currentEnd = videoDuration > 0 ? endSec : startSec + durationSec;
    const safeStart = Math.min(Math.max(0, value), Math.max(0, currentEnd - MIN_TRIM_DURATION));
    clampTrim(safeStart, currentEnd - safeStart);
  };

  const onEndHandleChange = (value: number) => {
    const maxEnd = videoDuration > 0 ? videoDuration : startSec + Math.max(MIN_TRIM_DURATION, durationSec);
    const safeEnd = Math.max(startSec + MIN_TRIM_DURATION, Math.min(value, maxEnd));
    clampTrim(startSec, safeEnd - startSec);
  };

  const loadFFmpeg = async () => {
    if (loaded) return;
    const ffmpeg = ffmpegRef.current;
    setStatus('Loading ffmpeg core (first run can take ~30MB)...');
    ffmpeg.on('progress', ({ progress: p }) => {
      setProgress(Math.max(0, Math.min(1, p || 0)));
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm')
    });

    setLoaded(true);
    setStatus('ffmpeg loaded. Ready to generate.');
  };

  const toFixed = (value: number) => value.toFixed(2);

  const generateGif = async () => {
    if (!file) {
      setStatus('Choose a video file first.');
      return;
    }

    try {
      await loadFFmpeg();
      setGenerating(true);
      setProgress(0);
      setStatus('Preparing video...');

      const ffmpeg = ffmpegRef.current;
      const inputName = `input-${Date.now()}-${file.name}`;
      const paletteName = `palette-${Date.now()}.png`;
      const outputName = `output-${Date.now()}.gif`;

      await ffmpeg.writeFile(inputName, await fetchFile(file));

      const trimArgs = ['-ss', toFixed(Math.max(0, startSec)), '-t', toFixed(Math.max(MIN_TRIM_DURATION, durationSec))];
      const speedFilter = speed === 1 ? '' : `,setpts=PTS/${speed}`;
      const targetBytes = Math.max(1, targetSizeMb) * 1024 * 1024;
      const estimateHeightForWidth = (candidateWidth: number) => {
        if (videoWidth > 0 && videoHeight > 0) {
          return Math.max(2, Math.round((candidateWidth * (videoHeight / videoWidth)) / 2) * 2);
        }
        return Math.max(2, Math.round((candidateWidth * 9 / 16) / 2) * 2);
      };

      const renderAttempt = async (
        attemptWidth: number,
        attemptFps: number,
        attemptColors: number,
        attemptLabel: string
      ) => {
        const scaleAndRate = `fps=${attemptFps},scale=${attemptWidth}:-1:flags=lanczos${speedFilter}`;
        setStatus(attemptLabel);
        await ffmpeg.exec([
          '-y',
          '-i',
          inputName,
          ...trimArgs,
          '-frames:v',
          '1',
          '-update',
          '1',
          '-vf',
          `${scaleAndRate},palettegen=max_colors=${attemptColors}:stats_mode=full`,
          paletteName
        ]);
        await ffmpeg.exec([
          '-y',
          '-i',
          inputName,
          ...trimArgs,
          '-i',
          paletteName,
          '-lavfi',
          `${scaleAndRate}[x];[x][1:v]paletteuse=dither=${dither}:diff_mode=rectangle`,
          '-loop',
          String(loopCount),
          outputName
        ]);
        const data = await ffmpeg.readFile(outputName);
        const bytes =
          data instanceof Uint8Array ? new Uint8Array(data) : new TextEncoder().encode(data);
        return new Blob([bytes], { type: 'image/gif' });
      };

      let finalBlob: Blob | null = null;
      let hitTarget = false;
      let finalWidth = Math.max(320, Math.round(width / 2) * 2);
      let finalFps = Math.max(6, fps);
      let finalColors = Math.max(32, Math.min(256, colors));

      if (targetSizeMode) {
        let attemptWidth = Math.max(320, Math.round(width / 2) * 2);
        let attemptFps = Math.max(6, fps);
        let attemptColors = Math.max(32, Math.min(256, colors));
        const maxAttempts = 8;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          finalWidth = attemptWidth;
          finalFps = attemptFps;
          finalColors = attemptColors;
          finalBlob = await renderAttempt(
            attemptWidth,
            attemptFps,
            attemptColors,
            `Generating attempt ${attempt}/${maxAttempts} for <= ${targetSizeMb} MB...`
          );

          if (finalBlob.size <= targetBytes) {
            hitTarget = true;
            break;
          }

          attemptWidth = Math.max(320, Math.floor((attemptWidth * 0.88) / 2) * 2);
          attemptFps = Math.max(6, attemptFps - 1);
          attemptColors = Math.max(48, attemptColors - (attempt < 3 ? 16 : 8));
        }
      } else {
        finalWidth = Math.max(320, Math.round(width / 2) * 2);
        finalFps = Math.max(6, fps);
        finalColors = Math.max(32, Math.min(256, colors));
        finalBlob = await renderAttempt(
          finalWidth,
          finalFps,
          finalColors,
          'Generating GIF with current settings...'
        );
      }

      if (!finalBlob) {
        throw new Error('No GIF output generated');
      }

      if (gifUrl) URL.revokeObjectURL(gifUrl);
      const url = URL.createObjectURL(finalBlob);
      setGifUrl(url);

      const predictedBytes = estimateGifBytes({
        width: finalWidth,
        height: estimateHeightForWidth(finalWidth),
        fps: finalFps,
        durationSec: Math.max(MIN_TRIM_DURATION, durationSec) / Math.max(0.25, speed),
        colors: finalColors,
        dither,
        bias: 1
      });
      if (predictedBytes > 0) {
        const measuredBias = Math.min(3, Math.max(0.35, finalBlob.size / predictedBytes));
        setEstimateBias((prev) => Number(((prev * 0.6) + (measuredBias * 0.4)).toFixed(4)));
      }

      if (!targetSizeMode) {
        setStatus(`Done. GIF size ${(finalBlob.size / (1024 * 1024)).toFixed(2)} MB.`);
      } else if (hitTarget) {
        setStatus(`Done. GIF size ${(finalBlob.size / (1024 * 1024)).toFixed(2)} MB (within target).`);
      } else {
        setStatus(
          `Done. Best effort ${(finalBlob.size / (1024 * 1024)).toFixed(2)} MB; lower duration/width for <= ${targetSizeMb} MB.`
        );
      }

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(paletteName);
      await ffmpeg.deleteFile(outputName);
    } catch (error) {
      console.error(error);
      setStatus('Conversion failed. Try a shorter clip or lower preset.');
    } finally {
      setGenerating(false);
    }
  };

  const fieldClass =
    'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 text-[var(--text)]';

  return (
    <main className="min-h-screen p-6 text-[var(--text)] md:p-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-[var(--radius)] border border-[var(--color-border-subtle)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[var(--secondary)]">GIF Maker</h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Browser-based GIF creation from your videos. No server needed, shareable with friends.
              </p>
            </div>
            <button
              onClick={() => setIsDark((current) => !current)}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--secondary)]"
            >
              {isDark ? 'Light theme' : 'Dark theme'}
            </button>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[var(--radius)] border border-[var(--color-border-subtle)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--secondary)]">Video file</label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--text)]"
                />
                {file ? <p className="mt-2 text-xs text-[var(--text-muted)]">Loaded: {file.name}</p> : null}
                {file && videoDuration > 0 ? (
                  <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
                      <span className="font-medium text-[var(--secondary)]">Trim timeline</span>
                      <span>
                        {formatTime(startSec)} - {formatTime(endSec)} / {formatTime(videoDuration)}
                      </span>
                    </div>
                    <div className="relative h-8">
                      <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-[var(--color-border)]" />
                      <div
                        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--teal-500)]"
                        style={{ left: `${startPct}%`, width: `${Math.max(1, endPct - startPct)}%` }}
                      />
                      <input
                        type="range"
                        min={0}
                        max={videoDuration}
                        step={0.01}
                        value={startSec}
                        onChange={(e) => onStartHandleChange(Number(e.target.value))}
                        className="trim-slider"
                      />
                      <input
                        type="range"
                        min={0}
                        max={videoDuration}
                        step={0.01}
                        value={endSec}
                        onChange={(e) => onEndHandleChange(Number(e.target.value))}
                        className="trim-slider"
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-[var(--text-muted)]">
                      <span>0:00.0</span>
                      <span>{formatTime(videoDuration)}</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--secondary)]">Preset</span>
                  <select
                    value={preset}
                    onChange={(e) => applyPreset(e.target.value as PresetKey)}
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
                    onChange={(e) => setDither(e.target.value as Settings['dither'])}
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
                    min={1}
                    max={60}
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    className={fieldClass}
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--secondary)]">Platform target</span>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as PlatformKey)}
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
                    min={1}
                    max={100}
                    step={0.5}
                    value={targetSizeMb}
                    onChange={(e) => {
                      setPlatform('custom');
                      setTargetSizeMb(Number(e.target.value));
                    }}
                    className={fieldClass}
                    disabled={!targetSizeMode}
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--secondary)]">Width (px)</span>
                  <input
                    type="number"
                    min={120}
                    max={2560}
                    step={10}
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className={fieldClass}
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--secondary)]">Colors</span>
                  <input
                    type="number"
                    min={2}
                    max={256}
                    value={colors}
                    onChange={(e) => setColors(Number(e.target.value))}
                    className={fieldClass}
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--secondary)]">Speed</span>
                  <input
                    type="number"
                    min={0.25}
                    max={4}
                    step={0.05}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className={fieldClass}
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--secondary)]">Start (sec)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={startSec}
                    onChange={(e) => clampTrim(Number(e.target.value), durationSec)}
                    className={fieldClass}
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--secondary)]">Duration (sec)</span>
                  <input
                    type="number"
                    min={0.2}
                    step={0.1}
                    value={durationSec}
                    onChange={(e) => clampTrim(startSec, Number(e.target.value))}
                    className={fieldClass}
                  />
                </label>

                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium text-[var(--secondary)]">Loop count (0 = infinite)</span>
                  <input
                    type="number"
                    min={0}
                    value={loopCount}
                    onChange={(e) => setLoopCount(Number(e.target.value))}
                    className={fieldClass}
                  />
                </label>

                <p className="text-xs text-[var(--text-muted)] sm:col-span-2">
                  {targetSizeMode
                    ? PLATFORM_PROFILES[platform].note
                    : 'Target size mode is off. Output uses your exact settings in a single pass.'}
                </p>

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-muted)] sm:col-span-2">
                  <p>
                    Estimated output: <strong>{estimatedMb.toFixed(2)} MB</strong> (likely range{' '}
                    {estimatedMinMb.toFixed(2)}-{estimatedMaxMb.toFixed(2)} MB)
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
                    <p className="mt-1">Target mode is off. This is an estimate for your current settings.</p>
                  )}
                </div>

                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium text-[var(--secondary)]">Target size mode</span>
                  <button
                    type="button"
                    onClick={() => setTargetSizeMode((current) => !current)}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--secondary)]"
                  >
                    {targetSizeMode ? `On (aim for <= ${targetSizeMb} MB)` : 'Off (single pass quality)'}
                  </button>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={generateGif}
                  disabled={!file || generating}
                  className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-contrast)] hover:bg-[var(--orange-700)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generating ? 'Generating...' : 'Create GIF'}
                </button>
                <button
                  onClick={loadFFmpeg}
                  disabled={loaded}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--secondary)] disabled:opacity-50"
                >
                  {loaded ? 'ffmpeg loaded' : 'Preload ffmpeg'}
                </button>
                <span className="text-xs text-[var(--text-muted)]">{status}</span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full bg-[var(--link)] transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <aside className="rounded-[var(--radius)] border border-[var(--color-border-subtle)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
            <h2 className="text-lg font-semibold text-[var(--secondary)]">Preview</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Your generated GIF will appear here.</p>
            <div className="mt-4 flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
              {gifUrl ? (
                <img src={gifUrl} alt="Generated GIF" className="max-h-[420px] w-full rounded-lg object-contain" />
              ) : (
                <span className="text-sm text-[var(--text-muted)]">No GIF yet</span>
              )}
            </div>
            {gifUrl ? (
              <a
                href={gifUrl}
                download={gifName}
                className="mt-4 inline-block rounded-xl bg-[var(--secondary)] px-4 py-2 text-sm font-semibold text-[var(--secondary-contrast)]"
              >
                Download GIF
              </a>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}

export default App;
