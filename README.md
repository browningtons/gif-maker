# GIF Maker App (React + TypeScript)

A shareable browser app that converts video clips into high-quality GIFs using FFmpeg WebAssembly.

## Features

- Client-side conversion (no backend required)
- Quality presets: `ultra`, `balanced`, `compact`
- Controls: FPS, width, colors, dither, speed, start time, duration, loop count
- In-app preview and one-click download

## Requirements

- Node.js 20+
- npm 10+

## Run locally

```bash
cd "/Users/paulbrown/Documents/Personal Projects/Github/GIF maker"
npm install
npm run dev
```

Then open the local URL shown in terminal (usually `http://localhost:5173`).

## Build for sharing

```bash
npm run build
npm run preview
```

Build output is generated in `dist/`.

## Notes

- First conversion downloads FFmpeg core assets (~30MB) in the browser.
- For best size/quality balance, keep clips short (3-8 seconds).
- The legacy CLI converter still exists as `gif_maker.py`.
