# IROSTRATA

IROSTRATA is a browser-based image lab that separates images and video frames into multiple risograph-style ink plates. Adjust halftones, paper texture, and registration, then export the result—all without uploading the source media to a server. Processing happens locally in the browser with Canvas.

> IROSTRATA does not attempt to reproduce physical risograph printing or the output of any specific application exactly. It is a production-oriented simulator inspired by print color separation, halftone screening, and paper texture.

## Features

- Add one to six ink plates and select an ink for each plate from the palette
- Automatically select ink candidates based on the image's dominant colors with `AUTO`
- OKLab-based multicolor separation that accounts for ink absorption and paper color
- Two tone-rendering modes: `SCREEN` for regular halftone grids and `GRAIN` for stippled dots
- Physical grain-size controls for GRAIN, plus per-plate density, opacity, and registration controls shared by both modes
- Dot on Dot, Offset, and Rosette screen-angle methods
- `CUSTOMIZE` mode for per-plate frequency, angle, density, dot gain, registration, warp, and related settings
- Five paper profiles: Warm White, Natural, Recycled Gray, Kraft, and White
  - Paper color, grain, fibers, and ink-acceptance variation all affect the render
- Eight built-in print recipes and named presets saved in the browser
- Frame ratios, CROP / FIT placement, and FIT / 100% / 200% / 300% preview zoom
- Press-and-hold comparison with the original image, synchronized to the current frame ratio and crop position
- Random generation of ink count and colors, paper, SCREEN / GRAIN mode, and print parameters
- Export the finished image as PNG or JPG, or export each ink separation as PNG
- Inspect intermediate stages: Original, Tone, Gamut, Coverage, Master, Printed, Registered, and Composite
- Export continuous-tone plates, halftone masters, or simulated printed plates together as a ZIP archive
- 300 DPI metadata, worker-based tiled rendering, progress reporting, and cancellation
- English, Japanese, and Juicetopian interfaces with a persistent language switcher
- Local video input with processed playback, timeline scrubbing, and the same frame-ratio controls as still images
- Silent MP4/H.264 or WebM/VP9/VP8 video export at 480px or 720px and 6, 12, or 24 fps

## Localization

Use the `EN`, `日本`, and `JT` controls in the header to switch languages. The selection is stored in the current browser and updates interface copy, live notices, ink and paper names, preset labels, document metadata, and the HTML language tag.

The Juicetopian translation uses attested modern vocabulary such as `iro` (color), `strata` (layer), `karta` (paper), and `montra` (display). Contemporary print and computing terms—including SCREEN, GRAIN, PNG, and DPI—remain technical trade loanwords instead of introducing unsupported canonical vocabulary.

## Paper Profiles

| Paper | sRGB | Grain Amount | Grain Scale | Fiber Amount | Ink-Acceptance Variation |
| --- | --- | ---: | ---: | ---: | ---: |
| Warm White | `#F4EEDC` | 5% | 0.35 mm | 50% | 8% |
| Natural | `#E9DFC8` | 5% | 0.35 mm | 50% | 8% |
| Recycled Gray | `#DDD8C9` | 5.5% | 0.44 mm | 48% | 10.5% |
| Kraft | `#BF9C6B` | 5% | 0.55 mm | 62% | 10% |
| White | `#FFFFFF` | 0% | 0.35 mm | 0% | 2% |

## Running Locally

Requirement: Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal, usually `http://localhost:3001`.

### Testing on a Phone or Tablet over the Same Wi-Fi Network

The development server accepts connections from devices on the local network. Connect the Mac and test device to the same network, then open the `Network` URL shown when the server starts. For example, if the Mac's current IP address is `192.168.11.22`, use:

```text
http://192.168.11.22:3001
```

The IP address may change after reconnecting to the network. Allow incoming connections if macOS asks for permission. This is intended only for development testing on the same local network; it does not publish the app to the internet.

## Validation

```bash
npm test
npm run lint
npm run build
```

## GitHub Pages

Pushing to `main` triggers GitHub Actions to build the static version and deploy it to GitHub Pages.

- Live site: [https://scrovolakka.github.io/irostrata/](https://scrovolakka.github.io/irostrata/)
- Local Pages build: `npm run build:pages`
- Output directory: `dist/client/`

## Processing Pipeline

```text
input image
  → frame crop / fit
  → linear RGB + brightness / contrast
  → paper-aware OKLab ink separation
  → per-plate screen or grain
  → ink acceptance / dot texture / registration
  → subtractive composite on paper
  → preview or export
```

Preview and export use the same processing pipeline. The image is redrawn according to the selected frame ratio and output size rather than the source image's pixel dimensions. High-resolution exports are processed in strips by a Worker so the app does not retain every intermediate buffer for every plate at once.

Video frames use the same paper, plate, screening, registration, and subtractive-composite stages. A smaller color-search grid is shared across frames to keep browser-only video processing practical. Video export currently contains no audio; support and speed depend on the codecs exposed by the current browser and device.

## Preset Storage

Presets saved from `PRESET` include inks, paper, screening, custom plate settings, and frame settings. They are stored in the current browser's `localStorage`. Source images are never saved.

## Project Structure

- `app/page.tsx` — static route
- `app/studio.tsx` — editor UI, image/video input, presets, and export
- `app/i18n.ts` — English, Japanese, and Juicetopian dictionaries and locale helpers
- `app/engine.ts` — color separation, screening, paper simulation, printing, and compositing
- `app/export.worker.ts` — high-resolution tiled rendering and progress reporting
- `app/export-utils.ts` — ZIP generation and 300 DPI metadata for PNG and JPEG
- `lib/video-export.mjs` — video dimension, frame-count, and transport-time helpers
- `app/globals.css` — print-lab interface styles
- `tests/rendered-html.test.mjs` — rendering smoke tests

## Tech Stack

- React 19
- Vinext / Vite
- TypeScript
- Canvas 2D
- Mediabunny / WebCodecs for local video encoding and containers
- Tailwind CSS 4

## Development Notes

- High-resolution, multicolor, and separation exports can be computationally expensive in the browser. Reduce the output size or number of ink plates if processing takes too long.
- Video export is intentionally silent in the first release. Longer clips, higher frame rates, 720px output, and additional ink plates require proportionally more processing time and memory.
- Presets are stored locally per browser. They do not sync between devices or browsers.
