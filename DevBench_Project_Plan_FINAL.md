# DevBench — Web-Based Device Performance Testing Platform

## Complete Project Plan & Implementation Guide

---

## 1. Project Overview

**DevBench** is a browser-based benchmarking and field-testing platform that evaluates a user's laptop/desktop performance across multiple professional domains: Coding, Graphics Design, Video Editing, Gaming, and Sound Engineering.

Unlike traditional benchmarks (3DMark, Cinebench) that require native installs, DevBench runs entirely in the browser using modern Web APIs — making it zero-install, cross-platform, and shareable. Later, a native app (Electron/Tauri for desktop, React Native/Flutter for mobile) will extend the platform with deeper hardware access.

---

## 2. Architecture Overview

### 2.1 Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | **Next.js 15 (App Router) + TypeScript** | SSR for marketing/SEO pages, CSR for benchmark UI, good DX |
| Styling | **Tailwind CSS + shadcn/ui** | Rapid, consistent UI; pre-built components |
| State Management | **Zustand** | Lightweight; perfect for benchmark state machines |
| GPU Compute | **WebGPU (primary) + WebGL 2 (fallback)** | WebGPU ships on all major browsers as of Nov 2025; WebGL 2 for older devices |
| CPU Compute | **Web Workers + WebAssembly (Emscripten/Rust-wasm)** | Near-native CPU perf; true multi-threading |
| Audio Processing | **Web Audio API + AudioWorklets** | Low-latency DSP in dedicated thread |
| Video Processing | **OffscreenCanvas + WebCodecs API** | Hardware-accelerated encode/decode |
| Backend API | **Vercel API Routes (Next.js)** | No separate server needed; API endpoints live inside the same Next.js project |
| Database | **Supabase (PostgreSQL)** | Free tier (500MB), built-in auth, real-time subscriptions, auto-generated REST API |
| Auth | **Supabase Auth** | Built-in OAuth (Google, GitHub, Discord) + email login; no extra library needed |
| Real-time | **Supabase Realtime** | Live leaderboard updates via built-in PostgreSQL change subscriptions; no WebSocket server to manage |
| Hosting | **Vercel** (frontend + backend in one) | Edge-optimized CDN, auto-scaling, free tier handles ~50-100K users/month |
| Large Assets (later) | **Cloudflare R2** (when needed) | Zero egress fees; 10GB free; for video/image benchmark test files |
| Monitoring | **PostHog** (free tier) | Track which benchmarks users run, drop-off points |

### 2.2 High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Browser (Client)                       │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Next.js UI  │  │ Bench Engine │  │ Hardware Detect │  │
│  │  (React)     │──│ (Workers +   │──│ (WebGL/WebGPU  │  │
│  │              │  │  WASM + GPU) │  │  fingerprint)  │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────┘  │
│         │                 │                    │          │
│         └────────────┬────┴────────────────────┘          │
│                      │ Results + Device Profile           │
└──────────────────────┼───────────────────────────────────┘
                       │ HTTPS
┌──────────────────────┼───────────────────────────────────┐
│              Vercel (Frontend + Backend)                   │
│                                                          │
│  ┌─────────────────┐  ┌────────────────────────────┐     │
│  │  Next.js Pages   │  │  API Routes (/app/api/*)   │     │
│  │  (SSR + Static)  │  │  • /api/benchmark/submit   │     │
│  │                   │  │  • /api/leaderboard/*      │     │
│  │                   │  │  • /api/gpu/*/games        │     │
│  └─────────────────┘  └────────────┬───────────────┘     │
│                                     │                     │
└─────────────────────────────────────┼─────────────────────┘
                                      │ Supabase JS Client
┌─────────────────────────────────────┼─────────────────────┐
│                    Supabase                                │
│                                                           │
│  ┌───────────┐  ┌───────────┐  ┌─────────────────────┐   │
│  │   Auth     │  │ Realtime  │  │  PostgreSQL Database │   │
│  │  (Google,  │  │ (live     │  │  • users             │   │
│  │  GitHub,   │  │ leaderboard│  │  • benchmark_results │   │
│  │  email)    │  │ updates)  │  │  • leaderboard_*     │   │
│  └───────────┘  └───────────┘  │  • gpu_models         │   │
│                                │  • game_fps_data       │   │
│                                └─────────────────────────┘   │
│                                                           │
│  Free tier: 500MB DB, 50K monthly active users,           │
│  built-in auth, real-time, auto-generated REST API        │
└───────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────┐
│              Cloudflare R2 (Added Later)                   │
│                                                           │
│  Large benchmark assets:                                  │
│  • test-video-1080p.mp4, test-video-4k.mp4 (~100MB)      │
│  • test-image-4k.png, test-image-8k.png (~50MB)          │
│  • benchmark.wasm modules (~5MB)                          │
│  • 3D models, audio IRs (~50MB)                           │
│                                                           │
│  Free tier: 10GB storage, unlimited downloads             │
└───────────────────────────────────────────────────────────┘
```

### 2.3 Services Summary

| Service | Purpose | Free Tier | Monthly Cost |
|---------|---------|-----------|-------------|
| **Vercel** | Frontend + API Routes (backend) | 100GB bandwidth, 1M function calls, 4hr CPU | **$0** |
| **Supabase** | Database + Auth + Real-time | 500MB DB, 50K MAUs, unlimited API calls | **$0** |
| **Cloudflare R2** (later) | Large benchmark test assets | 10GB storage, unlimited downloads | **$0** |
| **Total** | | | **$0** |

---

## 3. Hardware Detection Module

This is the **foundation** — runs before any benchmark to build a device profile.

### 3.1 What We Can Detect from the Browser

| Data Point | API / Method | Notes |
|-----------|-------------|-------|
| GPU Model | `WEBGL_debug_renderer_info` extension → `UNMASKED_RENDERER_WEBGL` | Returns string like "ANGLE (NVIDIA GeForce RTX 3060...)" |
| GPU Vendor | Same extension → `UNMASKED_VENDOR_WEBGL` | "Google Inc.", "Apple", etc. |
| GPU Tier | npm `detect-gpu` library | Classifies GPU into tier 0-3 based on benchmark DB |
| CPU Logical Cores | `navigator.hardwareConcurrency` | Logical cores (includes hyperthreading) |
| Device Memory | `navigator.deviceMemory` | Approximate RAM in GB (rounded: 0.25, 0.5, 1, 2, 4, 8) — Chrome only |
| Screen Resolution | `window.screen.width/height` + `devicePixelRatio` | Physical pixels = CSS pixels × DPR |
| Connection Speed | `navigator.connection.effectiveType` + `downlink` | Rough network estimate |
| Battery Status | `navigator.getBattery()` | Charge level, charging state — Chrome only |
| WebGPU Support | `navigator.gpu` existence check | If present, can get adapter info |
| WebGPU Adapter Info | `adapter.requestAdapterInfo()` | Returns vendor, architecture, device, description |
| Max Texture Size | `gl.getParameter(gl.MAX_TEXTURE_SIZE)` | GPU capability indicator |
| Max Render Buffer | `gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)` | GPU capability indicator |
| WASM Support | Feature detection | Check `WebAssembly` global exists |
| Web Worker Support | Feature detection | Check `Worker` constructor exists |

### 3.2 Hardware Detection Implementation Plan

```
/src/lib/hardware-detect/
  ├── index.ts              # Main orchestrator — runs all detectors, builds DeviceProfile
  ├── gpu-detect.ts         # WebGL renderer string parsing + WebGPU adapter info
  ├── cpu-detect.ts         # hardwareConcurrency + Web Worker timing probe
  ├── memory-detect.ts      # deviceMemory + performance.memory (Chrome)
  ├── display-detect.ts     # Resolution, DPR, color depth, HDR support
  ├── capabilities.ts       # Feature detection (WebGPU, WASM, WebCodecs, AudioWorklet)
  └── types.ts              # DeviceProfile interface
```

**DeviceProfile interface:**
```typescript
interface DeviceProfile {
  gpu: {
    renderer: string;        // "NVIDIA GeForce RTX 3060"
    vendor: string;
    tier: 0 | 1 | 2 | 3;
    maxTextureSize: number;
    webgpuSupported: boolean;
    webgpuInfo?: GPUAdapterInfo;
    vramEstimate?: number;    // Estimated from texture allocation probing
  };
  cpu: {
    logicalCores: number;
    estimatedSingleCoreScore?: number;  // From quick micro-benchmark
    wasmSupported: boolean;
  };
  memory: {
    deviceMemory?: number;    // navigator.deviceMemory
    jsHeapLimit?: number;     // performance.memory (Chrome)
  };
  display: {
    width: number;
    height: number;
    dpr: number;
    physicalWidth: number;
    physicalHeight: number;
    colorDepth: number;
  };
  capabilities: {
    webgpu: boolean;
    webgl2: boolean;
    webcodecs: boolean;
    audioWorklet: boolean;
    offscreenCanvas: boolean;
    sharedArrayBuffer: boolean;
  };
  userAgent: string;
  platform: string;
  timestamp: number;
}
```

---

## 4. Benchmark Modules — Detailed Design

### 4.1 Module Structure (Shared Pattern)

Every benchmark module follows this pattern:

```
/src/benchmarks/{module-name}/
  ├── config.ts          # Test definitions, parameters, difficulty levels
  ├── engine.ts          # Core benchmark logic (runs in worker or main thread)
  ├── worker.ts          # Web Worker entry point (for CPU-bound tests)
  ├── gpu-shader.ts      # WGSL/GLSL shaders (for GPU tests)
  ├── scoring.ts         # Score calculation, normalization, rating assignment
  ├── ui/
  │   ├── BenchmarkPanel.tsx    # Main UI for this benchmark category
  │   ├── TestSelector.tsx      # Pick which sub-tests to run
  │   ├── ProgressView.tsx      # Real-time progress with live metrics
  │   └── ResultsView.tsx       # Score breakdown, charts, comparisons
  └── assets/            # Test data files (code samples, images, audio clips)
```

**Shared scoring system:**
- Each sub-test produces a raw score (time in ms, ops/sec, fps, etc.)
- Raw scores are normalized against a **reference device** (defined baseline)
- Normalized scores (0–100 scale) are weighted and combined into a **category score**
- Category scores combine into an **overall DevBench Score**

---

### 4.2 CODING BENCHMARK

**Purpose:** Measure how fast the device can handle code-related workloads — compilation, execution, parsing, and multi-threaded builds.

#### Sub-Tests

| Test | What It Measures | Implementation |
|------|-----------------|----------------|
| **WASM Compilation Speed** | How fast the browser can compile a large WebAssembly module | Load a ~2MB .wasm binary, measure `WebAssembly.compile()` and `WebAssembly.instantiate()` time |
| **JS Parse + Execute** | V8/SpiderMonkey raw JS throughput | Bundle a large JS file (minified React + lodash + d3 combined), measure `eval()` or `Function()` parse+exec time |
| **Algorithm Execution (single-thread)** | Single-core CPU speed | Run classic algorithms in WASM: sorting (quicksort 10M items), matrix multiplication (1024×1024), Fibonacci (recursive + memoized), prime sieve (to 10M) |
| **Algorithm Execution (multi-thread)** | Multi-core scaling | Same algorithms but sharded across N Web Workers (N = hardwareConcurrency), measure speedup |
| **Regex Processing** | Text processing speed | Apply complex regex patterns against a 10MB text corpus |
| **JSON Parse/Stringify** | Data serialization | Parse and stringify a deeply nested 50MB JSON structure |
| **TypeScript-style Type Check Simulation** | Complex computation | Run a WASM-compiled type-checker or constraint solver on a large input |
| **Compression** | CPU throughput | Compress/decompress a 10MB payload using WASM-compiled zlib or brotli |

#### Implementation Notes

- **WASM modules should be pre-compiled** from C/Rust using Emscripten or wasm-pack and stored as static assets
- **Web Workers are essential** — all heavy computation runs off the main thread to keep the UI responsive
- **Use `performance.now()`** for high-resolution timing (sub-millisecond)
- **Warm-up runs** — always do 1-2 untimed warm-up runs before the measured run (JIT compilation affects first run)
- **SharedArrayBuffer** — use if available for zero-copy data sharing between workers (requires COOP/COEP headers)

#### Scoring

```
Coding Score = (
  0.20 × WASM_Compile_Normalized +
  0.15 × Single_Thread_Normalized +
  0.20 × Multi_Thread_Normalized +
  0.15 × Regex_Normalized +
  0.10 × JSON_Normalized +
  0.10 × Compression_Normalized +
  0.10 × JS_Parse_Normalized
) × 100
```

---

### 4.3 GRAPHICS DESIGN BENCHMARK

**Purpose:** Simulate tasks a designer performs — canvas rendering, SVG manipulation, image filtering, font rendering.

#### Sub-Tests

| Test | What It Measures | Implementation |
|------|-----------------|----------------|
| **Canvas 2D Rendering** | 2D GPU rasterization | Draw thousands of shapes (rects, arcs, bezier curves) with gradients, shadows, compositing; measure time to complete frame |
| **SVG DOM Stress** | DOM + rendering pipeline | Create and animate 5000 SVG elements with transforms, filters, clip paths; measure FPS |
| **Image Filter Pipeline** | Pixel manipulation speed | Apply chains of filters (blur, sharpen, color correct, levels adjust) to a 4K image using OffscreenCanvas + WebGL shaders |
| **WebGL 2D Scene** | GPU-accelerated 2D | Render a complex 2D scene (think Figma-like canvas) with 10K layers, blending modes, masks — measure render time |
| **Text Layout** | Font rendering + layout | Render 10K text runs with mixed fonts, sizes, RTL/LTR, measure layout + paint time |
| **Export Simulation** | Full pipeline | Render a complex composition to a high-res canvas and export as PNG blob — measure total time |

#### Implementation Notes

- Use **OffscreenCanvas** in a Worker for non-blocking rendering
- **WebGL shaders** for image filters (Gaussian blur, unsharp mask, color LUTs) — far faster than CPU Canvas filters
- **Large test images** (4K, 8K) served from CDN, cached locally via Service Worker
- The Figma-like scene test is the most representative — build a mini scene graph renderer

#### Scoring

```
Graphics Score = (
  0.15 × Canvas2D_Normalized +
  0.15 × SVG_Stress_Normalized +
  0.25 × Image_Filter_Normalized +
  0.25 × WebGL_2D_Normalized +
  0.10 × Text_Layout_Normalized +
  0.10 × Export_Normalized
) × 100
```

---

### 4.4 VIDEO EDITING BENCHMARK

**Purpose:** Test video decode/encode speed, real-time preview performance, effects pipeline throughput.

#### Sub-Tests

| Test | What It Measures | Implementation |
|------|-----------------|----------------|
| **Video Decode Speed** | Hardware decoder throughput | Use WebCodecs `VideoDecoder` to decode a 1080p H.264 clip, measure frames/sec |
| **4K Decode Speed** | High-res decode capability | Same but with 4K HEVC clip — detect if hardware decode is available |
| **Frame Processing Pipeline** | GPU effects chain | Decode frames → apply WebGL/WebGPU shader chain (color grade, LUT, vignette, noise reduction) → measure throughput |
| **Timeline Scrub Simulation** | Random access speed | Seek to random positions in a video, measure decode-to-display latency |
| **Audio-Video Sync** | System timing accuracy | Play audio + video simultaneously, measure drift over 60 seconds |
| **Export Encode** | Encoding speed | Use WebCodecs `VideoEncoder` to encode processed frames to H.264 — measure encode FPS |
| **Thumbnail Generation** | Batch processing | Generate 100 thumbnails from different timestamps — total time |

#### Implementation Notes

- **WebCodecs API** is the key — it provides hardware-accelerated encode/decode
- **Fallback:** If WebCodecs unavailable, use `<video>` element + canvas capture (much slower, but still measurable)
- Store test video clips as **fragmented MP4** on CDN (progressive download + random access)
- GPU shader chain should be identical to what real NLEs apply (color correction, transitions)
- **Cross-Origin restrictions:** Test videos must be served with proper CORS headers

#### Scoring

```
Video Score = (
  0.20 × Decode_1080p_Normalized +
  0.15 × Decode_4K_Normalized +
  0.25 × Effects_Pipeline_Normalized +
  0.15 × Timeline_Scrub_Normalized +
  0.15 × Encode_Normalized +
  0.10 × Thumbnail_Normalized
) × 100
```

---

### 4.5 GAMING BENCHMARK

**Purpose:** Two-pronged approach — (1) run actual GPU stress tests in the browser, and (2) estimate game performance by mapping the user's GPU to a known benchmark database.

#### Part A: Live GPU Stress Tests

| Test | What It Measures | Implementation |
|------|-----------------|----------------|
| **WebGPU Particle System** | Raw compute + render throughput | Simulate 1M+ particles using compute shaders, render with instancing, measure FPS |
| **3D Scene Render** | Geometry + lighting pipeline | Render a complex 3D scene (100K triangles, PBR materials, dynamic shadows, post-processing) — measure FPS at 1080p, 1440p, 4K |
| **Physics Simulation** | GPU compute | N-body gravity simulation or cloth sim on GPU compute shaders — measure iterations/sec |
| **Ray Tracing (if supported)** | RT capability | Simple ray-traced scene using WebGPU compute — measure rays/sec |
| **Fill Rate Test** | Pixel throughput | Render screen-filling quads with complex fragment shaders, measure pixels/sec |
| **Draw Call Stress** | CPU-GPU communication | Render 50K individual objects with unique transforms — measure draw calls/sec |

#### Part B: Game Performance Estimation (The Fun Part)

This is the "how will this game run on my device" feature. Here is the methodology:

**Step 1: Build a Reference Database**

Create a server-side database that maps GPU models to known benchmark scores and per-game FPS data:

```typescript
interface GPUBenchmarkEntry {
  gpuModel: string;            // "NVIDIA GeForce RTX 3060"
  benchmarkScore: number;      // Normalized 0-10000 scale (from our own tests + 3DMark-equivalent)
  games: GamePerformance[];
}

interface GamePerformance {
  gameId: string;              // "cyberpunk-2077"
  gameName: string;
  settings: QualitySetting[];
}

interface QualitySetting {
  preset: "Low" | "Medium" | "High" | "Ultra" | "RT Ultra";
  resolution: "1080p" | "1440p" | "4K";
  avgFps: number;
  onePercentLow: number;
  isPlayable: boolean;         // avgFps >= 30
  isSmooth: boolean;           // avgFps >= 60
}
```

**Data sources for this database:**
- Scrape/aggregate from public benchmark sites (PCGameBenchmark, TechPowerUp, Tom's Hardware, TechSpot reviews)
- Community submissions from your own users (once the app has traction)
- Manual testing by your team on reference hardware

**Step 2: Map the User's GPU**

1. Detect GPU via `UNMASKED_RENDERER_WEBGL` (e.g., "ANGLE (NVIDIA GeForce RTX 3060 ...)")
2. Parse the string to extract the GPU model
3. Look up in the reference database
4. If exact match not found, fuzzy match to the closest GPU

**Step 3: Run a Calibration Benchmark**

Run your own WebGPU stress test and produce a **DevBench GPU Score** (0-10000). This score serves as a universal mapping key.

**Step 4: Linear Interpolation for Estimates**

If the user's GPU is detected as "RTX 3060" with a DevBench GPU Score of 5500:

```
User's estimated FPS in Game X =
  (User's DevBench Score / Reference RTX 3060 DevBench Score) × Known RTX 3060 FPS in Game X
```

If the user's GPU is NOT in the database (e.g., an obscure laptop GPU), find the two closest GPUs by DevBench score and linearly interpolate:

```
// GPU_A has score 5000 and gets 75 FPS in Cyberpunk
// GPU_B has score 6000 and gets 95 FPS in Cyberpunk
// User's score = 5500
// Estimated FPS = 75 + (95-75) × (5500-5000)/(6000-5000) = 85 FPS
```

#### Games to Include (Initial Set — Top 15)

Pick a mix of well-known titles across genres and GPU demand levels:

1. **Cyberpunk 2077** (Heavy — RT showcase)
2. **Red Dead Redemption 2** (Heavy — open world)
3. **Hogwarts Legacy** (Heavy — recent AAA)
4. **Elden Ring** (Medium — popular FromSoft)
5. **Baldur's Gate 3** (Medium-Heavy — GOTY)
6. **Call of Duty: Warzone** (Medium — competitive FPS)
7. **Fortnite** (Light-Medium — massively popular)
8. **Valorant** (Light — competitive, runs on anything)
9. **Minecraft** (Light — but shaders change everything)
10. **GTA V** (Medium — evergreen)
11. **Apex Legends** (Medium — competitive BR)
12. **CS2** (Medium — competitive)
13. **Starfield** (Heavy — Bethesda)
14. **Marvel Rivals** (Medium — recent popular)
15. **The Witcher 3 (Next-Gen)** (Medium-Heavy — classic)

Each game gets a dedicated card in the UI showing: estimated FPS at Low/Medium/High/Ultra at 1080p/1440p/4K, whether it's "Playable" (30+), "Smooth" (60+), or "Competitive" (144+), and the recommended settings.

#### Gaming Score

```
Gaming Score = (
  0.40 × WebGPU_Stress_Test_Normalized +
  0.25 × 3D_Scene_FPS_Normalized +
  0.15 × Physics_Compute_Normalized +
  0.10 × Fill_Rate_Normalized +
  0.10 × Draw_Call_Normalized
) × 100

// Game estimates are separate — shown per-game, not part of the score
```

---

### 4.6 SOUND ENGINEERING BENCHMARK

**Purpose:** Measure audio processing capability — latency, DSP throughput, polyphony, real-time effects.

#### Sub-Tests

| Test | What It Measures | Implementation |
|------|-----------------|----------------|
| **Audio Latency** | Round-trip audio delay | Measure AudioContext `outputLatency` + `baseLatency`; also measure actual latency using AudioWorklet timing |
| **DSP Chain Throughput** | Real-time effect processing | Build a chain: EQ (8-band parametric) → Compressor → Reverb (convolution) → Limiter; measure how many simultaneous chains can run before audio glitches |
| **Polyphony Test** | Simultaneous voice count | Spawn OscillatorNodes with individual envelopes; increase count until `render capacity` exceeds 80% |
| **Convolution Reverb** | CPU-intensive audio | Apply convolution reverb using large impulse responses (5+ second church reverb); measure processing time |
| **FFT Analysis** | Spectral analysis speed | Run AnalyserNode with 32768-point FFT on live audio; measure analysis throughput |
| **Audio Worklet Performance** | Custom DSP speed | Run a custom AudioWorklet processor (wavetable synth with FM) — measure max polyphony before xruns |
| **Sample Rate Handling** | Resampling performance | Process audio at 96kHz and 192kHz sample rates; measure if real-time playback sustains |
| **Bounce/Export Speed** | Offline rendering | Use `OfflineAudioContext` to render a complex 3-minute mix offline — measure render time vs real-time |

#### Implementation Notes

- **AudioWorklet** is mandatory for accurate DSP benchmarking (ScriptProcessorNode is deprecated and runs on main thread)
- **OfflineAudioContext** for bounce tests — can render faster than real-time
- Use Spotify's `web-audio-bench` methodology as reference for node-level benchmarks
- **Convolution reverb** with large IR files is a great stress test (loads of memory + CPU)
- Measure **render capacity** via `AudioContext.renderCapacity` (Chrome) or by monitoring callback deadline misses

#### Scoring

```
Sound Score = (
  0.15 × Latency_Normalized +
  0.25 × DSP_Chain_Normalized +
  0.20 × Polyphony_Normalized +
  0.15 × Convolution_Normalized +
  0.10 × FFT_Normalized +
  0.15 × Bounce_Speed_Normalized
) × 100
```

---

## 5. Overall Scoring System

### 5.1 DevBench Overall Score

```
DevBench Score = (
  0.20 × Coding_Score +
  0.20 × Graphics_Score +
  0.20 × Video_Score +
  0.25 × Gaming_Score +
  0.15 × Sound_Score
) × 100

// Produces a score from 0 to 10,000
```

### 5.2 Rating Tiers

| Score Range | Tier | Badge |
|-------------|------|-------|
| 0 – 1,500 | Entry Level | Bronze |
| 1,500 – 3,500 | Capable | Silver |
| 3,500 – 5,500 | Performance | Gold |
| 5,500 – 7,500 | High Performance | Platinum |
| 7,500 – 9,000 | Enthusiast | Diamond |
| 9,000 – 10,000 | Elite | Obsidian |

### 5.3 Per-Category Ratings

Each category also gets its own field-specific rating:
- **Coding:** "Dev Workstation Ready" / "Build Machine" / "IDE Friendly" / "Basic"
- **Graphics:** "Studio Grade" / "Design Ready" / "Light Design" / "Not Recommended"
- **Video:** "Edit Bay" / "Proxy Friendly" / "Light Cuts" / "Not Recommended"
- **Gaming:** "4K Ultra" / "1440p High" / "1080p Medium" / "720p Low" / "Not Recommended"
- **Sound:** "Studio DAW" / "Production Ready" / "Bedroom Producer" / "Basic Playback"

---

## 6. UI/UX Design Plan

### 6.1 Page Structure

```
/ (Landing)
  → Hero with animated benchmark preview
  → Feature cards for each category
  → "Start Benchmark" CTA

/benchmark
  → Device detection phase (5 seconds, animated)
  → Category selector (run all or pick individual)
  → Benchmark runner (progress, live metrics)
  → Results dashboard

/benchmark/coding          → Coding tests
/benchmark/graphics        → Graphics tests
/benchmark/video           → Video tests
/benchmark/gaming          → Gaming tests + game estimator
/benchmark/sound           → Sound tests

/results/{id}              → Shareable results page
/leaderboard               → Global rankings hub
/leaderboard/gpu           → Best score per GPU model ("Hall of Fame")
/leaderboard/hardware      → Best score per GPU+CPU combo
/leaderboard/{category}    → Best per hardware for a specific category
/leaderboard/records       → Recently broken records feed
/compare                   → Side-by-side device comparison
/games/{game-slug}         → Per-game FPS database page (SEO)
/about                     → Methodology documentation
```

### 6.2 Key UI Components

**Benchmark Runner:**
- Full-screen mode available (reduces browser overhead)
- Real-time metrics overlay (FPS counter, CPU usage estimate, progress bar)
- Each sub-test shows a live visualization (particles, waveform, render preview)
- Cancel button + estimated time remaining

**Results Dashboard:**
- Central "DevBench Score" with animated reveal
- Radar/spider chart showing all 5 categories
- Per-category breakdown cards with sub-test scores
- "How does your device compare?" histogram against all users
- Game performance estimation cards (for gaming category)
- Share button → generates a shareable URL + OG image

**Game Estimator UI:**
- Grid of game cards with cover art
- Click a game → see estimated FPS at different settings/resolutions
- Visual "traffic light" indicators (Red = unplayable, Yellow = playable, Green = smooth, Blue = competitive)
- Recommended settings badge

### 6.3 Design Principles

- **Dark theme default** (benchmark tool aesthetic, reduces eye strain during tests)
- **Neon accent colors** per category (blue=coding, purple=graphics, red=video, green=gaming, orange=sound)
- **Minimal during benchmarks** — strip away chrome, maximize rendering area
- **Data-rich results** — lots of charts, comparisons, context
- **Mobile-responsive** — results pages work on phone (benchmarks are desktop-focused)

---

## 7. Backend & Database — Vercel + Supabase

All backend logic lives inside the Next.js project as **Vercel API Routes** (`/app/api/*`). No separate server. The database is **Supabase** (managed PostgreSQL with built-in auth and real-time). All benchmarks run 100% client-side — the server only handles data storage, auth, and leaderboard queries.

### 7.1 Database Schema (Supabase / PostgreSQL)

These tables are created in the Supabase dashboard (SQL Editor) or via migrations.
Supabase Auth handles the `auth.users` table automatically — we only need a `profiles` table for display names.

```sql
-- User Profiles (extends Supabase Auth's built-in auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Device Profiles
CREATE TABLE device_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles,
  gpu_renderer TEXT,
  gpu_vendor TEXT,
  gpu_tier INT,
  cpu_cores INT,
  device_memory FLOAT,
  screen_width INT,
  screen_height INT,
  user_agent TEXT,
  created_at TIMESTAMPTZ
);

-- Benchmark Results
CREATE TABLE benchmark_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_profile_id UUID REFERENCES device_profiles,
  user_id UUID REFERENCES profiles,
  overall_score INT,
  coding_score INT,
  graphics_score INT,
  video_score INT,
  gaming_score INT,
  sound_score INT,
  sub_scores JSONB,            -- Detailed sub-test scores
  raw_metrics JSONB,           -- Raw timing data
  app_version VARCHAR,
  benchmark_version VARCHAR,   -- For invalidating old scores
  created_at TIMESTAMPTZ
);

-- GPU Reference Database (for game estimates)
CREATE TABLE gpu_models (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR UNIQUE,
  manufacturer VARCHAR,        -- NVIDIA, AMD, Intel, Apple
  reference_score INT,         -- Normalized benchmark score
  tier VARCHAR,                -- "entry", "mid", "high", "flagship"
  release_year INT,
  vram_gb FLOAT
);

-- Game FPS Data
CREATE TABLE game_fps_data (
  id SERIAL PRIMARY KEY,
  gpu_model_id INT REFERENCES gpu_models,
  game_id VARCHAR,
  game_name VARCHAR,
  preset VARCHAR,              -- Low, Medium, High, Ultra
  resolution VARCHAR,          -- 1080p, 1440p, 4K
  avg_fps FLOAT,
  one_percent_low FLOAT,
  source VARCHAR,              -- "manual", "community", "scraped"
  updated_at TIMESTAMPTZ
);

-- Games Catalog
CREATE TABLE games (
  id VARCHAR PRIMARY KEY,      -- "cyberpunk-2077"
  name VARCHAR,
  genre VARCHAR,
  release_year INT,
  cover_image_url TEXT,
  gpu_demand VARCHAR,          -- "light", "medium", "heavy", "extreme"
  is_active BOOLEAN DEFAULT true
);

-- ============================================================
-- HARDWARE LEADERBOARD (Best Score Per Unique Hardware Combo)
-- ============================================================
-- Only ONE row per unique hardware_key. If a new higher score
-- comes in for the same hardware, we UPDATE (replace) the row.
-- ============================================================

-- Overall Leaderboard (best DevBench score per hardware combo)
CREATE TABLE leaderboard_overall (
  id SERIAL PRIMARY KEY,
  hardware_key VARCHAR UNIQUE,       -- Normalized key: "nvidia-rtx-3060_8-cores" (GPU + CPU cores)
  gpu_model VARCHAR NOT NULL,        -- "NVIDIA GeForce RTX 3060"
  gpu_vendor VARCHAR,                -- "NVIDIA", "AMD", "Intel", "Apple"
  cpu_cores INT,                     -- Logical core count
  device_memory FLOAT,               -- RAM in GB
  overall_score INT NOT NULL,
  coding_score INT,
  graphics_score INT,
  video_score INT,
  gaming_score INT,
  sound_score INT,
  benchmark_result_id UUID REFERENCES benchmark_results,  -- Link to full result
  user_id UUID REFERENCES profiles,     -- Who set this record
  username VARCHAR,                  -- Denormalized for fast display
  browser VARCHAR,                   -- "Chrome 130", "Firefox 141", etc.
  os_platform VARCHAR,               -- "Windows", "macOS", "Linux"
  scored_at TIMESTAMPTZ NOT NULL,    -- Date the record was set
  previous_score INT,                -- What the old record was (NULL if first)
  previous_scored_at TIMESTAMPTZ,    -- When the old record was set
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-Category Leaderboards (best score per hardware per category)
CREATE TABLE leaderboard_category (
  id SERIAL PRIMARY KEY,
  hardware_key VARCHAR NOT NULL,
  category VARCHAR NOT NULL,         -- "coding", "graphics", "video", "gaming", "sound"
  gpu_model VARCHAR NOT NULL,
  gpu_vendor VARCHAR,
  cpu_cores INT,
  device_memory FLOAT,
  score INT NOT NULL,
  benchmark_result_id UUID REFERENCES benchmark_results,
  user_id UUID REFERENCES profiles,
  username VARCHAR,
  browser VARCHAR,
  os_platform VARCHAR,
  scored_at TIMESTAMPTZ NOT NULL,
  previous_score INT,
  previous_scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hardware_key, category)     -- One record per hardware per category
);

-- Per-GPU Leaderboard (best score per exact GPU model, regardless of CPU)
CREATE TABLE leaderboard_gpu (
  id SERIAL PRIMARY KEY,
  gpu_model VARCHAR UNIQUE NOT NULL, -- "Apple M3 Pro", "NVIDIA GeForce RTX 4070"
  gpu_vendor VARCHAR,
  best_overall_score INT NOT NULL,
  best_gaming_score INT,
  best_coding_score INT,
  best_graphics_score INT,
  best_video_score INT,
  best_sound_score INT,
  benchmark_result_id UUID REFERENCES benchmark_results,
  user_id UUID REFERENCES profiles,
  username VARCHAR,
  cpu_cores INT,                     -- CPU of the system that achieved this
  device_memory FLOAT,
  browser VARCHAR,
  os_platform VARCHAR,
  scored_at TIMESTAMPTZ NOT NULL,
  previous_score INT,
  previous_scored_at TIMESTAMPTZ,
  submission_count INT DEFAULT 1,    -- How many times this GPU has been tested
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leaderboard History (audit trail — every time a record is broken)
CREATE TABLE leaderboard_history (
  id SERIAL PRIMARY KEY,
  leaderboard_type VARCHAR,          -- "overall", "category", "gpu"
  hardware_key VARCHAR,
  category VARCHAR,                  -- NULL for overall/gpu types
  old_score INT,
  new_score INT,
  old_user_id UUID,
  new_user_id UUID,
  old_scored_at TIMESTAMPTZ,
  new_scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leaderboard_overall_score ON leaderboard_overall(overall_score DESC);
CREATE INDEX idx_leaderboard_overall_gpu ON leaderboard_overall(gpu_vendor, overall_score DESC);
CREATE INDEX idx_leaderboard_category_score ON leaderboard_category(category, score DESC);
CREATE INDEX idx_leaderboard_gpu_score ON leaderboard_gpu(best_overall_score DESC);
CREATE INDEX idx_leaderboard_gpu_vendor ON leaderboard_gpu(gpu_vendor, best_overall_score DESC);
```

### 7.2 API Routes (Vercel — inside Next.js `/app/api/`)

These are Next.js Route Handlers, not a separate server. Each file becomes an endpoint:

```
/app/api/
  ├── benchmark/
  │   ├── submit/route.ts          → POST: Submit scores + update leaderboard
  │   └── [id]/route.ts            → GET: Fetch specific result by share ID
  ├── leaderboard/
  │   ├── route.ts                 → GET: Overall leaderboard (paginated, filterable)
  │   ├── gpu/route.ts             → GET: Best score per GPU model
  │   ├── gpu/[model]/route.ts     → GET: Details + history for a specific GPU
  │   ├── category/[cat]/route.ts  → GET: Best scores for a specific category
  │   └── records/route.ts         → GET: Recently broken records feed
  ├── gpu/
  │   └── [model]/games/route.ts   → GET: Game FPS estimates for a GPU
  ├── games/
  │   └── [id]/gpus/route.ts       → GET: GPU rankings for a specific game
  ├── compare/route.ts             → GET: Side-by-side comparison (?ids=a,b,c)
  └── stats/
      └── distribution/route.ts    → GET: Score histogram data
```

**Example API Route — Submit Benchmark:**
```typescript
// /app/api/benchmark/submit/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // Server-side only, full access
)

export async function POST(request: Request) {
  const body = await request.json()
  const { deviceProfile, scores, subScores, benchmarkVersion } = body

  // 1. Save the benchmark result
  const { data: result, error } = await supabase
    .from('benchmark_results')
    .insert({
      device_profile: deviceProfile,
      hardware_key: normalizeHardwareKey(deviceProfile.gpuModel, deviceProfile.cpuCores),
      overall_score: scores.overall,
      coding_score: scores.coding,
      graphics_score: scores.graphics,
      video_score: scores.video,
      gaming_score: scores.gaming,
      sound_score: scores.sound,
      sub_scores: subScores,
      benchmark_version: benchmarkVersion,
    })
    .select()
    .single()

  // 2. Upsert leaderboard (PostgreSQL handles the "only if higher" logic)
  await supabase.rpc('upsert_leaderboard', {
    p_hardware_key: result.hardware_key,
    p_score: scores.overall,
    p_result_id: result.id,
    // ... other params
  })

  return NextResponse.json({ result, isNewRecord: /* check */ })
}
```

**Supabase handles auth automatically** — no auth API routes needed. The Supabase JS client on the frontend handles login/signup/OAuth directly:
```typescript
// Frontend — no API route needed
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
const supabase = createClientComponentClient()
await supabase.auth.signInWithOAuth({ provider: 'google' })
```

**Real-time leaderboard updates** — also no API route needed. Supabase Realtime subscriptions on the frontend:
```typescript
// Frontend — live leaderboard
supabase
  .channel('leaderboard')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leaderboard_overall' },
    (payload) => { /* update UI with new record */ }
  )
  .subscribe()
```

### 7.3 Leaderboard Logic — "Best Score Per Hardware" Upsert

When a benchmark is submitted, the backend runs this logic:

```
ON BENCHMARK SUBMIT:

1. Generate hardware_key from device profile:
   hardware_key = normalize(gpu_model) + "_" + cpu_cores + "cores"
   Example: "nvidia-geforce-rtx-3060_16cores"
   Example: "apple-m3-pro_12cores"

2. UPSERT into leaderboard_overall:
   IF no existing row for this hardware_key:
     → INSERT new row (this hardware's first record)
   ELSE IF new_score > existing_score:
     → Save old score to previous_score and previous_scored_at
     → UPDATE with new score, new user, new scored_at date
     → INSERT into leaderboard_history (record was broken)
   ELSE:
     → Do nothing (existing record stands)

3. REPEAT for each category in leaderboard_category:
   Same upsert logic but per (hardware_key, category)

4. UPSERT into leaderboard_gpu:
   Same logic but keyed on gpu_model alone (best score from ANY system with that GPU)

5. RETURN to user:
   - Their scores
   - Their rank per category
   - Whether they set a new record (and what the old record was)
   - Celebration animation if they broke a record
```

**Hardware Key Normalization Rules:**
- Lowercase everything
- Strip parentheses, "ANGLE", "Direct3D11", version suffixes
- Collapse whitespace
- Examples:
  - `"ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)"` → `"apple-m3-pro"`
  - `"ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11...)"` → `"nvidia-geforce-rtx-4070"`
  - `"ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11...)"` → `"amd-radeon-rx-7800-xt"`

### 7.4 Leaderboard Display Modes

The leaderboard page has multiple views:

**View 1: "Hall of Fame" — Best Score Per GPU**
| Rank | GPU | Best Score | By | Date | Submissions |
|------|-----|-----------|-----|------|-------------|
| 1 | RTX 5090 | 9,847 | @gamer42 | Mar 2, 2026 | 342 |
| 2 | Apple M4 Ultra | 8,921 | @macpro_user | Feb 28, 2026 | 89 |
| 3 | RTX 4090 | 8,756 | @overclocker | Jan 15, 2026 | 1,204 |
| ... | ... | ... | ... | ... | ... |

**View 2: "Category Kings" — Filter by Coding / Graphics / Video / Gaming / Sound**
Shows the best score for each GPU in that specific category. An Apple M4 Max might rank #1 in Video Editing but #15 in Gaming.

**View 3: "Full Hardware" — Best Score Per GPU+CPU Combo**
More granular — shows that an RTX 3060 paired with 16 cores scores different from one with 8 cores.

**View 4: "Record Breakers" — Recent Record Updates Feed**
A timeline showing when records were broken:
- "RTX 4070 overall record broken: 7,234 → 7,389 by @user123 (Mar 5, 2026)"
- "Apple M3 coding record broken: 6,100 → 6,450 by @devmac (Mar 4, 2026)"

**Filters available on all views:**
- GPU Vendor (NVIDIA / AMD / Intel / Apple)
- Category (Overall / Coding / Graphics / Video / Gaming / Sound)
- Platform (Windows / macOS / Linux)
- Time period (All time / This month / This week)

### 7.5 Anti-Cheat / Validation

Scores submitted from the browser can be manipulated. Mitigation strategies:

1. **Timing consistency checks** — if a test claims to run in 0.001ms, reject it (validate in API Route before saving to Supabase)
2. **Device profile cross-reference** — if a detected Intel UHD 630 claims a 9500 score, flag it
3. **Statistical outlier detection** — scores more than 3σ from the mean for that GPU model get flagged (run as a Supabase PostgreSQL function)
4. **Benchmark version pinning** — score only valid for the current benchmark version
5. **Rate limiting** — max 10 submissions per hour per user (track via a `submission_log` table in Supabase with timestamp checks)
6. **Proof of work** — include a hash of intermediate results that the server can spot-check
7. **Community moderation** — let users report suspicious scores
8. **Supabase Row Level Security (RLS)** — users can only read their own full results; leaderboard data is public read-only

This is not bulletproof (browser benchmarks never can be), but reduces casual manipulation significantly.

---

## 8. Native App Strategy (Future Phase)

### 8.1 Why a Native App?

Browser limitations that a native app can overcome:

| Limitation | Browser | Native App |
|-----------|---------|------------|
| GPU model detection | Unreliable string parsing | Direct hardware enumeration (DXGI, Metal, Vulkan) |
| CPU model detection | Not available | Full CPUID access |
| VRAM measurement | Not available | Direct GPU memory queries |
| Disk speed benchmark | Not possible | Direct storage I/O testing |
| Network benchmark | Limited | Full socket access |
| Thermal throttling detection | Not possible | Temperature sensor access |
| Background process interference | Cannot control | Can request priority, minimize background |

### 8.2 Recommended App Framework

| Platform | Framework | Rationale |
|----------|----------|-----------|
| Desktop (Windows/Mac/Linux) | **Tauri 2.0** | Rust backend for native perf, web frontend for shared UI, small binary size |
| Alternative Desktop | **Electron** | Easier if team knows JS well; heavier but proven (VS Code, Discord) |
| Mobile (iOS/Android) | **Flutter** or **React Native** | Flutter for performance-sensitive UI; RN if sharing code with web |

### 8.3 Shared Codebase Strategy

```
/packages
  /core         → Shared TypeScript: scoring logic, types, Supabase client
  /web          → Next.js web app (Vercel) — frontend + API routes
  /desktop      → Tauri app (imports /core, adds native benchmarks)
  /mobile       → Flutter/RN app (imports /core types, native modules for hardware)
  /benchmark    → Shared benchmark logic (WASM modules, shaders)
```

- **Scoring algorithms** and **test configurations** live in `/core` — shared across all platforms
- **Supabase client** is shared — all platforms connect to the same Supabase instance
- **Platform-specific benchmarks** (disk I/O, CPU temp) are added as extensions in each app
- **UI components** can be partially shared (web + Tauri use the same React; mobile needs its own UI)

---

## 9. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
- [ ] Project setup (Next.js, Tailwind, shadcn, TypeScript)
- [ ] Hardware detection module (full DeviceProfile)
- [ ] Landing page + basic UI shell
- [ ] Supabase setup (database tables, auth config, RLS policies)
- [ ] User auth (Supabase Auth — Google, GitHub, email)

### Phase 2: Core Benchmarks (Weeks 5-10)
- [ ] Coding benchmark (all sub-tests) — most straightforward, good foundation
- [ ] Gaming benchmark — GPU stress tests (WebGPU particle system + 3D scene)
- [ ] Scoring system + results dashboard UI
- [ ] Benchmark runner UI with progress tracking

### Phase 3: Remaining Benchmarks (Weeks 11-16)
- [ ] Graphics Design benchmark
- [ ] Video Editing benchmark (WebCodecs integration)
- [ ] Sound Engineering benchmark (AudioWorklet + Web Audio)
- [ ] Polish all benchmark visualizations

### Phase 4: Game Estimator + Social (Weeks 17-22)
- [ ] GPU reference database (seed Supabase with 50+ GPUs)
- [ ] Game FPS database (seed with 15 games × 50 GPUs)
- [ ] Game estimator UI
- [ ] Shareable results pages + OG image generation
- [ ] Leaderboard + comparison tool + Supabase Realtime for live updates

### Phase 5: Launch + Iterate (Weeks 23-26)
- [ ] Beta testing with real users
- [ ] Calibrate scoring weights based on real data
- [ ] SEO optimization (game pages, GPU pages)
- [ ] Move large benchmark assets to Cloudflare R2 (if bandwidth is a concern)
- [ ] Analytics + monitoring setup (PostHog free tier)
- [ ] Public launch

### Phase 6: Native App (Weeks 27-36)
- [ ] Tauri desktop app scaffold
- [ ] Port benchmarks to native (add disk, thermal, CPU model detection)
- [ ] Desktop-specific UI additions
- [ ] Mobile app planning + prototyping

---

## 10. Key Technical Decisions & Gotchas

### 10.1 WebGPU vs WebGL

- **Default to WebGPU** for all GPU benchmarks — it shipped on all major browsers as of November 2025
- **WebGL 2 fallback** is mandatory — Linux support is still patchy, and some corporate environments block WebGPU
- If neither is available, show a graceful "GPU benchmarks unavailable" message and still run CPU-based tests
- **Never mix WebGPU and WebGL scores** — they are not comparable; track which API was used with each score

### 10.2 Browser Differences

- **Chrome** generally has the best WebGPU and WebCodecs support
- **Firefox** has excellent WebAssembly/WASM performance (sometimes faster than Chrome)
- **Safari** has WebGPU support but some features lag behind
- **Always record which browser was used** alongside benchmark scores
- Consider showing a "recommended browser" banner if the user is on a less-capable browser

### 10.3 Thermal Throttling

- Laptops will thermally throttle during sustained benchmarks, reducing scores
- **Run a 30-second warm-up** before the measured benchmark to reach thermal steady state
- **Consider shorter test durations** (5-10 seconds per sub-test) to reduce throttle impact
- Note in results: "Laptop users: scores may be lower due to thermal limits"

### 10.4 Tab Visibility

- Browsers throttle background tabs aggressively
- **Use `document.visibilityState`** — pause benchmarks if the tab goes to background
- **Request fullscreen** for GPU benchmarks (reduces compositor overhead)
- Use `requestAnimationFrame` for render benchmarks, `setInterval` with Worker for compute

### 10.5 Privacy Considerations

- GPU renderer strings are used for fingerprinting — be transparent about data collection
- Add a clear privacy policy explaining what hardware data is collected and why
- Allow anonymous benchmarks (no account required)
- Don't log raw User-Agent strings in the public leaderboard

### 10.6 Apple Silicon Full Compatibility

Apple Silicon (M1, M2, M3, M4 and all Pro/Max/Ultra variants) is **fully supported** across all benchmark categories. Here's how each piece works:

**GPU Detection on Apple Devices:**

| Browser | Renderer String Returned | Example |
|---------|------------------------|---------|
| Chrome/Edge on macOS | Full chip name via ANGLE Metal | `"ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)"` |
| Firefox on macOS | Short chip name | `"Apple M1"` or `"Apple M3 Pro"` |
| Safari on macOS | Generic "Apple GPU" (older) or chip name (newer Safari) | Varies — use fallback detection |
| Safari on iOS/iPadOS | `"Apple GPU"` (no specific model) | Need GPU hashing technique for exact model |

**Safari "Apple GPU" Fallback:** On Safari versions that return generic "Apple GPU" instead of the specific chip, use the `detect-gpu` npm library or the 51Degrees Renderer.js approach — it uses GPU compute characteristics (interpolation patterns, max texture sizes, screen dimensions) combined with micro-benchmarks to fingerprint the exact Apple chip.

**Apple-Specific Considerations for Each Benchmark:**

| Category | Apple Compatibility | Notes |
|----------|-------------------|-------|
| Coding | Excellent | WASM runs great on Apple Silicon; `hardwareConcurrency` correctly reports cores (M1=8, M1 Pro=10, M1 Max=10, M4 Pro=14, etc.) |
| Graphics | Excellent | WebGL 2 and WebGPU both work via Metal backend; Apple's GPU uses unified memory so texture operations are very fast |
| Video | Excellent | WebCodecs supported in Safari 16.4+; hardware H.264/HEVC decode via VideoToolbox; Safari has some of the best video decode |
| Gaming | Excellent with caveats | WebGPU works great via Metal; however Apple GPUs have tile-based deferred rendering architecture — different perf profile than discrete NVIDIA/AMD |
| Sound | Excellent | Web Audio API + AudioWorklets fully supported; Apple Silicon has excellent audio latency (CoreAudio backend) |

**Apple in the Game Estimator:**
Apple Silicon doesn't run Windows games natively, so the game FPS estimation feature needs special handling:

1. **Show macOS-native game estimates** — only for games with Mac ports (many on Steam now via Game Porting Toolkit / Rosetta)
2. **Show Parallels/CrossOver estimates** — estimate FPS via translation layer (roughly 60-80% of native Windows perf)
3. **Show a "Mac equivalent" GPU** — map Apple M3 Pro → "roughly equivalent to RTX 3060 in gaming" based on benchmark scores, then show that GPU's data
4. **Clearly label it** — "These estimates assume macOS-native performance" or "via translation layer"

Recommendation: Use option 3 + option 1 combined. Show native Mac game estimates where available; for Windows-only titles, show the equivalent discrete GPU comparison.

**Unified Memory Note:**
Apple Silicon uses unified memory (shared CPU+GPU RAM). `navigator.deviceMemory` returns total system RAM (8, 16, 24, etc.). No separate VRAM — GPU can use all available memory. This gives Apple an advantage in large-texture benchmarks. Score display should note this distinction.

**Apple Chips for the GPU Reference Database:**

| Chip | GPU Cores | Tier | Rough Windows Equivalent |
|------|-----------|------|--------------------------|
| M1 | 8 | Mid | GTX 1650 |
| M1 Pro (14c) | 14 | Mid-High | RTX 3060 Mobile |
| M1 Max (32c) | 32 | High | RTX 3070 Mobile |
| M2 | 10 | Mid | RTX 3050 |
| M2 Pro (19c) | 19 | Mid-High | RTX 3060 Ti Mobile |
| M2 Max (38c) | 38 | High | RTX 3080 Mobile |
| M2 Ultra (76c) | 76 | Very High | RTX 4070 |
| M3 | 10 | Mid | RTX 3060 |
| M3 Pro (18c) | 18 | Mid-High | RTX 3070 |
| M3 Max (40c) | 40 | High | RTX 4070 Ti |
| M4 | 10 | Mid | RTX 3060 Ti |
| M4 Pro (20c) | 20 | High | RTX 4060 Ti |
| M4 Max (40c) | 40 | Very High | RTX 4080 Mobile |
| M4 Ultra | 80 | Elite | RTX 4090 Mobile |

*These equivalencies are rough starting points — actual DevBench scores from real users will create more accurate mappings over time.*

---

## 11. Content & Data Requirements

### 11.1 Static Assets Needed

| Asset | Purpose | Approximate Size |
|-------|---------|-----------------|
| WASM modules (sorting, matrix, compression) | Coding benchmarks | ~5MB total |
| Test images (4K, 8K) | Graphics/Video benchmarks | ~50MB (lazy-loaded from CDN) |
| Test video clips (1080p + 4K, H.264/HEVC) | Video benchmarks | ~100MB (streamed from CDN) |
| Impulse response WAV files | Sound benchmarks | ~20MB |
| 3D scene assets (glTF models, textures) | Gaming benchmarks | ~30MB |
| Game cover art | Game estimator UI | ~5MB |
| Reference benchmark data (JSON) | GPU database | ~2MB |

**Total assets: ~200MB** (users only download what they need per benchmark)

**Storage Strategy (Phased):**
- **Phase 1 (launch):** Small assets (<5MB each: WASM modules, game cover art, reference JSON) live in Vercel's `/public` folder. Free, simple, no extra service.
- **Phase 2 (when adding video/heavy benchmarks):** Move large files (test videos, 4K images, 3D models, audio IRs) to **Cloudflare R2** (10GB free, zero download fees). Only change is swapping a URL — no code rewrite needed.

### 11.2 Data Collection Strategy for Game FPS Database

1. **Manual curation (Phase 1):** Research existing benchmark articles/videos for the initial 15 games × 50 GPUs. Use data from Tom's Hardware, TechPowerUp, Digital Foundry, Hardware Unboxed.
2. **Community submissions (Phase 2):** Let users submit their actual FPS readings. Require them to specify game, settings, resolution, and verify against their detected GPU.
3. **Partnerships (Phase 3):** Partner with hardware review sites or benchmark tool makers for data sharing.
4. **Keep data versioned by game patch** — game updates can significantly change performance.

---

## 12. Monetization Options (For Later)

**Important:** Vercel's free Hobby tier is for non-commercial use only. The moment you start earning money from DevBench, upgrade to Vercel Pro ($20/month). By that point, revenue should easily cover it.

- **Free tier:** Run all benchmarks, see your own results, share link
- **Pro tier ($5/month):** Historical tracking (track your device over time), detailed comparison tools, export reports, no ads
- **API access (developer tier):** Let other sites embed DevBench scores or use the GPU database
- **Affiliate links:** "Upgrade your GPU" recommendations linking to Amazon/Newegg with affiliate tags
- **Sponsored game entries:** Game publishers pay to feature their game prominently in the estimator

---

## 13. Summary

DevBench is a technically ambitious but very achievable project. The key insight is that modern browser APIs (WebGPU, WebCodecs, AudioWorklet, Web Workers + WASM) now provide enough hardware access to build meaningful benchmarks without native installs.

**The stack is intentionally simple:**
- **Vercel** — hosts the frontend AND backend (API Routes) in one Next.js project
- **Supabase** — PostgreSQL database + auth + real-time, all free
- **Cloudflare R2** — added later for large benchmark test files, also free
- **Total monthly cost: $0** (comfortably handles up to ~50-100K users)

The architecture prioritizes:
1. **Modularity** — each benchmark category is independent, can be built and shipped incrementally
2. **Simplicity** — two services (Vercel + Supabase), one codebase, zero DevOps overhead
3. **Data-driven game estimation** — the GPU reference database is the real competitive moat
4. **Social/shareable** — results are designed to be shared (OG images, comparison tools, leaderboards)
5. **Shared code** — scoring, types, and API client are reusable when the native app comes later

**When to upgrade (growth milestones):**

| Users/Month | Action | Cost |
|-------------|--------|------|
| 0 – 50K | Stay on free tiers | $0 |
| 50K – 100K | Upgrade Vercel to Pro | $20/mo |
| 100K+ | Upgrade Supabase to Pro | $25/mo + $20/mo Vercel |
| 200K+ | Consider separate backend server, add Redis caching | You're earning money by now |

Start with the hardware detection module and coding benchmark (easiest to get right), then layer on the more complex GPU/video/audio benchmarks. The game estimator is the killer feature that will drive organic traffic (SEO on game+GPU pages).
