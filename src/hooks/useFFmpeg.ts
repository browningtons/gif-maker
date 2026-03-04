import { useRef, useState, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {
  type DitherKey,
  FFMPEG_CORE_BASE,
  MIN_TRIM_DURATION,
  FFMPEG_MAX_RETRIES,
  FFMPEG_RETRY_DELAY_MS,
  TARGET_MAX_ATTEMPTS,
  TARGET_MIN_WIDTH,
  TARGET_MIN_FPS,
  TARGET_MIN_COLORS,
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
  videoWidth: number;
  videoHeight: number;
};

type RenderResult = {
  blob: Blob;
  hitTarget: boolean;
  finalWidth: number;
  finalFps: number;
  finalColors: number;
};

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

  const loadFFmpeg = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (loaded) return;
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
        loopCount, targetSizeMode, targetSizeMb, videoWidth, videoHeight,
      } = params;

      try {
        cancelRequestedRef.current = false;
        await loadFFmpeg();
        setGenerating(true);
        setProgress(0);
        setStage('preparing');
        setStatus('Preparing video...');

        const ffmpeg = ffmpegRef.current;
        const ts = Date.now();
        const inputName = `input-${ts}-${file.name}`;
        const paletteName = `palette-${ts}.png`;
        const outputName = `output-${ts}.gif`;

        await ffmpeg.writeFile(inputName, await fetchFile(file));

        const toFixed = (v: number) => v.toFixed(2);
        const trimArgs = [
          '-ss', toFixed(Math.max(0, startSec)),
          '-t', toFixed(Math.max(MIN_TRIM_DURATION, durationSec)),
        ];
        const speedFilter = speed === 1 ? '' : `,setpts=PTS/${speed}`;
        const targetBytes = Math.max(1, targetSizeMb) * 1024 * 1024;

        const renderAttempt = async (
          attemptWidth: number,
          attemptFps: number,
          attemptColors: number,
          attemptLabel: string
        ): Promise<Blob> => {
          if (cancelRequestedRef.current) throw new Error('Render canceled');

          const scaleAndRate = `fps=${attemptFps},scale=${attemptWidth}:-1:flags=lanczos${speedFilter}`;

          setStage('palette');
          setStatus(`${attemptLabel} — building palette...`);
          await ffmpeg.exec([
            '-y', '-i', inputName, ...trimArgs,
            '-frames:v', '1', '-update', '1',
            '-vf', `${scaleAndRate},palettegen=max_colors=${attemptColors}:stats_mode=full`,
            paletteName,
          ]);

          if (cancelRequestedRef.current) throw new Error('Render canceled');

          setStage('rendering');
          setStatus(`${attemptLabel} — rendering frames...`);
          await ffmpeg.exec([
            '-y', '-i', inputName, ...trimArgs,
            '-i', paletteName,
            '-lavfi', `${scaleAndRate}[x];[x][1:v]paletteuse=dither=${dither}:diff_mode=rectangle`,
            '-loop', String(loopCount),
            outputName,
          ]);

          if (cancelRequestedRef.current) throw new Error('Render canceled');
          const data = await ffmpeg.readFile(outputName);
          const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new TextEncoder().encode(data);
          return new Blob([bytes], { type: 'image/gif' });
        };

        let finalBlob: Blob | null = null;
        let hitTarget = false;
        let finalWidth = Math.max(TARGET_MIN_WIDTH, Math.round(width / 2) * 2);
        let finalFps = Math.max(TARGET_MIN_FPS, fps);
        let finalColors = Math.max(TARGET_MIN_COLORS, Math.min(256, colors));

        if (targetSizeMode) {
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

            attemptWidth = Math.max(TARGET_MIN_WIDTH, Math.floor((attemptWidth * TARGET_WIDTH_SHRINK) / 2) * 2);
            attemptFps = Math.max(TARGET_MIN_FPS, attemptFps - 1);
            attemptColors = Math.max(attempt < 3 ? 48 : TARGET_MIN_COLORS, attemptColors - (attempt < 3 ? 16 : 8));
          }
        } else {
          finalBlob = await renderAttempt(
            finalWidth, finalFps, finalColors,
            'Generating GIF'
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
        if (!targetSizeMode) {
          setStatus(`Done \u2014 ${sizeMb} MB.`);
        } else if (hitTarget) {
          setStatus(`Done \u2014 ${sizeMb} MB (within \u2264 ${targetSizeMb} MB target).`);
        } else {
          setStatus(`Done \u2014 best effort ${sizeMb} MB. Reduce duration or width for \u2264 ${targetSizeMb} MB.`);
        }

        setStage('done');

        // Clean up temp files
        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(paletteName).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});

        return { blob: finalBlob, hitTarget, finalWidth, finalFps, finalColors };
      } catch (error) {
        if (cancelRequestedRef.current) {
          setStatus('Render canceled. Ready for next conversion.');
        } else {
          console.error(error);
          const msg = error instanceof Error ? error.message : 'Unknown error';
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
