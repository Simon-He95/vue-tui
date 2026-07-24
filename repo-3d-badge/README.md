# @simon_he/repo-3d-badge

Turn any GitHub repository into a textured 3D terminal badge. Contributors orbit a 3D extrusion of the repo logo, rendered with WebGPU in your terminal.

![3D badge concept](https://img.shields.io/badge/3D-WebGPU-green)

## Quick Start

```bash
# Install (requires Bun + bun-webgpu for the 3D renderer)
bun add @simon_he/repo-3d-badge bun-webgpu

# Run
npx repo-3d-badge vuejs/core
npx repo-3d-badge https://github.com/facebook/react
```

Or from this monorepo:

```bash
bun run run:repo-3d-badge -- vuejs/core
```

## How It Works

1. **Fetch repo data** — Calls the GitHub REST API to get repo metadata, top contributors, and resolves a logo (from README → OpenGraph → owner avatar → generated monogram fallback).

2. **Build logo SDF texture** — Decodes the logo PNG, extracts the alpha mask, and computes a signed distance field (SDF) via the Felzenszwalb-Huttenlocher Euclidean distance transform. Packs RGB (logo color) + A (normalized SDF) into a 128×128 texture.

3. **Build avatar atlas** — Downloads each contributor's GitHub avatar, resizes to 32×32, and tiles into an atlas texture.

4. **Render with WebGPU** — A raw WGSL compute shader raymarches the logo SDF into a 3D extrusion with beveled edges, brushed-metal/gloss/rim material, soft shadows, and ambient occlusion — all sampled from the logo's own colors. Contributor avatars are mapped onto orbiting spheres with glass-like highlights.

### The key technique: texture-sampled SDF

The original vue-tui badge uses a hardcoded Vue triangle SDF in the shader. This package replaces that with a **texture-sampled SDF**: any logo's alpha mask is transformed into a distance field texture, and the shader samples it to determine the 3D shape. The entire material framework (extrusion, bevel, brushed metal, gloss, rim light, AO, soft shadows) is reused unchanged — so any logo gets the same premium 3D treatment while keeping its own brand colors.

## CLI Usage

```
Usage: repo-3d-badge <github-repo>

Examples:
  repo-3d-badge vuejs/core
  repo-3d-badge https://github.com/facebook/react

Options:
  GITHUB_TOKEN / GH_TOKEN   Optional token to raise API rate limits.
  VT_MAX_CONTRIBUTORS       Max contributors to fetch (default 100).
```

### Controls (interactive terminal)

- **Drag** — rotate the scene
- **Hover** — preview a contributor
- **Click** — lock selection
- **Scroll** — zoom
- **Q** — quit

## Programmatic API

```ts
import { fetchRepo3DData, createRepoBadgeRenderer } from "@simon_he/repo-3d-badge";

// 1. Fetch repo data
const data = await fetchRepo3DData("vuejs/core", {
  token: process.env.GITHUB_TOKEN, // optional, raises rate limit
  maxContributors: 50,
});

// 2. Build the WebGPU renderer
const { renderer, contributorCount, logoSource } = await createRepoBadgeRenderer(data);

// 3. Use with T3DViewport (see src/app.ts for full example)
// renderer.render(context)  -> TVideoFrame
// renderer.hitTest(context) -> T3DHitResult | null
```

## Architecture

```
src/
├── types.ts          # Shared data types
├── github.ts         # GitHub API: repo meta, contributors, logo resolution
├── image.ts          # PNG decode/resize, avatar atlas, logo fallback
├── sdf.ts            # Felzenszwalb-Huttenlocher EDT + SDF texture builder
├── scene.ts          # Dynamic contributor sphere layout + ray picking
├── badge.wgsl.ts     # WGSL shader (texture-sampled SDF + reused material framework)
├── renderer.ts       # Packs textures, builds shader, creates T3DRenderer
├── app.ts            # Vue component (TBox + T3DViewport + status bar)
├── cli.ts            # CLI entry point
└── index.ts          # Public API exports
```

## Requirements

- **Bun runtime** + `bun-webgpu` (macOS arm64/x64, Linux x64, Windows x64)
- Node.js >= 18 (for programmatic API without 3D rendering)
- A GitHub token is optional but recommended (60 → 5000 requests/hour)

## License

MIT
