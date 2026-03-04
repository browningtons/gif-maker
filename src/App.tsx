import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MIN_TRIM_DURATION,
  SPEED_MIN,
} from './types';
import { estimateGifBytes, estimateHeightForWidth } from './utils';
import { useSettings } from './hooks/useSettings';
import { useVideoMeta } from './hooks/useVideoMeta';
import { useFFmpeg } from './hooks/useFFmpeg';
import { Header } from './components/Header';
import { VideoUpload } from './components/VideoUpload';
import { Controls } from './components/Controls';
import { SizeEstimate } from './components/SizeEstimate';
import { ActionBar } from './components/ActionBar';
import { Preview } from './components/Preview';
import { Celebration } from './components/Celebration';

function getDefaultGifName(file: File | null): string {
  if (!file) return 'output.gif';
  return `${file.name.replace(/\.[^.]+$/, '')}.gif`;
}

function App() {
  const settings = useSettings();
  const [file, setFile] = useState<File | null>(null);
  const [timeToFirstGifMs, setTimeToFirstGifMs] = useState<number | null>(null);
  const firstRenderStartRef = useRef<number | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const lastGifUrlRef = useRef<string | null>(null);

  const ffmpeg = useFFmpeg();

  useEffect(() => {
    void ffmpeg.loadFFmpeg({ silent: true }).catch(() => {
      // Background preload failure is non-blocking; we retry when generating.
    });
  }, [ffmpeg.loadFFmpeg]);

  const onVideoMetaLoaded = useCallback(
    (defaultDuration: number) => {
      settings.setStartSec(0);
      settings.setDurationSec(defaultDuration);
    },
    [settings.setDurationSec, settings.setStartSec]
  );
  const videoMeta = useVideoMeta(file, onVideoMetaLoaded);

  // Clipboard paste handler
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      ) {
        return;
      }
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind !== 'file') continue;
        const candidate = item.getAsFile();
        if (candidate && candidate.type.startsWith('video/')) {
          event.preventDefault();
          ffmpeg.clearGifPreview();
          setFile(candidate);
          ffmpeg.setStatus(`Loaded ${candidate.name} from clipboard.`);
          return;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [ffmpeg]);

  const handleFileSelected = useCallback(
    (nextFile: File, source: 'picker' | 'drop') => {
      ffmpeg.clearGifPreview();
      setFile(nextFile);
      if (source === 'drop') ffmpeg.setStatus(`Loaded ${nextFile.name} from drag-and-drop.`);
    },
    [ffmpeg]
  );

  const [gifName, setGifName] = useState(() => getDefaultGifName(file));
  useEffect(() => {
    setGifName(getDefaultGifName(file));
  }, [file]);

  const effectiveDuration = useMemo(
    () => Math.max(MIN_TRIM_DURATION, settings.durationSec) / Math.max(SPEED_MIN, settings.speed),
    [settings.durationSec, settings.speed]
  );

  const outputHeight = useMemo(
    () => estimateHeightForWidth(settings.width, videoMeta.width, videoMeta.height),
    [settings.width, videoMeta.width, videoMeta.height]
  );

  const estimatedBytes = useMemo(
    () =>
      estimateGifBytes({
        width: Math.max(120, settings.width),
        height: outputHeight,
        fps: Math.max(1, settings.fps),
        durationSec: effectiveDuration,
        colors: settings.colors,
        dither: settings.dither,
        bias: ffmpeg.estimateBias,
      }),
    [settings.colors, settings.dither, effectiveDuration, ffmpeg.estimateBias, settings.fps, outputHeight, settings.width]
  );

  const estimatedMb = estimatedBytes / (1024 * 1024);

  const handleGenerate = useCallback(async () => {
    if (!file) {
      ffmpeg.setStatus('Choose a video file first.');
      return;
    }
    if (firstRenderStartRef.current === null) {
      firstRenderStartRef.current = performance.now();
    }
    const result = await ffmpeg.generateGif({
      file,
      fps: settings.fps,
      width: settings.width,
      colors: settings.colors,
      dither: settings.dither,
      speed: settings.speed,
      startSec: settings.startSec,
      durationSec: settings.durationSec,
      loopCount: settings.loopCount,
      targetSizeMode: settings.targetSizeMode,
      targetSizeMb: settings.targetSizeMb,
      overlayTextEnabled: false,
      overlayText: '',
      overlayTextX: 0.08,
      overlayTextY: 0.12,
      overlayTextSizePx: 36,
      overlayBoxWidthPct: 0.84,
      overlayBoxHeightPx: 86,
      overlayTextFont: 'meme',
      videoWidth: videoMeta.width,
      videoHeight: videoMeta.height,
    });
    if (result && timeToFirstGifMs === null && firstRenderStartRef.current !== null) {
      setTimeToFirstGifMs(Math.round(performance.now() - firstRenderStartRef.current));
    }
  }, [file, settings.fps, settings.width, settings.colors, settings.dither,
      settings.speed, settings.startSec, settings.durationSec, settings.loopCount,
      settings.targetSizeMode, settings.targetSizeMb,
      videoMeta.width, videoMeta.height,
      ffmpeg.generateGif, ffmpeg.setStatus, timeToFirstGifMs]);

  const handleQuickPreview = useCallback(async () => {
    if (!file) {
      ffmpeg.setStatus('Choose a video file first.');
      return;
    }
    if (firstRenderStartRef.current === null) {
      firstRenderStartRef.current = performance.now();
    }
    const result = await ffmpeg.generateGif({
      file,
      fps: settings.fps,
      width: settings.width,
      colors: settings.colors,
      dither: settings.dither,
      speed: settings.speed,
      startSec: settings.startSec,
      durationSec: settings.durationSec,
      loopCount: settings.loopCount,
      targetSizeMode: false,
      targetSizeMb: settings.targetSizeMb,
      overlayTextEnabled: false,
      overlayText: '',
      overlayTextX: 0.08,
      overlayTextY: 0.12,
      overlayTextSizePx: 36,
      overlayBoxWidthPct: 0.84,
      overlayBoxHeightPx: 86,
      overlayTextFont: 'meme',
      previewFrameCount: 6,
      videoWidth: videoMeta.width,
      videoHeight: videoMeta.height,
    });
    if (result && timeToFirstGifMs === null && firstRenderStartRef.current !== null) {
      setTimeToFirstGifMs(Math.round(performance.now() - firstRenderStartRef.current));
    }
  }, [
    file, settings.fps, settings.width, settings.colors, settings.dither, settings.speed,
    settings.startSec, settings.durationSec, settings.loopCount, settings.targetSizeMb,
    videoMeta.width, videoMeta.height, ffmpeg.generateGif, ffmpeg.setStatus, timeToFirstGifMs,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter to generate
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (file && !ffmpeg.generating) {
          handleGenerate();
        }
        return;
      }
      // Escape to cancel
      if (event.key === 'Escape' && ffmpeg.generating) {
        event.preventDefault();
        ffmpeg.cancelRender();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, ffmpeg.cancelRender, ffmpeg.generating, handleGenerate]);

  const videoDimensions = useMemo(
    () => (videoMeta.width > 0 ? { width: videoMeta.width, height: videoMeta.height } : null),
    [videoMeta.height, videoMeta.width]
  );

  useEffect(() => {
    if (!ffmpeg.gifUrl || ffmpeg.gifUrl === lastGifUrlRef.current) return;
    lastGifUrlRef.current = ffmpeg.gifUrl;
    setShowCelebration(true);
    const timer = window.setTimeout(() => setShowCelebration(false), 2400);
    return () => window.clearTimeout(timer);
  }, [ffmpeg.gifUrl]);

  return (
    <main className="min-h-screen p-6 text-[var(--text)] md:p-10">
      <Celebration show={showCelebration} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Header
          isDark={settings.isDark}
          onToggleTheme={() => settings.setIsDark((c) => !c)}
        />

        <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[var(--radius)] border border-[var(--color-border-subtle)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
            <div className="space-y-4">
              <VideoUpload
                file={file}
                generating={ffmpeg.generating}
                thumbnailUrl={videoMeta.thumbnailUrl}
                videoDimensions={videoDimensions}
                onFileSelected={handleFileSelected}
              />

              <Controls
                preset={settings.preset}
                fps={settings.fps}
                width={settings.width}
                colors={settings.colors}
                dither={settings.dither}
                speed={settings.speed}
                startSec={settings.startSec}
                durationSec={settings.durationSec}
                loopCount={settings.loopCount}
                platform={settings.platform}
                targetSizeMb={settings.targetSizeMb}
                targetSizeMode={settings.targetSizeMode}
                videoDuration={videoMeta.duration}
                onPresetChange={settings.applyPreset}
                onFpsChange={settings.setFps}
                onWidthChange={settings.setWidth}
                onColorsChange={settings.setColors}
                onDitherChange={settings.setDither}
                onSpeedChange={settings.setSpeed}
                onTrimChange={(s, d) => settings.clampTrim(s, d, videoMeta.duration)}
                onLoopCountChange={settings.setLoopCount}
                onPlatformChange={settings.setPlatform}
                onTargetSizeMbChange={settings.setTargetSizeMb}
                onTargetSizeModeToggle={() => settings.setTargetSizeMode((c) => !c)}
                onRestoreDefaults={settings.restoreDefaults}
              />

              <SizeEstimate
                estimatedMb={estimatedMb}
                targetSizeMode={settings.targetSizeMode}
                targetSizeMb={settings.targetSizeMb}
              />

              <ActionBar
                file={file}
                generating={ffmpeg.generating}
                progress={ffmpeg.progress}
                stage={ffmpeg.stage}
                status={ffmpeg.status}
                timeToFirstGifMs={timeToFirstGifMs}
                onGenerate={handleGenerate}
                onQuickPreview={handleQuickPreview}
                onCancel={ffmpeg.cancelRender}
              />
            </div>
          </div>

          <Preview
            gifUrl={ffmpeg.gifUrl}
            sourcePreviewUrl={videoMeta.thumbnailUrl}
            gifName={gifName}
            onGifNameChange={setGifName}
          />
        </section>
      </div>
    </main>
  );
}

export default App;
