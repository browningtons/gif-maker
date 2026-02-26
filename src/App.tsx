import { useEffect, useMemo, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

type PresetKey = 'ultra' | 'balanced' | 'compact';

type Settings = {
  fps: number;
  width: number;
  colors: number;
  dither: 'none' | 'bayer' | 'floyd_steinberg' | 'sierra2' | 'sierra2_4a';
};

const PRESETS: Record<PresetKey, Settings> = {
  ultra: { fps: 20, width: 1280, colors: 256, dither: 'sierra2_4a' },
  balanced: { fps: 15, width: 960, colors: 256, dither: 'sierra2_4a' },
  compact: { fps: 12, width: 720, colors: 128, dither: 'bayer' }
};

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

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

      const trimArgs = ['-ss', toFixed(Math.max(0, startSec)), '-t', toFixed(Math.max(0.2, durationSec))];
      const speedFilter = speed === 1 ? '' : `,setpts=PTS/${speed}`;
      const scaleAndRate = `fps=${fps},scale=${width}:-1:flags=lanczos${speedFilter}`;

      setStatus('Generating color palette...');
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
        `${scaleAndRate},palettegen=max_colors=${Math.max(2, Math.min(256, colors))}:stats_mode=full`,
        paletteName
      ]);

      setStatus('Rendering GIF...');
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
      const blob = new Blob([bytes], { type: 'image/gif' });
      if (gifUrl) URL.revokeObjectURL(gifUrl);
      const url = URL.createObjectURL(blob);
      setGifUrl(url);
      setStatus(`Done. GIF size ${(blob.size / (1024 * 1024)).toFixed(2)} MB`);

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
                    onChange={(e) => setStartSec(Number(e.target.value))}
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
                    onChange={(e) => setDurationSec(Number(e.target.value))}
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
