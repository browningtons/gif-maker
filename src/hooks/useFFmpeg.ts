import { useRef, useState, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {
  type DitherKey,
  type OverlayFontKey,
  FFMPEG_CORE_BASE,
  MIN_TRIM_DURATION,
  FFMPEG_MAX_RETRIES,
  FFMPEG_RETRY_DELAY_MS,
  TARGET_MAX_ATTEMPTS,
  TARGET_MIN_WIDTH,
  TARGET_MIN_FPS,
  TARGET_MIN_COLORS,
  TARGET_WIDTH_SHRINK,
  OVERLAY_TEXT_SIZE_MIN,
  OVERLAY_TEXT_SIZE_MAX,
  OVERLAY_BOX_WIDTH_MIN,
  OVERLAY_BOX_WIDTH_MAX,
  OVERLAY_BOX_HEIGHT_MIN,
  OVERLAY_BOX_HEIGHT_MAX,
  OVERLAY_FONT_PROFILES,
} from '../types';
import { estimateGifBytes, estimateHeightForWidth, sleep } from '../utils';

export type RenderStage = 'idle' | 'loading' | 'preparing' | 'palette' | 'rendering' | 'optimizing' | 'done';

type RenderParams = {
  file: File;
  fps: number;
  width: number;
  colors: number;
  dither: DitherKey;
  speed: number;
  startSec: number;
  durationSec: number;
  loopCount: number;
  targetSizeMode: boolean;
  targetSizeMb: number;
  overlayTextEnabled: boolean;
  overlayText: string;
  overlayTextX: number;
  overlayTextY: number;
  overlayTextSizePx: number;
  overlayBoxWidthPct: number;
  overlayBoxHeightPx: number;
  overlayTextFont: OverlayFontKey;
  previewFrameCount?: number;
  videoWidth: number;
  videoHeight: number;
  fsRecoveryAttempt?: number;
  forceReloadFFmpeg?: boolean;
};

type RenderResult = {
  blob: Blob;
  hitTarget: boolean;
  finalWidth: number;
  finalFps: number;
  finalColors: number;
};

function escapeDrawtextValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%')
    .replace(/\r?\n/g, '\\n');
}

function clampFontSizePx(value: number): number {
  if (!Number.isFinite(value)) return 36;
  return Math.min(OVERLAY_TEXT_SIZE_MAX, Math.max(OVERLAY_TEXT_SIZE_MIN, Math.round(value)));
}

function clampUnit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function clampOverlayBoxWidthPct(value: number): number {
  if (!Number.isFinite(value)) return 0.84;
  return Math.min(OVERLAY_BOX_WIDTH_MAX, Math.max(OVERLAY_BOX_WIDTH_MIN, value));
}

function clampOverlayBoxHeightPx(value: number): number {
  if (!Number.isFinite(value)) return 86;
  return Math.min(OVERLAY_BOX_HEIGHT_MAX, Math.max(OVERLAY_BOX_HEIGHT_MIN, Math.round(value)));
}

function wrapTextForBox(text: string, boxWidthPx: number, fontSizePx: number, maxLines: number): string {
  const normalized = text.trim();
  if (!normalized) return '';

  const charsPerLine = Math.max(6, Math.floor(boxWidthPx / Math.max(7, fontSizePx * 0.56)));
  const lines: string[] = [];
  const blocks = normalized.split(/\r?\n/);

  for (const block of blocks) {
    const words = block.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      if (lines.length < maxLines) lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= charsPerLine) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
      }
      current = word.length > charsPerLine ? `${word.slice(0, Math.max(1, charsPerLine - 1))}\u2026` : word;
      if (lines.length >= maxLines) break;
    }
    if (lines.length >= maxLines) break;
    if (current) lines.push(current);
    if (lines.length >= maxLines) break;
  }

  return lines.slice(0, maxLines).join('\n').trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return serialized;
    } catch {
      // ignore
    }
    return String(error);
  }
  return 'Unknown error';
}

export function useFFmpeg() {
  const ffmpegRef = useRef(new FFmpeg());
  const cancelRequestedRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<RenderStage>('idle');
  const [status, setStatus] = useState('Ready. Load a video to begin.');
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [estimateBias, setEstimateBias] = useState(1);

  const clearGifPreview = useCallback(() => {
    setGifUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const cancelRender = useCallback(() => {
    if (!generating) return;
    cancelRequestedRef.current = true;
    try {
      ffmpegRef.current.terminate();
    } catch {
      // no-op if ffmpeg isn't running
    }
    ffmpegRef.current = new FFmpeg();
    setLoaded(false);
    setGenerating(false);
    setProgress(0);
    setStage('idle');
    setStatus('Render canceled. Ready for next conversion.');
  }, [generating]);

  const loadFFmpeg = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    const silent = options?.silent ?? false;
    const force = options?.force ?? false;
    if (loaded && !force) return;
    const ffmpeg = ffmpegRef.current;
    if (!silent) setStage('loading');

    ffmpeg.on('progress', ({ progress: p }) => {
      setProgress(Math.max(0, Math.min(1, p || 0)));
    });

    let lastError: unknown;
    for (let attempt = 1; attempt <= FFMPEG_MAX_RETRIES; attempt++) {
      try {
        if (!silent) {
          setStatus(
            attempt === 1
              ? 'Loading ffmpeg core (~30 MB first time)...'
              : `Retrying ffmpeg download (attempt ${attempt}/${FFMPEG_MAX_RETRIES})...`
          );
        }
        await ffmpeg.load({
          coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        setLoaded(true);
        if (!silent) {
          setStage('idle');
          setStatus('ffmpeg loaded. Ready to generate.');
        }
        return;
      } catch (err) {
        lastError = err;
        if (attempt < FFMPEG_MAX_RETRIES) {
          if (!silent) {
            setStatus(`Download failed. Retrying in ${FFMPEG_RETRY_DELAY_MS / 1000}s...`);
          }
          await sleep(FFMPEG_RETRY_DELAY_MS);
        }
      }
    }
    if (!silent) {
      setStage('idle');
      const msg = lastError instanceof Error ? lastError.message : 'Unknown error';
      setStatus(`Failed to load ffmpeg after ${FFMPEG_MAX_RETRIES} attempts: ${msg}`);
    }
    throw lastError;
  }, [loaded]);

  const generateGif = useCallback(
    async (params: RenderParams): Promise<RenderResult | null> => {
      const {
        file, fps, width, colors, dither, speed, startSec, durationSec,
        loopCount, targetSizeMode, targetSizeMb, overlayTextEnabled, overlayText, overlayTextX, overlayTextY,
        overlayTextSizePx, overlayBoxWidthPct, overlayBoxHeightPx, overlayTextFont,
        previewFrameCount, videoWidth, videoHeight, fsRecoveryAttempt, forceReloadFFmpeg,
      } = params;
      const ffmpeg = ffmpegRef.current;
      let inputName: string | null = null;
      let paletteName: string | null = null;
      let outputName: string | null = null;

      try {
        cancelRequestedRef.current = false;
        await loadFFmpeg({ force: forceReloadFFmpeg });
        setGenerating(true);
        setProgress(0);
        setStage('preparing');
        setStatus('Preparing video...');

        const ts = Date.now();
        inputName = `input-${ts}-${file.name}`;
        paletteName = `palette-${ts}.png`;
        outputName = `output-${ts}.gif`;
        if (!inputName || !paletteName || !outputName) {
          throw new Error('Failed to initialize FFmpeg temp files');
        }
        const inputFile = inputName;
        const paletteFile = paletteName;
        const outputFile = outputName;

        await ffmpeg.writeFile(inputFile, await fetchFile(file));

        const toFixed = (v: number) => v.toFixed(2);
        const trimArgs = [
          '-ss', toFixed(Math.max(0, startSec)),
          '-t', toFixed(Math.max(MIN_TRIM_DURATION, durationSec)),
        ];
        const speedFilter = speed === 1 ? '' : `,setpts=PTS/${speed}`;
        const targetBytes = Math.max(1, targetSizeMb) * 1024 * 1024;
        const normalizedFloatingText = overlayText.trim();
        const shouldOverlayFloatingText = overlayTextEnabled && normalizedFloatingText.length > 0;
        const safeOverlayXRaw = clampUnit(overlayTextX, 0.08);
        const safeOverlayYRaw = clampUnit(overlayTextY, 0.12);
        const safeOverlayTextSizePx = clampFontSizePx(overlayTextSizePx);
        const safeOverlayBoxWidthPct = clampOverlayBoxWidthPct(overlayBoxWidthPct);
        const safeOverlayBoxHeightPx = clampOverlayBoxHeightPx(overlayBoxHeightPx);
        const ffmpegFontFamily = OVERLAY_FONT_PROFILES[overlayTextFont]?.ffmpegFamily;
        const sourceEvenWidth = videoWidth > 0 ? Math.max(2, Math.round(videoWidth / 2) * 2) : null;
        const minWidthFloor = sourceEvenWidth !== null
          ? Math.max(2, Math.min(TARGET_MIN_WIDTH, sourceEvenWidth))
          : TARGET_MIN_WIDTH;

        const clampAttemptWidth = (candidate: number): number => {
          const evenCandidate = Math.max(2, Math.round(candidate / 2) * 2);
          const noUpscale = sourceEvenWidth !== null ? Math.min(sourceEvenWidth, evenCandidate) : evenCandidate;
          return Math.max(minWidthFloor, noUpscale);
        };

        const safePreviewFrameCount =
          Number.isFinite(previewFrameCount) && previewFrameCount !== undefined
            ? Math.max(2, Math.min(24, Math.floor(previewFrameCount)))
            : null;

        const renderAttempt = async (
          attemptWidth: number,
          attemptFps: number,
          attemptColors: number,
          attemptLabel: string
        ): Promise<Blob> => {
          if (cancelRequestedRef.current) throw new Error('Render canceled');

          const scaleAndRate = `fps=${attemptFps},scale=${attemptWidth}:-1:flags=lanczos${speedFilter}`;
          const attemptHeight = estimateHeightForWidth(attemptWidth, videoWidth, videoHeight);
          const maxOverlayX = Math.max(0, 1 - safeOverlayBoxWidthPct);
          const maxOverlayY = Math.max(
            0,
            1 - Math.min(1, safeOverlayBoxHeightPx / Math.max(1, attemptHeight))
          );
          const safeOverlayX = Math.min(maxOverlayX, safeOverlayXRaw);
          const safeOverlayY = Math.min(maxOverlayY, safeOverlayYRaw);
          const boxWidthPx = Math.max(1, Math.round(attemptWidth * safeOverlayBoxWidthPct));
          const boxCenterX = Math.round((attemptWidth * safeOverlayX) + (boxWidthPx / 2));
          const wrappedFloatingText = shouldOverlayFloatingText
            ? wrapTextForBox(
                normalizedFloatingText,
                boxWidthPx,
                safeOverlayTextSizePx,
                Math.max(1, Math.floor(safeOverlayBoxHeightPx / Math.max(14, safeOverlayTextSizePx * 1.18)))
              )
            : '';
          const hasFloatingText = wrappedFloatingText.length > 0;

          const floatingTextStyle = [
            `text='${escapeDrawtextValue(wrappedFloatingText)}'`,
            'fontcolor=white',
            'borderw=3',
            'bordercolor=black',
            `fontsize=${safeOverlayTextSizePx}`,
            `x=${boxCenterX}-text_w/2`,
            `y=h*${safeOverlayY.toFixed(4)}`,
          ];

          const composeVideoFilter = (includeFloatingText: boolean, includeFloatingFont: boolean) => {
            const parts: string[] = [scaleAndRate];
            if (includeFloatingText && hasFloatingText) {
              const floatingPrefix = includeFloatingFont && ffmpegFontFamily
                ? [`font=${ffmpegFontFamily}`]
                : [];
              parts.push(`drawtext=${[...floatingPrefix, ...floatingTextStyle].join(':')}`);
            }
            return parts.join(',');
          };

          const executeWithFilter = async (videoFilter: string): Promise<Blob> => {
            setStage('palette');
            setStatus(`${attemptLabel} — building palette...`);
            await ffmpeg.deleteFile(paletteFile).catch(() => {});
            await ffmpeg.deleteFile(outputFile).catch(() => {});
            await ffmpeg.exec([
              '-y', '-i', inputFile, ...trimArgs,
              '-frames:v', '1',
              '-vf', `${videoFilter},palettegen=max_colors=${attemptColors}:stats_mode=full`,
              paletteFile,
            ]);

            if (cancelRequestedRef.current) throw new Error('Render canceled');

            setStage('rendering');
            setStatus(`${attemptLabel} — rendering frames...`);
            await ffmpeg.exec([
              '-y', '-i', inputFile, ...trimArgs,
              '-i', paletteFile,
              '-lavfi', `${videoFilter}[x];[x][1:v]paletteuse=dither=${dither}:diff_mode=rectangle`,
              ...(safePreviewFrameCount ? ['-frames:v', String(safePreviewFrameCount)] : []),
              '-loop', String(loopCount),
              outputFile,
            ]);

            if (cancelRequestedRef.current) throw new Error('Render canceled');
            const data = await ffmpeg.readFile(outputFile);
            const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new TextEncoder().encode(data);
            return new Blob([bytes], { type: 'image/gif' });
          };

          const withFontFilter = composeVideoFilter(true, true);
          const withoutFontFilter = composeVideoFilter(true, false);
          const noTextFilter = scaleAndRate;
          const hasAnyTextOverlay = hasFloatingText;

          if (!hasAnyTextOverlay) {
            return executeWithFilter(noTextFilter);
          }

          try {
            return await executeWithFilter(withFontFilter);
          } catch (fontErr) {
            if (cancelRequestedRef.current) throw fontErr;
            setStatus(`${attemptLabel} — font fallback in progress...`);
          }

          try {
            return await executeWithFilter(withoutFontFilter);
          } catch (textErr) {
            if (cancelRequestedRef.current) throw textErr;
            setStatus(`${attemptLabel} — rendering without text overlay (fallback).`);
            return executeWithFilter(noTextFilter);
          }
        };

        let finalBlob: Blob | null = null;
        let hitTarget = false;
        let finalWidth = clampAttemptWidth(Math.max(TARGET_MIN_WIDTH, Math.round(width / 2) * 2));
        let finalFps = Math.max(TARGET_MIN_FPS, fps);
        let finalColors = Math.max(TARGET_MIN_COLORS, Math.min(256, colors));

        const shouldUseTargetMode = targetSizeMode && !safePreviewFrameCount;

        if (shouldUseTargetMode) {
          setStage('optimizing');
          let attemptWidth = finalWidth;
          let attemptFps = finalFps;
          let attemptColors = finalColors;

          for (let attempt = 1; attempt <= TARGET_MAX_ATTEMPTS; attempt++) {
            finalWidth = attemptWidth;
            finalFps = attemptFps;
            finalColors = attemptColors;

            finalBlob = await renderAttempt(
              attemptWidth, attemptFps, attemptColors,
              `Attempt ${attempt}/${TARGET_MAX_ATTEMPTS} for \u2264 ${targetSizeMb} MB`
            );
            if (cancelRequestedRef.current) throw new Error('Render canceled');

            if (finalBlob.size <= targetBytes) {
              hitTarget = true;
              break;
            }

            attemptWidth = clampAttemptWidth(
              Math.floor((attemptWidth * TARGET_WIDTH_SHRINK) / 2) * 2
            );
            attemptFps = Math.max(TARGET_MIN_FPS, attemptFps - 1);
            attemptColors = Math.max(attempt < 3 ? 48 : TARGET_MIN_COLORS, attemptColors - (attempt < 3 ? 16 : 8));
          }
        } else {
          finalBlob = await renderAttempt(
            finalWidth, finalFps, finalColors,
            safePreviewFrameCount ? 'Generating quick preview' : 'Generating GIF'
          );
          if (cancelRequestedRef.current) throw new Error('Render canceled');
        }

        if (!finalBlob) throw new Error('No GIF output generated');

        // Update GIF preview
        setGifUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(finalBlob);
        });

        // Refine estimation bias
        const effectiveDuration = Math.max(MIN_TRIM_DURATION, durationSec) / Math.max(0.25, speed);
        const predictedBytes = estimateGifBytes({
          width: finalWidth,
          height: estimateHeightForWidth(finalWidth, videoWidth, videoHeight),
          fps: finalFps,
          durationSec: effectiveDuration,
          colors: finalColors,
          dither,
          bias: 1,
        });
        if (predictedBytes > 0) {
          const measuredBias = Math.min(3, Math.max(0.35, finalBlob.size / predictedBytes));
          setEstimateBias((prev) => Number(((prev * 0.6) + (measuredBias * 0.4)).toFixed(4)));
        }

        const sizeMb = (finalBlob.size / (1024 * 1024)).toFixed(2);
        if (safePreviewFrameCount) {
          setStatus(`Preview ready — ${sizeMb} MB (${safePreviewFrameCount} frames).`);
        } else if (!shouldUseTargetMode) {
          setStatus(`Done \u2014 ${sizeMb} MB.`);
        } else if (hitTarget) {
          setStatus(`Done \u2014 ${sizeMb} MB (within \u2264 ${targetSizeMb} MB target).`);
        } else {
          setStatus(`Done \u2014 best effort ${sizeMb} MB. Reduce duration or width for \u2264 ${targetSizeMb} MB.`);
        }

        setStage('done');
        return { blob: finalBlob, hitTarget, finalWidth, finalFps, finalColors };
      } catch (error) {
        if (cancelRequestedRef.current) {
          setStatus('Render canceled. Ready for next conversion.');
        } else {
          console.error(error);
          const msg = getErrorMessage(error);
          const isFsError = /FS error|ErrnoError/i.test(msg);
          if (isFsError && (fsRecoveryAttempt ?? 0) < 1) {
            setStatus('Recovering from browser FS error and retrying once...');
            try {
              ffmpegRef.current.terminate();
            } catch {
              // no-op
            }
            ffmpegRef.current = new FFmpeg();
            setLoaded(false);
            return generateGif({
              ...params,
              fsRecoveryAttempt: (fsRecoveryAttempt ?? 0) + 1,
              forceReloadFFmpeg: true,
            });
          }
          if (msg.includes('SharedArrayBuffer')) {
            setStatus('Browser requires cross-origin isolation (COOP/COEP headers) for FFmpeg.');
          } else if (msg.includes('memory')) {
            setStatus('Out of memory. Try a shorter clip or lower resolution.');
          } else {
            setStatus(`Conversion failed: ${msg}. Try a shorter clip or lower preset.`);
          }
        }
        setStage('idle');
        return null;
      } finally {
        if (inputName) await ffmpeg.deleteFile(inputName).catch(() => {});
        if (paletteName) await ffmpeg.deleteFile(paletteName).catch(() => {});
        if (outputName) await ffmpeg.deleteFile(outputName).catch(() => {});
        setGenerating(false);
        cancelRequestedRef.current = false;
      }
    },
    [loadFFmpeg]
  );

  return {
    loaded,
    generating,
    progress,
    stage,
    status,
    gifUrl,
    estimateBias,
    setStatus,
    clearGifPreview,
    cancelRender,
    loadFFmpeg,
    generateGif,
  };
}
