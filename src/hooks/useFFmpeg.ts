import { useCallback, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {
  type DitherKey,
  type FilterKey,
  type PlaybackMode,
  FFMPEG_CORE_BASE,
  FFMPEG_MAX_RETRIES,
  FFMPEG_RETRY_DELAY_MS,
  MIN_TRIM_DURATION,
  TARGET_MAX_ATTEMPTS,
  TARGET_MIN_COLORS,
  TARGET_MIN_FPS,
  TARGET_MIN_WIDTH,
  TARGET_WIDTH_SHRINK,
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
  playbackMode?: PlaybackMode;
  filter?: FilterKey;
  overlayTextEnabled?: boolean;
  overlayText?: string;
  overlayTextSizePx?: number;
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
      // ignore serialization failures
    }
    return String(error);
  }
  return 'Unknown error';
}

function wrapOverlayText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      continue;
    }
    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      lines.push(word);
      currentLine = '';
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.slice(0, 3);
}

async function buildOverlayImage(
  text: string,
  width: number,
  height: number,
  fontSizePx: number
): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;
  const normalizedText = text.trim();
  if (!normalizedText) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.clearRect(0, 0, width, height);
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.lineJoin = 'round';
  context.strokeStyle = 'rgba(0, 0, 0, 0.96)';
  context.fillStyle = '#ffffff';
  context.lineWidth = Math.max(3, Math.round(fontSizePx * 0.16));
  context.font = `900 ${fontSizePx}px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`;

  const maxTextWidth = width * 0.88;
  const lines = wrapOverlayText(context, normalizedText, maxTextWidth);
  if (lines.length === 0) return null;

  const lineHeight = Math.round(fontSizePx * 1.08);
  const bottomPadding = Math.max(18, Math.round(height * 0.055));
  const textBlockHeight = lines.length * lineHeight;
  const firstBaseline = height - bottomPadding - textBlockHeight + fontSizePx;

  lines.forEach((line, index) => {
    const y = firstBaseline + (index * lineHeight);
    context.strokeText(line, width / 2, y, maxTextWidth);
    context.fillText(line, width / 2, y, maxTextWidth);
  });

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png');
  });
  if (!blob) return null;

  return new Uint8Array(await blob.arrayBuffer());
}

function getFilterSegment(filter: FilterKey): string {
  switch (filter) {
    case 'grayscale': return ',format=gray';
    case 'sepia': return ',colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0';
    case 'contrast': return ',eq=contrast=1.4:brightness=0.02';
    case 'blur': return ',boxblur=2:1';
    case 'vignette': return ',vignette=PI/4';
    case 'pixelate': return ',scale=iw/8:ih/8:flags=neighbor,scale=iw*8:ih*8:flags=neighbor';
    default: return '';
  }
}

export function useFFmpeg() {
  const ffmpegRef = useRef(new FFmpeg());
  const progressBoundRef = useRef<FFmpeg | null>(null);
  const cancelRequestedRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<RenderStage>('idle');
  const [status, setStatus] = useState('Ready. Load a video to begin.');
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [estimateBias, setEstimateBias] = useState(1);

  const bindProgressListener = useCallback((ffmpeg: FFmpeg) => {
    if (progressBoundRef.current === ffmpeg) return;
    ffmpeg.on('progress', ({ progress: nextProgress }) => {
      setProgress(Math.max(0, Math.min(1, nextProgress || 0)));
    });
    progressBoundRef.current = ffmpeg;
  }, []);

  const resetFFmpegInstance = useCallback(() => {
    try {
      ffmpegRef.current.terminate();
    } catch {
      // no-op if ffmpeg is not active
    }
    ffmpegRef.current = new FFmpeg();
    progressBoundRef.current = null;
    setLoaded(false);
  }, []);

  const clearGifPreview = useCallback(() => {
    setGifUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const cancelRender = useCallback(() => {
    if (!generating) return;
    cancelRequestedRef.current = true;
    resetFFmpegInstance();
    setGenerating(false);
    setProgress(0);
    setStage('idle');
    setStatus('Render canceled. Ready for next conversion.');
  }, [generating, resetFFmpegInstance]);

  const loadFFmpeg = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    const silent = options?.silent ?? false;
    const force = options?.force ?? false;

    if (force) {
      resetFFmpegInstance();
    }

    if (loaded && !force) return;

    const ffmpeg = ffmpegRef.current;
    bindProgressListener(ffmpeg);
    if (!silent) setStage('loading');

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
      } catch (error) {
        lastError = error;
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
      const message = lastError instanceof Error ? lastError.message : 'Unknown error';
      setStatus(`Failed to load ffmpeg after ${FFMPEG_MAX_RETRIES} attempts: ${message}`);
    }
    throw lastError;
  }, [bindProgressListener, loaded, resetFFmpegInstance]);

  const generateGif = useCallback(
    async (params: RenderParams): Promise<RenderResult | null> => {
      const {
        file,
        fps,
        width,
        colors,
        dither,
        speed,
        startSec,
        durationSec,
        loopCount,
        targetSizeMode,
        targetSizeMb,
        playbackMode,
        filter,
        overlayTextEnabled,
        overlayText,
        overlayTextSizePx,
        previewFrameCount,
        videoWidth,
        videoHeight,
        fsRecoveryAttempt,
        forceReloadFFmpeg,
      } = params;

      const ffmpeg = ffmpegRef.current;
      let inputName: string | null = null;
      let overlayName: string | null = null;
      let paletteName: string | null = null;
      let outputName: string | null = null;

      try {
        cancelRequestedRef.current = false;
        await loadFFmpeg({ force: forceReloadFFmpeg });
        setGenerating(true);
        setProgress(0);
        setStage('preparing');
        setStatus('Preparing video...');

        const timestamp = Date.now();
        inputName = `input-${timestamp}-${file.name}`;
        overlayName = `overlay-${timestamp}.png`;
        paletteName = `palette-${timestamp}.png`;
        outputName = `output-${timestamp}.gif`;
        const inputFile = inputName;
        const overlayFile = overlayName;
        const paletteFile = paletteName;
        const outputFile = outputName;

        await ffmpeg.writeFile(inputFile, await fetchFile(file));

        const trimArgs = [
          '-ss', Math.max(0, startSec).toFixed(2),
          '-t', Math.max(MIN_TRIM_DURATION, durationSec).toFixed(2),
        ];
        const targetBytes = Math.max(1, targetSizeMb) * 1024 * 1024;
        const speedFilter = speed === 1 ? '' : `,setpts=PTS/${speed}`;
        const overlayEnabled = Boolean(overlayTextEnabled && overlayText?.trim());
        const safeOverlayText = overlayText?.trim() ?? '';
        const safeOverlayTextSizePx = Number.isFinite(overlayTextSizePx)
          ? Math.max(18, Math.min(72, Math.round(overlayTextSizePx ?? 32)))
          : 32;
        const safePreviewFrameCount =
          Number.isFinite(previewFrameCount) && previewFrameCount !== undefined
            ? Math.max(2, Math.min(24, Math.floor(previewFrameCount)))
            : null;
        const shouldUseTargetMode = targetSizeMode && !safePreviewFrameCount;

        const sourceEvenWidth = videoWidth > 0 ? Math.max(2, Math.round(videoWidth / 2) * 2) : null;
        const minWidthFloor = sourceEvenWidth !== null
          ? Math.max(2, Math.min(TARGET_MIN_WIDTH, sourceEvenWidth))
          : TARGET_MIN_WIDTH;

        const clampAttemptWidth = (candidate: number): number => {
          const evenCandidate = Math.max(2, Math.round(candidate / 2) * 2);
          const noUpscaleCandidate = sourceEvenWidth !== null
            ? Math.min(sourceEvenWidth, evenCandidate)
            : evenCandidate;
          return Math.max(minWidthFloor, noUpscaleCandidate);
        };

        const renderAttempt = async (
          attemptWidth: number,
          attemptFps: number,
          attemptColors: number,
          attemptLabel: string
        ): Promise<Blob> => {
          if (cancelRequestedRef.current) throw new Error('Render canceled');

          const baseFilter = `fps=${attemptFps},scale=${attemptWidth}:-1:flags=lanczos${speedFilter}${getFilterSegment(filter ?? 'none')}`;
          const useBoomerang = playbackMode === 'boomerang';
          const attemptHeight = estimateHeightForWidth(attemptWidth, videoWidth, videoHeight);
          const overlayBytes = overlayEnabled
            ? await buildOverlayImage(safeOverlayText, attemptWidth, attemptHeight, safeOverlayTextSizePx)
            : null;
          const hasOverlayImage = Boolean(overlayBytes);

          // Build filter chains for the 4 combinations of boomerang x overlay
          let paletteFilter: string;
          let renderFilter: string;
          const useFilterComplex = useBoomerang || hasOverlayImage;

          if (useBoomerang && hasOverlayImage) {
            paletteFilter = `[0:v]${baseFilter},split[fwd][rev];[rev]reverse[bwd];[fwd][bwd]concat=n=2:v=1:a=0[base];[base][1:v]overlay=0:0:format=auto,palettegen=max_colors=${attemptColors}:stats_mode=full`;
            renderFilter = `[0:v]${baseFilter},split[fwd][rev];[rev]reverse[bwd];[fwd][bwd]concat=n=2:v=1:a=0[base];[base][1:v]overlay=0:0:format=auto[x];[x][2:v]paletteuse=dither=${dither}:diff_mode=rectangle`;
          } else if (useBoomerang) {
            paletteFilter = `[0:v]${baseFilter},split[fwd][rev];[rev]reverse[bwd];[fwd][bwd]concat=n=2:v=1:a=0,palettegen=max_colors=${attemptColors}:stats_mode=full`;
            renderFilter = `[0:v]${baseFilter},split[fwd][rev];[rev]reverse[bwd];[fwd][bwd]concat=n=2:v=1:a=0[x];[x][1:v]paletteuse=dither=${dither}:diff_mode=rectangle`;
          } else if (hasOverlayImage) {
            paletteFilter = `[0:v]${baseFilter}[base];[base][1:v]overlay=0:0:format=auto,palettegen=max_colors=${attemptColors}:stats_mode=full`;
            renderFilter = `[0:v]${baseFilter}[base];[base][1:v]overlay=0:0:format=auto[x];[x][2:v]paletteuse=dither=${dither}:diff_mode=rectangle`;
          } else {
            paletteFilter = `${baseFilter},palettegen=max_colors=${attemptColors}:stats_mode=full`;
            renderFilter = `${baseFilter}[x];[x][1:v]paletteuse=dither=${dither}:diff_mode=rectangle`;
          }

          setStage('palette');
          setStatus(`${attemptLabel} - building palette...`);
          await ffmpeg.deleteFile(overlayFile).catch(() => {});
          await ffmpeg.deleteFile(paletteFile).catch(() => {});
          await ffmpeg.deleteFile(outputFile).catch(() => {});
          if (hasOverlayImage) {
            await ffmpeg.writeFile(overlayFile, overlayBytes as Uint8Array);
          }
          await ffmpeg.exec([
            '-y',
            '-i',
            inputFile,
            ...trimArgs,
            ...(hasOverlayImage ? ['-i', overlayFile] : []),
            '-frames:v',
            '1',
            ...(useFilterComplex ? ['-filter_complex', paletteFilter] : ['-vf', paletteFilter]),
            paletteFile,
          ]);

          if (cancelRequestedRef.current) throw new Error('Render canceled');

          setStage('rendering');
          setStatus(`${attemptLabel} - rendering frames...`);
          await ffmpeg.exec([
            '-y',
            '-i',
            inputFile,
            ...trimArgs,
            ...(hasOverlayImage ? ['-i', overlayFile] : []),
            '-i',
            paletteFile,
            ...(useFilterComplex ? ['-filter_complex', renderFilter] : ['-lavfi', renderFilter]),
            ...(safePreviewFrameCount ? ['-frames:v', String(safePreviewFrameCount)] : []),
            '-loop',
            String(loopCount),
            outputFile,
          ]);

          if (cancelRequestedRef.current) throw new Error('Render canceled');

          const data = await ffmpeg.readFile(outputFile);
          const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new TextEncoder().encode(data);
          return new Blob([bytes], { type: 'image/gif' });
        };

        let finalBlob: Blob | null = null;
        let hitTarget = false;
        let finalWidth = clampAttemptWidth(Math.max(TARGET_MIN_WIDTH, Math.round(width / 2) * 2));
        let finalFps = Math.max(TARGET_MIN_FPS, fps);
        let finalColors = Math.max(TARGET_MIN_COLORS, Math.min(256, colors));

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
              attemptWidth,
              attemptFps,
              attemptColors,
              `Attempt ${attempt}/${TARGET_MAX_ATTEMPTS} for <= ${targetSizeMb} MB`
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
            attemptColors = Math.max(
              attempt < 3 ? 48 : TARGET_MIN_COLORS,
              attemptColors - (attempt < 3 ? 16 : 8)
            );
          }
        } else {
          finalBlob = await renderAttempt(
            finalWidth,
            finalFps,
            finalColors,
            safePreviewFrameCount ? 'Generating quick preview' : 'Generating GIF'
          );
        }

        if (!finalBlob) {
          throw new Error('No GIF output generated');
        }

        setGifUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(finalBlob);
        });

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
          setStatus(`Preview ready - ${sizeMb} MB (${safePreviewFrameCount} frames).`);
        } else if (!shouldUseTargetMode) {
          setStatus(`Done - ${sizeMb} MB.`);
        } else if (hitTarget) {
          setStatus(`Done - ${sizeMb} MB (within <= ${targetSizeMb} MB target).`);
        } else {
          setStatus(`Done - best effort ${sizeMb} MB. Reduce duration or width for <= ${targetSizeMb} MB.`);
        }

        setStage('done');
        return { blob: finalBlob, hitTarget, finalWidth, finalFps, finalColors };
      } catch (error) {
        if (cancelRequestedRef.current) {
          setStatus('Render canceled. Ready for next conversion.');
        } else {
          console.error(error);
          const message = getErrorMessage(error);
          const isFsError = /FS error|ErrnoError/i.test(message);

          if (isFsError && (fsRecoveryAttempt ?? 0) < 1) {
            setStatus('Recovering from browser FS error and retrying once...');
            resetFFmpegInstance();
            return generateGif({
              ...params,
              fsRecoveryAttempt: (fsRecoveryAttempt ?? 0) + 1,
              forceReloadFFmpeg: true,
            });
          }

          if (message.includes('SharedArrayBuffer')) {
            setStatus('Browser requires cross-origin isolation (COOP/COEP headers) for FFmpeg.');
          } else if (message.toLowerCase().includes('memory')) {
            setStatus('Out of memory. Try a shorter clip or lower resolution.');
          } else {
            setStatus(`Conversion failed: ${message}. Try a shorter clip or lower preset.`);
          }
        }

        setStage('idle');
        return null;
      } finally {
        if (inputName) await ffmpeg.deleteFile(inputName).catch(() => {});
        if (overlayName) await ffmpeg.deleteFile(overlayName).catch(() => {});
        if (paletteName) await ffmpeg.deleteFile(paletteName).catch(() => {});
        if (outputName) await ffmpeg.deleteFile(outputName).catch(() => {});
        setGenerating(false);
        cancelRequestedRef.current = false;
      }
    },
    [loadFFmpeg, resetFFmpegInstance]
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
